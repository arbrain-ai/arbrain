'use client'

import { useRouter } from 'next/navigation'
import { PlanningCalendar } from '@/features/planning/PlanningCalendar'
import { abrirSeccion } from '@/features/cabina/panel/Secciones'
import { useAskLevy } from '@/shared/hooks/useAskLevy'

export default function CalendarPage() {
  const router = useRouter(), ask = useAskLevy()
  return (
    <div className="h-full min-h-0">
      {/* Vista unificada: objetivo, tareas y calendario del periodo. El reporte navega dentro de la app; el plan del mes abre como documento en el panel. */}
      <PlanningCalendar onConversar={ask} onNavegar={url => router.push(url)} onAbrirDocumento={(ruta, titulo) => abrirSeccion({ vista: 'documento', ruta, titulo })} />
    </div>
  )
}
