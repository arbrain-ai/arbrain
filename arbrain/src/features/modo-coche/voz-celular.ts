/**
 * La voz que viaja al celular (complemento de SFlow 2.3).
 *
 * Si tu agente te habla con la voz directa de SFlow (`decir.py`, skill modo-voz) y tú estás usando Arbrain desde el
 * celular, la frase suena aquí, en el celular, y la Mac se calla. Así:
 *   1. El celular avisa que lo estás usando: con cada toque (a lo sumo cada 15 s) escribe la hora en
 *      `telefono-activo.json` de la carpeta de configuración de tu Arbrain (`/api/modo-coche/telefono-activo`). Al pasar
 *      a segundo plano, lo borra: la Mac vuelve a hablar.
 *   2. SFlow (`claude_hooks/celular.py`) lo lee: si el celular se tocó más reciente que la Mac, `decir.py` no suena en la
 *      Mac y deja la frase en su salida con la marca `VOZ_EN_TELEFONO: …`.
 *   3. El chat ve esa marca en el resultado del comando y la dice aquí con la voz del modo coche (`voz-coche.ts`): tu
 *      llave de LemonFox de Arbrain o, sin ella, la mejor voz en español del celular.
 * Límite de iOS: con el celular bloqueado o Arbrain en segundo plano no hay voz (la respuesta queda escrita).
 * Sin SFlow 2.3 no pasa nada: nadie escribe la marca. Apagarla: `localStorage['arbrain-voz-celular'] = 'no'`.
 */
import { decirFrase, desbloquearVoz } from './voz-coche'

const CLAVE = 'arbrain-voz-celular'
const RUTA = '/api/modo-coche/telefono-activo'
const CADA_MS = 15_000
const MARCA = /^VOZ_EN_TELEFONO: (.+)$/gm

let iniciado = false
let ultimoAviso = 0

/** ¿Aparato táctil (iPhone, iPad)? El iPad con iPadOS se presenta como Mac, pero tiene toques; una Mac tiene 0. */
export function esTactilAhora(): boolean {
  if (typeof window === 'undefined') return false
  const toques = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0
  const grueso = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches
  return toques > 1 || grueso
}

const encendida = (): boolean => {
  try { return localStorage.getItem(CLAVE) !== 'no' } catch { return true }
}

/** De la salida de un comando, las frases marcadas para el celular (una por línea). Puro, para las pruebas. */
export function frasesParaTelefono(salida: string): string[] {
  return [...(salida ?? '').matchAll(MARCA)].map(m => m[1].trim()).filter(Boolean)
}

function avisar(forzar = false): void {
  const ahora = Date.now()
  if (!forzar && ahora - ultimoAviso < CADA_MS) return
  ultimoAviso = ahora
  void fetch(RUTA, { method: 'POST', keepalive: true }).catch(() => {})
}

function alTocar(): void {
  if (!encendida()) return
  desbloquearVoz() // iOS solo deja sonar audio después de un toque
  avisar()
}

function alCambiarVista(): void {
  if (document.visibilityState !== 'hidden') { if (encendida()) avisar(true); return }
  ultimoAviso = 0
  void fetch(RUTA, { method: 'DELETE', keepalive: true }).catch(() => {})
}

/** Una vez, al montar el chat. En la computadora no hace nada (ahí habla SFlow). */
export function iniciarVozCelular(): void {
  if (iniciado || typeof window === 'undefined' || !esTactilAhora()) return
  iniciado = true
  document.addEventListener('touchend', alTocar, { passive: true, capture: true })
  document.addEventListener('click', alTocar, { passive: true, capture: true })
  document.addEventListener('visibilitychange', alCambiarVista)
}

/** El resultado de un comando del agente: si trae frases para el celular, suenan aquí (en orden). */
export function vozDelComando(salida: string | undefined): void {
  if (!salida || !salida.includes('VOZ_EN_TELEFONO: ')) return
  if (typeof window === 'undefined' || !esTactilAhora() || !encendida() || document.visibilityState === 'hidden') return
  for (const frase of frasesParaTelefono(salida)) decirFrase(frase)
}

export function apagarVozCelular(): void {
  try { localStorage.setItem(CLAVE, 'no') } catch { /* modo privado */ }
  void fetch(RUTA, { method: 'DELETE' }).catch(() => {})
}
export function encenderVozCelular(): void {
  try { localStorage.removeItem(CLAVE) } catch { /* modo privado */ }
  avisar(true)
}
