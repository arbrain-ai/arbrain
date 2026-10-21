import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '../../src/features/chat/hooks/useChat'
import { ChatDraftStatus } from '../../src/features/chat/components/ChatDraftStatus'
import { invalidateSelection } from '../../src/features/chat/lib/selection-cache'

// Browser fixture only: no request reaches a real account or an AI engine.
let fail = false
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin)
  if (!url.pathname.startsWith('/api/')) throw new Error('Fixture only supports mocked APIs')
  const body = init?.body ? JSON.parse(String(init.body)) : {}
  if (url.pathname === '/api/chat/selection') {
    await delay(800)
    return Response.json({ intent: { version: 1, owner: 'fixture-owner', account: 'codex', conversationId: url.searchParams.get('session'), model: 'gpt-6-astra', effort: 'xhigh', fast: false, ultracode: false, observedAt: new Date().toISOString() } })
  }
  if (url.pathname === '/api/chat/stream') {
    await delay(2000)
    if (fail) return Response.json({ error: 'Error de red simulado para verificar recuperación' }, { status: 503 })
    const events = [
      { type: 'resume_meta', protocol: 'durable-v1', turnId: body.turnId, userMessage: body.message },
      { type: 'text_delta', text: 'Respuesta de prueba recibida.' },
      { type: 'result', text: 'Respuesta de prueba recibida.' },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  }
  if (url.pathname === '/api/chat/live') return Response.json({ live: false })
  return Response.json({ sessions: [], models: [] })
}

function SendFixture() {
  const chat = useChat({ sessionId: 'send-fixture', account: 'codex', onSave: async () => {} })
  const [check, setCheck] = useState('Preparado')
  const [text, setText] = useState('Mi mensaje debe aparecer al instante')
  useEffect(() => { chat.clearMessages() }, [chat.clearMessages])
  const send = async (cold: boolean, failure: boolean) => {
    fail = failure
    if (cold) invalidateSelection({ localOwner: 'fixture-owner', account: 'codex', conversationId: 'send-fixture' })
    const message = text
    setText('')
    setCheck('Verificando…')
    let flashes = 0
    const observer = new MutationObserver(() => { if (document.querySelector('[data-draft-status]')) flashes++ })
    observer.observe(document.getElementById('recovery')!, { childList: true, subtree: true })
    const sent = chat.sendMessage(message, { chatSessionId: 'send-fixture', account: 'codex' })
    await new Promise(requestAnimationFrame)
    const immediate = document.querySelector('[data-user-message]')?.textContent === message
    await sent
    await delay(200)
    observer.disconnect()
    setCheck(JSON.stringify({ immediate, normalSendRecoveryFlashes: flashes, failureScenario: failure, passed: immediate && (failure || flashes === 0) }))
  }
  return <main className="mx-auto max-w-xl p-5 font-sans">
    <h1 className="mb-6 text-xl font-semibold">Levy · prueba aislada del envío</h1>
    <div className="min-h-48 space-y-4">{chat.messages.map(message => <div key={message.id}
      data-user-message={message.role === 'user' ? '' : undefined}
      className={message.role === 'user' ? 'ml-10 rounded-2xl bg-card p-4' : 'p-4'}>
      {message.content || (message.streaming ? 'Preparando respuesta…' : '')}
    </div>)}</div>
    <div id="recovery"><ChatDraftStatus owner="fixture-owner" account="codex" conversationId="send-fixture"
      sendingTurnId={chat.loading ? chat.messages.findLast(message => message.role === 'assistant' && message.streaming)?.metadata?.turnId : null}
      onAccepted={(id, account) => { void chat.resumeStream(id, account) }} /></div>
    <input aria-label="Mensaje" className="my-4 w-full rounded-xl border p-3" value={text} onChange={event => setText(event.target.value)} />
    <div className="flex flex-wrap gap-2">{[
      ['Enviar normal', false, false], ['Enviar con ajustes por cargar', true, false], ['Simular fallo', false, true],
    ].map(([label, cold, failure]) => <button key={String(label)} disabled={chat.loading} className="rounded-xl border p-3" onClick={() => void send(Boolean(cold), Boolean(failure))}>{label}</button>)}</div>
    <output className="mt-6 block break-words" id="result">{check}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<SendFixture />)
