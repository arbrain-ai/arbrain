/**
 * Vista «documento» (3 oct 2026): qué archivos puede enseñar el panel y cómo se pintan.
 * Espejo de arbrain/server/src/cabina/documento.ts (la herramienta valida antes; esta API vuelve a
 * validar porque es la que lee y escribe). Puro: sin fs, para poder probarlo y usarlo en el cliente.
 */
export type TipoDocumento = 'md' | 'txt' | 'html' | 'mermaid' | 'imagen' | 'video' | 'audio' | 'pdf' | 'carpeta' | 'codigo' | 'otro'

const EXT: Record<string, TipoDocumento> = {
  md: 'md', markdown: 'md', txt: 'txt', html: 'html', htm: 'html', mmd: 'mermaid', mermaid: 'mermaid',
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', gif: 'imagen', svg: 'imagen', avif: 'imagen',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video',
  pdf: 'pdf', mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio', aif: 'audio', aiff: 'audio',
}
const CODIGO = /^(ts|tsx|js|jsx|mjs|cjs|py|swift|json|jsonc|yaml|yml|toml|sh|zsh|bash|rb|go|rs|java|kt|c|h|cpp|hpp|m|mm|css|scss|sql|plist|xml|lock|env|ini|cfg|conf|vue|svelte|php|lua|dart|r|ipynb)$/

const extDe = (ruta: string) => { const b = ruta.split('/').pop() ?? ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : '' }
export function tipoDocumento(ruta: string): TipoDocumento { const e = extDe(ruta); return EXT[e] ?? (CODIGO.test(e) ? 'codigo' : 'otro') }
export const editable = (t: TipoDocumento) => t === 'md' || t === 'txt'

const CARPETA_VETADA = /^\.(ssh|gnupg|aws|kube|docker)$/
const NOMBRE_VETADO = /^\.env|^\.netrc$|^\.npmrc$|^id_(rsa|ed25519|ecdsa|dsa)|\.(pem|key|p12|pfx|keystore|jks|kdbx)$|credencial|secret|password|contrase/i

/** ¿Alguna parte de la ruta es una carpeta de credenciales o tiene nombre de llave o credencial? Más estricta que `rutaPermitida`, que solo mira el nombre del archivo (también lo usa el explorador, 8 oct 2026) */
export function pareceSecreto(ruta: string): boolean {
  const partes = ruta.split('/').filter(Boolean)
  return partes.some(p => CARPETA_VETADA.test(p) || NOMBRE_VETADO.test(p))
}

/** Normaliza una ruta absoluta POSIX sin tocar disco (quita `.` y dobles barras; `..` ya se rechazó). */
function normal(abs: string) { return '/' + abs.split('/').filter(p => p && p !== '.').join('/') }

export interface Raices { repo: string; home: string }
/** Carpetas del dueño donde viven sus grabaciones, entregas y papeles (8 oct 2026: «ábreme esto» no debe exigir mover el archivo). */
export const CARPETAS_DEL_DUENO = ['Movies', 'Desktop', 'Downloads', 'Documents', 'Pictures', 'Music']
export const permitidas = (r: Raices) => [r.repo, `${r.home}/Developer`, '/tmp', '/private/tmp', ...CARPETAS_DEL_DUENO.map(c => `${r.home}/${c}`)]
const dentro = (abs: string, base: string) => abs === base || abs.startsWith(base.endsWith('/') ? base : base + '/')

/** ¿Una ruta absoluta (ya resuelta) está en las raíces permitidas y lejos de credenciales? null = sí. */
export function rutaPermitida(abs: string, r: Raices): string | null {
  if (!permitidas(r).some(b => dentro(abs, b))) return 'Solo se muestran archivos del repo, de ~/Developer, de /tmp o de las carpetas del dueño (Movies, Desktop, Downloads, Documents, Pictures, Music).'
  const partes = abs.split('/')
  if (partes.some(p => CARPETA_VETADA.test(p))) return 'Esa carpeta guarda credenciales: no se muestra.'
  if (NOMBRE_VETADO.test(partes[partes.length - 1] ?? '')) return 'Ese archivo parece una llave o credencial: no se muestra.'
  return null
}

/** Relativa al repo, `~/…` o absoluta → absoluta permitida, o un error legible. */
export function resolverRuta(pedida: string, r: Raices): { abs: string } | { error: string } {
  const p = pedida.trim()
  if (!p || p.length > 1000 || p.includes('\0')) return { error: 'Ruta inválida.' }
  if (p.split(/[\\/]/).includes('..')) return { error: 'La ruta no puede subir con «..».' }
  const abs = normal(p.startsWith('~/') ? `${r.home}/${p.slice(2)}` : p.startsWith('/') ? p : `${r.repo}/${p}`)
  const error = rutaPermitida(abs, r)
  return error ? { error } : { abs }
}

/** Hasta dónde puede pedir assets una página HTML: dos carpetas arriba de la suya (los pergaminos
 *  enlazan `../../enactivos/…`), sin pasar de la raíz del proyecto que la contiene. */
export function alcanceDeAssets(abs: string, r: Raices): string {
  const dir = abs.slice(0, abs.lastIndexOf('/')) || '/'
  const proyecto = dentro(abs, r.repo) ? r.repo
    : permitidas(r).slice(1).map(b => { if (!dentro(abs, b)) return null; const resto = abs.slice(b.length + 1).split('/'); return resto.length > 1 ? `${b}/${resto[0]}` : b }).find(Boolean) ?? dir
  let alcance = dir
  for (let i = 0; i < 2 && alcance !== proyecto && dentro(alcance, proyecto); i++) alcance = alcance.slice(0, alcance.lastIndexOf('/')) || '/'
  return dentro(alcance, proyecto) ? alcance : proyecto
}
