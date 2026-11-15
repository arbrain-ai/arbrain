'use client'
/**
 * «Abrir en su app» (14 nov 2026): el original con la app del sistema (Excel o Numbers, Word o Pages, Vista Previa), para
 * cuando hace falta editarlo o usar algo que el visor no tiene. Solo aparece en la computadora donde corre Arbrain (la app
 * de escritorio o el navegador en 127.0.0.1): desde el teléfono abriría la app en el Studio, no en la mano. La ruta la
 * valida el servidor (/api/cabina/documento/abrir) con las mismas reglas que el visor.
 */
import { useEffect, useState } from 'react'
import { Check, SquareArrowOutUpRight } from 'lucide-react'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { tr } from '@/shared/i18n'

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function BotonAbrirEnApp({ ruta, className, conTexto = false }: { ruta: string; className?: string; conTexto?: boolean }) {
  const [local, setLocal] = useState(false)
  const [estado, setEstado] = useState<'listo' | 'abriendo' | 'hecho' | { error: string }>('listo')
  useEffect(() => { setLocal(isDesktopRuntime() || LOCAL.has(window.location.hostname)) }, [])
  useEffect(() => { if (estado === 'hecho' || typeof estado === 'object') { const k = window.setTimeout(() => setEstado('listo'), 2600); return () => window.clearTimeout(k) } }, [estado])
  if (!local) return null
  const abrir = async () => {
    setEstado('abriendo')
    try {
      const r = await fetch('/api/cabina/documento/abrir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruta }) })
      const b = await r.json().catch(() => ({}))
      setEstado(r.ok ? 'hecho' : { error: b.error ? tr(b.error) : tr('No se pudo abrir ({estado}).', { estado: r.status }) })
    } catch (e) { setEstado({ error: e instanceof Error ? e.message : tr('No se pudo abrir.') }) }
  }
  const titulo = typeof estado === 'object' ? estado.error : estado === 'hecho' ? tr('Abierto en su app') : tr('Abrir en su app (el original, para editarlo)')
  return <button type="button" className={className} onClick={() => void abrir()} disabled={estado === 'abriendo'} data-abrir-app data-error={typeof estado === 'object' || undefined}
    aria-label={tr('Abrir en su app')} title={titulo}>
    {estado === 'hecho' ? <Check size={15} aria-hidden /> : <SquareArrowOutUpRight size={14} aria-hidden />}{conTexto && <span>{tr('Abrir en su app')}</span>}
  </button>
}
