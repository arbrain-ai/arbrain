import { permanentRedirect } from 'next/navigation'
// Live es ahora una pestaña dentro de Chat (2 jul 2026)
export default function CommandCenterRedirect() {
  permanentRedirect('/chat?tab=live')
}
