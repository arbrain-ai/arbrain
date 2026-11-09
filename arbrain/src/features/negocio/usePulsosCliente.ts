'use client'
/**
 * El pulso de la edición del alumno (8 nov 2026): los seis órganos leídos del motor de Business Intelligence (las consultas
 * que el dueño conectó en `bi-fuentes.json`), la voz del cliente y sus rutinas. Fuera de la edición del alumno no pide nada
 * y devuelve null: el pulso del autor sigue igual (features/negocio/pulso.ts). Lógica de cada tarjeta: pulso-cliente.ts.
 */
import { useFuente } from '@/features/cabina/datos'
import { consultaEn } from '@/features/bi/catalogo'
import { URL_BI, urlConsulta, type RespuestaBI } from '@/features/bi/fuente'
import type { RespuestaConsulta } from '@/features/bi/modelo'
import type { ListaRutinas } from '@/lib/rutinas-cliente'
import { pulsoComprador, type LecturaDe, type Pulso, type RespuestaComprador } from './pulso'
import { pulsoDeConsulta, pulsoSistemasCliente } from './pulso-cliente'

export const URL_RUTINAS_CLIENTE = '/api/rutinas'

export function usePulsosCliente(activo: boolean, comprador: LecturaDe<RespuestaComprador>): Pulso[] | null {
  const bi = useFuente<RespuestaBI>(activo ? URL_BI : null)
  // Si el panel de BI no responde, los órganos que dependen de él dicen «conecta tu fuente», nunca un cero.
  const catalogo = bi.data?.activo ? bi.data.catalogo : bi.data || bi.error ? [] : undefined
  const url = (id: string) => { const c = catalogo ? consultaEn(catalogo, id) : null; return activo && c && c.conectada !== false ? urlConsulta(id, 30) : null }
  const interesados = useFuente<RespuestaConsulta>(url('interesados'))
  const ventas = useFuente<RespuestaConsulta>(url('ventas'))
  const entregas = useFuente<RespuestaConsulta>(url('entregas'))
  const ingresos = useFuente<RespuestaConsulta>(url('ingresos'))
  const gastos = useFuente<RespuestaConsulta>(url('gastos'))
  const rutinas = useFuente<ListaRutinas>(activo ? URL_RUTINAS_CLIENTE : null)
  if (!activo) return null
  return [
    pulsoDeConsulta('marketing', catalogo, interesados),
    pulsoDeConsulta('venta', catalogo, ventas),
    { ...pulsoComprador(comprador), conecta: true },
    pulsoDeConsulta('entrega', catalogo, entregas),
    pulsoDeConsulta('finanzas', catalogo, ingresos, { c: catalogo ? consultaEn(catalogo, 'gastos') : null, l: gastos }),
    pulsoSistemasCliente(rutinas),
  ]
}
