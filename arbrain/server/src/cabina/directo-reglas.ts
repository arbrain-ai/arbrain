/**
 * Modo directo, reglas puras del daemon. ESPEJO EXACTO de arbrain/src/lib/modo-directo/reglas.ts (desde el comentario de
 * las vistas vetadas hasta el final): la app las usa para pintar y el daemon para negar en la Cabina.
 * arbrain/tests/modo-directo.test.ts falla si las dos copias se separan. Sin imports a propósito.
 */

/** Vistas de la Cabina y secciones que no se abren en directo. `centro` es Finanzas · Lo que entra; `perro` es la cámara de la casa. */
export const VISTAS_VETADAS_DIRECTO = ['finanzas', 'centro', 'cohorte', 'casa', 'perro'] as const
/** Páginas completas de la app que no se abren en directo (prefijo de ruta). */
export const RUTAS_VETADAS_DIRECTO = ['/finanzas', '/command-center', '/cohorte', '/casa', '/perro'] as const
/** Lo que responde todo lo que se niega. */
export const OCULTO_POR_DIRECTO = 'Oculto por modo directo'

export const vistaVetadaDirecto = (vista: string | null | undefined): boolean => !!vista && (VISTAS_VETADAS_DIRECTO as readonly string[]).includes(vista)
export function rutaAppVetadaDirecto(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return RUTAS_VETADAS_DIRECTO.some(r => pathname === r || pathname.startsWith(r + '/'))
}

// ── Rutas sensibles del visor de documentos ──

/** Carpetas que en directo nunca se abren: credenciales, configuración local y las fichas privadas de clientes y dinero. */
const CARPETA_DIRECTO = /^(\.(ssh|gnupg|aws|kube|docker|config|azure|gcloud|password-store|secrets?)|Keychains|fundadores|clientes|finanzas|finances|finance-os|cobranza|cobros)$/i
/** Archivos que en directo nunca se abren: `.env*`, llaves, credenciales, tokens y fichas de dinero. */
const ARCHIVO_DIRECTO = /^\.env|^\.netrc$|^\.npmrc$|^\.pypirc$|^id_(rsa|ed25519|ecdsa|dsa)|\.(pem|key|p12|pfx|keystore|jks|kdbx|crt|cer|der|asc|gpg)$|credencial|credential|secret|password|passwd|contrase|(?:^|[-_.])(?:tokens?|llaves?)(?:[-_.]|$)|api[-_]?keys?|expediente|finanzas|cobranza|nomina/i

/** ¿La ruta (absoluta, relativa o `~/…`) toca algo que en directo no se enseña? */
export function rutaSensibleDirecto(ruta: string | null | undefined): boolean {
  if (!ruta) return false
  const partes = ruta.replace(/\\/g, '/').split('/').filter(Boolean)
  if (!partes.length) return false
  const archivo = partes[partes.length - 1]
  return partes.slice(0, -1).some(p => CARPETA_DIRECTO.test(p)) || CARPETA_DIRECTO.test(archivo) || ARCHIVO_DIRECTO.test(archivo)
}

/** Una invocación de `mostrar` (vista + rutas), ¿toca algo vetado? La usan la Cabina de la app y el daemon. */
export function invocacionVetadaDirecto(i: { vista?: string | null; ruta?: string | null; compararCon?: string | null; versiones?: readonly string[] | null }): 'vista' | 'ruta' | null {
  if (vistaVetadaDirecto(i.vista)) return 'vista'
  if ([i.ruta, i.compararCon, ...(i.versiones ?? [])].some(r => rutaSensibleDirecto(r))) return 'ruta'
  return null
}

// ── Secretos ──

export const TAPADO = '••••'

