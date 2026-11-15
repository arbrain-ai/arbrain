/**
 * Mapa v16 · la RECETA de una isla (14 nov 2026). Esquema `arbrain.isla/v1`.
 *
 * Daniel: «¿hay forma de conservar lo mejor de ambos mundos? Facilidad para ti de editar estos lienzos sin tener que
 * reiniciar la app cada vez que hay un cambio». Una isla ya no es un HTML: es una RECETA de datos (JSON) que dice qué
 * BLOQUES nativos lleva (número vivo, tarjeta de órgano, anillo NOVA, escalera, botón…), de qué fuente lee cada uno, qué
 * textos, a dónde lleva cada botón, su variante de color y su animación. Los bloques son componentes de la app (el diseño
 * de BI, Finanzas y Estrategia); la receta solo los ordena. Editar una isla = escribir su receta: el lienzo la vuelve a
 * pintar EN VIVO, sin reiniciar. Solo un TIPO de bloque nuevo pide actualizar la app.
 *
 * Dónde vive: en el elemento del lienzo (`embed` con `isla: {…receta}`) o en un archivo del repo (`isla: "doc:…/receta.json"`,
 * que el lienzo relee cada segundo mientras la página está abierta).
 *
 * Disposición: una REJILLA de `columnas` × filas de `fila` px lógicos. Cada bloque dice dónde va (`en: [col, fila, ancho,
 * alto]`, en celdas, desde 0) o, sin `en`, ocupa todo el ancho y su alto por defecto, uno debajo del otro. La misma cuenta la
 * usan el componente vivo y el dibujo ligero del canvas: de lejos y de cerca, cada cosa en su sitio.
 *
 * Reservado para la v17 (se valida su forma y se conserva; la v1 NO lo pinta): `tiempo` (foto diaria para rebobinar),
 * `simulacion` (palancas: «¿qué pasa si subo el precio?»), `submapa` (la isla abre su propio mapa: recursión), `camaras`
 * (destinos de cámara con nombre) y `voz` (cómo se la nombra: «muéstrame Finanzas»).
 *
 * Puro (tests/canvas/islas-receta.test.ts). Lo que no cumple se reporta en `errores` en palabras (Levy los lee para
 * corregir) y la isla pinta lo que sí sirve: un bloque roto no tumba a sus vecinos.
 */
import { FORMA_FUENTE } from './protocolo'

export const ESQUEMA_RECETA = 'arbrain.isla/v1'

export const VARIANTES = ['neutra', 'oro', 'morado', 'calma', 'dolor'] as const
export type Variante = (typeof VARIANTES)[number]
export const ANIMACIONES = ['respira', 'entra', 'quieta'] as const
export type Animacion = (typeof ANIMACIONES)[number]

export interface Rejilla { columnas: number; fila: number; hueco: number; margen: number }
export const REJILLA_DEFECTO: Rejilla = { columnas: 12, fila: 64, hueco: 16, margen: 40 }

/** Un bloque tal como viene en la receta: su tipo, dónde va y sus propiedades (cada tipo valida las suyas). */
export interface BloqueCrudo {
  tipo: string
  /** Para que Levy lo nombre al editar («cambia el botón `polar`»). */
  id?: string
  /** [columna, fila, ancho, alto] en celdas de la rejilla. Sin él, todo el ancho y su alto por defecto. */
  en?: [number, number, number, number]
  variante?: Variante
  animacion?: Animacion
  /** Todo el bloque lleva a un destino (además de los botones). */
  destino?: string
  props: Record<string, unknown>
}

/** Reservado v17: se valida la forma y se conserva. */
export interface Reservado {
  tiempo?: { foto: 'diaria'; desde?: string }
  simulacion?: { palancas: Array<{ id: string; etiqueta: string; fuente?: string; min?: number; max?: number; paso?: number }> }
  submapa?: { pagina?: string; receta?: string }
  camaras?: Array<{ nombre: string; zona?: string | { x: number; y: number; width: number; height: number } }>
  voz?: { nombres: string[] }
}

