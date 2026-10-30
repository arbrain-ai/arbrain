/**
 * DOM helpers compartidos — extraido verbatim de DrawEditor3.tsx (fase 3).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.closest('[contenteditable="true"]'))
}
