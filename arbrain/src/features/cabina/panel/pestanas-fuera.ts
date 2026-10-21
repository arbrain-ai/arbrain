/**
 * Pestañas del panel y las ventanas donde viven. 1 oct 2026: arrastrar una pestaña fuera del panel la
 * sacaba a una ventanita propia. 5 oct 2026 (Daniel: «poderlas ordenar como si fueran eso, pestañas… lo que
 * quiero es poderla arrastrar a las otras pestañas»): el modelo de Chrome. Una ventana es una TIRA de
 * pestañas; la principal es el panel derecho y cada ventana aparte (`ventana-1`, `ventana-2`…) tiene la
 * suya. Cada pestaña sabe en qué ventana vive (`enVentana`; sin entrada = el panel principal) y todas
 * comparten un solo orden global: la tira de cada ventana es ese orden filtrado.
 *
 * Lógica pura, sin React ni DOM, para poder probarla sola (tests/panel/pestanas-fuera.test.ts).
 * Una pestaña se nombra por su CLAVE: 'tareas', 'taller' o el id de una vista que Levy fijó.
 */
import type { Fijada } from './fijadas'

export const TAREAS = 'tareas'
export const TALLER = 'taller'
export const esFija = (clave: string) => clave === TAREAS || clave === TALLER

/** Las pestañas abiertas, en el orden de la cabecera: el acomodo de Daniel y, fijo a la derecha, el Taller
 *  (3 oct 2026: ninguna es obligatoria; Tareas también se cierra y se mueve). */
export const todasLasClaves = (orden: string[], taller = true) => [...orden.filter(c => c !== TALLER), ...(taller ? [TALLER] : [])]

/** Las que siguen en la columna (no están en otra ventana). */
export const visibles = (claves: string[], fuera: string[]) => claves.filter(c => !fuera.includes(c))

/** Con pestañas abiertas pero todas en su ventana, la columna se cierra sola. Sin pestañas NO: queda el estado vacío. */
export const todasFuera = (claves: string[], fuera: string[]) => claves.length > 0 && visibles(claves, fuera).length === 0

/** La pestaña que de verdad se pinta: la activa si sigue en la columna; si no, la primera que quede. */
export const pestanaActiva = (activa: string, visiblesAhora: string[]) =>
  visiblesAhora.includes(activa) ? activa : visiblesAhora[0] ?? null

/** Quita las que ya no están abiertas (una vista que se cerró mientras vivía en su ventana). */
export const podarFuera = (fuera: string[], claves: string[]) => fuera.filter(c => claves.includes(c))

// ── El acomodo de Daniel (3 oct 2026): qué pestañas y en qué orden. Global, no por conversación ──

/** Lo recordado puede venir roto o ser de antes del acomodo: sin él, Tareas primero y lo fijado detrás.
 *  Lo fijado que no figura (lo acaba de fijar Levy en otra ventana) se agrega al final. Las ancladas van primero. */
export function normalizarAcomodo(crudo: unknown, idsFijadas: string[]): { orden: string[]; taller: boolean; ancladas: string[] } {
  const o = crudo && typeof crudo === 'object' ? crudo as { orden?: unknown; taller?: unknown; ancladas?: unknown } : null
  if (!o || !Array.isArray(o.orden)) return { orden: [TAREAS, ...idsFijadas], taller: true, ancladas: [] }
  const validas = o.orden.filter((c): c is string => typeof c === 'string' && (c === TAREAS || idsFijadas.includes(c)))
  const orden = [...new Set(validas)]
  const completo = [...orden, ...idsFijadas.filter(id => !orden.includes(id))]
  const ancladas = Array.isArray(o.ancladas) ? [...new Set(o.ancladas.filter((c): c is string => typeof c === 'string' && completo.includes(c)))] : []
  return { orden: conAncladas(completo, ancladas), taller: o.taller !== false, ancladas }
}

/** Mueve una pestaña a la posición `indice` (la que tendrá en el orden nuevo). */
export function moverA(orden: string[], clave: string, indice: number): string[] {
  if (!orden.includes(clave)) return orden
  const sin = orden.filter(c => c !== clave)
  const i = Math.max(0, Math.min(sin.length, Math.round(indice)))
  return [...sin.slice(0, i), clave, ...sin.slice(i)]
}

/** El arrastre conoce la posición entre las pestañas VISIBLES (sin la arrastrada); el orden guardado también
 *  tiene las que viven en su ventana. Queda justo antes de la visible que ocupaba ese lugar (o tras la última). */
export function indiceEnOrden(orden: string[], tiraVisible: string[], clave: string, indice: number) {
  const sin = orden.filter(c => c !== clave), vecinas = tiraVisible.filter(c => c !== clave)
  const ancla = vecinas[indice]
  if (ancla) return sin.indexOf(ancla)
  const ultima = vecinas.at(-1)
  return ultima ? sin.indexOf(ultima) + 1 : 0
}

/** ⌥← / ⌥→: un lugar a la izquierda o a la derecha. */
export const moverUno = (orden: string[], clave: string, delta: -1 | 1) => moverA(orden, clave, orden.indexOf(clave) + delta)

