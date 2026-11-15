/**
 * Idioma de la instalación (13 nov 2026, «Arbrain en inglés»; Daniel: «lo veo tan simple como un botón en el panel de
 * config en el menú de ajustes»). Ajustes › Idioma elige Español o English y lo guarda en
 * `<carpeta de configuración>/idioma.json`, la misma que comparten la web y el daemon: la interfaz, las fechas y el
 * agente leen el mismo archivo. Es de la instalación, no del navegador (el teléfono ve lo mismo que la computadora).
 *
 * Módulo puro (sin imports de node:*): lo importan componentes, rutas y pruebas. El disco se lee solo en Node con
 * `process.getBuiltinModule`, como `lib/edicion.ts`.
 *
 * Marcador del repo (fase 3, 13 nov 2026): la copia del alumno en inglés (`generar.mjs --idioma en`) trae
 * `arbrain/IDIOMA` = `en`, como `arbrain/EDICION` = `cliente`: la app nace en English sin tocar Ajustes, y la persona
 * puede volver a Español ahí (el archivo de Ajustes gana al marcador). El repo de Daniel no lo tiene.
 *
 * Precedencia: `ARBRAIN_IDIOMA` (pruebas, diagnóstico) > `idioma.json` de Ajustes > marcador `IDIOMA` del repo > español.
 */
import { esEdicionCliente, valorMarcador } from '@/lib/edicion'

export type Idioma = 'es' | 'en'

export const IDIOMAS: ReadonlyArray<{ id: Idioma; nombre: string; locale: string }> = [
  { id: 'es', nombre: 'Español', locale: 'es-MX' },
  { id: 'en', nombre: 'English', locale: 'en-US' },
]

export const IDIOMA_POR_DEFECTO: Idioma = 'es'

/** Nombre del archivo en la carpeta de configuración compartida (web, daemon y app de escritorio). */
export const ARCHIVO_IDIOMA = 'idioma.json'

/** Cualquier valor a un idioma válido: 'en', 'EN', 'en-US', 'english' → 'en'; lo demás, español. */
export function normalizarIdioma(valor: unknown): Idioma {
  const v = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return v === 'en' || v.startsWith('en-') || v === 'english' || v === 'ingles' || v === 'inglés' ? 'en' : 'es'
}

/** Locale de Intl (`toLocaleDateString`, `Intl.NumberFormat`…) para un idioma. */
export function localeDe(idioma: Idioma): string {
  return idioma === 'en' ? 'en-US' : 'es-MX'
}

type Env = Record<string, string | undefined>
type FsMin = { readFileSync(ruta: string, cod: 'utf8'): string }
type PathMin = { join(...p: string[]): string }
type OsMin = { homedir(): string }

/**
 * Carpeta de configuración compartida, igual que `dirConfigArbrain()` de `lib/rutas-instalacion.ts` (aquí sin imports
 * de node:*). Edición cliente: `ARBRAIN_CONFIG_DIR` o nada (nunca cae a la carpeta de la instalación original).
 */
export function dirConfigIdioma(env: Env, path: PathMin, os: OsMin | undefined): string | null {
  const explicita = env.ARBRAIN_CONFIG_DIR?.trim()
  if (explicita) return explicita
  if (esEdicionCliente(env)) return null
  const home = os?.homedir()
  return home ? path.join(home, '.config', 'arbrain') : null
}

/** Rutas del marcador de idioma, relativas a la carpeta de trabajo de Next (`arbrain/`) o a la raíz de la copia. */
export const RUTAS_MARCADOR_IDIOMA = ['IDIOMA', 'arbrain/IDIOMA'] as const

/**
 * Idioma del marcador `IDIOMA` de la copia (primera línea que no es comentario: `en` o `es`), o `null` si no hay
 * marcador legible. Solo en Node; en otro runtime, `null`. `dir` y `fs` son para pruebas (por defecto, el cwd).
 */
export function marcadorIdioma(dir?: string, fs?: FsMin): Idioma | null {
  try {
    const p = typeof process === 'undefined' ? undefined : process
    const disco = fs ?? (p?.getBuiltinModule?.('node:fs') as FsMin | undefined)
    const base = dir ?? (typeof p?.cwd === 'function' ? p.cwd() : '')
    if (!disco || !base) return null
    for (const r of RUTAS_MARCADOR_IDIOMA) {
      let valor = ''
      try { valor = valorMarcador(disco.readFileSync(`${base}/${r}`, 'utf8').replace(/^\uFEFF/, '')) } catch { continue }
      if (valor) return normalizarIdioma(valor)
    }
    return null
  } catch {
    return null
  }
}

/**
 * El idioma de la instalación: `ARBRAIN_IDIOMA` > `idioma.json` de Ajustes > marcador `IDIOMA` de la copia > español.
 * Un `idioma.json` ilegible cuenta como ausente. Fuera de Node: español. `deps` es para pruebas (`cwd`: dónde buscar el
 * marcador; por defecto la carpeta de trabajo del proceso).
 */
export function leerIdiomaDisco(env: Env = typeof process === 'undefined' ? {} : process.env, deps?: { fs?: FsMin; path?: PathMin; os?: OsMin; cwd?: string }): Idioma {
  const forzado = env.ARBRAIN_IDIOMA?.trim()
  if (forzado) return normalizarIdioma(forzado)
  const p = typeof process === 'undefined' ? undefined : process
  let fs: FsMin | undefined
  try { fs = deps?.fs ?? (p?.getBuiltinModule?.('node:fs') as FsMin | undefined) } catch { return IDIOMA_POR_DEFECTO }
  if (!fs) return IDIOMA_POR_DEFECTO
  try {
    const path = deps?.path ?? (p?.getBuiltinModule?.('node:path') as PathMin | undefined)
    const os = deps?.os ?? (p?.getBuiltinModule?.('node:os') as OsMin | undefined)
    const dir = path ? dirConfigIdioma(env, path, os) : null
    if (path && dir) {
      const texto = fs.readFileSync(path.join(dir, ARCHIVO_IDIOMA), 'utf8').replace(/^\uFEFF/, '')
      return normalizarIdioma((JSON.parse(texto) as { idioma?: unknown })?.idioma)
    }
  } catch {
    // Sin archivo de Ajustes (o ilegible): decide el marcador de la copia.
  }
  // La app instalada (escritorio o modo servidor) corre la web compilada fuera de la copia: el marcador se busca también
  // en la carpeta del cerebro que le pasa el lanzador (`ARBRAIN_HOME`, la raíz de la copia).
  const home = env.ARBRAIN_HOME?.trim()
  return marcadorIdioma(deps?.cwd, fs) ?? (home ? marcadorIdioma(home, fs) : null) ?? IDIOMA_POR_DEFECTO
}
