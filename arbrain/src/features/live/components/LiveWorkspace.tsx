'use client'
// Live minimalista (4 oct 2026, Daniel: «muy simple, muy minimalista… si quiero ver datos ya los veo
// en el panel que está justo fuera»). Solo: el avatar a lo grande, una línea de subtítulo con lo que
// se está diciendo, el micrófono/entrada abajo y tres caras pequeñas para cambiar de agente
// (Levy fijado, Trinity, Sensei: el mismo cerebro con otro avatar, otra voz y otro enfoque).
// El «espacio compartido» (piezas, gráficas) ya no se pinta aquí: los datos viven en el panel derecho.
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ArrowLeft,ArrowUp,Maximize2,Minimize2,Box,Camera,CameraOff,Pin,Plus,Square,UserRound,X} from 'lucide-react'
import type {LiveChatController} from '../controller'
import {QuestionCards} from '@/features/chat/components/QuestionCard'
import {VoiceInput} from '@/features/chat/components/VoiceInput'
import {Retrato} from '@/shared/components/Retrato'
import {LevyFace} from '@/features/chat/components/LevyFace'
import {Levy3D} from '@/features/chat/components/Levy3D'
import {clipboardImages,localImagePath,readPastedImage} from '@/features/chat/lib/image-paste'
import {esArchivoDeImagen,prepararImagen} from '@/features/chat/lib/image-prepare'
import {ErrorImagen,mensajeFallosSubida,subirImagen,PERFIL_DATOS_MOVILES,PERFIL_NORMAL,type FalloSubida} from '@/features/chat/lib/image-upload'
import {esTelefonoAhora} from '@/shared/hooks/useMediaQuery'
import {BotonPanel} from '@/features/cabina/panel/BotonPanel'
import {useLiveVoice} from '../hooks/useLiveVoice'
import {useLiveCamera} from '../hooks/useLiveCamera'
import {AGENTES,ORDEN_AGENTES,contextoDeAgente,type AgenteId} from '../agents'
import {agenteActivo,fijarAgenteActivo} from '../agent-state'
import styles from './live.module.css'
const labels={idle:'Aquí contigo',listening:'Te escucho',transcribing:'Transcribiendo',thinking:'Trabajando',speaking:'Conversando',error:'Necesita atención'}
const OCUPADO=/trabajo en curso/i
const REINTENTOS=3
const MAX_IMAGENES=10
type Vista='3d'|'2d'
const VISTA_KEY='arbrain.live.vista'
const vistaGuardada=():Vista=>{try{return localStorage.getItem(VISTA_KEY)==='2d'?'2d':'3d'}catch{return '3d'}}
type Pedido={text:string;imagenes?:string[]}
export function LiveWorkspace({controller,onClose}:{controller:LiveChatController|null;onClose:()=>void}){
 const [agente,setAgente]=useState<AgenteId>(agenteActivo),[avatar3d,setAvatar3d]=useState(true),[ready,setReady]=useState(false),[vista,setVista]=useState<Vista>('3d')
 // La elección 2D/3D se recuerda; se lee tras montar para no desajustar la hidratación.
 useEffect(()=>{const v=vistaGuardada();setVista(v);if(v==='2d')setReady(true)},[])
 const cambiarVista=()=>{const v:Vista=vista==='3d'?'2d':'3d';setVista(v);setReady(v==='2d'?true:false);if(v==='3d')setAvatar3d(true);try{localStorage.setItem(VISTA_KEY,v)}catch{}}
 const [dictando,setDictando]=useState(false)
 // Cámara opcional: encendida, cada envío adjunta UN cuadro actual (ver camera/frame.ts); nada se graba.
 const camara=useLiveCamera(),[menuCamara,setMenuCamara]=useState(false)
 const [draft,setDraft]=useState(''),[expanded,setExpanded]=useState(false),[toolStatus,setToolStatus]=useState(''),[error,setError]=useState<string|null>(null)
 const [enFila,setEnFila]=useState<Pedido[]>([])
 // Imágenes pegadas o arrastradas: se preparan igual que en el composer del chat y se suben al enviar.
 const [adjuntos,setAdjuntos]=useState<File[]>([]),[preparando,setPreparando]=useState(0),[subiendo,setSubiendo]=useState(false),[arrastrando,setArrastrando]=useState(false)
 const adjuntosRef=useRef<File[]>([]),previas=useMemo(()=>adjuntos.map(file=>({file,url:URL.createObjectURL(file)})),[adjuntos]);adjuntosRef.current=adjuntos
 useEffect(()=>()=>previas.forEach(p=>URL.revokeObjectURL(p.url)),[previas])
 const root=useRef<HTMLDivElement>(null),entrada=useRef<HTMLInputElement>(null),latest=useRef(controller),agenteRef=useRef(agente),vistaRef=useRef(vista),fila=useRef<Pedido[]>([]),reintentos=useRef(0),ultimoError=useRef('')
 latest.current=controller;agenteRef.current=agente;vistaRef.current=vista;fila.current=enFila
 const info=AGENTES[agente]
 // Con subagentes trabajando en segundo plano el servidor no abre otro turno de Live («todavía tiene
 // trabajo en curso»). Como en el composer del chat, el mensaje entra a una fila y sale solo al terminar.
 const voiceController=useMemo<LiveChatController|null>(()=>controller?{...controller,send:(text:string,opts?:{context?:string;imagenes?:string[]})=>{
  const c=latest.current;if(!c)return
  if(c.backgroundBusy||fila.current.length){setEnFila(f=>[...f,{text,imagenes:opts?.imagenes}]);return}
  c.send(text,{context:contextoDeAgente(agenteRef.current),imagenes:opts?.imagenes})
 }}:null,[controller])
 const voice=useLiveVoice(voiceController,agente),[respaldo,setRespaldo]=useState(false)
 const ackRef=useRef<(turnId:string,text:string)=>void>(()=>{});ackRef.current=voice.speakAck
 const scope=JSON.stringify([controller?.owner,controller?.account,controller?.sessionId])
 useEffect(()=>{setToolStatus('');setEnFila([]);reintentos.current=0},[scope])
 useEffect(()=>{
  const listener=(event:Event)=>{
   const detail=(event as CustomEvent).detail,c=latest.current
   if(!c||detail.owner!==c.owner||detail.account!==c.account||detail.sessionId!==c.sessionId)return
   if(detail.event.type==='live_status')setToolStatus(detail.event.text)
   if(detail.event.type==='live_ack')ackRef.current(String(detail.turnId??''),String(detail.event.text??''))
  }
  window.addEventListener('arbrain:live',listener);return()=>window.removeEventListener('arbrain:live',listener)
 },[])
 useEffect(()=>{if(!controller?.loading)setToolStatus('')},[controller?.loading])
 // La voz principal cayó al respaldo (cabecera X-Voice-Fallback): se avisa discreto, sin error.
 useEffect(()=>{const t=setInterval(()=>setRespaldo(!!voice.player.current?.timings.some(x=>x.fallback)),600);return()=>clearInterval(t)},[voice.player])
 const last=controller?.messages.at(-1)
 const questions=(controller?.messages.filter(m=>m.role==='assistant').at(-1)?.questionPrompts??[]).filter(q=>q.status==='pending')
 // Error de «trabajo en curso» que llegó igual (estado viejo del cliente): no se muestra, se vuelve a formar.
 const bloqueado=!!last&&last.role==='assistant'&&!!last.error&&OCUPADO.test(`${last.content} ${last.diagnostic??''}`)
 useEffect(()=>{
  if(!bloqueado||!controller||!last||ultimoError.current===last.id)return
  ultimoError.current=last.id
  const pedido=[...controller.messages].reverse().find(m=>m.role==='user')?.content
  if(pedido&&reintentos.current<REINTENTOS){reintentos.current++;setEnFila(f=>f.length?f:[{text:pedido}])}
 },[bloqueado,controller,last])
 useEffect(()=>{
  if(!enFila.length||!controller||controller.loading||controller.backgroundBusy||questions.length)return
  const wait=setTimeout(()=>{
   const c=latest.current;if(!c||c.loading||c.backgroundBusy)return
   const lote=fila.current,imagenes=lote.flatMap(p=>p.imagenes??[]);setEnFila([]);c.send(lote.map(p=>p.text).filter(Boolean).join('\n\n'),{context:contextoDeAgente(agenteRef.current),imagenes:imagenes.length?imagenes:undefined})
  },bloqueado||reintentos.current?8000:400)
  return()=>clearTimeout(wait)
 },[enFila,controller,controller?.loading,controller?.backgroundBusy,questions.length,bloqueado])
 const choose=useCallback((id:AgenteId)=>{if(id===agenteRef.current)return;setReady(vistaRef.current==='2d');setAvatar3d(true);setAgente(id);fijarAgenteActivo(id)},[])
 const adjuntar=useCallback((files:File[])=>{
  if(!files.length)return
  setPreparando(n=>n+files.length);setError(null)
  for(const file of files){
   void (async()=>{
    try{
     if(!esArchivoDeImagen(file))throw new ErrorImagen('formato',`«${file.name||'archivo'}» no es una imagen que pueda adjuntar (PNG, JPG, WebP, GIF, HEIC).`)
     if(adjuntosRef.current.length>=MAX_IMAGENES)throw new ErrorImagen('demasiado-grande',`Máximo ${MAX_IMAGENES} imágenes por mensaje.`)
     const lista=await prepararImagen(file, esTelefonoAhora() ? PERFIL_DATOS_MOVILES : PERFIL_NORMAL)
     setAdjuntos(a=>a.length>=MAX_IMAGENES?a:[...a,lista])
    }catch(e){setError(e instanceof ErrorImagen?e.message:`No pude preparar «${file.name||'la imagen'}»: ${e instanceof Error?e.message:'error desconocido'}.`)}
    finally{setPreparando(n=>Math.max(0,n-1))}
   })()
  }
 },[])
 const pegar=(e:React.ClipboardEvent<HTMLInputElement>)=>{
  const imagenes=clipboardImages(e.clipboardData)
  if(imagenes.length){e.preventDefault();adjuntar(imagenes);return}
  const ruta=localImagePath(e.clipboardData.getData('text/plain'))
  if(ruta){e.preventDefault();void readPastedImage(ruta).then(f=>adjuntar([f])).catch(err=>setError(String(err?.message??err)))}
 }
 const soltar=(e:React.DragEvent)=>{
  setArrastrando(false)
  const files=Array.from(e.dataTransfer.files??[]).filter(f=>f.type.startsWith('image/')||esArchivoDeImagen(f))
  if(!files.length)return
  e.preventDefault();adjuntar(files)
 }
 const hayImagenes=(e:React.DragEvent)=>Array.from(e.dataTransfer.types??[]).includes('Files')
 const dictado=useCallback((texto:string)=>{if(!texto.trim())return;setError(null);setDraft(d=>d.trim()?`${d.trim()} ${texto}`:texto);requestAnimationFrame(()=>entrada.current?.focus())},[])
 const canSubmit=!!controller&&!subiendo&&preparando===0&&(!!draft.trim()||adjuntos.length>0)&&!(controller.loading&&!questions.length)
 const submit=async()=>{
  const text=draft.trim();if(!canSubmit)return
  const files=adjuntos
  let imagenes:string[]|undefined
  if(files.length){
   setSubiendo(true);setError(null)
   const urls:string[]=[],fallos:FalloSubida[]=[]
   try{for(const f of files){const r=await subirImagen(f);if(r.ok)urls.push(r.url);else fallos.push(r.fallo)}}finally{setSubiendo(false)}
   // Nunca se manda un set incompleto: las imágenes y el texto se quedan para reintentar.
   if(fallos.length){setError(mensajeFallosSubida(fallos,files.length,urls.length));return}
   imagenes=urls
  }
  // Con la cámara encendida, UN cuadro reciente viaja como imagen de este turno. Si falla, el mensaje sale igual.
  if(camara.encendida){
   const cuadro=await camara.capturar()
   if(cuadro){const r=await subirImagen(cuadro);if(r.ok)imagenes=[...(imagenes??[]),r.url];else setError('No pude adjuntar tu cuadro de cámara; el mensaje salió sin él.')}
   else setError('La cámara aún no tiene imagen; el mensaje salió sin tu cuadro.')
  }
  setDraft('');setAdjuntos([])
  void voice.send(text,imagenes).catch(e=>setError(String(e)))
 }
 const toggleFull=async()=>{
  if(!document.fullscreenElement){try{await root.current?.requestFullscreen();setExpanded(true)}catch{setExpanded(v=>!v)}}
  else{await document.exitFullscreen();setExpanded(false)}
 }
 useEffect(()=>{const change=()=>setExpanded(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
 const status=voice.state==='idle'&&controller?.loading?'thinking':voice.state
 const subtitle=enFila.length||bloqueado?'En fila · sale cuando Levy termine':voice.position?.text||voice.questionText||voice.spokenCaption||voice.transcript||''
 const presence=(toolStatus||(status==='idle'?'Toca el micrófono para dictar · revisa y da Enter':labels[status]))+(respaldo?' · voz de respaldo':'')
 const mensajeError=voice.error||error
 return <div ref={root} className={`${styles.root} ${expanded?styles.expanded:''}`} onDragOver={e=>{if(hayImagenes(e)){e.preventDefault();setArrastrando(true)}}} onDragLeave={e=>{if(e.currentTarget===e.target)setArrastrando(false)}} onDrop={soltar} data-live-workspace data-live-state={status} data-live-agent={agente} data-live-ready={ready}>
  <div className={styles.stage}>
   <img className={styles.poster} src={info.retrato} alt="" aria-hidden draggable={false}/>
   {avatar3d&&vista==='3d'?<Levy3D key={agente} fill voiceRef={voice.player} status={status} model={info.modelo} look={info.look} label={`${info.nombre} en 3D`} onReady={()=>setReady(true)} onFail={()=>setAvatar3d(false)} className={styles.avatar}/>:<LevyFace key={agente} agent={agente} framing="camera" voiceRef={voice.player} status={status==='transcribing'?'thinking':status==='idle'&&(dictando||draft.trim())?'listening':status} className={styles.fallback}/>}
  </div>
  <div className={styles.topLeft}><button onClick={()=>{voice.stop();onClose()}} aria-label="Volver al chat" title="Volver al chat"><ArrowLeft size={18}/></button></div>
  <video ref={camara.video} className={`${styles.preview} ${camara.encendida&&camara.lista?styles.previewOn:''}`} muted playsInline aria-hidden data-live-camera-preview/>
  <nav className={styles.agents} aria-label="Agente">
   {ORDEN_AGENTES.map(id=>{const a=AGENTES[id];return <button key={id} onClick={()=>choose(id)} className={id===agente?styles.agentOn:''} aria-pressed={id===agente} aria-label={`${a.nombre}: ${a.rol}`} title={`${a.nombre} · ${a.rol}`}><Retrato agente={id} size={38}/>{id==='levy'&&<Pin size={9} className={styles.pin} aria-hidden/>}</button>})}
   <span className={styles.agentName}>{info.nombre}</span>
  </nav>
  <div className={styles.topRight}>
   <BotonPanel/>
   <span className={styles.camWrap}>
    <button onClick={camara.alternar} disabled={!camara.soportada} className={camara.encendida?styles.camOn:''} aria-label={camara.encendida?'Apagar cámara':'Encender cámara'} aria-pressed={camara.encendida} title={camara.encendida?`Cámara encendida · ${info.nombre} te ve al enviar`:'Cámara apagada · toca para que Levy te vea'} data-live-camera-toggle>{camara.encendida?<Camera size={17}/>:<CameraOff size={17}/>}</button>
    {camara.encendida&&camara.dispositivos.length>1&&<button onClick={()=>setMenuCamara(m=>!m)} className={styles.camPick} aria-label="Elegir cámara" aria-expanded={menuCamara} title="Elegir cámara">▾</button>}
    {menuCamara&&camara.encendida&&<ul className={styles.camMenu} role="listbox" aria-label="Cámaras">{camara.dispositivos.map(d=><li key={d.deviceId}><button role="option" aria-selected={d.deviceId===camara.dispositivo} className={d.deviceId===camara.dispositivo?styles.camSel:''} onClick={()=>{camara.elegir(d.deviceId);setMenuCamara(false)}}>{d.label}</button></li>)}</ul>}
   </span>
   <button onClick={cambiarVista} aria-label={vista==='3d'?'Cambiar a vista 2D':'Cambiar a vista 3D'} aria-pressed={vista==='2d'} title={vista==='3d'?'Vista 3D · toca para 2D':'Vista 2D · toca para 3D'}>{vista==='3d'?<UserRound size={17}/>:<Box size={17}/>}</button>
   <button aria-label="Nueva conversación" title="Nueva conversación" onClick={()=>{voice.stop();controller?.newChat()}}><Plus size={18}/></button>
   <button onClick={toggleFull} aria-label="Pantalla completa" title="Pantalla completa">{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
  </div>
  <div className={styles.bottom}>
   {questions.length>0&&controller&&<div className={styles.questions}><QuestionCards prompts={questions} onAnswer={controller.answerQuestion}/></div>}
   {mensajeError&&<div className={styles.voiceError} role="status">{mensajeError}</div>}
   {camara.encendida&&<p className={styles.seen} role="status" data-live-camera-badge><span className={styles.rec}/>{info.nombre} te ve</p>}
   {camara.error&&<div className={styles.voiceError} role="status">{camara.error}</div>}
   <p className={styles.presence}><span className={styles.dot}/>{presence}</p>
   <p className={styles.subtitle} aria-live="polite" data-live-subtitle>{subtitle}</p>
   {(previas.length>0||preparando>0||subiendo)&&<div className={styles.tray}>
    {previas.map((p,i)=><span key={p.url} className={styles.thumb}><img src={p.url} alt={p.file.name||'Imagen adjunta'} draggable={false}/><button onClick={()=>setAdjuntos(a=>a.filter((_,j)=>j!==i))} aria-label="Quitar imagen"><X size={11}/></button></span>)}
    {(preparando>0||subiendo)&&<span role="status" className={styles.trayNote}>{subiendo?'Subiendo imágenes…':'Preparando imagen…'}</span>}
   </div>}
   <div className={`${styles.composer} ${arrastrando?styles.dropping:''}`} onDragOver={e=>{if(hayImagenes(e)){e.preventDefault();setArrastrando(true)}}} onDragLeave={()=>setArrastrando(false)} onDrop={soltar}>
    <VoiceInput soloTexto disabled={!controller} etiqueta={`Dictar a ${info.nombre}`} onVoiceNote={dictado} onEstado={e=>setDictando(e==='recording'||e==='processing')}/>
    <input ref={entrada} value={draft} onChange={e=>setDraft(e.target.value)} onPaste={pegar} onKeyDown={e=>{if(e.key==='Enter')void submit()}} placeholder={adjuntos.length?'Agrega un mensaje o envía…':`Escríbele a ${info.nombre}…`} aria-label={`Mensaje para ${info.nombre}`}/>
    {(controller?.loading||voice.state==='speaking')&&<button onClick={voice.interrupt} aria-label="Interrumpir"><Square size={16}/></button>}
    {(draft.trim()||adjuntos.length>0)&&<button onClick={()=>void submit()} disabled={!canSubmit} aria-label="Enviar"><ArrowUp size={18}/></button>}
   </div>
  </div>
 </div>
}
