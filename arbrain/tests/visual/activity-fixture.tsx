import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThinkingBlock } from '../../src/features/chat/components/MarkdownMessage'
import '../../src/app/globals.css'
function Fixture() {
  const [streaming, setStreaming] = useState(true)
  const [waiting, setWaiting] = useState(false)
  const [text, setText] = useState('Reviso el estado de la conversación y preparo el resultado.')
  return <main className="min-h-dvh bg-background text-foreground p-5 font-sans">
    <h1 className="text-sm font-semibold mb-6">Actividad durante la respuesta</h1>
    <section data-fixture="activity"><ThinkingBlock text={text} streaming={streaming} waiting={waiting} label={waiting ? 'Esperando tu respuesta' : undefined} /></section>
    <p className="text-sm mt-5">El trabajo y su respuesta viven en la misma conversación.</p>
    <div className="mt-10 flex gap-3 flex-wrap">
      <button id="complete" onClick={() => { setStreaming(false); setWaiting(false) }}>Complete</button>
      <button id="wait" onClick={() => { setWaiting(true); setText('') }}>Wait</button>
      <button id="append" onClick={() => setText(value => value + '\nYa comprobé el contexto disponible.')}>Append</button>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
