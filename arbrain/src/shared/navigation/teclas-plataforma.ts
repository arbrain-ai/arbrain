/**
 * Atajos según el sistema (17 nov 2026, un fundador de la cohorte en Windows): la lista de atajos se escribe con los símbolos de Mac
 * (⌘ ⌥ ⇧), que en Windows y Linux no existen en el teclado. Aquí se decide una sola vez si la máquina es Mac y se
 * traducen las etiquetas al pintarlas (⌘ → Ctrl, ⌥ → Alt, ⇧ → Shift; «⌘+D» → «Ctrl+D»). En Mac todo queda igual.
 *
 * `modPrincipal` es la tecla de los atajos «⌘…» en los manejadores: ⌘ en Mac y Ctrl fuera de Mac (en Windows ⌘ es la
 * tecla Windows y el sistema se queda con Win+B, Win+J, Win+, …). Puro, para probarlo con `node --test`.
 */
import { useSyncExternalStore } from 'react'

interface NavegadorMinimo { platform?: string; userAgent?: string; userAgentData?: { platform?: string } }

/** ¿Mac (o iPhone/iPad)? Sin ventana (servidor, Node, que también trae `navigator`) se asume Mac: así se pintaba hasta hoy. */
export function esMac(nav: NavegadorMinimo | undefined = typeof window === 'undefined' || typeof navigator === 'undefined' ? undefined : navigator as NavegadorMinimo): boolean {
  if (!nav) return true
  const p = nav.userAgentData?.platform || nav.platform || ''
  if (p) return /mac|iphone|ipad|ipod/i.test(p)
  return /Macintosh|Mac OS X|iPhone|iPad/i.test(nav.userAgent ?? '')
}

const NOMBRE: Record<string, string> = { '⌘': 'Ctrl', '⌃': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' }

/** La etiqueta de una tecla (o combinación en texto: «⌘+D», «⌥1», «⌘Shift+Z») como se ve en este sistema. */
export function etiquetaTecla(tecla: string, mac = esMac()): string {
  if (mac) return tecla
  return tecla
    .replace(/[⌘⌃⌥⇧](?=[^\s+/])/g, (s) => `${NOMBRE[s]}+`)
    .replace(/[⌘⌃⌥⇧]/g, (s) => NOMBRE[s])
}

/** Un texto visible con atajos dentro («Esconder (⌘J · Esc)») como se ve en este sistema. */
export const textoConAtajos = etiquetaTecla

interface TeclaMod { metaKey: boolean; ctrlKey: boolean }
/** La tecla de los atajos «⌘…»: ⌘ sola en Mac; Ctrl sola fuera de Mac. */
export function modPrincipal(e: TeclaMod, mac = esMac()): boolean {
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

/** AltGr de Windows llega como Ctrl+Alt: lo que se escribe con AltGr (@, #, [, ]) no es un atajo. En Mac nunca hay
 *  AltGr: WebKit puede reportar Option como `AltGraph` y ⌘⌥B dejaría de responder (revisión del 18 nov 2026). */
export function esAltGr(e: { getModifierState?: (tecla: string) => boolean }, mac = esMac()): boolean {
  if (mac) return false
  try { return !!e.getModifierState?.('AltGraph') } catch { return false }
}

const nada = () => () => {}
/** Hook: en el servidor y en el primer pintado, Mac (como hasta hoy); en el navegador, lo que sea la máquina. */
export function useEsMac(): boolean {
  return useSyncExternalStore(nada, () => esMac(), () => true)
}
