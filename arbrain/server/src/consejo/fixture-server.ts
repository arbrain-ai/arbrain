/** Local acceptance harness. No production credentials, providers, or daemon restart. */
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsejoEngine, IDENTITIES } from './engine.js'
import { ConsejoStore } from './store.js'
import { handleConsejo } from './http.js'
import { ConsejoError, type Runtime } from './types.js'
import { readEnvFile } from '../env.js'
const token = readEnvFile()['OPENCLAW_GATEWAY_TOKEN']
const runtime: Runtime = {
  identities: async () => IDENTITIES,
  infer: async (stage, packet, _proposals, signal) => {
    await new Promise<void>((resolve,reject) => { const timer=setTimeout(resolve, stage==='synthesis'?1700:stage==='claude'?600:1100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Cancelado'))},{once:true}) })
    const q=packet.messages.at(-1)!.content
    if(q.includes('[fallo]') && stage==='openai')throw new Error('Prueba sintética: OpenAI no respondió. No se cambió de cuenta.')
    const text = stage==='claude' ? '**Prueba sintética · Claude.** La primera distinción es entre lo que quieres conservar y lo que estás dispuesto a cambiar. Una decisión reversible permite explorar sin convertir la intuición en un compromiso.\n\nNo doy por resuelta la tensión: elegir también significa dejar algo fuera.' : stage==='openai' ? '**Prueba sintética · OpenAI.** La autonomía no exige producir cada idea por tu cuenta. Exige poder revisar por qué aceptaste una idea y cambiar de parecer cuando aparece una objeción mejor.\n\nLa pregunta es qué criterio estás usando para elegir.' : `**Prueba sintética de interfaz.**\n\nPuedes apoyarte en otra inteligencia y conservar tu criterio. La clave es que puedas **revisar la razón de tu elección**, no sólo repetir la conclusión.\n\nUna decisión reversible permite probar una intuición sin fingir certeza. Si una objeción cambia lo que dabas por hecho, volver sobre la pregunta es parte del pensamiento.\n\nRetomo tu mensaje: «${q}».`
    return {text,identity:IDENTITIES[stage==='openai'?'openai':'claude']}
  },
}
const store=new ConsejoStore(process.env.CONSEJO_FIXTURE_DB || join(mkdtempSync(join(tmpdir(),'consejo-ui-fixture-')),'test.db'))
const e=new ConsejoEngine(store,runtime,()=> 'Fixture sintético, sin cuentas reales ni llamadas a proveedores.')
const server=createServer(async(req,res)=>{
  if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(401).end();return}
  if(req.url!=='/consejo'){res.writeHead(404).end();return}
  const parts:Buffer[]=[];for await(const p of req)parts.push(p)
  try { const body=JSON.parse(Buffer.concat(parts).toString()); if(body.action==='submit' && body.message?.includes('[offline]') && process.env.CONSEJO_FIXTURE_ALLOW_PENDING !== '1'){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Prueba sintética: envío no aceptado; conserva el sobre.'}));return} const result=handleConsejo(body,e);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result)) }
  catch(error){res.writeHead(error instanceof ConsejoError?error.status:500,{'Content-Type':'application/json'}).end(JSON.stringify({error:error instanceof Error?error.message:'Error'}))}
})
const port=Number(process.env.CONSEJO_FIXTURE_PORT || 3109)
server.listen(port,'127.0.0.1',()=>console.log(`Consejo synthetic fixture: 127.0.0.1:${port}`))
