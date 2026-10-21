/**
 * Ajustes del panel derecho (6 oct 2026, Daniel: «que pueda ocultar los que no quiera ver, por ejemplo Tareas… que tú
 * (Levy) pudieras ocultarla en tiempo real»). UNA sola fuente de verdad para el menú «+»: el orden de las secciones y
 * cuáles están ocultas. Vive en `~/.config/arbrain/panel-ajustes.json` (o `ARBRAIN_PANEL_AJUSTES` / `ARBRAIN_CONFIG_DIR`
 * en servidores de prueba), como el archivero, y la escriben dos puertas con la MISMA función: la app (Ajustes › Panel y
 * el arrastre del «+», por `POST /cabina {que:'panel-ajustes'}`) y Levy (herramienta `panel {accion:"secciones"}`).
 *
 * `rev` sube con cada escritura. Las apps lo reciben en el latido del panel-bus (panel-bus.ts → `sincronizar`) y reportan
 * el que aplicaron (`ajustesRev`): así la herramienta de Levy espera un ACUSE real en vez de dar el cambio por hecho.
 *
 * Los ids son los del menú de la app (arbrain/src/features/cabina/panel/menu-orden.ts → SECCIONES_MENU); un test de la
 * app compara ambas listas. Equipo y «Lo que llegó» nacen ocultos (6 oct 2026): el organigrama vive en Ajustes y los reportes ya llegan a su hilo; ambos se vuelven a mostrar desde Ajustes › Panel, y la vista `reporte` sigue abriéndose cuando Levy la pide.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { DIR_ARBRAIN } from '../edicion.js'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const ARCHIVO = () => process.env.ARBRAIN_PANEL_AJUSTES || path.join(DIR_ARBRAIN(), 'panel-ajustes.json')

export const SECCIONES = ['calendario', 'tareas', 'cohorte', 'lienzo', 'negocio', 'reporte', 'centro', 'equipo', 'salud', 'contenido', 'finanzas', 'explorador', 'taller'] as const
export type Seccion = typeof SECCIONES[number]
export const OCULTAS_POR_DEFECTO: Seccion[] = ['equipo', 'reporte']
/** Cómo las llama Daniel (para que Levy pueda decir «Tareas» o «command center»). */
export const NOMBRES: Record<Seccion, string> = { calendario: 'Calendario', tareas: 'Tareas', cohorte: 'Cohorte', lienzo: 'Lienzo', negocio: 'Negocio', reporte: 'Lo que llegó', centro: 'Command center', equipo: 'Equipo', salud: 'Salud', contenido: 'Contenido', finanzas: 'Finanzas', explorador: 'Archivos', taller: 'Taller' }

/**
 * «Dónde abre Levy» (7 oct 2026, Daniel: «as default siempre me abrirás todo en la ventana de la izquierda… en el derecho suelo
 * tener el Día y el Taller de agentes»). Qué ventana de Arbrain recibe lo que Levy abre (`mostrar`, `pizarron`): la que esté a
 * la izquierda de la pantalla según su posición real (por defecto), la de la derecha, o siempre el panel principal. La app
 * resuelve «izquierda/derecha» midiendo sus ventanas; si la elegida no existe, cae en el panel principal.
 */
export const DONDES = ['izquierda', 'derecha', 'principal'] as const
export type Donde = typeof DONDES[number]
export const DONDE_POR_DEFECTO: Donde = 'izquierda'
export const NOMBRES_DONDE: Record<Donde, string> = { izquierda: 'la ventana de la izquierda', derecha: 'la ventana de la derecha', principal: 'el panel principal' }
/** «izquierda», «la izquierda», «Panel principal»… → Donde; undefined si no es una opción. */
export function idDeDonde(quien: unknown): Donde | undefined {
  if (typeof quien !== 'string') return undefined
  const n = sinAcentos(quien).replace(/^(la|el)\s+(ventana\s+(de\s+)?(la\s+)?)?/, '').trim()
  return DONDES.find(d => d === n) ?? (n === 'panel principal' ? 'principal' : undefined)
}
const dondeDe = (v: unknown): Donde => idDeDonde(v) ?? DONDE_POR_DEFECTO

