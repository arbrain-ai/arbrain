'use client'
// «Reintentar» (29 oct 2026, cohorte): en el aviso de conexión del chat y en la espera explicada cuando el motor no
// responde. Enciende el motor si no contesta y recarga; uno sano nunca se reinicia (lib/reintentar-conexion.ts).
import { useState } from 'react'
import { daemonEstado, daemonReiniciar, esperarDaemon, hayApp } from '@/features/primer-arranque/lib/llaves'
import { reintentarConexion } from '../lib/reintentar-conexion'

export function BotonReintentar({ className = '' }: { className?: string }) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <button
      type="button"
      data-reintentar-conexion
      disabled={ocupado}
      onClick={() => {
        setOcupado(true)
        void reintentarConexion({ hayApp, daemonEstado, daemonReiniciar, esperarDaemon, recargar: () => window.location.reload() })
          .catch(() => window.location.reload())
      }}
      className={`rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-card-hover disabled:opacity-60 ${className}`}
    >
      {ocupado ? 'Reintentando…' : 'Reintentar'}
    </button>
  )
}
