/**
 * Aviso breve al pie de la pantalla (1 oct 2026) para las acciones del menú «⋯»: «Bifurcando…», «No se pudo
 * archivar». Imperativo y fuera de React a propósito: lo dispara una acción que puede ocurrir en «Recientes»
 * (barra lateral) o en «Ver todas» (panel del chat), y ninguno de los dos debe cargar con pintarlo. Un solo
 * aviso a la vez; uno nuevo reemplaza al anterior. Es de la persona que lo provocó: no va a la campana.
 */
export type TonoAviso = 'info' | 'ok' | 'error'

const ID = 'aviso-efimero-conversacion'
const COLOR: Record<TonoAviso, string> = {
  info: 'border-border-subtle text-foreground',
  ok: 'border-emerald-400/40 text-foreground',
  error: 'border-red-400/50 text-red-300',
}

let reloj: ReturnType<typeof setTimeout> | undefined

export function ocultarAviso() {
  clearTimeout(reloj)
  if (typeof document === 'undefined') return
  document.getElementById(ID)?.remove()
}

/** Muestra el texto; `duracionMs` 0 lo deja hasta que se llame a `ocultarAviso` (acciones largas). */
export function mostrarAviso(texto: string, tono: TonoAviso = 'info', duracionMs = 4500) {
  if (typeof document === 'undefined') return
  ocultarAviso()
  const el = document.createElement('div')
  el.id = ID
  el.setAttribute('role', tono === 'error' ? 'alert' : 'status')
  el.className = `fixed bottom-4 left-1/2 z-[90] max-w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border bg-surface/95 px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl ${COLOR[tono]}`
  el.style.marginBottom = 'env(safe-area-inset-bottom)'
  el.textContent = texto
  document.body.appendChild(el)
  if (duracionMs > 0) reloj = setTimeout(ocultarAviso, duracionMs)
}
