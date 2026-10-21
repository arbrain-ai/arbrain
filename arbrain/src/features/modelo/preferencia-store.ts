import { create } from 'zustand'
import { isNonDefaultAccount, type ChatAccount } from '@/features/chat/stores/account-store'

/**
 * Motor, modelo y esfuerzo de las conversaciones nuevas (Configuración → Modelo, 2 oct 2026). La verdad
 * vive en el daemon (igual en web, escritorio y teléfono); aquí solo se recuerda para que «Nueva
 * conversación» nazca en el motor elegido. Vacía (`motor: null`) = todo como estaba.
 */
export interface PreferenciaMotor { motor: string | null; modelo: string | null; esfuerzo: string | null }

export type EstadoPreferencia = 'cargando' | 'lista' | 'sin-servidor' | 'error'

interface Estado {
  preferencia: PreferenciaMotor | null
  estado: EstadoPreferencia
  error: string | null
  cargar: () => Promise<void>
  guardar: (p: PreferenciaMotor) => Promise<void>
}

/** El espacio del chat donde nace una conversación nueva, o null para no tocar el activo. */
export function cuentaPreferida(p: PreferenciaMotor | null): ChatAccount | null {
  if (!p?.motor) return null
  return p.motor === 'default' ? 'default' : isNonDefaultAccount(p.motor) ? p.motor : null
}

async function leerRespuesta(r: Response): Promise<{ preferencia?: PreferenciaMotor; error?: string }> {
  return r.json().catch(() => ({ error: `Respuesta inválida (${r.status})` }))
}

export const usePreferenciaMotor = create<Estado>((set) => ({
  preferencia: null,
  estado: 'cargando',
  error: null,
  cargar: async () => {
    try {
      const r = await fetch('/api/chat/preferencia-motor', { cache: 'no-store' })
      const data = await leerRespuesta(r)
      // 404: el servidor del chat todavía corre el código anterior (se activa al reiniciarlo).
      if (r.status === 404) { set({ estado: 'sin-servidor', error: null, preferencia: null }); return }
      if (!r.ok || !data.preferencia) { set({ estado: 'error', error: data.error ?? `No se pudo leer (${r.status})` }); return }
      set({ preferencia: data.preferencia, estado: 'lista', error: null })
    } catch {
      set({ estado: 'error', error: 'Sin conexión con el servidor del chat.' })
    }
  },
  guardar: async (p) => {
    const r = await fetch('/api/chat/preferencia-motor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
    const data = await leerRespuesta(r)
    if (!r.ok || !data.preferencia) throw new Error(data.error ?? `No se pudo guardar (${r.status})`)
    set({ preferencia: data.preferencia, estado: 'lista', error: null })
  },
}))
