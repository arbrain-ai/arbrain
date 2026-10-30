'use client'
import Link from 'next/link'
import {ArrowUpRight,Check,ChevronLeft,ChevronRight,MessageCircle,FileText,Sparkles} from 'lucide-react'
import {mutationFor} from '@/features/planning/model'
import type {usePlanning} from '@/features/planning/usePlanning'
import type {PlanTask} from '@/features/planning/types'
import {shiftDay} from '@/features/sistema/calendar-days'
import {HabitFeedback,type HabitController} from '@/features/todotask/Habits'
import {habitDisplayName,realHabitName} from '@/features/sistema/habit-presentation'
import {NombreHabito} from '@/features/sistema/NombreHabito'
import {TodotaskTabs} from '@/features/todotask/TodotaskTabs'
import {useReporteDiario} from './useReporteDiario'
import {focusFor,dayAgenda,habitProgress,type Focus} from './hoy-model'
import {type Goal,type Horizon,horizonLabels,periodTitle,labelDate} from './model'
import s from './hoy-telefono.module.css'
import {seMuestra} from '@/features/planning/habitos-hoy'

// Hoy en el teléfono (25 sep 2026). Mismos datos y plumas que el Hoy de escritorio
// (GoalsWorkspace calcula todo y pasa aquí); cambia la jerarquía: la semana arriba,
// una sola siguiente acción con botones grandes, la agenda del día con el bloque en
// curso y los hábitos como botones de pulgar. Nada se escribe distinto.

type Planning=ReturnType<typeof usePlanning>
interface Props{
 date:string;today:string;now:Date;timeZone:string;goals:Goal[];goalsLoading:boolean;planning:Planning
 next:{task:PlanTask|null;reason:string}|null;habits:HabitController;problem:string|null;onRefresh:()=>void
 go:(scope:Horizon,date:string|null)=>void;converse:()=>void;ask:(draft:string)=>void
 /** En el panel (4 oct 2026) las pestañas de la sección sobran: la pestaña ya es Objetivos. */
 sinPestanas?:boolean
}

function FocusLine({items,empty}:{items:Focus[];empty:string}){
 if(!items.length)return <p className={s.focusEmpty}>{empty}</p>
 return <ul className={s.focusList}>{items.map(f=><li key={f.id} data-state={f.state??'calendar'}>
  {f.state==='completed'?<Check size={14} className={s.focusCheck}/>:null}
  <span>{f.title}</span>{f.state==='draft'&&<small>Borrador</small>}
 </li>)}</ul>
}

