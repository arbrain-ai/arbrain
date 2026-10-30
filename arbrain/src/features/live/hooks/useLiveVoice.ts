'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {LiveChatController} from '../controller'
import {LivePcmPlayer,type VoicePosition} from '../voice/player'
import {SpeechClauses,speechText} from '../voice/pcm'
import {LatencyTrace} from '../voice/latency'
import {normalizeAgent,type LiveAgent} from '../voice/voices'
export type LiveVoiceState='idle'|'listening'|'transcribing'|'thinking'|'speaking'|'error'
/** `agent` = agente activo de la UI: su voz es la que habla (Levy=Adam; Trinity y Sensei según voices.ts). */
export function useLiveVoice(controller:LiveChatController|null,agent:LiveAgent|string='levy'){
 const agentRef=useRef<LiveAgent>(normalizeAgent(agent));agentRef.current=normalizeAgent(agent)
 const trace=useRef<LatencyTrace|null>(null)
 const current=useRef(controller);current.current=controller
 const player=useRef<LivePcmPlayer|null>(null)
 const generation=useRef(0)
 const clauseTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const reading=useRef(false),clause=useRef(new SpeechClauses()),seen=useRef({id:'',length:0}),wasLoading=useRef(false)
 const [state,setState]=useState<LiveVoiceState>('idle'),[error,setError]=useState<string|null>(null)
 const [position,setPosition]=useState<VoicePosition|null>(null),[transcript,setTranscript]=useState(''),[speed,setSpeed]=useState(1.75)
 const speedRef=useRef(speed);speedRef.current=speed
 const [questionText,setQuestionText]=useState('')
 const [spokenCaption,setSpokenCaption]=useState('')
 const answers=useRef<{requestId:string;index:number;values:Record<string,string>}|null>(null)
 const scope=useRef({owner:controller?.owner,account:controller?.account,session:controller?.sessionId})
 const prepare=useCallback(async()=>{
  player.current??=new LivePcmPlayer();player.current.setAgent(agentRef.current);player.current.warm()
  player.current.onError=message=>{setError(message);setState('error')}
  await player.current.resume()
 },[])
 const stop=useCallback(()=>{
  if(clauseTimer.current)clearTimeout(clauseTimer.current)
  generation.current++;reading.current=false
  player.current?.cancel();setState('idle');setPosition(null)
 },[])
 const interrupt=useCallback(()=>{
  if(clauseTimer.current)clearTimeout(clauseTimer.current)
  player.current?.cancel();reading.current=false
  if(current.current?.loading&&!current.current.messages.at(-1)?.questionPrompts?.some(q=>q.status==='pending'))current.current.interrupt()
  setState('idle')
 },[])
 const speak=(text:string)=>{trace.current?.mark('firstSentence');player.current?.enqueue(text,speedRef.current)}
 // Acuse de la capa rápida (live_ack): una sola vez por respuesta, solo si Opus aún no ha dicho nada, por la misma cola de voz.
 const acked=useRef<string|null>(null)
 const speakAck=useCallback((turnId:string,text:string)=>{
  if(!reading.current||seen.current.length>0||player.current?.position||acked.current===(turnId||'-')||!text.trim())return
  acked.current=turnId||'-';speak(text)
 },[])
 const hasQuestion=()=>!!current.current?.messages.at(-1)?.questionPrompts?.some(q=>q.status==='pending')
 const dispatch=async(text:string,imagenes?:string[])=>{
  const c=current.current;if(!c)return
  const pending=c.messages.at(-1)?.questionPrompts?.find(q=>q.status==='pending')
  if(pending){
   answers.current??={requestId:pending.requestId,index:0,values:{}}
   if(answers.current.requestId!==pending.requestId)answers.current={requestId:pending.requestId,index:0,values:{}}
   const draft=answers.current,q=pending.questions[draft.index]
   if(!q)throw new Error('La pregunta cambió. Vuelve a leer la conversación.')
   draft.values[q.question]=text
   if(draft.index+1<pending.questions.length){
    draft.index++;const next=pending.questions[draft.index].question;setQuestionText(next)
    reading.current=false;player.current?.begin();player.current?.enqueue(next,speedRef.current);player.current?.finish();return
   }
   const previous=c.messages.at(-1)
   if(clauseTimer.current)clearTimeout(clauseTimer.current)
  player.current?.begin();reading.current=true;seen.current={id:previous?.id??'',length:speechText(previous?.content??'').length};clause.current=new SpeechClauses();wasLoading.current=true
   if(!await c.answerQuestion(pending.requestId,draft.values))throw new Error('No se confirmó tu respuesta. La pregunta sigue abierta.')
   answers.current=null;setQuestionText('');return
  }
  trace.current?.mark('send');c.send(text,imagenes?.length?{imagenes}:undefined)
 }
 const beginResponse=useCallback((pre?:{voiceEnd:number;endpoint:number;sttDone:number})=>{
  trace.current=new LatencyTrace(agentRef.current)
  if(pre){trace.current.mark('voiceEnd',pre.voiceEnd);trace.current.mark('endpoint',pre.endpoint);trace.current.mark('sttDone',pre.sttDone)}
  player.current?.begin();reading.current=true;seen.current={id:'',length:0};clause.current=new SpeechClauses();wasLoading.current=false
 },[])
 const send=useCallback(async(text:string,imagenes?:string[])=>{
  if((!text.trim()&&!imagenes?.length)||!current.current||(current.current.loading&&!hasQuestion()))return
  await prepare();setError(null);setSpokenCaption('');beginResponse();setState('thinking');await dispatch(text,imagenes)
 },[prepare,beginResponse])
 useEffect(()=>{
  const pending=controller?.messages.at(-1)?.questionPrompts?.find(q=>q.status==='pending')
  if(!pending){answers.current=null;setQuestionText('');return}
  if(answers.current?.requestId!==pending.requestId){
   answers.current={requestId:pending.requestId,index:0,values:{}}
   const question=pending.questions[0]?.question??'';setQuestionText(question)
   if(player.current&&reading.current&&question)player.current.enqueue(question,speedRef.current)
  }
 },[controller?.messages])
 // Read only the response initiated here, never replay old history on entering Live.
 useEffect(()=>{
  if(!controller||!reading.current)return
  if(controller.loading)wasLoading.current=true
  const last=controller.messages.at(-1)
  if(last?.role==='assistant'&&(controller.loading||wasLoading.current)){
   if(last.id!==seen.current.id){seen.current={id:last.id,length:0};clause.current=new SpeechClauses()}
   const spoken=speechText(last.content)
   const delta=spoken.slice(seen.current.length);seen.current.length=spoken.length
   if(delta)trace.current?.mark('firstToken')
   for(const text of clause.current.push(delta))speak(text)
   if(delta){if(clauseTimer.current)clearTimeout(clauseTimer.current);clauseTimer.current=setTimeout(()=>{if(reading.current)for(const text of clause.current.flushSentence())speak(text)},160)}
  }
  if(wasLoading.current&&!controller.loading){for(const text of clause.current.flush())speak(text);player.current?.finish();reading.current=false}
 },[controller?.messages,controller?.loading])
 // Conexión caliente desde que Live se abre: evita el ~1.3 s de TLS en frío de ElevenLabs en la primera frase.
 useEffect(()=>{player.current??=new LivePcmPlayer();player.current.setAgent(agentRef.current);player.current.warm()},[])
 useEffect(()=>{player.current?.setAgent(agent)},[agent])
 useEffect(()=>{
  const timer=setInterval(()=>{
   const t=trace.current,first=player.current?.timings[0]
   if(t&&first&&!t.logged){
    t.provider=first.provider??t.provider;t.fallback=first.fallback??t.fallback
    if(first.firstByteAt)t.mark('firstByte',first.firstByteAt)
    if(first.firstSoundAt)t.mark('firstSound',first.firstSoundAt)
    if(first.firstSoundAt||first.failed)t.log()
   }
   const p=player.current?.position??null;setPosition(p)
   if(p){setState('speaking');setSpokenCaption(p.text)}
   else setState(previous=>previous==='error'?previous:(current.current?.loading&&!hasQuestion())||reading.current?'thinking':'idle')
  },70)
  return()=>{clearInterval(timer);stop();player.current?.dispose();player.current=null}
 },[stop])
 useEffect(()=>{
  const next={owner:controller?.owner,account:controller?.account,session:controller?.sessionId},old=scope.current
  if(old.owner!==next.owner||old.account!==next.account||(old.session&&old.session!==next.session)){
   stop();setError(null);setTranscript('');setSpokenCaption('');answers.current=null;setQuestionText('')
  }
  scope.current=next
 },[controller?.owner,controller?.account,controller?.sessionId,stop])
 return {active:false,state,error,position,transcript,questionText,spokenCaption,speed,setSpeed,warm:()=>{player.current??=new LivePcmPlayer();player.current.setAgent(agentRef.current);player.current.warm()},stop,interrupt,send,speakAck,player}
}
