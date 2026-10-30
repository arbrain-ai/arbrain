'use client'

/**
 * Página de error propia de Arbrain (21 oct 2026, a raíz del reporte de un usuario). Sin ella, un error o una
 * ruta inexistente mostraba la página por defecto de Next, que parece de Vercel y no dice qué hacer. La usan
 * `app/error.tsx`, `app/global-error.tsx` y `app/not-found.tsx`, en las dos ediciones (original y cliente).
 *
 * Estilos en línea con las variables de marca y sus valores de respaldo: en `global-error` el layout raíz no existe y la
 * hoja de estilos puede no haber cargado; la página tiene que verse igual de digna.
 */
import type { CSSProperties } from 'react'

export interface PaginaErrorProps {
  titulo: string
  mensaje: string
  /** Código para reportar: el `digest` de Next (errores del servidor) o un texto corto. */
  codigo?: string | null
  /** «Recargar». Por defecto recarga la página entera (lo más robusto tras un error). */
  alRecargar?: () => void
  /** Sin botón «Recargar» (p. ej. en «no existe»: recargar no la hace aparecer). */
  sinRecargar?: boolean
}

const S: Record<string, CSSProperties> = {
  fondo: {
    minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px', margin: 0,
    background: 'var(--background, #f4f4f5)', color: 'var(--foreground, #0f172a)',
    fontFamily: 'var(--font-inter, ui-sans-serif), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  tarjeta: {
    width: '100%', maxWidth: '440px', padding: '32px', borderRadius: '20px', textAlign: 'center',
    background: 'var(--card, #ffffff)', border: '1px solid var(--border, #e4e4e7)',
    boxShadow: 'var(--shadow-md, 0 10px 30px rgba(15, 23, 42, 0.08))',
  },
  marca: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--brand-ink, #8C27F1)', margin: 0 },
  titulo: { fontSize: '20px', fontWeight: 600, letterSpacing: '-0.01em', margin: '12px 0 0' },
  mensaje: { fontSize: '14px', lineHeight: 1.6, color: 'var(--muted, #64748b)', margin: '12px 0 0' },
  acciones: { display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: '24px' },
  boton: {
    border: 'none', borderRadius: '12px', padding: '9px 18px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
    background: 'var(--brand, #8C27F1)', color: '#ffffff', fontFamily: 'inherit',
  },
  enlace: { fontSize: '14px', fontWeight: 500, color: 'var(--brand-ink, #8C27F1)', textDecoration: 'none' },
  codigo: { fontSize: '11px', color: 'var(--muted, #64748b)', margin: '24px 0 0', wordBreak: 'break-all', fontFamily: 'var(--font-jetbrains-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace' },
}

export function PaginaError({ titulo, mensaje, codigo, alRecargar, sinRecargar = false }: PaginaErrorProps) {
  const recargar = alRecargar ?? (() => window.location.reload())
  return (
    <main style={S.fondo} data-pagina-error>
      <div style={S.tarjeta} role="alert">
        <p style={S.marca}>Arbrain</p>
        <h1 style={S.titulo}>{titulo}</h1>
        <p style={S.mensaje}>{mensaje}</p>
        <div style={S.acciones}>
          {!sinRecargar && <button type="button" style={S.boton} onClick={recargar}>Recargar</button>}
          {/* <a> y no <Link>: tras un error conviene una carga completa, sin el estado que falló. */}
          <a href="/" style={S.enlace}>Ir al inicio</a>
        </div>
        {codigo && <p style={S.codigo}>Código para reportar: {codigo}</p>}
      </div>
    </main>
  )
}

/** Código visible para el alumno: el digest de Next o, en errores del navegador (sin digest), el nombre y el mensaje recortado. */
export function codigoDeError(error: (Error & { digest?: string }) | null | undefined): string | null {
  if (!error) return null
  if (error.digest) return error.digest
  const texto = `${error.name || 'Error'}${error.message ? `: ${error.message}` : ''}`
  return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto
}

export const MENSAJE_ERROR = 'Algo falló al mostrar esta pantalla. Recarga la página; si vuelve a pasar, comparte el código de abajo para que lo revisemos.'
