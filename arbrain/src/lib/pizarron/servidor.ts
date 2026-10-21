import 'server-only'
/**
 * Lado servidor del pizarrón (7 oct 2026): lee las sesiones y la biblioteca del repo (docs/pizarron/), anota los
 * gestos del alumno y fabrica la voz de Levy con su alineamiento por carácter (la voz es la línea de tiempo).
 *
 * Quién escribe qué: sesion.json, la biblioteca y el mapa del alumno los escribe la herramienta `pizarron` de Levy
 * (arbrain/server/src/cabina/pizarron.ts); eventos.jsonl, las fotos de las predicciones y la voz en caché, esta app.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { raices, urlCruda } from '@/lib/cabina/documento-server'
import { elevenKey } from '@/features/live/server/elevenlabs'
import { voiceIdFor } from '@/features/live/voice/voices'
import { ID_OBJETO, ID_SESION, type EstadoSesion, type Evento, type Ficha, type ResumenSesion, type Sesion } from '@/features/pizarron/modelo'

export class ErrorPizarron extends Error { constructor(msg: string, public status = 400) { super(msg) } }

export const raiz = () => process.env.PIZARRON_DIR || path.join(raices().repo, 'docs', 'pizarron')
const dirSesion = (id: string) => { if (!ID_SESION.test(id)) throw new ErrorPizarron('Sesión inválida.'); return path.join(raiz(), 'sesiones', id) }
const dirObjeto = (id: string) => { if (!ID_OBJETO.test(id)) throw new ErrorPizarron('Objeto inválido.'); return path.join(raiz(), 'biblioteca', id) }

async function leerJson<T>(f: string): Promise<T | null> { try { return JSON.parse(await readFile(f, 'utf8')) as T } catch { return null } }

export async function leerEventos(id: string): Promise<Evento[]> {
  const f = path.join(dirSesion(id), 'eventos.jsonl')
  if (!existsSync(f)) return []
  const out: Evento[] = []
  for (const linea of (await readFile(f, 'utf8')).split('\n')) { if (!linea.trim()) continue; try { out.push(JSON.parse(linea)) } catch { /* línea a medias */ } }
  return out
}

/** Huella barata para responder «sin cambios» al sondeo del panel. */
export async function huella(id: string): Promise<string> {
  const d = dirSesion(id)
  const [a, b] = await Promise.all([stat(path.join(d, 'sesion.json')).catch(() => null), stat(path.join(d, 'eventos.jsonl')).catch(() => null)])
  if (!a) throw new ErrorPizarron('Esa sesión del pizarrón no existe.', 404)
  return `${a.mtimeMs}-${a.size}-${b?.mtimeMs ?? 0}-${b?.size ?? 0}`
}

export async function leerSesion(id: string): Promise<EstadoSesion> {
  const d = dirSesion(id)
  const sesion = await leerJson<Sesion>(path.join(d, 'sesion.json'))
  if (!sesion) throw new ErrorPizarron('Esa sesión del pizarrón no existe.', 404)
  const eventos = await leerEventos(id)
  // Los objetos que la sesión usa, con su código: el escenario los monta.
  const ids = new Set<string>()
  for (const p of sesion.pasos) for (const e of p.pon ?? []) if (e.tipo === 'objeto') ids.add(e.objeto)
  const objetos: EstadoSesion['objetos'] = {}
  await Promise.all([...ids].map(async o => {
    try { const od = dirObjeto(o); objetos[o] = { codigo: await readFile(path.join(od, 'objeto.js'), 'utf8'), ficha: await leerJson<Ficha>(path.join(od, 'ficha.json')) } }
    catch { /* el escenario dirá que falta */ }
  }))
  const imagenes: EstadoSesion['imagenes'] = {}
  for (const [k, im] of Object.entries(sesion.imagenes ?? {})) {
    const real = path.join(d, 'imagenes', path.basename(im.archivo))
    if (existsSync(real)) imagenes[k] = { url: urlCruda(real, path.join(d, 'imagenes')), ancho: im.ancho, alto: im.alto }
  }
  return { sesion, eventos, objetos, imagenes }
}

export async function listar(): Promise<{ sesiones: ResumenSesion[]; biblioteca: Ficha[] }> {
  const sesiones: ResumenSesion[] = []
  const base = path.join(raiz(), 'sesiones')
  for (const id of existsSync(base) ? await readdir(base) : []) {
    if (!ID_SESION.test(id)) continue
    const s = await leerJson<Sesion>(path.join(base, id, 'sesion.json'))
    if (s) sesiones.push({ id, tema: s.tema, creada: s.creada, actualizada: s.actualizada, pasos: s.pasos.length, cerrada: !!s.cierre, documento: s.documento })
  }
  sesiones.sort((a, b) => b.actualizada.localeCompare(a.actualizada))
  const biblioteca: Ficha[] = []
  const bib = path.join(raiz(), 'biblioteca')
  for (const id of existsSync(bib) ? await readdir(bib) : []) {
    if (!ID_OBJETO.test(id)) continue
    const f = await leerJson<Ficha>(path.join(bib, id, 'ficha.json'))
    if (f) biblioteca.push(f)
  }
  biblioteca.sort((a, b) => (b.usos ?? 0) - (a.usos ?? 0) || a.nombre.localeCompare(b.nombre))
  return { sesiones, biblioteca }
}

