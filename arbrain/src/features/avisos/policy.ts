// Política única de la campana (25 sep 2026). Toda notificación hacia una persona
// pasa por aquí antes de escribir o sonar. Regla de la casa: la telemetría de
// procesos va a bitácora, nunca a la campana ni al teléfono.
//
//   push     → suena en el teléfono y queda en la campana
//   campana  → queda en la campana, sin sonido
//   bitacora → solo registro para Levy; el dueño no la ve ni la escucha

export const KINDS = ['agente', 'agenda', 'dinero', 'persona', 'alerta', 'otro'] as const
export type AvisoKind = (typeof KINDS)[number]
export type Kind = AvisoKind | 'sistema'
export type Entrega = 'push' | 'campana' | 'bitacora'
export interface Decision { kind: Kind; entrega: Entrega; source: string }

// Emisores de telemetría conocidos. Candado por forma, no por título: si un script
// de vigilancia olvida declarar kind='sistema', igual cae en la bitácora.
const TELEMETRIA = /sentinel|centinela|watchdog|health|diagn|telemetr|pipeline|sensor/i

export function decidir(input: { kind?: unknown; source?: unknown; tag?: unknown; quiet?: unknown }): Decision {
  const source = String(input.source ?? input.tag ?? 'desconocido').trim().slice(0, 80) || 'desconocido'
  const declared = typeof input.kind === 'string' ? input.kind : null
  if (declared === 'sistema' || (declared !== 'alerta' && TELEMETRIA.test(source))) return { kind: 'sistema', entrega: 'bitacora', source }
  if (declared && (KINDS as readonly string[]).includes(declared)) {
    return { kind: declared as AvisoKind, entrega: input.quiet === true ? 'campana' : 'push', source }
  }
  // Emisor sin clasificar: aparece en la campana sin sonar, para que alguien lo
  // clasifique en vez de despertar al dueño o perderse en silencio.
  return { kind: 'otro', entrega: 'campana', source }
}

// Rutinas que le hablan al dueño cuando terminan bien. Los fallos de cualquier
// rutina son telemetría: bitácora + «Necesita atención» en la vista Rutinas.
const RUTINAS_VISIBLES: Record<string, AvisoKind> = {
  'morning-briefing': 'agenda',
  'evening-reflection': 'agenda',
  'snapshot-finanzas': 'dinero',
  'monthly-review': 'dinero',
  'business-council': 'dinero',
  // 4 oct 2026: el ritual de las 20:00 («¿Bajamos a tierra mañana?»), cron real con push a Daniel.
  'ritual-noche': 'agenda',
}

// Fuente del aviso cuando no es «rutina:<job>» (la campana/bitácora filtra por ella).
const FUENTE_RUTINA: Record<string, string> = { 'ritual-noche': 'ritual:bajar-a-tierra' }

export function decidirRutina(jobId: string, isError: boolean): Decision {
  const source = FUENTE_RUTINA[jobId] ?? `rutina:${jobId}`
  const kind = RUTINAS_VISIBLES[jobId]
  if (isError || !kind) return { kind: 'sistema', entrega: 'bitacora', source }
  return { kind, entrega: 'push', source }
}
