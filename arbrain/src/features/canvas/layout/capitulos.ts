/**
 * Canvas v4 — leer un lienzo por capítulos (6 oct 2026).
 *
 * Daniel, sobre «Acompañamiento Cerebro Artificial»: *"de izquierda a derecha entiendo cómo funciona, pero no me
 * encanta la experiencia de usuario"*. Un lienzo con marcos ya ES un relato: cada marco es un capítulo y el orden de
 * lectura es el de la página. Aquí vive lo PURO (se prueba sin navegador): qué es un capítulo, en qué orden se lee,
 * cómo se llama, dónde se para la cámara y por qué camino llega.
 *
 * Un capítulo es:
 *   · una SECCIÓN (`frame`) que no está dentro de otra, o
 *   · una ISLA: contenido suelto, fuera de toda sección, del tamaño de un capítulo. Existe porque los lienzos se
 *     arman por partes y no todas nacen con marco (en este, el Customer Journey firmado vive suelto entre dos
 *     secciones). Una isla chica (una nota, una flecha a medio camino) no es capítulo: no se anuncia en el índice.
 *
 * Sin secciones no hay capítulos: un lienzo sin marcos no declaró partes y adivinarlas sería inventar.
 *
 * Los TEMAS (13 nov 2026): si los elementos declaran `tema`, cada capítulo toma el que más se repite en lo que contiene
 * y `temasDe` los agrupa; el índice muestra pocos temas con nombre en vez de 32 números. Sin `tema`, todo igual que antes.
 */

import type { Camera, CanvasElement } from '../model/element'
import { visualBounds } from '../model/element'
import { fitBounds, type ChromeInsets, type Viewport } from '../render/viewport'
import { camaraEntre } from '../input/navegacion'
import { trMarca } from '@/shared/i18n'

export interface Caja { x: number; y: number; width: number; height: number }

export interface Capitulo {
  /** Estable mientras la página no cambie de forma: el id del marco o `isla:<id del primer elemento>`. */
  id: string
  titulo: string
  caja: Caja
  /** El tema al que pertenece (el `tema` que más se repite en lo que contiene); ausente si nada lo declara. */
  tema?: string
}

/** Un tema: varios capítulos seguidos bajo un nombre (13 nov 2026). `caps` son índices en la lista de capítulos. */
export interface Tema {
  nombre: string
  caps: number[]
  caja: Caja
}

/** Lo que no declara tema, en un lienzo que sí agrupa. */
export const SIN_TEMA = trMarca('Otros')

const CIRCULADOS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

const union = (cs: Caja[]): Caja => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of cs) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y)
    x1 = Math.max(x1, c.x + c.width); y1 = Math.max(y1, c.y + c.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

const centroDentro = (c: Caja, de: Caja) => {
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2
  return cx >= de.x && cx <= de.x + de.width && cy >= de.y && cy <= de.y + de.height
}

const cerca = (a: Caja, b: Caja, g: number) =>
  a.x - g <= b.x + b.width && b.x - g <= a.x + a.width && a.y - g <= b.y + b.height && b.y - g <= a.y + a.height

/**
 * El texto que la pizarra pone al crear un texto nuevo («Escribe aquí»). Si se queda así (o con una tecla de más, como
 * los «Escribe aquít» que Daniel dejó en Mi mapa), es un borrador de la mano, no contenido: no nombra ni forma capítulos.
 * El elemento no se toca; solo no cuenta para el relato.
 */
const MARCADOR = /^\s*escribe\s+aqu[ií]/iu
export const esMarcador = (e: CanvasElement) => e.type === 'text' && MARCADOR.test(e.text ?? '')

/** Cuenta para el relato lo que ocupa lugar: no los conectores (van entre partes), ni la tinta suelta, ni un borrador. */
const ocupa = (e: CanvasElement) => e.type !== 'frame' && e.type !== 'connector' && e.type !== 'ink' && !esMarcador(e)

interface Texto { id: string; texto: string; size: number; caja: Caja; humano: boolean }

/** Los textos de un elemento con su tamaño, en coordenadas de mundo (sin los borradores «Escribe aquí»). */
function textos(e: CanvasElement): Texto[] {
  const humano = e.autor === 'humano'
  if (e.type === 'text') return esMarcador(e) ? [] : [{ id: e.id, texto: e.text, size: e.style.size, caja: { x: e.x, y: e.y, width: e.width, height: e.height }, humano }]
  if (e.type === 'shape' && e.text?.length) {
    return e.text.filter(t => !MARCADOR.test(t.text ?? ''))
      .map(t => ({ id: e.id, texto: t.text, size: t.style.size, caja: { x: e.x + t.x, y: e.y + t.y, width: t.width, height: t.height }, humano }))
  }
  return []
}

/** «EL ACOMPAÑAMIENTO» se lee como «El acompañamiento»; lo que ya trae minúsculas se respeta. */
function frase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t !== t.toUpperCase()) return t
  const bajo = t.toLocaleLowerCase('es')
  return bajo.charAt(0).toLocaleUpperCase('es') + bajo.slice(1)
}

