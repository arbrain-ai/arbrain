// Selector de modelo (1 nov 2026, pedido de Daniel: «esto lo siento muy tosco… a veces se sale de pantalla»).
// Qué punto lleva cada cuenta. Dónde cabe el popover lo decide la primitiva de toda la barra: shared/lib/popover-anclado.ts.
import type { LimitesPlan } from './limites-plan'
import { tr } from '@/shared/i18n'

export type EstadoCuenta = 'lista' | 'cerca' | 'agotada' | 'sin-dato'

/** El punto de cada cuenta sale de sus límites del plan. Sin lectura no hay verde: falta de dato no es «lista». */
export function estadoDeCuenta(limites: LimitesPlan | null | undefined): { estado: EstadoCuenta; detalle: string } {
  if (!limites || !limites.available) return { estado: 'sin-dato', detalle: limites?.reason ? tr(limites.reason) : tr('Sin dato de sesión ni de cuota') }
  const medidas = limites.windows.filter(v => v.percent != null)
  const peor = medidas.reduce<(typeof medidas)[number] | null>((a, v) => (!a || (v.percent ?? 0) > (a.percent ?? 0) ? v : a), null)
  const uso = peor ? Math.round(peor.percent ?? 0) : null
  if (limites.reached || (uso != null && uso >= 100)) return { estado: 'agotada', detalle: peor ? tr('Cuota agotada · {ventana}', { ventana: tr(peor.label) }) : tr('Cuota agotada') }
  if (uso != null && uso >= 85) return { estado: 'cerca', detalle: tr('{uso} % usado · {ventana}', { uso, ventana: tr(peor!.label) }) }
  return { estado: 'lista', detalle: uso != null ? tr('Sesión activa · {uso} % usado ({ventana})', { uso, ventana: tr(peor!.label) }) : tr('Sesión activa') }
}
