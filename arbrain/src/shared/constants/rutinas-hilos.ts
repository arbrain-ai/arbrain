// Mapa ÚNICO cron → hilo de la carpeta «Rutinas» (4 oct 2026, Daniel: «separa la sección de fijadas a
// "Rutinas" y una conversación dedicada a los resultados de los crons… como una carpeta»).
//
// Lo lee el webhook (api/openclaw/event) para decidir a qué conversación cae el reporte, y la barra
// lateral (RecientesNav) para pintar la carpeta. Un job que no esté aquí sigue cayendo al hilo
// «Automatizaciones» (se ve como «Reportes»), que queda como historial: nada se borra.
//
// Un job MAPEADO entrega su resultado al hilo aunque el scheduler lo mande `silent` (los de
// VISIBLE_JOBS en arbrain/server/src/scheduler.ts son los únicos que antes llegaban al chat). Los fallos
// NO van al hilo: son telemetría y siguen a la bitácora (features/avisos/policy.ts).
//
// Cambiar este mapa = actualizar docs/business-os/system-map.md (sección «Rutinas: hilos de resultados») en
// el mismo commit (regla 10) y subir RUTINAS_HILOS_VERSION.

export const RUTINAS_HILOS_VERSION = 3

// v3 (10 oct 2026, 08:21, Daniel: «sí, dale adelante»; brief docs/builds/rutinas-v3-favorita-2026-10-10/): un lugar
// para hablar y un lugar para guardar. Lo que antes caía a «Reportes» llega a la conversación favorita (la de la
// estrella, reporte-vivo.ts elegirFavorita); sin favorita, al hilo «Reportes» como antes. «Información» deja de llegar
// a Daniel: va a la bitácora (fuente `informacion:<job>`) y lo que valga sube a la línea «Máquina» del reporte diario
// y a «Lo que vi afuera / Máquina de la semana» del semanal. La sección «Rutinas» sale de la barra (RUTINAS_EN_BARRA);
// los dos hilos se OCULTAN, no se borran: siguen en Taller › Rutinas y en el buscador.

// v2 (4 oct 2026, 19:11, Daniel: «solo dos hilos»): «Reportes» = lo que suena en su teléfono; «Información» = el
// resto valioso de los crons, en silencio. Diario/Semanal/Mensual desaparecen de la barra (sus filas siguen en la base).
export type HiloRutinaId = 'reportes' | 'informacion'

export interface HiloRutina {
  id: HiloRutinaId
  /**
   * Id FIJO de la conversación en chat_sessions. «Reportes» es el hilo «Automatizaciones» de siempre (su id lo fijó
   * la base, no el código: sesionId null y se resuelve por título + fijado, así no se pierde el historial).
   */
  sesionId: string | null
  /** Título guardado en la base. */
  titulo: string
  /** Lo que ve Daniel en la carpeta. */
  etiqueta: string
  icono: string
}

export const PREFIJO_TITULO_RUTINA = 'Rutinas · '
export const TITULO_REPORTES = 'Automatizaciones'

export const HILOS_RUTINAS: readonly HiloRutina[] = [
  { id: 'reportes', sesionId: null, titulo: TITULO_REPORTES, etiqueta: 'Reportes', icono: '🔔' },
  // Es el hilo «Investigaciones» de la v1 (mismo id, se renombra en la base: no se pierde nada).
  { id: 'informacion', sesionId: '5d0a1c10-7a11-4b0e-9a01-000000000004', titulo: `${PREFIJO_TITULO_RUTINA}Información`, etiqueta: 'Información', icono: '🔎' },
]

/** v3: la carpeta «Rutinas» no se pinta en la barra izquierda. Volver a mostrarla es esta línea. */
export const RUTINAS_EN_BARRA = false

/** Hilos de la v1 que salen de la barra: se ocultan (no se borran) por id o por título. */
export const IDS_HILOS_RUTINAS_RETIRADOS: readonly string[] = [
  '5d0a1c10-7a11-4b0e-9a01-000000000001',
  '5d0a1c10-7a11-4b0e-9a01-000000000002',
  '5d0a1c10-7a11-4b0e-9a01-000000000003',
]

/** Reportes: SOLO lo que suena en el teléfono (políticas de avisos: features/avisos/policy.ts RUTINAS_VISIBLES). */
const POR_JOB: Readonly<Record<string, HiloRutinaId>> = {
  'morning-briefing': 'reportes',
  'business-council': 'reportes',
  'monthly-review': 'reportes',
  'snapshot-finanzas': 'reportes',
  'ritual-noche': 'reportes',
  // Información: lo valioso que llega en silencio.
  'reporte-diario-html': 'informacion',
  'system-consciousness': 'informacion',
  'os-audit': 'informacion',
  'twitter-monitor': 'informacion',
}

