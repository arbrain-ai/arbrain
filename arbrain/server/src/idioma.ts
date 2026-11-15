/**
 * Idioma del agente (13 nov 2026, «Arbrain en inglés»). Ajustes › Idioma guarda `idioma.json` en la carpeta de
 * configuración compartida (`DIR_ARBRAIN()`, la misma `ARBRAIN_CONFIG_DIR` que usa la web). Con «en», cada sesión
 * nueva del chat y cada rutina nacen con una instrucción de sistema corta: contestar en inglés de EE. UU. aunque el
 * cerebro (CLAUDE.md, memorias, skills, ganchos) esté en español. Con «es» (o sin archivo) no se agrega nada: la
 * sesión queda exactamente como antes.
 *
 * Se lee en cada turno (es un archivo pequeño): cambiar el idioma no exige reiniciar el daemon. La firma del pool de
 * sesiones incluye `systemPrompt`, así que una conversación abierta se reabre con la instrucción nueva; el SDK guarda
 * el prompt de sistema de cada conversación desde su primer mensaje, por eso la garantía es para conversaciones nuevas.
 *
 * Marcador del repo (fase 3, 13 nov 2026): la copia del alumno en inglés (`generar.mjs --idioma en`) trae
 * `arbrain/IDIOMA` = `en`, como `arbrain/EDICION` = `cliente`; sin nada elegido en Ajustes, el agente nace en inglés.
 * Elegir Español en Ajustes escribe `idioma.json`, que gana al marcador. El repo de Daniel no lo tiene.
 *
 * Precedencia: `ARBRAIN_IDIOMA` (pruebas, diagnóstico) > `idioma.json` de Ajustes > marcador `IDIOMA` del repo > español.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIR_ARBRAIN, leerMarcador } from './edicion.js'

export type Idioma = 'es' | 'en'

export const ARCHIVO_IDIOMA = 'idioma.json'

export function normalizarIdioma(valor: unknown): Idioma {
  const v = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return v === 'en' || v.startsWith('en-') || v === 'english' || v === 'ingles' || v === 'inglés' ? 'en' : 'es'
}

/**
 * Dónde se busca el marcador de idioma, relativo a este módulo (igual que `RUTAS_MARCADOR_REPO` de edicion.ts):
 * `src/idioma.ts` o `dist/idioma.js` dentro de `arbrain/server` → `arbrain/server/IDIOMA` y `arbrain/IDIOMA` (el que
 * escribe el generador). Un daemon armado en otra carpeta lo encuentra en `<daemon>/IDIOMA` si se copia ahí.
 */
export const RUTAS_MARCADOR_IDIOMA = [new URL('../IDIOMA', import.meta.url), new URL('../../IDIOMA', import.meta.url)].map(u => fileURLToPath(u))

/** Idioma del marcador `IDIOMA` del repo (primera línea que no es comentario), o `null` si no hay. */
export function marcadorIdioma(rutas: readonly string[] = RUTAS_MARCADOR_IDIOMA): Idioma | null {
  for (const r of rutas) {
    const valor = leerMarcador(r).replace(/^\ufeff/, '')
    if (valor) return normalizarIdioma(valor)
  }
  return null
}

/**
 * Las rutas del marcador para este proceso: las del módulo y, si el lanzador pasa la carpeta del cerebro
 * (`ARBRAIN_HOME`, la raíz de la copia: app de escritorio y modo servidor corren un daemon compilado fuera de ella),
 * `<ARBRAIN_HOME>/arbrain/IDIOMA`.
 */
export function rutasMarcadorDe(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.ARBRAIN_HOME?.trim()
  return home ? [...RUTAS_MARCADOR_IDIOMA, join(home, 'arbrain', 'IDIOMA')] : [...RUTAS_MARCADOR_IDIOMA]
}

/**
 * El idioma de la instalación: `ARBRAIN_IDIOMA` > `idioma.json` de Ajustes > marcador `IDIOMA` del repo > español.
 * Un `idioma.json` ilegible cuenta como ausente. `rutasMarcador` es para pruebas.
 */
export function idiomaInstalacion(env: NodeJS.ProcessEnv = process.env, dir: string = DIR_ARBRAIN(), rutasMarcador: readonly string[] = rutasMarcadorDe(env)): Idioma {
  const forzado = env.ARBRAIN_IDIOMA?.trim()
  if (forzado) return normalizarIdioma(forzado)
  try {
    const texto = readFileSync(join(dir, ARCHIVO_IDIOMA), 'utf8').replace(/^\ufeff/, '')
    return normalizarIdioma((JSON.parse(texto) as { idioma?: unknown })?.idioma)
  } catch {
    return marcadorIdioma(rutasMarcador) ?? 'es'
  }
}

/**
 * Instrucción de sistema para una persona que eligió inglés. Corta a propósito: el cerebro del usuario (su CLAUDE.md)
 * sigue siendo la identidad del agente; esto solo fija el idioma de lo que la persona lee y oye.
 */
export const INSTRUCCION_INGLES = [
  'Language: the person using this Arbrain chose English in Settings.',
  'Always write your replies to them in natural, fluent US English, even when your instructions, memory files, skills, hooks, tool results or earlier messages are in Spanish. Translate what you quote or summarize from Spanish sources.',
  'Files, notes, plans and messages you create for them are in English too, unless they ask for another language or the file is already in Spanish and you are editing it.',
  'Keep brand and product names as they are: Arbrain, Levy, Claude, and the names of their tools, commands and folders.',
  'Messages from the app itself (welcome tour, routines, automatic prompts) may arrive in Spanish: still answer in English. Switch languages only if the person explicitly asks you to.',
].join(' ')

/** Opciones del SDK para el idioma: con inglés, `systemPrompt`; con español, nada (sesión idéntica a la de siempre). */
export function opcionesIdioma(idioma: Idioma = idiomaInstalacion()): { systemPrompt?: string } {
  return idioma === 'en' ? { systemPrompt: INSTRUCCION_INGLES } : {}
}