export interface Ajustes { version: 1; rev: number; orden: Seccion[]; ocultas: Seccion[]; donde: Donde; actualizado: string; por: string }

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** «Tareas», «tareas», «Lo que llegó», «command center»… → id; undefined si no es una sección. */
export function idDeSeccion(quien: unknown): Seccion | undefined {
  if (typeof quien !== 'string') return undefined
  const n = sinAcentos(quien)
  return SECCIONES.find(s => s === n) ?? SECCIONES.find(s => sinAcentos(NOMBRES[s]) === n)
}

/** Orden guardado aplicado a las secciones de hoy: lo desconocido se tira y lo que falta entra tras su vecina de siempre. */
export function ordenar(guardado: unknown): Seccion[] {
  const validos = Array.isArray(guardado) ? [...new Set(guardado.map(idDeSeccion).filter((x): x is Seccion => !!x))] : []
  const resultado: Seccion[] = [...validos]
  SECCIONES.forEach((id, i) => {
    if (resultado.includes(id)) return
    const previa = SECCIONES.slice(0, i).reverse().find(x => resultado.includes(x))
    resultado.splice(previa ? resultado.indexOf(previa) + 1 : 0, 0, id)
  })
  return resultado
}
const ocultasDe = (v: unknown): Seccion[] => Array.isArray(v) ? [...new Set(v.map(idDeSeccion).filter((x): x is Seccion => !!x))] : [...OCULTAS_POR_DEFECTO]

export function porDefecto(): Ajustes { return { version: 1, rev: 0, orden: [...SECCIONES], ocultas: [...OCULTAS_POR_DEFECTO], donde: DONDE_POR_DEFECTO, actualizado: new Date(0).toISOString(), por: 'defecto' } }

/** `existe` = hay archivo (si no, la app puede migrar el orden que traía en localStorage, una sola vez). */
export function leer(archivo = ARCHIVO()): { ajustes: Ajustes; existe: boolean } {
  try {
    const v = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<Ajustes>
    return { existe: true, ajustes: { version: 1, rev: Number.isInteger(v.rev) && (v.rev as number) > 0 ? v.rev as number : 1, orden: ordenar(v.orden), ocultas: ocultasDe(v.ocultas), donde: dondeDe(v.donde), actualizado: typeof v.actualizado === 'string' ? v.actualizado : new Date(0).toISOString(), por: typeof v.por === 'string' ? v.por : 'desconocido' } }
  } catch { return { existe: false, ajustes: porDefecto() } }
}

