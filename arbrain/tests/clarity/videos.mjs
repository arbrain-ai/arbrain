import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {homedir} from 'node:os'
import {resolve as resolverRuta} from 'node:path'
// Script manual: SFBROWSER_PACKAGE = ruta al package.json de un proyecto que trae playwright (obligatoria).
const {chromium}=createRequire(process.env.SFBROWSER_PACKAGE??(()=>{throw new Error('Define SFBROWSER_PACKAGE (package.json con playwright).')})())('playwright')
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Mexico_City'})
const base=process.env.CLARITY_URL??'http://127.0.0.1:3032',out='docs/builds/arbrain-claridad-2026-09-13/video-followup',errors=[],writes=[]
p.on('pageerror',e=>errors.push(e.message))
await p.route('**/*',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){writes.push(r.request().url());return r.abort()}return r.continue()})
try{
 for(const tab of ['radar','results']){
  await p.goto(base+'/youtube?tab='+tab)
  await p.waitForFunction(()=>{const imgs=[...document.querySelectorAll('main img')].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0);return imgs.length>0&&imgs.every(i=>i.complete&&i.naturalWidth>0)})
  await p.screenshot({path:out+'/'+tab+'-desktop.png'})
  await p.getByLabel('Ordenar videos').selectOption('views')
  assert.equal(await p.getByLabel('Ordenar videos').inputValue(),'views')
  await p.getByLabel('Ordenar videos').selectOption('recent')
 }
 await p.getByRole('button',{name:'Ver embudo',exact:true}).first().click();await p.getByRole('dialog',{name:'Embudo del video'}).waitFor()
 await p.getByText('Clics en el enlace',{exact:true}).waitFor()
 await p.screenshot({path:out+'/funnel-desktop.png'})
 await p.getByLabel('Período del embudo').selectOption('7');await p.getByText('Clics en el enlace',{exact:true}).waitFor()
 await p.keyboard.press('Escape');await p.getByRole('dialog').waitFor({state:'hidden'})
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/results-mobile.png'})
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
 await p.getByRole('button',{name:'Ver embudo',exact:true}).first().click();await p.getByText('Clics en el enlace',{exact:true}).waitFor();await p.screenshot({path:out+'/funnel-mobile.png'})
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 await writeFile(out+'/verification.json',JSON.stringify({realThumbnails:true,sort:true,funnelPeriodSwitch:true,mobile:true,errors,writes},null,2));console.log('PASS real thumbnails, sorting, funnel, period switch, mobile, no writes')
}finally{await b.close()}
