'use client'
import { useState } from 'react'
import { Check, Copy, Quote } from 'lucide-react'
import { AudioButton } from './AudioButton'
import styles from './consejo.module.css'

export function ConsejoMessageActions({messageId,name,text,onError,onReference,referenced}:{messageId:string;name:string;text:string;onError:(message:string)=>void;onReference?:()=>void;referenced?:boolean}) {
  const [copied,setCopied]=useState(false)
  return <div className={styles.messageActions}>
    <button type="button" aria-label={`Copiar respuesta de ${name}`} title={copied?'Copiado':`Copiar respuesta de ${name}`} onClick={async()=>{
      try { await navigator.clipboard.writeText(text); setCopied(true) }
      catch { onError('No se pudo copiar. Selecciona el texto para copiarlo manualmente.') }
    }} onBlur={()=>setCopied(false)}>{copied?<Check size={16}/>:<Copy size={16}/>}</button>
    <AudioButton messageId={messageId} label={name} selectionEnabled/>
    {onReference&&<button type="button" aria-label={`Usar respuesta de ${name} en el siguiente mensaje`} aria-pressed={!!referenced} title="Usar como referencia" onClick={onReference}><Quote size={16}/></button>}
    <span role="status" className={styles.srOnly}>{copied?'Respuesta copiada':''}</span>
  </div>
}