/** Los acentos y los íconos del cartel de lejos (`bloques/cartel.ts`). */
export const ACENTOS = ['violeta', 'orquidea', 'esmeralda', 'cielo', 'oro', 'acero'] as const
export type Acento = (typeof ACENTOS)[number]
export const ICONOS_LEJOS = ['megafono', 'manos', 'cerebro', 'paquete', 'cartera', 'engranes', 'brujula', 'timon', 'chispa', 'blanco', 'libro', 'escalera'] as const
export type IconoLejos = (typeof ICONOS_LEJOS)[number]
export const FORMAS_LEJOS = ['organo', 'nova', 'timonel', 'capitulo', 'ninguna'] as const

/**
 * Cómo se ve la isla DE LEJOS (14 nov 2026, pulido del mapa v16): su cartel. Sin `lejos`, el cartel sale solo de la receta
 * (un órgano → su cartel de órgano; un círculo NOVA → su cartel NOVA; lo demás encoge sus bloques). Con él, se afina:
 * `forma` (organo · nova · timonel · capitulo · ninguna; `capitulo` solo si se pide), `icono`, `acento`, `cifra` (otra fuente para el número grande) y `frase` (lo que dice
 * debajo del número o, en NOVA, su título).
 */
export interface Lejos {
  forma?: (typeof FORMAS_LEJOS)[number]
  icono?: IconoLejos
  acento?: Acento
  cifra?: { fuente: string; campo?: string; unidad?: string }
  frase?: string
}

export interface Receta extends Reservado {
  esquema: typeof ESQUEMA_RECETA
  id: string
  titulo: string
  /** El órgano que encarna (marketing, venta, comprador, entrega, finanzas, sistemas…): por aquí le llegan sus impulsos,
   *  su meta y su error, sus agentes y las tarjetas de la bandeja que lo tocan. */
  organo?: string
  variante: Variante
  animacion: Animacion
  rejilla: Rejilla
  /** Ancho lógico de su diseño en px (la cámara lo escala entero). Su alto sale de la rejilla o de `alto`. */
  ancho: number
  alto?: number
  bloques: BloqueCrudo[]
  /** El cartel de lejos (ver `Lejos`). */
  lejos?: Lejos
}

export type Lectura = { ok: true; receta: Receta; errores: string[] } | { ok: false; errores: string[] }

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown, max = 2000) => (typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : null)
const entero = (x: unknown, min: number, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : null)
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const de = <T extends string>(lista: readonly T[], x: unknown): T | null => (lista as readonly unknown[]).includes(x) ? x as T : null

/**
 * Lee una receta con tolerancia. `ok: false` solo si no se puede pintar NADA (no es objeto, otra versión, sin bloques).
 * Las claves de bloque que no son `tipo|id|en|variante|animacion|destino` son sus propiedades (`props`): las valida su tipo
 * en el registro, no aquí.
 */
