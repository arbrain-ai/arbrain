'use client'
import { useNotificaciones } from './useNotificaciones'

export { urlBase64ToUint8Array } from '../lib/pushCliente'

export type PushStatus = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

/**
 * Atajo de la campana (silenciar/recibir en este dispositivo). Desde el 12 oct 2026 es una vista de `useNotificaciones`:
 * el mismo camino que Ajustes › Notificaciones, que sí comprueba que el servidor guardó la suscripción.
 */
export function usePushSubscription() {
  const n = useNotificaciones()
  const status: PushStatus = n.estado === 'cargando' ? 'loading'
    : n.estado === 'activo' ? 'subscribed'
    : n.estado === 'listo' ? 'unsubscribed'
    : n.estado === 'bloqueado' ? 'denied'
    : 'unsupported'
  return {
    status,
    loading: n.ocupado,
    subscribe: async () => { await n.activar() },
    unsubscribe: n.desactivar,
  }
}
