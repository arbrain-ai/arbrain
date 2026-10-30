import { permanentRedirect } from 'next/navigation'

// ConversationFeed (tabla `conversations`) no tenía quien la abriera; las conversaciones viven en el chat
// (retiro del 5 oct 2026, docs/builds/retiro-pantallas-viejas-2026-10-05.md).
export default function Page() { permanentRedirect('/chat') }
