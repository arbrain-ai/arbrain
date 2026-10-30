'use client'
import {useCallback,useEffect,useRef,useState} from 'react'

export interface ReporteDiarioSnapshot{fecha:string|null;titulo:string|null;generated_at:string|null;stale:boolean;today:string}

/** Read-only status of the daily HTML report (upserted by the 08:50 cron into reportes_html). */
export function useReporteDiario(enabled:boolean){
 const [data,setData]=useState<ReporteDiarioSnapshot|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true)
 const seq=useRef(0),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;seq.current++}},[])
 const refresh=useCallback(async()=>{
  const n=++seq.current;setLoading(true)
  try{
   const r=await fetch('/api/reporte',{cache:'no-store',signal:AbortSignal.timeout(20_000)})
   const b=await r.json()
   if(n!==seq.current||!alive.current)return
   if(!r.ok)throw new Error(b.error??'No se pudo leer el reporte diario.')
   setData(b);setError(null)
  }catch(e){if(n===seq.current&&alive.current)setError(e instanceof Error?e.message:'No se pudo leer el reporte diario.')}
  finally{if(n===seq.current&&alive.current)setLoading(false)}
 },[])
 useEffect(()=>{if(!enabled){setLoading(false);return}void refresh()},[enabled,refresh])
 return {data,error,loading,refresh}
}
