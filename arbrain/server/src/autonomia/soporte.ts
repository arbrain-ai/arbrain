/**
 * Soporte técnico a la cohorte (4 nov 2026): Levy responde una duda técnica o de uso de un alumno dentro de la plataforma
 * de la cohorte. El dueño lo firmó el 24 oct (la línea vive en la instalación: `soporte_cohorte.firmado`). Hasta hoy una
 * respuesta así caía en «contactar» y le subía una tarjeta (caso real: un alumno, 32 h trabado).
 *
 * El camino (`cli.ts soporte`): se pide a la bandeja como cualquier mensaje a una persona, marcado como soporte. La bandeja
 * revisa la clase (autonomia/clase.ts · claseDeSoporte) y la política: si es soporte y la persona encendió «Soporte técnico
 * a la cohorte» en Ajustes › Autonomía, responde «hazlo» sin tarjeta; Levy la publica con su cuenta en la plataforma
 * (scripts/ht/comunidad_ht.py responder, la misma puerta de lo automático) y la anota en «Lo que hice solo» con el enlace.
 * En cualquier otro caso (la clase en «tocar», un precio, una promesa, WhatsApp) la bandeja ya dejó la tarjeta de
 * contactar, como siempre. Solo la instalación original tiene plataforma de cohorte: en la edición cliente nunca aplica.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { CategoriaConfirmacion } from '../cliente/confirmaciones.js'
import { instalacionOriginal } from '../dueno.js'
import { esEdicionCliente } from '../edicion.js'
import { claseDeSoporte, type PlataformaCohorte } from './clase.js'
import { anotarHechoSolo, politicaVigente, type Modo } from './politica.js'

let paraPruebas: (PlataformaCohorte & { firmado?: string }) | null | undefined
/** La plataforma de la cohorte y la línea de lo firmado, de la instalación original. null = no hay (edición cliente). */
export function plataformaCohorte(): (PlataformaCohorte & { firmado?: string }) | null {
  if (paraPruebas !== undefined) return paraPruebas
  if (esEdicionCliente()) return null
  const s = instalacionOriginal().soporte_cohorte
  return s?.dominio ? { dominio: s.dominio, ...(s.repo ? { repo: s.repo } : {}), ...(s.firmado ? { firmado: s.firmado } : {}) } : null
}
/** Solo pruebas: fija la plataforma (o `undefined` para volver a la de la instalación). */
export function _plataformaParaPruebas(p: (PlataformaCohorte & { firmado?: string }) | null | undefined): void { paraPruebas = p }

/**
 * ¿La decisión que pide Levy es una respuesta de soporte? Solo si la pide como tal (`soporte: { url, pregunta }`), va a una
 * persona (categoría enviar), hay plataforma de cohorte y el texto exacto viene en `detalle`. null = no aplica.
 */
export function soporteDe(cuerpo: Record<string, unknown>, categoria: CategoriaConfirmacion): { clase: 'soporte' | 'contactar'; motivo: string; modo: Modo } | null {
  const s = cuerpo.soporte && typeof cuerpo.soporte === 'object' ? cuerpo.soporte as Record<string, unknown> : null
  const plataforma = plataformaCohorte()
  if (!s || categoria !== 'enviar' || !plataforma) return null
  const r = claseDeSoporte({ url: typeof s.url === 'string' ? s.url : undefined, texto: typeof cuerpo.detalle === 'string' ? cuerpo.detalle : '', pregunta: typeof s.pregunta === 'string' ? s.pregunta : undefined }, plataforma)
  return { ...r, modo: politicaVigente().vigente.soporte }
}

export interface PedidoSoporte {
  /** El hilo de la plataforma: `https://<plataforma>/community?post=<id>` (y `&comentario=<id>` si responde un comentario). */
  url: string
  /** El texto EXACTO que se publicaría. */
  texto: string
  /** A quién (su nombre de pila): agrupa la tarjeta si no sale sola. */
  persona: string
  /** Lo que escribió el alumno: también se revisa (un precio en la pregunta la saca de soporte). */
  pregunta?: string
  /** Por qué conviene, como el dueño lo diría (va en la tarjeta si no sale sola). */
  recomendacion?: string
  sesion?: string
}

export interface ResultadoPublicar { ok: boolean; motivo?: string; conflicto?: boolean; comentario?: string; ya?: boolean }

export interface DepsSoporte {
  /** POST a la bandeja del daemon. */
  pedir: (cuerpo: Record<string, unknown>) => Promise<{ status: number; j: Record<string, unknown> }>
  /** Publica en la plataforma con la cuenta de Levy. */
  publicar: (p: PedidoSoporte) => Promise<ResultadoPublicar>
}

