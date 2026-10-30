// Taxonomia canonica de cron jobs (embudo de negocio + naturaleza obrero/sensor
// + anatomia del Artificial Brain).
//
// Fuente de verdad del contenido: `docs/business-os/system-map.md` (repo raiz),
// seccion "Los Crons Mapeados al Embudo" — ahi vive el detalle de que LEE/
// ESCRIBE cada cron y donde Daniel ve su output. Este archivo es la version
// tipada/consumible desde el frontend.
//
// SENSOR = job "visible": el daemon lo inyecta al chat de Automatizaciones +
// push (ver `VISIBLE_JOBS` en `arbrain/server/src/scheduler.ts`). El resto son
// OBREROS: corren silenciosos, solo dejan rastro en `conversations`.
//
// Las 4 etapas del embudo (hourglass ATRACCION -> CONVERSION -> DELIVERY/
// RETENCION, con INTELIGENCIA transversal) mapean 1:1 a las categorias de
// negocio de abajo. PERSONAL/SOPORTE (fuera del embudo) e INFRA (mantenimiento
// puro, sin narrativa humana) completan el set.
//
// ANATOMIA (sala Acciones del Artificial Brain): clasificacion por FUNCION
// NEUROLOGICA, no por embudo. Un cron proyecta sombras en varias salas; esta
// es la sombra de EJECUCION. Los centinelas se juzgan por riesgo vigente,
// NUNCA por frecuencia de uso (logica de seguro / sistema inmune).

export type CronCategoria =
  | 'adquisicion'
  | 'conversion'
  | 'retencion'
  | 'inteligencia'
  | 'personal'
  | 'infra'

export type CronAnatomia =
  | 'sentidos'
  | 'reflejos'
  | 'sintesis'
  | 'aprendizaje'
  | 'centinelas'
  | 'personal'

interface CronTaxonomyEntry {
  categoria: CronCategoria
  /** Funcion neurologica dentro del Artificial Brain (sala Acciones). */
  anatomia: CronAnatomia
  /** Que hace este organo, en el lenguaje de Daniel (una linea). */
  funcion: string
  /** true = VISIBLE_JOBS del scheduler (le habla a Daniel via chat + push). */
  sensor: boolean
  /** Ruta interna de Mission Control donde se ve el output/efecto de este cron. */
  superficie: string
}

export const CRON_CATEGORIA_LABEL: Record<CronCategoria, string> = {
  adquisicion: 'Adquisicion',
  conversion: 'Conversion',
  retencion: 'Retencion',
  inteligencia: 'Inteligencia',
  personal: 'Personal',
  infra: 'Infra',
}

export const CRON_ANATOMIA_META: Record<
  CronAnatomia,
  { label: string; descripcion: string; orden: number }
> = {
  sintesis: {
    label: 'Síntesis',
    descripcion: 'La voz del cerebro: destilan todo y te hablan directo',
    orden: 1,
  },
  sentidos: {
    label: 'Sentidos',
    descripcion: 'Perciben el mundo y el estado del negocio',
    orden: 2,
  },
  reflejos: {
    label: 'Reflejos',
    descripcion: 'Actúan solos ante un estímulo, sin pasar por el córtex',
    orden: 3,
  },
  aprendizaje: {
    label: 'Aprendizaje',
    descripcion: 'Se reescriben y entrenan solos (plasticidad)',
    orden: 4,
  },
  centinelas: {
    label: 'Centinelas',
    descripcion: 'Vigilan; se juzgan por riesgo vigente, no por frecuencia',
    orden: 5,
  },
  personal: {
    label: 'Personal',
    descripcion: 'Forman al dueño, no al negocio',
    orden: 6,
  },
}

/**
 * Los 4 sensores canonicos (== VISIBLE_JOBS en arbrain/server/src/scheduler.ts:26-31,
 * verificado 19 jul 2026). Si el scheduler cambia VISIBLE_JOBS, este set cambia
 * en el mismo commit (ley de mantenimiento de system-map.md).
 */
export const SENSOR_JOB_IDS = [
  'morning-briefing',
  'evening-reflection',
  'business-council',
  'monthly-review',
  'snapshot-finanzas', // v42: mensual, solo habla si falta dictar el snapshot
] as const

