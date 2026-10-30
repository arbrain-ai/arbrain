// Chrome haciéndose pasar por el WKWebView de la app de escritorio (7 oct 2026). Allí `window.screenX/screenY/outerWidth/outerHeight`
// NO son reales (medido con un WKWebView suelto: 0, la altura del monitor principal, 0, 0) aunque los `screenX/screenY`
// de los EVENTOS de puntero sí lo son. Con esa geometría, la socia de otra ventana quedaba fuera de su sitio y soltar una pestaña
// sobre su tira abría una ventana nueva en vez de estamparse. Este archivo se importa primero en cada página de la prueba:
// la página ve lo que vería en la app y la prueba conserva la geometría real en `window.__geomReal()`.
const w = window as unknown as Record<string, unknown>
const nombres = ['screenX', 'screenY', 'outerWidth', 'outerHeight'] as const
const lector = (n: string) => {
  const d = Object.getOwnPropertyDescriptor(window, n) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), n)
  return () => (d?.get ? d.get.call(window) : d?.value) as number
}
const reales = Object.fromEntries(nombres.map(n => [n, lector(n)])) as Record<(typeof nombres)[number], () => number>
w.__geomReal = () => ({ screenX: reales.screenX(), screenY: reales.screenY(), outerWidth: reales.outerWidth(), outerHeight: reales.outerHeight(), innerWidth: window.innerWidth, innerHeight: window.innerHeight })
const mentiras = { screenX: 0, screenY: 1440, outerWidth: 0, outerHeight: 0 }
for (const n of nombres) Object.defineProperty(window, n, { get: () => mentiras[n], configurable: true })
