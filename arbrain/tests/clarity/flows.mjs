import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {homedir} from 'node:os'
import {writeFile,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const {chromium}=createRequire(resolve(homedir(),'Developer/software/sfbrowser/package.json'))('playwright')
const base=process.env.CLARITY_URL??'http://127.0.0.1:3032'
const out='docs/builds/arbrain-claridad-2026-09-13/evidence'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Mexico_City'})
const errors=[],writes=[],requests=[]
page.on('pageerror',e=>errors.push(e.message))
let slow=false,fail=false
await page.route('**/*',async route=>{
 const r=route.request(),u=new URL(r.url());requests.push(u.pathname+u.search)
 if(!['GET','HEAD','OPTIONS'].includes(r.method())){writes.push(u.pathname);return route.abort()}
 if(u.pathname==='/api/clarity'&&u.searchParams.get('section')==='results'){
  if(slow)await new Promise(r=>setTimeout(r,1800))
  if(fail)return route.fulfill({status:503,json:{error:'Fallo de proveedor QA'}})
 }
 return route.continue()
})
try {
 const times={}
 await page.goto(base+'/todotask/hoy');await page.getByText('Meditar',{exact:true}).first().waitFor({timeout:60000});await page.screenshot({path:out+'/hoy-desktop.png'})
 let t=Date.now();await page.goto(base+'/ml-dashboard');await page.getByRole('heading',{name:'Lecturas para decidir'}).waitFor();await page.getByText('Morning briefing',{exact:true}).waitFor();await page.locator('[data-overview-ready="true"]').waitFor();times.commandCold=Date.now()-t
 await page.screenshot({path:out+'/command-desktop.png',fullPage:true})
 await page.getByRole('button',{name:/Revisión mensual/}).click();await page.getByRole('dialog').waitFor();await page.getByRole('link',{name:/Conversar con Levy/}).waitFor();await page.getByText('Abriendo lectura…',{exact:true}).waitFor({state:'hidden'})
 assert.match(await page.getByRole('link',{name:/Conversar con Levy/}).getAttribute('href'),/draft=/)
 await page.screenshot({path:out+'/briefing-desktop.png'})
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
 await page.goto(base+'/youtube?tab=results');await page.locator('main a[href^="https://www.youtube.com/watch"]').first().waitFor()
 await page.screenshot({path:out+'/results-desktop.png',fullPage:true});await page.locator('main').last().locator(':scope > div').last().evaluate(el=>{el.scrollTop=el.scrollHeight});await page.screenshot({path:out+'/results-bottom.png'});await page.locator('main').last().locator(':scope > div').last().evaluate(el=>{el.scrollTop=0})
 const title=await page.locator('main a[href^="https://www.youtube.com/watch"] strong').first().textContent()
 slow=true;t=Date.now();await page.getByRole('button',{name:'Actualizar videos'}).click();await page.waitForTimeout(250);assert.ok(await page.getByText(title,{exact:true}).isVisible());times.slowRefreshContentVisible=Date.now()-t
 await page.getByRole('button',{name:'Actualizar videos'}).waitFor({state:'visible'});await page.waitForTimeout(2300)
 fail=true;await page.getByRole('button',{name:'Actualizar videos'}).click();await page.getByRole('alert').waitFor();assert.ok(await page.getByText(title,{exact:true}).isVisible());fail=false;slow=false
 await page.getByRole('tab',{name:'Radar',exact:true}).click();await page.getByRole('heading',{name:'Fuera de tu burbuja.'}).waitFor();await page.locator('main a[href^="https://www.youtube.com/watch"]').first().waitFor();await page.screenshot({path:out+'/radar-desktop.png'});await page.locator('main').last().locator(':scope > div').last().evaluate(el=>{el.scrollTop=el.scrollHeight});await page.screenshot({path:out+'/radar-bottom.png'});await page.locator('main').last().locator(':scope > div').last().evaluate(el=>{el.scrollTop=0})
 t=Date.now();await page.getByRole('tab',{name:'Resultados',exact:true}).click();await page.getByText(title,{exact:true}).waitFor();times.resultsWarm=Date.now()-t
 await page.goBack();await page.getByRole('tab',{name:'Radar',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Radar',exact:true}).getAttribute('aria-selected'),'true')
 await page.getByRole('tab',{name:'Producción',exact:true}).click();await page.getByRole('heading',{name:'En curso',exact:true}).waitFor();await page.locator('[data-production-ready="true"]').waitFor({timeout:100000});await page.screenshot({path:out+'/production-desktop.png'})
 for(const route of ['/ml-dashboard','/youtube?tab=radar','/youtube?tab=results']){
  await page.goto(base+route);if(route.includes('ml-'))await page.locator('[data-overview-ready="true"]').waitFor();else await page.locator('main a[href^="https://www.youtube.com/watch"]').first().waitFor();await page.waitForTimeout(250)
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200)
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,route+' mobile overflow')
  await page.screenshot({path:out+'/'+(route.includes('ml-')?'command':route.split('=')[1])+'-mobile.png'})
  await page.keyboard.press('t');await page.screenshot({path:out+'/'+(route.includes('ml-')?'command':route.split('=')[1])+'-mobile-theme.png'})
  await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Meta+=');await page.keyboard.press('Meta+=');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await page.screenshot({path:out+'/'+(route.includes('ml-')?'command':route.split('=')[1])+'-zoom.png'});await page.keyboard.press('Meta+0')
 }
 assert.equal(writes.length,0,'QA must not send mutations');assert.deepEqual(errors,[])
 await writeFile(out+'/flows.json',JSON.stringify({times,writes,errors,requestCount:requests.length,providerFailureRetainsData:true,slowRefreshRetainsData:true,backNavigation:true,mobileAndZoom:true},null,2));console.log('PASS clarity flows',times)
}finally{await browser.close()}
