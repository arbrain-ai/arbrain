'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { mergeSnapshot, optimisticTask } from './model'
import { bufferedRange, coversRange, type ReadRange } from './read-window'
import type { MutationResult, PlanMutation, PlanningSnapshot } from './types'

type CachedRead = {snapshot:PlanningSnapshot;at:number;range:ReadRange}
// Memory only, partitioned by the authenticated UI identity. A new route can
// paint data already read by this session without another blank loading screen.
const sessionReads = new Map<string,Map<string,CachedRead>>()
const sessionEpochs = new Map<string,number>()
/** Fuera de la app al menos esto: una lectura en vuelo se da por congelada y se repite. */
export const VOLVER_MS = 5_000
/** La primera lectura que no llega en este tiempo se reintenta una vez (sin datos, la vista solo diría «Leyendo…»). */
export const PRIMERA_LECTURA_MS = 25_000
export function usePlanning(range: ReadRange, bufferDays = 0) {
  const {profile} = useAuth()
  const scope = profile?.id ?? null
  const shared = scope ? sessionReads.get(scope) : undefined
  const initial = shared && [...shared.values()].reverse().find(c=>coversRange(c.range,range))

  const [snapshot, setSnapshot] = useState<PlanningSnapshot | null>(initial?.snapshot ?? null)
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [pending, setPending] = useState<PlanMutation | null>(null)
  const [saving, setSaving] = useState(false)
  const seq = useRef(0), epoch = useRef(0), mutationBusy = useRef(false)
  const fetching = useRef(false)
  const pendingRef = useRef<PlanMutation | null>(null)
  const mutateRef = useRef<(operation: PlanMutation) => Promise<MutationResult>>(() => Promise.reject(new Error('Sin montar')))
  const snapshotRef = useRef<PlanningSnapshot | null>(initial?.snapshot ?? null)
  const rangeRef = useRef(range)
  rangeRef.current = range
  const cache = useRef(shared ?? new Map<string,CachedRead>())
  const scopeRef = useRef(scope)
  const alive = useRef(true)
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;seq.current++}},[])
  if (scope && scopeRef.current===scope && !sessionReads.has(scope)) {
    sessionReads.set(scope,cache.current)
    if(sessionReads.size>4)sessionReads.delete(sessionReads.keys().next().value!)
  }
  const inFlight = useRef<{range:ReadRange; epoch:number; forceMetadata:boolean; promise:Promise<{ok:boolean;status:number;body:PlanningSnapshot & {error?:string}}>}[]>([])
  const bufferRef = useRef(bufferDays); bufferRef.current = bufferDays

  const refresh = useCallback(async (force = true) => {
    if(mutationBusy.current || !alive.current)return
    const requestedRange = {...rangeRef.current}
    const cached = [...cache.current.values()].reverse().find(c => c.snapshot.ownerId === snapshotRef.current?.ownerId && coversRange(c.range,requestedRange))
    if (cached) { snapshotRef.current = cached.snapshot; setSnapshot(cached.snapshot) }
    const nearEdge = cached && bufferRef.current > 0 && !coversRange(cached.range,requestedRange,Math.min(5,bufferRef.current))
    if (!force && cached && !nearEdge && Date.now()-cached.at < 30_000 && cached.snapshot.health.every(h=>h.state==='fresh')) {
      setLoading(false)
      return
    }
    const sequence = ++seq.current, version = epoch.current
    const sharedVersion = scopeRef.current ? sessionEpochs.get(scopeRef.current) ?? 0 : 0
    fetching.current = true
    setLoading(true)
    try {
      // A date change during startup can use the same in-flight padded read.
      // Failed reads and mutations never reuse a request from an older epoch.
      let job = inFlight.current.find(j=>j.epoch===version&&(!force||j.forceMetadata)&&coversRange(j.range,requestedRange))
      if (!job) {
        const window = bufferedRange(requestedRange,bufferRef.current)
        const promise = (async () => {
          const response = await fetch(`/api/planning?${new URLSearchParams({...window,forceMetadata:String(force)})}`,{cache:'no-store',signal:AbortSignal.timeout(100_000)})
          return {ok:response.ok,status:response.status,body:await response.json()}
        })()
        job = {range:window,epoch:version,forceMetadata:force,promise}
        const created = job
        inFlight.current.push(created)
        void promise.finally(()=>{inFlight.current=inFlight.current.filter(j=>j!==created)}).catch(()=>{})
      }
      const {ok,status,body} = await job.promise
      if (!alive.current || sequence !== seq.current || version !== epoch.current || sharedVersion !== (scopeRef.current ? sessionEpochs.get(scopeRef.current) ?? 0 : 0) || !coversRange(job.range,rangeRef.current)) return
      if (!ok) {
        if (status === 401 || status === 403) {snapshotRef.current=null;setSnapshot(null);cache.current.clear()}
        throw new Error(body.error ?? 'No se pudo leer la planificación.')
      }
      if (body.ownerId !== snapshotRef.current?.ownerId) {
        cache.current.clear(); pendingRef.current=null;setPending(null)
      }
      const next = mergeSnapshot(snapshotRef.current,body)
      const key = JSON.stringify(job.range)
      cache.current.set(key,{snapshot:next,at:Date.now(),range:job.range})
      if(cache.current.size>8)cache.current.delete(cache.current.keys().next().value!)
      snapshotRef.current=next;setSnapshot(next);setReadError(null)
      if (!pendingRef.current) {
        try {
          const stored = localStorage.getItem(`arbrain:planning:pending:${next.ownerId}`)
          const candidate = stored ? JSON.parse(stored) : null
          if (candidate?.ownerId === next.ownerId && typeof candidate.requestId === 'string') {
            pendingRef.current=candidate;setPending(candidate)
            // Reenvío solo, idempotente. La espera deja que otra pantalla que lo tenga en vuelo lo confirme primero.
            setTimeout(()=>{ if(alive.current && pendingRef.current?.requestId===candidate.requestId && !mutationBusy.current) void mutateRef.current(candidate).catch(()=>{}) },15_000)
          }
        } catch { /* Storage never authorizes a new request. */ }
      }
    } catch (err) {
      if(sequence===seq.current)setReadError(err instanceof Error?err.message:'No se pudo conectar.')
    } finally {if(sequence===seq.current){fetching.current=false;setLoading(false)}}
  }, [])

  useEffect(()=>{
    if(scopeRef.current===scope)return
    scopeRef.current=scope;seq.current++;epoch.current++
    cache.current=scope?(sessionReads.get(scope)??new Map()):new Map()
    if(scope)sessionReads.set(scope,cache.current)
    snapshotRef.current=null;setSnapshot(null);pendingRef.current=null;setPending(null)
    void refresh(false)
  },[scope,refresh])
  useEffect(()=>{void refresh(false);return ()=>{seq.current++}},[refresh,range.from,range.to,range.includeCompleted])
  // Lecturas colgadas (10 oct 2026, Daniel: la Semana se quedó en «Leyendo tu calendario…»). El iPhone congela la app en segundo
  // plano con la lectura a medias: al volver, esa promesa sigue pendiente (su timeout también se congeló) y no hay nada que pintar.
  // Al volver tras unos segundos fuera, una lectura en vuelo se abandona (nueva época: su respuesta tardía se descarta) y se lee de
  // nuevo; y si la primera lectura no llega en 25 s, se reintenta una vez.
  const abandonar = useCallback(()=>{epoch.current++;inFlight.current=[];fetching.current=false;void refresh(false)},[refresh])
  useEffect(()=>{
    let oculto=0
    const cambio=()=>{
      if(document.visibilityState==='hidden'){oculto=Date.now();return}
      const fuera=oculto?Date.now()-oculto:0;oculto=0
      if(fuera<VOLVER_MS)return
      if(fetching.current)abandonar();else void refresh(false)
    }
    document.addEventListener('visibilitychange',cambio)
    return ()=>document.removeEventListener('visibilitychange',cambio)
  },[refresh,abandonar])
  const reintentado=useRef(false)
  useEffect(()=>{
    if(snapshot){reintentado.current=false;return}
    if(!loading||reintentado.current)return
    const t=setTimeout(()=>{if(fetching.current&&!snapshotRef.current){reintentado.current=true;abandonar()}},PRIMERA_LECTURA_MS)
    return ()=>clearTimeout(t)
  },[loading,snapshot,abandonar])
  useEffect(() => {
    const poll = () => { if (!document.hidden && !mutationBusy.current && !fetching.current) void refresh(false) }
    const changed = (e:Event) => {
      const detail=(e as CustomEvent).detail
      if(!scopeRef.current || detail.scope!==scopeRef.current || mutationBusy.current)return
      if(pendingRef.current?.requestId===detail.requestId){pendingRef.current=null;setPending(null)}
      epoch.current++;void refresh()
    }
    window.addEventListener('arbrain:planning:changed',changed)
    const timer = window.setInterval(poll, 30_000)
    window.addEventListener('online', poll)
    window.addEventListener('focus', poll)
    return () => { window.removeEventListener('arbrain:planning:changed',changed); window.clearInterval(timer); window.removeEventListener('online', poll); window.removeEventListener('focus', poll) }
  }, [refresh])

  // Una escritura a la vez, en fila: el autoguardado de la hoja y un arrastre o un «completar» ya no chocan
  // («Hay una operación en curso»); cada una espera a la anterior y conserva su propio resultado o error.
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  const mutate = useCallback((operation: PlanMutation): Promise<MutationResult> => {
    const paso = cola.current.then(() => ejecutar(operation))
    cola.current = paso.catch(() => undefined)
    return paso
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  mutateRef.current = mutate
  const ejecutarRef = useRef<(operation: PlanMutation) => Promise<MutationResult>>(null!)
  const ejecutar = (operation: PlanMutation) => ejecutarRef.current(operation)
  ejecutarRef.current = async (operation: PlanMutation): Promise<MutationResult> => {
    const retrying = pendingRef.current?.requestId === operation.requestId
    if (mutationBusy.current) throw new Error('Hay una operación en curso.')
    // Una edición nueva del MISMO elemento sustituye a su actualización pendiente: describe el estado completo deseado
    // y el etag/updatedAt del proveedor impide pisar un cambio ajeno. Crear, borrar o completar siguen exigiendo resolverlo.
    const p = pendingRef.current
    const sustituye = p && p.action === 'update' && operation.action === 'update' && p.kind === operation.kind && p.externalId === operation.externalId && p.calendarId === operation.calendarId && p.account === operation.account
    // Un envío sin confirmar (respuesta perdida: reinicio del web, red) ya no bloquea todo lo demás (5 oct 2026, «cumplo las
    // tareas pero no me permite llenarlas»): se reenvía tal cual, con su mismo requestId, y la pluma devuelve su recibo sin
    // duplicar. Solo si sigue sin confirmarse se detiene la operación nueva.
    // Volver a palomear la misma tarea (o borrar el mismo evento) mientras su envío sigue sin confirmar: es el mismo acto.
    if (p && p.requestId !== operation.requestId && p.action === operation.action && p.action !== 'create' && p.action !== 'update' && p.kind === operation.kind && p.externalId === operation.externalId) return ejecutarRef.current(p)
    if (p && p.requestId !== operation.requestId && !sustituye) {
      try { await ejecutarRef.current(p) } catch (err) { if (pendingRef.current) throw err }
    }
    if (operation.ownerId !== snapshotRef.current?.ownerId) throw new Error('La identidad cambió. Vuelve a abrir el calendario.')
    const before = snapshotRef.current
    const mutationScope=scopeRef.current
    if(mutationScope)sessionEpochs.set(mutationScope,(sessionEpochs.get(mutationScope)??0)+1)
    mutationBusy.current = true
    epoch.current++
    setSaving(true); setMutationError(null)
    pendingRef.current = operation; setPending(operation)
    cache.current.clear()
    if(before){const optimistic=optimisticTask(before,operation);snapshotRef.current=optimistic;setSnapshot(optimistic)}
    try { localStorage.setItem(`arbrain:planning:pending:${operation.ownerId}`, JSON.stringify(operation)) } catch { /* still retained in memory */ }
    try {
      const res = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation), signal: AbortSignal.timeout(100_000) })
      const result = await res.json()
      if (!res.ok) {
        // Definitive validation/conflict errors did not commit. The editor may
        // change the draft. Ambiguous failures keep the exact request for retry.
        if ([400, 404, 409, 410, 412, 413, 422].includes(res.status) || (!retrying && [401, 403].includes(res.status))) {
          pendingRef.current = null; setPending(null)
          try { localStorage.removeItem(`arbrain:planning:pending:${operation.ownerId}`) } catch { /* noop */ }
        }
        throw new Error(result.error ?? 'El proveedor no confirmó el cambio.')
      }
      if(snapshotRef.current?.ownerId!==operation.ownerId){
        try{localStorage.removeItem(`arbrain:planning:pending:${operation.ownerId}`)}catch{}
        return result
      }
      const current = snapshotRef.current
      cache.current.clear()
      if (current) {
        const next = { ...current,
          events: result.event ? [...current.events.filter(e => e.id !== result.event.id), result.event] : result.deletedId && operation.kind === 'event' ? current.events.filter(e => e.externalId !== result.deletedId || e.account !== operation.account || e.calendarId !== operation.calendarId) : current.events,
          tasks: result.task ? [...current.tasks.filter(t => t.id !== result.task.id), result.task] : result.completedId ? current.tasks.filter(t => t.externalId !== result.completedId) : current.tasks,
          completedTasks:current.completedTasks?.map(t=>t.externalId===result.completedId?{...t,pending:false}:t),
        }
        snapshotRef.current = next; setSnapshot(next)
      }
      pendingRef.current = null; setPending(null)
      try { localStorage.removeItem(`arbrain:planning:pending:${operation.ownerId}`) } catch { /* noop */ }
      return result
    } catch (err) {
      if(before && snapshotRef.current?.ownerId===operation.ownerId){snapshotRef.current=before;setSnapshot(before)}
      setMutationError(err instanceof Error ? err.message : 'No se pudo confirmar el cambio.')
      throw err
    } finally {
      mutationBusy.current = false; epoch.current++; setSaving(false)
      if(mutationScope){
        sessionEpochs.set(mutationScope,(sessionEpochs.get(mutationScope)??0)+1)
        window.dispatchEvent(new CustomEvent('arbrain:planning:changed',{detail:{scope:mutationScope,requestId:pendingRef.current?null:operation.requestId}}))
      }
      void refresh()
    }
  }

  const visibleSnapshot = useMemo(()=>{
    if(scopeRef.current!==scope || !snapshot)return null
    // Hoy reads one day even when its data came from a cached calendar window.
    if(bufferDays)return snapshot
    const from=Date.parse(range.from),to=Date.parse(range.to)
    return {...snapshot,range:{from:range.from,to:range.to},events:snapshot.events.filter(e=>Date.parse(e.start)<to&&Date.parse(e.end)>from),
      completedTasks:snapshot.completedTasks?.filter(t=>t.completedAt&&Date.parse(t.completedAt)>=from&&Date.parse(t.completedAt)<to)}
  },[snapshot,range.from,range.to,scope,bufferDays])
  return { snapshot:visibleSnapshot, loading, error: mutationError ?? readError, readError, saving, pending, refresh, mutate }
}
