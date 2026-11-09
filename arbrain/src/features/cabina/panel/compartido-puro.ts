/**
 * Panel compartido entre aparatos (14 oct 2026): la parte PURA, sin React ni stores (tests/panel/compartido.test.ts).
 *
 * El Studio guarda una copia de las pestañas (arbrain/server/src/cabina/panel-compartido.ts). Cada app conserva la última versión
 * acordada con él (`base`). Si mientras tanto llegó una versión nueva y aquí también hubo cambios, se REHACEN los cambios locales
 * encima de la remota (`rehacer`): lo que se abrió aquí se suma, lo que se cerró aquí se quita y lo que se cambió aquí manda.
 * Así nunca se pisa lo que abrió otro aparato (o Levy) en los mismos segundos.
 */
import { TAREAS } from './pestanas-fuera'

export interface FijadaCompartida { id: string; input: { vista: string } & Record<string, unknown>; en: number; deLevy?: boolean; conversacion?: string; guardada?: boolean }
export interface EstadoPanel<F extends FijadaCompartida = FijadaCompartida> { fijadas: F[]; orden: string[]; taller: boolean; ancladas: string[] }

export const VACIO: EstadoPanel = { fijadas: [], orden: [], taller: true, ancladas: [] }

/** Lo que identifica una pestaña para la sincronía. `en` (la hora en que se fijó) no cuenta: cambia sin que cambie la pestaña. */
const firmaFijada = (f: FijadaCompartida) => JSON.stringify([f.id, f.input, !!f.deLevy, f.conversacion ?? '', !!f.guardada])
export const firmaEstado = (e: EstadoPanel) => JSON.stringify([e.fijadas.map(firmaFijada), e.orden, e.taller, e.ancladas])
export const iguales = (a: EstadoPanel, b: EstadoPanel) => firmaEstado(a) === firmaEstado(b)
const mismaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Rehace sobre `remoto` lo que cambió aquí desde `base` hasta `local`. */
export function rehacer<F extends FijadaCompartida>(remoto: EstadoPanel<F>, base: EstadoPanel<F>, local: EstadoPanel<F>): EstadoPanel<F> {
  const enBase = new Map(base.fijadas.map(f => [f.id, f])), enLocal = new Map(local.fijadas.map(f => [f.id, f]))
  const quitadas = new Set(base.fijadas.filter(f => !enLocal.has(f.id)).map(f => f.id))
  const nuevas = local.fijadas.filter(f => !enBase.has(f.id))
  const cambiadas = new Map(local.fijadas.filter(f => enBase.has(f.id) && firmaFijada(f) !== firmaFijada(enBase.get(f.id)!)).map(f => [f.id, f]))
  const idsRemotos = new Set(remoto.fijadas.map(f => f.id))
  const fijadas = [
    ...remoto.fijadas.filter(f => !quitadas.has(f.id)).map(f => cambiadas.get(f.id) ?? f),
    ...nuevas.filter(f => !idsRemotos.has(f.id)),
  ]
  const ids = new Set(fijadas.map(f => f.id))
  // Tareas (la casa) se abre o se cierra como cualquier pestaña: si aquí cambió, manda lo de aquí.
  const tareasAqui = local.orden.includes(TAREAS) !== base.orden.includes(TAREAS)
  const conTareas = tareasAqui ? local.orden.includes(TAREAS) : remoto.orden.includes(TAREAS)
  // El orden: si aquí se REACOMODÓ (lo que ya estaba cambió de lugar), el de aquí; si no, el remoto. Abrir o cerrar no es
  // reacomodar. Lo que falte va al final.
  const reacomodo = !mismaLista(local.orden.filter(c => base.orden.includes(c)), base.orden.filter(c => local.orden.includes(c)))
  const molde = reacomodo ? local.orden : remoto.orden
  const orden = molde.filter(c => (c === TAREAS ? conTareas : ids.has(c)))
  for (const f of fijadas) if (!orden.includes(f.id)) orden.push(f.id)
  if (conTareas && !orden.includes(TAREAS)) orden.unshift(TAREAS)
  const taller = local.taller !== base.taller ? local.taller : remoto.taller
  const ancladas = (mismaLista(local.ancladas, base.ancladas) ? remoto.ancladas : local.ancladas).filter(c => orden.includes(c))
  return { fijadas, orden: [...new Set(orden)], taller, ancladas }
}

// ── Lo que este aparato no sabe pintar (9 nov 2026) ──
// Un aparato con un bundle viejo (un Chrome por Tailscale no se recarga solo) no conoce una vista nueva como «estrategia».
// Antes la filtraba al recibir el panel y en el latido siguiente mandaba ese estado filtrado como CAMBIO: la pestaña se cerraba
// en todos los aparatos («algo lo cierra solo», Daniel, 9 nov). Regla: lo que este aparato no sabe pintar no lo cierra. No se
// pinta, pero viaja en lo que se sincroniza (y entre sus ventanas) hasta que la cierre quien sí la ve.

