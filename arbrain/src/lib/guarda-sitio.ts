/**
 * Guarda de escrituras entre sitios para la instalación de Daniel (noche de seguridad 21→22 oct 2026, carril 5-STUDIO).
 *
 * `ts.net` está en la Public Suffix List: todo `*.<tailnet>.ts.net` (los otros Funnel del Studio, el Mini, la
 * audioteca) es el mismo «sitio» que la web, y SameSite=Lax deja viajar la cookie de sesión en un POST desde ahí. Con
 * un HTML inyectado en cualquiera de ellos se le podían mandar mensajes al agente con la sesión de Daniel.
 *
 * Solo `Sec-Fetch-Site` (lo pone el navegador y una página no lo puede falsear): detrás del Funnel Next ve `http:` y
 * comparar Origin con Host negaría todo. Se aplica solo si la petición lleva la cookie de sesión; lo que va con bearer
 * (daemon, agentes) o sin cookie (el iframe opaco del pizarrón) sigue igual.
 */
const SIN_EFECTO = ['GET', 'HEAD', 'OPTIONS']

export function escrituraEntreSitios(metodo: string, ruta: string, cab: {
  secFetchSite: string | null; authorization: string | null; conCookieDeSesion: boolean
}): boolean {
  if (!ruta.startsWith('/api/') || SIN_EFECTO.includes(metodo.toUpperCase())) return false
  if (!cab.conCookieDeSesion || cab.authorization?.startsWith('Bearer ')) return false
  return cab.secFetchSite === 'same-site' || cab.secFetchSite === 'cross-site'
}
