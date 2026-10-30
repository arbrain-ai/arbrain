'use client'
// Cámara opcional de Live (5 oct 2026, Daniel: «cableado para conectar la cámara… para que puedas verme»).
// Apagada por defecto. Encendida mantiene el stream abierto (para la vista previa y el indicador), pero NO
// graba ni guarda nada: `capturar()` saca UN cuadro solo al enviar, y ese JPEG viaja como adjunto del turno.
import {useCallback,useEffect,useRef,useState} from 'react'
import {CALIDAD_CUADRO,CAMARA_DISP_KEY,CAMARA_ON_KEY,dimensionesCuadro,elegirDispositivo,leerPreferencia,mensajeErrorCamara,type Dispositivo} from '../camera/frame'

export function useLiveCamera(){
 const [encendida,setEncendida]=useState(false),[dispositivos,setDispositivos]=useState<Dispositivo[]>([]),[dispositivo,setDispositivo]=useState<string|null>(null)
 const [error,setError]=useState<string|null>(null),[lista,setLista]=useState(false)
 const video=useRef<HTMLVideoElement|null>(null),stream=useRef<MediaStream|null>(null),guardado=useRef<string|null>(null)
 const soportada=typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia

 const apagarStream=useCallback(()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setLista(false)},[])
 const enumerar=useCallback(async()=>{
  const todos=await navigator.mediaDevices.enumerateDevices()
  const l=todos.filter(d=>d.kind==='videoinput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`Cámara ${i+1}`}))
  setDispositivos(l);return l
 },[])
 const abrir=useCallback(async(id:string|null)=>{
  apagarStream();setError(null)
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:false,video:id?{deviceId:{exact:id},width:{ideal:1280},height:{ideal:720}}:{width:{ideal:1280},height:{ideal:720}}})
   stream.current=s
   // Con el permiso concedido los nombres de dispositivo ya vienen completos: se reelige con ellos.
   const l=await enumerar(),usado=s.getVideoTracks()[0]?.getSettings().deviceId??id
   const elegido=id??elegirDispositivo(l,guardado.current)
   if(!id&&elegido&&elegido!==usado){return abrir(elegido)}
   setDispositivo(elegido??usado??null)
   if(video.current){video.current.srcObject=s;void video.current.play().catch(()=>{})}
   setLista(true)
  }catch(e){setError(mensajeErrorCamara(e));setEncendida(false);try{localStorage.setItem(CAMARA_ON_KEY,'0')}catch{}}
 },[apagarStream,enumerar])

 // La elección guardada se lee tras montar (no desajusta la hidratación). Apagada por defecto.
 useEffect(()=>{
  const p=leerPreferencia(typeof localStorage==='undefined'?null:localStorage);guardado.current=p.dispositivo
  if(p.encendida&&soportada){setEncendida(true);void abrir(p.dispositivo)}
  return()=>apagarStream()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[])
 // Si se conecta o desconecta una cámara (la Cam Link), se actualiza la lista.
 useEffect(()=>{
  if(!soportada)return
  const cambio=()=>{void enumerar().catch(()=>{})}
  navigator.mediaDevices.addEventListener?.('devicechange',cambio);return()=>navigator.mediaDevices.removeEventListener?.('devicechange',cambio)
 },[soportada,enumerar])

 const alternar=useCallback(()=>{
  const on=!encendida;setEncendida(on)
  try{localStorage.setItem(CAMARA_ON_KEY,on?'1':'0')}catch{}
  if(on)void abrir(guardado.current);else{apagarStream();setError(null)}
 },[encendida,abrir,apagarStream])
 const elegir=useCallback((id:string)=>{
  guardado.current=id;try{localStorage.setItem(CAMARA_DISP_KEY,id)}catch{}
  setDispositivo(id);if(encendida)void abrir(id)
 },[encendida,abrir])

 /** UN cuadro actual como JPEG ~768 px, o null si la cámara está apagada o aún sin imagen. Nunca lanza. */
 const capturar=useCallback(async():Promise<File|null>=>{
  const v=video.current
  if(!encendida||!stream.current||!v||v.readyState<2||!v.videoWidth)return null
  try{
   const {ancho,alto}=dimensionesCuadro(v.videoWidth,v.videoHeight)
   const c=document.createElement('canvas');c.width=ancho;c.height=alto
   const ctx=c.getContext('2d');if(!ctx)return null
   ctx.imageSmoothingQuality='high';ctx.drawImage(v,0,0,ancho,alto)
   const blob=await new Promise<Blob|null>(ok=>c.toBlob(ok,'image/jpeg',CALIDAD_CUADRO))
   return blob&&blob.size>0?new File([blob],'camara-live.jpg',{type:'image/jpeg',lastModified:Date.now()}):null
  }catch{return null}
 },[encendida])

 return {soportada,encendida,lista,dispositivos,dispositivo,error,alternar,elegir,capturar,video}
}
