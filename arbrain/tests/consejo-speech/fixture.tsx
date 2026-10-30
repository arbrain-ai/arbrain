import React, {useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import {AudioButton} from '../../src/features/chat/components/AudioButton'
import {chatSpeech} from '../../src/features/chat/lib/chat-speech'
function App(){const state=useSyncExternalStore(cb=>chatSpeech.subscribe(cb),()=>chatSpeech.getState());return <main><h1>Prueba del lector real de Consejo con salida de voz simulada</h1><div data-tts-content="qa-selection"><p>Primera frase completa.</p><p id="excerpt">Sólo esta selección.</p><p>Última frase completa.</p></div><button onClick={()=>{const s=window.getSelection();const r=document.createRange();r.selectNodeContents(document.getElementById('excerpt')!);s?.removeAllRanges();s?.addRange(r)}}>Seleccionar segunda frase</button><AudioButton messageId="qa-selection" label="QA" selectionEnabled/><button onClick={()=>{chatSpeech.stop();window.getSelection()?.removeAllRanges()}}>Restablecer</button><pre aria-label="Estado del lector">{JSON.stringify(state)}</pre><output id="spoken" aria-label="Texto enviado a voz"/></main>}
createRoot(document.getElementById('root')!).render(<App/>);
