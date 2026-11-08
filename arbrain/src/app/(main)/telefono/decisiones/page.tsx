'use client'
import { Suspense, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Bandeja } from '@/features/decisiones/Bandeja'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import { useBandeja } from '@/features/decisiones/useBandeja'
import { pedirEnfocarDecisiones } from '@/features/decisiones/FranjaDecisiones'
import { abrirHoyEnTelefono } from '@/features/cabina/panel/telefono-pestanas'
import s from '../habitos/habitos-telefono.module.css'

/**
 * `/telefono/decisiones` (autonomía v2, 3 nov 2026): lo que abre el push de una tarjeta. La bandeja a pantalla completa,
 * una por una y con la del push primero (`?id=cf_…`): Sí · No · Otro con el pulgar.
 *
 * 4 nov 2026 (Daniel: «debería solo aparecer en la vista de mi hoy»): en el teléfono, si la del push sigue esperando, se va al Día de hoy,
 * abre la tarjeta HOY y esa decisión (la misma vista del escritorio). Si ya se decidió o venció, se queda aquí: su historial lo dice.
 * Sin `?id` (la fila «Decisiones» de /telefono) es la bandeja completa, como siempre.
 */
export default function Page() {
  return <Suspense><Decisiones /></Suspense>
}

function Decisiones() {
  const id = useSearchParams().get('id')
  const router = useRouter()
  const telefono = useRef(esTelefonoAhora()).current
  const llevar = Boolean(id) && telefono
  const { vista, error } = useBandeja(60_000, llevar)
  const aHoy = llevar && !!vista?.pendientes.some(t => t.id === id)
  useEffect(() => { if (esTelefonoAhora() && !aHoy) useLayoutStore.getState().setPanelDerecho(false) }, [aHoy])
  useEffect(() => {
    if (!aHoy || !id) return
    pedirEnfocarDecisiones(id)
    abrirHoyEnTelefono()
    router.replace('/telefono')
  }, [aHoy, id, router])
  // Mientras se lee si sigue esperando, nada (sin parpadeo de la bandeja antes de ir al Día); si no se pudo leer, la bandeja.
  if (aHoy || (llevar && !vista && !error)) return null
  return <main className={s.pagina}>
    <header className={s.cabeza}>
      <Link href="/telefono" className={s.volver} aria-label="Tu panel"><ChevronLeft size={18} aria-hidden /></Link>
      <h1>Decisiones</h1>
    </header>
    <Bandeja donde="telefono" enfocar={id} />
  </main>
}