export function HoyTelefono({date,today,now,timeZone,goals,goalsLoading,planning,next,habits,problem,onRefresh,go,converse,ask,sinPestanas}:Props){
 const snapshot=planning.snapshot,isToday=date===today
 const week=focusFor(goals,snapshot,date,'week'),month=focusFor(goals,snapshot,date,'month'),day=focusFor(goals,snapshot,date,'day')
 const weekLabel=week.find(f=>f.label)?.label??'Esta semana'
 const {allDay,timed}=dayAgenda(snapshot,date,now.getTime(),isToday)
 const ahead=isToday?timed.filter(r=>r.state!=='past'):timed,done=timed.length-ahead.length
 const shown=ahead.slice(0,4)
 const reporte=useReporteDiario(isToday)
 const fmt=(iso:string)=>new Date(iso).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone})
 // Lo que el calendario nunca pinta (habitos-hoy.ts, FUERA_DEL_CALENDARIO, regla dura de Daniel) tampoco aparece en el teléfono.
 const list=(habits.data?.habitos??[]).filter(h=>seMuestra(h.clave))
 const progress=habitProgress(list.map(h=>habits.record(today,h.clave)?.hecho))
 const task=next?.task??null
 const block=!task?ahead.find(r=>r.state==='now'||r.state==='next')?.event:null
 const busy=planning.saving||!!planning.pending
 return <main className={s.page}>
  {!sinPestanas&&<header className={s.top}><TodotaskTabs view="hoy"/></header>}
  <div className={s.scroll}>
   <div className={s.dayRow}>
    <button className={s.round} aria-label="Día anterior" onClick={()=>go('day',shiftDay(date,-1))}><ChevronLeft size={18}/></button>
    <button className={s.dayTitle} onClick={()=>go('day',null)} aria-label={`${periodTitle('day',date)}. Volver a hoy`}>
     <span>{isToday?'Hoy':date<today?'Pasado':'Próximo'} · {labelDate(date,{month:'long'})}</span><h1>{labelDate(date,{weekday:'long',day:'numeric'})}</h1>
    </button>
    <button className={s.round} aria-label="Día siguiente" onClick={()=>go('day',shiftDay(date,1))}><ChevronRight size={18}/></button>
    <nav className={s.horizons} aria-label="Horizonte">{(['day','week','month'] as const).map(h=><button key={h} aria-pressed={h==='day'} onClick={()=>h!=='day'&&go(h,date)}>{h==='day'?'Día':horizonLabels[h]}</button>)}</nav>
   </div>

   {problem&&<div className={s.notice} role="status">{problem}<button onClick={onRefresh}>Reintentar</button></div>}
   {planning.pending&&!planning.saving&&<div className={s.notice}>La tarea no se confirmó.<button onClick={()=>void planning.mutate(planning.pending!).catch(()=>{})}>Reintentar</button></div>}

   {/* Con objetivo semanal: tarjeta con la semana arriba. Sin él: una franja de una
       línea con el mes y un solo «definir», para que la siguiente acción mande. */}
   {week.length?<section className={s.focus} aria-label="Objetivos que cubren el día">
    <div className={s.focusHead}><span className={s.eyebrow}>{weekLabel}</span>{week[0]?.origin==='calendario'&&<small>del calendario</small>}</div>
    <FocusLine items={week} empty=""/>
    {month.length>0&&<p className={s.line}><span>Mes</span>{month.map(m=>m.title).join(' · ')}</p>}
    {day.length>0&&<div className={s.line} data-day><span>Hoy</span><FocusLine items={day} empty=""/></div>}
   </section>:<section className={s.strip} aria-label="Objetivos que cubren el día">
    {month.length>0&&<p><span>Mes</span>{month.map(m=>m.title).join(' · ')}</p>}
    {day.length>0&&<p><span>Hoy</span>{day.map(d=>d.title).join(' · ')}</p>}
    <button className={s.link} onClick={converse}><Sparkles size={14}/>{goalsLoading?'Cargando objetivos…':day.length?'Sin objetivo semanal · definirlo con Levy':'Definir la semana y el día con Levy'}</button>
   </section>}

   <section className={s.next} aria-label="Siguiente acción">
    <span className={s.eyebrow}>Siguiente acción</span>
    {task?<>
     <h2>{task.title}</h2>
     <p>{next?.reason}</p>
     <div className={s.actions}>
      <button className={s.primary} disabled={busy} onClick={()=>snapshot&&void planning.mutate(mutationFor(task,snapshot.ownerId,{},'complete')).catch(()=>{})}><Check size={17}/>{planning.saving?'Guardando…':'Completar'}</button>
      <button className={s.secondary} onClick={()=>ask(`Mi siguiente acción es «${task.title}». `)}><MessageCircle size={16}/>Hablar con Levy</button>
     </div>
    </>:block?<>
     <h2>{block.title}</h2><p>Bloque de agenda · {fmt(block.start)}–{fmt(block.end)}. No hay una tarea comprometida para hoy.</p>
    </>:<p className={s.muted}>{planning.loading&&!snapshot?'Cargando…':'Sin tareas comprometidas para este día.'}</p>}
   </section>

   <section className={s.card} aria-label="Agenda">
    <div className={s.cardHead}><h2>Agenda</h2><Link href={`/calendar?date=${date}&mode=day`}>Calendario <ArrowUpRight size={14}/></Link></div>
    {allDay.map(e=><div key={e.id} className={s.allDay}><small>Todo el día</small><span>{e.title}</span></div>)}
    {done>0&&<p className={s.muted}>{done} {done===1?'bloque terminado':'bloques terminados'} antes de ahora.</p>}
    {shown.map(({event,state})=><Link key={event.id} className={s.slot} data-state={state} href={`/calendar?date=${date}&mode=day`}>
     <time>{fmt(event.start)}</time>
     <span className={s.slotTitle}>{event.title}</span>
     {state==='now'?<em>Ahora · hasta {fmt(event.end)}</em>:state==='next'?<em>Siguiente</em>:null}
    </Link>)}
    {ahead.length>shown.length&&<Link className={s.more} href={`/calendar?date=${date}&mode=day`}>+{ahead.length-shown.length} más en el calendario</Link>}
    {!timed.length&&!allDay.length&&<p className={s.muted}>{planning.loading&&!snapshot?'Cargando…':'Día sin bloques en el calendario.'}</p>}
    {timed.length>0&&!ahead.length&&<p className={s.muted}>Ya no quedan bloques hoy.</p>}
   </section>

   {isToday&&<section className={s.card} aria-label="Hábitos de hoy">
    <div className={s.cardHead}><h2>Hábitos <span className={s.count}>{progress.done} de {progress.total}</span></h2><Link href="/todotask?view=habits">Historial <ArrowUpRight size={14}/></Link></div>
    <div className={s.meter} aria-hidden="true"><i style={{width:`${progress.total?progress.done/progress.total*100:0}%`}}/></div>
    {!habits.data?<p className={s.muted}>{habits.loading?'Cargando…':'Hábitos no disponibles.'}</p>:<div className={s.habits}>{list.map(h=>{
     const state=habits.record(today,h.clave)?.hecho,label=habitDisplayName(h,today)
     return <button key={h.clave} className={s.habit} data-state={state===true?'done':state===false?'missed':'empty'} aria-pressed={state===true} aria-label={`${label}: ${state===true?'cumplido':state===false?'no cumplido':'sin registro'}`} onClick={()=>habits.toggle(today,h.clave)}>
      <span className={s.tick}>{state===true?<Check size={14} strokeWidth={3}/>:state===false?'×':null}</span><NombreHabito clave={h.clave} nombre={realHabitName(h,today)} tocable={false}/>
     </button>})}</div>}
    <div className={s.feedback}><HabitFeedback habits={habits}/></div>
   </section>}

   {isToday&&<a className={s.report} href="/api/reporte?raw=1" target="_blank" rel="noopener noreferrer">
    <FileText size={18}/><span><strong>Reporte diario</strong><small>{reporte.loading&&!reporte.data?'Revisando…':reporte.data&&!reporte.data.stale&&reporte.data.fecha?'Listo · competencia y métricas de las últimas 24 h':'Aún no se genera hoy · corre a las 08:50'}</small></span><ArrowUpRight size={16}/>
   </a>}
  </div>
 </main>
}
