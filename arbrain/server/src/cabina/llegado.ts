/**
 * «Lo que llegó»: la RAM de Levy al abrir una conversación (goal 2).
 *
 * Daniel: «tengo siete notificaciones acumuladas y no me preguntas de qué son».
 * En el PRIMER turno de cada conversación, agent-server le pasa a Levy los
 * avisos sin leer de la campana, los reportes recientes de los crons y lo que
 * la cola durable no ha podido entregar; Levy abre con eso (vista «reporte») y
 * pregunta si lo atiende. `atender` los marca leídos cuando ya se conversaron.
 */
import { DUENO, DUENO_M, instalacionOriginal } from '../dueno.js'
import { esEdicionCliente } from '../edicion.js'
import { readEnvFile } from '../env.js'
import type { Pendiente } from '../mc-outbox.js'

const env = readEnvFile(['MC_SUPABASE_URL', 'MC_SUPABASE_KEY'])
const URL_MC = env['MC_SUPABASE_URL'] ?? ''
const KEY = env['MC_SUPABASE_KEY'] ?? ''
export const REPORTES = ['morning-briefing', 'evening-reflection', 'business-council', 'monthly-review'] as const
const NOMBRE: Record<string, string> = { 'morning-briefing': 'Reporte diario', 'evening-reflection': 'Cierre del día', 'business-council': 'Reporte semanal', 'monthly-review': 'Reporte mensual' }

/**
 * Edición cliente (carril T, 11 oct 2026): el alumno no tiene la base de avisos de la instalación original. Nada de
 * aquí debe llegarle a él ni a su Levy con nombres de servicios o variables que no existen en su máquina.
 */
export const SIN_CAMPANA_CLIENTE = 'La campana de avisos no está disponible en esta edición.'

export async function rest<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  if (esEdicionCliente()) throw new Error(SIN_CAMPANA_CLIENTE)
  if (!URL_MC || !KEY) throw new Error('Mission Control sin configurar (MC_SUPABASE_URL/KEY).')
  const r = await fetch(`${URL_MC}/rest/v1/${path}`, { ...init, signal: signal ?? AbortSignal.timeout(6000),
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (!r.ok) throw new Error(`Mission Control respondió ${r.status}`)
  return (r.status === 204 ? null : await r.json()) as T
}

export interface Aviso { id: string; kind: string; source: string; title: string; created_at: string }
export interface Llegado { avisos: Aviso[]; reportes: { runId: string; jobId: string; nombre: string; at: string }[]; atrasados: Pendiente[]; error?: string }

/** Hora original de un run de cron (runId = cron-<job>-<ms>). */
export function horaDeRun(runId: string, fallback: string): string {
  const ms = Number(/-(\d{13})$/.exec(runId)?.[1]); return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback
}

/** Perfil del dueño en la base de avisos (instalación original). Sin él no hay campana que leer. */
const PERFIL = (() => { const p = instalacionOriginal().perfil_id; return typeof p === 'string' && /^[0-9a-f-]{36}$/.test(p) ? p : '' })()

export async function loQueLlego(atrasados: Pendiente[] = [], ahora = Date.now(), cliente = esEdicionCliente()): Promise<Llegado> {
  // Cliente: no hay campana que leer; vacío y sin error (un error se volvería una frase de Levy al alumno).
  if (cliente) return { avisos: [], reportes: [], atrasados: [] }
  try {
    const desde = new Date(ahora - 36 * 3600_000).toISOString()
    const [avisos, runs] = await Promise.all([
      (PERFIL ? rest<Aviso[]>(`avisos?select=id,kind,source,title,created_at&read_at=is.null&user_id=eq.${PERFIL}&order=created_at.desc&limit=12`) : Promise.resolve([] as Aviso[])),
      rest<{ run_id: string; prompt: string; created_at: string }[]>(`conversations?select=run_id,prompt,created_at&source=eq.cron&status=eq.done&prompt=in.(${REPORTES.join(',')})&created_at=gte.${desde}&order=created_at.desc&limit=8`),
    ])
    // Un reporte solo se menciona si su aviso sigue sin leer (source «rutina:<job>»). Antes bastaba
    // con que existiera en 36 h, y Levy lo repetía en cada conversación aunque Daniel ya lo hubiera visto
    // (2 oct: «evita enviar este mensaje constantemente»).
    const sinLeer = new Set(avisos.map(a => a.source.replace(/^rutina:/, '')))
    const vivos = runs.filter(r => sinLeer.has(r.prompt))
    return { avisos, atrasados, reportes: vivos.map(r => ({ runId: r.run_id, jobId: r.prompt, nombre: NOMBRE[r.prompt] ?? r.prompt, at: horaDeRun(r.run_id, r.created_at) })) }
  } catch (e) {
    return { avisos: [], reportes: [], atrasados, error: e instanceof Error ? e.message : 'No se pudo leer la campana.' }
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** El bloque que se agrega al primer mensaje de la conversación. null = nada que decir. */
export function bloqueApertura(l: Llegado, cliente = esEdicionCliente()): string | null {
  // Cliente: nunca hay bloque (ni el error de una campana que el alumno no tiene).
  if (cliente) return null
  const lineas: string[] = []
  if (l.error) lineas.push(`No pude leer la campana (${l.error}). No digas que no hay nada: dilo así si ${DUENO} pregunta.`)
  if (l.avisos.length) lineas.push(`${l.avisos.length} avisos sin leer:`, ...l.avisos.slice(0, 8).map(a => `- [${a.id}] ${a.title} · ${a.source} · ${fmt(a.created_at)}`))
  if (l.reportes.length) lineas.push('Reportes de las últimas 36 h:', ...l.reportes.map(r => `- ${r.nombre} de ${fmt(r.at)}`))
  if (l.atrasados.length) lineas.push('Reportes generados que NO han llegado a la campana (siguen en la cola de reintento):', ...l.atrasados.map(p => `- ${p.jobId} · ${p.attempts} intentos · ${p.lastError ?? ''}`))
  if (!lineas.length) return null
  return [
    `[LO QUE LLEGÓ · contexto automático al abrir esta conversación; ${DUENO} no lo pidió]`,
    ...lineas,
    `Instrucción: tú atenúas la variedad, no ${DUENO}. Contesta primero su mensaje y al final, en UNA línea, di qué llegó y si algo exige decisión suya; si nada lo exige, dilo así. No le pidas leer reportes ni llames \`mostrar\` salvo que lo pida. Se menciona una sola vez: marca con \`atender\` los ids de arriba en este mismo turno.`,
  ].join('\n')
}

/** Marca avisos como leídos (campana). `todos` = todos los sin leer. */
export async function atender(p: { ids?: string[]; todos?: boolean }): Promise<number> {
  if (esEdicionCliente()) throw new Error(SIN_CAMPANA_CLIENTE)
  const ids = (p.ids ?? []).filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (!p.todos && !ids.length) throw new Error('Indica los ids de los avisos o todos:true.')
  const filtro = p.todos ? 'read_at=is.null' : `id=in.(${ids.join(',')})&read_at=is.null`
  const filas = await rest<unknown[]>(`avisos?${filtro}`, { method: 'PATCH', body: JSON.stringify({ read_at: new Date().toISOString() }), headers: { Prefer: 'return=representation' } })
  return filas?.length ?? 0
}
