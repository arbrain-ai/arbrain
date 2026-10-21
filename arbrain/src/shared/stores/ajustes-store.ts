import { create } from 'zustand'
import { SECCION_INICIAL, type IdSeccion } from '@/features/configuracion/secciones'

/**
 * Ajustes como ventana flotante (6 oct 2026). Abrir y cerrar no toca la ruta ni nada de lo que hay debajo: la
 * conversación, su scroll y el panel quedan exactamente como estaban. Lo abren «Daniel · Ajustes», ⌘, y los enlaces
 * «Más modelos» y «Ajustes del panel»; `/settings` lo abre sobre /chat.
 */
interface AjustesStore {
  abierto: boolean
  seccion: IdSeccion
  /** Teléfono: la hoja abre en la lista de secciones (sin sección pedida) o ya dentro de una. */
  enLista: boolean
  abrir: (seccion?: IdSeccion) => void
  cerrar: () => void
  alternar: () => void
  ir: (seccion: IdSeccion) => void
}

export const useAjustes = create<AjustesStore>((set, get) => ({
  abierto: false,
  seccion: SECCION_INICIAL,
  enLista: true,
  abrir: (seccion) => set((s) => ({ abierto: true, seccion: seccion ?? s.seccion, enLista: seccion === undefined })),
  cerrar: () => set({ abierto: false }),
  alternar: () => set({ abierto: !get().abierto }),
  ir: (seccion) => set({ seccion, enLista: false }),
}))