/**
 * Set EXTENDIDO solo para queries de HISTORIAL (ej. zona Inteligencia de
 * /sistema): incluye sensores legados con datos viejos en `conversations`.
 * `morning-habits` esta pausado desde v24; `evening-briefing` murio hace meses.
 * NO usar para decidir visibilidad de crons vivos — para eso esta SENSOR_JOB_IDS.
 */
export const SENSOR_JOB_IDS_HISTORICOS = [
  ...SENSOR_JOB_IDS,
  'morning-habits',
  'evening-briefing',
] as const

const SENSOR_JOB_SET = new Set<string>(SENSOR_JOB_IDS)

const CRON_TAXONOMY: Record<string, CronTaxonomyEntry> = {
  // ── ATRACCION (YouTube) ────────────────────────────────────────────────
  'intel-youtube-scan': { categoria: 'adquisicion', anatomia: 'sentidos', funcion: 'Escanea el nicho en YouTube y trae los videos nuevos de la competencia', sensor: false, superficie: '/youtube?tab=intel' },
  'intel-enrich': { categoria: 'adquisicion', anatomia: 'sentidos', funcion: 'Enriquece el intel crudo con transcripts y análisis', sensor: false, superficie: '/youtube?tab=intel' },
  'youtube-comments-respond': { categoria: 'adquisicion', anatomia: 'reflejos', funcion: 'Redacta respuestas a los comentarios nuevos del canal', sensor: false, superficie: '/youtube?tab=comments' },
  'youtube-comments-post': { categoria: 'adquisicion', anatomia: 'reflejos', funcion: 'Publica en YouTube las respuestas aprobadas', sensor: false, superficie: '/youtube?tab=comments' },
  'youtube-comments-engagement': { categoria: 'adquisicion', anatomia: 'reflejos', funcion: 'Da corazones y mide el engagement de los comentarios', sensor: false, superficie: '/youtube?tab=comments' },
  'youtube-comments-feedback-loop': { categoria: 'adquisicion', anatomia: 'aprendizaje', funcion: 'Ajusta al agente de comments con el feedback de la semana', sensor: false, superficie: '/youtube?tab=comments' },

  // ── CONVERSION (el cuello del hourglass) ───────────────────────────────
  'video-feature-engineering': { categoria: 'conversion', anatomia: 'aprendizaje', funcion: 'Extrae features de los videos para futuros modelos de conversión', sensor: false, superficie: '/ml-dashboard' },
  'polar-sync': { categoria: 'conversion', anatomia: 'reflejos', funcion: 'Reconcilia el billing contra Polar (SSOT) y corrige drift', sensor: false, superficie: '/' },

  // ── DELIVERY / RETENCION ────────────────────────────────────────────────
  'autoresearch-trinity': { categoria: 'retencion', anatomia: 'aprendizaje', funcion: 'Reescribe el prompt de Trinity cada noche según sus conversaciones', sensor: false, superficie: '/rutinas' },
  'autoresearch-sensei': { categoria: 'retencion', anatomia: 'aprendizaje', funcion: 'Reescribe el prompt de Sensei cada noche según sus conversaciones', sensor: false, superficie: '/rutinas' },
  'autoresearch-levy': { categoria: 'retencion', anatomia: 'aprendizaje', funcion: 'Reescribe el prompt de Levy (comunidad) según sus conversaciones', sensor: false, superficie: '/rutinas' },
  'churn-email-sequence': { categoria: 'retencion', anatomia: 'reflejos', funcion: 'Dispara la secuencia de win-back a los que se van (pausado: sin API key)', sensor: false, superficie: '/ml-dashboard' },

  // ── INTELIGENCIA (transversal) ──────────────────────────────────────────
  'metrics-snapshot': { categoria: 'inteligencia', anatomia: 'sentidos', funcion: 'Fotografía diaria de las métricas del negocio (MRR, subs, funnel)', sensor: false, superficie: '/ml-dashboard' },
  'state-snapshot': { categoria: 'inteligencia', anatomia: 'sentidos', funcion: 'Regenera el estado del sistema con datos frescos (.claude/state.md)', sensor: false, superficie: '/rutinas' },
  'morning-briefing': { categoria: 'inteligencia', anatomia: 'sintesis', funcion: 'Tu reporte diario: semáforo vital, calendario, negocio, 1 acción, repaso', sensor: true, superficie: '/rutinas' },
  'business-council': { categoria: 'inteligencia', anatomia: 'sintesis', funcion: 'Tu reporte semanal profundo del negocio', sensor: true, superficie: '/rutinas' },
  'system-consciousness': { categoria: 'inteligencia', anatomia: 'centinelas', funcion: 'Se lee los signos vitales de todos los órganos (automonitoreo)', sensor: false, superficie: '/rutinas' },
  'metabolismo': { categoria: 'inteligencia', anatomia: 'centinelas', funcion: 'El metabolismo: audita renta y costo de cada órgano y propone podas — tú firmas', sensor: false, superficie: '/rutinas' },
  'monthly-review': { categoria: 'inteligencia', anatomia: 'sintesis', funcion: 'Tu reporte mensual del negocio completo', sensor: true, superficie: '/rutinas' },
  'knowledge-compile': { categoria: 'inteligencia', anatomia: 'aprendizaje', funcion: 'Destila los daily logs cerrados en conceptos y conexiones del grafo', sensor: false, superficie: '/memoria' },
  'hipocampo': { categoria: 'inteligencia', anatomia: 'aprendizaje', funcion: 'El hipocampo: forma memorias solo mientras duermes — tú auditas el diff en la mañana', sensor: false, superficie: '/memoria' },

  // ── PERSONAL / SOPORTE (fuera del embudo de negocio) ───────────────────
  'morning-habits': { categoria: 'personal', anatomia: 'personal', funcion: 'Checklist matutino de hábitos (pausado desde v24)', sensor: false, superficie: '/calendar?mode=day' },
  'evening-reflection': { categoria: 'personal', anatomia: 'personal', funcion: 'Ritual nocturno: hábitos, objetivo del día y reflexión', sensor: true, superficie: '/calendar?mode=day' },
  'plasticidad-lectura': { categoria: 'personal', anatomia: 'personal', funcion: 'En pausa desde el 13 sep: su lectura vive en el reporte semanal («Lo que veo en ti esta semana»)', sensor: false, superficie: '/rutinas' },
  'gmail-cleanup': { categoria: 'personal', anatomia: 'reflejos', funcion: 'Limpia y archiva el inbox de Gmail', sensor: false, superficie: '/rutinas' },
  'workspace-backup': { categoria: 'infra', anatomia: 'reflejos', funcion: 'Respalda el workspace completo (2 veces al día)', sensor: false, superficie: '/rutinas' },
  'polar-income-sync': { categoria: 'infra', anatomia: 'reflejos', funcion: 'Baja los ingresos de Polar a finanzas', sensor: false, superficie: '/finanzas' },
  'tareas-espejo': { categoria: 'personal', anatomia: 'reflejos', funcion: 'Proyecta las tareas de Todoist con fecha al calendario «Tareas · Todoist» de Google cada 10 min (heredado de sfcal, v70)', sensor: false, superficie: '/calendar' },
  'calendar-mirror-sync': { categoria: 'personal', anatomia: 'reflejos', funcion: 'Refresca el espejo de Google Calendar en MC cada 3h (resucitado v42)', sensor: false, superficie: '/calendar' },
  'snapshot-finanzas': { categoria: 'personal', anatomia: 'sintesis', funcion: 'Día 1 del mes: verifica el snapshot de finanzas y pide el dictado si falta (báscula v2)', sensor: true, superficie: '/finanzas' },
  'youtube-analytics-sync': { categoria: 'adquisicion', anatomia: 'sentidos', funcion: 'Sincroniza las analytics del canal de YouTube (pausado: API sin configurar)', sensor: false, superficie: '/youtube?tab=intel' },
}

