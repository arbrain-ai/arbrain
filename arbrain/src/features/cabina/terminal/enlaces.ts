/**
 * Enlaces en las terminales de Arbrain (30 oct 2026, login de Claude en un VPS real): el enlace largo de
 * `claude auth login` ocupa 5 o 6 renglones y no se podía abrir. Dos caminos, los dos al navegador del sistema por
 * `abrirEnNavegador` (en la app de escritorio `window.open` y el `confirm` que trae xterm por defecto no hacen nada):
 *   1. Hipervínculos OSC 8 (los que pinta Claude Code y `nube.sh`): `linkHandler` de xterm.
 *   2. Direcciones http(s) en texto plano, también partidas en varios renglones por el ajuste de la terminal: un
 *      proveedor de enlaces que junta los renglones envueltos de la misma línea lógica.
 * Solo http y https; nada de `javascript:` ni `file:`.
 */
import type { IDisposable, ILink, ILinkHandler, Terminal } from '@xterm/xterm'
import { abrirEnNavegador } from '@/lib/navegador'

const URL_EN_TEXTO = /https?:\/\/[^\s"'<>`]+/g
// Puntuación que cierra una frase, no el enlace: «visita https://x.ai/a.» o «(https://x.ai/a)».
const COLA_FUERA = /[.,;:!?'")\]}>]+$/
const MAX_RENGLONES = 64

export const esWeb = (url: string) => /^https?:\/\//i.test(url)

/** Una celda con texto de la línea lógica: su carácter y su posición (0-based) en el búfer. */
export interface Celda { ch: string; fila: number; x: number }
export interface Enlace { url: string; inicio: { fila: number; x: number }; fin: { fila: number; x: number } }

/** Los enlaces http(s) de una línea lógica ya puesta en celdas, con la celda donde empiezan y la última que ocupan. */
export function enlacesEnCeldas(celdas: Celda[]): Enlace[] {
  const texto = celdas.map(c => c.ch).join('')
  const fuera: Enlace[] = []
  for (const m of texto.matchAll(URL_EN_TEXTO)) {
    const url = m[0].replace(COLA_FUERA, '')
    if (url.length <= 'https://'.length) continue
    const a = celdas[m.index], b = celdas[m.index + url.length - 1]
    fuera.push({ url, inicio: { fila: a.fila, x: a.x }, fin: { fila: b.fila, x: b.x } })
  }
  return fuera
}

/** La línea lógica que contiene la fila `y` (0-based): sus renglones envueltos, celda por celda (anchos dobles incluidos). */
function celdasDeLinea(term: Terminal, y: number): Celda[] {
  const buf = term.buffer.active
  let desde = y, hasta = y
  while (desde > 0 && y - desde < MAX_RENGLONES && buf.getLine(desde)?.isWrapped) desde--
  while (hasta - y < MAX_RENGLONES && buf.getLine(hasta + 1)?.isWrapped) hasta++
  const celdas: Celda[] = []
  for (let fila = desde; fila <= hasta; fila++) {
    const linea = buf.getLine(fila)
    if (!linea) continue
    for (let x = 0; x < linea.length; x++) {
      const c = linea.getCell(x)
      if (!c || c.getWidth() === 0) continue
      for (const ch of c.getChars() || ' ') celdas.push({ ch, fila, x })
    }
  }
  return celdas
}

const abrir = (url: string) => { if (esWeb(url)) void abrirEnNavegador(url).catch(() => {}) }

export const MANEJADOR_OSC8: ILinkHandler = { activate: (_e, url) => abrir(url), allowNonHttpProtocols: false }

/** Activa los enlaces (OSC 8 y texto plano partido) en una terminal; devuelve cómo quitarlos. */
export function conEnlaces(term: Terminal): IDisposable {
  term.options.linkHandler = MANEJADOR_OSC8
  return term.registerLinkProvider({
    provideLinks(y, devolver) {
      const fila = y - 1
      const links: ILink[] = enlacesEnCeldas(celdasDeLinea(term, fila))
        .filter(e => e.inicio.fila <= fila && e.fin.fila >= fila)
        .map(e => ({
          text: e.url,
          range: { start: { x: e.inicio.x + 1, y: e.inicio.fila + 1 }, end: { x: e.fin.x + 1, y: e.fin.fila + 1 } },
          activate: () => abrir(e.url),
        }))
      devolver(links.length ? links : undefined)
    },
  })
}
