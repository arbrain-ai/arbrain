'use client'
import {useEffect,useRef,useState} from 'react'
import {X,Link2} from 'lucide-react'
import type {PlanningSnapshot} from '@/features/planning/types'
import {type Goal,type GoalSnapshot,statusLabels,periodTitle} from './model'
import styles from './goals.module.css'
export function GoalEditor({goal,data,snapshot,saving,pending,error,onSave,onRetry,onRefresh,onClose}:{goal:Goal;data:GoalSnapshot;snapshot:PlanningSnapshot|null;saving:boolean;pending:boolean;error:string|null;onSave:(g:Goal)=>Promise<unknown>;onRetry:()=>Promise<unknown>;onRefresh:()=>Promise<unknown>;onClose:()=>void}){
 const key=`arbrain:goal-draft:${data.ownerId}:${data.goals.some(g=>g.id===goal.id)?goal.id:goal.scope+':'+goal.start+':new'}`,dialog=useRef<HTMLDivElement>(null)
 const [draft,setDraft]=useState<Goal>(()=>{try{const s=localStorage.getItem(key);return s?{...goal,...JSON.parse(s),id:goal.id,scope:goal.scope,start:goal.start,end:goal.end}:goal}catch{return goal}})
 const [localError,setLocalError]=useState<string|null>(null)
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(draft))}catch{}},[draft,key])
 useEffect(()=>{const prev=document.activeElement as HTMLElement;dialog.current?.querySelector<HTMLInputElement>('input')?.focus();const handle=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!saving)onClose();if(e.key==='Tab'){const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,summary')??[])].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',handle);return()=>{document.removeEventListener('keydown',handle);prev?.focus()}},[onClose,saving])
 const set=(p:Partial<Goal>)=>setDraft(d=>({...d,...p}))
 const parents=data.goals.filter(g=>g.scope===({day:'week',week:'month'} as Record<string,string>)[draft.scope]&&g.start<draft.end&&draft.start<g.end)
 const tasks=[...(snapshot?.tasks??[]),...(snapshot?.completedTasks??[])].filter((t,i,a)=>a.findIndex(v=>v.id===t.id)===i)
 const events=(snapshot?.events??[]).filter(e=>!snapshot?.sources.find(s=>s.id===e.sourceId)?.objective&&e.start.slice(0,10)<draft.end&&e.end.slice(0,10)>=draft.start)
 const toggle=(field:'taskIds'|'eventIds',id:string)=>setDraft(g=>({...g,[field]:g[field].includes(id)?g[field].filter(v=>v!==id):[...g[field],id]}))
 const submit=async(status:Goal['status'])=>{setLocalError(null);try{await onSave({...draft,status});localStorage.removeItem(key);onClose()}catch(e){setLocalError(e instanceof Error?e.message:'No se pudo guardar.')}}
 return <div className={styles.backdrop}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="goal-editor-title" className={styles.editor}>
  <header><div><span className={styles.eyebrow}>{periodTitle(goal.scope,goal.start)}</span><h2 id="goal-editor-title">{data.goals.some(g=>g.id===goal.id)?'Editar objetivo':'Definir objetivo'}</h2></div><button aria-label="Cerrar objetivo" onClick={onClose} disabled={saving}><X size={19}/></button></header>
  <div className={styles.editorBody}>
   <label>¿Qué quieres conseguir?<input maxLength={500} value={draft.title} onChange={e=>set({title:e.target.value})} placeholder="Un resultado concreto"/></label>
   <label>¿Cómo sabrás que está cumplido?<textarea rows={3} maxLength={4000} value={draft.success} onChange={e=>set({success:e.target.value})} placeholder="La evidencia que comprobarás al cerrar este período"/></label>
   {draft.scope!=='month'&&<label>Contribuye a<select value={draft.parentId??''} onChange={e=>set({parentId:e.target.value||null})}><option value="">Sin vincular todavía</option>{parents.map(p=><option key={p.id} value={p.id}>{p.title} · {statusLabels[p.status]}</option>)}</select></label>}
   <label>Contexto y límites<textarea rows={2} value={draft.notes} maxLength={8000} onChange={e=>set({notes:e.target.value})} placeholder="Lo que debemos tener presente"/></label>
   <details className={styles.linkPicker}><summary><Link2 size={14}/>Tareas y bloques vinculados <span>{draft.taskIds.length+draft.eventIds.length}</span></summary>
    <p>Vincular explica para qué sirve el trabajo. No cambia fechas ni completa tareas.</p>
    <h3>Tareas existentes</h3>{tasks.map(t=><label key={t.id}><input type="checkbox" checked={draft.taskIds.includes(t.id)} onChange={()=>toggle('taskIds',t.id)}/><span>{t.title}<small>{t.completed?'Completada':t.due?.slice(0,10)??'Sin fecha'}</small></span></label>)}
    {!tasks.length&&<p>No hay tareas disponibles en esta lectura.</p>}
    <h3>Bloques del período</h3>{events.map(e=><label key={e.id}><input type="checkbox" checked={draft.eventIds.includes(e.id)} onChange={()=>toggle('eventIds',e.id)}/><span>{e.title}<small>{e.start.slice(0,16).replace('T',' · ')}</small></span></label>)}
   </details>
   {draft.status!=='draft'&&<label>Evidencia de cumplimiento<textarea rows={2} value={draft.completionNote} onChange={e=>set({completionNote:e.target.value})} placeholder="Resultado observado o enlace a la entrega"/></label>}
   {(localError||error)&&<div className={styles.error} role="alert">{localError||error}<button onClick={()=>void onRefresh()}>Recargar plan conservando borrador</button></div>}
   {pending&&<button onClick={()=>void onRetry().then(()=>{localStorage.removeItem(key);onClose()}).catch(()=>{})} disabled={saving}>Reintentar el mismo envío</button>}
  </div>
  <footer><span>{saving?'Guardando…':'Se guarda en tu plan; no agenda trabajo automáticamente.'}</span><div><button disabled={saving||pending||!draft.title.trim()} onClick={()=>void submit('draft')}>Guardar borrador</button>{draft.status==='draft'?<button className={styles.primary} disabled={saving||pending||!draft.title.trim()||!draft.success.trim()} onClick={()=>void submit('agreed')}>Acordar objetivo</button>:<><button className={styles.primary} disabled={saving||pending||!draft.success.trim()} onClick={()=>void submit(draft.status)}>Guardar cambios</button>{draft.status==='agreed'&&<button disabled={saving||pending||!draft.completionNote.trim()} onClick={()=>void submit('completed')}>Marcar cumplido</button>}{draft.status==='completed'&&<button disabled={saving||pending} onClick={()=>void submit('agreed')}>Reabrir objetivo</button>}</>}</div></footer>
 </div></div>
}
