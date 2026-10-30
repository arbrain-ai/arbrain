/**
 * «Dónde abre Levy» (7 oct 2026), parte pura. Daniel trabaja con dos ventanas de Arbrain y dijo: «as default siempre me abrirás todo
 * en la ventana de la izquierda… en el derecho suelo tener el Día y el Taller de agentes». La ventana se elige por su POSICIÓN REAL en
 * la pantalla (la que mide la app con la API de Tauri, geometria-ventana.ts), no por su número: «Ventana 1» puede estar a cualquier lado.
 *
 * Sin React ni Tauri: ventanas.ts mide y esta función decide (tests/panel/destino-levy.test.ts).
 */
import { nombreVentana, PRINCIPAL } from './pestanas-fuera'
import type { Donde } from './menu-orden'
import { NOMBRE_DUENO } from '@/config'

/** Una ventana que existe y su borde izquierdo en la pantalla (puntos). */
export interface Medida { ventana: string; izquierda: number }

/** La ventana que recibe lo que abre Levy. Si la elegida no existe o no se midió, el panel principal: no se pierde nada. */
export function elegirVentana(donde: Donde, medidas: Medida[]): string {
  if (donde === 'principal') return PRINCIPAL
  const validas = medidas.filter(m => Number.isFinite(m.izquierda))
  if (validas.length < 2) return validas[0]?.ventana ?? PRINCIPAL
  // El borde más a la izquierda (o a la derecha); si dos ventanas empiezan en el mismo punto, la principal.
  const orden = [...validas].sort((a, b) => (donde === 'izquierda' ? a.izquierda - b.izquierda : b.izquierda - a.izquierda) || Number(b.ventana === PRINCIPAL) - Number(a.ventana === PRINCIPAL))
  return orden[0].ventana
}

/** Para el acuse de Levy: «Ventana 1 (la de la izquierda)», «Panel principal (la única ventana)». */
export function describirDestino(donde: Donde, ventana: string, medidas: Medida[]): string {
  const nombre = nombreVentana(ventana)
  if (medidas.filter(m => Number.isFinite(m.izquierda)).length < 2) return `${nombre} (la única ventana que respondió)`
  if (donde === 'principal') return `${nombre} (así lo eligió ${NOMBRE_DUENO()})`
  return `${nombre} (la de la ${donde})`
}
