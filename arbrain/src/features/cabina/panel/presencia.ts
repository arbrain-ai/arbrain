/**
 * Quién es este cliente del bus del panel (8 oct 2026). Un pedido de Levy (`mostrar`) va SOLO al cliente que tiene abierta la
 * conversación que lo pidió, o al último donde Daniel escribió en ella; nunca a «cualquier cliente conectado». Para que el Studio lo
 * sepa, cada cliente reporta en su latido:
 *  - `dispositivo`: un id estable de esta app instalada o de este perfil de navegador (localStorage), para que la cola de pedidos
 *    sobreviva a recargar o reiniciar la app (la sesión, en cambio, es de la ventana);
 *  - `escribio`: en qué conversaciones escribió Daniel aquí y cuándo (sessionStorage: es de esta ventana o pestaña).
 * Sin React ni tienda: el chat solo llama `anotarEscritura`, el bus lee `dispositivoId` y `escrituras`.
 */
const CLAVE_DISPOSITIVO = 'arbrain.panelBus.dispositivo'
const CLAVE_ESCRIBIO = 'arbrain.panelBus.escribio'

const aleatorio = () => Math.random().toString(36).slice(2, 10)

/** El id estable de este dispositivo (app o perfil de navegador). */
export function dispositivoId(): string {
  try {
    let id = localStorage.getItem(CLAVE_DISPOSITIVO)
    if (!id) { id = `d-${aleatorio()}${aleatorio()}`; localStorage.setItem(CLAVE_DISPOSITIVO, id) }
    return id
  } catch { return `d-${aleatorio()}` }
}

/** La conversación sin el prefijo `sdk:` (el chat y Levy la nombran de las dos formas). */
export const sinSdk = (id: string) => id.replace(/^sdk:/, '')

export function escrituras(): Record<string, string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE_ESCRIBIO) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === 'string')) as Record<string, string> : {}
  } catch { return {} }
}

/** Daniel acaba de escribir en esta conversación, en este cliente. Se guardan las 20 más recientes. */
export function anotarEscritura(conversacion: string | null | undefined, ahora = new Date()) {
  if (!conversacion) return
  try {
    const todas = { ...escrituras(), [sinSdk(conversacion)]: ahora.toISOString() }
    const recientes = Object.entries(todas).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 20)
    sessionStorage.setItem(CLAVE_ESCRIBIO, JSON.stringify(Object.fromEntries(recientes)))
  } catch { /* sin almacenamiento */ }
}
