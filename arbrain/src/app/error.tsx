'use client'

/** Error dentro de una pantalla (el layout raíz sigue en pie). Página propia de Arbrain, no la de Next (21 oct 2026). */
import { useEffect } from 'react'
import { codigoDeError, MENSAJE_ERROR, PaginaError } from '@/components/PaginaError'

export default function ErrorDePantalla({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[arbrain] error de pantalla', error) }, [error])
  return <PaginaError titulo="Esta pantalla tuvo un problema" mensaje={MENSAJE_ERROR} codigo={codigoDeError(error)} />
}
