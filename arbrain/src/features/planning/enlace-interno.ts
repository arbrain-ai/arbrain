/**
 * Enlaces que apuntan a la propia app (17 nov 2026, «ver después» de Contenido): un evento con `…/youtube?ver=<id>` debe
 * abrir ese video en la Sala, DENTRO de Arbrain, no en el navegador del sistema (la app de escritorio manda todo
 * `target=_blank` afuera). El origen no es estable: el Studio sirve en 127.0.0.1:3300 y la app cae a 3218 mientras se
 * despliega, y el enlace pudo escribirse desde otro origen (`localhost:3000`). Por eso se reconoce por RUTA:
 *  · mismo origen que la página → interno, cualquier ruta;
 *  · los dos en loopback (localhost, 127.0.0.1, ::1), puerto distinto → interno solo si la ruta es de esta app.
 * Lo demás (Meet, Drive, YouTube, otros servicios locales como el de videos en :8099 si no es ruta de la app) sigue
 * abriendo afuera como siempre.
 */

/** Primeras partes de ruta de `src/app/(main)` (la prueba vigila que no se desfase). */
export const RUTAS_APP = ['activity', 'bi', 'board', 'calendar', 'casa', 'chat', 'cohorte', 'command-center', 'comments', 'content-funnel',
  'conversations', 'cron', 'draw3', 'equipo', 'estrategia', 'extensiones', 'finanzas', 'historia', 'hoy', 'inicio-v2', 'intel', 'lienzo', 'masterclass',
  'memoria', 'ml-dashboard', 'negocio', 'objectives', 'ops', 'pantalla', 'perro', 'rutinas', 'salud', 'segundo-cerebro', 'servidores',
  'settings', 'sistema', 'telefono', 'todotask', 'vision', 'youtube'] as const

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** La ruta interna (`/youtube?ver=…`) si el enlace es de esta app; si no, null. `actual` = `location.href`. */
export function rutaInterna(enlace: string, actual: string): string | null {
  let u: URL, a: URL
  try { u = new URL(enlace, actual); a = new URL(actual) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const ruta = `${u.pathname}${u.search}${u.hash}`
  if (u.origin === a.origin) return ruta
  const primera = u.pathname.split('/')[1] ?? ''
  if (LOOPBACK.has(u.hostname) && LOOPBACK.has(a.hostname) && (RUTAS_APP as readonly string[]).includes(primera)) return ruta
  return null
}

/** El video de «ver después» de un evento: su enlace interno a `/youtube?ver=<id>`, si lo tiene. */
export function videoDeEvento(e: { description?: string | null; location?: string | null }, actual: string): string | null {
  for (const m of `${e.description ?? ''}\n${e.location ?? ''}`.match(/https?:\/\/[^\s<>()\]"'`]+/g) ?? []) {
    const r = rutaInterna(m.replace(/[.,;:!?)»]+$/, ''), actual)
    if (r && /^\/youtube\?(?:.*&)?ver=[\w-]{11}/.test(r)) return r
  }
  return null
}
