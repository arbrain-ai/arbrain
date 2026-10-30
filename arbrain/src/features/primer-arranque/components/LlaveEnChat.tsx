'use client'
/**
 * Un turno del chat que falló porque el proveedor rechazó la llave (401/403), en la edición cliente (humo de
 * instaladores, 13 oct 2026, hallazgo 2). En vez de «Failed to authenticate. API Error: 401» a los 3 minutos, el daemon
 * corta el turno al primer intento y aquí se dice qué pasó y cómo resolverlo: abrir Ajustes › Llaves y reintentar.
 * El detalle técnico del daemon queda plegado para soporte.
 */
import { KeyRound, RefreshCw, TriangleAlert } from 'lucide-react'
import { useAjustes } from '@/shared/stores/ajustes-store'

export function LlaveEnChat({ diagnostico, onReintentar }: { diagnostico: string; onReintentar?: () => void }) {
  const [aviso, ...resto] = diagnostico.split('\n\nDetalle técnico: ')
  const detalle = resto.join('\n\nDetalle técnico: ').trim()
  return (
    <div className="mt-2 rounded-xl bg-warning/10 px-3.5 py-3 text-left text-[13px] leading-relaxed text-foreground" role="status">
      <p className="flex items-start gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {aviso}</p>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <button type="button" className="btn-primary flex min-h-10 !px-3 text-[13px]" onClick={() => useAjustes.getState().abrir('llaves')}>
          <KeyRound className="size-3.5" aria-hidden /> Abrir Ajustes › Llaves
        </button>
        {onReintentar && (
          <button type="button" className="btn-secondary flex min-h-10 !px-3 text-[13px]" onClick={onReintentar}>
            <RefreshCw className="size-3.5" aria-hidden /> Reintentar
          </button>
        )}
      </div>
      {detalle && (
        <details className="mt-2 pl-6 text-[12px] text-muted">
          <summary className="cursor-pointer">Detalle técnico</summary>
          <p className="mt-1 break-words">{detalle}</p>
        </details>
      )}
    </div>
  )
}
