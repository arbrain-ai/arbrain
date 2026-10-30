import { instalacion } from '@/config'

// Identity map, never derived from a filtered/sorted row index. Retired keys
// remain reserved. Unknown future habits receive no silent reassignment.
// The keys are the owner's habits, so the map lives in the installation config (config/instalacion.ts).
export const HABIT_SHORTCUTS: Readonly<Record<string, string>> = Object.freeze({ ...instalacion().atajosHabitos })

export function habitKey(event: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat' | 'isComposing'>): string | null {
  if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return null
  if (!/^(Digit|Numpad)[0-9]$/.test(event.code)) return null
  if (event.shiftKey && !['Digit1','Numpad1'].includes(event.code)) return null
  const label = event.shiftKey ? '⇧1' : event.code.slice(-1)
  return Object.keys(HABIT_SHORTCUTS).find((key) => HABIT_SHORTCUTS[key] === label) ?? null
}

export function isHabitTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], dialog')
}
