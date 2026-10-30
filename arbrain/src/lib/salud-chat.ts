// Salud REAL del chat (7 oct 2026). El incidente: el servidor web del Studio respondía /login al instante mientras
// toda ruta que pedía `getClaudeclawUrl()` esperaba para siempre una promesa compartida. La app de escritorio
// miraba /login, lo vio sano y se quedó con él; Daniel vio «Sin conexión con el Studio» y su mensaje atorado.
// Esta sonda recorre el camino de un mensaje sin gastar modelo: Supabase (lo que el chat lee antes de enviar),
// la URL del daemon y un GET /health al daemon, cada etapa con su plazo y todo dentro de PLAZO_TOTAL_MS.
//
// Juicio: `ok` habla del SERVIDOR WEB (lo que un reinicio de com.levy.arbrain-web arregla). Si la URL del daemon no
// se resuelve en plazo, el web está enfermo (503). Daemon o Supabase caídos se reportan pero no tumban `ok`:
// reiniciar el web no los arregla y la app no debe abandonar el Studio por un daemon que se reinicia.

export const PLAZO_TOTAL_MS = 5_000
const PLAZO_URL_MS = 3_000
const PLAZO_SUPABASE_MS = 3_000
const PISO_DAEMON_MS = 1_000

export type Etapa = { ok: boolean; ms: number; error?: string }
export type Destino = 'local' | 'remoto' | null
export interface SaludChat {
  ok: boolean
  totalMs: number
  etapas: { url: Etapa; supabase: Etapa; daemon: Etapa }
  destino: Destino
}

export interface DepsSalud {
  resolverUrl: () => Promise<string>
  consultarSupabase: (signal: AbortSignal) => Promise<void>
  consultarDaemon: (url: string, signal: AbortSignal) => Promise<void>
  ahora?: () => number
}

class Vencido extends Error { constructor(ms: number) { super(`sin respuesta en ${ms} ms`) } }

/** Corre `trabajo` con plazo propio: al vencer aborta su señal y devuelve error. Nunca cuelga. */
async function conPlazo<T>(ms: number, trabajo: (signal: AbortSignal) => Promise<T>, ahora: () => number): Promise<{ etapa: Etapa; valor?: T }> {
  const t0 = ahora()
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const vence = new Promise<never>((_, rechazar) => { timer = setTimeout(() => { ctrl.abort(); rechazar(new Vencido(ms)) }, Math.max(0, ms)) })
  try {
    const valor = await Promise.race([trabajo(ctrl.signal), vence])
    return { etapa: { ok: true, ms: Math.round(ahora() - t0) }, valor }
  } catch (e) {
    return { etapa: { ok: false, ms: Math.round(ahora() - t0), error: (e instanceof Error ? e.message : String(e)).slice(0, 160) } }
  } finally {
    clearTimeout(timer)
  }
}

export function esLocal(url: string): boolean {
  try { const h = new URL(url).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' } catch { return false }
}

export async function sondearChat(deps: DepsSalud): Promise<SaludChat> {
  const ahora = deps.ahora ?? (() => performance.now())
  const t0 = ahora()
  const [url, supabase] = await Promise.all([
    conPlazo(PLAZO_URL_MS, () => deps.resolverUrl(), ahora),
    conPlazo(PLAZO_SUPABASE_MS, signal => deps.consultarSupabase(signal), ahora),
  ])
  let daemon: Etapa = { ok: false, ms: 0, error: 'sin URL del daemon' }
  if (url.etapa.ok && url.valor) {
    const resta = Math.max(PISO_DAEMON_MS, PLAZO_TOTAL_MS - (ahora() - t0) - 250)
    daemon = (await conPlazo(resta, signal => deps.consultarDaemon(url.valor!, signal), ahora)).etapa
  }
  return {
    ok: url.etapa.ok,
    totalMs: Math.round(ahora() - t0),
    etapas: { url: url.etapa, supabase: supabase.etapa, daemon },
    destino: url.valor ? (esLocal(url.valor) ? 'local' : 'remoto') : null,
  }
}

/** Lo que ve quien pregunta sin credencial (la ruta también sale por el Funnel): solo semáforos y tiempos. */
export function versionPublica(s: SaludChat): SaludChat {
  const limpia = (e: Etapa): Etapa => ({ ok: e.ok, ms: e.ms })
  return { ok: s.ok, totalMs: s.totalMs, etapas: { url: limpia(s.etapas.url), supabase: limpia(s.etapas.supabase), daemon: limpia(s.etapas.daemon) }, destino: null }
}
