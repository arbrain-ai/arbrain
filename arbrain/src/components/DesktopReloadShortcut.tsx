'use client'

import { useEffect } from 'react'
import { isDesktopRuntime } from '@/lib/local-first'
import { ActualizacionDesktop } from './ActualizacionDesktop'
import { MudanzaServidor } from './MudanzaServidor'

/**
 * Cmd+R / Ctrl+R recarga la página en la app de escritorio (Tauri), donde no
 * existe el atajo nativo del browser. En web no hace nada (el browser ya lo
 * maneja). Captura en fase capture para que ningún handler del canvas u otra
 * vista pueda tragárselo — funciona en cualquier sección/página.
 */
export function DesktopReloadShortcut() {
  useEffect(() => {
    if (!isDesktopRuntime()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        event.stopPropagation()
        window.location.reload()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // La detección de build nuevo y su aplicación segura viven en ActualizacionDesktop (4 oct 2026): antes
  // recargaba a ciegas tras 1 min sin tocar, incluso con un turno de Levy en pantalla.
  // MudanzaServidor (11 oct 2026): cuando el lado nativo cambia de servidor (embebido o Studio), lleva la ventana al
  // origen nuevo con su ruta, sus borradores y su fila.
  return <><ActualizacionDesktop /><MudanzaServidor /></>
}
