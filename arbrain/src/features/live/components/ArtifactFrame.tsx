'use client'
import { useEffect, useMemo, useRef } from 'react'
import type { Artifact } from '../scene/model'
import { artifactDocument } from '../scene/document'
export type RenderReceipt={id:string;type:'rendered'|'error'|'selected';detail:Record<string,unknown>}
export function ArtifactFrame({artifact,onReceipt}:{artifact:Artifact;onReceipt:(receipt:RenderReceipt)=>void}){
  const ref=useRef<HTMLIFrameElement>(null)
  const callback=useRef(onReceipt);useEffect(()=>{callback.current=onReceipt},[onReceipt])
  const contentKey=JSON.stringify([artifact.id,artifact.html,artifact.css,artifact.program,artifact.data])
  const token=useMemo(()=>crypto.randomUUID(),[contentKey])
  // Moving/selecting a piece must not reset its interaction state. A new document
  // gets a new token, so delayed receipts from its predecessor are ignored.
  const document=useMemo(()=>artifactDocument(artifact,token),[token])
  useEffect(()=>{ref.current?.contentWindow?.postMessage({channel:'arbrain-artifact-state',token,state:artifact.state??null},'*')},[artifact.state,token])
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.source!==ref.current?.contentWindow)return
      const message=event.data
      if(!message||message.channel!=='arbrain-artifact'||message.token!==token||message.id!==artifact.id||!['rendered','error','selected'].includes(message.type))return
      callback.current({id:artifact.id,type:message.type,detail:message.detail??{}})
    }
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)
  },[artifact.id,token])
  return <iframe ref={ref} title={artifact.title} srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'" className="h-full w-full border-0" />
}
