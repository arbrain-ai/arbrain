import { PcmDecoder } from './pcm.ts'
import { normalizeAgent, type LiveAgent } from './voices.ts'
export type VoiceTiming = { text: string; firstByteMs: number | null; firstSoundMs: number | null; completed: boolean; failed: string | null; provider?: string | null; fallback?: string | null; firstByteAt?: number | null; firstSoundAt?: number | null }
/** El PCM ya decodificado de una frase (mismas muestras que suenan). La cara lo lee para mover la boca con la
 * energía exacta del instante que suena, sin un segundo analizador ni latencia. */
export type VoiceTrack = { rate: number; chunks: Float32Array[]; length: number }
export type VoicePosition = { text: string; elapsed: number; duration: number; complete: boolean; level: number; track?: VoiceTrack }
type Part = { track: VoiceTrack; text: string; buffers: Float32Array[]; rate: number; done: boolean; started: boolean; start: number; duration: number; totalSeconds: number; intervals: {at:number;duration:number;offset:number}[]; timing: VoiceTiming; generation: number }

/** Owns exactly one playback graph. Network order and audible order are independent. */
export class LivePcmPlayer {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private meter: Uint8Array<ArrayBuffer> | null = null
  private parts: Part[] = []
  private audible: Part[] = []
  private sources = new Set<AudioBufferSourceNode>()
  private controller = new AbortController()
  private generation = 0
  private nextAt = 0
  private networkCount = 0
  private queue: (() => void)[] = []
  private closed = false
  private timer: ReturnType<typeof setInterval> | null = null
  private turnStarted = 0
  private lastText = ''
  private heartbeat: ReturnType<typeof setInterval> | null = null
  /** Agente cuya voz se usa en las frases nuevas. La UI lo cambia con setAgent() al cambiar de agente activo. */
  agent: LiveAgent = 'levy'
  timings: VoiceTiming[] = []
  onChange: (() => void) | null = null
  onError: ((message: string) => void) | null = null
  private transport: typeof fetch
  // WebKit (Tauri) exige que fetch se llame con window como receptor: `this.transport(...)` lo invocaba
  // con el player como `this` y fallaba con «Can only call Window.fetch on instances of Window» (4 oct).
  constructor(transport: typeof fetch = fetch) { this.transport = transport === fetch ? fetch.bind(globalThis) : transport }

