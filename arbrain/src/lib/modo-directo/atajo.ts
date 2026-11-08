/** ⌘⇧D (Ctrl+Shift+D fuera de Mac) prende o apaga el modo directo desde cualquier lugar, también escribiendo (7 nov 2026). */
export const ATAJO_DIRECTO = ['⌘', '⇧', 'D'] as const
export function esAtajoDirecto(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'code'>): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'KeyD'
}
