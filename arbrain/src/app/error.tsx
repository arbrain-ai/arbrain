'use client'

/** Error dentro de una pantalla (el layout raíz sigue en pie). Página propia de Arbrain, no la de Next (21 oct 2026). */
import { useEffect } from 'react'
import { codigoDeError, MENSAJE_ERROR, PaginaError } from '@/components/PaginaError'
import { recargarSiHayVersionNueva, reportarErrorDePantalla } from '@/lib/desfase-version'

export default function ErrorDePantalla({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  // Tras un deploy, el error suele ser JS viejo contra el build nuevo: recargar lo cura sin que Daniel haga nada.
  useEffect(() => { console.error('[arbrain] error de pantalla', error); reportarErrorDePantalla(error, 'pantalla'); void recargarSiHayVersionNueva() }, [error])
  return <PaginaError titulo="Esta pantalla tuvo un problema" mensaje={MENSAJE_ERROR} codigo={codigoDeError(error)} limpiar />
}