  async resume() {
    if (!this.context) {
      this.context = new AudioContext()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.connect(this.context.destination)
      this.meter = new Uint8Array(this.analyser.fftSize)
      this.timer = setInterval(() => this.pump(), 35)
    }
    await this.context.resume()
  }
  setAgent(agent: unknown) { this.agent = normalizeAgent(agent) }
  /** Instante absoluto (performance.now) en que empezó el turno de voz. */
  get turnStartedAt() { return this.turnStarted }
  /** Pre-calienta la conexión servidor→ElevenLabs (no gasta caracteres) y la mantiene caliente mientras Live está abierto. */
  warm() {
    const ping = () => { void this.transport('/api/live/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ warm: true }) }).then(r => r.body?.cancel()).catch(() => {}) }
    ping()
    if (!this.heartbeat) this.heartbeat = setInterval(ping, 20_000)
  }
  begin() { this.cancel();this.closed=false;this.turnStarted=performance.now();this.timings=[];this.lastText='' }
  finish() { this.closed=true;this.pump();this.onChange?.() }
  get busy() { return !this.closed || this.parts.length>0 || this.networkCount>0 || this.sources.size>0 || this.queue.length>0 }
  get speaking() { return this.position !== null }
  get position(): VoicePosition | null {
    if (!this.context) return null
    const time=this.context.currentTime-(this.context.outputLatency || 0)
    const part=this.audible.find(p=>p.intervals.some(i=>time>=i.at&&time<i.at+i.duration))
    if (!part)return null
    const interval=part.intervals.find(i=>time>=i.at&&time<i.at+i.duration)!
    return {text:part.text,elapsed:interval.offset+time-interval.at,duration:part.totalSeconds,complete:part.done,level:this.level,track:part.track}
  }
  get level() {
    if(!this.analyser||!this.meter)return 0
    this.analyser.getByteTimeDomainData(this.meter)
    let sum=0;for(const v of this.meter)sum+=((v-128)/128)**2
    return Math.min(1,Math.sqrt(sum/this.meter.length)*4)
  }
  enqueue(text: string, speed: number, agent: LiveAgent = this.agent) {
    if(!text.trim()||this.closed)return
    const generation=this.generation
    const timing:VoiceTiming={text,firstByteMs:null,firstSoundMs:null,completed:false,failed:null,provider:null,fallback:null,firstByteAt:null,firstSoundAt:null}
    const previousText=this.lastText;this.lastText=text
    const part:Part={track:{rate:24000,chunks:[],length:0},text,buffers:[],rate:24000,done:false,started:false,start:0,duration:0,totalSeconds:0,intervals:[],timing,generation}
    this.parts.push(part);this.timings.push(timing)
    this.queue.push(()=>{ void this.receive(part,speed,generation,this.controller.signal,agent,previousText) })
    this.dispatch()
  }
  private dispatch() {
    // Bounded lookahead: at most two sentence requests, and at most ~8s scheduled audio.
    while(this.networkCount<2 && this.queue.length && this.context && this.nextAt-this.context.currentTime<8){
      this.networkCount++;this.queue.shift()!()
    }
  }
  private async receive(part:Part,speed:number,generation:number,signal:AbortSignal,agent:LiveAgent,previousText:string){
    try{
      const response=await this.transport('/api/live/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:part.text,speed,agent,previousText}),signal})
      part.timing.provider=response.headers.get('X-Voice-Provider');part.timing.fallback=response.headers.get('X-Voice-Fallback')||null
      if(!response.ok||!response.body){
        const body=await response.json().catch(()=>({})) as {error?:string}
        throw new Error(body.error||'No se pudo generar esta frase.')
      }
      const rate=Number(response.headers.get('X-Sample-Rate'))
      if(!Number.isInteger(rate)||rate<8000||rate>96000)throw new Error('Formato de audio inválido.')
      part.rate=rate;part.track.rate=rate
      const reader=response.body.getReader(),decoder=new PcmDecoder()
      let total=0
      try{
        while(true){
          const {value,done}=await reader.read();if(done)break
          if(generation!==this.generation){await reader.cancel();return}
          if(part.timing.firstByteMs===null){part.timing.firstByteAt=performance.now();part.timing.firstByteMs=part.timing.firstByteAt-this.turnStarted}
          total+=value.length;if(total>12_000_000)throw new Error('La frase de voz excedió su límite.')
          const decoded=decoder.decode(value);if(decoded.length){part.totalSeconds+=decoded.length/rate;part.buffers.push(decoded);part.track.chunks.push(decoded);part.track.length+=decoded.length}
          this.pump()
        }
        decoder.finish()
      }finally{reader.releaseLock()}
    }catch(error){
      if(generation!==this.generation||signal.aborted)return
      part.timing.failed=error instanceof Error?error.message:'Falló la voz.'
      this.onError?.(part.timing.failed)
    }finally{
      if(generation===this.generation){part.done=true;this.networkCount--;this.pump();this.dispatch();this.onChange?.()}
    }
  }
  private pump(){
    const ctx=this.context;if(!ctx||!this.analyser)return
    this.audible=this.audible.filter(p=>p.start+p.duration>ctx.currentTime-2)
    while(this.parts.length){
      const part=this.parts[0]
      const count=part.buffers.reduce((n,b)=>n+b.length,0)
      if(!part.started&&!part.done&&count/part.rate<0.1)break
      while(part.buffers.length && this.nextAt-ctx.currentTime<8){
        const samples=part.buffers.shift()!
        const buffer=ctx.createBuffer(1,samples.length,part.rate)
        buffer.copyToChannel(new Float32Array(samples),0)
        const source=ctx.createBufferSource();source.buffer=buffer;source.connect(this.analyser)
        const at=Math.max(ctx.currentTime+0.025,this.nextAt)
        if(!part.started){
          part.started=true;part.start=at;this.audible.push(part)
          const lead=(at-ctx.currentTime+(ctx.outputLatency||0))*1000;part.timing.firstSoundAt=performance.now()+lead;part.timing.firstSoundMs=part.timing.firstSoundAt-this.turnStarted
        }
        const previous=part.intervals.at(-1)
        part.intervals.push({at,duration:buffer.duration,offset:previous?previous.offset+previous.duration:0})
        part.duration=at+buffer.duration-part.start
        this.nextAt=at+buffer.duration;this.sources.add(source)
        source.onended=()=>{source.disconnect();this.sources.delete(source);this.pump();this.onChange?.()}
        source.start(at)
      }
      if(!part.done||part.buffers.length)break
      this.parts.shift();part.timing.completed=!part.timing.failed
      this.nextAt+=0.06
    }
    this.dispatch()
  }
  cancel(){
    this.generation++;this.controller.abort();this.controller=new AbortController()
    this.queue=[];this.networkCount=0;this.parts=[];this.audible=[];this.closed=true
    for(const source of this.sources){source.onended=null;try{source.stop()}catch{}source.disconnect()}
    this.sources.clear();this.nextAt=0;this.onChange?.()
  }
  dispose(){this.cancel();if(this.timer)clearInterval(this.timer);this.timer=null;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;void this.context?.close();this.context=null;this.analyser=null}
}
