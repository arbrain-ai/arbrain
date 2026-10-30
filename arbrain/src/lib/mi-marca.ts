/**
 * Mi marca (29 oct 2026): el punto de extensión de la marca en la capa del dueño. Pedido de Daniel: «incluso si le
 * cambia los colores y la paleta de la UI, ¿actualizar chocará igualmente?». Antes, cambiar colores era editar
 * `src/app/globals.css` (del autor): chocaba si el autor tocaba esas líneas y la copia perdía el programa ya compilado
 * (`scripts/servidor/programa.mjs › fuenteIgualALaEtiqueta`), así que compilaba en su máquina.
 *
 * Ahora la marca vive en `<cerebro>/mi-marca/`, que es de la persona (CAPA_ALUMNO del generador) y no es código:
 *   - `tema.css`   variables CSS que pisan las del autor. La web lo sirve en `/api/mi-marca/tema` y el layout lo carga
 *                  DESPUÉS de globals.css, en tiempo de ejecución: funciona con el programa ya compilado, sin recompilar.
 *   - `logo.svg|png|webp`  opcional: icono de la pestaña, de la ventana y del teléfono.
 *   - `marca.json` opcional: `{ "nombre": "…" }` reemplaza «Arbrain» en el título de la ventana.
 *
 * Solo lee archivos de nombre fijo dentro de esa carpeta (sin rutas que vengan de la petición) y con tope de tamaño.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { raizWorkspace } from './rutas-instalacion'

export const CARPETA_MI_MARCA = 'mi-marca'
export const TEMA = 'tema.css'
export const MARCA = 'marca.json'
/** En este orden: el primero que exista es el logo. */
export const LOGOS = [
  { archivo: 'logo.svg', tipo: 'image/svg+xml' },
  { archivo: 'logo.png', tipo: 'image/png' },
  { archivo: 'logo.webp', tipo: 'image/webp' },
] as const
export const MAX_TEMA = 256 * 1024
export const MAX_LOGO = 2 * 1024 * 1024
export const MAX_NOMBRE = 40

type Env = Record<string, string | undefined>

/** `<cerebro>/mi-marca`, o null si esta instalación no sabe dónde está su cerebro. */
export function dirMiMarca(env: Env = process.env): string | null {
  try {
    return join(raizWorkspace(undefined, env), CARPETA_MI_MARCA)
  } catch {
    return null
  }
}

async function archivo(ruta: string, max: number): Promise<{ buf: Buffer; mtime: number } | null> {
  const st = await stat(ruta).catch(() => null)
  if (!st?.isFile() || st.size > max) return null
  const buf = await readFile(ruta).catch(() => null)
  return buf ? { buf, mtime: Math.trunc(st.mtimeMs) } : null
}

/** El CSS del dueño tal cual (vacío si no hay o pasa del tope). */
export async function leerTema(dir: string | null): Promise<string> {
  if (!dir) return ''
  return (await archivo(join(dir, TEMA), MAX_TEMA))?.buf.toString('utf8') ?? ''
}

export async function leerLogo(dir: string | null): Promise<{ buf: Buffer; tipo: string; mtime: number } | null> {
  if (!dir) return null
  for (const l of LOGOS) {
    const a = await archivo(join(dir, l.archivo), MAX_LOGO)
    if (a) return { ...a, tipo: l.tipo }
  }
  return null
}

/** Nombre de `marca.json` si es texto corto de una línea; si no, null (se queda «Arbrain»). Pura. */
export function nombreValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const n = valor.trim()
  if (!n || n.length > MAX_NOMBRE || /[\u0000-\u001f\u007f<>]/.test(n)) return null
  return n
}

export interface MiMarca { nombre: string | null; logo: string | null }

/** Lo que la ventana necesita saber: el nombre y la URL del logo (con su versión para no quedarse con uno viejo). */
export async function leerMiMarca(dir: string | null): Promise<MiMarca> {
  if (!dir) return { nombre: null, logo: null }
  let nombre: string | null = null
  const m = await archivo(join(dir, MARCA), 16 * 1024)
  if (m) {
    try { nombre = nombreValido((JSON.parse(m.buf.toString('utf8')) as { nombre?: unknown })?.nombre) } catch { /* JSON roto: sin nombre */ }
  }
  const logo = await leerLogo(dir)
  return { nombre, logo: logo ? `/api/mi-marca/logo?v=${logo.mtime}` : null }
}
