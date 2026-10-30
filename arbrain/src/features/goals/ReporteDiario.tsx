'use client'
import {ArrowUpRight,RefreshCw} from 'lucide-react'
import {useReporteDiario} from './useReporteDiario'
import {labelDate} from './model'
import styles from './minimal.module.css'

/** Card for the 08:50 daily HTML report, lazily fetched — never blocks the rest of Hoy. */
export function ReporteDiario(){
 const {data,error,loading,refresh}=useReporteDiario(true)
 const fresh=!!data&&!data.stale&&!!data.fecha
 return <section className={styles.reporte} aria-label="Reporte diario">
  <div className={styles.heading}>
   <h2>Reporte diario</h2>
   {fresh&&<a href="/api/reporte?raw=1" target="_blank" rel="noopener noreferrer">Pantalla completa <ArrowUpRight size={12}/></a>}
  </div>
  {loading&&!data&&!error?<p className={styles.empty}>Cargando…</p>
   :error?<div className={styles.error} role="status">{error}<button onClick={()=>void refresh()}><RefreshCw size={11}/>Reintentar</button></div>
   :fresh?<iframe
     className={styles.reporteFrame}
     src="/api/reporte?raw=1"
     title={data!.titulo??'Reporte diario'}
     sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
     loading="lazy"
    />
   :<p className={styles.empty}>El reporte de hoy aún no se ha generado · corre a las 08:50.{data?.fecha?` Último disponible: ${labelDate(data.fecha)}.`:''}</p>}
 </section>
}
