import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QuestionCards } from '../../src/features/chat/components/QuestionCard'
import type { QuestionPrompt } from '../../src/features/chat/hooks/useChat'
import '../../src/app/globals.css'

// Real QuestionCards under touch: a single-select answer must reach onAnswer
// on the first tap; multi-select confirms with "Responder"; skip answers null.
function Fixture() {
  const [calls, setCalls] = useState<string[]>([])
  const [prompts, setPrompts] = useState<QuestionPrompt[]>([
    { requestId: 'q-single', status: 'pending', questions: [{ question: '¿Qué fruta prefieres?', header: 'Fruta', options: [{ label: 'Manzana', description: 'Prefiero manzana' }, { label: 'Pera', description: 'Prefiero pera' }] }] },
    { requestId: 'q-multi', status: 'pending', questions: [{ question: '¿Qué colores?', header: 'Colores', multiSelect: true, options: [{ label: 'Rojo' }, { label: 'Azul' }] }] },
  ] as QuestionPrompt[])
  const onAnswer = async (requestId: string, answers: Record<string, string> | null) => {
    setCalls(previous => [...previous, `${requestId}:${answers ? JSON.stringify(answers) : 'null'}`])
    setPrompts(previous => previous.map(p => p.requestId === requestId ? { ...p, status: answers ? 'answered' : 'skipped', ...(answers ? { answers } : {}) } : p))
    return true
  }
  return <main className="p-3 bg-background text-foreground"><QuestionCards prompts={prompts} onAnswer={onAnswer} /><pre id="calls">{JSON.stringify(calls)}</pre></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
