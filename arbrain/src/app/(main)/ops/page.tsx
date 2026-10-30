import { permanentRedirect } from 'next/navigation'

// Ops se retiró el 5 oct 2026 (docs/builds/retiro-pantallas-viejas-2026-10-05.md): los crons viven en Rutinas, el
// registro de agentes (ops_events) en el Taller › Registro y las sesiones en el chat (Recientes · Ver todas).
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  permanentRedirect(view === 'cron' ? '/rutinas' : view === 'sessions' ? '/chat' : '/chat?panel=taller&taller=registro')
}
