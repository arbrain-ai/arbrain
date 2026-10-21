import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {homedir} from 'node:os'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
const {chromium}=createRequire(resolve(homedir(),'Developer/software/sfbrowser/package.json'))('playwright')
const base=process.env.CLARITY_URL??'http://127.0.0.1:3032',browser=await chromium.launch({channel:'chrome',headless:true})
const p=await browser.newPage({viewport:{width:1440,height:1000}})
let scenario='empty'
await p.route('**/*',route=>{
 const r=route.request(),u=new URL(r.url())
 if(!['GET','HEAD','OPTIONS'].includes(r.method()))return route.abort()
 if(u.pathname==='/api/planning') {
  const task=(id,title,sectionId)=>({id,externalId:id,kind:'task',title,description:'Material QA',projectId:'yt',sectionId,parentId:null,priority:4,due:null,timeZone:null,recurring:false,recurrenceText:null,durationMinutes:null,completed:false,updatedAt:null})
  return route.fulfill({json:{ownerId:'qa',sources:[],events:[],tasks:[task('active','QA en curso','doing'),task('idea','QA idea',null)],projects:[{id:'yt',title:'🎬 YouTube',color:null}],sections:[{id:'doing',projectId:'yt',title:'🔥 Haciendo'}],health:[],loadedAt:new Date().toISOString(),range:{from:u.searchParams.get('from'),to:u.searchParams.get('to')}}})
 }
 if(u.pathname==='/api/clarity')return route.fulfill({json:{ownerId:'qa',billing:scenario==='empty'?null:{mrr_cents:0,active_subs:0,cancel_at_period_end:null,polar_reconciled_at:'2020-01-01T00:00:00Z'},briefs:[],issues:scenario==='partial'?['Fuente QA no disponible']:[],videos:[],limited:false,loadedAt:new Date().toISOString()}})
 return route.continue()
})
try{
 await p.goto(base+'/ml-dashboard');await p.getByText('No hay un snapshot reconciliado disponible.').waitFor();assert.ok(await p.getByText('Sin dato',{exact:true}).count()===3)
 scenario='partial';await p.getByRole('button',{name:'Actualizar resumen'}).click();await p.getByText('Fuente QA no disponible').waitFor();await p.getByText('$0',{exact:true}).waitFor();await p.getByText(/La reconciliación tiene más de 48 horas/).waitFor()
 await p.screenshot({path:'docs/builds/arbrain-claridad-2026-09-13/evidence/partial-stale-qa.png'})
 await p.goto(base+'/youtube?tab=results');await p.getByText('No hay publicaciones en esta lectura.').waitFor()
 await p.goto(base+'/youtube?tab=production');await p.getByText('QA en curso',{exact:true}).waitFor();assert.equal(await p.getByText('QA idea',{exact:true}).count(),0);await p.getByRole('button',{name:/Ver ideas y pendientes/}).click();await p.getByText('QA idea',{exact:true}).waitFor()
 const statuses={}
 for(const path of ['/api/clarity?section=overview','/api/clarity?section=radar','/api/analytics/business','/api/analytics/ml','/api/analytics/intel']){
 const status=Number(execFileSync('curl',['-s','--max-time','15','-H','Host: unauthorized.invalid','-o','/dev/null','-w','%{http_code}',base+path],{encoding:'utf8'}));assert.equal(status,401,path);statuses[path]=status
 }
 const invalid=await fetch(base+'/api/clarity?section=invalid');assert.equal(invalid.status,400)
 await writeFile('docs/builds/arbrain-claridad-2026-09-13/evidence/states.json',JSON.stringify({productionSeparatesIdeas:true,emojiSection:true,empty:true,zeroDistinctFromNull:true,partial:true,stale:true,unauthenticated:statuses,invalidSection:400},null,2));console.log('PASS empty, partial, zero/null, stale and unauthorized endpoints')
}finally{await browser.close()}
