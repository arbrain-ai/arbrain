'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import s from './clarity.module.css'
const DeepAnalysis=dynamic(()=>import('@/features/command-hub/MLDashboardView').then(m=>m.MLDashboardView),{loading:()=> <p className={s.empty}>Abriendo análisis…</p>})

/** Command Center ya no tiene resumen propio (6 oct 2026): sus 3 cifras viven arriba de Finanzas («Lo que entra»).
 *  Solo queda el archivo de análisis anterior (?detail=analysis o ?tab=…); sin él, la ruta lleva a Finanzas. */
export function CommandOverview(){
 const router=useRouter(), params=useSearchParams(), deep=params.get('detail')==='analysis'||['funnel','agents','retention','expansion','vision'].includes(params.get('tab')??'')
 useEffect(()=>{if(!deep)router.replace('/finanzas')},[deep,router])
 if(!deep)return <main className={s.root} aria-busy="true"><p className={s.empty}>Abriendo Finanzas…</p></main>
 return <main className={s.root}><p className={s.notice}>Vista anterior sin reconciliar: sus conversiones e ingresos atribuidos NO acreditan ventas. Conservada para consultar actividad histórica; las cifras reconciliadas de Polar están arriba de Finanzas.</p><div style={{flex:1,minHeight:0}}><DeepAnalysis/></div></main>
}
