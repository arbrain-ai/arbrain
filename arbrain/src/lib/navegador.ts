import { isDesktopRuntime } from '@/lib/local-first/runtime'

/**
 * Abre una URL de fuera en el navegador predeterminado del sistema.
 * En la app de escritorio (Tauri) `window.open` no hace nada: el WKWebView ignora ventanas nuevas. Ahí va por el opener
 * de Tauri (`plugin:opener|open_url`, permitido por `opener:default` en capabilities/original-local.json), el mismo
 * camino que ya usan el panel derecho, el Taller y Seguridad. En la web, `window.open` con `noopener`.
 */
export async function abrirEnNavegador(url: string) {
  if (isDesktopRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:opener|open_url', { url })
      return
    } catch (error) { console.error('[navegador] opener no respondió, uso window.open', error) }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
