/**
 * «Marcar como no leído» (1 oct 2026) sobre la conversación que está ABIERTA. ChatPanel marca como vista
 * cualquier conversación a la vista que aparezca sin ver (un turno que termina con ella abierta, volver a
 * la pestaña); sin esta marca, ese efecto deshacía el «no leído» al instante.
 *
 * La marca vale para ese último mensaje: si llega otro mensaje, o la abres de nuevo desde la lista
 * (handleSelectSession), deja de valer y la conversación vuelve a marcarse vista como siempre.
 */
const marcas = new Map<string, string>()

export const marcarAMano = (id: string, ultimoMensaje: string | null | undefined) => { marcas.set(id, ultimoMensaje ?? '') }
export const fueAMano = (id: string, ultimoMensaje: string | null | undefined) => marcas.get(id) === (ultimoMensaje ?? '')
export const olvidarAMano = (id: string) => { marcas.delete(id) }
