'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useAuth} from '@/hooks/useAuth'
import type {Goal,GoalSnapshot} from './model'
type Command={ownerId:string;revision:string;requestId:string;goal:Goal}
export function useGoals(){
 const {profile}=useAuth(),identity=profile?.id??null
 const [data,setData]=useState<GoalSnapshot|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[pending,setPending]=useState<Command|null>(null)
 const seq=useRef(0),alive=useRef(true),busy=useRef(false),dataRef=useRef(data),pendingRef=useRef(pending);dataRef.current=data;pendingRef.current=pending
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;seq.current++}},[])
 const refresh=useCallback(async()=>{
  if(busy.current)return
  const n=++seq.current;setLoading(true)
  try{const r=await fetch('/api/planning/objectives',{cache:'no-store',signal:AbortSignal.timeout(100_000)});const b=await r.json();if(n!==seq.current||!alive.current)return;if(!r.ok){if(r.status===401||r.status===403)setData(null);throw new Error(b.error??'No se pudo leer el plan.')};setData(b);setError(null)}catch(e){if(n===seq.current&&alive.current)setError(e instanceof Error?e.message:'No se pudo leer el plan.')}finally{if(n===seq.current&&alive.current)setLoading(false)}
 },[])
 useEffect(()=>{seq.current++;setData(null);setPending(null);pendingRef.current=null;void refresh()},[identity,refresh])
 useEffect(()=>{const poll=()=>{if(!document.hidden)void refresh()};window.addEventListener('arbrain:goals:changed',poll);window.addEventListener('focus',poll);window.addEventListener('online',poll);const t=setInterval(poll,30_000);return()=>{clearInterval(t);window.removeEventListener('arbrain:goals:changed',poll);window.removeEventListener('focus',poll);window.removeEventListener('online',poll)}},[refresh])
 useEffect(()=>{if(!data?.ownerId)return;try{const p=JSON.parse(localStorage.getItem('arbrain:goals:pending:'+data.ownerId)??'null');if(p?.ownerId===data.ownerId){pendingRef.current=p;setPending(p)}}catch{}},[data?.ownerId])
 const send=useCallback(async(command:Command)=>{
  if(busy.current)throw new Error('Ya se está guardando.')
  if(command.ownerId!==dataRef.current?.ownerId)throw new Error('La identidad cambió.')
  busy.current=true;seq.current++;setSaving(true);setError(null);pendingRef.current=command;setPending(command)
  const key='arbrain:goals:pending:'+command.ownerId
  try{localStorage.setItem(key,JSON.stringify(command))}catch{}
  try{
   const r=await fetch('/api/planning/objectives',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(100_000)}),b=await r.json()
   if(!r.ok){if([400,401,403,409,413].includes(r.status)){pendingRef.current=null;setPending(null);try{localStorage.removeItem(key)}catch{}}throw new Error(b.error??'No se pudo confirmar el objetivo.')}
   if(alive.current&&dataRef.current?.ownerId===command.ownerId){setData(b);dataRef.current=b;setPending(null);pendingRef.current=null;setError(null)}
   try{localStorage.removeItem(key)}catch{}
   window.dispatchEvent(new Event('arbrain:goals:changed'));return b as GoalSnapshot
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'No se pudo confirmar el objetivo.');throw e}
  finally{busy.current=false;if(alive.current)setSaving(false)}
 },[])
 const save=async(goal:Goal)=>{if(pendingRef.current)throw new Error('Confirma el envío pendiente antes de guardar otro cambio.');if(!dataRef.current)throw new Error('Espera a que se lea el plan.');return send({ownerId:dataRef.current.ownerId,revision:dataRef.current.revision,requestId:crypto.randomUUID(),goal})}
 return {data,error,loading,saving,pending,refresh,save,retry:()=>pendingRef.current?send(pendingRef.current):Promise.resolve(null)}
}
