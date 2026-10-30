import { permanentRedirect } from 'next/navigation'

// Hoy (objetivo, agenda y hábitos) es el Calendario unificado desde el 5 oct 2026: los hábitos se marcan en su Día.
// El horizonte y la fecha viajan tal cual (docs/builds/retiro-pantallas-viejas-2026-10-05.md).
const MODO: Record<string, string> = { day: 'day', week: 'week', month: 'month' }
export default async function Page({ searchParams }: { searchParams: Promise<{ horizon?: string; date?: string }> }) {
  const { horizon, date } = await searchParams
  const q = new URLSearchParams({ mode: MODO[horizon ?? ''] ?? 'day', ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}) })
  permanentRedirect(`/calendar?${q}`)
}
