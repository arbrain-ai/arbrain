/**
 * ¿Esta ventana tiene un stream de chat vivo? (4 oct 2026, actualizar sin cortar.)
 * Almacén de módulo: lo escribe useChat al cambiar `loading` y lo lee el actualizador de la app, que vive
 * fuera del árbol del chat. Un contador (no un booleano) porque pueden coexistir varios useChat.
 */
let vivos = 0
export function marcarStreamLocal(activo: boolean): void {
  vivos = Math.max(0, vivos + (activo ? 1 : -1))
}
export const hayStreamLocal = (): boolean => vivos > 0
