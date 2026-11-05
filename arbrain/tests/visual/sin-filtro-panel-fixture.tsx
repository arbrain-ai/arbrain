import React from 'react'
import { createRoot } from 'react-dom/client'
import { PanelSinFiltro } from '../../src/features/primer-arranque/components/PanelSinFiltro'
import '../../src/app/globals.css'

// Ajustes › Sin filtro (v0.2.23) con un llavero simulado: ?guardada=1 pinta el estado con la llave puesta.
const guardada = new URLSearchParams(location.search).get('guardada') === '1'
const estado = { llaves: [{ nombre: 'ANTHROPIC_API_KEY', presente: true, vista: 'sk-ant-…a1B2' }, { nombre: 'ABLITERATION_AI_API_KEY', presente: guardada, vista: guardada ? 'ak_…wxyz' : null }], listo: true, almacen: 'archivo-local', disponible: true, error: null }
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke: async (cmd: string) => cmd === 'llaves_estado' ? estado : cmd === 'daemon_estado' ? { ready: true } : null }
createRoot(document.getElementById('root')!).render(
  <main className="min-h-dvh bg-background p-8 text-foreground"><div className="mx-auto max-w-[640px]"><h2 className="mb-4 text-lg font-semibold">Sin filtro</h2><PanelSinFiltro /></div></main>,
)
