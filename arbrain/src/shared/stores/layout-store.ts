import { create } from 'zustand'

type ViewType = 'kanban' | 'list' | 'ops' | 'calendar'

interface LayoutState {
  /** TELÉFONO: el único cajón lateral (Nuevo chat, Recientes y el pie Manual/avisos/ajustes/tema). En escritorio manda barras-store. */
  conversationsDrawerOpen: boolean
  rightSidebarOpen: boolean
  selectedView: ViewType
  chatSessionsPanelOpen: boolean
  drawSidebarOpen: boolean
  drawFullscreen: boolean
  libraryOpen: boolean
  /** Panel derecho (agentes, terminales, servidores y servicios del Studio). */
  panelDerechoOpen: boolean
  /** Pantalla completa (modo enfoque, 4–5 oct 2026): el panel a todo el ancho; el chat sigue montado (flota con ⌘J). */
  enfoquePanel: boolean
  toggleEnfoquePanel: () => void
  setEnfoquePanel: (on: boolean) => void
  /** Pantalla completa (5 oct 2026): el chat de Levy como cajón flotante encima de la pestaña (⌘J). */
  levyFlotante: boolean
  setLevyFlotante: (on: boolean) => void
  /** Ruta en la que estaba Daniel si abrir a Levy flotante tuvo que volver al chat; Volver regresa ahí. */
  rutaPrevia: string | null
  setRutaPrevia: (ruta: string | null) => void
  toggleRightSidebar: () => void
  setSelectedView: (view: ViewType) => void
  toggleConversationsDrawer: () => void
  closeConversationsDrawer: () => void
  closeRightSidebar: () => void
  toggleChatSessionsPanel: () => void
  closeChatSessionsPanel: () => void
  toggleDrawSidebar: () => void
  closeDrawSidebar: () => void
  toggleDrawFullscreen: () => void
  exitDrawFullscreen: () => void
  openLibrary: () => void
  closeLibrary: () => void
  togglePanelDerecho: () => void
  setPanelDerecho: (open: boolean) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  conversationsDrawerOpen: false,
  rightSidebarOpen: false,
  selectedView: 'kanban',
  chatSessionsPanelOpen: false,
  drawSidebarOpen: true,
  drawFullscreen: false,
  libraryOpen: false,
  panelDerechoOpen: false,
  enfoquePanel: false,
  toggleEnfoquePanel: () => set((s) => ({ enfoquePanel: !s.enfoquePanel })),
  setEnfoquePanel: (on) => set({ enfoquePanel: on }),
  levyFlotante: false,
  setLevyFlotante: (on) => set({ levyFlotante: on }),
  rutaPrevia: null,
  setRutaPrevia: (ruta) => set({ rutaPrevia: ruta }),
  toggleConversationsDrawer: () => set((s) => ({ conversationsDrawerOpen: !s.conversationsDrawerOpen })),
  closeConversationsDrawer: () => set({ conversationsDrawerOpen: false }),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setSelectedView: (view) => set({ selectedView: view }),
  closeRightSidebar: () => set({ rightSidebarOpen: false }),
  toggleChatSessionsPanel: () => set((s) => ({ chatSessionsPanelOpen: !s.chatSessionsPanelOpen })),
  closeChatSessionsPanel: () => set({ chatSessionsPanelOpen: false }),
  toggleDrawSidebar: () => set((s) => ({ drawSidebarOpen: !s.drawSidebarOpen })),
  closeDrawSidebar: () => set({ drawSidebarOpen: false }),
  toggleDrawFullscreen: () => set((s) => ({ drawFullscreen: !s.drawFullscreen })),
  exitDrawFullscreen: () => set({ drawFullscreen: false }),
  openLibrary: () => set({ libraryOpen: true }),
  closeLibrary: () => set({ libraryOpen: false }),
  togglePanelDerecho: () => set((s) => ({ panelDerechoOpen: !s.panelDerechoOpen })),
  setPanelDerecho: (open) => set({ panelDerechoOpen: open }),
}))