function escribir(a: Ajustes, archivo = ARCHIVO()) {
  mkdirSync(path.dirname(archivo), { recursive: true })
  const tmp = `${archivo}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(a, null, 2) + '\n', 'utf8')
  renameSync(tmp, archivo)
}

export interface Cambio {
  orden?: unknown
  ocultar?: unknown[]
  mostrar?: unknown[]
  /** Todo de vuelta a lo de siempre (orden de fábrica, Equipo y Lo que llegó ocultos). */
  restablecer?: boolean
  /** Reemplaza la lista de ocultas completa (lo que manda Ajustes). */
  ocultas?: unknown[]
  /** «Dónde abre Levy»: izquierda, derecha o principal. */
  donde?: unknown
}

/** Aplica un cambio, sube `rev` y escribe. Un nombre que no es sección lanza error (Levy no debe creer que ocultó algo que no existe). */
export function aplicar(c: Cambio, por: string, o: { archivo?: string; ahora?: Date } = {}): Ajustes {
  const { ajustes: previo } = leer(o.archivo)
  const ids = (xs: unknown[] | undefined, campo: string) => (xs ?? []).map(x => { const id = idDeSeccion(x); if (!id) throw new Error(`${campo}: «${String(x)}» no es una sección del «+». Son: ${SECCIONES.map(s => NOMBRES[s]).join(', ')}.`); return id })
  let orden = previo.orden, ocultas = previo.ocultas
  let donde = previo.donde
  if (c.restablecer) { orden = [...SECCIONES]; ocultas = [...OCULTAS_POR_DEFECTO]; donde = DONDE_POR_DEFECTO }
  if (c.orden !== undefined) {
    if (!Array.isArray(c.orden)) throw new Error('orden debe ser una lista de secciones.')
    // Lo que se nombra va primero, en ese orden; lo que no, detrás y en el orden que ya tenía.
    const nombradas = [...new Set(ids(c.orden, 'orden'))]
    orden = [...nombradas, ...previo.orden.filter(s => !nombradas.includes(s))]
  }
  if (c.ocultas !== undefined) ocultas = [...new Set(ids(c.ocultas, 'ocultas'))]
  const ocultar = ids(c.ocultar, 'ocultar'), mostrar = ids(c.mostrar, 'mostrar')
  ocultas = [...new Set([...ocultas, ...ocultar])].filter(s => !mostrar.includes(s))
  if (c.donde !== undefined) {
    const d = idDeDonde(c.donde)
    if (!d) throw new Error(`donde: «${String(c.donde)}» no es una opción. Son: ${DONDES.join(', ')}.`)
    donde = d
  }
  const sig: Ajustes = { version: 1, rev: previo.rev + 1, orden, ocultas, donde, actualizado: (o.ahora ?? new Date()).toISOString(), por }
  escribir(sig, o.archivo)
  return sig
}

/** Primera vez (sin archivo): conserva el orden que Daniel acomodó en localStorage. Con archivo ya hecho, no pisa nada. */
export function migrar(orden: unknown, por = 'migración', archivo?: string): { ajustes: Ajustes; migrado: boolean } {
  const { ajustes, existe } = leer(archivo)
  if (existe) return { ajustes, migrado: false }
  return { ajustes: aplicar({ orden }, por, { archivo }), migrado: true }
}

/** Una línea legible para Levy: qué se ve en el «+» y en qué orden. `existen` = las secciones de la edición (cliente: menos). */
export function describir(a: Ajustes, existen: readonly Seccion[] = SECCIONES): string {
  const visibles = a.orden.filter(s => existen.includes(s) && !a.ocultas.includes(s)).map(s => NOMBRES[s])
  const ocultas = a.ocultas.filter(s => existen.includes(s))
  return `«+» muestra, en este orden: ${visibles.join(', ') || 'nada'}. Ocultas: ${ocultas.length ? ocultas.map(s => NOMBRES[s]).join(', ') : 'ninguna'}. Lo que abres tú cae en ${NOMBRES_DONDE[a.donde]} (config v${a.rev}, ${a.por}${a.rev ? `, ${a.actualizado.slice(0, 16).replace('T', ' ')} UTC` : ''}).`
}

/** Lo que pide la app al daemon (`POST /cabina {que:'panel-ajustes', accion, …}`). */
export function accionPanelAjustes(o: Record<string, unknown>): { ajustes: Ajustes; existe: boolean; migrado?: boolean } | { error: string; status: number } {
  const accion = o.accion ?? 'leer'
  try {
    if (accion === 'leer') return leer()
    if (accion === 'migrar') { const r = migrar(o.orden); return { ...r, existe: true } }
    if (accion === 'guardar') {
      if (o.orden === undefined && o.ocultas === undefined && o.donde === undefined) return { error: 'guardar necesita orden, ocultas y/o donde.', status: 400 }
      return { ajustes: aplicar({ orden: o.orden, ocultas: o.ocultas as unknown[] | undefined, donde: o.donde }, `${DUENO_M} · Ajustes`), existe: true }
    }
    if (accion === 'restablecer') return { ajustes: aplicar({ restablecer: true }, `${DUENO_M} · Ajustes`), existe: true }
    return { error: 'accion debe ser leer, migrar, guardar o restablecer.', status: 400 }
  } catch (error) { return { error: error instanceof Error ? error.message : 'No se pudo guardar.', status: 400 } }
}