const corto = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= n ? t : `${t.slice(0, n - 1)}…` }
const dominioDe = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'la plataforma' } }

export async function responderSoporte(p: PedidoSoporte, d: DepsSoporte): Promise<{ text: string; error?: boolean; publicada?: boolean; tarjeta?: string }> {
  if (!p.url || !p.texto?.trim() || !p.persona?.trim()) return { text: 'soporte necesita --url, --persona y --texto.', error: true }
  const persona = p.persona.trim().split(/\s+/)[0], donde = dominioDe(p.url)
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    titulo: `Responderle a ${persona} en ${donde}: ${corto(p.pregunta || p.texto, 90)}`, categoria: 'enviar', detalle: p.texto, persona,
    recomienda: 'si', recomendacion: p.recomendacion || 'Es duda técnica o de uso y la respuesta sale de lo que ya está documentado.',
    ...(p.sesion ? { sesion: p.sesion } : {}), ...extra,
  })
  const tarjetaDe = (r: { status: number; j: Record<string, unknown> }, porque: string) => r.status === 200 && typeof r.j.id === 'string'
    ? { text: `No salió sola (${porque}): subí la tarjeta ${r.j.id} a la bandeja. Termina tu turno; su Sí te llega aquí.`, tarjeta: r.j.id }
    : { text: `No salió sola (${porque}) y tampoco se subió la tarjeta: ${String(r.j.error ?? `HTTP ${r.status}`)}`, error: true }

  const r = await d.pedir(cuerpo({ soporte: { url: p.url, ...(p.pregunta ? { pregunta: p.pregunta } : {}) } }))
  if (r.status !== 200) return { text: `La bandeja no respondió: ${String(r.j.error ?? `HTTP ${r.status}`)}`, error: true }
  if (r.j.hazlo !== true) {
    const s = (r.j.soporte ?? {}) as { clase?: string; motivo?: string; modo?: string }
    const porque = s.clase === 'soporte' ? `«Soporte técnico a la cohorte» está en «${s.modo ?? 'tocar'}»; se enciende en Ajustes › Autonomía` : `es contactar: ${s.motivo ?? 'no es soporte'}`
    return tarjetaDe(r, porque)
  }
  const pub = await d.publicar(p)
  if (!pub.ok) {
    if (pub.ya) return { text: 'Levy ya había respondido ese hilo; no publiqué otra vez.' }
    if (pub.conflicto) return { text: `Ese hilo ya tiene una decisión abierta (el borrador de la comunidad): no subo otra. ${pub.motivo ?? ''}`.trim() }
    return tarjetaDe(await d.pedir(cuerpo({ recomendacion: `${p.recomendacion ? `${p.recomendacion} ` : ''}(No se publicó sola: ${pub.motivo ?? 'falló la plataforma'}.)` })), `no se publicó: ${pub.motivo ?? 'falló la plataforma'}`)
  }
  anotarHechoSolo({ clase: 'soporte', que: `Respondí a ${persona} en ${donde}: «${corto(p.texto, 160)}»`, donde, enlace: p.url, deshacer: 'borrando el comentario de Levy en el hilo', origen: 'levy', ...(pub.comentario ? { ref: pub.comentario } : {}), ...(p.sesion ? { sesion: p.sesion } : {}) })
  return { text: `Publicada en ${donde} y anotada en «Lo que hice solo»: ${p.url}`, publicada: true }
}

const SCRIPT = fileURLToPath(new URL('../../scripts/ht/comunidad_ht.py', import.meta.url))

/** La publicación real (instalación original): `comunidad_ht.py responder --aplicar`, la cuenta de Levy y la puerta de lo automático. */
export function publicarConComunidad(p: PedidoSoporte): Promise<ResultadoPublicar> {
  const args = [SCRIPT, 'responder', '--url', p.url, '--texto', p.texto, '--persona', p.persona, ...(p.pregunta ? ['--pregunta', p.pregunta] : []), '--aplicar']
  return new Promise(resolve => execFile('/usr/bin/python3', args, { timeout: 60_000 }, (err, stdout) => {
    const linea = String(stdout ?? '').trim().split('\n').pop() ?? ''
    try { resolve(JSON.parse(linea) as ResultadoPublicar) } catch { resolve({ ok: false, motivo: err ? err.message.slice(0, 160) : 'respuesta ilegible del publicador' }) }
  }))
}
