'use client'

/**
 * Error que tumbó el layout raíz: Next reemplaza todo el documento, así que esta página trae su propio <html> y <body>.
 * PaginaError usa estilos en línea, no depende de globals.css (21 oct 2026).
 */
import { useEffect } from 'react'
import { codigoDeError, MENSAJE_ERROR, PaginaError } from '@/components/PaginaError'

export default function ErrorGlobal({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[arbrain] error global', error) }, [error])
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <PaginaError titulo="Arbrain tuvo un problema" mensaje={MENSAJE_ERROR} codigo={codigoDeError(error)} />
      </body>
    </html>
  )
}