/** Patrones de secretos con su reemplazo. Orden: los bloques grandes primero. */
const SECRETOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[llave privada tapada]'],
  // NOMBRE_CON_KEY=valor (env, shell, YAML). Conserva el nombre: se ve qué es, no cuánto vale.
  [/\b([A-Za-z][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|_PASS|_PAT|CREDENTIALS?|AUTH|PRIVATE|DSN|DATABASE_URL|CONNECTION_STRING|SERVICE_ROLE)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)(?!••••)[^\s"'`]+\3/g, `$1$2$3${TAPADO}$3`],
  // "apiKey": "…", access_token: '…'
  [/((["'])?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|token|authorization)\2?\s*[:=]\s*["'])(?!••••)[^"'\n]{6,}(["'])/gi, `$1${TAPADO}$3`],
  [/(Bearer\s+)(?!••••)[A-Za-z0-9._~+/=-]{12,}/g, `$1${TAPADO}`],
  [/(Basic\s+)(?!••••)[A-Za-z0-9+/=]{16,}/g, `$1${TAPADO}`],
  // usuario:contraseña@ dentro de una URL (postgres://, https://…)
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)(?!••••)[^\s@/]+@/gi, `$1${TAPADO}@`],
  // Prefijos conocidos de llaves.
  [/\b(?:sk-ant-[A-Za-z0-9_-]{10,}|sk-(?:proj-|or-v1-|svcacct-)?[A-Za-z0-9_-]{20,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{16,}|polar_[a-z]{2,4}_[A-Za-z0-9]{16,}|gsk_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}|tskey-[A-Za-z0-9-]{16,}|sbp_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,})/g, TAPADO],
  // JWT (eyJ….….…): tokens de Supabase y de sesión.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, TAPADO],
]

/** Tapa llaves, tokens y contraseñas de un texto. Idempotente: tapar dos veces da lo mismo. */
export function taparSecretos(texto: string): string {
  let t = texto
  for (const [re, por] of SECRETOS) t = t.replace(re, por)
  return t
}

// ── Dinero ──

const MONEDA = '(?:USD|MXN|EUR|COP|ARS|CLP|PEN|CRC|usd|mxn|eur|d[óo]lares|pesos|euros|dlls?)(?![A-Za-zÀ-ÿ])'
const NUMERO = '\\d(?:[\\d.,]*\\d)?(?:\\s?(?:k|K|mil|M|millones)(?![A-Za-zÀ-ÿ]))?'
const DINERO = new RegExp([
  `(?:US\\$|MX\\$|\\$|€|£)\\s?${NUMERO}(?:\\s?${MONEDA})?`,
  `\\b${NUMERO}\\s?${MONEDA}\\b`,
  `\\b(?:USD|MXN|EUR)\\s?${NUMERO}`,
].join('|'), 'g')

/** Cifras con separador de miles sin moneda al lado («5 × 2,500», «pidieron 1,000»): en directo casi siempre son dinero. */
const MILES = /(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/g

/** «$3,000», «1,000 USD», «MXN 2,000», «5 mil pesos» → «$•••» / «••• USD»; «2,500» suelto → «•••». Idempotente. */
export function taparDinero(texto: string): string {
  return texto.replace(DINERO, m => {
    const moneda = m.match(/US\$|MX\$|\$|€|£/)?.[0]
    const sufijo = m.match(new RegExp(`${MONEDA}\\s*$`))?.[0]
    const prefijo = m.match(/^(USD|MXN|EUR)/)?.[0]
    if (moneda) return `${moneda}•••${sufijo ? ' ' + sufijo : ''}`
    if (prefijo) return `${prefijo} •••`
    return `•••${sufijo ? ' ' + sufijo : ''}`
  }).replace(MILES, '•••')
}

// ── Correos y teléfonos ──

const CORREO = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
/** Con lada (+52 33 3929 9456), entre paréntesis ((55) 1234-5678) o en tres bloques (33 3929 9456). Fechas y horas no caen. */
const TELEFONO = /(?<![\w+])(?:\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}|\(\d{2,3}\)\s?\d{3,4}[\s.-]?\d{4}|\b\d{2,3}[\s.-]\d{3,4}[\s.-]\d{4})(?![\w])/g

export const taparCorreo = (correo: string): string => `${correo.trim()[0]?.toLowerCase() ?? ''}•••@•••`
export function taparCorreos(texto: string): string { return texto.replace(CORREO, taparCorreo) }
export function taparTelefonos(texto: string): string {
  return texto.replace(TELEFONO, m => (m.replace(/\D/g, '').length >= 8 ? (m.trim().startsWith('+') ? '+•• ••• ••• ••••' : '••• ••• ••••') : m))
}

// ── Nombres ──

/** «Fulano Mengano» → «F. M.»; «Zutano» → «Z.». */
export function iniciales(nombre: string): string {
  return nombre.split(/[\s-]+/).filter(Boolean).map(p => `${p[0]!.toLocaleUpperCase('es')}.`).join(' ')
}

const VARIANTES: Record<string, string> = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû', n: 'nñ', c: 'cç' }
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Un término como patrón que acepta el nombre con o sin acentos. */
function patronDe(termino: string): string {
  return [...termino.normalize('NFD').replace(/[\u0300-\u036f]/g, '')].map(ch => {
    const v = VARIANTES[ch.toLowerCase()]
    if (v) return `[${v}${v.toUpperCase()}]`
    if (/\s/.test(ch)) return '\\s+'
    return /[a-z]/i.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escapar(ch)
  }).join('')
}

export interface Diccionario {
  /** Nombres, apellidos y alias de fundadores y clientes (ya sin el del dueño). */
  nombres: string[]
  /** Correos y teléfonos literales de esas personas (los genéricos ya caen por patrón). */
  literales?: string[]
}

/** Palabras que nunca se tapan aunque aparezcan como nombre de alguien (cortas, comunes o del producto). */
const NUNCA = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'san', 'arbrain', 'levy', 'fundador', 'cliente', 'ing', 'dr', 'dra'])

/** Del diccionario a UN regex (los términos largos primero, para que «Fulano Mengano» gane a «Fulano»). null si no hay nombres. */
export function compilarNombres(d: Diccionario, excluir: string[] = []): RegExp | null {
  const fuera = new Set(excluir.map(x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()))
  const terminos = [...new Set(d.nombres.map(n => n.trim().replace(/\s+/g, ' ')).filter(n => {
    const llano = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return n.length >= 3 && !NUNCA.has(llano) && !fuera.has(llano)
  }))].sort((a, b) => b.length - a.length)
  if (!terminos.length) return null
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${terminos.map(patronDe).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
}

export interface Velo { nombres: RegExp | null; literales: string[] }
export function velo(d: Diccionario, excluir: string[] = []): Velo {
  return { nombres: compilarNombres(d, excluir), literales: [...new Set((d.literales ?? []).map(x => x.trim()).filter(x => x.length >= 6))].sort((a, b) => b.length - a.length) }
}

/**
 * Todo junto, en el orden que no se pisa: secretos → correos → teléfonos → dinero → literales → nombres. Idempotente: lo
 * que deja (iniciales, ••••) no vuelve a coincidir con ningún patrón.
 */
export function enmascarar(texto: string, v: Velo | null): string {
  if (!texto || !/[\p{L}\d$€£]/u.test(texto)) return texto
  let t = taparSecretos(texto)
  t = taparCorreos(t)
  t = taparTelefonos(t)
  t = taparDinero(t)
  if (v) {
    for (const lit of v.literales) if (t.includes(lit)) t = t.split(lit).join(lit.includes('@') ? taparCorreo(lit) : '•••')
    if (v.nombres) t = t.replace(v.nombres, m => iniciales(m))
  }
  return t
}

/**
 * Un documento HTML (lo que pinta el visor en su iframe, fuera del alcance del velo de la app): enmascara el TEXTO entre
 * etiquetas; `<script>`, `<style>` y los atributos quedan intactos para no romper la página.
 */
export function velarHtml(html: string, v: Velo | null): string {
  return html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/i).map((trozo, i) =>
    i % 2 === 1 ? trozo : trozo.replace(/>([^<]+)</g, (_, texto: string) => `>${enmascarar(texto, v)}<`),
  ).join('')
}
