'use client'
import { Finanzas } from './Finanzas'
import type { FinanceRange } from '../types/finances'
import e from '@/features/cabina/vistas/equipo.module.css'

/** La sección /finanzas: el mismo componente que el panel, a todo el ancho. `ver="cobros"` abre el pliegue de cobros fijos. */
export function FinancesPage({ rango, ver }: { rango?: FinanceRange; ver?: 'cobros' }) {
  return <main className={e.pagina}><div className={e.paginaScroll}><Finanzas donde="seccion" rango={rango} ver={ver} /></div></main>
}
