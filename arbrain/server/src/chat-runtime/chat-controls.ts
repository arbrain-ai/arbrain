import type { ChatOverrides } from '../db.js'

/** Metadata reads may yield. Do not commit a plan validated against settings
 * another command has replaced while that read was in flight. */
export async function changeChatControls(
  read: () => ChatOverrides,
  plan: (current: ChatOverrides) => Promise<Partial<ChatOverrides>>,
  commit: (patch: Partial<ChatOverrides>, validated?: ChatOverrides) => ChatOverrides,
): Promise<ChatOverrides> {
  const before = read()
  const patch = await plan({ ...before })
  const current = read()
  if (current.model !== before.model || current.effort !== before.effort || current.fast !== before.fast || current.ultracode !== before.ultracode) {
    throw new Error('Los ajustes cambiaron durante la validación. Repite la orden con los ajustes actuales.')
  }
  return commit(patch, before)
}

export function effortControlPatch(current: ChatOverrides, raw: string, available: string[]): Partial<ChatOverrides> {
  if (current.ultracode && raw !== 'xhigh') throw new Error('Ultracode mantiene xhigh. Desactívalo con /ultracode off antes de elegir otro esfuerzo o default.')
  if (['default', 'auto', 'reset'].includes(raw)) return { effort: null }
  if (!available.includes(raw)) throw new Error(`Esfuerzo no disponible: ${raw}. Opciones: ${available.join(', ')} o default.`)
  return { effort: raw }
}

export async function ultracodeControlPatch(current: ChatOverrides, enabled: boolean, validate: (proposed: ChatOverrides) => Promise<unknown>): Promise<Partial<ChatOverrides>> {
  if (!enabled) return { ultracode: false } // recovery must work even if metadata is unavailable
  const patch = { ultracode: true, effort: 'xhigh' }
  await validate({ ...current, ...patch })
  return patch
}
