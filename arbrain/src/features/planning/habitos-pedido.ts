/**
 * Ctrl+H (22 oct 2026): abre el Calendario del panel en el Día de hoy y lleva el foco a «Hábitos de hoy». El Calendario puede
 * tardar en montarse, así que el pedido queda anotado unos segundos y la fila lo recoge al aparecer (o al oír el evento).
 */
export const EVENTO_HABITOS = 'habitos:abrir'
const VIGENCIA_MS = 6000
let pedidoEn = 0

export function pedirHabitos(ahora = Date.now()) {
  pedidoEn = ahora
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_HABITOS))
}

/** ¿Hay un pedido vigente? Lo consume: solo una fila responde. */
export function tomarPedidoHabitos(ahora = Date.now()): boolean {
  const vigente = pedidoEn > 0 && ahora - pedidoEn < VIGENCIA_MS
  if (vigente) pedidoEn = 0
  return vigente
}
