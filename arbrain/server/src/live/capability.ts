import { randomBytes } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { LiveToolbox, LiveInput } from './tools.js'
const active=new Map<string,LiveToolbox>()
/** One-turn bridge for runtimes that cannot add dynamic tools to an existing thread. */
export function registerLiveCapability(toolbox:LiveToolbox,port:number){
 const token=randomBytes(32).toString('hex'),file=join(tmpdir(),`arbrain-live-${randomBytes(12).toString('hex')}.json`)
 active.set(token,toolbox)
 writeFileSync(file,JSON.stringify({url:`http://127.0.0.1:${port}/live/tool`,token}),{mode:0o600})
 const close=()=>{active.delete(token);try{unlinkSync(file)}catch{}}
 toolbox.signal.addEventListener('abort',close,{once:true})
 return {file,close:()=>{toolbox.signal.removeEventListener('abort',close);close()}}
}
export async function invokeLiveCapability(token:string,input:unknown){
 const toolbox=active.get(token)
 if(!toolbox||toolbox.signal.aborted)throw new Error('La capacidad del turno ya no está activa.')
 return toolbox.call(input as LiveInput)
}
