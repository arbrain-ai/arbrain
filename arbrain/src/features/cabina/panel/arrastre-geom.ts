/**
 * Geometría del arrastre de pestañas entre ventanas (1 oct 2026). Pura, sin DOM: se prueba sola
 * (tests/panel/arrastre-geom.test.ts).
 *
 * Dos sistemas de coordenadas: «cliente» (px CSS dentro de una ventana: clientX, getBoundingClientRect)
 * y «pantalla» (screenX/screenY, compartido por todas las ventanas). El que suelta una pestaña solo
 * conoce el punto de pantalla; la ventana principal lo traduce a su propio panel.
 */

export interface Punto { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
/** Lo que una ventana sabe de sí misma (window.screenX, outerWidth…). */
export interface GeomVentana { screenX: number; screenY: number; outerWidth: number; outerHeight: number; innerWidth: number; innerHeight: number }

/** Píxeles que hay que mover antes de que un clic pase a ser arrastre. */
export const UMBRAL = 6

export const pasoElUmbral = (de: Punto, a: Punto, umbral = UMBRAL) => Math.hypot(a.x - de.x, a.y - de.y) >= umbral

export const puntoEnRect = (p: Punto, r: Rect) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

/** ¿El punto de cliente cae dentro de la propia ventana? (Fuera = el puntero salió de ella.) */
export const dentroDeLaVentana = (p: Punto, g: Pick<GeomVentana, 'innerWidth' | 'innerHeight'>) => p.x >= 0 && p.y >= 0 && p.x < g.innerWidth && p.y < g.innerHeight

/**
 * Un rectángulo de cliente, en pantalla. `screenX/outerWidth` van en puntos de pantalla y
 * `innerWidth/getBoundingClientRect` en px CSS; si la página tiene zoom, su cociente es la escala.
 * El marco (barra de título) solo ocupa arriba, así que el origen vertical es screenY + (outer − inner·escala).
 */
export function rectEnPantalla(g: GeomVentana, r: Rect): Rect {
  const k = g.innerWidth > 0 && g.outerWidth > 0 ? g.outerWidth / g.innerWidth : 1
  const x0 = g.screenX + (g.outerWidth - g.innerWidth * k) / 2
  const y0 = g.screenY + (g.outerHeight - g.innerHeight * k)
  return { left: x0 + r.left * k, top: y0 + r.top * k, right: x0 + r.right * k, bottom: y0 + r.bottom * k }
}

/** ¿El punto de pantalla cae sobre el panel de ESTA ventana (cuyo rectángulo de cliente es `panel`)? */
export const puntoEnElPanel = (pantalla: Punto, g: GeomVentana, panel: Rect) => puntoEnRect(pantalla, rectEnPantalla(g, panel))

/**
 * Esquina de una ventana nueva para que el cursor quede sobre su cabecera, como al soltar una
 * pestaña de Chrome. Rust usa los mismos desvíos (ventanas.rs: `DESVIO_X`, `DESVIO_Y`).
 */
export const DESVIO_X = 90
export const DESVIO_Y = 52
export const esquinaDeVentana = (cursor: Punto): Punto => ({ x: Math.round(cursor.x - DESVIO_X), y: Math.round(cursor.y - DESVIO_Y) })

// ── Reordenar dentro de la tira (3 oct 2026) ──

/**
 * Dónde caería la pestaña arrastrada: su posición en la lista SIN ella. Cuenta las demás pestañas cuyo
 * centro quedó a la izquierda del cursor (como Chrome: pasar la mitad de la vecina la aparta).
 */
export function indiceDeInsercion(centros: number[], x: number, desde: number) {
  return centros.filter((c, i) => i !== desde && c < x).length
}

/**
 * Cuánto se corre cada pestaña (px) para mostrar el orden nuevo antes de soltar: las vecinas que quedan
 * del otro lado se apartan el ancho de la arrastrada; la arrastrada va al hueco que dejaron.
 */
export function desplazamientos(cajas: { left: number; width: number }[], desde: number, destino: number): number[] {
  const n = cajas.length
  if (desde < 0 || desde >= n) return cajas.map(() => 0)
  const orden = cajas.map((_, i) => i).filter(i => i !== desde)
  orden.splice(Math.max(0, Math.min(destino, orden.length)), 0, desde)
  // Posición final de cada pestaña: se apilan desde el borde izquierdo de la primera, con el hueco original entre ellas.
  const hueco = n > 1 ? Math.max(0, cajas[1].left - (cajas[0].left + cajas[0].width)) : 0
  const final: number[] = new Array(n)
  let x = cajas[0].left
  for (const i of orden) { final[i] = x; x += cajas[i].width + hueco }
  return cajas.map((c, i) => Math.round(final[i] - c.left))
}

// ── Soltar sobre OTRA ventana (5 oct 2026) ──

/**
 * Lo que una ventana dice de sí misma cuando empieza un arrastre, todo en coordenadas de PANTALLA:
 * su área (soltar ahí la recibe), su tira y el centro de cada pestaña de la tira (soltar sobre la tira
 * la inserta en ese lugar). `foco`: cuándo la usó Daniel por última vez; si dos se enciman, gana la de
 * foco más reciente (la que suele quedar encima).
 */
export interface Blanco { ventana: string; area: Rect; tira: Rect | null; pestanas: PestanaEnBlanco[]; foco: number }
/** `izquierda` y `ancho` (pantalla) dicen dónde aterriza el fantasma; una ventana con la web de antes no los manda. */
export interface PestanaEnBlanco { clave: string; centro: number; anclada?: boolean; izquierda?: number; ancho?: number }

/** Holgura vertical de la tira: un arrastre algo torcido sigue apuntando a la tira. */
export const HOLGURA_TIRA = 18

/** La ventana que recibe un punto de pantalla (la de foco más reciente si se enciman), o null. */
export function blancoBajo(p: Punto, blancos: Blanco[]): Blanco | null {
  return blancos.filter(d => puntoEnRect(p, d.area)).sort((a, b) => b.foco - a.foco)[0] ?? null
}

export const sobreTira = (p: Punto, d: Blanco) => !!d.tira && p.y >= d.tira.top - HOLGURA_TIRA && p.y <= d.tira.bottom + HOLGURA_TIRA && p.x >= d.area.left && p.x <= d.area.right

/** Dónde quedaría la pestaña en la tira de esa ventana (sin contarse a sí misma): sobre la tira, por el cursor; en el resto, al final. */
export function indiceEnBlanco(p: Punto, d: Blanco, clave: string) {
  const otras = d.pestanas.filter(t => t.clave !== clave)
  return sobreTira(p, d) ? otras.filter(t => t.centro < p.x).length : otras.length
}

// ── El fantasma que cruza monitores (5 oct 2026) ──

/**
 * Lo que pinta la ventana fantasma (VentanaFantasma.tsx), mandado por la ventana de donde sale la pestaña.
 * `modo`: 'ventana' = soltar aquí abre una ventana nueva (se ve esa ventana, translúcida, con la vista viva);
 * 'pestana' = soltar aquí la lleva a otra ventana (solo la pestaña); null = el fantasma no se ve.
 * `agarre`: dónde se tomó la pestaña, en px de pantalla desde su esquina. `ancho`/`alto`: la ventana que nacería.
 */
export type ModoFantasma = 'ventana' | 'pestana'
export interface EstadoFantasma { clave: string; modo: ModoFantasma | null; agarre: Punto; ancho: number; alto: number }

/** Margen transparente alrededor del marco del fantasma: cabe su sombra y una pestaña tomada por la derecha no se corta. */
export const MARGEN_FANTASMA = 48
/** La ventana nueva: barra de título de macOS y cabecera del panel (64 px, la tira centrada; Ventana.tsx). */
export const BARRA_TITULO = 28
export const ALTO_CABECERA = 64
export const ALTO_PESTANA = 30
export const IZQ_TIRA = 10

/** Esquina de la ventana fantasma: su marco coincide con la ventana que nacería al soltar aquí (esquinaDeVentana). */
export const esquinaDelFantasma = (cursor: Punto): Punto => {
  const e = esquinaDeVentana(cursor)
  return { x: e.x - MARGEN_FANTASMA, y: e.y - MARGEN_FANTASMA }
}

/**
 * Dónde se pinta la pestaña DENTRO del fantasma. Sola (modo 'pestana'), exactamente donde se tomó: bajo el
 * cursor. En 'ventana', en su lugar de la tira de la ventana nueva, como la pestaña que se acomoda en la
 * cabecera de la ventana que Chrome arrastra.
 */
export function pestanaEnFantasma(e: Pick<EstadoFantasma, 'modo' | 'agarre'>): Punto {
  if (e.modo === 'ventana') return { x: MARGEN_FANTASMA + IZQ_TIRA, y: MARGEN_FANTASMA + BARRA_TITULO + (ALTO_CABECERA - ALTO_PESTANA) / 2 }
  return { x: MARGEN_FANTASMA + DESVIO_X - e.agarre.x, y: MARGEN_FANTASMA + DESVIO_Y - e.agarre.y }
}

/**
 * El hueco que la otra ventana abrió en su tira para la pestaña que cae en `indice`, en pantalla: la esquina
 * donde aterriza. Las de `indice` en adelante se corrieron a la derecha, así que el hueco empieza donde estaba
 * la de `indice` (o justo después de la última). null si el blanco no dice dónde están sus pestañas.
 */
export function ranuraEnBlanco(d: Blanco, indice: number, clave: string, altoPestana = ALTO_PESTANA): Punto | null {
  if (!d.tira) return null
  const otras = d.pestanas.filter(t => t.clave !== clave)
  const y = Math.round((d.tira.top + d.tira.bottom) / 2 - altoPestana / 2)
  const i = Math.max(0, Math.min(indice, otras.length))
  if (i < otras.length) return otras[i].izquierda == null ? null : { x: Math.round(otras[i].izquierda!), y }
  const u = otras[otras.length - 1]
  if (!u) return { x: Math.round(d.tira.left), y }
  return u.izquierda == null || u.ancho == null ? null : { x: Math.round(u.izquierda + u.ancho + 2), y }
}

/** Curva del aterrizaje (rápida al salir, suave al llegar). */
export const suavizar = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
export const interpolar = (a: Punto, b: Punto, t: number): Punto => ({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) })

