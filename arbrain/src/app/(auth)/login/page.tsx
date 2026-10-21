import { Suspense } from 'react'
import Link from 'next/link'
import { LoginForm } from '@/features/auth/components'
import s from '@/features/auth/components/entrada.module.css'

// Clases de movimiento globales (shared/movimiento/movimiento.css) escritas a mano: esta página es de servidor
// y `mov`/`escalon` viven en un módulo de cliente.
const escalon = (i: number) => ({ ['--i' as string]: i })

export default function LoginPage() {
  return (
    <div className="w-full max-w-xs sm:max-w-sm">
      <div className={`titanium-bezel w-full ${s.tarjeta} mov-entra`}>
        <div className="titanium-screen p-6 sm:p-8">

          <div className="text-center mb-8">
            <p className={`${s.marca} mov-aparece`}>Arbrain<i aria-hidden /></p>
            <h1 className={`mt-4 text-2xl font-bold tracking-tight text-foreground mov-entra`} style={escalon(1)}>Hola de nuevo</h1>
            <p className={`mt-2 text-sm text-muted mov-entra`} style={escalon(1)}>Levy te espera en el chat.</p>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>

      <p className={`text-center text-sm text-muted/80 mt-6 mov-aparece`} style={escalon(7)}>
        ¿Aún no tienes cuenta?{' '}
        <Link href="/signup" className="text-foreground/70 hover:text-foreground transition-colors duration-200">
          Crear una
        </Link>
      </p>
    </div>
  )
}
