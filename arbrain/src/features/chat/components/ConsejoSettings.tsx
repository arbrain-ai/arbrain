'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import styles from './consejo.module.css'
import { DEFAULT_CONSEJO_MODELS, exactModelLabel, type ConsejoModels } from '../lib/consejo-models'

type Provider='claude'|'openai'
export type ModelSettings=ConsejoModels
type Catalog=Record<Provider,{account:string;models:Array<{model:string;label:string;efforts:string[];defaultEffort?:string}>}> & {synthesisSupported?:boolean}
const effortLabel:Record<string,string>={none:'Sin razonamiento',minimal:'Mínimo',low:'Bajo',medium:'Medio',high:'Alto',xhigh:'Muy alto',max:'Máximo',ultra:'Ultra'}

export function ConsejoSettings({value,loadCatalog,onSave,onClose}:{value?:ModelSettings;loadCatalog:()=>Promise<Catalog>;onSave:(value:ModelSettings)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const loader=useRef(loadCatalog)
  const [catalog,setCatalog]=useState<Catalog>()
  const [draft,setDraft]=useState<ModelSettings>(value ?? DEFAULT_CONSEJO_MODELS)
  const [error,setError]=useState('')
  const [attempt,setAttempt]=useState(0)
  const synthesis = draft.synthesis ?? {provider:'claude' as const,...draft.claude}
  const synthesisModel = catalog?.[synthesis.provider].models.find(m=>m.model===synthesis.model)
  useEffect(()=>{dialog.current?.showModal()},[])
  useEffect(()=>{
    let alive=true; setError(''); setCatalog(undefined)
    void loader.current().then(data=>{if(alive)setCatalog(data)}).catch(e=>{if(alive)setError(e.message)})
    return ()=>{alive=false}
  },[attempt])
  const valid=catalog?.synthesisSupported && synthesisModel && (!synthesis.effort || synthesisModel.efforts.includes(synthesis.effort)) && (['claude','openai'] as const).every(p=>{
    const m=catalog[p].models.find(m=>m.model===draft[p]?.model)
    return m && (!draft[p].effort || m.efforts.includes(draft[p].effort!))
  })
  return <dialog ref={dialog} data-scroll-region className={styles.settingsDialog} aria-labelledby="consejo-settings-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={styles.settingsContent}>
      <header><h2 id="consejo-settings-title">Modelos y esfuerzo</h2><button type="button" aria-label="Cerrar ajustes" onClick={onClose}><X size={20}/></button></header>
      <p>Dos perspectivas y una respuesta integrada por Levy. Estos ajustes se guardan para los próximos mensajes.</p>
      {!catalog && !error && <p role="status">Consultando tus cuentas…</p>}
      {catalog && !catalog.synthesisSupported && <p role="status">El servidor se está actualizando. Vuelve a abrir los ajustes en unos minutos para elegir quién sintetiza.</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>Reintentar consulta</button></div>}
      {catalog && (['claude','openai'] as const).map(p=>{
        const model=catalog[p].models.find(m=>m.model===draft[p]?.model)
        return <fieldset key={p}><legend>{p==='claude'?'Claude · perspectiva':'OpenAI · perspectiva'}</legend>
          <p className={styles.settingsAccount}>{catalog[p].account}</p>
          <label>Modelo<select aria-label={`Modelo ${p==='claude'?'Claude':'OpenAI'}`} value={draft[p]?.model ?? ''} onChange={e=>setDraft(old=>({...old,[p]:{model:e.target.value}}))}>
            {!model && <option value={draft[p]?.model ?? ''}>Elige un modelo disponible</option>}
            {catalog[p].models.map(m=><option key={m.model} value={m.model}>{exactModelLabel(m.model,m.label)}</option>)}
          </select></label>
          <label>Esfuerzo<select aria-label={`Esfuerzo ${p==='claude'?'Claude':'OpenAI'}`} disabled={!model?.efforts.length} value={draft[p]?.effort ?? ''} onChange={e=>setDraft(old=>({...old,[p]:{model:old[p].model,...(e.target.value?{effort:e.target.value}:{})}}))}>
            <option value="">Automático{model?.defaultEffort?` (${effortLabel[model.defaultEffort] ?? model.defaultEffort})`:''}</option>
            {draft[p]?.effort && !model?.efforts.includes(draft[p].effort!) && <option value={draft[p].effort}>No disponible · elige otro esfuerzo</option>}
            {model?.efforts.map(e=><option key={e} value={e}>{effortLabel[e] ?? e}</option>)}
          </select></label>
        </fieldset>
      })}
      {catalog?.synthesisSupported && <fieldset><legend>Levy · síntesis</legend>
        <p className={styles.settingsAccount}>Integra ambas perspectivas en una llamada separada.</p>
        <label>Modelo<select aria-label="Modelo de Levy" value={`${synthesis.provider}|${synthesis.model}`} onChange={e=>{
          const [provider,model]=e.target.value.split('|') as [Provider,string]
          const supported=catalog[provider].models.find(m=>m.model===model)
          const effort=draft[provider].effort
          setDraft(old=>({...old,synthesis:{provider,model,...(effort&&supported?.efforts.includes(effort)?{effort}:{})}}))
        }}>
          {!synthesisModel&&<option value={`${synthesis.provider}|${synthesis.model}`}>Elige un modelo disponible</option>}
          {(['claude','openai'] as const).map(p=><optgroup key={p} label={p==='claude'?'Claude':'OpenAI'}>{catalog[p].models.map(m=><option key={m.model} value={`${p}|${m.model}`}>{p==='claude'?'Claude':'OpenAI'} · {exactModelLabel(m.model,m.label)}</option>)}</optgroup>)}
        </select></label>
        <label>Esfuerzo<select aria-label="Esfuerzo de Levy" disabled={!synthesisModel?.efforts.length} value={synthesis.effort??''} onChange={e=>setDraft(old=>({...old,synthesis:{provider:synthesis.provider,model:synthesis.model,...(e.target.value?{effort:e.target.value}:{})}}))}>
          <option value="">Automático{synthesisModel?.defaultEffort?` (${effortLabel[synthesisModel.defaultEffort]??synthesisModel.defaultEffort})`:''}</option>
          {synthesis.effort&&!synthesisModel?.efforts.includes(synthesis.effort)&&<option value={synthesis.effort}>No disponible · elige otro esfuerzo</option>}
          {synthesisModel?.efforts.map(e=><option key={e} value={e}>{effortLabel[e]??e}</option>)}
        </select></label>
      </fieldset>}
      <button className={styles.saveSettings} type="button" disabled={!valid} onClick={()=>onSave({...draft,synthesis})}>Guardar ajustes</button>
    </div>
  </dialog>
}
