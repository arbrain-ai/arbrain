import { create } from 'zustand'

// ─── Preferencias de la superficie del chat (6 sep 2026) ─────────────────────
//
// Hoy solo una: si la pestaña "Crons" se muestra en el sidebar. Nació al meter
// el 4º espacio ('yt'): con cinco pestañas el segmented se desborda y "Crons"
// queda cortada. Las sesiones de cron no se pierden — siguen en el pool del
// daemon (/api/chat/sessions?kind=cron) y en la sala Acciones del Arbrain; lo
// que se apaga es la pestaña, que es ruido cuando no estás depurando un cron.
//
// Vive en localStorage (preferencia por dispositivo, igual que `chat:account`),
// no en Supabase: es cómo se ve ESTA pantalla, no estado del negocio.

const STORAGE_KEY = 'chat:prefs:crons-tab'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

interface ChatPrefsState {
  /** ¿Se muestra la pestaña "Crons" en el sidebar? Default: false (6 sep 2026). */
  cronsTabEnabled: boolean
  setCronsTabEnabled: (enabled: boolean) => void
}

export const useChatPrefsStore = create<ChatPrefsState>((set) => ({
  cronsTabEnabled: readInitial(),
  setCronsTabEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, String(enabled)) } catch { /* ignore */ }
    }
    set({ cronsTabEnabled: enabled })
  },
}))