export function leerReceta(x: unknown): Lectura {
  if (!obj(x)) return { ok: false, errores: ['La receta no es un objeto JSON.'] }
  const errores: string[] = []
  if (x.esquema !== ESQUEMA_RECETA) return { ok: false, errores: [`La receta debe decir "esquema": "${ESQUEMA_RECETA}" (dice ${JSON.stringify(x.esquema ?? null)}).`] }
  const id = typeof x.id === 'string' && ID.test(x.id) ? x.id : null
  if (!id) errores.push('«id» falta o no es minúsculas-con-guiones; se usa «isla».')
  const r0 = obj(x.rejilla) ? x.rejilla : {}
  const rejilla: Rejilla = {
    columnas: entero(r0.columnas, 1, 48) ?? REJILLA_DEFECTO.columnas,
    fila: entero(r0.fila, 8, 600) ?? REJILLA_DEFECTO.fila,
    hueco: entero(r0.hueco, 0, 200) ?? REJILLA_DEFECTO.hueco,
    margen: entero(r0.margen, 0, 400) ?? REJILLA_DEFECTO.margen,
  }
  if (!Array.isArray(x.bloques) || !x.bloques.length) return { ok: false, errores: [...errores, 'La receta necesita «bloques»: una lista con al menos uno.'] }
  const bloques: BloqueCrudo[] = []
  x.bloques.slice(0, 200).forEach((b, i) => {
    if (!obj(b) || typeof b.tipo !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(b.tipo)) { errores.push(`Bloque ${i + 1}: falta «tipo».`); return }
    const { tipo, id: bid, en, variante, animacion, destino, ...props } = b
    let celda: BloqueCrudo['en']
    if (en !== undefined) {
      const ok = Array.isArray(en) && en.length === 4 && en.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 400)
      if (ok && (en[2] as number) >= 1 && (en[3] as number) >= 1) celda = (en as number[]).map(n => Math.round(n)) as BloqueCrudo['en']
      else errores.push(`Bloque ${i + 1} (${tipo}): «en» debe ser [columna, fila, ancho, alto] con ancho y alto ≥ 1.`)
    }
    if (variante !== undefined && !de(VARIANTES, variante)) errores.push(`Bloque ${i + 1} (${tipo}): variante «${String(variante)}» no existe (${VARIANTES.join(', ')}).`)
    if (animacion !== undefined && !de(ANIMACIONES, animacion)) errores.push(`Bloque ${i + 1} (${tipo}): animación «${String(animacion)}» no existe (${ANIMACIONES.join(', ')}).`)
    if (destino !== undefined && !texto(destino, 600)) errores.push(`Bloque ${i + 1} (${tipo}): «destino» debe ser texto.`)
    bloques.push({
      tipo, props,
      ...(typeof bid === 'string' && bid.trim() ? { id: bid.trim().slice(0, 64) } : {}),
      ...(celda ? { en: celda } : {}),
      ...(de(VARIANTES, variante) ? { variante: variante as Variante } : {}),
      ...(de(ANIMACIONES, animacion) ? { animacion: animacion as Animacion } : {}),
      ...(texto(destino, 600) ? { destino: texto(destino, 600)! } : {}),
    })
  })
  if (!bloques.length) return { ok: false, errores }
  if (x.variante !== undefined && !de(VARIANTES, x.variante)) errores.push(`Variante «${String(x.variante)}» no existe (${VARIANTES.join(', ')}).`)
  if (x.animacion !== undefined && !de(ANIMACIONES, x.animacion)) errores.push(`Animación «${String(x.animacion)}» no existe (${ANIMACIONES.join(', ')}).`)
  const receta: Receta = {
    esquema: ESQUEMA_RECETA,
    id: id ?? 'isla',
    titulo: texto(x.titulo, 160) ?? id ?? 'Isla',
    ...(typeof x.organo === 'string' && ID.test(x.organo) ? { organo: x.organo } : {}),
    variante: de(VARIANTES, x.variante) ?? 'neutra',
    animacion: de(ANIMACIONES, x.animacion) ?? 'entra',
    rejilla,
    ancho: entero(x.ancho, 240, 8000) ?? 1440,
    ...(entero(x.alto, 120, 8000) ? { alto: entero(x.alto, 120, 8000)! } : {}),
    bloques,
    ...(x.lejos !== undefined ? leerLejos(x.lejos, errores) : {}),
    ...reservado(x, errores),
  }
  return { ok: true, receta, errores }
}

