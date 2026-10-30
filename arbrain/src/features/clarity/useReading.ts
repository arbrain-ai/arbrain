'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
type Entry = { data: unknown; at: number }
const cache = new Map<string,Entry>()
const listeners = new Map<string,Set<(data:unknown)=>void>>()
const pending = new Map<string,Promise<unknown>>()
// Session-only, keyed by the UI principal. Never persist business data globally.
export function useReading<T>(url: string | null, refreshHeader=false, timeoutMs=30_000) {
 const {profile} = useAuth(), owner=profile?.id
 const key=owner && url ? `${owner}:${url}` : ''
 const [state,setState]=useState<{key:string;data:T|null;error:string|null;loading:boolean}>({key:'',data:null,error:null,loading:false})
 useEffect(()=>{if(!key)return;const update=(data:unknown)=>setState({key,data:data as T,error:null,loading:false});const group=listeners.get(key)??new Set();group.add(update);listeners.set(key,group);return()=>{group.delete(update);if(!group.size)listeners.delete(key)}},[key])
 const [revision,setRevision]=useState(0),forceFor=useRef<string|null>(null)
 const refresh=useCallback(()=>{forceFor.current=key;setRevision(n=>n+1)},[key])
 useEffect(()=>{
  if(!key||!url)return
  const forced=forceFor.current===key;forceFor.current=null
  let active=true
  const saved=cache.get(key)
  setState({key,data:(saved?.data as T)??null,error:null,loading:true})
  if(saved && Date.now()-saved.at<60_000 && !revision){setState({key,data:saved.data as T,error:null,loading:false});return}
  let promise=pending.get(key)
  if(!promise){promise=fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs),headers:refreshHeader&&forced?{'x-arbrain-refresh':'1'}:undefined}).then(async r=>{const body=await r.json();if(!r.ok){if(r.status===401||r.status===403)cache.delete(key);throw new Error(body.error??'No se pudo actualizar.');}return body}).then(data=>{cache.set(key,{data,at:Date.now()});listeners.get(key)?.forEach(listener=>listener(data));if(cache.size>24)cache.delete(cache.keys().next().value!);return data}).finally(()=>pending.delete(key));pending.set(key,promise)}
  promise.then(data=>{if(active)setState({key,data:data as T,error:null,loading:false})}).catch(error=>{if(active)setState({key,data:(cache.get(key)?.data as T)??null,error:error.message,loading:false})})
  return ()=>{active=false}
 },[key,url,revision,refreshHeader,timeoutMs])
 const data=state.key===key ? state.data : (cache.get(key)?.data as T)??null
 return {data,error:state.key===key?state.error:null,loading:state.key!==key||state.loading,refresh}
}
