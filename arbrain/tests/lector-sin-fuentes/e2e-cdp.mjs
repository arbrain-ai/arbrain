// QA del lector sin fuentes/tablas/URLs: Chrome headless por CDP contra fixture.tsx (markdown
// real del chat, voz simulada). Uso:
//   npx esbuild tests/lector-sin-fuentes/fixture.tsx --bundle --outfile=tests/lector-sin-fuentes/fixture.js --alias:@=./src --jsx=automatic --loader:.css=css --define:process.env.NODE_ENV='"production"' --define:process.env='{}'
//   (cd tests/lector-sin-fuentes && python3 -m http.server 3352) & node tests/lector-sin-fuentes/e2e-cdp.mjs
import {spawn} from 'node:child_process'
const URL0 = 'http://127.0.0.1:3352/index.html'
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new','--remote-debugging-port=9334','--user-data-dir=/tmp/lector-sin-fuentes-qa','--no-first-run','about:blank'],{stdio:'ignore'})
const sleep = ms => new Promise(r => setTimeout(r, ms))
let tabs
for (let i=0;i<40;i++){ try{ tabs = await (await fetch('http://127.0.0.1:9334/json')).json(); if(tabs.length) break }catch{} await sleep(250) }
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>ws.onopen=r)
let id=0; const pend=new Map()
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))})
const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value}
const out=[]; let fallos=0
const check=(nombre,cond,detalle='')=>{out.push(`${cond?'OK  ':'FALLA'} ${nombre}${detalle?'  → '+detalle:''}`); if(!cond) fallos++}

await send('Page.enable')
await send('Page.navigate',{url:URL0}); await sleep(1500)
await ev(`localStorage.clear()`)
// Párrafos que el lector contaba ANTES (misma selección de hojas, sin filtro).
const antes = await ev(`(()=>{const c=[...document.querySelectorAll('[data-tts-content] :is(p,li,h1,h2,h3,h4,blockquote)')];const s=new Set(c);return c.filter(e=>e.innerText.trim()&&![...e.querySelectorAll('p,li,h1,h2,h3,h4,blockquote')].some(d=>s.has(d))).length})()`)
check('la pantalla sigue mostrando tabla, URL y fuentes', await ev(`(()=>{const t=document.querySelector('[data-tts-content]').innerText;return !!document.querySelector('[data-tts-content] table')&&t.includes('Fuentes principales')&&t.includes('https://supabase.com/dashboard/project/abc')})()`))
let s = await ev(`(()=>{document.querySelector('button[aria-label^="Escuchar"]').click();return {...window.__chatSpeech.getState()}})()`)
check('el total baja: solo cuentan los párrafos hablables', s.active && s.total===5 && antes>s.total, `antes ${antes}, ahora ${s.total}`)
// Deja que lea el mensaje completo solo (la voz simulada termina cada frase) hasta que se cierra.
for (let i=0;i<60 && (await ev(`window.__chatSpeech.getState().active`));i++) await sleep(250)
check('termina el mensaje solo', !(await ev(`window.__chatSpeech.getState().active`)))
const dicho = await ev(`window.__dichas.join(' | ')`)
check('lee la prosa', /Resumen/.test(dicho) && /MRR subió/.test(dicho) && /retención/.test(dicho) && /Segundo punto con un enlace con texto/.test(dicho), dicho.slice(0,300))
check('no lee URLs sueltas (ni «un enlace»)', !/https?|arbrain\.ai|supabase\.com|polar\.sh|un enlace(?! con)/.test(dicho))
check('no lee la tabla', !/Agosto|Septiembre|Ventas/.test(dicho))
check('se detiene antes de las fuentes', !/Fuentes|Polar, ventas|Transcripción/.test(dicho))
check('la prosa con URL dentro se oye entera menos la URL', /Lo puedes ver en\s+cuando quieras/.test(dicho))
console.log(out.join('\n')); console.log('\nDICHO: '+dicho); console.log(fallos?`\n${fallos} FALLAS`:'\nTODO OK')
ws.close(); chrome.kill(); process.exit(fallos?1:0)
