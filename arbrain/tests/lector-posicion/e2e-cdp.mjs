// QA del lector: Chrome headless por CDP contra fixture.tsx (voz simulada). Uso: node e2e-cdp.mjs
import {spawn} from 'node:child_process'
const URL0 = 'http://127.0.0.1:3351/index.html'
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--remote-debugging-port=9333','--user-data-dir=/tmp/lector-pos-qa-profile','--no-first-run','about:blank'],{stdio:'ignore'})
const sleep = ms => new Promise(r => setTimeout(r, ms))
let tabs
for (let i=0;i<40;i++){ try{ tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); if(tabs.length) break }catch{} await sleep(250) }
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>ws.onopen=r)
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))})
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value}
const nav=async u=>{await send('Page.navigate',{url:u}); await sleep(900)}
const out=[]; let fallos=0
const check=(nombre,cond,detalle='')=>{out.push(`${cond?'OK  ':'FALLA'} ${nombre}${detalle?'  → '+detalle:''}`); if(!cond) fallos++}
const barra=()=>ev(`(()=>{const s=window.__chatSpeech.getState();return {...s}})()`)
const contador=()=>ev(`(document.querySelector('[title="Párrafo"]')||{}).textContent||null`)
const play=()=>ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.querySelector('svg.lucide-play,svg.lucide-pause'));b.click()})()`)
const clickAudio=i=>ev(`document.querySelectorAll('button[aria-label^="Escuchar"]')[${i}].click()`)
const ir=s=>ev(`document.getElementById('ir-${s}').click()`)

await send('Page.enable')
await nav(URL0); await ev(`localStorage.clear()`); await nav(URL0)

// 1. Leer A, ir al párrafo 4 (flecha siguiente x3), cambiar de conversación mientras suena.
await clickAudio(0); await sleep(300)
let s=await barra(); check('A empieza leyendo 1/26', s.active&&s.idx===0&&s.total===26&&!s.paused, JSON.stringify(s))
for(let i=0;i<3;i++){ await ev(`window.__chatSpeech.next()`); await sleep(150) }
await ev(`window.__chatSpeech.cycleRate();window.__chatSpeech.cycleRate()`) // 1.5x
await sleep(300); s=await barra(); check('A en 4/26 a 1.5x sonando', s.idx===3&&s.rate===1.5&&!s.paused, JSON.stringify(s))
await ev(`window.__dichas.length=0`)
await ir('B'); await sleep(700)
s=await barra(); check('al cambiar a B el lector se suspende (sin barra, sin audio de fondo)', !s.active)
await sleep(800)
check('B no suena de fondo: cero utterances nuevas', (await ev(`window.__dichas.length`))===0)
check('se guardó el punto de A', (await ev(`JSON.parse(localStorage.getItem('arbrain:lector-posicion:v1')).A.idx`))===3)

// 2. Volver a A: barra en 4/26, pausada, sin sonar sola.
await ev(`window.__dichas.length=0`)
await ir('A'); await sleep(900)
s=await barra(); check('al volver a A la barra reaparece en 4/26, en pausa', s.active&&s.idx===3&&s.total===26&&s.paused&&s.rate===1.5, JSON.stringify(s))
check('contador visible «4/26»', (await contador()).trim()==='4/26', await contador())
check('no empezó sola', (await ev(`window.__dichas.length`))===0)
await play(); await sleep(400)
s=await barra(); check('play reanuda en el párrafo 4', !s.paused&&s.idx===3)
check('y habla el párrafo 4', (await ev(`window.__dichas.join('|')`)).includes('A párrafo 4'))

// 3. Recarga Cmd+R mientras suena.
await ev(`window.__chatSpeech.next()`); await sleep(1200)
await nav(URL0); await sleep(900)
s=await barra(); check('tras recargar la barra vuelve en 5/26, en pausa', s.active&&s.idx===4&&s.paused, JSON.stringify(s))
check('recarga: no suena sola', (await ev(`window.__dichas.length`))===0)

// 4. Mensaje regenerado: B con otro texto → inicio del mensaje. Primero leer B1 hasta 3/8.
await ir('B'); await sleep(700)
await clickAudio(0); await sleep(300); await ev(`window.__chatSpeech.next();window.__chatSpeech.next()`); await sleep(1200)
await nav(URL0+'?regen=1'); await sleep(1000)
s=await barra(); check('mensaje regenerado: vuelve al INICIO (1/8), no a un fragmento inválido', s.active&&s.idx===0&&s.total===8&&s.paused, JSON.stringify(s))

// 5. ✕ olvida; volver no restaura.
await ev(`window.__chatSpeech.stop()`)
await ir('C'); await sleep(300); await ir('B'); await sleep(900)
s=await barra(); check('tras ✕ no hay posición recordada', !s.active)

// 6. Mensaje diferido (LazyMessage, fuera de viewport): se materializa y restaura sin leer.
await ev(`window.scrollTo(0,0)`)
await ir('B'); await sleep(500)
await ev(`document.querySelectorAll('button[aria-label^="Escuchar"]')[0].click()`) // b-1
await sleep(200)
await ev(`window.__chatSpeech.suspend()`)
// fabrica una posición para b-2 (diferido) con huella real: léelo primero forzando scroll
await ev(`window.scrollTo(0,document.body.scrollHeight)`); await sleep(800)
const n=await ev(`document.querySelectorAll('button[aria-label^="Escuchar"]').length`)
await ev(`document.querySelectorAll('button[aria-label^="Escuchar"]')[${n-1}].click()`); await sleep(300)
await ev(`window.__chatSpeech.next();window.__chatSpeech.next()`); await sleep(1200)
await nav(URL0); await sleep(300); await ev(`window.scrollTo(0,0)`); await sleep(2500)
s=await barra(); check('mensaje diferido: la barra reaparece en 3/5 sin haber hecho scroll hasta él', s.active&&s.idx===2&&s.total===5&&s.paused, JSON.stringify(s))

console.log(out.join('\n')); console.log(fallos?`\n${fallos} FALLAS`:'\nTODO OK')
ws.close(); chrome.kill(); process.exit(fallos?1:0)
