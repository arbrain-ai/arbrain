import { create } from 'zustand'
import type { ChatSession } from '../hooks/useChatHistory'
import { ordenarRecientes } from '../lib/recientes-lista'
import { aplicarCambioALista, aplicarCambioARecientes, type CambioSesion } from '../lib/cambios-sesion'
import { alternarDia, type DiasAbiertos } from '../lib/recientes-plegado'

/**
 * «Recientes» en la barra lateral (1 oct 2026). Daniel no encontraba sus conversaciones:
 * la lista vivía tras el botón de Levy en la cabecera. ChatPanel publica aquí la lista que ya
 * cargó (en vivo: títulos, semáforo, conversación nueva); la barra pide además a la API las
 * de todas sus cuentas y las fijadas, y une ambas.
 * En el chat abre con el evento `openclaw:open-session` (detail = id); fuera, por la sesión
 * de navegación (`mc_activeChatSessionId`) que ChatPanel lee al montar.
 */
// Margen para que lo publicado cubra lo que enseña la barra: lo publicado es lo más fresco.
export const RECIENTES_MAX = 40

interface RecientesState {
  /** Publicado por ChatPanel: la cuenta activa, en vivo. */
  sesiones: ChatSession[]
  activaId: string | null
  publicar: (sesiones: ChatSession[], activaId: string | null) => void
  /** Pedido por la barra a la API: lo reciente de todas las cuentas y las fijadas (sin importar su antigüedad). */
  traidas: ChatSession[]
  fijadas: ChatSession[]
  /** La barra ya intentó cargar al menos una vez (con o sin red): desde ahí muestra su cabecera aunque no haya filas. */
  cargada: boolean
  /** Los hilos de la carpeta «Rutinas» (4 oct 2026), pedidos aparte: sin importar su antigüedad. */
  rutinas: ChatSession[]
  traerRutinas: (rutinas: ChatSession[]) => void
  /**
   * Lo que Daniel decidió a mano con la carpeta «Rutinas»: true/false = desplegada/plegada; null = sola
   * (plegada, y se despliega cuando hay algo morado). En memoria: al reabrir la app vuelve a null.
   */
  rutinasManual: boolean | null
  fijarRutinas: (abierta: boolean | null) => void
  traer: (traidas: ChatSession[], fijadas: ChatSession[]) => void
  marcarCargada: () => void
  /** Fijar/desfijar al instante en todo lo que pinta la barra (la API se llama aparte). */
  marcarFijada: (id: string, fijada: boolean) => void
  /** Cambio de una conversación desde el menú «⋯» (parche, quitada, agregada) en las tres listas a la vez. */
  aplicarCambio: (cambio: CambioSesion) => void
  /**
   * Días que Daniel abrió a mano (2 oct 2026). Hoy/Ayer/Hace 2 días arrancan plegados para reducir ruido;
   * vive aquí y no en el componente para que sobreviva mientras la app siga abierta (RecientesNav se
   * desmonta al cambiar de sección), y no se persiste: al reabrir la app vuelve todo plegado.
   */
  abiertos: DiasAbiertos
  alternarDia: (clave: string) => void
}

const conFijada = (lista: ChatSession[], id: string, fijada: boolean) =>
  lista.map((s) => (s.id === id ? { ...s, is_favorite: fijada } : s))

export const useRecientesStore = create<RecientesState>((set) => ({
  sesiones: [],
  activaId: null,
  publicar: (sesiones, activaId) => set({ sesiones, activaId }),
  traidas: [],
  fijadas: [],
  cargada: false,
  rutinas: [],
  traerRutinas: (rutinas) => set({ rutinas }),
  rutinasManual: null,
  fijarRutinas: (abierta) => set({ rutinasManual: abierta }),
  traer: (traidas, fijadas) => set({ traidas, fijadas, cargada: true }),
  marcarCargada: () => set({ cargada: true }),
  marcarFijada: (id, fijada) =>
    set((st) => {
      const todas = [...st.fijadas, ...st.traidas, ...st.sesiones]
      const base = todas.find((s) => s.id === id)
      return {
        sesiones: conFijada(st.sesiones, id, fijada),
        traidas: conFijada(st.traidas, id, fijada),
        fijadas: fijada
          ? base && !st.fijadas.some((s) => s.id === id) ? [{ ...base, is_favorite: true }, ...st.fijadas] : conFijada(st.fijadas, id, true)
          : st.fijadas.filter((s) => s.id !== id),
      }
    }),
  aplicarCambio: (cambio) =>
    set((st) => {
      const nuevo = aplicarCambioARecientes({ sesiones: st.sesiones, traidas: st.traidas, fijadas: st.fijadas }, cambio)
      // Los hilos de Rutinas también marcan leído/no leído al instante.
      const rutinas = cambio.tipo === 'agregada' ? st.rutinas : aplicarCambioALista(st.rutinas, cambio)
      return nuevo.sesiones === st.sesiones && nuevo.traidas === st.traidas && nuevo.fijadas === st.fijadas && rutinas === st.rutinas ? st : { ...nuevo, rutinas }
    }),
  // REGLA DURA: vacío = todos los grupos por fecha CERRADOS al montar. Ver recientes-plegado.ts y
  // tests/chat/sidebar-grupos-cerrados.test.ts antes de tocarlo.
  abiertos: {},
  alternarDia: (clave) => set((st) => ({ abiertos: alternarDia(st.abiertos, clave) })),
}))

/** Las conversaciones de Daniel por su último mensaje. El hilo de reportes no entra: llega por la campana. */
export function recientes(sesiones: ChatSession[], max = RECIENTES_MAX): ChatSession[] {
  return ordenarRecientes(sesiones, max)
}