/** Lo que Levy fijó y Daniel no guardó se cierra solo al cambiar de conversación, salvo lo que está a la vista
 *  (la pestaña activa o una que vive en su propia ventana). Sin tope de pestañas: esto es lo único que poda. */
export function porCerrar(fijadas: { id: string; deLevy?: boolean; guardada?: boolean; conversacion?: string }[], activaConversacion: string | null, aLaVista: string[]) {
  if (!activaConversacion) return []
  return fijadas.filter(f => f.deLevy && !f.guardada && f.conversacion && f.conversacion !== activaConversacion && !aLaVista.includes(f.id)).map(f => f.id)
}

// ── Ventanas con su propia tira (5 oct 2026) ──

/** El panel derecho de la ventana principal. */
export const PRINCIPAL = 'principal'
/** Pestaña → ventana aparte donde vive. Lo que no figura vive en el panel principal. */
export type EnVentana = Record<string, string>

export const esVentana = (id: string) => /^ventana-[1-9]\d{0,2}$/.test(id)
export const ventanaDe = (en: EnVentana, clave: string) => en[clave] ?? PRINCIPAL
/** La tira de una ventana: las abiertas (en orden de cabecera) que viven en ella. */
export const tiraDe = (claves: string[], en: EnVentana, ventana: string) => claves.filter(c => ventanaDe(en, c) === ventana)
/** Las pestañas que viven fuera del panel principal. */
export const fueraDe = (en: EnVentana) => Object.keys(en)
/** Las ventanas aparte que tienen al menos una pestaña, en orden (ventana-1, ventana-2…). */
export const ventanasCon = (en: EnVentana) => [...new Set(Object.values(en))].sort((a, b) => numero(a) - numero(b))
const numero = (id: string) => Number(id.slice('ventana-'.length)) || 0
/** «Ventana 2», para Levy y los títulos. */
export const nombreVentana = (id: string) => id === PRINCIPAL ? 'Panel principal' : `Ventana ${numero(id)}`

/** La ventana nueva toma el primer número libre: así reusa el lugar (monitor, posición, tamaño) que la app recuerda de esa etiqueta. */
export function ventanaNueva(en: EnVentana, abiertas: string[] = []) {
  const usadas = new Set([...Object.values(en), ...abiertas])
  for (let n = 1; ; n++) if (!usadas.has(`ventana-${n}`)) return `ventana-${n}`
}

/** Etiqueta nativa (Rust solo acepta `vista-[a-z0-9-]+`) y ruta de la web. */
export const etiquetaDeVentana = (id: string) => `vista-${id}`
export const rutaDeVentana = (id: string) => `/panel?ventana=${numero(id)}`
/** `?ventana=2` → 'ventana-2' (lo demás no vale). */
export const ventanaDeParametro = (v: string | null) => v && /^[1-9]\d{0,2}$/.test(v) ? `ventana-${v}` : null

/** Lo recordado puede venir roto: solo pestañas abiertas y ventanas válidas. */
export function normalizarEnVentana(crudo: unknown, claves: string[]): EnVentana {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {}
  return Object.fromEntries(Object.entries(crudo as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && esVentana(e[1]) && claves.includes(e[0])))
}

/** Ventanas que tenían pestañas y se quedaron sin ninguna (se cierran solas, como en Chrome). */
export const vaciadas = (antes: EnVentana, despues: EnVentana) => ventanasCon(antes).filter(v => !Object.values(despues).includes(v))

// ── Anclar (5 oct 2026): las ancladas van primero en su tira, compactas, como las fijadas de Chrome ──

/** Las ancladas primero (en su orden relativo), luego las demás. */
export function conAncladas(orden: string[], ancladas: string[]) {
  return [...orden.filter(c => ancladas.includes(c)), ...orden.filter(c => !ancladas.includes(c))]
}

/** Una anclada solo se mueve entre ancladas y una suelta solo entre sueltas. `ancladasSinElla`/`total` cuentan la tira sin la arrastrada. */
export function limitarIndice(indice: number, anclada: boolean, ancladasSinElla: number, total: number) {
  return anclada ? Math.max(0, Math.min(indice, ancladasSinElla)) : Math.max(ancladasSinElla, Math.min(indice, total))
}

/**
 * Lleva una pestaña a otra ventana (o al panel principal) en la posición `indice` de la tira de destino
 * (sin `indice`: al final). El Taller no está en el orden: solo cambia de ventana.
 */
export function moverAVentana(st: { orden: string[]; enVentana: EnVentana; ancladas: string[]; taller: boolean }, clave: string, destino: string, indice?: number) {
  const enVentana = { ...st.enVentana }
  if (destino === PRINCIPAL) delete enVentana[clave]; else enVentana[clave] = destino
  if (clave === TALLER) return { orden: st.orden, enVentana }
  const tira = tiraDe(st.orden, st.enVentana, destino).filter(c => c !== clave)
  const ancladasTira = tira.filter(c => st.ancladas.includes(c)).length
  const i = limitarIndice(indice ?? tira.length, st.ancladas.includes(clave), ancladasTira, tira.length)
  const orden = conAncladas(moverA(st.orden, clave, indiceEnOrden(st.orden, tira, clave, i)), st.ancladas)
  return { orden, enVentana }
}
