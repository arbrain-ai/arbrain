import React from 'react'
import {createRoot} from 'react-dom/client'
import {AudioButton} from '../../src/features/chat/components/AudioButton'
import {ChatSpeechBar} from '../../src/features/chat/components/ChatSpeechBar'
import {MarkdownMessage} from '../../src/features/chat/components/MarkdownMessage'
import {chatSpeech} from '../../src/features/chat/lib/chat-speech'

// SpeechSynthesis simulado: registra lo que "diría", nunca emite audio y termina cada
// frase a los 20 ms para que el lector avance solo de frase en frase y de párrafo en párrafo.
const dichas: string[] = []
const synth = window.speechSynthesis as unknown as Record<string, unknown>
synth.speak = (u: SpeechSynthesisUtterance) => { dichas.push(u.text); setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 20) }
synth.cancel = () => {}
;(window as unknown as {__dichas: string[]}).__dichas = dichas
;(window as unknown as {__chatSpeech: unknown}).__chatSpeech = chatSpeech

// Respuesta tipo de Levy: prosa, URL suelta, tabla GFM, tabla sin pintar, fuentes al final.
const MD = `## Resumen

El MRR subió en septiembre. Lo puedes ver en https://tu-sitio.example/finanzas cuando quieras.

| Mes | Ventas | Fuente |
|---|---|---|
| Agosto | 10 | https://polar.sh |
| Septiembre | 14 | https://polar.sh |

Lo importante es la retención.

https://supabase.com/dashboard/project/abc

- Primer punto de la lista.
- Segundo punto con un [enlace con texto](https://a.com).

**Fuentes principales:**

- [Polar, ventas](https://polar.sh/dashboard)
- https://supabase.com/dashboard
- Transcripción de la llamada del 1 oct`

function App() {
  return <main>
    <ChatSpeechBar/>
    <div data-msg-id="m-1">
      <div data-tts-content="m-1"><MarkdownMessage content={MD}/></div>
      <AudioButton messageId="m-1"/>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App/>)