// ── Hueco, imán y resorte (6 oct 2026, «como CapCut») ──

/** La ranura de la pestaña arrastrada en SU tira: donde quedará (px de cliente), con su ancho real. */
export function ranuraEnTira(cajas: { left: number; width: number; top?: number }[], desde: number, destino: number): { left: number; width: number; top: number } | null {
  if (desde < 0 || desde >= cajas.length) return null
  const dx = desplazamientos(cajas, desde, destino)
  return { left: cajas[desde].left + dx[desde], width: cajas[desde].width, top: cajas[desde].top ?? 0 }
}

/** Radio del imán: a esta distancia (px) de la ranura el fantasma empieza a ser atraído. */
export const RADIO_IMAN = 28

/**
 * El imán: `esquina` es donde el cursor llevaría la esquina de la pestaña; `ranura`, la esquina de su hueco.
 * Dentro del radio la pestaña se atrae (fuerza 0 en el borde, 1 desde la mitad del radio: alineada del todo, con curva suave);
 * fuera, sigue al cursor. Continuo: sin saltos al entrar ni salir.
 */
export function imanDeRanura(esquina: Punto, ranura: Punto | null, radio = RADIO_IMAN): { pos: Punto; fuerza: number; atrapada: boolean } {
  if (!ranura) return { pos: esquina, fuerza: 0, atrapada: false }
  const d = Math.hypot(esquina.x - ranura.x, esquina.y - ranura.y)
  if (d >= radio) return { pos: esquina, fuerza: 0, atrapada: false }
  const t = Math.min(1, 2 * (1 - d / radio)), fuerza = t * t * (3 - 2 * t) // suave en los dos extremos: sin tirón al entrar ni al alinearse
  return { pos: { x: esquina.x + (ranura.x - esquina.x) * fuerza, y: esquina.y + (ranura.y - esquina.y) * fuerza }, fuerza, atrapada: true }
}

/** Duración del resorte con el que las vecinas se deslizan y la pestaña vuela a su lugar. */
export const RESORTE_MS = 200

/**
 * Resorte subamortiguado normalizado (0→1 en t∈[0,1], rebasa ~1.5 %): sus muestras como `linear()` de CSS,
 * para `transition`/WAAPI. panel.module.css lleva el mismo texto (lo vigila un test).
 */
export function resorteLinear(muestras = 20, zeta = 0.8, asentado = 5): string {
  const w = asentado / zeta, wd = w * Math.sqrt(1 - zeta * zeta)
  const x = (t: number) => 1 - Math.exp(-asentado * t) * (Math.cos(wd * t) + (asentado / wd) * Math.sin(wd * t))
  const v: string[] = []
  for (let i = 0; i <= muestras; i++) v.push(i === muestras ? '1' : String(Math.round(x(i / muestras) * 1000) / 1000))
  return `linear(${v.join(', ')})`
}
export const RESORTE_CSS = resorteLinear()
