// Contraste de los eventos del calendario (3 oct 2026). Daniel vio texto blanco sobre fondos pastel en
// modo claro: el color del texto no se elegía, se heredaba. Aquí se elige y se MIDE (WCAG 2.x).
// Función pura, sin DOM: la usan las vistas (vía `estiloEvento`) y las pruebas recorren toda la paleta.
// Client-safe.

export type Tema = 'claro' | 'oscuro'

/** Texto normal: 4.5:1. Texto grande (≥ 18.66 px negrita): 3:1. Componentes gráficos (barra lateral): 3:1. */
export const AA_TEXTO = 4.5
export const AA_GRANDE = 3
export const AA_GRAFICO = 3

/** Tokens de globals.css: superficies sobre las que se apoya un evento y el texto de cada tema. */
export const TEMAS = {
  claro: { fondo: '#f4f4f5', tarjeta: '#ffffff', texto: '#0f172a' },
  oscuro: { fondo: '#09090b', tarjeta: '#16161c', texto: '#f7f8f8' },
} as const

/** Cuánto color del calendario entra en el relleno (el resto es la superficie). Antes: 23 % fijo. */
const TINTE: Record<Tema, number> = { claro: 0.3, oscuro: 0.3 }

/** Paleta de colores con nombre de Todoist (los proyectos traen el nombre, no el hex). */
export const TODOIST: Record<string, string> = {
  berry_red: '#b8255f', red: '#db4035', orange: '#ff9933', yellow: '#fad000', olive_green: '#afb83b', lime_green: '#7ecc49',
  green: '#299438', mint_green: '#6accbc', teal: '#158fad', sky_blue: '#14aaf5', light_blue: '#96c3eb', blue: '#4073ff',
  grape: '#884dff', violet: '#af38eb', lavender: '#eb96eb', magenta: '#e05194', salmon: '#ff8d85', charcoal: '#808080',
  grey: '#b8b8b8', taupe: '#ccac93',
}

/** Neutro para un color ausente o ilegible (mismo slate que `calendarColorFor`). */
export const NEUTRO = '#64748b'

type RGB = [number, number, number]

export function aRgb(color: string | null | undefined): RGB {
  const c = (color ?? '').trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c)?.[1] ?? (TODOIST[c] ? TODOIST[c].slice(1) : null) ?? NEUTRO.slice(1)
  const h = hex.length === 3 ? [...hex].map(x => x + x).join('') : hex
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as RGB
}
export const aHex = ([r, g, b]: RGB) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** Luminancia relativa WCAG. */
export function luminancia(color: string | RGB): number {
  const [r, g, b] = (typeof color === 'string' ? aRgb(color) : color).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Razón de contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** `a` con proporción `t` sobre `b`. */
export function mezcla(a: string, b: string, t: number): string {
  const [p, q] = [aRgb(a), aRgb(b)]
  return aHex(p.map((v, i) => v * t + q[i] * (1 - t)) as RGB)
}

export interface ColorEvento {
  /** Relleno del bloque. */ fondo: string
  /** Título. */ texto: string
  /** Hora y metadatos (más pequeños, más tenues, también ≥ 4.5:1). */ meta: string
  /** Barra lateral: el color del calendario, ajustado de tono solo si no se distingue (≥ 3:1). */ acento: string
}

/**
 * Colores de un evento para un tema. `base` es la superficie sobre la que se apoya (por defecto el fondo del tema).
 * Conserva la identidad: el relleno SIGUE siendo el color del calendario en tinte; lo que se ajusta es cuánto
 * (si un tinte no deja leer el texto, se aclara) y el tono del acento (si se confunde con la superficie).
 */
export function colorEvento(color: string | null | undefined, tema: Tema, base: string = TEMAS[tema].fondo): ColorEvento {
  const origen = aHex(aRgb(color))
  const texto = TEMAS[tema].texto
  let t = TINTE[tema], fondo = mezcla(origen, base, t)
  while (t > 0 && contraste(texto, fondo) < AA_TEXTO) { t = Math.max(0, t - 0.02); fondo = mezcla(origen, base, t) }
  let p = 0.78, meta = mezcla(texto, fondo, p)
  while (p < 1 && contraste(meta, fondo) < AA_TEXTO) { p = Math.min(1, p + 0.03); meta = mezcla(texto, fondo, p) }
  // Acento: se acerca al texto (oscurece en claro, aclara en oscuro) hasta separarse 3:1 de la superficie.
  let a = 0, acento = origen
  while (a < 1 && contraste(acento, base) < AA_GRAFICO) { a = Math.min(1, a + 0.05); acento = mezcla(texto, origen, a) }
  return { fondo, texto, meta, acento }
}

/** Variables CSS de un evento para AMBOS temas; `.ev-color` (globals.css) elige las del tema activo. */
export function estiloEvento(color: string | null | undefined): Record<string, string> {
  const c = colorEvento(color, 'claro'), o = colorEvento(color, 'oscuro')
  return {
    '--ev-bg-l': c.fondo, '--ev-fg-l': c.texto, '--ev-meta-l': c.meta, '--ev-ac-l': c.acento,
    '--ev-bg-d': o.fondo, '--ev-fg-d': o.texto, '--ev-meta-d': o.meta, '--ev-ac-d': o.acento,
  }
}

/** Los 11 colores de evento de Google Calendar (colorId 1-11, `colors.get`). */
export const GOOGLE_EVENTO: Record<string, string> = {
  '1 Lavanda': '#a4bdfc', '2 Salvia': '#7ae7bf', '3 Uva': '#dbadff', '4 Flamenco': '#ff887c', '5 Plátano': '#fbd75b', '6 Mandarina': '#ffb878',
  '7 Pavo real': '#46d6db', '8 Grafito': '#e1e1e1', '9 Arándano': '#5484ed', '10 Albahaca': '#51b749', '11 Tomate': '#dc2127',
}
/** Los 24 colores de calendario de Google (`colors.get`, calendar). */
export const GOOGLE_CALENDARIO: string[] = [
  '#ac725e', '#d06b64', '#f83a22', '#fa573c', '#ff7537', '#ffad46', '#42d692', '#16a765', '#7bd148', '#b3dc6c', '#fbe983', '#fad165',
  '#92e1c0', '#9fe1e7', '#9fc6e7', '#4986e7', '#9a9cff', '#b99aff', '#c2c2c2', '#cabdbf', '#cca6ac', '#f691b2', '#cd74e6', '#a47ae2',
]
