import { isCivilDate, shiftDay, civilToday } from '@/features/sistema/calendar-days'
import type { PlanningSnapshot, PlanTask } from '@/features/planning/types'
export type Horizon='day'|'week'|'month'
export type GoalStatus='draft'|'agreed'|'completed'
export interface Goal {id:string;scope:Horizon;start:string;end:string;title:string;success:string;notes:string;status:GoalStatus;parentId:string|null;taskIds:string[];eventIds:string[];completionNote:string;updatedAt?:string}
export interface GoalSnapshot {ownerId:string;goals:Goal[];revision:string;context:{scope:Horizon;start:string;text:string}[];source:string;loadedAt:string}
export const statusLabels:Record<GoalStatus,string>={draft:'En planificación',agreed:'Acordado',completed:'Cumplido'}
export const horizonLabels:Record<Horizon,string>={day:'Hoy',week:'Semana',month:'Mes'}
export function period(scope:Horizon,anchor:string) {
 if(!isCivilDate(anchor))throw new Error('Fecha inválida')
 const d=new Date(anchor+'T12:00:00Z');let start=anchor,end=shiftDay(anchor,1)
 if(scope==='week'){start=shiftDay(anchor,-((d.getUTCDay()+6)%7));end=shiftDay(start,7)}
 if(scope==='month'){start=anchor.slice(0,8)+'01';const n=new Date(start+'T12:00:00Z');n.setUTCMonth(n.getUTCMonth()+1);end=n.toISOString().slice(0,10)}
 return {start,end}
}
export function navigatePeriod(scope:Horizon,anchor:string,delta:number){const p=period(scope,anchor);if(scope==='day')return shiftDay(anchor,delta);if(scope==='week')return shiftDay(anchor,7*delta);return delta>0?p.end:period('month',shiftDay(p.start,-1)).start}
export function labelDate(day:string,options:Intl.DateTimeFormatOptions={day:'numeric',month:'long'}){return new Date(day+'T12:00:00Z').toLocaleDateString('es-MX',{...options,timeZone:'UTC'})}
export function periodTitle(scope:Horizon,date:string){const p=period(scope,date);return scope==='month'?labelDate(p.start,{month:'long',year:'numeric'}):scope==='week'?`${labelDate(p.start,{day:'numeric'})}–${labelDate(shiftDay(p.end,-1),{day:'numeric',month:'long',year:'numeric'})}`:labelDate(date,{weekday:'long',day:'numeric',month:'long'})}
export function inPeriod(g:Goal,scope:Horizon,anchor:string){const p=period(scope,anchor);return g.scope===scope&&g.start===p.start}
export function taskDay(t:PlanTask,tz:string){return !t.due?null:t.due.includes('T')&&/(Z|[+-]\d\d:\d\d)$/.test(t.due)?civilToday(tz,new Date(t.due)):t.due.slice(0,10)}
export function taskEvidence(goal:Goal,snapshot:PlanningSnapshot|null){const tasks=[...(snapshot?.tasks??[]),...(snapshot?.completedTasks??[])];const linked=goal.taskIds.map(id=>tasks.find(t=>t.id===id));return {total:goal.taskIds.length,found:linked.filter(Boolean) as PlanTask[],unknown:linked.filter(t=>!t).length,completed:linked.filter(t=>t?.completed).length}}
export function contextualAction(goals:Goal[],snapshot:PlanningSnapshot,day:string){
 const activeGoals=goals.filter(g=>g.status==='agreed'&&g.start<=day&&g.end>day).sort((a,b)=>['day','week','month'].indexOf(a.scope)-['day','week','month'].indexOf(b.scope))
 for(const goal of activeGoals){const task=snapshot.tasks.filter(t=>!t.completed&&goal.taskIds.includes(t.id)).sort((a,b)=>a.priority-b.priority)[0];if(task)return {task,reason:`Contribuye a «${goal.title}».`}}
 return null
}
