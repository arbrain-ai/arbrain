import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {homedir} from 'node:os'
import {resolve as resolverRuta} from 'node:path'
// Script manual: SFBROWSER_PACKAGE = ruta al package.json de un proyecto que trae playwright (obligatoria).
const {chromium}=createRequire(process.env.SFBROWSER_PACKAGE??(()=>{throw new Error('Define SFBROWSER_PACKAGE (package.json con playwright).')})())('playwright')
const base=process.env.CLARITY_URL??'http://127.0.0.1:3032',out='docs/builds/arbrain-sales-2026-09-13/evidence'
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1100}})
const errors=[],writes=[],salesCalls=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(!['GET','HEAD','OPTIONS'].includes(req.method())){writes.push(u.pathname);return route.abort()}if(u.pathname==='/api/clarity/sales')salesCalls.push(u.search);return route.continue()})
try{
 await page.goto(base+'/youtube?tab=results');await page.locator('[data-sales-coverage]').waitFor({timeout:120000});await page.screenshot({path:out+'/results-desktop.png'})
 assert.equal(salesCalls.length,1,'Closed evidence does not load separately')
 const response=await page.request.get(base+'/api/clarity/sales?days=30'),data=await response.json();assert.equal(response.status(),200);assert.equal(data.coverage.balanced,true)
 assert.equal(data.coverage.paidOrders,data.coverage.attributedOrders+data.coverage.unattributedOrders)
 for(const [currency,total] of Object.entries(data.totals))for(const field of ['count','paidCents','refundedCents','retainedCents'])assert.equal(total[field],(data.attributed[currency]?.[field]??0)+(data.unattributed[currency]?.[field]??0))
 await page.getByRole('button',{name:/sin atribución a video/}).click();await page.locator('[data-sales-ready="true"]').waitFor({timeout:120000});await page.getByText(/Ver evidencia ·/).first().click();await page.screenshot({path:out+'/unattributed.png'})
 await page.getByRole('button',{name:/sin atribución a video/}).click()
 const withSales=Object.entries(data.byVideo).find(([,groups])=>Object.values(groups).some(g=>g.kinds.new?.count>0))?.[0];assert.ok(withSales);await page.locator('article').filter({has:page.locator(`a[href$="${withSales}"]`)}).getByRole('button',{name:'Ver embudo',exact:true}).click();await page.getByRole('dialog').locator('[data-sales-ready="true"]').waitFor({timeout:120000});await page.locator('[data-funnel-ready="true"]').waitFor({timeout:120000});await page.getByRole('dialog').getByText(/Ver evidencia ·/).click();await page.getByRole('dialog').locator('[class*="text"]').first().evaluate(e=>{e.scrollTop=e.scrollHeight});await page.screenshot({path:out+'/video-orders.png'})
 await page.keyboard.press('Escape')
 await page.getByLabel('Período de ventas').selectOption('0');await page.locator('[data-sales-days="0"]').waitFor({timeout:120000});await page.getByLabel('Período de ventas').selectOption('7');await page.locator('[data-sales-days="7"]').waitFor({timeout:120000})
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+'/results-mobile.png'})
 const denied=execFileSync('curl',['-s','--max-time','15','-H','Host: unauthorized.invalid','-o','/dev/null','-w','%{http_code}',base+'/api/clarity/sales'],{encoding:'utf8'});assert.equal(denied,'401')
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 await writeFile(out+'/browser-verification.json',JSON.stringify({base,balanced:true,privateEndpoint:true,lazyEvidence:true,periods:true,mobile:true,writes,errors,asOf:data.asOf},null,2));console.log('PASS real ledger balance, lazy evidence, private endpoint, periods and mobile')
}finally{await browser.close()}
