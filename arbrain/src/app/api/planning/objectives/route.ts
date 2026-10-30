import { callPlanning, checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
export const runtime = 'nodejs'
export async function GET() {
  try {const ownerId=await planningOwner();return Response.json({...await callPlanning({action:'objectives-read'}),ownerId},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return planningError(error)}
}
export async function POST(request:Request) {
  try {
    checkMutationOrigin(request)
    const ownerId=await planningOwner(),raw=await request.text()
    if(raw.length>90_000)throw new ChatAccessError('El objetivo es demasiado largo.',413)
    let p:Record<string,unknown>
    try{p=JSON.parse(raw)}catch{throw new ChatAccessError('Solicitud inválida.',400)}
    if(!p || p.ownerId!==ownerId)throw new ChatAccessError('La identidad cambió. Recarga.',409)
    return Response.json({...await callPlanning({action:'objectives-write',requestId:p.requestId,revision:p.revision,goal:p.goal}),ownerId},{headers:{'Cache-Control':'no-store'}})
  }catch(error){return planningError(error)}
}
