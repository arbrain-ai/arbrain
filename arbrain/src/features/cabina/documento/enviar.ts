/**
 * Lo que el visor le dice a Levy (8 oct 2026): un instante marcado, una cita de un PDF. Va por el mismo cable que el resto de la
 * Cabina: el evento `cabina:enviar` que atiende el chat. Fuera del chat deja el texto pendiente y lleva a Daniel a /chat.
 * En los bancos (`*-lab`) solo se deja constancia en `window.__visorChat`: las pruebas y las capturas lo leen de ahí.
 */
export function pedirALevy(texto: string): 'enviado' | 'banco' | 'camino-al-chat' {
  const ruta = window.location.pathname
  if (ruta.startsWith('/visor-lab')) {
    const w = window as unknown as { __visorChat?: string[] }
    ;(w.__visorChat ??= []).push(texto)
    window.dispatchEvent(new CustomEvent('visor:enviado', { detail: { texto } }))
    return 'banco'
  }
  if (ruta.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('cabina:enviar', { detail: { texto } })); return 'enviado' }
  try { sessionStorage.setItem('cabina:pendiente', texto) } catch { /* sin almacenamiento */ }
  window.location.assign('/chat')
  return 'camino-al-chat'
}
