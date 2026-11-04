'use client'
import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Bandeja } from '@/features/decisiones/Bandeja'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { esTelefonoAhora } from '@/shared/hooks/useMediaQuery'
import s from '../habitos/habitos-telefono.module.css'

/**
 * `/telefono/decisiones` (autonomía v2, 3 nov 2026): lo que abre el push de una tarjeta. La bandeja a pantalla completa,
 * una por una y con la del push primero (`?id=cf_…`): Sí · No · Otro con el pulgar.
 */
export default function Page() {
  return <Suspense><Decisiones /></Suspense>
}

function Decisiones() {
  const id = useSearchParams().get('id')
  useEffect(() => { if (esTelefonoAhora()) useLayoutStore.getState().setPanelDerecho(false) }, [])
  return <main className={s.pagina}>
    <header className={s.cabeza}>
      <Link href="/telefono" className={s.volver} aria-label="Tu panel"><ChevronLeft size={18} aria-hidden /></Link>
      <h1>Decisiones</h1>
    </header>
    <Bandeja donde="telefono" enfocar={id} />
  </main>
}
