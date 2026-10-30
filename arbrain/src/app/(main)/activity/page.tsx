import { permanentRedirect } from 'next/navigation'
// Alias del 2 jul (sesiones) → el chat, donde viven las conversaciones (retiro de Ops, 5 oct 2026).
export default function Page() { permanentRedirect('/chat') }
