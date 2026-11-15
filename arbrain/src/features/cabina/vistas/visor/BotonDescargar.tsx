'use client'
/**
 * «Descargar» del visor (12 nov 2026, Daniel: «me dejas un botón para "download" por si lo veo en la laptop o teléfono,
 * poderlo bajar al Finder y así lo descargo y luego lo miro desde el gym»). Baja el archivo ORIGINAL con su nombre por su
 * enlace firmado (lib/cabina/descarga-documento.ts), que el servidor manda como adjunto y en flujo.
 *
 *  · Navegador de la laptop: un `<a download>` de verdad; el archivo cae en Descargas.
 *  · iPhone (Safari o la PWA en pantalla de inicio): el mismo enlace; el adjunto hace que iOS ofrezca descargarlo (queda en
 *    Archivos › Descargas) o lo abra con la hoja de compartir para «Guardar en Archivos».
 *  · App de escritorio (Tauri): su WKWebView cancela las descargas (wry no trae manejador), así que se abre en el navegador
 *    del sistema, que lo baja a Descargas. Por eso el enlace no depende de la cookie: la firma es su permiso.
 *
 * Se pinta con la clase del botón vecino de cada barra (`className`): se ve como los demás.
 */
import type { CSSProperties, MouseEvent } from 'react'
import { Download } from 'lucide-react'
import { abrirEnNavegador } from '@/lib/navegador'
import { isDesktopRuntime } from '@/lib/local-first/runtime'
import { tr } from '@/shared/i18n'

function enEscritorio(e: MouseEvent, url: string) {
  if (!isDesktopRuntime()) return
  e.preventDefault()
  void abrirEnNavegador(new URL(url, window.location.origin).href)
}

export function BotonDescargar({ url, nombre, className, style, conTexto = false, tamano = 15 }: {
  url?: string; nombre: string; className?: string; style?: CSSProperties; conTexto?: boolean; tamano?: number
}) {
  if (!url) return null
  return <a href={url} download={nombre} rel="noopener noreferrer" className={className} style={style} data-descargar
    onClick={e => { e.stopPropagation(); enEscritorio(e, url) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
    aria-label={tr('Descargar {nombre}', { nombre })} title={tr('Descargar {nombre} (el original)', { nombre })}>
    <Download size={tamano} aria-hidden />{conTexto && <span>{tr('Descargar')}</span>}
  </a>
}
