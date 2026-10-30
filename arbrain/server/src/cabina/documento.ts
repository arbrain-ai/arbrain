/**
 * Vista «documento» de la Cabina (3 oct 2026): qué archivos puede enseñar Levy en el panel.
 *
 * Misma política que la API que los lee (arbrain/src/features/cabina/documento/ruta.ts): dentro
 * del repo, `~/Developer/**` o `/tmp/**`; nunca `..`, llaves, `.env*` ni carpetas de credenciales.
 * Aquí se valida ANTES de que la vista nazca, para que Levy reciba el error y no Daniel.
 */
import { DUENO, DUENO_M } from '../dueno.js'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { esEdicionCliente } from '../edicion.js'

/** src/cabina/documento.ts y dist/cabina/documento.js viven a la misma altura: tres arriba es el repo. En la edición
 * cliente el daemon viaja dentro de la app y no hay repo alrededor: la raíz es el workspace del alumno (ARBRAIN_HOME). */
export const REPO = esEdicionCliente() && process.env.ARBRAIN_HOME ? path.resolve(process.env.ARBRAIN_HOME) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

export type TipoDocumento = 'md' | 'txt' | 'html' | 'mermaid' | 'imagen' | 'video' | 'audio' | 'pdf' | 'carpeta' | 'codigo' | 'otro'

const EXT: Record<string, TipoDocumento> = {
  md: 'md', markdown: 'md', txt: 'txt', html: 'html', htm: 'html', mmd: 'mermaid', mermaid: 'mermaid',
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', gif: 'imagen', svg: 'imagen', avif: 'imagen',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  pdf: 'pdf', mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio', aif: 'audio', aiff: 'audio',
}
const CODIGO = /^(ts|tsx|js|jsx|mjs|cjs|py|swift|json|jsonc|yaml|yml|toml|sh|zsh|bash|rb|go|rs|java|kt|c|h|cpp|hpp|m|mm|css|scss|sql|plist|xml|lock|env|ini|cfg|conf|vue|svelte|php|lua|dart|r|ipynb)$/

export function tipoDocumento(ruta: string): TipoDocumento {
  const ext = path.extname(ruta).slice(1).toLowerCase()
  return EXT[ext] ?? (CODIGO.test(ext) ? 'codigo' : 'otro')
}

/** Espejo de arbrain/src/features/cabina/documento/ruta.ts. */
export const CARPETAS_DEL_DUENO = ['Movies', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music']
const CARPETA_VETADA = /^\.(ssh|gnupg|aws|kube|docker)$/
const NOMBRE_VETADO = /^\.env|^\.netrc$|^\.npmrc$|^id_(rsa|ed25519|ecdsa|dsa)|\.(pem|key|p12|pfx|keystore|jks|kdbx)$|credencial|secret|password|contrase/i

/** Una ruta absoluta ya resuelta, ¿está en las raíces permitidas y lejos de credenciales? */
export function rutaPermitida(abs: string, raices: { repo: string; home: string }): string | null {
  const dentro = (base: string) => abs === base || abs.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
  const permitidas = [raices.repo, path.join(raices.home, 'Developer'), '/tmp', '/private/tmp', ...CARPETAS_DEL_DUENO.map(c => path.join(raices.home, c))]
  if (!permitidas.some(dentro)) return 'Solo puedo mostrar archivos del repo, de ~/Developer, de /tmp o de las carpetas del dueño (Movies, Desktop, Downloads, Documents, Pictures, Music).'
  const partes = abs.split(path.sep)
  if (partes.some(p => CARPETA_VETADA.test(p))) return 'Esa carpeta guarda credenciales: no se muestra.'
  if (NOMBRE_VETADO.test(partes[partes.length - 1] ?? '')) return 'Ese archivo parece una llave o credencial: no se muestra.'
  return null
}

/** De lo que escribió Levy (relativa al repo, `~/…` o absoluta) a la ruta absoluta, o un error legible. */
export function resolverRuta(pedida: string, raices = { repo: REPO, home: homedir() }): { abs: string } | { error: string } {
  const r = pedida.trim()
  if (!r || r.length > 1000 || r.includes('\0')) return { error: 'ruta inválida.' }
  if (r.split(/[\\/]/).includes('..')) return { error: 'La ruta no puede subir con «..».' }
  const abs = path.normalize(r.startsWith('~/') ? path.join(raices.home, r.slice(2)) : path.isAbsolute(r) ? r : path.join(raices.repo, r))
  const error = rutaPermitida(abs, raices)
  return error ? { error } : { abs }
}

/** Validación completa para la herramienta: además de la política, que exista y que el symlink no salga. */
export function validarDocumento(pedida: string): { abs: string; tipo: TipoDocumento } | { error: string } {
  const r = resolverRuta(pedida)
  if ('error' in r) return r
  if (!existsSync(r.abs)) return { error: `No existe ${pedida}. Revisa la ruta (relativa al repo artificial-brain, ~/… o absoluta).` }
  const real = realpathSync(r.abs)
  const fuera = rutaPermitida(real, { repo: realpathSync(REPO), home: homedir() }) && rutaPermitida(real, { repo: REPO, home: homedir() })
  if (fuera) return { error: `El enlace apunta fuera de lo permitido: ${fuera}` }
  // Una carpeta se abre como entrega (finales primero, luego piezas).
  if (statSync(real).isDirectory()) return { abs: r.abs, tipo: 'carpeta' }
  if (!statSync(real).isFile()) return { error: 'Eso no es un archivo ni una carpeta.' }
  const tipo = tipoDocumento(real)
  if (tipo === 'codigo') return { error: `Es código: el panel no enseña código a ${DUENO}. Cuéntaselo tú en palabras.` }
  if (tipo === 'otro') return { error: 'El panel muestra .md, .txt, .html, .mmd, .pdf, imágenes, video, audio y carpetas; ese formato no.' }
  return { abs: r.abs, tipo }
}
