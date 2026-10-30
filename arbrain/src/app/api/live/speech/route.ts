import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { speakEleven, warmEleven, elevenKey } from '@/features/live/server/elevenlabs'
import { normalizeAgent, voiceIdFor } from '@/features/live/voice/voices'
export const maxDuration = 120
let hostUnavailableUntil=0
/** PCM passthrough: no arrayBuffer, so a first audio chunk does not wait for the last. */
export async function POST(request: Request) {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  let body: { text?: unknown; speed?: unknown; agent?: unknown; previousText?: unknown; warm?: unknown }
  try { body=await request.json() } catch { return Response.json({error:'Solicitud de voz inválida.'},{status:400}) }
  if (body.warm === true) return Response.json(await warmEleven(),{headers:{'Cache-Control':'no-store'}})
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1200) return Response.json({error:'La frase debe tener entre 1 y 1200 caracteres.'},{status:400})
  const speed=body.speed ?? 1.75
  if (typeof speed !== 'number' || speed < 0.5 || speed > 3) return Response.json({error:'Velocidad de voz inválida.'},{status:400})
  // Voz principal: ElevenLabs (flash, PCM 24 kHz). Si falla, se agota el saldo o el primer byte pasa de 1.5 s, cae a Apple y luego LemonFox.
  let fallbackReason=''
  if(elevenKey()){
    const agent=normalizeAgent(body.agent)
    const eleven=await speakEleven({text:body.text.trim(),voiceId:voiceIdFor(agent,process.env),previousText:typeof body.previousText==='string'?body.previousText:undefined,speed:Number(process.env.LIVE_ELEVEN_SPEED)||1,signal:request.signal})
    if(eleven.ok)return new Response(eleven.body,{headers:{'Content-Type':'audio/pcm','X-Sample-Rate':'24000','X-Voice-Provider':'elevenlabs','X-Voice-Agent':agent,'X-Provider-First-Byte-Ms':String(eleven.firstByteMs),'Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}})
    if(eleven.reason==='cancelado')return new Response(null,{status:499})
    fallbackReason=eleven.reason
    console.warn('[latencia-live] ElevenLabs no disponible, respaldo de voz:',fallbackReason)
  }
  // The resident host owns the warm Apple voice; browser/cloud share this route.
  if(Date.now()>=hostUnavailableUntil) try {
    const audio=await fetch(`${await getClaudeclawUrl()}/live/speech`,{method:'POST',headers:{Authorization:`Bearer ${CLAUDECLAW_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({text:body.text.trim(),speed}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(6000)])})
    if(audio.ok&&audio.body){
      const rate=audio.headers.get('X-Sample-Rate')
      if(rate&&Number(rate)>=8000&&Number(rate)<=96000)return new Response(audio.body,{headers:{'Content-Type':'audio/pcm','X-Sample-Rate':rate,'X-Voice-Provider':'apple-juan','X-Voice-Fallback':fallbackReason,'Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}})
    }
    hostUnavailableUntil=Date.now()+(audio.status===404?30000:5000)
    await audio.body?.cancel()
  }catch{if(request.signal.aborted)return new Response(null,{status:499});hostUnavailableUntil=Date.now()+5000}
  const key=process.env.LEMONFOX_API_KEY
  if (!key) return Response.json({error:'La voz no está configurada en este servidor.',code:'tts_not_configured'},{status:503})
  const started=Date.now()
  try {
    const response=await fetch('https://api.lemonfox.ai/v1/audio/speech',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({input:body.text.trim(),voice:process.env.LIVE_TTS_VOICE || 'alex',language:'es',speed,response_format:'pcm'}),
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(45_000)]),
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return Response.json({error:`El servicio de voz respondió ${response.status}. El texto sigue disponible.`,code:'tts_provider_failed'}, {status:response.status===429?429:502})
    }
    return new Response(response.body,{headers:{'Content-Type':'audio/pcm','X-Sample-Rate':'24000','X-Voice-Provider':'lemonfox','X-Voice-Fallback':fallbackReason,'X-Provider-Headers-Ms':String(Date.now()-started),'Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}})
  } catch {
    if(request.signal.aborted)return new Response(null,{status:499})
    return Response.json({error:'La voz no respondió a tiempo. El texto sigue disponible.',code:'tts_unreachable'},{status:503})
  }
}
