/** Local-only real-provider acceptance server, seeded with the five-turn test transcript. */
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsejoEngine } from './engine.js'
import { ConsejoStore } from './store.js'
import { ConsejoRuntime } from './runtime.js'
import { handleConsejo } from './http.js'
import { ConsejoError, type Turn } from './types.js'
import { readEnvFile } from '../env.js'
const token=readEnvFile()['OPENCLAW_GATEWAY_TOKEN'];if(!token)throw new Error('Missing existing gateway authentication')
const {turns}:{turns:Turn[]}=JSON.parse(readFileSync('docs/builds/arbrain-consejo-2026-09-08/real-five-turns-2026-09-10.json','utf8'))
const store=new ConsejoStore(join(mkdtempSync(join(tmpdir(),'consejo-real-ui-')),'test.db'))
const engine=new ConsejoEngine(store,new ConsejoRuntime(),()=>turns[0].packet.instructions,180000)
const server=createServer(async(req,res)=>{
 if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401).end();return}
 if(req.url!=='/consejo'){res.writeHead(404).end();return}
 const parts:Buffer[]=[];for await(const part of req)parts.push(part)
 try {
  const body=JSON.parse(Buffer.concat(parts).toString())
  if(body.action==='list'&&typeof body.ownerId==='string'&&!store.list(body.ownerId).length){
   const c=store.create(body.ownerId,turns[0].conversationId);c.rootBranchId=turns[0].branchId;c.title='Prueba real · cinco turnos · 10 sep'
   store.db.prepare('UPDATE consejo_conversations SET data=? WHERE id=?').run(JSON.stringify(c),c.id)
   for(const turn of turns)store.insert({...turn,owner:body.ownerId})
  }
  const result=handleConsejo(body,engine);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result))
 }catch(error){res.writeHead(error instanceof ConsejoError?error.status:500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error instanceof Error?error.message:'Error'}))}
})
server.listen(3129,'127.0.0.1',()=>console.log('Consejo real-provider acceptance: 127.0.0.1:3129; isolated SQLite'))