// ⚰️ PODADOS (v37 el 12 jul / v40 el 15 jul 2026) — sin entrada explicita a
// proposito: twitter-monitor, youtube-comments-attribution, funnel-scoring,
// video-conversion-model, churn-predict, system-council, evening-briefing.
// Sus corridas HISTORICAS en `conversations` se clasifican igual via los
// fallbacks heuristicos de categoriaDeCron/anatomiaDeCron (verificado caso por
// caso el 19 jul). Censo vivo: system-map.md + `schedule-cli list` en el Mini.

/**
 * Clasifica un job_id conocido o desconocido. Fallback razonable para
 * `custom-*` (jobs creados por Daniel via mission-control) y prefijos
 * reconocibles que no estan (todavia) en el mapa explicito.
 */
export function categoriaDeCron(jobId: string): CronCategoria {
  const entry = CRON_TAXONOMY[jobId]
  if (entry) return entry.categoria
  if (jobId.startsWith('custom-calendar')) return 'personal'
  if (jobId.startsWith('custom-snapshot')) return 'personal'
  if (jobId.startsWith('custom-')) return 'infra'
  if (jobId.startsWith('youtube-comments') || jobId.startsWith('intel-')) return 'adquisicion'
  if (jobId.startsWith('autoresearch-')) return 'retencion'
  if (jobId.startsWith('sistema-')) return 'personal'
  return 'infra'
}

