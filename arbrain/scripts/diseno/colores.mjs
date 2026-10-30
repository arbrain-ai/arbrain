// Lenguaje unificado (27 oct 2026): utilidades compartidas por el migrador y el detector de colores sueltos.
// Un color «suelto» es un literal (#hex, rgb(), rgba(), white/black) que NO es el respaldo de un token del lenguaje
// (`var(--l-…, literal)` o `rgba(var(--l-…-rgb, r, g, b), a)`). El respaldo es el valor congelado del estilo actual:
// el estilo unificado lo decide `src/app/lenguaje.css`.

/** Superficies migradas (rutas relativas a arbrain/). */
export const SUPERFICIES = [
  'src/app/globals.css',
  'src/features/chat',
  'src/features/cabina',
  'src/features/perro',
  'src/features/casa',
  'src/features/calendar',
  'src/features/planning',
  'src/features/salud',
  'src/features/finances',
  'src/features/cohorte',
  'src/features/live',
  'src/features/rutinas',
  'src/shared/components',
]

/**
 * Escenas físicas: los colores pintan objetos reales (la casa en 3D, el cuerpo del perro, la vista en primera persona),
 * no interfaz. Quedan fuera del lenguaje a propósito y se listan para que el detector no los cuente.
 */
export const ESCENAS = [
  'src/features/casa/primera-persona/complemento.tsx', // la casa vista por el perro, en three.js (su hoja .css sí es interfaz)
  'src/features/casa/primera-persona/filos.ts',
  'src/features/casa/dispositivos/escena',
  'src/features/perro/cuerpo',
  'src/features/perro/modelo',
  'src/features/perro/Mapa.tsx',              // mapa del LiDAR en <canvas>
  'src/features/casa/motor/',                 // casa en three.js
  'src/features/casa/dispositivos/modelo.ts', // color real de cada foco (escenas de luz de la casa)
  'src/features/casa/dispositivos/complemento.tsx',
  'src/features/casa/dispositivos/Planta.tsx',
  'src/features/casa/dispositivos/MiniMapa.tsx',
  'src/features/casa/dispositivos/tarjetas.tsx', // ilustraciones SVG de cada aparato (vidrio, latón, carcasa)
  'src/features/casa/dispositivos/Ficha.tsx',
  'src/features/chat/components/LevyFace.tsx', // la cara de Levy (arte)
]

/**
 * Paletas de dato con nombre (no interfaz): las consume una librería o un cálculo que exige hex (Google Calendar colorId,
 * FullCalendar, <input type=color>, xterm, Mermaid, pdf.js, canvas, contraste por luminancia). Viven declaradas en su
 * módulo y el detector no las cuenta.
 */
export const PALETAS_DATO = [
  'src/features/finances/lib/financeColors.ts',   // color por cuenta y categoría (gráficas de Finanzas)
  'src/features/planning/categorias.ts',          // categorías del día, atadas al colorId de Google Calendar
  'src/features/planning/drip.ts',                // cuadrantes DRIP
  'src/features/planning/secciones.ts',
  'src/features/calendar/hooks/useCronCalendarLayer.ts',
  'src/features/calendar/hooks/useCalendarCommandCenter.ts',
  'src/features/calendar/components/CalendarCommandCenter.tsx', // FullCalendar y <input type=color>
  'src/features/chat/components/IndicadorConversacion.tsx',     // estrellas de conversación (SVG con hex)
  'src/features/cabina/panel/TerminalViva.tsx',   // paleta ANSI de xterm
  'src/features/cabina/terminal/PtyPanel.tsx',    // paleta ANSI de xterm
  'src/features/chat/components/MermaidDiagram.tsx', // tema de Mermaid
  'src/features/cabina/vistas/visor/VisorPdf.tsx', // fondo de página de pdf.js
  'src/features/chat/lib/image-prepare.ts',       // fondo blanco del JPEG en canvas
]

/** Bloques de globals.css que YA son tokens (definiciones del sistema actual): no se migran ni cuentan. */
export const BLOQUES_TOKEN = [':root', '.dark', '@theme inline', '@theme']

