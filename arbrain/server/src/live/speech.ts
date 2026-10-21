import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {promisify} from 'node:util'
import {existsSync,mkdirSync,statSync} from 'node:fs'
import {join} from 'node:path'
import {PROJECT_ROOT,STORE_DIR} from '../config.js'
export class SpeechFrames{
 private bytes:Buffer=Buffer.alloc(0)
 push(chunk:Buffer){
  this.bytes=Buffer.concat([this.bytes,chunk]);const frames:{id:number;rate:number;data:Buffer}[]=[]
  while(this.bytes.length>=12){const length=this.bytes.readUInt32LE(4);if(length>2_000_000)throw new Error('Invalid voice frame');if(this.bytes.length<12+length)break;frames.push({id:this.bytes.readUInt32LE(0),rate:this.bytes.readUInt32LE(8),data:this.bytes.subarray(12,12+length)});this.bytes=this.bytes.subarray(12+length)}return frames
 }
}
type Job={controller:ReadableStreamDefaultController<Uint8Array>;ready:(rate:number)=>void;reject:(error:Error)=>void;started:boolean;bytes:number;cleanup:()=>void}
export class WarmSpeech{
 private child:ChildProcessWithoutNullStreams|null=null
 private starting:Promise<void>|null=null
 private sequence=0
 private jobs=new Map<number,Job>()
 async start(){
  if(this.child&&!this.child.killed)return
  if(this.starting)return this.starting
  this.starting=(async()=>{
   if(process.platform!=='darwin')throw new Error('La voz Apple requiere el host macOS.')
   const source=join(PROJECT_ROOT,'arbrain/server/services/live-voice/sayd.swift'),directory=join(STORE_DIR,'live-voice'),binary=join(directory,'sayd')
   mkdirSync(directory,{recursive:true})
   if(!existsSync(binary)||statSync(binary).mtimeMs<statSync(source).mtimeMs)await promisify(execFile)('/usr/bin/swiftc',['-O',source,'-o',binary],{timeout:60000})
   const child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});this.child=child;const frames=new SpeechFrames()
   child.stderr.on('data',()=>{}) // Do not mix diagnostics with the framed PCM protocol.
   child.stdout.on('data',(chunk:Buffer)=>{
    try{for(const frame of frames.push(chunk)){
     const job=this.jobs.get(frame.id);if(!job)continue
     if(!frame.data.length){if(!job.started)job.reject(new Error('La voz no produjo audio.'));job.controller.close();job.cleanup();this.jobs.delete(frame.id);continue}
     if(!frame.rate)throw new Error(frame.data.toString('utf8').slice(0,200))
     if(frame.rate<8000||frame.rate>96000)throw new Error('Frecuencia de voz inválida.')
     job.bytes+=frame.data.length;if(job.bytes>12_000_000)throw new Error('Límite de voz excedido.')
     if(!job.started){job.started=true;job.ready(frame.rate)}
     job.controller.enqueue(new Uint8Array(frame.data))
    }}catch(error){this.fail(error instanceof Error?error:new Error('Protocolo de voz inválido.'))}
   })
   child.on('error',error=>this.fail(error));child.on('exit',()=>{if(this.child===child){this.child=null;this.fail(new Error('El proceso de voz se cerró.'))}})
  })().finally(()=>{this.starting=null})
  return this.starting
 }
 private fail(error:Error){const child=this.child;this.child=null;child?.kill();for(const job of this.jobs.values()){job.reject(error);try{job.controller.error(error)}catch{}job.cleanup()}this.jobs.clear()}
 async stream(text:string,speed:number,signal:AbortSignal){
  await this.start();signal.throwIfAborted()
  if(this.jobs.size>=8)throw new Error('El servicio de voz está ocupado.')
  const child=this.child!;const id=++this.sequence
  let ready!:(rate:number)=>void,reject!:(error:Error)=>void
  const rate=new Promise<number>((resolve,fail)=>{ready=resolve;reject=fail})
  let controller!:ReadableStreamDefaultController<Uint8Array>
  const abort=()=>{const job=this.jobs.get(id);if(!job)return;child.stdin.write(JSON.stringify({id,cancel:true})+'\n');job.reject(new Error('Voz cancelada.'));try{job.controller.error(new Error('Voz cancelada.'))}catch{}job.cleanup();this.jobs.delete(id)}
  const timer=setTimeout(abort,30000)
  const body=new ReadableStream<Uint8Array>({start(c){controller=c},cancel(){abort()}})
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
  this.jobs.set(id,{controller,ready,reject,started:false,bytes:0,cleanup});signal.addEventListener('abort',abort,{once:true})
  if(signal.aborted)abort()
  else child.stdin.write(JSON.stringify({id,text,rate:0.5+(speed-1)*(0.115/0.75)})+'\n')
  return {body,sampleRate:await rate}
 }
 close(){this.fail(new Error('Voz cerrada.'))}
}
let instance:WarmSpeech|undefined
export function warmSpeech(){return instance??=new WarmSpeech()}
export async function prewarmSpeech(){
 const audio=await warmSpeech().stream('Hola.',1.75,AbortSignal.timeout(15000))
 const reader=audio.body.getReader();for(;;){const {done}=await reader.read();if(done)break}
}
