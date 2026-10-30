import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThinkingBlock, MarkdownMessage } from '../../src/features/chat/components/MarkdownMessage'
import { EffortSlider, type EffortStop } from '../../src/features/chat/components/EffortSlider'
import type { ChatAccount } from '../../src/features/chat/stores/account-store'
import '../../src/app/globals.css'

// Actual production components, synthetic content, no auth/network/model calls.
// This is a component comparison fixture, not the full phone conversation UI.
function Fixture() {
  const [effort, setEffort] = useState<EffortStop>('xhigh')
  const [account, setAccount] = useState<ChatAccount>('codex')
  const [ultracode, setUltracode] = useState(false)
  const [selectedControl, setSelectedControl] = useState('')
  return <main className="min-h-dvh bg-background text-foreground p-5 font-sans">
    <h1 className="text-sm font-semibold mb-6">Arbrain · componentes reales</h1>
    <section data-fixture="thinking" className="mb-8">
      <p className="text-xs text-muted mb-3">Actividad durante la respuesta</p>
      <ThinkingBlock streaming text="Reviso el estado de la conversación y preparo el resultado." />
      <MarkdownMessage content="Estoy revisando la conversación. El trabajo continúa cuando cierras el teléfono." />
    </section>
    <section data-fixture="effort" className="relative mt-52">
      <EffortSlider effort={effort} ultracode={ultracode} account={account} onSelect={async value => {
        setSelectedControl(value)
        if (value === 'ultracode-on' || value === 'ultracode-off') { setUltracode(value === 'ultracode-on'); return }
        setEffort(value)
      }} onClose={() => {}} />
      <output id="selected-ultracode">{String(ultracode)}</output>
      <output id="selected-control">{selectedControl}</output>
      <output id="selected-effort">{effort}</output>
      <button id="switch-account" onClick={() => setAccount(account === 'codex' ? 'bro' : 'codex')}>Switch account</button>
    </section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
