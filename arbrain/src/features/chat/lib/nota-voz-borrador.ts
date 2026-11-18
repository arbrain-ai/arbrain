/**
 * Nota de voz como borrador: al detener la grabación, lo dictado queda como BORRADOR en la caja del mensaje, junto a lo
 * que ya esté escrito, para seguir escribiendo, pegar imágenes, adjuntar o grabar otra nota y enviar todo junto. Enviar
 * al detener es opcional (Ajustes › Voz) y viene APAGADO. La preferencia es por dispositivo (computadora y teléfono por
 * separado).
 */
export const CLAVE_ENVIAR_AL_DETENER = 'arbrain:voz:enviar-al-detener'
export const EVENTO_ENVIAR_AL_DETENER = 'arbrain:voz:enviar-al-detener'

type Almacen = Pick<Storage, 'getItem' | 'setItem'>
const almacen = (): Almacen | null => { try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null } }

/** ¿La nota se envía sola al detenerla? Por defecto, no. */
export function leerEnviarAlDetener(s: Almacen | null = almacen()): boolean {
  try { return s?.getItem(CLAVE_ENVIAR_AL_DETENER) === '1' } catch { return false }
}

export function guardarEnviarAlDetener(valor: boolean, s: Almacen | null = almacen()): void {
  try { s?.setItem(CLAVE_ENVIAR_AL_DETENER, valor ? '1' : '0') } catch { /* sin storage */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_ENVIAR_AL_DETENER, { detail: { valor } }))
}

/** Lo dictado se suma al borrador: debajo de lo escrito, separado por un renglón en blanco. */
export function unirAlBorrador(actual: string, dictado: string): string {
  const nuevo = dictado.trim()
  if (!nuevo) return actual
  return actual.trim() ? `${actual.replace(/\s+$/, '')}\n\n${nuevo}` : nuevo
}
