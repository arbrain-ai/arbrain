/**
 * History store — transactional undo/redo of Op batches.
 *
 * Each commit is a labeled batch of ops. The store keeps both the forward (do)
 * and reverse (undo) ops so undo/redo is O(1).
 */
'use client'
import { create } from 'zustand'
import type { Op } from '../ops/contract'

interface HistoryEntry {
  label: string
  forward: Op[]
  reverse: Op[]
  ts: number
}

export interface HistoryState {
  entries: HistoryEntry[]
  index: number  // -1 = nothing applied; entries[index] is last applied
  max: number

  commit: (entry: Omit<HistoryEntry, 'ts'>) => void
  canUndo: () => boolean
  canRedo: () => boolean
  consumeUndo: () => Op[] | null
  consumeRedo: () => Op[] | null
  clear: () => void
}

const MAX_ENTRIES = 500

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  index: -1,
  max: MAX_ENTRIES,

  commit: (entry) => set((s) => {
    const trimmed = s.entries.slice(0, s.index + 1)
    trimmed.push({ ...entry, ts: Date.now() })
    if (trimmed.length > s.max) trimmed.splice(0, trimmed.length - s.max)
    return { entries: trimmed, index: trimmed.length - 1 }
  }),

  canUndo: () => get().index >= 0,
  canRedo: () => {
    const s = get()
    return s.index < s.entries.length - 1
  },

  consumeUndo: () => {
    const s = get()
    if (s.index < 0) return null
    const entry = s.entries[s.index]
    set({ index: s.index - 1 })
    return entry.reverse
  },

  consumeRedo: () => {
    const s = get()
    if (s.index >= s.entries.length - 1) return null
    const entry = s.entries[s.index + 1]
    set({ index: s.index + 1 })
    return entry.forward
  },

  clear: () => set({ entries: [], index: -1 }),
}))
