/**
 * UI store — panels visibility, modals, etc. (decoupled from canvas data)
 */
'use client'
import { create } from 'zustand'

export interface UIState {
  showLayersPanel: boolean
  showCommentsPanel: boolean
  showAssetsPanel: boolean
  showPropertyPanel: boolean
  showMiniMap: boolean
  showShortcutsModal: boolean
  showCommandPalette: boolean
  // Which comment currently has its inspector open. null = no comment inspector.
  // Inspector opens on pure click (no drag) and on double-click.
  commentInspectorId: string | null
  // URL de la imagen abierta en el lightbox (doble clic/tap sobre un elemento
  // imagen del canvas). null = lightbox cerrado.
  imagePreviewUrl: string | null

  toggleLayers: () => void
  toggleComments: () => void
  toggleAssets: () => void
  toggleProperty: () => void
  toggleMiniMap: () => void
  setShortcutsModal: (v: boolean) => void
  setCommandPalette: (v: boolean) => void
  setCommentInspectorId: (id: string | null) => void
  setImagePreviewUrl: (url: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  showLayersPanel: false,
  showCommentsPanel: false,
  showAssetsPanel: false,
  showPropertyPanel: true,
  showMiniMap: true,
  showShortcutsModal: false,
  showCommandPalette: false,
  commentInspectorId: null,
  imagePreviewUrl: null,

  toggleLayers: () => set((s) => ({ showLayersPanel: !s.showLayersPanel })),
  toggleComments: () => set((s) => ({ showCommentsPanel: !s.showCommentsPanel })),
  toggleAssets: () => set((s) => ({ showAssetsPanel: !s.showAssetsPanel })),
  toggleProperty: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel })),
  toggleMiniMap: () => set((s) => ({ showMiniMap: !s.showMiniMap })),
  setShortcutsModal: (v) => set({ showShortcutsModal: v }),
  setCommandPalette: (v) => set({ showCommandPalette: v }),
  setCommentInspectorId: (id) => set({ commentInspectorId: id }),
  setImagePreviewUrl: (url) => set({ imagePreviewUrl: url }),
}))
