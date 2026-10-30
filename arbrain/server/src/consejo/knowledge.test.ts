import {describe,it,expect}from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync}from 'node:fs'
import {join}from 'node:path'
import {tmpdir}from 'node:os'
import {relevantKnowledge}from './knowledge.js'
it('retrieves original source once and refuses sensitive pointers or symlink escapes',()=>{
 const root=mkdtempSync(join(tmpdir(),'consejo-knowledge-'));const mem=join(root,'.claude/memory')
 mkdirSync(join(mem,'user'),{recursive:true});mkdirSync(join(mem,'reference'),{recursive:true})
 writeFileSync(join(mem,'MEMORY.md'),'- `user/autonomia.md` — autonomía. **T:** autonomía, pensamiento\n- `reference/credenciales.md` — autonomía\n- `user/escape.md` — autonomía')
 writeFileSync(join(mem,'MEMORY-indice.md'),'- `user/autonomia.md` — autonomía\n')
 writeFileSync(join(mem,'user/autonomia.md'),'Texto íntegro original.');writeFileSync(join(mem,'reference/credenciales.md'),'SECRET')
 writeFileSync(join(root,'outside.md'),'OUTSIDE');symlinkSync(join(root,'outside.md'),join(mem,'user/escape.md'))
 const sources=relevantKnowledge(root,'Exploremos la autonomía del pensamiento')
 expect(sources).toEqual([{path:'.claude/memory/user/autonomia.md',text:'Texto íntegro original.'}])
})
