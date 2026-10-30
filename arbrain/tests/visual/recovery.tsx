import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '../../src/features/chat/hooks/useChat'
import { useChatHistory } from '../../src/features/chat/hooks/useChatHistory'
import { ChatDraftStatus } from '../../src/features/chat/components/ChatDraftStatus'
import { listSyncQueue, syncNow, queueChatPrompt, cacheSnapshot, cancelQueuedChat } from '../../src/lib/local-first'
import { markSyncQueueItem } from '../../src/lib/local-first/browser-store'
import '../../src/app/globals.css'

// Real hook with an observable render surface. API responses are supplied only
// by the browser test; no test route or credentials are added to production.
function RecoveryFixture() {
  const [saves, setSaves] = useState(0)
  const [viewSession, setViewSession] = useState('chat')
  const chat = useChat({ sessionId: viewSession, account: viewSession === 'settings-B' ? 'bro' : 'codex', onSave: async () => { setSaves(n => n + 1) } })
  const history = useChatHistory('codex')
  const [queue, setQueue] = useState<unknown[]>([])
  const [attached, setAttached] = useState<boolean | null>(null)
  const refreshQueue = async () => setQueue(await listSyncQueue())
  useEffect(() => {
    const changed = () => { void listSyncQueue().then(setQueue) }
    window.addEventListener('mission-control-local-first:changed', changed)
    return () => window.removeEventListener('mission-control-local-first:changed', changed)
  }, [])
  useEffect(() => {
    chat.loadMessages([
      { id: 'saved-user', role: 'user', content: 'hello', created_at: '2026-09-06T10:00:00Z', metadata: { turnId: 'turn' } },
      { id: 'saved-assistant', role: 'assistant', content: 'old partial', created_at: '2026-09-06T10:00:01Z', metadata: { turnId: 'turn' } },
    ])
  }, [chat.loadMessages])
  return <main>
    <ChatDraftStatus key={viewSession} owner="fixture-owner" account={viewSession === 'settings-B' ? 'bro' : 'codex'} conversationId={viewSession} onAccepted={(id, account) => { void chat.resumeStream(id, account) }} />
    <button onClick={() => { setViewSession('settings-B'); void chat.resumeStream('settings-B', 'bro') }}>Switch settings session and resume</button>
    <output id="live-settings">{JSON.stringify({ model: chat.currentModel, effort: chat.currentEffort, ultracode: chat.ultracode })}</output>
    <button onClick={() => void chat.resumeStream('chat').then(setAttached)}>Recover</button>
    <button onClick={() => chat.appendMessage({ id: 'realtime-db-id', role: 'assistant', content: 'restored tail', timestamp: new Date(), metadata: { turnId: 'turn', terminalStatus: 'completed' } })}>Realtime completion</button>
    <button onClick={() => void chat.sendMessage('offline prompt', { chatSessionId: 'chat', account: 'codex', effort: 'xhigh', context: 'retained context', imageUrl: 'https://fixture.invalid/image.png' }).then(refreshQueue)}>Send existing offline</button>
    <button onClick={() => void chat.sendMessage('unknown prompt', { chatSessionId: 'chat', account: 'codex', context: 'retained context', imageUrl: 'https://fixture.invalid/image.png' }).then(refreshQueue)}>Send with unknown selection</button>
    <button onClick={() => void chat.sendMessage('plain prompt', { chatSessionId: 'chat', account: 'codex' }).then(refreshQueue)}>Send plain</button>
    <button onClick={() => void chat.sendMessage('/effort high', { chatSessionId: 'chat', account: 'codex' })}>Command on chat</button>
    <button onClick={() => void chat.pauseStreaming()}>Stop current</button>
    <button onClick={() => void chat.stopStreaming()}>Escape current</button>
    <button onClick={() => chat.detachStream()}>Detach current</button>
    <button onClick={() => void chat.sendMessage('second submission', { chatSessionId: 'chat-B', account: 'codex' }).then(refreshQueue)}>Send B</button>
    <button onClick={() => void chat.sendMessage('/effort high', { chatSessionId: '11111111-1111-4111-8111-111111111111', createConversation: true, account: 'codex' })}>Command on local conversation</button>
    <button onClick={() => {
      const submission = chat.sendMessage('cancelled before dispatch', { chatSessionId: 'chat', account: 'codex' })
      void chat.pauseStreaming()
      void submission.then(refreshQueue)
    }}>Send then cancel immediately</button>
    <button onClick={() => void chat.sendMessage('new offline prompt', { sessionPromise: history.createSession('new offline prompt'), account: 'codex', effort: 'xhigh' }).then(refreshQueue)}>Send new offline</button>
    <button onClick={() => void syncNow().then(refreshQueue)}>Replay queue</button>
    <button onClick={() => void (async () => {
      for (const turnId of ['queued-A', 'queued-B']) await queueChatPrompt({ prompt: turnId, localContext: { chatEnvelope: { version: 1, expectedOwnerId: 'fixture-owner', chatSessionId: 'chat', turnId, account: 'codex', message: turnId, source: 'desktop' } } })
      await refreshQueue()
    })()}>Seed replay race</button>
    <input id="cancel-turn" aria-label="Cancel turn" />
    <button onClick={() => void (async () => {
      const turnId = (document.getElementById('cancel-turn') as HTMLInputElement).value
      const item = (await listSyncQueue()).find(item => JSON.parse(item.payloadJson).localContext?.chatEnvelope?.turnId === turnId)
      if (item) await cancelQueuedChat(item.id)
      await refreshQueue()
    })()}>Cancel queued turn</button>
    <button onClick={() => void Promise.all(Array.from({ length: 20 }, (_, n) => Promise.all([
      queueChatPrompt({ prompt: `concurrent-${n}`, localContext: { context: 'legacy fixture, never delivered' } }),
      cacheSnapshot('chat', `fixture:${n}`, { value: n }),
    ]))).then(refreshQueue)}>Stress local queue</button>
    <button onClick={() => void (async () => {
      const item = (await listSyncQueue())[0]
      await markSyncQueueItem({ id: item.id, status: 'synced' })
      await markSyncQueueItem({ id: item.id, status: 'failed', lastError: 'late failed observer' })
      await refreshQueue()
    })()}>Late queue failure</button>
    <pre id="queue">{JSON.stringify(queue)}</pre>
    <output id="saves">{saves}</output>
    <output id="loading">{String(chat.loading)}</output>
    <output id="connection">{chat.connection}</output>
    <output id="attached">{String(attached)}</output>
    <pre id="state">{JSON.stringify(chat.messages)}</pre>
  </main>
}
createRoot(document.getElementById('root')!).render(<RecoveryFixture />)
