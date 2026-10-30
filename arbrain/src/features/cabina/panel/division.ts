/**
 * Dividir la ventana como Visual Studio (8 oct 2026, Daniel: «agarrar esa pestaña y moverla a la mitad derecha, o
 * cuatro cuartos mejor dicho; como opción principal la mitad derecha»).
 *
 * Cada ventana (el panel principal o una aparte) tiene cuatro RANURAS en cuadrícula de 2×2:
 *   0 arriba-izquierda · 1 arriba-derecha · 2 abajo-izquierda · 3 abajo-derecha
 * Una columna con una sola parte la ocupa entera de alto; una sin nada desaparece. Así salen todas las formas:
 * una vista, mitad y mitad, una columna partida en dos, o los cuatro cuartos.
 *
 * 8 oct 2026, 19:43 (Daniel: «que la mitad derecha también tenga su grupo de pestañas, a la misma altura y simetría
 * que las de la izquierda»): cada parte es un GRUPO de pestañas, como los grupos de VS Code. `grupos` dice en qué
 * parte vive cada pestaña (sin entrada = la primera parte viva) y `celdas` cuál se ve en cada una. Dividida, cada
 * parte pinta su propia tira encima, y las de arriba quedan a la misma altura.
 *
 * Al soltar una pestaña sobre el cuerpo de su ventana, el punto decide la zona: en las esquinas, ese cuarto; en el
 * resto, la mitad derecha (la principal) o la izquierda. Sobre la tira de otro grupo, se va a ese grupo.
 * Lógica pura, sin DOM (tests/panel/division.test.ts).
 */

export type Ranura = 0 | 1 | 2 | 3
export type Celdas = [string | null, string | null, string | null, string | null]
export type Grupos = Record<string, Ranura>
export type ZonaDivision = 'izq' | 'der' | Ranura
/** Adónde va la pestaña al soltarla: una zona del cuerpo o la tira de otro grupo. */
export type Destino = ZonaDivision | { grupo: Ranura }
export interface EstadoDivision { celdas: Celdas; grupos: Grupos }

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Punto { x: number; y: number }

export const VACIAS: Celdas = [null, null, null, null]
const RANURAS = [0, 1, 2, 3] as const
/** La compañera de columna: arriba ↔ abajo. */
const companera = (r: Ranura): Ranura => ((r + 2) % 4) as Ranura

/** Qué tanto de cada borde cuenta como esquina (fracción del cuerpo). */
export const ESQUINA = 0.28

export function zonaDeDivision(p: Punto, r: Rect): ZonaDivision {
  const w = r.right - r.left, h = r.bottom - r.top
  const fx = w > 0 ? (p.x - r.left) / w : 0.5, fy = h > 0 ? (p.y - r.top) / h : 0.5
  const ladoX = fx < ESQUINA ? 0 : fx > 1 - ESQUINA ? 1 : -1
  const ladoY = fy < ESQUINA ? 0 : fy > 1 - ESQUINA ? 2 : -1
  if (ladoX >= 0 && ladoY >= 0) return (ladoX + ladoY) as Ranura
  return fx >= 0.5 ? 'der' : 'izq'
}

const columnaVacia = (c: Celdas, col: 0 | 1) => !c[col] && !c[col + 2]
export const cuantas = (c: Celdas) => c.filter(Boolean).length
export const dividida = (c: Celdas) => cuantas(c) >= 2
export const iguales = (a: Celdas, b: Celdas) => a.every((v, i) => v === b[i])
export const igualesEstado = (a: EstadoDivision, b: EstadoDivision) =>
  iguales(a.celdas, b.celdas) && JSON.stringify(ordenado(a.grupos)) === JSON.stringify(ordenado(b.grupos))
const ordenado = (g: Grupos) => Object.fromEntries(Object.entries(g).sort(([x], [y]) => x.localeCompare(y)))

/** La primera parte viva (tras normalizar siempre es la 0). */
const primeraViva = (c: Celdas): Ranura => (RANURAS.find(r => c[r]) ?? 0) as Ranura
/** En qué parte vive una pestaña: la suya si sigue viva; si no, la primera. */
export const grupoDe = (e: EstadoDivision, clave: string): Ranura => {
  const g = e.grupos[clave]
  return g != null && e.celdas[g] ? g : primeraViva(e.celdas)
}
/** Las pestañas de un grupo, en el orden de la tira. */
export const miembros = (e: EstadoDivision, r: Ranura, tira: readonly string[]) => tira.filter(c => grupoDe(e, c) === r)

