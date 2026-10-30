import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AudioButton} from '../../src/features/chat/components/AudioButton'
import {ChatSpeechBar} from '../../src/features/chat/components/ChatSpeechBar'
import {LectorPosicion} from '../../src/features/chat/components/LectorPosicion'
import {LazyMessage} from '../../src/features/chat/components/LazyMessage'
import {chatSpeech} from '../../src/features/chat/lib/chat-speech'

// SpeechSynthesis simulado: registra lo que "diría" y nunca emite audio.
const dichas: string[] = []
const synth = window.speechSynthesis as unknown as Record<string, unknown>
synth.speak = (u: SpeechSynthesisUtterance) => { dichas.push(u.text) }
synth.cancel = () => {}
;(window as unknown as {__dichas: string[]}).__dichas = dichas
;(window as unknown as {__chatSpeech: unknown}).__chatSpeech = chatSpeech

const parrafos = (tag: string, n: number, v = '') => Array.from({length: n}, (_, i) => `${tag}${v} párrafo ${i + 1}. Segunda frase del párrafo ${i + 1}.`)
// El contenido de B se puede "regenerar" desde la URL (?regen=1) para probar el cambio de mensaje.
const regen = new URLSearchParams(location.search).get('regen') ? ' REGENERADO' : ''
const SESIONES: Record<string, {id: string; texto: string[]}[]> = {
  A: [{id: 'a-1', texto: parrafos('A', 26)}],
  B: [{id: 'b-1', texto: parrafos('B', 8, regen)}, {id: 'b-2', texto: parrafos('B2', 5)}],
  C: [{id: 'c-1', texto: parrafos('C', 3)}],
}
function Mensaje({m, lazy}: {m: {id: string; texto: string[]}; lazy: boolean}) {
  const burbuja = <div><div data-tts-content={m.id}>{m.texto.map((t, i) => <p key={i}>{t}</p>)}</div><AudioButton messageId={m.id}/></div>
  return <div data-msg-id={m.id}>{lazy ? <LazyMessage text={m.texto.join(' ')}>{burbuja}</LazyMessage> : burbuja}</div>
}
function App() {
  const [sesion, setSesion] = useState(localStorage.getItem('qa-sesion') || 'A')
  const ir = (s: string) => { localStorage.setItem('qa-sesion', s); setSesion(s) }
  const msgs = SESIONES[sesion]
  return <main>
    <nav>{Object.keys(SESIONES).map(s => <button key={s} id={`ir-${s}`} onClick={() => ir(s)}>Conversación {s}</button>)}</nav>
    <h2 id="actual">{sesion}</h2>
    <ChatSpeechBar/>
    <LectorPosicion sessionId={sesion} messageIds={msgs.map(m => m.id)}/>
    {msgs.map((m, i) => <React.Fragment key={m.id}>
      {sesion === 'B' && i === 1 && <div style={{height: 6000}} aria-hidden/>}
      <Mensaje m={m} lazy={sesion === 'B' && i === 1}/>
    </React.Fragment>)}
  </main>
}
createRoot(document.getElementById('root')!).render(<App/>)
