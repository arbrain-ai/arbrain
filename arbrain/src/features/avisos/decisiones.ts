/**
 * Las decisiones de /decidir vistas desde la campana (29 oct 2026), lado servidor. Dos cosas:
 *  - Su estado vivo: el token del enlace del aviso → la clave en el libro del pipeline (pipeline-libro.json, donde
 *    pipeline_ht.py y comunidad_ht.py guardan cada token) → la decisión en arbrain.ai (`decisiones-abiertas`). Si ya
 *    no está pendiente, el aviso se cerró solo.
 *  - El toque: «Publicar» y «Descartar» envían el MISMO formulario que los botones «Publícala» y «No» de la página
 *    /decidir/<token> (ver formularioDecision en bandeja.ts). Nada se publica sin ese toque; arbrain.ai se niega si la
 *    decisión no dice «sí» y ht-pipeline publica en su siguiente vuelta, como siempre.
 * Las llaves y los tokens se leen del Studio; nunca se devuelven ni se registran.
 */
import 'server-only'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { htAgenda, llave } from '@/features/cohorte/servidor'
import { formularioDecision, origenDeClave, tokenDecidir, type EstadoDecision } from './bandeja'

interface Abierta { clave: string; estado: string; categoria?: string | null; propuesta?: { texto?: string | null } | null }

const VIGENCIA_MS = 30_000
let cache: { en: number; porClave: Map<string, Abierta> } | null = null

function tokensDelLibro(): Map<string, string> {
  try {
    const dir = process.env.HT_PIPELINE_LOGS || join(homedir(), 'Library/Application Support/ArbrainHT')
    const libro = JSON.parse(readFileSync(join(dir, 'pipeline-libro.json'), 'utf8')) as { tokens?: Record<string, string> }
    return new Map(Object.entries(libro.tokens ?? {}).map(([clave, token]) => [token, clave]))
  } catch { return new Map() }
}

async function abiertas(forzar = false): Promise<Map<string, Abierta>> {
  if (!forzar && cache && Date.now() - cache.en < VIGENCIA_MS) return cache.porClave
  const r = await htAgenda<{ decisiones?: Abierta[] }>({ accion: 'decisiones-abiertas', dias: 30 })
  const porClave = new Map((r.decisiones ?? []).map(d => [d.clave, d]))
  cache = { en: Date.now(), porClave }
  return porClave
}

/**
 * Estado de cada decisión cuyo token aparece en los enlaces. Sin libro, sin llave o sin respuesta de arbrain.ai: mapa
 * vacío (falta de medición no es «resuelto»; el aviso sigue abierto hasta su vigencia).
 */
export async function estadosDecisiones(urls: (string | null)[], forzar = false): Promise<Map<string, EstadoDecision>> {
  const tokens = [...new Set(urls.map(tokenDecidir).filter((t): t is string => !!t))]
  const out = new Map<string, EstadoDecision>()
  if (!tokens.length || !llave('HT_AGENDA_SECRET')) return out
  const libro = tokensDelLibro()
  const base = llave('ARBRAIN_URL') ?? 'https://arbrain.ai'
  let porClave: Map<string, Abierta>
  try { porClave = await abiertas(forzar) } catch { return out }
  for (const token of tokens) {
    const clave = libro.get(token)
    // Un enlace que el libro ya no tiene se rotó (la decisión pasó a otra persona del equipo) y no sirve: ya no es del dueño.
    if (!clave) { if (libro.size) out.set(token, { estado: 'cerrada' }); continue }
    const d = porClave.get(clave)
    // Fuera de «abiertas» = ejecutada (publicada, mandada, cerrada) o más vieja que 30 días.
    if (!d) { out.set(token, { estado: 'cerrada' }); continue }
    out.set(token, {
      estado: d.estado === 'pendiente' ? 'pendiente' : 'cerrada', categoria: d.categoria ?? null,
      borrador: d.propuesta?.texto ?? null, origen: origenDeClave(clave, base),
    })
  }
  return out
}