/** Una pestaña que no se pinta aquí. `antes`: las que la precedían en el orden, la más cercana primero (para devolverla a su
 *  lugar); null si no figuraba en el orden. */
export interface Ajena<F extends { id: string } = FijadaCompartida> { fijada: F; antes: string[] | null; anclada: boolean }
type Tira<F> = { fijadas: F[]; orden: string[]; ancladas: string[] }

/** Las pestañas de `e` que este aparato no sabe pintar, con su lugar. */
export function separarAjenas<F extends { id: string }>(e: Tira<F>, esAjena: (f: F) => boolean): Ajena<F>[] {
  return e.fijadas.filter(esAjena).map(f => {
    const i = e.orden.indexOf(f.id)
    return { fijada: f, antes: i < 0 ? null : e.orden.slice(0, i).reverse(), anclada: e.ancladas.includes(f.id) }
  })
}

/** Junta las que ya se conocían con las que llegan de otra ventana (las que llegan mandan). Solo SUMA: quitar una ajena es cosa
 *  del Studio (la principal la suelta cuando él ya no la trae). */
export function sumarAjenas<F extends { id: string }>(previas: readonly Ajena<F>[], nuevas: readonly Ajena<F>[]): Ajena<F>[] {
  const ids = new Set(nuevas.map(a => a.fijada.id))
  return [...previas.filter(a => !ids.has(a.fijada.id)), ...nuevas]
}

const insertar = (lista: string[], id: string, antes: string[] | null) => {
  if (lista.includes(id)) return
  if (!antes) { lista.push(id); return }
  const previa = antes.find(c => lista.includes(c))
  lista.splice(previa ? lista.indexOf(previa) + 1 : 0, 0, id)
}

/** El estado de este aparato con las ajenas devueltas a su lugar: es lo que se sincroniza y se publica a las otras ventanas. */
export function conAjenas<F extends { id: string }, T extends Tira<F>>(e: T, ajenas: readonly Ajena<F>[]): T {
  const ids = new Set(e.fijadas.map(f => f.id))
  const faltan = ajenas.filter(a => !ids.has(a.fijada.id))
  if (!faltan.length) return e
  const orden = [...e.orden], ancladas = [...e.ancladas]
  for (const a of faltan) {
    insertar(orden, a.fijada.id, a.antes)
    if (a.anclada) insertar(ancladas, a.fijada.id, a.antes)
  }
  return { ...e, fijadas: [...e.fijadas, ...faltan.map(a => a.fijada)], orden, ancladas }
}

/**
 * Primer contacto con el Studio: ¿qué cuenta como «ya acordado»? El escritorio no pierde nada (base vacía: lo suyo se SUMA a
 * lo del Studio). Un teléfono o un navegador adopta el panel del Studio tal cual (sus pestañas viejas de ese aparato no se
 * esparcen a los demás). Con el Studio vacío, cualquiera lo siembra con lo que tiene.
 */
export function basePrimerContacto<F extends FijadaCompartida>(local: EstadoPanel<F>, revRemota: number, escritorio: boolean): EstadoPanel<F> {
  return escritorio || revRemota === 0 ? (VACIO as EstadoPanel<F>) : local
}

/** Lo que queda en este aparato al recibir una versión remota. */
export function alRecibir<F extends FijadaCompartida>(remoto: EstadoPanel<F>, base: EstadoPanel<F>, local: EstadoPanel<F>): EstadoPanel<F> {
  return iguales(local, base) ? remoto : rehacer(remoto, base, local)
}

/** Lo que el latido manda al Studio y lo que vuelve (contrato: panel-compartido.ts del daemon). */
export interface PedidoCompartido { rev: number; activaRev: number; cambio?: EstadoPanel & { base: number }; activa?: string }
export interface RespuestaCompartido { rev: number; activaRev: number; rechazado?: boolean; error?: string; estado?: EstadoPanel; activa?: string }

/** El enlace propio de una vista (`/artefacto?v=…`, `/telefono?abrir=…`): la invocación en base64url, nunca su contenido. */
export function codificarVista(input: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(input))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodifica un enlace; devuelve null si no es una invocación válida (vista conocida y nada raro). */
export function decodificarVista(v: string | null | undefined, vistas: readonly string[]): ({ vista: string } & Record<string, unknown>) | null {
  if (!v || v.length > 8000) return null
  try {
    const bin = atob(v.replace(/-/g, '+').replace(/_/g, '/'))
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    const r = o as Record<string, unknown>
    if (typeof r.vista !== 'string' || !vistas.includes(r.vista)) return null
    // Solo los campos de una invocación (los mismos del archivero); nada que ordene fijar, guardar o soltar.
    const CAMPOS = ['vista', 'alcance', 'fecha', 'paginaId', 'titulo', 'enfoque', 'seccion', 'agenteId', 'zona', 'ruta', 'compararCon', 'versiones', 'tiempo', 'quien']
    return Object.fromEntries(Object.entries(r).filter(([k, x]) => CAMPOS.includes(k) && x != null && x !== '')) as { vista: string } & Record<string, unknown>
  } catch { return null }
}