export const RE_COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*[\d.]+%?\s*)?\)|rgba?\(\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}\s*(?:\/\s*[\d.]+%?\s*)?\)|(?<![\w-])(?:white|black)(?![\w-])/g

/** Quita del texto los literales que ya son respaldo de un token del lenguaje, para no contarlos ni re-migrarlos. */
export function enmascarar(valor) {
  return valor
    .replace(/var\(--l-[\w-]+,\s*(?:var\(--[\w-]+,\s*)?(?:#[0-9a-fA-F]{3,8}|rgba?\([^()]*\)|white|black)\s*\)?\s*\)/g, m => '¤'.repeat(m.length))
    .replace(/rgba?\(var\(--l-[\w-]+-rgb,\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}\)\s*(?:,\s*[\d.]+%?\s*)?\)/g, m => '¤'.repeat(m.length))
}

export function parsear(lit) {
  const l = lit.toLowerCase()
  if (l === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (l === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (l.startsWith('#')) {
    let h = l.slice(1)
    if (h.length <= 4) h = [...h].map(c => c + c).join('')
    const n = i => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? +(n(6) / 255).toFixed(3) : 1 }
  }
  const nums = l.replace(/rgba?\(|\)/g, '').split(/[\s,/]+/).filter(Boolean)
  const a = nums[3] === undefined ? 1 : nums[3].endsWith('%') ? parseFloat(nums[3]) / 100 : parseFloat(nums[3])
  return { r: +nums[0], g: +nums[1], b: +nums[2], a }
}

export function hsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
    h *= 60
  }
  return { h, s, l, croma: (max - min) * 255 }
}

/** Familia de color: la jerarquía del lenguaje (neutro, morado, ámbar, rojo) más las de dato (verde, azul, rosa). */
export function familia(c) {
  const { h, s, l, croma } = hsl(c)
  // Grises fríos o cálidos (slate, stone): poca saturación aunque el croma pase de 20. No son color de marca.
  if (croma < 20 || s < 0.12 || (s < 0.25 && croma < 50) || (l < 0.2 && croma < 40)) return 'gris'
  if (h >= 245 && h < 300) return 'morado'
  if (h >= 300 && h < 340) return 'rosa'
  if (h >= 340 || h < 18) return 'rojo'
  if (h >= 18 && h < 62) return 'ambar'
  if (h >= 62 && h < 170) return 'verde'
  return 'azul'
}

export function luminancia({ r, g, b }) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Mezcla un color con alfa sobre un fondo opaco. */
export function sobre(c, fondo) {
  const a = c.a ?? 1
  return { r: Math.round(c.r * a + fondo.r * (1 - a)), g: Math.round(c.g * a + fondo.g * (1 - a)), b: Math.round(c.b * a + fondo.b * (1 - a)), a: 1 }
}

/** Rampas del lenguaje (valores del estilo unificado). Mismo orden que en lenguaje.css. */
export const RAMPAS = {
  gris: ['#000000', '#09090b', '#0f0f12', '#131318', '#16161c', '#1c1c22', '#24242b', '#2e2e36', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#ffffff'],
  morado: ['#f6f0ff', '#ece0ff', '#dcc6ff', '#c7a6ff', '#b388ff', '#a06bfa', '#8c27f1', '#7419d1', '#5c14a6', '#3f0e73', '#250844'],
  ambar: ['#fff6e8', '#ffe3bd', '#ffc980', '#ffac3d', '#ff9101', '#cc7301', '#a35c00', '#6b3c00', '#2a1700'],
  rojo: ['#fef2f2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d', '#2a0e0e'],
  verde: ['#ecfdf5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#064e3b', '#022c22'],
  azul: ['#f0f9ff', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#0c4a6e', '#082f49'],
  rosa: ['#fdf2f8', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#831843', '#500724'],
}

/** Paso de la rampa más cercano por luminancia percibida (L* aproximada). */
export function paso(fam, c) {
  const L = v => { const y = luminancia(v); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y }
  const objetivo = L(c)
  let mejor = 0, dist = Infinity
  RAMPAS[fam].forEach((hex, i) => { const d = Math.abs(L(parsear(hex)) - objetivo); if (d < dist) { dist = d; mejor = i } })
  return mejor
}
