'use client'
/**
 * Un turno del chat que falló porque el proveedor rechazó la llave (401/403), en la edición cliente (humo de
 * instaladores, 13 oct 2026, hallazgo 2). En vez de «Failed to authenticate. API Error: 401» a los 3 minutos, el daemon
 * corta el turno al primer intento y aquí se dice qué pasó y cómo resolverlo: abrir Ajustes › Llaves y reintentar.
 * El detalle técnico del daemon queda plegado para soporte.
 */
import { KeyRound, RefreshCw, TriangleAlert } from 'lucide-react'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { tr } from '@/shared/i18n'

export function LlaveEnChat({ diagnostico, onReintentar }: { diagnostico: string; onReintentar?: () => void }) {
  // El daemon arma el detalle en el idioma de Ajustes (cliente/sin-saldo.ts): se separa por el de los dos que venga.
  const separador = [`\n\n${tr('Detalle técnico: {detalle}', { detalle: '' })}`, '\n\nDetalle técnico: '].find((x) => diagnostico.includes(x)) ?? '\n\nDetalle técnico: '
  const [aviso, ...resto] = diagnostico.split(separador)
  const detalle = resto.join(separador).trim()
  return (
    <div className="mt-2 rounded-xl bg-warning/10 px-3.5 py-3 text-left text-[13px] leading-relaxed text-foreground" role="status">
      <p className="flex items-start gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {tr(aviso)}</p>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <button type="button" className="btn-primary flex min-h-10 !px-3 text-[13px]" onClick={() => useAjustes.getState().abrir('llaves')}>
          <KeyRound className="size-3.5" aria-hidden /> {tr('Abrir Ajustes › Llaves')}
        </button>
        {onReintentar && (
          <button type="button" className="btn-secondary flex min-h-10 !px-3 text-[13px]" onClick={onReintentar}>
            <RefreshCw className="size-3.5" aria-hidden /> {tr('Reintentar')}
          </button>
        )}
      </div>
      {detalle && (
        <details className="mt-2 pl-6 text-[12px] text-muted">
          <summary className="cursor-pointer">{tr('Detalle técnico')}</summary>
          <p className="mt-1 break-words">{detalle}</p>
        </details>
      )}
    </div>
  )
}
