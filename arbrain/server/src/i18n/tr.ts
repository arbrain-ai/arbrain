/**
 * Textos del daemon en el idioma de Ajustes (13 nov 2026, «Arbrain en inglés»). Mismo método que la web
 * (`arbrain/src/shared/i18n/tr.ts`): el español es el texto fuente en el código y el inglés vive en UN solo catálogo
 * para toda Arbrain, este `en.json`, con el texto español exacto como llave. Lo que el daemon le dice a la persona
 * (tarjetas de permiso, errores del chat, «Lo que hizo Levy», avisos al teléfono) pasa por `tr()` al armarse.
 *
 * El idioma se lee de `idioma.json` (idioma.ts) con un segundo de caché. Textos para el modelo: no pasan por aquí.
 */
import EN from './en.json' with { type: 'json' }
import { idiomaInstalacion, type Idioma } from '../idioma.js'

const CATALOGO = EN as Record<string, string>
let cache: { idioma: Idioma; hasta: number } | null = null
let forzado: Idioma | null = null

export function idiomaActual(): Idioma {
  if (forzado) return forzado
  const ahora = Date.now()
  if (cache && cache.hasta > ahora) return cache.idioma
  const idioma = idiomaInstalacion()
  cache = { idioma, hasta: ahora + 1000 }
  return idioma
}

/** Solo pruebas: fija el idioma; `null` vuelve a la regla normal. */
export function fijarIdiomaPrueba(idioma: Idioma | null) {
  forzado = idioma
  cache = null
}

type Vars = Record<string, string | number | null | undefined>

const interpolar = (texto: string, vars?: Vars) => !vars ? texto
  : texto.replace(/\{(\w+)\}/g, (todo, k: string) => (k in vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : todo))

export function tr(texto: string, vars?: Vars, idioma: Idioma = idiomaActual()): string {
  const t = idioma === 'en' ? CATALOGO[texto] : undefined
  return interpolar(typeof t === 'string' && t ? t : texto, vars)
}

export function trn(n: number, uno: string, varios: string, vars?: Vars): string {
  return tr(n === 1 ? uno : varios, { n, ...vars })
}

/** Marca un literal para el catálogo sin traducirlo; se traduce donde se usa con `tr(x)`. */
export function trMarca<T extends string>(texto: T): T {
  return texto
}
