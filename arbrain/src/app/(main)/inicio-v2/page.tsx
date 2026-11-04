import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { onboardingV2Encendido } from '@/features/primer-arranque/v2/interruptor'
import { InicioV2 } from './Cliente'

export const metadata: Metadata = { title: 'Tu socio estratega (vista previa) · Arbrain' }
export const dynamic = 'force-dynamic'

/** «Tu socio estratega» del onboarding v2 dentro del shell real (3 nov 2026). Apagado = no existe. `?vivo=1`: señales reales. */
export default function Page() {
  if (!onboardingV2Encendido()) notFound()
  return <InicioV2 />
}
