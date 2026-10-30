'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useCivilClock, useHabitRecords } from '@/features/sistema/useHabitRecords'
import { HabitosHoy, rangoHabitosHoy } from '@/features/planning/HabitosHoy'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import s from './habitos-telefono.module.css'

/**
 * `/telefono/habitos` (22 oct 2026, Daniel: «configúrame un atajo»). Lo que abre el ícono «Hábitos» de la pantalla de inicio:
 * las tres casillas de hoy a pantalla completa, con su racha, la tira de 30 días y la temporada. Misma fila que el pie del Día.
 * Agregarlo: en Safari, esta página → Compartir → «Agregar a inicio».
 */
export default function Page() {
  const { today, timeZone } = useCivilClock()
  const habits = useHabitRecords({ ...rangoHabitosHoy(today), timeZone })
  // Una pestaña del panel abierta en el teléfono taparía esta pantalla: aquí manda la fila.
  useEffect(() => { if (esTelefonoAhora()) useLayoutStore.getState().setPanelDerecho(false) }, [])
  const fecha = new Date(`${today}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return <main className={s.pagina}>
    <header className={s.cabeza}>
      <Link href="/telefono" className={s.volver} aria-label="Tu panel"><ChevronLeft size={18} aria-hidden /></Link>
      <h1>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</h1>
    </header>
    <HabitosHoy dia={today} today={today} habits={habits} donde="telefono" i={1} />
  </main>
}