/** Un nombre se lee en una lista: hasta aquí cabe entero; más largo es una frase, no un nombre. */
const NOMBRE_CORTO = 40
const NOMBRE_MAX = 46

/**
 * ¿Sirve como nombre? Tres letras al menos (no «5», «$», «B» ni «−»), y no una cita («…» o "…"): las citas son el
 * contenido de la parte, no su nombre.
 */
const nombrable = (t: Texto) => {
  const s = t.texto.trim()
  return (s.match(/\p{L}/gu)?.length ?? 0) >= 3 && !/^[«"“'‘]/u.test(s)
}

/** Corta una frase larga en una palabra, con «…». */
function recortar(s: string): string {
  if (s.length <= NOMBRE_MAX) return s
  const corte = s.slice(0, NOMBRE_MAX).replace(/[\s,;:·—–-]+\S*$/u, '')
  return (corte.length >= 12 ? corte : s.slice(0, NOMBRE_MAX)).replace(/[\s,;:·]+$/u, '') + '…'
}

/**
 * El mejor nombre entre candidatos. El más grande manda; si comparte tamaño y renglón con otros (una fila de tarjetas
 * hermanas: «La competencia», «La estrategia»), se nombran juntos mientras quepan. Si el más grande es una frase larga,
 * gana el rótulo corto de la parte («LA META» sobre la meta escrita entera); si no hay rótulo, la frase recortada.
 */
function mejorNombre(cand: Texto[]): string | null {
  const propios = cand.filter(t => !t.humano)
  const lista = (propios.some(nombrable) ? propios : cand).filter(nombrable)
    .sort((a, b) => b.size - a.size || a.caja.y - b.caja.y || a.caja.x - b.caja.x)
  const top = lista[0]
  if (!top) return null
  const hermanos = lista.filter(t => Math.abs(t.size - top.size) <= top.size * 0.02 && Math.abs(t.caja.y - top.caja.y) < top.size * 0.6)
    .sort((a, b) => a.caja.x - b.caja.x)
  const nombres = [...new Set(hermanos.map(t => frase(t.texto)))].slice(0, 4)
  const junto = nombres.join(' · ')
  if (nombres.length > 1 && junto.length <= NOMBRE_MAX) return junto
  const uno = frase(top.texto)
  if (uno.length <= NOMBRE_CORTO) return uno
  // El rótulo es el corto que va más arriba (el kicker sobre la frase), no el más grande de los cortos.
  const rotulo = lista.filter(t => t.size >= top.size * 0.4 && frase(t.texto).length <= NOMBRE_CORTO)
    .sort((a, b) => a.caja.y - b.caja.y || b.size - a.size)[0]
  return rotulo ? frase(rotulo.texto) : recortar(uno)
}

export const SIN_TITULO = trMarca('Sin título')

/**
 * El nombre de un capítulo. Por orden de autoridad:
 *   1. el título que la sección declara;
 *   2. lo que sigue a un número circulado («· ③ EL ACOMPAÑAMIENTO»): el autor ya nombró la parte;
 *   3. el texto más grande de la parte que sirva de nombre (`mejorNombre`).
 * Qué textos son de la parte: con `miembros` (una isla), solo los suyos; si no, los de su cabeza (la franja de arriba
 * y su primer 40 %) que no sean `ajenos` (ids de otro capítulo: el titular del vecino no nombra a este). Si la cabeza
 * no da nombre, todo lo que contiene. Los borradores «Escribe aquí» nunca cuentan (13 nov 2026: el 11 de Mi norte se
 * llamaba así por un texto de Daniel que caía justo encima). Lo escrito a mano solo nombra si nada más lo hace.
 */
export function tituloDe(caja: Caja, els: CanvasElement[], declarado?: string, de?: { miembros?: Set<string>; ajenos?: Set<string> }): string {
  if (declarado?.trim()) return declarado.trim()
  const todos = (de?.miembros ? els.filter(e => de.miembros!.has(e.id)) : els).flatMap(textos).filter(t => t.texto.trim())
  const ajeno = (t: Texto) => !!de?.ajenos?.has(t.id)
  const franja = { x: caja.x, y: caja.y - 200, width: caja.width, height: 200 + caja.height * 0.4 }
  const cabeza = de?.miembros ? todos : todos.filter(t => centroDentro(t.caja, franja) && !ajeno(t))
  for (const t of [...cabeza].sort((a, b) => a.caja.y - b.caja.y)) {
    const m = new RegExp(`[${CIRCULADOS}]\\s+(\\p{L}[^·•|${CIRCULADOS}]{2,59})$`, 'u').exec(t.texto.trim())
    if (m) return frase(m[1])
  }
  return mejorNombre(cabeza)
    ?? (de?.miembros ? null : mejorNombre(todos.filter(t => centroDentro(t.caja, caja) && !ajeno(t))))
    ?? SIN_TITULO
}

/**
 * El orden de lectura: por renglones de arriba abajo y, dentro de cada renglón, de izquierda a derecha. Dos partes
 * van en el mismo renglón si se traslapan en alto al menos 40 % de la más baja; si no, la de arriba va primero.
 */
export function ordenDeLectura<T extends { caja: Caja }>(cs: T[]): T[] {
  const porArriba = [...cs].sort((a, b) => a.caja.y - b.caja.y)
  const renglones: T[][] = []
  for (const c of porArriba) {
    const r = renglones.find(rr => rr.some(o => {
      const traslape = Math.min(o.caja.y + o.caja.height, c.caja.y + c.caja.height) - Math.max(o.caja.y, c.caja.y)
      return traslape >= 0.4 * Math.min(o.caja.height, c.caja.height)
    }))
    if (r) r.push(c); else renglones.push([c])
  }
  return renglones.flatMap(r => r.sort((a, b) => a.caja.x - b.caja.x))
}

export function capitulosDe(els: CanvasElement[]): Capitulo[] {
  const marcos = els.filter((e): e is Extract<CanvasElement, { type: 'frame' }> => e.type === 'frame')
  if (marcos.length === 0) return []
  const cajaDe = (e: CanvasElement): Caja => visualBounds(e)
  // Solo los de primer nivel: una sección dentro de otra es un apartado, no un capítulo.
  const raiz = marcos.filter(m => !marcos.some(o => o !== m && o.width * o.height > m.width * m.height && centroDentro(cajaDe(m), cajaDe(o))))
  const caps: Array<Capitulo & { ids?: string[] }> = raiz.map(m => ({ id: m.id, titulo: '', caja: cajaDe(m) }))

  // Las islas: lo que queda fuera de toda sección, agrupado por cercanía. La distancia que une crece con el tamaño
  // de los capítulos (un hueco de 200 en un lienzo de marcos de 1300 es interlineado; en uno de 300, es otra parte).
  const tamTipico = [...raiz.map(m => Math.min(m.width, m.height))].sort((a, b) => a - b)[Math.floor(raiz.length / 2)]
  const hueco = Math.max(60, tamTipico * 0.2)
  const sueltos = els.filter(e => ocupa(e) && !raiz.some(m => centroDentro(cajaDe(e), cajaDe(m))))
  let islas = sueltos.map(e => ({ ids: [e.id], caja: cajaDe(e) }))
  for (let cambio = true; cambio;) {
    cambio = false
    const fuera: typeof islas = []
    for (const i of islas) {
      const j = fuera.find(o => cerca(o.caja, i.caja, hueco))
      if (j) { j.caja = union([j.caja, i.caja]); j.ids.push(...i.ids); cambio = true } else fuera.push(i)
    }
    islas = fuera
  }
  const areaTipica = [...raiz.map(m => m.width * m.height)].sort((a, b) => a - b)[Math.floor(raiz.length / 2)]
  for (const i of islas) {
    if (i.caja.width * i.caja.height < areaTipica * 0.15 || i.ids.length < 6) continue
    caps.push({ id: 'isla:' + [...i.ids].sort()[0], titulo: '', caja: i.caja, ids: i.ids })
  }
  const porId = new Map(marcos.map(m => [m.id, m]))
  // Lo que ya es de otro capítulo no nombra a una sección: los miembros de las islas y lo que cae en otra sección.
  const deIsla = new Set(caps.flatMap(c => c.ids ?? []))
  const enMarco = new Map(raiz.map(m => [m.id, new Set(els.filter(e => e !== m && centroDentro(cajaDe(e), cajaDe(m))).map(e => e.id))]))
  const nombrados = caps.map(c => {
    if (c.ids) return { ...c, titulo: tituloDe(c.caja, els, undefined, { miembros: new Set(c.ids) }) }
    const ajenos = new Set(deIsla)
    for (const [id, dentro] of enMarco) if (id !== c.id) for (const e of dentro) ajenos.add(e)
    return { ...c, titulo: tituloDe(c.caja, els, porId.get(c.id)?.title, { ajenos }) }
  })
  // Una sección dentro de una isla mayor es un detalle de esa parte (el recuadro «5» de una escala, la etiqueta de un
  // sensor): sigue siendo capítulo solo si tiene nombre propio y tamaño de parte (13 nov 2026).
  const islasCaps = nombrados.filter(c => c.ids)
  const finales = nombrados.filter(c => {
    if (c.ids) return true
    const area = c.caja.width * c.caja.height
    const enIsla = islasCaps.some(i => i.caja.width * i.caja.height > area && centroDentro(c.caja, i.caja))
    return !enIsla || (c.titulo !== SIN_TITULO && area >= areaTipica * 0.03)
  })
  if (finales.length < 2) return []
  const conTema = els.some(e => e.tema?.trim())
  return ordenDeLectura(finales).map(({ ids, ...c }) => {
    const cap: Capitulo = c
    if (!conTema) return cap
    // La sección declara el suyo; si no, manda lo que contiene (una isla, sus miembros; una sección, lo que cae dentro).
    const propio = porId.get(c.id)?.tema?.trim()
    const miembros = ids && new Set(ids)
    const dentro = miembros ? els.filter(e => miembros.has(e.id)) : els.filter(e => ocupa(e) && centroDentro(cajaDe(e), c.caja))
    const tema = propio || temaMayor(dentro)
    return tema ? { ...cap, tema } : cap
  })
}

/** El tema que más se repite (empate: el primero que apareció). */
function temaMayor(els: CanvasElement[]): string | undefined {
  const n = new Map<string, number>()
  for (const e of els) { const t = e.tema?.trim(); if (t) n.set(t, (n.get(t) ?? 0) + 1) }
  let mejor: string | undefined, max = 0
  for (const [t, k] of n) if (k > max) { mejor = t; max = k }
  return mejor
}

/**
 * Los temas del relato: los capítulos agrupados por su `tema`, en el orden en que aparece el primero de cada uno.
 * Dentro de un tema, los capítulos van en orden de lectura. Lo que no declara tema va al final, en «Otros».
 * Menos de dos temas no es agrupar: `[]`, y el índice vuelve a la tira de números.
 */
export function temasDe(caps: Capitulo[]): Tema[] {
  if (!caps.some(c => c.tema)) return []
  const porNombre = new Map<string, number[]>()
  const sueltos: number[] = []
  caps.forEach((c, i) => {
    if (!c.tema) { sueltos.push(i); return }
    const l = porNombre.get(c.tema)
    if (l) l.push(i); else porNombre.set(c.tema, [i])
  })
  if (sueltos.length) porNombre.set(SIN_TEMA, [...(porNombre.get(SIN_TEMA) ?? []), ...sueltos].sort((a, b) => a - b))
  if (porNombre.size < 2) return []
  return [...porNombre].map(([nombre, idx]) => ({ nombre, caps: idx, caja: union(idx.map(i => caps[i].caja)) }))
}

/** El tema de un capítulo (índice en `temas`), o null. */
export const temaDeCapitulo = (temas: Tema[], i: number): number | null => {
  const k = temas.findIndex(t => t.caps.includes(i))
  return k < 0 ? null : k
}

/** Lo que se ve de una vista completa: todos los capítulos (no lo que haya perdido en las orillas). */
export const cajaDeTodo = (caps: Capitulo[]): Caja => union(caps.map(c => c.caja))

/**
 * Dónde se para la cámara en un capítulo. Se LEE: a lo ancho del capítulo (sin pasar de mostrar 40 % de su alto), desde su cabeza. Encuadrarlo entero
 * hacía que un marco alto (1320 × 4500) quedara al 17 %, ilegible, con la pantalla vacía a los lados. Si el
 * capítulo cabe completo a ese zoom, se centra; si no, la cámara se queda en la cabeza y lo demás se baja con la
 * rueda o con ↓.
 */
export function camaraDeCapitulo(c: Caja, vp: Viewport, chrome: ChromeInsets, aire = 40): Camera {
  const top = chrome.top ?? 0, bottom = chrome.bottom ?? 0
  const altoUtil = Math.max(1, vp.height - top - bottom - aire * 2)
  // En pantalla completa, a lo ancho dejaba un marco de 1320 al 88 %: solo se veía la cabeza. Se muestra siempre
  // al menos el 40 % de su alto; el ancho manda en pantallas angostas.
  const anchoFit = fitBounds({ ...c, height: 1 }, vp, aire, chrome)
  const zoom = Math.min(anchoFit.zoom, (altoUtil / c.height) * 2.5)
  const base = { ...anchoFit, zoom, x: c.x + c.width / 2 - ((chrome.left ?? 0) - (chrome.right ?? 0)) / 2 / zoom }
  const altoVisible = altoUtil / zoom
  if (c.height <= altoVisible) return fitBounds(c, vp, aire, chrome)
  // La cabeza del capítulo, `aire` debajo del chrome de arriba.
  const y = c.y - aire / base.zoom + (vp.height / 2 - top) / base.zoom
  return { ...base, y }
}

/** Un paso de lectura dentro del capítulo (↓ / ↑): 80 % de la pantalla, sin salirse de él. */
export function bajarEnCapitulo(cam: Camera, c: Caja, vp: Viewport, dir: 1 | -1, chrome: ChromeInsets, aire = 40): Camera {
  const medio = vp.height / 2 / cam.zoom
  const minY = c.y - aire / cam.zoom + medio - (chrome.top ?? 0) / cam.zoom
  const maxY = Math.max(minY, c.y + c.height + aire / cam.zoom - medio + (chrome.bottom ?? 0) / cam.zoom)
  const y = Math.min(maxY, Math.max(minY, cam.y + dir * 0.8 * vp.height / cam.zoom))
  return { ...cam, y }
}

/**
 * ¿En qué capítulo está mirando la cámara? El que contiene el centro; si ninguno, null. Un capítulo puede caer dentro
 * de otro (una isla grande que rodea una sección): gana el más chico, el que de verdad se está leyendo. Con `actual`,
 * si la cámara sigue dentro de él, se queda ese (13 nov 2026: al volar a «Acompañamiento» la barra saltaba a la isla
 * «La oferta» que lo envuelve).
 */
export function capituloBajo(cam: Camera, caps: Capitulo[], actual?: number | null): number | null {
  const dentro = (c: Capitulo) => cam.x >= c.caja.x && cam.x <= c.caja.x + c.caja.width && cam.y >= c.caja.y && cam.y <= c.caja.y + c.caja.height
  if (actual != null && caps[actual] && dentro(caps[actual])) return actual
  let mejor: number | null = null
  caps.forEach((c, i) => {
    if (dentro(c) && (mejor == null || c.caja.width * c.caja.height < caps[mejor].caja.width * caps[mejor].caja.height)) mejor = i
  })
  return mejor
}

/**
 * El vuelo entre dos capítulos. Un paneo recto a zoom de lectura barre el contenido de lado a toda velocidad y
 * el ojo se pierde. Aquí la cámara se ALEJA un poco a medio camino, lo justo para que salir y llegar se vean en
 * el mismo cuadro, y vuelve a acercarse al destino: se entiende de dónde viene y a dónde va. Si el destino está a
 * menos de media pantalla, es el camino de siempre (`camaraEntre`).
 */
export function vuelo(a: Camera, b: Camera, t: number, anchoPantalla: number): Camera {
  if (t <= 0) return a
  if (t >= 1) return b
  const zMin = Math.min(a.zoom, b.zoom)
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const enPantallas = (d * zMin) / Math.max(1, anchoPantalla)
  if (enPantallas < 0.5) return camaraEntre(a, b, t)
  // Al punto más alto, salida y llegada caben en ~1.4 pantallas.
  const zAlto = Math.min(zMin, (anchoPantalla * 1.4) / (d + anchoPantalla / zMin))
  const la = Math.log(a.zoom), lb = Math.log(b.zoom)
  const hondo = Math.max(0, (la + lb) / 2 - Math.log(zAlto))
  const zoom = Math.exp(la + (lb - la) * t - hondo * Math.sin(Math.PI * t))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom }
}

/** Cuánto dura un vuelo: con calma, y más mientras más lejos (con techo: nadie espera un segundo y medio). */
export function duracionDeVuelo(a: Camera, b: Camera, anchoPantalla: number): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y) * Math.min(a.zoom, b.zoom) / Math.max(1, anchoPantalla)
  return Math.round(Math.min(1100, 560 + d * 160))
}
