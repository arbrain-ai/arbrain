'use client'
import { useEffect, useMemo, type RefObject } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import esLocale from '@fullcalendar/core/locales/es'
import { cronDisplayName, projectOccurrences } from '@/features/calendar/utils/cronProjection'
import type { CronSnapshot, CronSchedule } from './types'
import styles from './planning.module.css'

export function CronTimeline({ data, range, onSelect, onRangeChange, calendarRef:calendar }: { data:CronSnapshot|null; range:{from:string;to:string}; onSelect:(job:CronSchedule,runId?:string)=>void; onRangeChange:(range:{from:string;to:string})=>void; calendarRef:RefObject<FullCalendar|null> }) {
  useEffect(()=>{calendar.current?.getApi().gotoDate(range.from)},[range.from])
  const events=useMemo(()=>{
    if(!data)return []
    const from=Date.parse(range.from),to=Date.parse(range.to)
    const runs=data.runs.map(r=>{
      const failed=!!r.error||['error','failed'].includes(r.status)
      const success=['success','completed','ok','done'].includes(r.status)&&!failed
      const end=Date.parse(r.created_at)
      const duration=r.duration_ms&&r.duration_ms>0?r.duration_ms:null
      return {id:`run:${r.id}`,title:`${failed?'✕':success?'✓':'◌'} ${cronDisplayName(r.job_id)}`,
        start:new Date(duration?end-duration:end).toISOString(),end:duration?r.created_at:undefined,
        classNames:[styles.cronTimelineEvent,failed?styles.cronFailed:success?styles.cronSucceeded:styles.cronUnknown],
        extendedProps:{jobId:r.job_id,runId:r.id,label:failed?'Falló':success?'Completado':'Estado no confirmado',timeLabel:duration?'Ejecución medida':'Hora de registro · duración sin dato'}}
    })
    const future=data.jobs.filter(j=>j.status==='active').flatMap(j=>projectOccurrences(j.schedule,from,to,j.next_run,data.timeZone).map(time=>({
      id:`scheduled:${j.id}:${time}`,title:`◷ ${cronDisplayName(j.id)}`,start:new Date(time).toISOString(),
      classNames:[styles.cronTimelineEvent,styles.cronPlanned],extendedProps:{jobId:j.id,label:'Programado, todavía no ejecutado',timeLabel:'Hora prevista'},
    })))
    return [...runs,...future]
  },[data,range.from,range.to])
  return <FullCalendar ref={calendar} plugins={[timeGridPlugin]} locale={esLocale} initialView="timeGridWeek" views={{rollingWeek:{type:'timeGrid',duration:{days:7},dateIncrement:{days:7},dateAlignment:'day'}}} initialDate={range.from}
      headerToolbar={false} dayHeaderContent={arg=><span>{format(arg.date,'EEE',{locale:es})} <strong>{format(arg.date,'d')}</strong></span>} slotLabelFormat={{hour:'2-digit',minute:'2-digit',hour12:false}} height="100%" firstDay={1} allDaySlot={false} nowIndicator slotDuration="00:30:00" scrollTime="00:00:00"
      datesSet={arg=>onRangeChange({from:arg.start.toISOString(),to:arg.end.toISOString()})}
      eventMinHeight={26} scrollTimeReset={false} defaultTimedEventDuration="00:10:00" displayEventTime events={events} editable={false}
      eventClick={arg=>{
        const id=arg.event.extendedProps.jobId
        onSelect(data?.jobs.find(j=>j.id===id)??{id,schedule:'',status:'paused',next_run:null,last_run:null,last_result:null},arg.event.extendedProps.runId)
      }}
      eventDidMount={arg=>{arg.el.title=`${arg.event.title}\n${arg.event.extendedProps.label}\n${arg.event.extendedProps.timeLabel}`;arg.el.setAttribute('aria-label',`${arg.event.title}: ${arg.event.extendedProps.label}`)}}
      eventContent={arg=><div className={`${styles.eventContent} ${styles.eventCompact}`}><div className={styles.eventMeta}><span>{arg.timeText}</span></div><strong>{arg.event.title}</strong></div>}
      noEventsContent="No hay ejecuciones registradas o previstas en este período."/>
}