const TIPOS_EVENTO = new Set(['inicio-paso', 'fin-paso', 'gesto', 'respuesta', 'mensaje', 'error', 'declarado'])
/** Anota gestos del alumno. Una foto de predicción llega como data URL y se guarda como PNG junto a la sesión. */
export async function anotar(id: string, eventos: unknown[]): Promise<number> {
  const d = dirSesion(id)
  if (!existsSync(path.join(d, 'sesion.json'))) throw new ErrorPizarron('Esa sesión del pizarrón no existe.', 404)
  const lineas: string[] = []
  for (const crudo of eventos.slice(0, 200)) {
    if (!crudo || typeof crudo !== 'object') continue
    const e = { ...(crudo as Record<string, unknown>) }
    if (typeof e.tipo !== 'string' || !TIPOS_EVENTO.has(e.tipo)) continue
    if (e.tipo === 'respuesta' && typeof e.foto === 'string' && e.foto.startsWith('data:image/png;base64,')) {
      const dir = path.join(d, 'fotos'); await mkdir(dir, { recursive: true })
      const nombre = `${String(e.paso ?? 'p').replace(/[^a-z0-9-]/gi, '')}-${Date.now().toString(36)}.png`
      await writeFile(path.join(dir, nombre), Buffer.from(e.foto.slice(22), 'base64'))
      e.foto = `fotos/${nombre}`
    } else delete e.foto
    const linea = JSON.stringify({ t: new Date().toISOString(), ...e })
    if (linea.length > 60_000) continue
    lineas.push(linea)
  }
  if (lineas.length) await appendFile(path.join(d, 'eventos.jsonl'), lineas.join('\n') + '\n')
  return lineas.length
}

// ── Voz ──
export interface Alineacion { c: string[]; s: number[]; e: number[] }
const MODELO_VOZ = () => process.env.PIZARRON_VOZ_MODELO || 'eleven_multilingual_v2'

/** La voz de Levy para un tramo, con el tiempo de cada carácter. En caché por texto: reproducir es gratis y exacto. */
export async function voz(id: string, texto: string): Promise<{ h: string; alin: Alineacion; proveedor: string }> {
  const t = texto.trim()
  if (!t || t.length > 2400) throw new ErrorPizarron('El tramo de voz debe tener entre 1 y 2400 caracteres.')
  const voice = voiceIdFor('levy', process.env), modelo = MODELO_VOZ()
  const h = createHash('sha256').update(`${voice}|${modelo}|${t}`).digest('hex').slice(0, 20)
  const dir = path.join(dirSesion(id), 'voz')
  const fAudio = path.join(dir, `${h}.mp3`), fAlin = path.join(dir, `${h}.json`)
  const previa = existsSync(fAudio) ? await leerJson<Alineacion>(fAlin) : null
  if (previa) return { h, alin: previa, proveedor: 'cache' }
  const key = elevenKey()
  if (!key) throw new ErrorPizarron('La voz del pizarrón no está configurada en este servidor.', 503)
  const pedir = () => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ text: t, model_id: modelo, ...(modelo.includes('flash') || modelo.includes('turbo') ? { language_code: 'es' } : {}), voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true } }),
  }).catch(() => null)
  let r = await pedir()
  // 429 = límite de concurrencia (Live o la precarga del panel hablan a la vez): se espera y se reintenta.
  for (let i = 0; i < 3 && r?.status === 429; i++) { await new Promise(res => setTimeout(res, 1200 * (i + 1))); r = await pedir() }
  if (!r || !r.ok) {
    const cuerpo = r ? await r.text().catch(() => '') : ''
    throw new ErrorPizarron(`La voz no respondió (${r ? r.status : 'sin red'}${/quota|credits/i.test(cuerpo) ? ', sin saldo' : ''}).`, 503)
  }
  const j = await r.json() as { audio_base64?: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } }
  if (!j.audio_base64 || !j.alignment) throw new ErrorPizarron('La voz llegó sin alineamiento.', 502)
  const alin: Alineacion = { c: j.alignment.characters, s: j.alignment.character_start_times_seconds, e: j.alignment.character_end_times_seconds }
  await mkdir(dir, { recursive: true })
  await writeFile(fAudio, Buffer.from(j.audio_base64, 'base64'))
  await writeFile(fAlin, JSON.stringify(alin))
  return { h, alin, proveedor: 'elevenlabs' }
}

export async function audio(id: string, h: string): Promise<Buffer> {
  if (!/^[a-f0-9]{20}$/.test(h)) throw new ErrorPizarron('Audio inválido.')
  try { return await readFile(path.join(dirSesion(id), 'voz', `${h}.mp3`)) } catch { throw new ErrorPizarron('Ese audio no existe.', 404) }
}

export async function foto(id: string, nombre: string): Promise<Buffer> {
  if (!/^[a-z0-9-]+\.png$/i.test(nombre)) throw new ErrorPizarron('Foto inválida.')
  try { return await readFile(path.join(dirSesion(id), 'fotos', nombre)) } catch { throw new ErrorPizarron('Esa foto no existe.', 404) }
}
