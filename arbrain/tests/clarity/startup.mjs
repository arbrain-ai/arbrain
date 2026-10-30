import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {resolve as resolverRuta} from 'node:path'
// Script manual: SFBROWSER_PACKAGE = ruta al package.json de un proyecto que trae playwright (obligatoria).
const {chromium}=createRequire(process.env.SFBROWSER_PACKAGE??(()=>{throw new Error('Define SFBROWSER_PACKAGE (package.json con playwright).')})())('playwright')
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage()
const legacy=['/api/analytics/business','/api/analytics/ml','/api/analytics/intel','/api/comments/queue','/api/comments/leads','/api/cron','/api/analytics/polar'],calls=[]
await page.route('**/*',route=>{
 const req=route.request(),u=new URL(req.url())
 if(!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort()
 if(legacy.includes(u.pathname)){calls.push(u.pathname);return route.fulfill({json:{}})}
 if(u.pathname==='/api/local-first/pull')return route.fulfill({json:{tasks:[],events:[],drawings:[],snapshots:{},errors:[]}})
 if(u.pathname==='/api/clarity')return route.fulfill({json:{ownerId:'qa',billing:null,briefs:[],issues:[],loadedAt:new Date().toISOString()}})
 return route.continue()
})
try{
 await page.goto((process.env.CLARITY_URL??'http://127.0.0.1:3032')+'/ml-dashboard')
 await page.waitForFunction(()=>Number(localStorage.getItem('mission-control:last-mirror-pull'))>0)
 assert.equal(calls.length,0,'Startup must not fetch hidden analytics')
 await page.getByRole('button',{name:'Arbrain runtime status',exact:true}).click();await page.getByRole('button',{name:'Pull Local Mirror',exact:true}).click()
 await page.waitForFunction(()=>document.body.innerText.includes('Mirror ready:'))
 assert.deepEqual([...new Set(calls)].sort(),legacy.sort())
 await writeFile('docs/builds/arbrain-claridad-2026-09-13/evidence/startup.json',JSON.stringify({automaticHiddenAnalytics:0,manualTargets: [...new Set(calls)],isolatedFixtures:true},null,2));console.log('PASS startup avoids hidden analytics; explicit mirror retains all targets')
}finally{await browser.close()}
