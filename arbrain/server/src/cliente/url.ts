/**
 * Señales de exfiltración en una URL (red team 2 M-5 y A-2, 11 oct 2026). Pura: la usan la política de los agentes
 * (WebFetch) y el freno de navegación de manos (`navegar`, `web_abrir`, `web_navegar`).
 */

/** Largo a partir del cual una query o un fragmento puede llevar datos (≈ una línea de texto). */
export const QUERY_MAX = 64
const BASE64 = /[A-Za-z0-9+/_-]{40,}={0,2}/
const HEX = /\b[0-9a-f]{32,}\b/i
const PATH_LARGO_B64 = /[A-Za-z0-9+_-]{64,}={0,2}/
const PATH_LARGO_HEX = /\b[0-9a-f]{48,}\b/i

export function parsearUrl(url: string): URL | null {
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`) } catch { return null }
}

/** Host sin `www.` ni punto final, en minúsculas. */
export const hostDe = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')

/** Etiquetas DNS que no nombran a nadie («web», «www», «app», «com», «mx»…). */
const ETIQUETAS_GENERICAS = new Set(['www', 'web', 'app', 'apps', 'mail', 'login', 'auth', 'api', 'docs', 'help', 'support', 'accounts', 'account', 'static', 'cdn', 'com', 'net', 'org', 'info', 'edu', 'gov', 'gob', 'site', 'online', 'shop', 'store', 'blog', 'news', 'home', 'portal', 'secure', 'my'])
/**
 * A5 (0.2.15): ¿la persona nombró este sitio en el chat? Una etiqueta del host de 4+ letras que no sea genérica
 * («whatsapp» en web.whatsapp.com, «skool» en skool.com) dentro de uno de sus mensajes recientes (ya normalizados).
 * Así «envíame un WhatsApp» aprueba abrir web.whatsapp.com sin el clic de «sitio nuevo», y una conversación contaminada
 * no toma esa misma dirección por «una dirección que no apareció en lo que pediste». Pura.
 */
const SUFIJOS = new Set(['com', 'co', 'org', 'net', 'gob', 'gov', 'edu', 'ac', 'or', 'ne'])
export function hostNombradoEnVoz(h: string, voz: readonly string[]): boolean {
  // Sin el sufijo público («.test», «.mx», «.com.mx»): un correo «@cliente.test» en el chat no nombra a evil.test.
  const partes = h.toLowerCase().split('.')
  partes.pop()
  if (partes.length > 1 && SUFIJOS.has(partes[partes.length - 1])) partes.pop()
  const etiquetas = partes.filter(e => e.length >= 4 && !ETIQUETAS_GENERICAS.has(e) && !/^\d+$/.test(e))
  return etiquetas.some(e => voz.some(v => v.includes(e)))
}

const decodificar = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
const mezcla = (s: string) => /\d/.test(s) && /[A-Za-z]/.test(s)

/** ¿La URL puede estar sacando datos? Devuelve la señal o null. */
export function senalExfiltracion(url: string): string | null {
  const u = parsearUrl(url)
  if (!u) return null
  const query = u.search.replace(/^\?/, ''), frag = u.hash.replace(/^#/, '')
  if (query.length > QUERY_MAX) return `la URL lleva ${query.length} caracteres de datos en la query`
  if (frag.length > QUERY_MAX) return `la URL lleva ${frag.length} caracteres de datos en el fragmento`
  const datos = decodificar(`${query} ${frag}`)
  const b = BASE64.exec(datos)?.[0]
  if (b && mezcla(b)) return 'la URL lleva datos que parecen codificados (base64)'
  if (HEX.test(datos)) return 'la URL lleva datos que parecen codificados (hex)'
  const ruta = decodificar(u.pathname)
  const pb = PATH_LARGO_B64.exec(ruta)?.[0]
  if ((pb && mezcla(pb)) || PATH_LARGO_HEX.test(ruta)) return 'la ruta de la URL lleva datos que parecen codificados'
  if ((u.username || u.password)) return 'la URL lleva usuario o contraseña'
  return null
}
