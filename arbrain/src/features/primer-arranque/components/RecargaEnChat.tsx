'use client'
/**
 * Un turno del chat que falló porque la cuenta no tiene crédito (A/B del primer arranque, ronda 2 › EL gap, punto 3).
 * En vez del error crudo del proveedor («API Error: 402 …»), el mismo paso de recarga del primer arranque: «Recargar
 * crédito en OpenRouter» y, al volver a la ventana, la prueba se repite sola. Con crédito, «Reintentar» reenvía el
 * mensaje. Solo en la edición cliente (lo decide el chat con `esSinSaldo`).
 */
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { hayApp, llavesEstado, quienCobra, reprobarAlVolver } from '../lib/llaves'
import { PasoRecarga, usePruebaConexion, useReprobarAlVolver } from './PanelLlaves'

export function RecargaEnChat({ onReintentar }: { onReintentar?: () => void }) {
  const [cobra, setCobra] = useState<'openrouter' | 'anthropic'>('openrouter')
  const { prueba, probando, probar } = usePruebaConexion()
  useEffect(() => {
    if (!hayApp()) return
    llavesEstado().then(e => setCobra(quienCobra(e))).catch(() => {})
  }, [])
  // Antes de la primera prueba se asume «sin crédito» (lo dijo el turno); al volver a la ventana se prueba sola.
  useReprobarAlVolver(hayApp() && (prueba === null || reprobarAlVolver(prueba)), probar)

  if (prueba?.ok) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-success" role="status">
        <Check className="size-4" aria-hidden /> Ya hay crédito en tu cuenta.
        {onReintentar && <button type="button" onClick={onReintentar} className="pg-boton">Reintentar</button>}
      </div>
    )
  }
  return <PasoRecarga cobra={cobra} onReintentar={() => void probar()} probando={probando} className="mt-2" />
}
