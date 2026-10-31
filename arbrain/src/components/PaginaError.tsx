'use client'

/**
 * Página de error propia de Arbrain (21 oct 2026, a raíz del reporte de un usuario). Sin ella, un error o una
 * ruta inexistente mostraba la página por defecto de Next, que parece de Vercel y no dice qué hacer. La usan
 * `app/error.tsx`, `app/global-error.tsx` y `app/not-found.tsx`, en las dos ediciones (original y cliente).
 *
 * Estilos en línea con las variables de marca y sus valores de respaldo: en `global-error` el layout raíz no existe y la
 * hoja de estilos puede no haber cargado; la página tiene que verse igual de digna.
 * 31 oct 2026 (Daniel: «Los botones planos y el uso de colores no me encanta»): el material de la bienvenida vía
 * `PantallaSistema` (oscuro por defecto, «Recargar» es la tecla ámbar del enviar, «Ir al inicio» la tapa sin luz).
 */
import type { CSSProperties } from 'react'
import { RotateCw } from 'lucide-react'
import { salirLimpio } from '@/lib/estado-local'
import { PantallaSistema } from './PantallaSistema'

export interface PaginaErrorProps {
  titulo: string
  mensaje: string
  /** Código para reportar: el `digest` de Next (errores del servidor) o un texto corto. */
  codigo?: string | null
  /** «Recargar». Por defecto recarga la página entera (lo más robusto tras un error). */
  alRecargar?: () => void
  /** Sin botón «Recargar» (p. ej. en «no existe»: recargar no la hace aparecer). */
  sinRecargar?: boolean
  /**
   * Errores (no «no existe»): «Recargar» e «Ir al inicio» tiran antes el estado de vista que guardó el navegador
   * (lib/estado-local.ts). Sin esto, una pantalla que truena por un estado viejo vuelve a tronar en cada carga (31 oct 2026).
   */
  limpiar?: boolean
}

const S: Record<string, CSSProperties> = {
  fondo: {
    minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px', margin: 0, boxSizing: 'border-box',
    fontFamily: 'var(--font-inter, ui-sans-serif), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  tarjeta: {
    width: '100%', maxWidth: '440px', padding: '32px', borderRadius: '20px', textAlign: 'center', boxSizing: 'border-box',
  },
  marca: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ps-marca)', margin: 0 },
  titulo: { fontSize: '20px', fontWeight: 600, letterSpacing: '-0.01em', margin: '12px 0 0' },
  mensaje: { fontSize: '14px', lineHeight: 1.6, color: 'var(--ps-tenue)', margin: '12px 0 0' },
  acciones: { display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: '24px' },
  nota: { fontSize: '12px', lineHeight: 1.5, color: 'var(--ps-tenue)', margin: '16px 0 0' },
  codigo: { fontSize: '11px', lineHeight: 1.6, color: 'var(--ps-tenue)', margin: '24px 0 0', overflowWrap: 'anywhere', fontFamily: 'var(--font-jetbrains-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace' },
}

export function PaginaError({ titulo, mensaje, codigo, alRecargar, sinRecargar = false, limpiar = false }: PaginaErrorProps) {
  const recargar = alRecargar ?? (limpiar ? () => void salirLimpio(false) : () => window.location.reload())
  return (
    <PantallaSistema style={S.fondo} data-pagina-error>
      <div style={S.tarjeta} className="ps-placa" role="alert">
        <p style={S.marca}>Arbrain</p>
        <h1 style={S.titulo}>{titulo}</h1>
        <p style={S.mensaje}>{mensaje}</p>
        <div style={S.acciones}>
          {!sinRecargar && <button type="button" className="ps-tecla" onClick={recargar}><RotateCw aria-hidden />Recargar</button>}
          {/* <a> y no <Link>: tras un error conviene una carga completa, sin el estado que falló. */}
          {/* Sin «Recargar», el inicio es LA acción y lleva la tecla ámbar; con él, es la salida discreta. */}
          <a href="/" className={sinRecargar ? 'ps-tecla' : 'ps-discreta'} onClick={limpiar ? (e) => { e.preventDefault(); void salirLimpio(true) } : undefined}>Ir al inicio</a>
        </div>
        {limpiar && <p style={S.nota}>{NOTA_LIMPIAR}</p>}
        {codigo && <p style={S.codigo} className="ps-codigo">Código para reportar: {codigo}</p>}
      </div>
    </PantallaSistema>
  )
}

/** Código visible para el alumno: el digest de Next o, en errores del navegador (sin digest), el nombre y el mensaje recortado. */
export function codigoDeError(error: (Error & { digest?: string }) | null | undefined): string | null {
  if (!error) return null
  if (error.digest) return error.digest
  const texto = `${error.name || 'Error'}${error.message ? `: ${error.message}` : ''}`
  return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto
}

/** Lo que hace «Recargar» en una pantalla de error, dicho a la persona (que no tema perder algo). */
export const NOTA_LIMPIAR = 'Recargar limpia lo que la app recordaba de esta vista (paneles y última conversación abierta). Tus conversaciones, borradores y archivos no se tocan.'

export const MENSAJE_ERROR = 'Algo falló al mostrar esta pantalla. Recarga la página; si vuelve a pasar, comparte el código de abajo para que lo revisemos.'
