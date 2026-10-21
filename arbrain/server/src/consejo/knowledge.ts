import { DUENO } from '../dueno.js'
import { readFileSync,realpathSync,statSync } from 'node:fs'
import { join,resolve,relative } from 'node:path'
const sensitive=/(?:credencial|credential|secret|\.env|auth\.json|private[-_. ]?key|token)/i
const noise=new Set(['quiero','puedes','sobre','para','como','cómo','esto','esta','tengo','hacer','ahora',...DUENO.toLowerCase().split(' '),'levy','dime','pregunta','negocio'])
/** Deterministic shared retrieval. No model receives broader filesystem access. */
export function relevantKnowledge(root:string,message:string):Array<{path:string;text:string}>{
 const words=[...new Set(message.toLocaleLowerCase('es').match(/[\p{L}\p{N}]{4,}/gu)??[])].filter(w=>!noise.has(w))
 if(!words.length)return []
 const memoryRoot=realpathSync(join(root,'.claude/memory'))
 const lines=['MEMORY.md','MEMORY-indice.md','MEMORY-archivo.md'].flatMap(file=>{try{return readFileSync(join(memoryRoot,file),'utf8').split('\n')}catch{return []}})
 const ranked=lines.flatMap(line=>{
  const m=line.match(/`((?:user|project|feedback|reference)\/[^`]+\.md)`/)
  if(!m||sensitive.test(m[1]))return []
  const text=line.toLocaleLowerCase('es');const score=words.filter(w=>text.includes(w)).length
  return score?[{path:m[1],score}]:[]
 }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path))
 const selected=new Set<string>();const output:Array<{path:string;text:string}>=[];let budget=0
 for(const candidate of ranked){
  if(selected.has(candidate.path))continue
  selected.add(candidate.path)
  try{
   const absolute=realpathSync(resolve(memoryRoot,candidate.path))
   if(!absolute.startsWith(memoryRoot+'/')||sensitive.test(absolute))continue
   const size=statSync(absolute).size
   if(size>100000||budget+size>160000)continue
   output.push({path:relative(realpathSync(root),absolute),text:readFileSync(absolute,'utf8')});budget+=size
   if(output.length>=6)break
  }catch{ /* Missing pointers are not invented context. */ }
 }
 return output
}
