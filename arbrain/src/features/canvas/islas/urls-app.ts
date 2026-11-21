/**
 * Las URLs de la app que leen las fuentes vivas (`fuentes.ts`): las MISMAS claves de caché que los paneles, para que una
 * lectura sirva a todos. Las usan el mapa (useIslas) y Tu negocio › El pulso (negocio/usePulsoVivo). Sin React.
 */
import { urlFinanzas } from '@/features/finances/lib/finanzas'
import { urlTrabajos } from '@/features/cabina/trabajos-modelo'
import { URL_COMPRADOR } from '@/features/negocio/pulso'
import { URL_MARKETING } from '@/features/negocio/marketing'
import { URL_MARCADOR } from '@/features/negocio/marcador-levy'
import { URL_MRR } from '@/features/negocio/mrr'
import type { UrlsApp } from './fuentes'

/** La misma ventana de rutinas que usa el panel (`cabina/vistas/Rutinas.tsx › urlRutinas`): 8 días redondeados a la hora. */
function urlRutinas() {
  const to = Math.ceil(Date.now() / 3_600_000) * 3_600_000
  return `/api/planning/crons?${new URLSearchParams({ from: new Date(to - 8 * 86_400_000).toISOString(), to: new Date(to).toISOString() })}`
}

export const urlsApp = (): UrlsApp => ({
  cohorte: '/api/cohorte', finanzas: urlFinanzas('30d'), rutinas: urlRutinas(), trabajos: urlTrabajos(6), marketing: URL_MARKETING,
  comprador: URL_COMPRADOR, embudo: '/api/negocio/embudo', marcador: URL_MARCADOR, bi: '/api/bi', bandeja: '/api/decisiones', mrr: URL_MRR,
})