/** Familias de jobs por prefijo → hilo (todo `intel-*` es información). */
const POR_PREFIJO: ReadonlyArray<readonly [string, HiloRutinaId]> = [['intel-', 'informacion']]

/**
 * v3: adónde entrega el webhook el resultado de un cron. «favorita» = la conversación de la estrella (sin favorita, al
 * hilo «Reportes»); «bitacora» = registro para Levy, Daniel no lo ve ni lo escucha; null = sin mapa (el hilo
 * «Automatizaciones» de siempre).
 */
export type DestinoRutina = 'favorita' | 'bitacora'
export function destinoDeRutina(jobId: string): DestinoRutina | null {
  const h = hiloDeRutina(jobId)
  return h ? (h.id === 'reportes' ? 'favorita' : 'bitacora') : null
}

/** Fuente en la bitácora de un resultado de «Información» (no es un fallo: `rutina:<job>` lo es). */
export const fuenteInformacion = (jobId: string) => `informacion:${jobId}`

/** Ids fijos de la carpeta (Reportes no tiene: se resuelve por título). */
export const IDS_HILOS_RUTINAS: readonly string[] = HILOS_RUTINAS.flatMap((h) => (h.sesionId ? [h.sesionId] : []))
const IDS_OCULTOS = new Set([...IDS_HILOS_RUTINAS, ...IDS_HILOS_RUTINAS_RETIRADOS])

const porId = new Map(HILOS_RUTINAS.map((h) => [h.id, h]))
const porSesion = new Map(HILOS_RUTINAS.flatMap((h) => (h.sesionId ? [[h.sesionId, h] as const] : [])))

/** El hilo de Rutinas al que cae el resultado de este cron, o null (sigue al hilo «Automatizaciones»). */
export function hiloDeRutina(jobId: string): HiloRutina | null {
  const id = POR_JOB[jobId] ?? POR_PREFIJO.find(([p]) => jobId.startsWith(p))?.[1]
  return id ? porId.get(id) ?? null : null
}

/** ¿Esta conversación es uno de los hilos de id fijo (Información)? */
export const hiloDeSesion = (sesionId: string): HiloRutina | null => porSesion.get(sesionId) ?? null

/** ¿Es un hilo de Rutinas de id fijo, o uno retirado de la v1 (se omite de Recientes)? «Reportes» va aparte (esProtegida). */
export const esHiloRutina = (s: { id?: string; title: string }): boolean =>
  (!!s.id && IDS_OCULTOS.has(s.id)) || s.title.startsWith(PREFIJO_TITULO_RUTINA)

/** Primera ruta a un documento (.md/.html/.pdf) que menciona el resultado de un cron, para enlazarla. */
export function documentoDelResultado(texto: string): string | null {
  const m = texto.match(/(?:~\/|\/Users\/[^\s`'"()<>]+\/|(?:\.claude|docs|Business|labs|scripts|ops)\/)[^\s`'"()<>]*\.(?:md|html|pdf)\b/)
  return m ? m[0].replace(/[.,;:]+$/, '') : null
}

/**
 * Código de color de la carpeta (Daniel, 4 oct 2026, firmado): MORADO = el hilo tiene un reporte que pide su
 * respuesta o decisión; GRIS = informativo o ya revisado. El reporte lo DECLARA el cron: o una línea propia
 * `[pide_decision]` / `[pide_decision: qué decisión]` en su salida, o `pideDecision: true` en el evento del
 * webhook. Sin declaración es gris. La línea se quita del texto que ve Daniel.
 */
export function declaracionDecision(texto: string): { texto: string; pide: boolean; motivo: string | null } {
  const re = /^[ \t]*\[pide_decision(?:[ \t]*[:=][ \t]*([^\]\n]*))?\][ \t]*$/gim
  let pide = false
  let motivo: string | null = null
  const limpio = texto.replace(re, (_l, valor?: string) => {
    const v = (valor ?? '').trim()
    if (!/^(false|no|0)$/i.test(v)) { pide = true; motivo = motivo ?? (v && !/^(true|si|sí|1)$/i.test(v) ? v : null) }
    return ''
  })
  return pide || limpio !== texto ? { texto: limpio.replace(/\n{3,}/g, '\n\n').trim(), pide, motivo } : { texto, pide: false, motivo: null }
}
