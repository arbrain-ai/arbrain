/**
 * Canvas v4 — las ligas `doc:` (3 oct 2026), el mismo contrato que sfmap.
 *
 * sfmap (Enlace.swift, DocumentoHTML.swift) guarda `doc:ruta/relativa/al/repo`
 * en dos sitios del MISMO documento:
 *   · `embed.url = "doc:….html"` → el HTML se pinta VIVO dentro del lienzo
 *   · `link = "doc:….md"` → ⌘+clic abre el documento en el panel
 * La ruta es RELATIVA al repo (`CLAUDE.md` + `.claude/`) a proposito: una
 * absoluta viaja mal entre el Studio y el MacBook, y el lienzo se sincroniza.
 *
 * Puro: la ruta del servidor valida con esto y luego vuelve a validar contra
 * el disco (enlaces simbolicos), porque lo lexico no ve a donde apunta un link.
 */

export interface LigaDoc {
  /** Relativa a la raiz del repo, sin `/` inicial. */
  ruta: string
  /** Lo que venia tras `#`, si algo. */
  fragmento?: string
}

/**
 * `doc:…` → ruta relativa limpia, o null si la liga intenta salir de la raiz.
 *
 * Fuera, igual que sfmap: `..` en cualquier segmento, rutas absolutas (tras
 * quitar las `/` de cortesia del inicio solo queda relativa), esquemas
 * (`://`), `~`, barras invertidas y el byte nulo.
 */
export function leerLigaDoc(liga: string | null | undefined): LigaDoc | null {
  const s = (liga ?? '').trim()
  if (!/^doc:/i.test(s)) return null
  const [cuerpo, ...resto] = s.slice(4).split('#')
  let ruta = cuerpo
  try { ruta = decodeURI(ruta) } catch { /* se queda como vino */ }
  ruta = ruta.replace(/^\/+/, '')
  if (!ruta || ruta.length > 600) return null
  if (ruta.includes('\0') || ruta.includes('\\') || ruta.includes('://') || ruta.startsWith('~')) return null
  const partes = ruta.split('/')
  if (partes.some(p => p === '..' || p === '')) return null
  const limpia = partes.filter(p => p !== '.').join('/')
  if (!limpia) return null
  const fragmento = resto.join('#')
  return fragmento ? { ruta: limpia, fragmento } : { ruta: limpia }
}

export const esHTML = (ruta: string) => /\.html?$/i.test(ruta)

/** ¿Una ruta absoluta (ya resuelta en disco) sigue dentro de la raiz? */
export function dentroDeRaiz(abs: string, raiz: string): boolean {
  // Windows (16 nov 2026, un fundador: «me quedó en blanco… solamente funcionaba para Mac»): `realpath` da `C:\…` y antes
  // se comparaba contra `raiz + '/'`, así que toda pieza salía «fuera». Con unidad o UNC: barras normales y sin distinguir
  // mayúsculas (como lib/ruta-portable.ts; aquí en línea porque el banco de piezas lo transpila solo, sin imports).
  const win = WINDOWS.test(abs) || WINDOWS.test(raiz)
  const n = (p: string) => win ? p.replace(/\\/g, '/').toLowerCase() : p
  const a = n(abs), b = n(raiz)
  return a.startsWith(b.endsWith('/') ? b : b + '/')
}
const WINDOWS = /^[A-Za-z]:[\\/]|^\\\\/
