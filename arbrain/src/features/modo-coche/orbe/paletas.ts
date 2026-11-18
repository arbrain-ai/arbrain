/**
 * Colores del Orbe del modo coche. Cada quien escoge su paleta (o pone sus dos colores) y se guarda en este navegador.
 *
 * Una paleta = un color PRINCIPAL y un ACENTO, cada uno en tres tonos (claro, medio, hondo). Son las mismas paletas del
 * orbe de SFlow con voz, para que el orbe de la barra y el de Arbrain se vean de la misma familia. Escucha (blanco luna)
 * y error (carmesí) son iguales en todas: así el estado se reconoce con cualquier color.
 */
export type RGB = readonly [number, number, number]
export type Tonos = readonly [claro: RGB, medio: RGB, hondo: RGB]
export type Paleta = { id: string; nombre: string; principal: Tonos; acento: Tonos }

export const PALETAS: readonly Paleta[] = [
  { id: 'grafito', nombre: 'Grafito y oro',
    principal: [[244, 247, 252], [190, 198, 212], [112, 120, 136]], acento: [[255, 228, 160], [226, 176, 62], [150, 108, 22]] },
  { id: 'esmeralda', nombre: 'Esmeralda y lila',
    principal: [[110, 240, 200], [16, 185, 129], [8, 110, 84]], acento: [[214, 200, 255], [160, 132, 240], [98, 70, 186]] },
  { id: 'violeta', nombre: 'Violeta y rosa',
    principal: [[215, 198, 255], [160, 118, 250], [96, 60, 190]], acento: [[255, 176, 214], [236, 72, 153], [160, 30, 95]] },
]
export const PALETA_INICIAL = 'grafito'
export const LUNA: Tonos = [[246, 248, 252], [210, 217, 228], [154, 162, 176]]
export const CARMESI: Tonos = [[250, 160, 178], [200, 30, 60], [148, 18, 44]]
/** El fondo del Orbe: gris casi negro, sobre el que flota cualquier paleta. */
export const FONDO: RGB = [18, 18, 22]

const CLAVE = 'arbrain-orbe-paleta'
const CLAVE_PROPIOS = 'arbrain-orbe-colores'
export const EVENTO_PALETA = 'arbrain:orbe-paleta'

/** «#RRGGBB» → RGB, o null. */
export function deHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Tres tonos a partir de un color: el claro se acerca al blanco, el hondo al negro. */
export function tonosDe(c: RGB): Tonos {
  const hacia = (a: RGB, b: number, t: number): RGB => [0, 1, 2].map(i => Math.round(a[i] + (b - a[i]) * t)) as unknown as RGB
  return [hacia(c, 255, 0.45), c, hacia(c, 0, 0.4)]
}

/** Paleta con los dos colores de la persona («Mis colores»). */
export function paletaPropia(principal: string, acento: string): Paleta | null {
  const p = deHex(principal), a = deHex(acento)
  return p && a ? { id: 'propia', nombre: 'Mis colores', principal: tonosDe(p), acento: tonosDe(a) } : null
}

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave) } catch { return null }
}

/** La paleta guardada en este navegador (o la inicial). */
export function paletaGuardada(): Paleta {
  const id = leer(CLAVE)
  if (id === 'propia') {
    try {
      const j = JSON.parse(leer(CLAVE_PROPIOS) ?? '{}') as { principal?: string; acento?: string }
      const p = paletaPropia(j.principal ?? '', j.acento ?? '')
      if (p) return p
    } catch { /* colores rotos: la inicial */ }
  }
  return PALETAS.find(p => p.id === id) ?? PALETAS.find(p => p.id === PALETA_INICIAL)!
}

/** Guarda la paleta (o «propia» con sus dos colores) y avisa al Orbe abierto. */
export function guardarPaleta(id: string, propios?: { principal: string; acento: string }): void {
  try {
    localStorage.setItem(CLAVE, id)
    if (id === 'propia' && propios) localStorage.setItem(CLAVE_PROPIOS, JSON.stringify(propios))
  } catch { /* modo privado: dura lo que dure la pestaña */ }
  try { window.dispatchEvent(new Event(EVENTO_PALETA)) } catch { /* sin ventana */ }
}

/** La siguiente paleta de la lista (el botón de colores del modo coche las recorre). */
export function siguientePaleta(actual: string): string {
  const ids = PALETAS.map(p => p.id)
  const tienePropia = !!leer(CLAVE_PROPIOS)
  if (tienePropia) ids.push('propia')
  const i = ids.indexOf(actual)
  return ids[(i + 1) % ids.length]
}
