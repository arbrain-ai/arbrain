/**
 * Espacio del visor de video (5 nov 2026). Daniel, viendo un video de 14 min en la vista «documento»: «el espacio no pone
 * pausa… ya va varias veces que me para el flow».
 *
 * Dos causas, medidas en el arnés WKWebView (guiones/visor-video.json):
 *  1. El visor solo oía el espacio con el foco DENTRO de su caja (onKeyDown de React). Con el foco en el hilo, en el
 *     cuerpo o en otra pestaña del panel, la tecla nunca le llegaba.
 *  2. El lector del chat escucha Espacio en `window` (chat-speech.ts › keyHandler). Aun con el foco en el visor la
 *     tecla seguía de largo: pausaba el video Y el lector a la vez.
 *
 * Regla: con un video a la vista y el foco fuera de una caja de texto, Espacio es del video. Un solo oyente en la fase
 * de CAPTURA de `window` (antes que cualquiera) decide de quién es; si es de un visor, lo alterna y la tecla no sigue
 * (ni al lector ni al botón con el foco). Ctrl+Espacio sigue siendo del lector en todos lados: no se toca.
 */

export interface TeclaEspacio { code?: string; key?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }
/** El foco, reducido a lo que decide: si se escribe ahí o si es de otro reproductor con su propio Espacio. */
export interface FocoEspacio { escribe: boolean; propio: boolean }
export interface CandidatoEspacio { visible: boolean; contieneFoco: boolean; tocado: number }

export const esEspacioSolo = (e: TeclaEspacio) => (e.code === 'Space' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey

/** A qué visor le toca el Espacio (índice), o null si la tecla sigue su camino (escribir, el lector, el botón). */
export function quienTomaElEspacio(tecla: TeclaEspacio, foco: FocoEspacio, visores: CandidatoEspacio[]): number | null {
  if (!esEspacioSolo(tecla) || foco.escribe) return null
  const conFoco = visores.findIndex(x => x.contieneFoco)
  if (conFoco >= 0) return conFoco
  if (foco.propio) return null
  let mejor: number | null = null
  visores.forEach((x, i) => { if (x.visible && (mejor == null || x.tocado > visores[mejor].tocado)) mejor = i })
  return mejor
}

const NO_SE_ESCRIBE = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'])
export function escribeEn(el: Element | null): boolean {
  if (!el) return false
  const h = el as HTMLElement
  if (h.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !NO_SE_ESCRIBE.has(((el as HTMLInputElement).type || 'text').toLowerCase())
}

function aLaVista(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('[hidden], [inert]')) return false
  const ver = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility
  if (typeof ver === 'function' && !ver.call(el, { visibilityProperty: true, checkVisibilityCSS: true })) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
}

export interface VisorConEspacio { raiz: () => HTMLElement | null; alternar: () => void; tocado: number }
const visores = new Set<VisorConEspacio>()

function alTeclear(e: KeyboardEvent) {
  if (!esEspacioSolo(e) || e.isComposing || !visores.size) return
  const lista = [...visores]
  const activo = document.activeElement
  const foco = { escribe: escribeEn(activo), propio: !!activo?.closest('[data-espacio-propio]') }
  const i = quienTomaElEspacio(e, foco, lista.map(x => {
    const r = x.raiz()
    return { visible: !!r && aLaVista(r), contieneFoco: !!r && !!activo && r.contains(activo), tocado: x.tocado }
  }))
  if (i == null) return
  e.preventDefault()          // ni scroll de la página ni «clic» del botón que tenga el foco
  e.stopImmediatePropagation() // el lector del chat (window, burbuja) no la ve
  if (!e.repeat) lista[i].alternar()
}

/** Lo llama cada VisorVideo al montarse; devuelve con qué darse de baja. `tocado` lo actualiza el visor al tocarlo. */
export function registrarVisor(v: VisorConEspacio): () => void {
  if (!visores.size) window.addEventListener('keydown', alTeclear, true)
  visores.add(v)
  return () => {
    visores.delete(v)
    if (!visores.size) window.removeEventListener('keydown', alTeclear, true)
  }
}
