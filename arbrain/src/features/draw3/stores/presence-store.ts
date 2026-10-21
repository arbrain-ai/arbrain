/**
 * Presence store — remote users' cursors, selections, editing state.
 *
 * Populated via Supabase Realtime Presence channel.
 */
'use client'
import { create } from 'zustand'
import type { ElementId } from '../elements/types'
import type { ToolName } from './canvas-store'

export interface RemoteUser {
  clientId: string
  user: { id: string; name: string; color: string; avatarUrl?: string }
  cursor: { x: number; y: number } | null   // world coords
  selection: ElementId[]
  tool: ToolName
  editingId: ElementId | null
  lastSeen: number
}

export interface PresenceState {
  users: Map<string, RemoteUser>
  selfClientId: string | null

  upsert: (u: RemoteUser) => void
  remove: (clientId: string) => void
  clear: () => void
  setSelf: (clientId: string) => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
  users: new Map(),
  selfClientId: null,

  upsert: (u) => set((s) => {
    const next = new Map(s.users)
    next.set(u.clientId, u)
    return { users: next }
  }),

  remove: (clientId) => set((s) => {
    const next = new Map(s.users)
    next.delete(clientId)
    return { users: next }
  }),

  clear: () => set({ users: new Map() }),
  setSelf: (clientId) => set({ selfClientId: clientId }),
}))
