'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import Link from 'next/link'
import {ArrowUpRight,Check,ChevronLeft,ChevronRight,RefreshCw,MessageCircle,Minus} from 'lucide-react'
import {usePlanning} from '@/features/planning/usePlanning'
import {mutationFor} from '@/features/planning/model'
import {civilMidnight,isCivilDate,shiftDay} from '@/features/sistema/calendar-days'
import {useCivilClock,useHabitRecords} from '@/features/sistema/useHabitRecords'
import {HabitKeys,HabitFeedback} from '@/features/todotask/Habits'
import {habitDisplayName,realHabitName} from '@/features/sistema/habit-presentation'
import {NombreHabito} from '@/features/sistema/NombreHabito'
import {HABIT_SHORTCUTS} from '@/features/sistema/habit-shortcuts'
import {TodotaskTabs} from '@/features/todotask/TodotaskTabs'
import {nextAction} from '@/features/todotask/model'
import {useAskLevy} from '@/shared/hooks/useAskLevy'
import {useGoals} from './useGoals'
import {ReporteDiario} from './ReporteDiario'
import {HoyTelefono} from './HoyTelefono'
import {seMuestra} from '@/features/planning/habitos-hoy'
import {focusFor} from './hoy-model'
import {Agenda} from '@/features/cabina/vistas/Dia'
import {porDia} from '@/features/cabina/vistas/agenda'
import {type Horizon,horizonLabels,period,periodTitle,navigatePeriod,inPeriod,taskDay,labelDate,contextualAction} from './model'
import base from '@/features/todotask/todotask.module.css'
import styles from './minimal.module.css'

function Pager({page,count,onChange}:{page:number;count:number;onChange:(n:number)=>void}){
 if(count<=1)return null
 return <div className={styles.pager}><button aria-label="Página anterior" disabled={page===0} onClick={()=>onChange(page-1)}><ChevronLeft size={13}/></button><span>{page+1} / {count}</span><button aria-label="Página siguiente" disabled={page>=count-1} onClick={()=>onChange(page+1)}><ChevronRight size={13}/></button></div>
}

/** Ancho de la raíz: Objetivos vive en la sección y en el panel (4 oct 2026) y se acomoda a SU ancho, no al de la ventana. */
function useAncho(){
 const ref=useRef<HTMLDivElement>(null),[ancho,setAncho]=useState<number|null>(null)
 useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(([e])=>setAncho(e.contentRect.width));ro.observe(el);setAncho(el.clientWidth);return()=>ro.disconnect()},[])
 return {ref,ancho}
}

/** `donde` (4 oct 2026, «el panel es la experiencia completa»): la pestaña Objetivos del panel es esta misma pieza.
 *  En el panel no lee ni escribe la URL (avisa con `onCambio`) y sus teclas de hábitos solo actúan con el foco dentro. */
