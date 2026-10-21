import { permanentRedirect } from 'next/navigation'

// Retiro del 5 oct 2026 (docs/builds/retiro-pantallas-viejas-2026-10-05.md): la lista completa de Todoist vive en
// Tareas (panel) y la continuidad de los hábitos en el Calendario Día. Lista y Flujo abren el chat con Tareas al frente.
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  permanentRedirect(view === 'habits' ? '/calendar?mode=day' : '/chat?panel=tareas')
}