/** El cartel de lejos: lo que no cumple se descarta con su error, en palabras. */
function leerLejos(x: unknown, errores: string[]): { lejos?: Lejos } {
  if (!obj(x)) { errores.push('«lejos» debe ser un objeto: { "forma", "icono", "acento", "cifra", "frase" }.'); return {} }
  const l: Lejos = {}
  if (x.forma !== undefined) { const f = de(FORMAS_LEJOS, x.forma); if (f) l.forma = f; else errores.push(`«lejos.forma» es ${FORMAS_LEJOS.join(', ')}.`) }
  if (x.icono !== undefined) { const i = de(ICONOS_LEJOS, x.icono); if (i) l.icono = i; else errores.push(`«lejos.icono» es uno de ${ICONOS_LEJOS.join(', ')}.`) }
  if (x.acento !== undefined) { const a = de(ACENTOS, x.acento); if (a) l.acento = a; else errores.push(`«lejos.acento» es uno de ${ACENTOS.join(', ')}.`) }
  if (x.cifra !== undefined) {
    if (obj(x.cifra) && typeof x.cifra.fuente === 'string' && FORMA_FUENTE.test(x.cifra.fuente)) l.cifra = { fuente: x.cifra.fuente,
      ...(texto(x.cifra.campo, 80) ? { campo: texto(x.cifra.campo, 80)! } : {}), ...(texto(x.cifra.unidad, 120) ? { unidad: texto(x.cifra.unidad, 120)! } : {}) }
    else errores.push('«lejos.cifra» debe ser { "fuente": "…", "campo"?: "…", "unidad"?: "…" }.')
  }
  if (x.frase !== undefined) { const f = texto(x.frase, 160); if (f) l.frase = f; else errores.push('«lejos.frase» debe ser texto corto.') }
  return { lejos: l }
}

/** Lo reservado para la v17: se valida la forma; lo que no cumple se descarta con su error. */
function reservado(x: Record<string, unknown>, errores: string[]): Reservado {
  const out: Reservado = {}
  if (x.tiempo !== undefined) {
    if (obj(x.tiempo) && x.tiempo.foto === 'diaria') out.tiempo = { foto: 'diaria', ...(texto(x.tiempo.desde, 10) ? { desde: texto(x.tiempo.desde, 10)! } : {}) }
    else errores.push('«tiempo» (reservado v17) debe ser { "foto": "diaria" }.')
  }
  if (x.simulacion !== undefined) {
    const p = obj(x.simulacion) && Array.isArray(x.simulacion.palancas) ? x.simulacion.palancas.filter(obj) : null
    if (p) out.simulacion = { palancas: p.filter(q => texto(q.id, 64) && texto(q.etiqueta, 120)).map(q => ({ id: texto(q.id, 64)!, etiqueta: texto(q.etiqueta, 120)!,
      ...(typeof q.fuente === 'string' && FORMA_FUENTE.test(q.fuente) ? { fuente: q.fuente } : {}),
      ...(typeof q.min === 'number' ? { min: q.min } : {}), ...(typeof q.max === 'number' ? { max: q.max } : {}), ...(typeof q.paso === 'number' ? { paso: q.paso } : {}) })) }
    else errores.push('«simulacion» (reservado v17) debe ser { "palancas": [...] }.')
  }
  if (x.submapa !== undefined) {
    if (obj(x.submapa) && (texto(x.submapa.pagina, 80) || texto(x.submapa.receta, 600)))
      out.submapa = { ...(texto(x.submapa.pagina, 80) ? { pagina: texto(x.submapa.pagina, 80)! } : {}), ...(texto(x.submapa.receta, 600) ? { receta: texto(x.submapa.receta, 600)! } : {}) }
    else errores.push('«submapa» (reservado v17) debe tener «pagina» o «receta».')
  }
  if (x.camaras !== undefined) {
    if (Array.isArray(x.camaras)) out.camaras = x.camaras.filter(obj).filter(c => texto(c.nombre, 80)).map(c => ({ nombre: texto(c.nombre, 80)!,
      ...(typeof c.zona === 'string' ? { zona: c.zona.slice(0, 200) } : obj(c.zona) && ['x', 'y', 'width', 'height'].every(k => typeof (c.zona as Record<string, unknown>)[k] === 'number') ? { zona: c.zona as { x: number; y: number; width: number; height: number } } : {}) }))
    else errores.push('«camaras» (reservado v17) debe ser una lista de { "nombre", "zona" }.')
  }
  if (x.voz !== undefined) {
    if (obj(x.voz) && Array.isArray(x.voz.nombres)) out.voz = { nombres: x.voz.nombres.filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(0, 12) }
    else errores.push('«voz» (reservado v17) debe ser { "nombres": [...] }.')
  }
  return out
}

