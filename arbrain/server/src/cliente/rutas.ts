/**
 * Rutas del daemon que solo existen en la instalación de Daniel (empaquetado, 11 oct 2026; contrato §8). En la edición
 * cliente responden 404 antes de importar nada: llaman python3, lsof, ps, launchctl, la voz de macOS o leen datos del
 * negocio de Daniel. Pura.
 */
export const MENSAJE_NO_DISPONIBLE = 'No disponible en esta edición.'

const RUTAS_SOLO_DANIEL = new Set(['/analytics/sales', '/planning', '/live/speech', '/consejo'])
// `trabajos` y `salida` entran en cliente el 29 oct 2026 (Taller › Agentes): el daemon del alumno responde solo sus
// subagentes del SDK (cabina/trabajos-cliente.ts) y la salida de esos mismos (internos.ts, por id de su registro).
const VISTAS_CABINA_SOLO_DANIEL = new Set(['negocio', 'diario', 'salud', 'masterclass', 'servidores', 'apagar', 'actividad', 'guardian-disco', 'detener', 'responder', 'comentarios', 'correr-plan', 'descartar-plan'])

export function rutaSoloDaniel(metodo: string | undefined, ruta: string, cuerpo: Record<string, unknown>): boolean {
  if (RUTAS_SOLO_DANIEL.has(ruta)) return true
  if (metodo === 'POST' && ruta === '/cabina' && typeof cuerpo.que === 'string' && VISTAS_CABINA_SOLO_DANIEL.has(cuerpo.que)) return true
  return false
}

/**
 * Red team 3 A-4: UN solo pathname para autenticar, autorizar (`rutaSoloApp`) y despachar. Antes la lista del pase
 * miraba `req.url` crudo y el router el pathname normalizado de `new URL`, así que `/x/../apagar` con el pase pasaba
 * la lista (no es `/apagar`) y el router lo atendía como `/apagar`.
 *
 * En la edición cliente nadie legítimo manda una ruta rara (la app y su web construyen rutas rectas), así que no se
 * normaliza: se exige que la ruta cruda YA sea canónica y, si no, se rechaza. Canónica = empieza por `/`; sin `#`, `\`,
 * segmentos `.`/`..`, barras dobles ni `%2e`/`%2f`/`%5c`/`%00` (en cualquier caja); decodificable; y `new URL` la deja
 * igual. Así lo que ve la lista del pase es exactamente lo que ve el router (`req.url === …` o `pathname`). Pura.
 */
export function rutaCanonica(url: string | undefined): string | null {
  const cruda = url ?? ''
  if (!cruda.startsWith('/') || cruda.startsWith('//')) return null
  const q = cruda.indexOf('?')
  const ruta = q < 0 ? cruda : cruda.slice(0, q)
  if (/[#\\\s]/.test(ruta) || /%(2e|2f|5c|00)/i.test(ruta)) return null
  let decodificada: string
  try { decodificada = decodeURIComponent(ruta) } catch { return null }
  const segmentos = decodificada.split('/').slice(1)
  if (segmentos.some((s, i) => s === '.' || s === '..' || (s === '' && i < segmentos.length - 1))) return null
  try { if (new URL(cruda, 'http://127.0.0.1').pathname !== ruta) return null } catch { return null }
  return ruta
}

/**
 * Seguridad del alumno (12 oct 2026), punto 6: DNS rebinding. Una página de internet cuyo dominio pasa a resolver a
 * 127.0.0.1 puede hablarle al daemon desde el navegador de la persona; el Bearer ya la frena, pero además el daemon
 * cliente solo atiende peticiones cuyo `Host` es él mismo en loopback (`127.0.0.1`, `localhost` o `[::1]`, con o sin el
 * puerto propio). Sin cabecera `Host` (HTTP/1.0 local) se acepta: el navegador siempre la manda. Pura.
 */
export function hostLocalValido(host: string | string[] | undefined, puerto: number): boolean {
  if (host === undefined) return true
  if (Array.isArray(host)) return false
  const m = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase())
  return !!m && (m[2] === undefined || Number(m[2]) === puerto)
}