/** Cambia de parte a todo un grupo (`de` → `a`). */
function mudar(e: EstadoDivision, de: Ranura, a: Ranura) {
  for (const [c, g] of Object.entries(e.grupos)) if (g === de) e.grupos[c] = a
  e.celdas[a] = e.celdas[de]
  e.celdas[de] = null
}

/**
 * Deja el estado en forma: solo pestañas que siguen en esta ventana; cada parte ve una pestaña de su grupo (si la que
 * veía se fue, otra de su grupo; si el grupo quedó vacío, la parte desaparece); cada columna empieza arriba y, si la
 * izquierda quedó vacía, la derecha pasa a la izquierda (con sus grupos).
 */
export function normalizar(entrada: { celdas: readonly (string | null)[]; grupos?: Grupos }, tira: readonly string[]): EstadoDivision {
  const grupos: Grupos = {}
  for (const [c, g] of Object.entries(entrada.grupos ?? {})) if (tira.includes(c) && RANURAS.includes(g)) grupos[c] = g
  const e: EstadoDivision = { celdas: [...VACIAS] as Celdas, grupos }
  const vistas = new Set<string>()
  // Primero las celdas válidas (una pestaña se ve en una sola parte, la de su grupo si lo tiene).
  for (const r of RANURAS) {
    const v = entrada.celdas[r] ?? null
    if (v && tira.includes(v) && !vistas.has(v) && (grupos[v] == null || grupos[v] === r)) { e.celdas[r] = v; vistas.add(v); grupos[v] = r }
  }
  // Una parte con grupo pero sin pestaña a la vista toma otra de su grupo.
  for (const r of RANURAS) {
    if (e.celdas[r]) continue
    const otra = tira.find(c => grupos[c] === r && !vistas.has(c))
    if (otra) { e.celdas[r] = otra; vistas.add(otra) }
  }
  // Compactar: cada columna empieza arriba; la izquierda nunca queda vacía si la derecha tiene algo.
  for (const col of [0, 1] as const) if (!e.celdas[col] && e.celdas[col + 2]) mudar(e, (col + 2) as Ranura, col)
  if (columnaVacia(e.celdas, 0) && !columnaVacia(e.celdas, 1)) { mudar(e, 1, 0); mudar(e, 3, 2) }
  // Las pestañas de partes que ya no existen vuelven a la primera (sin entrada).
  for (const [c, g] of Object.entries(e.grupos)) if (!e.celdas[g]) delete e.grupos[c]
  // Sin dividir no hay grupos: todo es una sola tira.
  if (!dividida(e.celdas)) e.grupos = {}
  return e
}

/**
 * Coloca `clave` según el destino. `visible` = lo que se ve sin dividir (la pestaña activa); `tira` = las pestañas de
 * esta ventana en orden. La parte que deja la pestaña muestra otra de su grupo; si no le queda ninguna, desaparece
 * (arrastrar la única que se veía a la derecha deja a su vecina a la izquierda, como VS Code cuando divide).
 */
export function colocar(actual: EstadoDivision, clave: string, destino: Destino, visible: string | null, tira: readonly string[]): EstadoDivision {
  const base = dividida(actual.celdas) ? normalizar(actual, tira) : normalizar({ celdas: [visible, null, null, null] }, tira)
  const e: EstadoDivision = { celdas: [...base.celdas] as Celdas, grupos: { ...base.grupos } }
  // Sin dividir, todo era un solo grupo: el de la parte 0.
  if (!dividida(base.celdas)) for (const c of tira) e.grupos[c] = 0
  const origen = grupoDe(e, clave)
  const quita = () => { if (e.celdas[origen] === clave) e.celdas[origen] = null; delete e.grupos[clave] }

  if (typeof destino === 'object') {
    if (destino.grupo === origen || !e.celdas[destino.grupo]) return base
    quita()
  } else if (destino === 'der') {
    quita()
    // La columna derecha entera pasa a ser el grupo de la pestaña (lo de abajo se une a ella).
    if (e.celdas[3]) mudarSinVista(e, 3, 1)
  } else if (destino === 'izq') {
    quita()
    // Sin columna derecha, lo que se veía se corre a la derecha para hacerle lugar.
    if (columnaVacia(e.celdas, 1)) { mudar(e, 0, 1); mudar(e, 2, 3) }
    else if (e.celdas[2]) mudarSinVista(e, 2, 0)
  } else {
    quita()
    // Un cuarto ocupado con la compañera libre: el grupo que estaba pasa a la compañera (se parte la columna).
    const m = companera(destino)
    if (e.celdas[destino] && !e.celdas[m]) mudar(e, destino, m)
  }
  const r: Ranura = typeof destino === 'object' ? destino.grupo : destino === 'der' ? 1 : destino === 'izq' ? 0 : destino
  e.grupos[clave] = r
  e.celdas[r] = clave
  return normalizar(e, tira)
}