/** Funcion neurologica del organo (fallback heuristico para ids nuevos). */
export function anatomiaDeCron(jobId: string): CronAnatomia {
  const entry = CRON_TAXONOMY[jobId]
  if (entry) return entry.anatomia
  if (jobId.includes('watchdog') || jobId.includes('consciousness')) return 'centinelas'
  if (jobId.startsWith('autoresearch-') || jobId.includes('model') || jobId.includes('predict')) return 'aprendizaje'
  if (jobId.startsWith('intel-') || jobId.includes('monitor') || jobId.includes('scan') || jobId.includes('snapshot')) return 'sentidos'
  if (jobId.includes('briefing') || jobId.includes('council') || jobId.includes('review')) return 'sintesis'
  if (jobId.startsWith('sistema-') || jobId.startsWith('custom-calendar') || jobId.includes('reflection') || jobId.includes('habits')) return 'personal'
  return 'reflejos'
}

/** true si el job es uno de los 4 sensores (VISIBLE_JOBS del scheduler). */
export function esSensor(jobId: string): boolean {
  const entry = CRON_TAXONOMY[jobId]
  if (entry) return entry.sensor
  return SENSOR_JOB_SET.has(jobId)
}

/** Ruta interna de MC donde Daniel ve el efecto/output de este cron. */
export function superficieDeCron(jobId: string): string {
  return CRON_TAXONOMY[jobId]?.superficie ?? '/rutinas'
}

/** Que hace el organo en lenguaje humano (fallback: el id tal cual). */
export function funcionDeCron(jobId: string): string {
  return CRON_TAXONOMY[jobId]?.funcion ?? jobId
}

/**
 * Label humano corto de un cron (fuente UNICA — antes vivia duplicado en
 * useAutomatizaciones.LABELS y CronJobCard.JOB_LABELS, ya consolidados aqui).
 */
const CRON_LABELS: Record<string, string> = {
  'morning-briefing': 'Reporte diario',
  'evening-briefing': 'Evening Briefing',
  'business-council': 'Reporte semanal',
  'system-council': 'System Council',
  'monthly-review': 'Reporte mensual',
  'morning-habits': 'Hábitos · Mañana',
  'evening-reflection': 'Reflexión · Noche',
  'sistema-noche': 'Cierre del día',
  'sistema-manana': 'Apertura del día',
  'gmail-cleanup': 'Gmail Cleanup',
  'funnel-watchdog': 'Funnel Watchdog',
  'workspace-backup': 'Workspace Backup',
}

export function cronLabel(jobId: string): string {
  return CRON_LABELS[jobId] ?? jobId
}

/**
 * Tombstones de migracion del scheduler (v3-migrated, v10-migrated...) y
 * legados sin cron real: NO son organos, no se muestran en la sala Acciones.
 */
export function esOrganoReal(jobId: string): boolean {
  return !/^v\d+-migrated$/.test(jobId)
}
