import {describe,it,expect,vi} from 'vitest'
import {consultationHandler} from './consultation.js'
import {IDENTITIES} from './engine.js'
import type {InferenceTools,ToolTrace} from './types.js'
function scope():InferenceTools{return {history:[],cache:{},traces:[],update(){}}}
describe('bounded public clarification',()=>{
 it('routes only to the named provider, retains exact model, and deduplicates successful calls across retry',async()=>{
  const s=scope(),infer=vi.fn(async(provider:'claude'|'openai')=>({text:'aclaración pública',identity:IDENTITIES[provider]})),signal=new AbortController().signal
  const input={provider:'openai',question:'¿Qué supuesto falta verificar?'}
  const first=await consultationHandler(s,signal,infer)(input)
  const recovered=await consultationHandler(structuredClone({...s,update:undefined}) as unknown as InferenceTools,signal,infer)(input)
  expect(first.error).toBe(false);expect(recovered.text).toContain('gpt-6-astra');expect(infer).toHaveBeenCalledTimes(1);expect(infer.mock.calls[0][0]).toBe('openai')
 })
 it('limits to two calls and never replays an uncertain or failed consultation',async()=>{
  const s=scope(),infer=vi.fn(async()=>{throw new Error('transport lost')}),read=consultationHandler(s,new AbortController().signal,infer)
  const input={provider:'claude',question:'Pregunta fallida número uno'}
  await read(input);await read(input);await read({provider:'openai',question:'Otra pregunta puntual distinta'})
  expect((await read({provider:'claude',question:'Tercera pregunta ya innecesaria'})).error).toBe(true);expect(infer).toHaveBeenCalledTimes(2)
 })
 it('cancels child inference and fences late completions',async()=>{
  const s=scope(),events:ToolTrace[]=[];s.update=t=>events.push(structuredClone(t));const ac=new AbortController();let finish!:()=>void
  const gate=new Promise<void>(r=>finish=r),infer=vi.fn(async()=>{await gate;return {text:'late',identity:IDENTITIES.openai}})
  const p=consultationHandler(s,ac.signal,infer)({provider:'openai',question:'Pregunta interrumpida de prueba'});ac.abort();finish();expect((await p).error).toBe(true);expect(events.some(t=>t.state==='complete')).toBe(false)
 })
})