export function GoalsWorkspace({donde='seccion',inicio,onCambio}:{donde?:'seccion'|'panel';inicio?:{horizon?:Horizon;date?:string};onCambio?:(horizon:Horizon,date:string|null)=>void}={}){
 const {now,today,timeZone}=useCivilClock(),ask=useAskLevy(),{ref:raiz,ancho}=useAncho()
 const isMobile=(ancho??(typeof window!=='undefined'?window.innerWidth:1200))<700
 const enPanel=donde==='panel'
 const acepta=useCallback((t:EventTarget|null)=>{const el=t instanceof Element?t:null;return enPanel?!!(el&&raiz.current?.contains(el)):!el?.closest('[data-panel-derecho]')},[enPanel,raiz])
 const [scope,setScope]=useState<Horizon>(inicio?.horizon??'day'),[chosen,setChosen]=useState<string|null>(inicio?.date??null)
 const [taskPage,setTaskPage]=useState(0),[agendaPage,setAgendaPage]=useState(0)
 const date=chosen??today,p=period(scope,date)
 const planning=usePlanning({from:civilMidnight(p.start,timeZone).toISOString(),to:civilMidnight(p.end,timeZone).toISOString(),includeCompleted:'true'},7)
 const goals=useGoals(),snapshot=planning.snapshot,habits=useHabitRecords({date:today,from:today,to:today,timeZone})
 useEffect(()=>{if(enPanel)return;const read=()=>{const q=new URLSearchParams(location.search),s=q.get('horizon'),d=q.get('date');if(s==='day'||s==='week'||s==='month')setScope(s);setChosen(d&&isCivilDate(d)?d:null)};read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read)},[enPanel])
 useEffect(()=>{setTaskPage(0);setAgendaPage(0)},[scope,date])
 const go=(s:Horizon,d:string|null)=>{setScope(s);setChosen(d);if(enPanel)onCambio?.(s,d);else history.replaceState(null,'',`/todotask/hoy?${new URLSearchParams({horizon:s,...(d?{date:d}:{})})}`)}
 const own=goals.data?.goals.filter(g=>inPeriod(g,scope,date))??[]
 const tasks=(snapshot?.tasks??[]).filter(t=>{const d=taskDay(t,timeZone);return !t.completed&&d&&d>=p.start&&d<p.end}).sort((a,b)=>(a.due??'').localeCompare(b.due??'')||a.priority-b.priority)
 const events=(snapshot?.events??[]).filter(e=>!e.allDay&&!snapshot?.sources.find(s=>s.id===e.sourceId)?.objective&&e.start.slice(0,10)<p.end&&e.end.slice(0,10)>=p.start).sort((a,b)=>a.start.localeCompare(b.start))
 const isToday=scope==='day'&&date===today
 const upcoming=isToday?events.filter(e=>Date.parse(e.end)>now.getTime()):events
 const next=snapshot&&scope==='day'?(contextualAction(goals.data?.goals??[],snapshot,date)??nextAction(date===today?snapshot:{...snapshot,tasks:snapshot.tasks.filter(t=>taskDay(t,timeZone)===date)},date,timeZone)):null
 // Día en escritorio: la misma lectura que el teléfono, la semana y el mes que cubren
 // el día como contexto arriba (antes el escritorio decía «Sin definir.» y ya).
 const ctxSemana=scope==='day'?focusFor(goals.data?.goals??[],snapshot??null,date,'week'):[],ctxMes=scope==='day'?focusFor(goals.data?.goals??[],snapshot??null,date,'month'):[]
 // La agenda del día es la MISMA de la vista Día en el chat (continuidad chat → sección).
 const eventosDia=useMemo(()=>scope==='day'?(porDia(snapshot??undefined).mapa.get(date)??[]).filter(i=>!i.tarea&&i.inicio!=null):[],[snapshot,scope,date])
 const children=goals.data?.goals.filter(g=>g.scope===(scope==='month'?'week':'day')&&g.start<p.end&&g.end>p.start)??[]
 const fmt=(s:string)=>new Date(s).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone})
 const converse=()=>ask(`Planifiquemos ${periodTitle(scope,date)}. Lee los objetivos vigentes con mc-event.py planning (objectives-read), las tareas y el calendario. Quiero definir o ajustar este período contigo. No des por acordado un borrador; confirma conmigo el resultado antes de registrarlo.`)
 const refresh=()=>{void goals.refresh();void planning.refresh();void habits.refresh()}
 const tp=Math.min(taskPage,Math.max(0,Math.ceil(tasks.length/6)-1)),ap=Math.min(agendaPage,Math.max(0,Math.ceil(upcoming.length/3)-1))
 const rows:string[]=[]
 if(scope!=='day')for(let d=scope==='month'?period('week',p.start).start:p.start;d<p.end;d=shiftDay(d,scope==='month'?7:1))rows.push(d)
 // Teléfono + horizonte día: la misma lectura y las mismas plumas, otra jerarquía.
 if(isMobile&&scope==='day')return <div ref={raiz} className={styles.raiz} data-donde={donde} tabIndex={enPanel?-1:undefined}><HabitKeys habits={habits} today={today} enabled={isToday} acepta={acepta}/><HoyTelefono date={date} today={today} now={now} timeZone={timeZone} goals={goals.data?.goals??[]} goalsLoading={goals.loading} planning={planning} next={next} habits={habits} problem={goals.error??planning.error??(snapshot?.health.some(h=>h.state!=='fresh')?'Algunas fuentes no se actualizaron.':null)} onRefresh={refresh} go={go} converse={converse} ask={ask} sinPestanas={enPanel}/></div>
 return <div ref={raiz} className={styles.raiz} data-donde={donde} tabIndex={enPanel?-1:undefined}><main className={`${base.page} ${styles.page}`}>
  <HabitKeys habits={habits} today={today} enabled={isToday} acepta={acepta}/>
  {/* En el panel, las pestañas de la sección (Hoy, Lista, Hábitos…) sobran: la pestaña ya es Objetivos. */}
  {!enPanel&&<header className={`${base.topbar} ${styles.topbar}`}><TodotaskTabs view="hoy"/><div className={base.spacer}/><button aria-label="Actualizar objetivos" onClick={refresh}><RefreshCw size={14}/></button></header>}
  <div className={styles.periodBar}>
   <nav aria-label="Horizonte del objetivo" className={styles.segment}>{(['day','week','month'] as const).map(s=><button key={s} aria-pressed={scope===s} onClick={()=>go(s,s==='week'&&scope==='day'&&date===today&&new Date(today+'T12:00:00Z').getUTCDay()===0?shiftDay(today,1):date)}>{horizonLabels[s]}</button>)}</nav>
   <div className={styles.navigation}><button aria-label="Período anterior" onClick={()=>go(scope,navigatePeriod(scope,date,-1))}><ChevronLeft size={14}/></button><h1>{periodTitle(scope,date)}</h1><button aria-label="Período siguiente" onClick={()=>go(scope,navigatePeriod(scope,date,1))}><ChevronRight size={14}/></button></div>
   <div className={styles.shortcuts}>{enPanel&&<button aria-label="Actualizar objetivos" title="Actualizar" onClick={refresh}><RefreshCw size={13}/></button>}{date!==today&&<button onClick={()=>go('day',null)}>Hoy</button>}<button onClick={()=>go(scope,scope==='day'?shiftDay(today,1):scope==='week'?shiftDay(period('week',today).start,7):today)}>{scope==='day'?'Mañana':scope==='week'?'Próxima semana':'Mes actual'}</button></div>
  </div>
  <div className={styles.body}>
   {(goals.error||planning.error||snapshot?.health.some(h=>h.state!=='fresh'))&&<div className={styles.error} role="status">{goals.error??planning.error??'Algunas fuentes no se actualizaron.'}<button onClick={refresh}>Reintentar</button></div>}
   {goals.pending&&<div className={styles.error}>Objetivo pendiente de confirmar.<button onClick={()=>void goals.retry().catch(()=>{})} disabled={goals.saving}>Reintentar envío</button></div>}
   {planning.pending&&!planning.saving&&<div className={styles.error}>Tarea pendiente de confirmar.<button onClick={()=>void planning.mutate(planning.pending!).catch(()=>{})}>Reintentar tarea</button></div>}
   <div className={styles.columns}>
    <section className={styles.direction}>
     <div className={styles.heading}><h2>{scope==='month'?'Objetivos del mes':scope==='week'?'Objetivos de la semana':'Objetivo del día'}</h2><button className={styles.converse} onClick={converse}><MessageCircle size={13}/>Conversar</button></div>
     {(ctxSemana.length>0||ctxMes.length>0)&&<div className={styles.contexto} aria-label="Objetivos que cubren el día">{ctxSemana.length>0&&<p><span>{ctxSemana.find(f=>f.label)?.label??'Esta semana'}</span><b>{ctxSemana.map(f=>f.title).join(' · ')}</b>{ctxSemana.some(f=>f.state==='draft')&&<small>Borrador</small>}</p>}{ctxMes.length>0&&<p><span>Mes</span>{ctxMes.map(f=>f.title).join(' · ')}</p>}</div>}
     <div className={styles.goalArea}>
      {!goals.data?<p className={styles.empty}>{goals.loading?'Cargando…':'Plan no disponible.'}</p>:!own.length?<p className={styles.empty}>{scope==='day'?(ctxSemana.length?'Hoy no tiene objetivo propio: manda la semana.':'Sin objetivo para hoy.'):'Sin definir.'}</p>:<ul className={styles.goalBullets} aria-label="Objetivos del período">{own.map(goal=><li key={goal.id} data-state={goal.status}><span className={styles.goalBullet} aria-hidden="true">{goal.status==='completed'?<Check size={12}/>: '•'}</span><span title={goal.success}>{goal.title}</span>{goal.status==='draft'&&<small>Borrador</small>}{goal.status==='completed'&&<small>Cumplido</small>}</li>)}</ul>}
     </div>
     {scope==='day'?<section className={styles.next}><h2>Siguiente acción</h2>{next?.task?<><h3>{next.task.title}</h3><p>{next.reason}</p>{snapshot&&<button disabled={planning.saving||!!planning.pending} onClick={()=>void planning.mutate(mutationFor(next.task!,snapshot.ownerId,{},'complete')).catch(()=>{})}><Check size={13}/>Completar</button>}</>:<><h3>{upcoming[0]?.title??(planning.loading?'Cargando…':'Sin pendientes seleccionados.')}</h3>{upcoming[0]&&<span className={styles.muted}>{fmt(upcoming[0].start)}–{fmt(upcoming[0].end)}</span>}</>}</section>:<section className={styles.breakdown}><div className={styles.heading}><h2>{scope==='month'?'Semanas':'Días'}</h2></div>{rows.map(d=>{const end=shiftDay(d,scope==='month'?7:1),gs=children.filter(g=>g.start===d),ts=tasks.filter(t=>{const td=taskDay(t,timeZone);return td&&td>=d&&td<end});return <button key={d} className={styles.periodRow} onClick={()=>go(scope==='month'?'week':'day',d)}><time>{scope==='month'?`${labelDate(d,{day:'numeric',month:'short'})}–${labelDate(shiftDay(end,-1),{day:'numeric',month:'short'})}`:labelDate(d,{weekday:'short',day:'numeric'})}</time><span title={gs.map(g=>g.title).join(' · ')}>{gs.length?gs.map(g=>g.title).join(' · '):'—'}</span>{ts.length>0&&<small>{ts.length}</small>}<ChevronRight size={12}/></button>})}</section>}
     {isToday&&<ReporteDiario/>}
    </section>
    <aside className={styles.aside}>
     <section className={styles.schedule}><div className={styles.heading}><h2>{scope==='day'?'Agenda':'Pendientes · Todoist'}</h2><Link href={scope==='day'?`/calendar?date=${date}&mode=day`:'/todotask?view=list'}>{scope==='day'?'Calendario':'Lista'} <ArrowUpRight size={12}/></Link></div>
      {scope==='day'?<>{eventosDia.length?<Agenda eventos={eventosDia} dia={date} hoy={today} ahora={now.getTime()}/>:<p className={styles.empty}>{planning.loading?'Cargando…':'Nada agendado.'}</p>}</>:<>{tasks.slice(tp*6,tp*6+6).map(t=><Link key={t.id} className={styles.task} href="/todotask?view=list"><time>{labelDate(taskDay(t,timeZone)!,{day:'numeric',month:'short'})}</time><span title={t.title}>{t.title}</span></Link>)}{!tasks.length&&<p className={styles.empty}>{planning.loading?'Cargando…':snapshot?.health.find(h=>h.id==='todoist')?.state!=='fresh'?'Todoist no se pudo actualizar.':'Sin pendientes con fecha en este período.'}</p>}<Pager page={tp} count={Math.ceil(tasks.length/6)} onChange={setTaskPage}/></>}
     </section>
     {isToday&&<section className={styles.habits} aria-label="Hábitos de hoy"><div className={styles.heading}><h2>Hábitos</h2><Link href="/todotask?view=habits"><ArrowUpRight size={12}/><span className={styles.srOnly}>Ver historial de hábitos</span></Link></div>{!habits.data?<p className={styles.empty}>{habits.loading?'Cargando…':'No disponibles.'}</p>:habits.data.habitos.filter(h=>seMuestra(h.clave)).map(h=>{const state=habits.record(today,h.clave)?.hecho,label=habitDisplayName(h,today);return <button key={h.clave} className={styles.habit} aria-label={`${label}: ${state===true?'Cumplido':state===false?'No cumplido':'Sin registro'}`} aria-pressed={state===true} data-state={state===true?'done':state===false?'missed':'empty'} onClick={()=>habits.toggle(today,h.clave)} title={label}><span className={styles.check}>{state===true?<Check size={10}/>:state===false?'×':<Minus size={8}/>}</span><NombreHabito clave={h.clave} nombre={realHabitName(h,today)} tocable={false}/><kbd>{HABIT_SHORTCUTS[h.clave]}</kbd></button>})}<HabitFeedback habits={habits}/></section>}
    </aside>
   </div>
  </div>
 </main></div>
}
