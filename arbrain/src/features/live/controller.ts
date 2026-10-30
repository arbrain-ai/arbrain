import type { ChatMessage } from '@/features/chat/hooks/useChat'
import type { ChatAccount } from '@/features/chat/stores/account-store'
/** A port to the existing chat controller, never a second conversation engine. */
export type LiveChatController={
 owner:string|null
 account:ChatAccount
 sessionId:string|null
 messages:ChatMessage[]
 loading:boolean
 model:string|null
 send:(text:string,opts?:{context?:string;imagenes?:string[]})=>void
 /** Subagentes en segundo plano del último turno: el servidor no abre otro turno de Live hasta que terminen. */
 backgroundBusy?:boolean
 interrupt:()=>void
 newChat:()=>void
 answerQuestion:(requestId:string,answers:Record<string,string>|null)=>Promise<boolean>
}
