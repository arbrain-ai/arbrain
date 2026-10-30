import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {homedir} from 'node:os'
import {writeFile} from 'node:fs/promises'
const {chromium}=createRequire(resolve(homedir(),'Developer/software/sfbrowser/package.json'))('playwright')
const before=process.argv.includes('--before'),base=process.env.CLARITY_URL??'http://127.0.0.1:3218'
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}})
const measures=[]
await page.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort())
try{
 for(let i=0;i<3;i++){
  let start=Date.now();if(i===0)await page.goto(base+(before?'/youtube?tab=radar':'/youtube?tab=results'));else{await page.locator('aside a[href="/youtube"]').click();await page.getByRole(before?'button':'tab',{name:before?'Radar':'Resultados',exact:true}).click()}
  await page.getByText(before?'Top videos por SQL':'Lo que ya publicaste.',{exact:true}).waitFor()
  if(before)await page.getByText('Domina el 90% de Claude Code en 37 Minutos',{exact:true}).waitFor();else await page.locator('main a[href^="https://www.youtube.com/watch"]').first().waitFor()
  measures.push({round:i,readyMs:Date.now()-start})
  await page.locator('aside a[href="/ml-dashboard"]').click()
 }
 await writeFile(`docs/builds/arbrain-claridad-2026-09-13/evidence/latency-${before?'before':'after'}.json`,JSON.stringify({mode:'installed-production',base,viewport:[1440,1000],measures,limitation:'Both wait for a populated video row, same Chrome/viewport. Different payloads by design: old combined ranking versus new results-only. Cold navigation then two sidebar round-trips using client navigation; three samples, not a statistical benchmark.'},null,2))
 console.log(measures)
}finally{await browser.close()}
