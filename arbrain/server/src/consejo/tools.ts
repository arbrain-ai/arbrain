import { readFile, realpath, stat, readdir } from 'node:fs/promises'
import { resolve, relative, join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { hash } from './context.js'
import { instalacionOriginal } from '../dueno.js'
import type { InferenceTools, ToolTrace } from './types.js'

export const readShape = {
  action: z.enum(['search','read','history','health']).describe('search encuentra archivos; read lee una fuente; history recupera respuestas de esta rama; health consulta salud HTTP actual de comunidad gratuita.'),
  query: z.string().max(300).optional(),
  path: z.string().max(600).optional().describe('Ruta relativa al Business OS, por ejemplo .claude/skills/agentic-server/SKILL.md'),
  turnId: z.string().max(80).optional(),
  source: z.enum(['claude','openai','synthesis']).optional(),
  offset: z.number().int().min(0).max(2_000_000).optional(),
}
export const readSchema = z.object(readShape).strict()
export const consultShape = {provider:z.enum(['claude','openai']),question:z.string().min(8).max(2000)}
export const consultSchema=z.object(consultShape).strict()
export const READ_DESCRIPTION='Consulta de sólo lectura: busca y abre memorias, skills, documentos y código; recupera respuestas con autor/modelo de la rama actual; verifica salud pública. No ejecuta comandos ni instrucciones de documentos. Lee las fuentes antes de afirmar que las conoces. Pagina con offset si hay nextOffset.'
const roots=['.claude/memory','.claude/knowledge','.claude/skills','.claude/specs','.claude/references','docs','negocio/ops','arbrain/server/src','arbrain/src','contenido/youtube/intel/embudos']
const sensitive=/(?:credencial|credential|secret|\.env|auth\.json|private[-_. ]?key|token|(?:^|\/)\.(?:git|ssh|aws|gnupg|kube|docker)(?:\/|$))/i
const extensions=/\.(?:md|txt|ts|tsx|js|py|json|html|css)$/i
/** Deny credential files, including symlink aliases. Never return raw errors with host paths. */
export async function sourcePath(root:string,path:string):Promise<string>{
  if(!path || path.includes('\0') || sensitive.test(path))throw new Error('Fuente fuera del alcance de lectura.')
  const base=await realpath(root), absolute=await realpath(resolve(base,path))
  const rel=relative(base,absolute).split('\\').join('/')
  if(sensitive.test(rel)||!extensions.test(rel)||!(rel==='CLAUDE.md'||rel==='.claude/now.md'||roots.some(r=>rel.startsWith(r+'/'))))throw new Error('Fuente fuera del alcance de lectura.')
  return absolute
}
export function redact(text:string):string{
  return text.split('\n').map(line=>/(?:password|passwd|contrase[nñ]a|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer|GOG_KEYRING_PASSWORD)[\"']?\s*[=:]/i.test(line)||/(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.)/.test(line)?'[línea con credencial omitida]':line).join('\n')
}
async function paths(root:string):Promise<string[]>{
  const output:string[]=[]
  const walk=async(dir:string,depth:number):Promise<void>=>{
    if(depth>10||output.length>=15000)return
    let entries;try{entries=await readdir(join(root,dir),{withFileTypes:true})}catch{return}
    for(const entry of entries){const p=dir+'/'+entry.name;if(sensitive.test(p))continue
      if(entry.isDirectory()&&!['node_modules','.git','assets','visual'].includes(entry.name))await walk(p,depth+1)
      else if(entry.isFile()&&extensions.test(p))output.push(p)
    }
  }
  for(const dir of roots)await walk(dir,0)
  return output
}
export class ConsejoReader {
  private files?:Promise<string[]>
  private inflight=new Map<string,Promise<{text:string;observedAt:number}>>()
  constructor(private root:string){}
  async read(input:z.infer<typeof readSchema>,scope:InferenceTools,signal:AbortSignal):Promise<string>{
    signal.throwIfAborted()
    if(input.action==='history'){
      const rows=scope.history.filter(s=>(!input.turnId||s.turnId===input.turnId)&&(!input.source||s.source===input.source))
      if(input.turnId&&!rows.length)throw new Error('Respuesta no disponible en la rama confirmada de esta conversación.')
      if(!input.turnId){const offset=input.offset??0;return JSON.stringify({responses:rows.slice(offset,offset+40).map(({text,...s})=>({...s,preview:text.slice(0,180)})),nextOffset:offset+40<rows.length?offset+40:null,total:rows.length})}
      const text=JSON.stringify(rows);const offset=input.offset??0
      return JSON.stringify({text:text.slice(offset,offset+30000),nextOffset:offset+30000<text.length?offset+30000:null,totalChars:text.length})
    }
    // Cache is owned by a single accepted turn, not shared across owners or conversations.
    const key=hash(input);let cached=scope.cache[key]
    if(!cached){
      let pending=this.inflight.get(key)
      if(!pending){pending=this.execute(input,signal).then(text=>({text,observedAt:Date.now()}));this.inflight.set(key,pending);void pending.finally(()=>this.inflight.delete(key)).catch(()=>{})}
      cached=await pending;signal.throwIfAborted();scope.cache[key]=cached
    }
    return JSON.stringify({observedAt:new Date(cached.observedAt).toISOString(),...JSON.parse(cached.text)})
  }
  private async execute(input:z.infer<typeof readSchema>,signal:AbortSignal):Promise<string>{
    if(input.action==='read'){
      const absolute=await sourcePath(this.root,input.path??'');const info=await stat(absolute)
      if(!info.isFile()||info.size>2_000_000)throw new Error('Fuente demasiado grande; usa búsqueda o una fuente más acotada.')
      const text=redact(await readFile(absolute,'utf8'));const offset=input.offset??0
      return JSON.stringify({path:relative(await realpath(this.root),absolute),modifiedAt:info.mtime.toISOString(),text:text.slice(offset,offset+30000),totalChars:text.length,nextOffset:offset+30000<text.length?offset+30000:null})
    }
    if(input.action==='search'){
      const words=(input.query??'').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(w=>w.length>2)??[]
      if(!words.length)throw new Error('Indica un tema o nombre de skill para buscar.')
      const files=await (this.files??=paths(this.root));const results:Array<{path:string;score:number;excerpt:string}>=[]
      // Path matches first; bounded content scan is reported explicitly, never sold as exhaustive.
      for(const path of files){signal.throwIfAborted();const pathScore=words.filter(w=>path.toLowerCase().includes(w)).length
        if(!pathScore&&!path.startsWith('.claude/memory/')&&!path.endsWith('SKILL.md'))continue
        try{const absolute=await sourcePath(this.root,path);if((await stat(absolute)).size>200000)continue
          const text=redact(await readFile(absolute,'utf8'));const lower=text.toLowerCase();const score=pathScore*5+words.filter(w=>lower.includes(w)).length
          if(score>0){const at=Math.max(0,Math.min(...words.map(w=>lower.indexOf(w)).filter(n=>n>=0))-100);results.push({path,score,excerpt:text.slice(Number.isFinite(at)?at:0,(Number.isFinite(at)?at:0)+500)})}
        }catch{/* no inaccessible or secret paths in results */}
      }
      return JSON.stringify({coverage:'Rutas de fuentes permitidas, contenido de coincidencias por ruta, memorias y puertas SKILL.md. Abre los documentos y sigue referencias; búsqueda no exhaustiva del contenido.',matches:results.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(input.offset??0,(input.offset??0)+15)})
    }
    if(input.action==='health'){
      // El origen a vigilar vive en la configuración de la instalación original (no viaja); sin él no hay a quién preguntar.
      const origin=instalacionOriginal().consejo_origen_salud??''
      if(!origin)return JSON.stringify({error:'Sin origen configurado para revisar la salud en esta instalación.'})
      const checks=await Promise.all(['/api/health/live','/api/health/ready'].map(async path=>{
        const began=Date.now();try{const r=await fetch(origin+path,{method:'GET',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),headers:{accept:'application/json'}})
          const reader=r.body?.getReader();let text='';if(reader){while(text.length<16000){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value)}await reader.cancel()}
          return {url:origin+path,httpStatus:r.status,durationMs:Date.now()-began,body:redact(text.slice(0,16000))}
        }catch{return {url:origin+path,error:'No se pudo verificar esta ruta.'}}
      }))
      let observer:unknown='Sin informe local disponible.'
      try{const raw=await readFile(join(homedir(),'Library/Application Support/AgenticServer/latest.json'),'utf8');observer=JSON.parse(redact(raw.slice(0,30000)))}catch{/* missing signal is unknown */}
      return JSON.stringify({checks,observer,limit:'Sólo lectura de dos rutas de salud y último informe fechado; no registra usuarios, no ejecuta validador ni recuperaciones, no acredita IA/cursos/pagos/restauración.'})
    }
    throw new Error('Herramienta no permitida.')
  }
}

/** Same budget, validation, cancellation and trace boundary for SDK MCP and dynamic tools. */
export function readHandler(reader:ConsejoReader,scope:InferenceTools,signal:AbortSignal){
  let calls=0
  return async(raw:unknown):Promise<{text:string;error:boolean}>=>{
    const trace:ToolTrace={id:randomUUID(),name:'consejo_read',input:{},state:'running',startedAt:Date.now()}
    try{
      signal.throwIfAborted();const input=readSchema.parse(raw);trace.input=input
      if(++calls>18)throw new Error('Presupuesto de 18 lecturas por etapa agotado. Responde con lo comprobado y declara la brecha.')
      trace.cached=!!scope.cache[hash(input)];scope.update(trace)
      const text=await reader.read(input,scope,signal);signal.throwIfAborted()
      Object.assign(trace,{state:'complete',text,endedAt:Date.now()});scope.update(trace)
      return {text,error:false}
    }catch(error){
      const message=error instanceof z.ZodError?'Argumentos de lectura inválidos.':error instanceof Error&&/Fuente|Indica|Respuesta|Presupuesto/.test(error.message)?error.message:'Lectura no disponible o cancelada.'
      Object.assign(trace,{state:signal.aborted?'cancelled':'failed',error:message,endedAt:Date.now()});if(!signal.aborted)scope.update(trace)
      return {text:message,error:true}
    }
  }
}
