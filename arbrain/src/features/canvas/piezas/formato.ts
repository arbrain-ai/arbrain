/**
 * Lienzo v17 · el FORMATO de la pieza libre (15 nov 2026). Contrato: `docs/builds/lienzo-v17/MOTOR.md`.
 *
 * Daniel: «que crees que le hace falta al panel para darte mucha mas libertad creativa y no estar anclado a solo las
 * herramientas actuales?». Una pieza libre es código visual propio (HTML, CSS, SVG, Canvas, WebGL, JS) en UN archivo
 * `pieza.html`: un fragmento con su ficha (`<script type="application/pieza+json">`), sus `<style>`, su marcado y sus
 * `<script>`. Corre en el host compartido (`public/piezas/host.js`), nunca en el documento de la app.
 *
 * Puro, sin DOM (tests/canvas/piezas-formato.test.ts): lo usan igual el lienzo y el banco.
 */
import { leerLigaDoc } from '../model/doc'

export interface FichaPieza {
  id: string
  titulo: string
  /** Tamaño LÓGICO en px CSS: la cámara la escala entera, sin remaquetar. */
  ancho: number
  alto: number
  /** Pasos internos del recorrido (0 = ninguno). Fuera del recorrido la pieza se ve completa. */
  pasos: number
  /** Rutas del repo de las imágenes de marca que usa: solo estas se le entregan. */
  imagenes: string[]
  fondo: 'propio' | 'transparente'
  listo: 'auto' | 'manual'
}

export interface PiezaLeida {
  ficha: FichaPieza
  /** El CSS ya acotado a la pieza por su `id` (`acotarCss`). */
  css: string
  /** El CSS tal cual (el lienzo lo acota al id del ELEMENTO: dos elementos pueden mostrar la misma pieza). */
  cssCrudo: string
  html: string
  js: string
  /** Lo que no cumple, en palabras: la pieza lo enseña. */
  errores: string[]
}

export const ANCHO_PIEZA = 1440
export const ALTO_PIEZA = 900
export const MAX_PIEZA = 512 * 1024
export const MAX_IMAGENES = 24
const IMAGEN = /\.(png|jpe?g|webp|gif|svg|avif)$/i
const FORMA_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

const FICHA = /<script\b[^>]*\btype\s*=\s*["']application\/pieza\+json["'][^>]*>([\s\S]*?)<\/script\s*>/i
const ESTILO = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi

/** Una ruta de imagen del repo (relativa, sin `..`), o null. */
export function rutaImagen(r: unknown): string | null {
  if (typeof r !== 'string') return null
  const liga = leerLigaDoc(`doc:${r.trim().replace(/^doc:/i, '')}`)
  return liga && IMAGEN.test(liga.ruta) ? liga.ruta : null
}

/** La ficha con tolerancia: lo que no cumple se cae campo por campo (y se dice). */
export function leerFicha(x: unknown, errores: string[] = []): FichaPieza | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) { errores.push('La ficha debe ser un objeto JSON.'); return null }
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || !FORMA_ID.test(o.id)) { errores.push('La ficha necesita `id` en minúsculas, números y guiones.'); return null }
  const tam = (v: unknown, d: number, nombre: string) => {
    if (v === undefined) return d
    if (typeof v === 'number' && Number.isFinite(v) && v >= 120 && v <= 8000) return Math.round(v)
    errores.push(`\`${nombre}\` debe ser un número entre 120 y 8000.`)
    return d
  }
  const imagenes: string[] = []
  if (o.imagenes !== undefined) {
    if (!Array.isArray(o.imagenes)) errores.push('`imagenes` debe ser una lista de rutas del repo.')
    else for (const r of o.imagenes.slice(0, MAX_IMAGENES)) {
      const ruta = rutaImagen(r)
      if (ruta) { if (!imagenes.includes(ruta)) imagenes.push(ruta) } else errores.push(`La imagen «${String(r).slice(0, 120)}» no es una ruta de imagen del repo.`)
    }
  }
  const pasos = typeof o.pasos === 'number' && Number.isFinite(o.pasos) ? Math.max(0, Math.min(40, Math.round(o.pasos))) : 0
  return {
    id: o.id,
    titulo: typeof o.titulo === 'string' && o.titulo.trim() ? o.titulo.trim().slice(0, 120) : o.id,
    ancho: tam(o.ancho, ANCHO_PIEZA, 'ancho'),
    alto: tam(o.alto, ALTO_PIEZA, 'alto'),
    pasos,
    imagenes,
    fondo: o.fondo === 'transparente' ? 'transparente' : 'propio',
    listo: o.listo === 'manual' ? 'manual' : 'auto',
  }
}

/**
 * Lee `pieza.html`. Sin ficha válida no es una pieza (`ok: false`); con ficha, todo lo demás se acepta y los avisos van
 * en `errores` (la pieza se pinta igual y los enseña).
 */
