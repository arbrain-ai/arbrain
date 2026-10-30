'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { addDays, endOfMonth, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, Circle, Filter, Plus, RefreshCw } from 'lucide-react'
import { usePlanning } from '@/features/planning/usePlanning'
import { mutationFor } from '@/features/planning/model'
import { PlanEditor, type EditorSelection } from '@/features/planning/PlanEditor'
import { useAutoguardado } from '@/features/planning/autoguardado'
import type { PlanTask } from '@/features/planning/types'
import { useCivilClock, useHabitRecords } from '@/features/sistema/useHabitRecords'
import { civilToday, civilMidnight, shiftDay } from '@/features/sistema/calendar-days'
import { HabitGrid, HabitKeys } from './Habits'
import { canonicalSection, taskDate, taskGroup } from './model'
import styles from './todotask.module.css'
import { TodotaskTabs } from './TodotaskTabs'

type View = 'list' | 'flow' | 'habits'
const groups = ['Por reprogramar','Hoy','Mañana','Próximos 7 días','Después','Sin fecha']
export function Todotask() {
  const params=useSearchParams()
  const {today,timeZone}=useCivilClock()
  const [view,setView]=useState<View>(params.get('view')==='habits'?'habits':params.get('view')==='flow'?'flow':'list')
  const [anchor,setAnchor]=useState(today)
  const [period,setPeriod]=useState<'week'|'month'>('month')
  const [project,setProject]=useState(''), [priority,setPriority]=useState(''), [horizon,setHorizon]=useState('all')
  const [history,setHistory]=useState(false)
  const [selection,setSelection]=useState<EditorSelection|null>(null)
  const [actionError,setActionError]=useState<string|null>(null)
  const day=startOfDay(new Date(`${today}T12:00:00`))
  const planning=usePlanning({from:civilMidnight(shiftDay(today,-30),timeZone).toISOString(),to:civilMidnight(shiftDay(today,1),timeZone).toISOString(),includeCompleted:'true'})
  const base=new Date(`${anchor}T12:00:00`)
  const from=format(period==='month'?startOfMonth(base):startOfWeek(base,{weekStartsOn:1}),'yyyy-MM-dd')
  const to=format(period==='month'?endOfMonth(base):addDays(new Date(`${from}T12:00:00`),6),'yyyy-MM-dd')
  const habits=useHabitRecords({date:today,from,to,timeZone})
  // Autoguardado de la hoja (5 oct): la tarea editada se ve ya en la lista y se escribe por la misma pluma; un fallo se avisa aquí.
  const auto=useAutoguardado({ownerId:planning.snapshot?.ownerId,escribir:planning.mutate,onFallo:(titulo,mensaje)=>setActionError(`No se guardó «${titulo}»: ${mensaje} Volvió a como está en Todoist.`)})
  const snapshot=useMemo(()=>planning.snapshot?auto.aplicar(planning.snapshot):planning.snapshot,[planning.snapshot,auto])
  useEffect(()=>{const requested=params.get('view');if(requested==='habits'||requested==='flow'||requested==='list')setView(requested)},[params])
  const chooseView=(next:View)=>{setView(next);window.history.replaceState({},'',`/todotask?view=${next}`)}
  const filtered=(task:PlanTask)=>{
    if(project&&task.projectId!==project)return false
    if(priority&&task.priority!==Number(priority))return false
    const date=taskDate(task,timeZone)
    if(horizon==='today'&&date!==today)return false
    if(horizon==='week'&&(!date||date<today||date>format(addDays(day,7),'yyyy-MM-dd')))return false
    if(horizon==='undated'&&date)return false
    return true
  }
  const active=(snapshot?.tasks??[]).filter(t=>!t.completed)
  const visible=active.filter(filtered).sort((a,b)=>a.priority-b.priority||(a.due??'z').localeCompare(b.due??'z'))
  const done=(snapshot?.completedTasks??[]).filter(filtered).sort((a,b)=>(b.completedAt??'').localeCompare(a.completedAt??''))
  const sections=snapshot?.sections??[]
  const workingIds=new Set(sections.filter(s=>canonicalSection(s.title)==='haciendo').map(s=>s.id))
  const wip=active.filter(t=>t.sectionId&&workingIds.has(t.sectionId)).length
  const sectionName=(task:PlanTask)=>task.sectionId?canonicalSection(sections.find(s=>s.id===task.sectionId)?.title??`Sección ${task.sectionId}`):'backlog'
  const columnNames=[...new Set(['backlog','por hacer','haciendo',...sections.map(s=>canonicalSection(s.title)),...active.map(sectionName)])]
  const titleFor=(name:string)=>name==='backlog'?'Backlog':name==='por hacer'?'Por hacer':name==='haciendo'?'Haciendo':sections.find(s=>canonicalSection(s.title)===name)?.title??name
  const blocked=planning.saving||!!planning.pending
  const operate=async(task:PlanTask,action:'complete'|'move'|'reopen',data:Record<string,unknown>={})=>{
    if(!snapshot)return
    setActionError(null)
    try{await planning.mutate(mutationFor(task,snapshot.ownerId,data,action))}catch(err){setActionError(err instanceof Error?err.message:'No se pudo guardar.')}
  }
  const moveTo=(task:PlanTask,column:string)=>{
    if(column==='done'){void operate(task,'complete');return}
    const target=sections.find(s=>s.projectId===task.projectId&&canonicalSection(s.title)===column)
    if(column!=='backlog'&&!target){setActionError('Ese proyecto no tiene esta sección. Elige una de sus secciones disponibles.');return}
    void operate(task,'move',{sectionId:target?.id??null})
  }
  const row=(task:PlanTask,card=false)=><div key={task.id} className={card?styles.taskCard:styles.taskRow} draggable={card&&!blocked} onDragStart={e=>e.dataTransfer.setData('application/x-arbrain-task',task.id)}>
    <button className={styles.taskCheck} data-priority={task.priority} aria-label={`Completar ${task.title}`} disabled={blocked} onClick={()=>void operate(task,'complete')}><Circle size={17}/></button>
    <button className={styles.taskTitle} onClick={()=>setSelection({item:task})}><span>{task.title}</span>{card&&task.description&&<small>{task.description}</small>}</button>
    <span className={styles.taskProject}>{snapshot?.projects.find(p=>p.id===task.projectId)?.title??'Todoist'}</span>
    <span className={styles.taskDate}>{task.pending?'Guardando…':task.due?(taskDate(task,timeZone)===today?'Hoy':taskDate(task,timeZone)):'Sin fecha'}</span>
    <select className={styles.moveSelect} aria-label={`Mover ${task.title}`} disabled={blocked} value={task.sectionId??''} onChange={e=>void operate(task,'move',{sectionId:e.target.value||null})}>
      <option value="">Backlog</option>{sections.filter(s=>s.projectId===task.projectId).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
    </select>
  </div>
  const completedRow=(task:PlanTask)=><details key={`${task.id}:${task.completedAt}`} className={styles.completed}><summary><Check size={15}/><span>{task.title}</span><time>{task.pending?'Guardando…':task.completedAt?new Date(task.completedAt).toLocaleDateString('es-MX',{timeZone}):''}</time></summary>{task.description&&<p>{task.description}</p>}<button disabled={blocked||active.some(t=>t.id===task.id)} onClick={()=>void operate(task,'reopen')}>{active.some(t=>t.id===task.id)?'La siguiente repetición ya está activa':'Reabrir tarea'}</button></details>
  return <main className={styles.page}>
    <HabitKeys habits={habits} today={today} enabled={view==='habits'&&from<=today&&to>=today&&!selection}/>
    <header className={styles.topbar}><TodotaskTabs view={view} onChange={chooseView}/><div className={styles.spacer}/><button aria-label="Actualizar Todotask" onClick={()=>{void planning.refresh();void habits.refresh()}}><RefreshCw size={15}/></button></header>
    <div className={styles.taskBody}>
      {view==='habits'?<>
        <div className={styles.habitToolbar}><h1>{base.toLocaleDateString('es-MX',{month:'long',year:'numeric'})}</h1><button aria-label="Período anterior" onClick={()=>setAnchor(format(period==='month'?new Date(base.getFullYear(),base.getMonth()-1,1):addDays(base,-7),'yyyy-MM-dd'))}><ChevronLeft size={16}/></button><button onClick={()=>setAnchor(today)}>Hoy</button><button aria-label="Período siguiente" onClick={()=>setAnchor(format(period==='month'?new Date(base.getFullYear(),base.getMonth()+1,1):addDays(base,7),'yyyy-MM-dd'))}><ChevronRight size={16}/></button><div className={styles.spacer}/><button aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>Semana</button><button aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>Mes</button></div>
        <HabitGrid habits={habits} from={from} to={to} today={today}/>
      </>:<>
        <div className={styles.filterbar}><details className={styles.filters}><summary><Filter size={14}/>Filtro{project||priority||horizon!=='all'?' · activo':''}</summary><div className={styles.filterPanel}>
          <label>Proyecto<select value={project} onChange={e=>setProject(e.target.value)}><option value="">Todos</option>{snapshot?.projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
          <label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">Todas</option>{[1,2,3,4].map(n=><option key={n} value={n}>P{n}</option>)}</select></label>
          <label>Fecha<select value={horizon} onChange={e=>setHorizon(e.target.value)}><option value="all">Todas</option><option value="today">Hoy</option><option value="week">Próximos 7 días</option><option value="undated">Sin fecha</option></select></label>
          <button onClick={()=>{setProject('');setPriority('');setHorizon('all')}}>Limpiar filtros</button>
        </div></details><span className={styles.muted}>{visible.length} de {active.length} activas{planning.saving?' · Guardando…':''}</span><div className={styles.spacer}/><button onClick={()=>setHistory(!history)} aria-pressed={history}>Historial</button><button onClick={()=>setSelection({kind:'task'})}><Plus size={15}/>Tarea</button></div>
        {(planning.error||actionError||snapshot?.health.some(h=>h.state!=='fresh'))&&<div className={styles.error} role="status">{actionError??planning.error??'Hay fuentes sin actualizar; la lectura puede estar incompleta.'}{planning.pending&&!planning.saving&&<button onClick={()=>{setActionError(null);void planning.mutate(planning.pending!).catch(()=>{})}}>Reintentar envío</button>}</div>}
        {!snapshot&&<p className={styles.muted}>{planning.loading?'Leyendo Todoist…':'No se pudo consultar Todoist.'}</p>}
        {history?<section><div className={styles.sectionHeading}><h2>Completadas · últimos 30 días</h2></div>{done.map(completedRow)}{!done.length&&snapshot&&<p className={styles.muted}>Sin completadas en este rango y filtro.</p>}</section>:view==='list'?<div>{groups.map(group=>{
          const tasks=visible.filter(t=>taskGroup(t,today,timeZone)===group)
          if(!tasks.length)return null
          return <details key={group} open className={styles.taskGroup}><summary>{group}<span>{tasks.length}</span></summary>{tasks.map(t=>row(t))}</details>
        })}{!visible.length&&snapshot&&<p className={styles.muted}>{active.length?'No hay tareas que coincidan con el filtro.':'Sin tareas activas.'}</p>}</div>:<>
          {wip>1&&<p className={styles.wip}>Hay {wip} tareas en Haciendo. Referencia: una a la vez, incluidas las ocultas por filtros.</p>}
          <div className={styles.flow}>{[...columnNames,'done'].map(name=>{
            const tasks=name==='done'?done.filter(t=>t.completedAt&&civilToday(timeZone,new Date(t.completedAt))===today):visible.filter(t=>sectionName(t)===name)
            const total=name==='done'?tasks.length:active.filter(t=>sectionName(t)===name).length
            return <section key={name} className={styles.column} onDragOver={e=>{if(!blocked)e.preventDefault()}} onDrop={e=>{e.preventDefault();const task=active.find(t=>t.id===e.dataTransfer.getData('application/x-arbrain-task'));if(task&&!blocked)moveTo(task,name)}}><h2>{name==='done'?'Hecho hoy':titleFor(name)}<span>{tasks.length}{tasks.length!==total?` / ${total}`:''}</span></h2>{name==='done'?tasks.map(completedRow):tasks.map(t=>row(t,true))}{!tasks.length&&<p className={styles.emptyColumn}>{total?'Ocultas por el filtro':name==='done'?'Aún sin completadas hoy':'Sin tareas aquí'}</p>}</section>
          })}</div>
        </>}
      </>}
      <footer className={styles.footer}><Link href="/calendar?mode=month">Objetivos del mes ↗</Link></footer>
    </div>
    {selection&&snapshot&&<PlanEditor key={selection.item?.id??'new'} selection={selection} snapshot={snapshot} saving={planning.saving} unresolved={!!planning.pending&&!planning.saving&&!(planning.pending.action==='update'&&planning.pending.externalId===selection.item?.externalId)} auto={auto} onSave={planning.mutate} onRetry={()=>planning.pending?planning.mutate(planning.pending):Promise.resolve()} onClose={()=>setSelection(null)}/>}
  </main>
}
