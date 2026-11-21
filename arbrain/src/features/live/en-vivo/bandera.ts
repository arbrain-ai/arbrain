// Bandera de «Levy en vivo» (18 nov 2026, Daniel: «quiero incluir todo esto en mi Arbrain… para la conversación contigo»).
// APAGADA por defecto: sin ella Live, la voz y la cara son exactamente las de antes.
//
// Encendida, en Live: hablas con manos libres (botón de onda junto al micrófono), Levy te contesta con su voz LOCAL
// (Qwen3-TTS en el Studio, Adam en el chip: la voz de los videos) y su cara de los videos mueve la boca con los tiempos
// reales de esa voz. Lo que oye el micrófono se transcribe en el Studio y solo se manda con tu palabra («cambio», «dale»)
// o tu Enter. Nada de voz sale a la nube.
//
// Encender: Ajustes › Apariencia › Levy en Live › «En vivo (prueba)». También abriendo Arbrain con `?levyEnVivo=1`
// (queda guardado; `?levyEnVivo=0` la apaga) o a mano: localStorage.setItem('arbrain-levy-en-vivo', '1').
export const LEVY_EN_VIVO_CLAVE = 'arbrain-levy-en-vivo'
/** Cómo se manda lo que dices: con tu palabra (por defecto) o solo, tras el silencio. */
export const MODO_ENVIO_CLAVE = 'arbrain-levy-en-vivo-envio'
export type ModoEnvio = 'palabra' | 'auto'

export function levyEnVivoActivo(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('levyEnVivo')
    if (q === '1' || q === '0') window.localStorage.setItem(LEVY_EN_VIVO_CLAVE, q)
    return window.localStorage.getItem(LEVY_EN_VIVO_CLAVE) === '1'
  } catch { return false }
}

export const LEVY_EN_VIVO_EVENTO = 'arbrain:levy-en-vivo'

export function fijarLevyEnVivo(on: boolean) {
  try { window.localStorage.setItem(LEVY_EN_VIVO_CLAVE, on ? '1' : '0') } catch { /* sin almacenamiento */ }
  try { window.dispatchEvent(new CustomEvent(LEVY_EN_VIVO_EVENTO, { detail: on })) } catch { /* sin ventana */ }
}

export function modoEnvio(): ModoEnvio {
  try { return window.localStorage.getItem(MODO_ENVIO_CLAVE) === 'auto' ? 'auto' : 'palabra' } catch { return 'palabra' }
}

export function fijarModoEnvio(m: ModoEnvio) {
  try { window.localStorage.setItem(MODO_ENVIO_CLAVE, m) } catch { /* sin almacenamiento: vale esta vez */ }
}