export function leerPieza(texto: string): { ok: true; pieza: PiezaLeida } | { ok: false; errores: string[] } {
  if (typeof texto !== 'string' || !texto.trim()) return { ok: false, errores: ['El archivo de la pieza está vacío.'] }
  if (texto.length > MAX_PIEZA) return { ok: false, errores: ['La pieza pasa de 512 KB.'] }
  const errores: string[] = []
  const m = FICHA.exec(texto)
  if (!m) return { ok: false, errores: ['Falta la ficha: <script type="application/pieza+json">{ "id": … }</script>.'] }
  let crudo: unknown
  try { crudo = JSON.parse(m[1]) } catch { return { ok: false, errores: ['La ficha no es JSON válido (revisa comas y comillas).'] } }
  const ficha = leerFicha(crudo, errores)
  if (!ficha) return { ok: false, errores }
  let resto = texto.replace(FICHA, '')
  const estilos: string[] = []
  resto = resto.replace(ESTILO, (_t, css: string) => { estilos.push(css); return '' })
  const scripts: string[] = []
  resto = resto.replace(SCRIPT, (todo: string, attrs: string, js: string) => {
    const tipo = /\btype\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.toLowerCase()
    if (/\bsrc\s*=/i.test(attrs)) { errores.push('Un <script src> no carga: la pieza no tiene red. Pon el código adentro.'); return '' }
    if (tipo && !['text/javascript', 'application/javascript', 'module'].includes(tipo)) return todo   // plantillas, JSON de datos
    scripts.push(js)
    return ''
  })
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(resto)) errores.push('Un <link> de estilos no carga: la pieza no tiene red.')
  const cssCrudo = estilos.join('\n')
  return { ok: true, pieza: { ficha, css: acotarCss(cssCrudo, ficha.id), cssCrudo, html: resto.trim(), js: scripts.join('\n;\n'), errores } }
}

/**
 * El CSS de una pieza, acotado a ella sola: todo dentro de `@scope ([data-pieza="<id>"])`, donde `:scope` es su raíz.
 * Lo que no puede vivir dentro de un `@scope` (`@keyframes`, `@font-face`, `@property`) sale a la raíz del documento;
 * `@import` y `@charset` se quitan (sin red). Comentarios fuera. Llaves dentro de cadenas: respetadas.
 */
export function acotarCss(css: string, id: string): string {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const fuera: string[] = []
  const dentro: string[] = []
  let i = 0
  const n = limpio.length
  while (i < n) {
    // Avanzar espacios.
    while (i < n && /\s/.test(limpio[i])) i++
    if (i >= n) break
    const ini = i
    // Leer hasta `{` o `;` de nivel 0 (respetando cadenas).
    let cad: string | null = null
    while (i < n) {
      const ch = limpio[i]
      if (cad) { if (ch === '\\') i++; else if (ch === cad) cad = null }
      else if (ch === '"' || ch === "'") cad = ch
      else if (ch === '{' || ch === ';') break
      i++
    }
    if (i >= n) { dentro.push(limpio.slice(ini)); break }
    const cabeza = limpio.slice(ini, i).trim()
    if (limpio[i] === ';') {   // regla de una línea: @import, @charset, @layer a;
      i++
      if (!/^@(import|charset)\b/i.test(cabeza)) fuera.push(`${cabeza};`)
      continue
    }
    // Bloque: buscar su llave de cierre.
    let nivel = 0
    const desde = i
    cad = null
    while (i < n) {
      const ch = limpio[i]
      if (cad) { if (ch === '\\') i++; else if (ch === cad) cad = null }
      else if (ch === '"' || ch === "'") cad = ch
      else if (ch === '{') nivel++
      else if (ch === '}') { nivel--; if (nivel === 0) { i++; break } }
      i++
    }
    const bloque = `${cabeza} ${limpio.slice(desde, i)}`
    if (/^@(-webkit-)?(keyframes|font-face|property)\b/i.test(cabeza)) fuera.push(bloque)
    else dentro.push(bloque)
  }
  const sel = `[data-pieza="${id.replace(/["\\]/g, '')}"]`
  return [...fuera, dentro.length ? `@scope (${sel}) {\n${dentro.join('\n')}\n}` : ''].filter(Boolean).join('\n')
}

/** La huella de lo que pinta una pieza: archivo, tema y paso. Si cambia, el póster ya no es fiel. */
export const huellaPieza = (hash: string, modo: string, paso: number | 'fin' = 'fin') => `${hash}|${modo}|${paso}`

/** `"doc:…/pieza.html"` → la ruta, o null. */
export function ligaPieza(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const liga = leerLigaDoc(x)
  return liga && /\.html?$/i.test(liga.ruta) ? liga.ruta : null
}
