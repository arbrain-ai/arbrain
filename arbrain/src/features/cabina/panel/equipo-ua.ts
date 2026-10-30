/**
 * El aparato de un cliente, deducido en el Studio a partir de lo que el navegador manda en su petición (8 oct 2026), para que
 * `panel {accion:"listar"}` diga «Mac · Chrome · local» y no solo «Arbrain en el navegador». Es una pista legible, no una identidad:
 * quién es lo dice la sesión (solo Daniel llega al bus), no esto. Pura: tests/panel/equipo-ua.test.ts.
 */
export function describirEquipo(userAgent: string | null | undefined, host: string | null | undefined): string {
  const ua = userAgent ?? ''
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'aparato desconocido'
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /(Chrome|CriOS)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const h = (host ?? '').split(':')[0].toLowerCase()
  const donde = !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ? 'local' : `por ${h}`
  return [so, nav, donde].filter(Boolean).join(' · ')
}
