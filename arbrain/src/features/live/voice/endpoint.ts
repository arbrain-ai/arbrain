/** Endpoint detection only. A noise peak is not an instruction and silence is never submitted. */
export class SpeechEndpoint {
 /** Silencio que cierra la frase (antes 1000 ms). */
 static readonly END_MS=850
 /** Silencio tras el cual ya se transcribe en paralelo lo grabado, sin cerrar la frase: si Daniel sigue, se descarta. */
 static readonly SPECULATE_MS=350
 private speculated=false
 private lastTick=0
 private started=0
 private lastVoice=0
 private voiced=0
 private interrupted=false
 private resetAt=0
 /** performance.now() del último sonido de voz de la frase que acaba de cerrar (fin real de la voz de Daniel). */
 lastUtteranceEnd=0
 /** Instante del último sonido de voz de la frase en curso: la transcripción especulativa solo vale si no cambió al cerrar. */
 get lastVoiceAt(){return this.lastVoice}
 reset(now=0){this.lastTick=now;this.started=0;this.lastVoice=0;this.voiced=0;this.interrupted=false;this.speculated=false;this.resetAt=now}
 sample(level:number,now:number,agentSpeaking:boolean,agentWorking:boolean):'none'|'interrupt'|'end'|'discard'|'speculate'{
  const dt=this.lastTick?Math.max(0,Math.min(60,now-this.lastTick)):16;this.lastTick=now;this.resetAt ||=now
  if(level>(agentSpeaking?0.095:0.035)){
   this.started ||=now;this.lastVoice=now;this.voiced+=dt
   this.speculated=false
   if((agentSpeaking||agentWorking)&&this.voiced>=180&&!this.interrupted){this.interrupted=true;return 'interrupt'}
  }
  if(this.started&&!this.speculated&&this.voiced>=220&&now-this.lastVoice>SpeechEndpoint.SPECULATE_MS&&now-this.lastVoice<=SpeechEndpoint.END_MS){this.speculated=true;return 'speculate'}
  if(this.started&&now-this.lastVoice>SpeechEndpoint.END_MS){
   const valid=this.voiced>=220;this.lastUtteranceEnd=this.lastVoice;this.reset(now);return valid?'end':'discard'
  }
  if(!this.started&&now-this.resetAt>30000){this.reset(now);return 'discard'}
  return 'none'
 }
}
export function isStopUtterance(text:string){return /^(?:levy[, ]+)?(?:para|detente|silencio|alto|espera)[.!?\s]*$/i.test(text.trim())}