/** Una caja en px lógicos de la isla. */
export interface Caja { x: number; y: number; w: number; h: number }

/**
 * La disposición: dónde va cada bloque, en px lógicos. `altoDefecto(tipo)` da las filas de un bloque sin `en`. Los bloques
 * sin `en` se apilan debajo del más bajo de los que sí lo tienen. El alto total sale de la última fila ocupada (o de
 * `receta.alto` si lo fija).
 */
export function maquetar(r: Receta, altoDefecto: (b: BloqueCrudo) => number): { cajas: Caja[]; ancho: number; alto: number } {
  const { columnas, fila, hueco, margen } = r.rejilla
  const util = r.ancho - 2 * margen
  const col = (util - (columnas - 1) * hueco) / columnas
  const celdaX = (c: number) => margen + c * (col + hueco)
  const celdaY = (f: number) => margen + f * (fila + hueco)
  const anchoDe = (n: number) => n * col + (n - 1) * hueco
  const altoDe = (n: number) => n * fila + (n - 1) * hueco
  let siguiente = 0
  for (const b of r.bloques) if (b.en) siguiente = Math.max(siguiente, b.en[1] + b.en[3])
  const cajas = r.bloques.map(b => {
    let celda = b.en
    if (!celda) { const h = Math.max(1, Math.round(altoDefecto(b))); celda = [0, siguiente, columnas, h]; siguiente += h }
    const [c, f, w, h] = celda
    const cc = Math.min(c, columnas - 1), ww = Math.max(1, Math.min(w, columnas - cc))
    return { x: celdaX(cc), y: celdaY(f), w: anchoDe(ww), h: altoDe(h) }
  })
  const fondo = cajas.reduce((m, k) => Math.max(m, k.y + k.h), 0) + margen
  return { cajas, ancho: r.ancho, alto: r.alto ?? Math.max(fondo, 2 * margen + fila) }
}

// ── Plantillas: texto con datos vivos ──

/** `{pulso:venta.cifra}` dentro de un texto: la fuente y el campo. */
const HUECO = /\{([a-z][a-z0-9-]{0,31}(?::[a-z0-9_-]{1,40})?)(?:\.([a-zA-Z0-9_.]{1,80}))?\}/g

/** Las fuentes que nombra un texto con huecos. */
export function fuentesDeTexto(t: string): string[] {
  const out = new Set<string>()
  for (const m of t.matchAll(HUECO)) if (FORMA_FUENTE.test(m[1])) out.add(m[1])
  return [...out]
}

export function campo(valor: unknown, ruta?: string | null): unknown {
  if (!ruta) return valor
  let v: unknown = valor
  for (const p of ruta.split('.')) { if (v == null || typeof v !== 'object') return null; v = (v as Record<string, unknown>)[p] }
  return v
}

/** El texto con sus huecos llenos; un hueco sin dato dice «sin dato» (nunca 0). `leer(fuente)` da {estado, valor}. */
export function llenar(t: string, leer: (fuente: string) => { estado: string; valor: unknown } | undefined, sinDato = 'sin dato'): string {
  return t.replace(HUECO, (_m, f: string, ruta?: string) => {
    const l = leer(f)
    if (!l || l.estado !== 'ok') return l?.estado === 'leyendo' ? '…' : l?.estado === 'oculto' ? '•••' : sinDato
    const v = campo(l.valor, ruta)
    if (v === null || v === undefined || v === '') return sinDato
    return typeof v === 'object' ? sinDato : String(v)
  })
}
