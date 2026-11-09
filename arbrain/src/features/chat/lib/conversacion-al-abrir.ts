/**
 * Volver a la conversación donde te quedaste (9 nov 2026, Daniel: «en móvil al cerrar y volver a abrir no recuerda en la
 * conversación que estaba»). ChatPanel abre, en orden: un enlace vigente (`?session=` de un push o de Levy), la conversación
 * de esta navegación y la última que tuvo abierta.
 *
 * El enlace no se borra de la URL (tocar `window.history` confunde al App Router en la PWA de iOS) y el iPhone reabre la app
 * con su última URL. Sin esto, abrir un push, cambiarte a otra conversación y cerrar te regresaría a la del push. Por eso, en
 * el primer montaje desde que cargó la app, un enlace idéntico al último ya usado es viejo y no cuenta. Dentro de la app un
 * enlace siempre manda, aunque se toque dos veces.
 */
export const CLAVE_ULTIMO_ENLACE = 'mc_ultimoEnlaceChat'

let primerMontaje = true
/** Solo la primera llamada desde que cargó la app es «en frío». */
export function esPrimerMontajeDelChat(): boolean {
  const era = primerMontaje
  primerMontaje = false
  return era
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

/** La conversación que pide la URL si el enlace sigue vigente; null si no hay enlace o si ya se usó. */
export function sesionDeEnlaceVigente(busqueda: string, enFrio: boolean, almacen: Almacen): string | null {
  const sesion = new URLSearchParams(busqueda).get('session')
  if (!sesion) return null
  try {
    const yaUsado = enFrio && almacen.getItem(CLAVE_ULTIMO_ENLACE) === busqueda
    almacen.setItem(CLAVE_ULTIMO_ENLACE, busqueda)
    return yaUsado ? null : sesion
  } catch {
    // Sin almacenamiento no se puede saber si es viejo: el enlace manda.
    return sesion
  }
}