/** Une el grupo `de` al grupo `a` sin cambiar lo que se ve en `a`. */
function mudarSinVista(e: EstadoDivision, de: Ranura, a: Ranura) {
  for (const [c, g] of Object.entries(e.grupos)) if (g === de) e.grupos[c] = a
  e.celdas[de] = null
}

/** Elegir una pestaña: se ve en su grupo (si es nueva y no tiene grupo, en el que tiene el foco) y ese grupo toma el foco. */
export function alActivar(e: EstadoDivision, foco: Ranura, clave: string): { estado: EstadoDivision; foco: Ranura } {
  const ya = e.celdas.indexOf(clave)
  if (ya >= 0) return { estado: e, foco: ya as Ranura }
  const r = e.grupos[clave] != null && e.celdas[e.grupos[clave]] ? e.grupos[clave] : e.celdas[foco] ? foco : primeraViva(e.celdas)
  const celdas = [...e.celdas] as Celdas
  celdas[r] = clave
  return { estado: { celdas, grupos: { ...e.grupos, [clave]: r } }, foco: r }
}

/** Cerrar una parte: sus pestañas se unen a la primera parte que quede. */
export function quitar(e: EstadoDivision, r: Ranura, tira: readonly string[]): EstadoDivision {
  const celdas = [...e.celdas] as Celdas
  celdas[r] = null
  const restante = primeraViva(celdas)
  const grupos: Grupos = {}
  for (const [c, g] of Object.entries(e.grupos)) grupos[c] = g === r ? restante : g
  return normalizar({ celdas, grupos }, tira)
}

/** Cortes: `x` = ancho de la columna izquierda; `y` = alto de la fila de arriba en cada columna (fracciones). */
export interface Cortes { x: number; y: [number, number] }
export const CORTES: Cortes = { x: 0.5, y: [0.5, 0.5] }
export const limitarCorte = (v: number) => Math.max(0.15, Math.min(0.85, v))

/** Dónde queda la parte `i` del resultado, como fracción del cuerpo (la sombra de la vista previa y el vuelo al soltar). */
export function rectDeParte(i: number, resultado: Celdas, cortes: Cortes = CORTES): { x: number; y: number; w: number; h: number } | null {
  if (i < 0 || !resultado[i]) return null
  const dos = !columnaVacia(resultado, 1)
  const x0 = dos ? cortes.x : 1
  const col = i % 2
  const left = col === 0 ? 0 : x0, w = col === 0 ? x0 : 1 - x0
  if (!resultado[col] || !resultado[col + 2]) return { x: left, y: 0, w, h: 1 }
  const cy = cortes.y[col]
  return i < 2 ? { x: left, y: 0, w, h: cy } : { x: left, y: cy, w, h: 1 - cy }
}
export const rectDeClave = (clave: string, resultado: Celdas, cortes: Cortes = CORTES) => rectDeParte(resultado.indexOf(clave), resultado, cortes)

/**
 * Esconder la columna derecha (9 oct 2026, Daniel: «Cmd+B esconde y vuelve a mostrar esa columna, como la barra
 * lateral de VS Code»). La columna no se deshace: sus grupos, su pestaña a la vista y el corte `x` quedan tal cual y
 * solo deja de verse. Antes, el botón de la esquina devolvía todas sus pestañas al panel principal y Daniel las veía
 * caer en el grupo de la izquierda («jamás la voy a usar»).
 */
export const hayColumnaDerecha = (c: Celdas) => !columnaVacia(c, 1)

/** Esconder o mostrar: sin columna derecha no hay nada que alternar. Al esconder, el foco pasa a su lado izquierdo
 *  (lo nuevo que se abra cae a la vista); al mostrar, el foco se queda donde estaba. */
export function alternarColumna(celdas: Celdas, foco: Ranura, oculta: boolean): { oculta: boolean; foco: Ranura } | null {
  if (!hayColumnaDerecha(celdas)) return null
  if (oculta) return { oculta: false, foco }
  const izq = (foco % 2 === 1 ? foco - 1 : foco) as Ranura
  return { oculta: true, foco: celdas[izq] ? izq : 0 }
}

/** Escondida, una pestaña que se pide en la columna derecha (Levy la abre, llega de otra ventana o se suelta ahí) la
 *  vuelve a mostrar: lo que se pide se ve. */
export const revelaColumna = (celdas: Celdas, oculta: boolean, clave: string | null) => {
  const r = clave ? celdas.indexOf(clave) : -1
  return oculta && (r === 1 || r === 3)
}
