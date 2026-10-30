import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DrawElements } from '../types'

interface PageCache {
  elements: readonly Record<string, unknown>[]
  files?: Record<string, unknown>
  name: string
  theme?: DrawElements['theme']
  camera?: DrawElements['camera']
  settings?: DrawElements['settings']
  updatedAt: string
}

interface DrawStore {
  cache: Record<string, PageCache>
  lastPageId: string | null
  favorites: string[]
  setPageCache: (pageId: string, data: PageCache) => void
  getPageCache: (pageId: string) => PageCache | undefined
  setLastPageId: (id: string | null) => void
  toggleFavorite: (pageId: string) => void
}

export const useDrawStore = create<DrawStore>()(
  persist(
    (set, get) => ({
      cache: {},
      lastPageId: null,
      favorites: [],
      setPageCache: (pageId, data) =>
        set((state) => {
          const current = state.cache[pageId]
          if (!current || new Date(data.updatedAt) > new Date(current.updatedAt)) {
            return { cache: { ...state.cache, [pageId]: data } }
          }
          return state
        }),
      getPageCache: (pageId) => get().cache[pageId],
      setLastPageId: (id) => set({ lastPageId: id }),
      toggleFavorite: (pageId) =>
        set((state) => {
          const favs = state.favorites
          if (favs.includes(pageId)) {
            return { favorites: favs.filter((id) => id !== pageId) }
          }
          return { favorites: [...favs, pageId] }
        }),
    }),
    {
      name: 'draw-cache',
      partialize: (state) => ({
        lastPageId: state.lastPageId,
        favorites: state.favorites,
      }),
    },
  ),
)
