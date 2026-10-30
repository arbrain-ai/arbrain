import { requireChatPrincipal, resolveChatConversation, chatAccessResponse } from '@/lib/chat-access'
import { ChatAccessError, accountId } from '@/lib/chat-access-policy'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN, upstreamError } from '@/lib/claudeclaw'
export async function POST(request:Request){
 try{
  const principal=await requireChatPrincipal()
  if(!principal.personalOwner)throw new ChatAccessError('El espacio Live es personal.',403)
  const body=await request.json() as Record<string,unknown>
  if(typeof body.conversationId!=='string'||!body.conversationId)throw new ChatAccessError('Falta la conversación.',400)
  const scope=body.conversationId.startsWith('sdk:')
   ? {owner:principal.id,account:accountId(body.account),conversationId:body.conversationId}
   : await resolveChatConversation(principal,body.conversationId,body.account)
  if(!['snapshot','select','rendered'].includes(String(body.action)))throw new ChatAccessError('Acción inválida.',400)
  const response=await fetch(`${await getClaudeclawUrl()}/live/workspace`,{method:'POST',headers:{Authorization:`Bearer ${CLAUDECLAW_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ownerId:scope.owner,account:scope.account,conversationId:scope.conversationId,action:body.action,ids:body.ids,revision:body.revision,id:body.id,receipt:body.receipt}),signal:request.signal})
  if(!response.ok)return upstreamError(response,'el espacio Live')
  return new Response(response.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
 }catch(error){return chatAccessResponse(error)}
}
