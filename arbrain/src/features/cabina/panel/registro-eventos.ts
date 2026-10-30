import type { OpsEvent, OpsEventType } from '@/features/ops/hooks/useOpsLogs'

/**
 * El registro de agentes en el Taller (5 oct 2026, retiro de /ops). La tabla `ops_events` la escribe el agent-server
 * (ops-logger.ts) en cada turno, herramienta y rutina; aquí se dice en español y sin ruido. Lógica pura
 * (tests/cabina/registro.test.ts).
 */
export type FiltroRegistro = 'turnos' | 'errores' | 'rutinas' | 'todo'
export const FILTROS_REGISTRO: { id: FiltroRegistro; etiqueta: string }[] = [
  { id: 'turnos', etiqueta: 'Turnos' }, { id: 'errores', etiqueta: 'Errores' }, { id: 'rutinas', etiqueta: 'Rutinas' }, { id: 'todo', etiqueta: 'Todo' },
]

export type Tono = 'bien' | 'falla' | 'vivo' | 'tenue'
const NOMBRE: Record<OpsEventType, [string, Tono]> = {
  session_start: ['Empezó un turno', 'vivo'], session_compact: ['Compactó el contexto', 'tenue'],
  tool_start: ['Herramienta', 'tenue'], tool_done: ['Herramienta lista', 'tenue'], tool_error: ['Falló una herramienta', 'falla'],
  agent_text: ['Escribió', 'tenue'], agent_result: ['Terminó el turno', 'bien'], agent_error: ['Error del agente', 'falla'],
  cron_start: ['Empezó una rutina', 'vivo'], cron_done: ['Terminó una rutina', 'bien'], cron_error: ['Falló una rutina', 'falla'],
  stderr: ['Aviso del proceso', 'falla'], rate_limit: ['Llegó al límite de uso', 'falla'],
}
export const ORIGEN: Record<OpsEvent['source'], string> = { web: 'Chat', cron: 'Rutina', system: 'Sistema' }

export const esError = (e: Pick<OpsEvent, 'type'>) => /error$/.test(e.type) || e.type === 'stderr' || e.type === 'rate_limit'

export function filtrar(eventos: OpsEvent[], f: FiltroRegistro): OpsEvent[] {
  if (f === 'todo') return eventos
  if (f === 'errores') return eventos.filter(esError)
  if (f === 'rutinas') return eventos.filter(e => e.type.startsWith('cron_'))
  return eventos.filter(e => ['session_start', 'agent_result', 'agent_error', 'session_compact', 'rate_limit'].includes(e.type))
}

export const nombreEvento = (e: Pick<OpsEvent, 'type'>): [string, Tono] => NOMBRE[e.type] ?? [e.type, 'tenue']

/** «claude-opus-5-5» → «Opus 5.5»: el id del proveedor no le dice nada al dueño. Lo desconocido pasa tal cual. */
export const modeloLegible = (m: string | null) => {
  const r = m ? /^claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/i.exec(m) : null
  return r ? `${r[1].charAt(0).toUpperCase()}${r[1].slice(1).toLowerCase()} ${r[2]}.${r[3]}` : m
}
const seg = (ms: unknown) => { const n = Number(ms); return Number.isFinite(n) ? (n < 1000 ? `${Math.round(n)} ms` : n < 60_000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n / 60_000)} min`) : null }
const miles = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? (v >= 1000 ? `${(v / 1000).toFixed(1)} k` : String(v)) : null }

/** Una línea legible del evento: qué pidió, cuánto tardó, cuánto costó. Sin datos, nada (nunca un cero inventado). */
export function lineaEvento(e: Pick<OpsEvent, 'type' | 'data'>): string {
  const d = e.data ?? {}, s = (k: string) => typeof d[k] === 'string' ? d[k] as string : null
  switch (e.type) {
    case 'session_start': return [modeloLegible(s('model')), s('prompt')?.replace(/\s+/g, ' ').slice(0, 140)].filter(Boolean).join(' · ')
    case 'session_compact': return d.tokensBefore != null && d.tokensAfter != null ? `${miles(d.tokensBefore)} → ${miles(d.tokensAfter)} tokens` : ''
    case 'tool_start': case 'tool_done': return [s('toolName'), seg(d.durationMs)].filter(Boolean).join(' · ')
    case 'agent_result': return [Number.isFinite(Number(d.costUsd)) && d.costUsd != null ? `US$${Number(d.costUsd).toFixed(2)}` : null,
      d.inputTokens != null ? `${miles(d.inputTokens)} entrada · ${miles(d.outputTokens)} salida` : null, seg(d.durationMs), d.numTurns != null ? `${d.numTurns} pasos` : null].filter(Boolean).join(' · ')
    case 'cron_start': case 'cron_done': return s('jobId') ?? ''
    case 'cron_error': return [s('jobId'), s('error')?.slice(0, 140)].filter(Boolean).join(' · ')
    default: return (s('error') ?? s('message') ?? s('text') ?? '').replace(/\s+/g, ' ').slice(0, 160)
  }
}