export type ResultadoToque = { ok: true } | { ok: false; motivo: 'sin-enlace' | 'ya-respondida' | 'sin-respuesta' | 'no-confirmada' }

/** El toque de Daniel desde la campana: el formulario del botón de /decidir, enviado tal cual. Verifica después. */
export async function responderDesdeCampana(url: string, r: 'si' | 'no' | 'duda'): Promise<ResultadoToque> {
  const token = tokenDecidir(url)
  const base = (llave('ARBRAIN_URL') ?? 'https://arbrain.ai').replace(/\/$/, '')
  let destino: URL
  try { destino = new URL(url) } catch { return { ok: false, motivo: 'sin-enlace' } }
  // Solo la página de decisiones de arbrain.ai: el enlace del aviso nunca lleva el toque a otro sitio.
  if (!token || destino.origin !== new URL(base).origin) return { ok: false, motivo: 'sin-enlace' }
  const pagina = `${base}/decidir/${token}`
  const cabeceras = { 'User-Agent': 'arbrain-studio-campana/1' }
  let html: string
  try {
    const g = await fetch(pagina, { headers: cabeceras, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!g.ok) return { ok: false, motivo: 'sin-respuesta' }
    html = await g.text()
  } catch { return { ok: false, motivo: 'sin-respuesta' } }
  const campos = formularioDecision(html, r)
  if (!campos) return { ok: false, motivo: 'ya-respondida' }
  const form = new FormData()
  for (const [k, v] of Object.entries(campos)) form.append(k, v)
  try {
    const p = await fetch(pagina, { method: 'POST', body: form, headers: cabeceras, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(25_000) })
    if (p.status >= 400) return { ok: false, motivo: 'sin-respuesta' }
  } catch { return { ok: false, motivo: 'sin-respuesta' } }
  // Se confirma con la fuente, no con el código HTTP: la página ya no ofrece ese botón.
  try {
    const v = await fetch(pagina, { headers: cabeceras, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (v.ok && formularioDecision(await v.text(), r)) return { ok: false, motivo: 'no-confirmada' }
  } catch { return { ok: false, motivo: 'no-confirmada' } }
  cache = null
  return { ok: true }
}

// ── El recap de la grupal (29 oct 2026): «Publicar» de un toque y su estado vivo ──

/**
 * Los recaps (ids de post) que ya no son borrador, leídos en arbrain.ai al abrir la campana: el aviso se cierra en
 * cuanto el dueño lo publica, en el feed o aquí. Sin respuesta: conjunto vacío (falta de medición no es «publicado»).
 */
export async function recapsPublicados(postIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(postIds)]
  if (!ids.length || !llave('HT_AGENDA_SECRET')) return new Set()
  try {
    const r = await htAgenda<{ posts?: { id: string; is_draft: boolean }[] }>({ accion: 'posts-estado', ids })
    return new Set((r.posts ?? []).filter(p => p.is_draft === false).map(p => p.id))
  } catch { return new Set() }
}

/**
 * El toque «Publicar» del recap: el mismo efecto que el botón del feed (arbrain.ai publica SOLO un borrador del dueño;
 * el trigger avisa a la cohorte). Se confirma releyendo el post. `ya` = ya estaba publicado.
 */
export async function publicarRecapDesdeCampana(postId: string): Promise<{ ok: true; ya: boolean } | { ok: false; motivo: 'sin-respuesta' | 'no-confirmada' }> {
  try {
    const r = await htAgenda<{ ok?: boolean; ya?: boolean }>({ accion: 'recap-publicar', post_id: postId })
    if (!r.ok) return { ok: false, motivo: 'sin-respuesta' }
    if (!(await recapsPublicados([postId])).has(postId)) return { ok: false, motivo: 'no-confirmada' }
    return { ok: true, ya: !!r.ya }
  } catch { return { ok: false, motivo: 'sin-respuesta' } }
}
