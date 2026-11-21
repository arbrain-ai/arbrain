'use client'
/**
 * Los números vivos de las islas (14 nov 2026): las MISMAS fuentes que ya lee la app, con la misma caché (`useFuente`
 * comparte una lectura por URL entre todas las vistas montadas). Cada órgano es el `Pulso` de Tu negocio › El pulso
 * (features/negocio/pulso.ts): sin sensor dice qué falta; en modo directo, cohorte y finanzas no se piden. Nunca un 0
 * por falta de dato.
 *
 * La versión de lejos también lee (una lectura por URL sirve a todas las islas y paneles): así la foto de lejos ya trae el
 * número verdadero. `activo = false` solo existe para no pedir nada (pruebas).
 */
import type { FinancesPayload } from '@/features/finances/types/finances'
import { urlFinanzas } from '@/features/finances/lib/finanzas'
import type { CronSnapshot } from '@/features/planning/types'
import { useFuente } from '@/features/cabina/datos'
import { urlRutinas } from '@/features/cabina/vistas/Rutinas'
import { urlTrabajos, type Trabajos } from '@/features/cabina/trabajos-modelo'
import { useDirecto, useModoDirecto } from '@/shared/stores/modo-directo-store'
import { CLAVE_DIRECTO } from '@/lib/modo-directo/cubrir'
import { esEdicionCliente } from '@/lib/edicion'
import { URL_EMBUDO, type Embudo, type RespuestaEmbudo } from '@/features/negocio/embudo'
import {
  pulsoComprador, pulsoEntrega, pulsoFinanzas, pulsoMarketing, pulsoSistemas, pulsoVenta, URL_COMPRADOR,
  type CohortePulso, type Organo, type Pulso, type RespuestaComprador,
} from '@/features/negocio/pulso'
import { URL_MARKETING, type RespuestaMarketing } from '@/features/negocio/marketing'
import { usePulsosCliente } from '@/features/negocio/usePulsosCliente'
import { URL_MRR, type RespuestaMrr } from '@/features/negocio/mrr'

const URL_COHORTE = '/api/cohorte'
const directoRecordado = () => { try { return typeof window !== 'undefined' && window.localStorage.getItem(CLAVE_DIRECTO) === '1' } catch { return false } }

export function useDirectoIsla() {
  const prendido = useDirecto()
  const confirmado = useModoDirecto(st => st.confirmado)
  return prendido || (!confirmado && directoRecordado())
}

/** El pulso de UN órgano, leído de su fuente. Solo pide las fuentes que ese órgano necesita. */
export function usePulso(organo: Organo, activo = true): Pulso {
  const directo = useDirectoIsla()
  const cliente = esEdicionCliente()
  const quiere = (o: Organo[], url: string, veto = false) => (activo && !cliente && !veto && o.includes(organo) ? url : null)
  const cohorte = useFuente<CohortePulso>(quiere(['venta', 'entrega'], URL_COHORTE, directo))
  const finanzas = useFuente<FinancesPayload>(quiere(['finanzas'], urlFinanzas('30d'), directo))
  const crons = useFuente<CronSnapshot>(quiere(['sistemas'], urlRutinas()))
  const trabajos = useFuente<Trabajos>(quiere(['sistemas'], urlTrabajos(6)))
  const marketing = useFuente<RespuestaMarketing>(quiere(['marketing'], URL_MARKETING))
  const comprador = useFuente<RespuestaComprador>(activo && (organo === 'comprador' || cliente) ? URL_COMPRADOR : null)
  const delAlumno = usePulsosCliente(cliente && activo, comprador)
  if (delAlumno) return delAlumno.find(p => p.organo === organo) ?? { organo, estado: 'leyendo', fuente: '' }
  switch (organo) {
    case 'marketing': return pulsoMarketing(marketing)
    case 'venta': return pulsoVenta(cohorte, directo)
    case 'comprador': return pulsoComprador(comprador)
    case 'entrega': return pulsoEntrega(cohorte, directo)
    case 'finanzas': return pulsoFinanzas(finanzas, directo)
    case 'sistemas': return pulsoSistemas(crons, trabajos)
  }
}

/** El embudo (embudo.json validado por la app). `null` mientras llega o si el panel de negocio está apagado. */
export function useEmbudo(activo = true): { embudo: Embudo | null; cargando: boolean } {
  const l = useFuente<RespuestaEmbudo>(activo ? URL_EMBUDO : null)
  const r = l.data
  return { embudo: r && r.activo ? r.embudo : null, cargando: l.cargando }
}

/** La cohorte en cifras agregadas (sin nombres): para el programa. */
export function useCohorte(activo = true) {
  const directo = useDirectoIsla()
  return useFuente<CohortePulso>(activo && !directo && !esEdicionCliente() ? URL_COHORTE : null)
}

/** Polar en vivo con la definición única del MRR (15 nov 2026): el recurrente y, aparte, las cuotas. Dinero: no en directo. */
export function useMrr(activo = true) {
  const directo = useDirectoIsla()
  return useFuente<RespuestaMrr>(activo && !directo && !esEdicionCliente() ? URL_MRR : null)
}
