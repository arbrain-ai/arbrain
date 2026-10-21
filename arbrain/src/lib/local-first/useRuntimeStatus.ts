'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RuntimeStatus } from './types'
import { getRuntimeStatus, onLocalFirstChanged } from './runtime'

const INITIAL_STATUS: RuntimeStatus = {
  desktop: false,
  mode: 'cloud',
  online: true,
  syncing: false,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
}

export function useRuntimeStatus() {
  const [status, setStatus] = useState<RuntimeStatus>(INITIAL_STATUS)

  const refresh = useCallback(async (syncing = false) => {
    try {
      const next = await getRuntimeStatus(syncing)
      setStatus(next)
    } catch (error) {
      setStatus((current) => ({
        ...current,
        mode: current.online ? 'cloud' : 'offline',
        message: error instanceof Error ? error.message : 'Runtime status unavailable',
      }))
    }
  }, [])

  useEffect(() => {
    refresh()
    // 45s (5s golpeaba IPC Rust + SQLite en toda ruta, siempre). Oculto no pollea;
    // al recuperar visibilidad refresca al instante.
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh()
    }, 45000)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    const offChange = onLocalFirstChanged(() => refresh())
    const onConnectivity = () => refresh()
    window.addEventListener('online', onConnectivity)
    window.addEventListener('offline', onConnectivity)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      offChange()
      window.removeEventListener('online', onConnectivity)
      window.removeEventListener('offline', onConnectivity)
    }
  }, [refresh])

  return { status, refresh, setStatus }
}
