import React from 'react'
import { createRoot } from 'react-dom/client'
import { SeccionModelo } from '../../src/features/modelo/SeccionModelo'
import { ContextoChip } from '../../src/features/chat/components/ContextoChip'
import { contextoDeConversacion } from '../../src/features/chat/lib/contexto-conversacion'
import '../../src/app/globals.css'

// Daemon simulado con las formas reales de /modelos/registro, /preferencias/motor y /models (2 oct 2026).
const registro = { version: 1, motorApi: true,
  proveedores: [{ id: 'openrouter', nombre: 'OpenRouter', wire: 'openai-responses', auth: { kind: 'api-key', variable: 'OPENROUTER_API_KEY', presente: true } }],
  rutas: [{ id: 'deepseek-v4.1-flash@openrouter', nombre: 'DeepSeek V4.1 Flash', modelId: 'deepseek/deepseek-v4.1-flash', proveedorId: 'openrouter', motor: 'codex-app-server', cuenta: 'deepseek', disponible: true, motivo: null, estado: 'experimental' }] }
let preferencia = { motor: null as string | null, modelo: null as string | null, esfuerzo: null as string | null }
const modelos: Record<string, unknown[]> = {
  default: [{ value: 'claude-opus-5-5[1m]', displayName: 'Opus 5.5', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] }, { value: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5', supportedEfforts: ['low', 'medium', 'high'] }],
  codex: [{ value: 'gpt-6-astra', displayName: 'GPT-6 Astra', supportedEfforts: ['low', 'medium', 'high', 'xhigh'] }],
  deepseek: [{ value: 'deepseek/deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', supportedEfforts: ['low', 'high', 'max'] }],
}
const real = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } })
  if (url.pathname === '/api/chat/modelos') return json(registro)
  if (url.pathname === '/api/chat/preferencia-motor') { if (init?.method === 'POST') preferencia = JSON.parse(String(init.body)); return json({ preferencia }) }
  if (url.pathname === '/api/chat/models') return json({ models: modelos[url.searchParams.get('account') ?? 'default'] ?? [] })
  return real(input, init)
}

function Fixture() {
  return <main className="min-h-dvh bg-background text-foreground p-4 sm:p-8">
    <div className="mx-auto max-w-2xl space-y-6">
      <SeccionModelo />
      <section className="solid-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground/85">Chat · contexto en la barra de escribir (formato único)</h2>
        <div><ContextoChip open={false} onToggle={() => {}} contexto={contextoDeConversacion([{ role: 'assistant', usage: { costUsd: 0, inputTokens: 18_000, outputTokens: 1_000, durationMs: 4200, contextUsed: 19_000, contextTotal: 1_000_000, model: 'deepseek/deepseek-v4.1-flash', effort: 'low' } }])} /></div>
        <div><ContextoChip open={false} onToggle={() => {}} contexto={contextoDeConversacion([{ role: 'assistant', usage: { costUsd: 0, inputTokens: 52_000, outputTokens: 3_000, durationMs: 9100, contextUsed: 120_000, contextTotal: 1_000_000, model: 'claude-opus-5-5[1m]', effort: 'xhigh' } }])} /></div>
        <div><ContextoChip open={false} onToggle={() => {}} contexto={contextoDeConversacion([{ role: 'assistant', usage: { costUsd: 0, inputTokens: 30_000, outputTokens: 900, durationMs: 3000, model: 'gpt-6-astra' } }])} /></div>
      </section>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
