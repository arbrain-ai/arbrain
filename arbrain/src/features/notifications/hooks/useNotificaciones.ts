'use client'
import { useCallback, useEffect, useState } from 'react'
import { estadoPush, mensajeDeError, type EstadoPush } from '../lib/soportePush'
import {
  activarEnDispositivo, desactivarEnDispositivo, estadoEnServidor, leerEntorno, pedirPrueba, permisoActual,
  registrarEnServidor, soportaPush, suscripcionDelNavegador,
} from '../lib/pushCliente'

/**
 * Estado y acciones de las notificaciones de ESTE dispositivo (12 oct 2026). «Activas» exige las dos mitades: la
 * suscripción del navegador y su fila en el servidor a nombre de la sesión. Si el navegador la tiene y el servidor no
 * (la borró tras un rechazo, o se activó con otra cuenta), se re-registra sola, sin pedir nada.
 */
export function useNotificaciones() {
  const [estado, setEstado] = useState<EstadoPush | 'cargando'>('cargando')
  const [dispositivos, setDispositivos] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revisar = useCallback(async () => {
    let suscrito = false
    try {
      if (soportaPush() && permisoActual() === 'granted') {
        const sub = await suscripcionDelNavegador()
        if (sub) {
          const s = await estadoEnServidor(sub.endpoint)
          if (s) setDispositivos(s.dispositivos)
          if (s?.registrada) suscrito = true
          else if (s) { await registrarEnServidor(sub); suscrito = true; setDispositivos(s.dispositivos + 1) }
        }
      } else if (soportaPush()) {
        const s = await estadoEnServidor('')
        if (s) setDispositivos(s.dispositivos)
      }
    } catch { /* sin servidor: se ve como apagado y el botón lo reintenta */ }
    setEstado(estadoPush(leerEntorno(suscrito)))
  }, [])

  useEffect(() => {
    void revisar()
    // Al volver de los ajustes del teléfono (permiso cambiado) se relee.
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [revisar])

  const activar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      const permiso = await activarEnDispositivo()
      if (permiso === 'granted') { setEstado('activo'); await revisar(); return true }
      setEstado(estadoPush(leerEntorno(false)))
      if (permiso === 'denied') setError('Bloqueaste las notificaciones. Actívalas en los ajustes del teléfono y vuelve aquí.')
      return false
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado(estadoPush(leerEntorno(false)))
      return false
    } finally {
      setOcupado(false)
    }
  }, [revisar])

  const desactivar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      await desactivarEnDispositivo()
      setEstado(estadoPush(leerEntorno(false)))
      setDispositivos((d) => (d && d > 0 ? d - 1 : d))
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo desactivar. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }, [])

  return { estado, dispositivos, ocupado, error, activar, desactivar, enviarPrueba: pedirPrueba }
}
