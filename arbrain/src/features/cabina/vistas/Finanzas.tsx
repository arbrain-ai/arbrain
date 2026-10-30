'use client'
/**
 * Finanzas en la Cabina: la MISMA pieza que la sección /finanzas (4 oct 2026). En el panel y en
 * «Ampliar» va completa (rangos, gráfica, cuentas, movimientos, cierres, cobros fijos); en la
 * tarjeta del hilo, su resumen. Un componente y un cálculo: el runway ya no se redondea distinto.
 */
import { Finanzas, resumenFinanzas } from '@/features/finances/components/Finanzas'
import { urlFinanzas } from '@/features/finances/lib/finanzas'

export const URL_FINANZAS = urlFinanzas('30d')
export { resumenFinanzas }

export function VistaFinanzas({ grande }: { grande?: boolean }) {
  return <Finanzas donde={grande ? 'panel' : 'hilo'} />
}
