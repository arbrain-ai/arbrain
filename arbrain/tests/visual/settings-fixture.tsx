import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useChatSettings } from '../../src/features/chat/hooks/useChatSettings'
function Fixture() {
  const [session, setSession] = useState('A')
  const [owner, setOwner] = useState('owner')
  const state = useChatSettings({ owner, sessionId: session, account: session === 'A' ? 'codex' : 'bro' })
  const other = useChatSettings({ owner, sessionId: 'R', account: 'codex' })
  const old = useRef(state.setCurrentModel)
  const boundB = useRef(state.bindStreamSettings({ owner: 'owner', account: 'bro', sessionId: 'B' }, () => true))
  const observable = (s: typeof state) => ({ model: s.currentModel, effort: s.currentEffort, ultracode: s.ultracode })
  return <main>
    <button onClick={() => setSession(session === 'A' ? 'B' : 'A')}>Switch conversation</button>
    <button onClick={() => setOwner('other')}>Switch owner</button>
    <button onClick={() => { state.setCurrentModel('claude-opus-test[1m]'); state.setCurrentEffort('xhigh'); state.setUltracode(true) }}>Live settings</button>
    <button onClick={() => state.setCurrentModel(null)}>Unknown model</button>
    <button onClick={() => old.current('old-A-model')}>Old callback</button>
    <button onClick={() => boundB.current.setCurrentModel('bound-B')}>Bound stream B</button>
    <output id="settings">{JSON.stringify(observable(state))}</output>
    <output id="other-settings">{JSON.stringify(observable(other))}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
