/**
 * Traducción de la interfaz (13 nov 2026). El español es el texto fuente y vive en el código, donde siempre ha vivido;
 * el inglés vive en UN solo catálogo para toda Arbrain, `arbrain/server/src/i18n/en.json` (web y daemon), cuya llave
 * es el texto español exacto. Así:
 *   - En español nada cambia: `tr('Ajustes')` devuelve 'Ajustes'.
 *   - En inglés, `tr('Ajustes')` devuelve 'Settings'; si falta la traducción, sale el español (nunca un hueco).
 *   - Un texto que viene de datos (`seccion.nombre`, un mensaje del servidor) se traduce igual al pintarse: `tr(x)`.
 *     El literal se marca donde nace con `trMarca('Norte')` para que las pruebas lo encuentren.
 *
 * Variables con llaves: `tr('Hola, {nombre}', { nombre })`. Plurales: `trn(n, 'una tarea', '{n} tareas')`.
 * Fragmentos de React dentro de un texto: `trNodos('Escribe {cmd} para…', { cmd: <code>/goal</code> })` (TrNodos.tsx).
 *
 * Regla: llamar `tr()` al pintar o al responder, nunca al cargar el módulo (una constante de módulo se calcula una vez
 * por proceso; en el servidor quedaría en el idioma de su primer uso). Revisar: `node scripts/i18n/revisar.mjs`.
 */
// El catálogo vive con el daemon (que no puede importar fuera de su carpeta) y lo comparten los dos programas.
import EN from '../../../server/src/i18n/en.json'
import { IDIOMA_POR_DEFECTO, leerIdiomaDisco, localeDe, normalizarIdioma, type Idioma } from './idioma'

export type { Idioma } from './idioma'

const CATALOGO_EN = EN as Record<string, string>

let cacheCliente: Idioma | null = null
let cacheServidor: { idioma: Idioma; hasta: number } | null = null
/** Pruebas: fija el idioma sin disco ni DOM. `null` lo suelta. */
let forzado: Idioma | null = null

/**
 * Idioma activo. Navegador: el `lang` de `<html>`, que pinta el layout raíz desde el mismo archivo en cada petición
 * (cambiar de idioma recarga la página). Servidor: el archivo, con un segundo de caché.
 */
export function idiomaActual(): Idioma {
  if (forzado) return forzado
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (cacheCliente) return cacheCliente
    cacheCliente = normalizarIdioma(document.documentElement.getAttribute('lang'))
    return cacheCliente
  }
  const ahora = Date.now()
  if (cacheServidor && cacheServidor.hasta > ahora) return cacheServidor.idioma
  const idioma = leerIdiomaDisco()
  cacheServidor = { idioma, hasta: ahora + 1000 }
  return idioma
}

/** El servidor acaba de guardar otro idioma: la siguiente lectura va al disco. */
export function olvidarIdiomaServidor() {
  cacheServidor = null
}

/** Solo pruebas y capturas: `fijarIdiomaPrueba('en')`; `fijarIdiomaPrueba(null)` vuelve a la regla normal. */
export function fijarIdiomaPrueba(idioma: Idioma | null) {
  forzado = idioma
  cacheCliente = null
  cacheServidor = null
}

export const enIngles = () => idiomaActual() === 'en'

/** Locale de Intl del idioma activo: 'es-MX' o 'en-US'. Reemplaza los `'es-MX'` fijos en fechas y números. */
export function localeIntl(): string {
  return localeDe(idiomaActual())
}

type Vars = Record<string, string | number | null | undefined>

function interpolar(texto: string, vars?: Vars): string {
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (todo, k: string) => (k in vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : todo))
}

/** Traducción cruda del catálogo (sin variables), o `undefined` si no hay. Para herramientas y pruebas. */
export function traduccionEn(texto: string): string | undefined {
  const t = CATALOGO_EN[texto]
  return typeof t === 'string' && t ? t : undefined
}

/** El texto en el idioma activo. `idioma` fuerza uno (p. ej. un correo o un aviso para alguien en concreto). */
export function tr(texto: string, vars?: Vars, idioma: Idioma = idiomaActual()): string {
  const base = idioma === 'en' ? traduccionEn(texto) ?? texto : texto
  return interpolar(base, vars)
}

/** Plural: `n === 1` usa `uno`; lo demás, `varios`. `{n}` siempre está disponible en las variables. */
export function trn(n: number, uno: string, varios: string, vars?: Vars): string {
  return tr(n === 1 ? uno : varios, { n, ...vars })
}

/** Marca un literal para el catálogo sin traducirlo (se traduce al pintarse con `tr(x)`). Devuelve el mismo texto. */
export function trMarca<T extends string>(texto: T): T {
  return texto
}

/** Como `trMarca`, para una lista de literales (palabras de búsqueda, opciones). Devuelve la misma lista. */
export function trMarcas<T extends readonly string[]>(textos: T): T {
  return textos
}

export { IDIOMA_POR_DEFECTO }
