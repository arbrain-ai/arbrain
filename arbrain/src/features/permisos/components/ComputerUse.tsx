'use client'
/**
 * Computer use (seguridad para clientes, 10 oct 2026; AUDITORIA I7). `TarjetaComputerUse` es el interruptor general en
 * Ajustes › Mac y sistema (instalación original) o Ajustes › Esta computadora (edición cliente).
 *   - Instalación original: el estado vive en `~/.config/arbrain/manos/computer-use.json` y lo leen las manos en cada
 *     llamada. Sin cambio.
 *   - Edición cliente 0.1.2 (17 oct 2026, revierte DECISIONES #11): en macOS y Windows el estado vive en el daemon y
 *     nace apagado en cada apertura; `/api/manos/interruptor` le habla desde el servidor. En Linux no existe: la
 *     tarjeta es un aviso sin interruptor. Avisa además si la terminal de los agentes no tiene sandbox.
 */
import { useCallback, useEffect, useState } from 'react'
import { MousePointerClick } from 'lucide-react'
import { Interruptor } from '@/features/configuracion/components/Interruptor'
import type { EstadoComputerUse } from '../lib/computer-use'
import { avisoSinSandbox, type EstadoSandbox } from '../lib/confirmacion'
import { COMPUTER_USE_NO_DISPONIBLE, explicacionComputerUse } from '../lib/disponibilidad'

/** En cliente la ruta agrega `disponible` (¿hay computer use en este sistema?) y `plataforma`. */
export type EstadoConSandbox = EstadoComputerUse & { sandbox?: EstadoSandbox; disponible?: boolean; plataforma?: string }

const EXPLICACION = 'Permite que los agentes miren tu pantalla, hagan clic, escriban y naveguen en tus apps y en Chrome. Antes de enviar, pagar, borrar o publicar se detienen y solo siguen con tus palabras escritas en el chat. Puedes apagarlo cuando quieras; no lo uses con tu banco ni con pagos.'

function useComputerUse() {
  const [estado, setEstado] = useState<EstadoConSandbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/manos/interruptor', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (vivo && j) setEstado(j) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  const fijar = useCallback(async (encendido: boolean) => {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/manos/interruptor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encendido }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar.')
      setEstado(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setOcupado(false) }
  }, [])
  return { estado, error, ocupado, fijar }
}

export function TarjetaComputerUse() {
  const { estado, error, ocupado, fijar } = useComputerUse()
  if (!estado) return null
  const sandbox = estado.sandbox && !estado.sandbox.disponible && (
    <p role="note" className="border-t border-border-subtle px-4 py-2.5 text-xs leading-snug text-muted sm:px-5">{avisoSinSandbox(estado.sandbox)}</p>
  )
  // Edición cliente en Linux: computer use no existe; un aviso sin interruptor.
  if (estado.edicion === 'cliente' && estado.disponible === false) {
    return (
      <section className="solid-card overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
          <MousePointerClick size={16} className="mt-0.5 shrink-0 text-foreground/70" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground/90">Computer use · no disponible en Linux</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted">{COMPUTER_USE_NO_DISPONIBLE}</p>
          </div>
        </div>
        {sandbox}
      </section>
    )
  }
  const explicacion = estado.edicion === 'cliente' ? explicacionComputerUse(estado.plataforma ?? '') : EXPLICACION
  return (
    <section className="solid-card overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <MousePointerClick size={16} className="mt-0.5 shrink-0 text-foreground/70" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground/90">Computer use {estado.encendido ? 'encendido' : 'apagado'}</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted">{explicacion}</p>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
        </div>
        <Interruptor activo={estado.encendido} onCambio={fijar} etiqueta={estado.encendido ? 'Apagar computer use' : 'Encender computer use'} disabled={ocupado} />
      </div>
      {sandbox}
    </section>
  )
}
