import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {cuando,estado,resumen,hace} from '../../src/features/rutinas/model'
import {nombreRutina,RUTINAS} from '../../src/features/rutinas/catalogo'
import type {CronSchedule,CronRun} from '../../src/features/planning/types'

const job=(over:Partial<CronSchedule>={}):CronSchedule=>({id:'polar-sync',schedule:'30 23 * * *',status:'active',next_run:null,last_run:1790300000,last_result:'Listo',...over})
const run=(over:Partial<CronRun>={}):CronRun=>({id:'r',job_id:'polar-sync',status:'success',created_at:'2026-09-25T05:30:00Z',response:null,error:null,...over})

test('schedules read as an owner sentence',()=>{
  assert.equal(cuando('0 9 * * *'),'Todos los días a las 9:00')
  assert.equal(cuando('15 2,8,14,20 * * *'),'Cuatro veces al día: 2:15, 8:15, 14:15 y 20:15')
  assert.equal(cuando('0 0,12 * * *'),'Dos veces al día: 0:00 y 12:00')
  assert.equal(cuando('0 7 * * 0'),'Los domingos a las 7:00')
  assert.equal(cuando('0 8 1 * *'),'El día 1 de cada mes a las 8:00')
  assert.equal(cuando('*/15 * * * *'),'Cada 15 minutos')
  assert.equal(cuando('20 */3 * * *'),'Cada 3 horas')
  assert.equal(cuando('bogus'),'bogus')
})

test('last result prefers the latest recorded run and never invents success',()=>{
  assert.equal(estado(job(),[run({status:'error',error:'exit 2',created_at:'2026-09-25T06:00:00Z'}),run()]).tono,'error')
  assert.equal(estado(job(),[run()]).tono,'ok')
  assert.equal(estado(job({status:'paused'}),[run()]).tono,'pausada')
  assert.equal(estado(job({last_result:'Error: Error: ❌ SESION DE STUDIO CAIDA'}),[]).tono,'error')
  assert.equal(estado(job({last_result:null,last_run:null}),[]).texto,'Todavía no corre')
})

test('the report is cleaned of paths, markdown and duplicated error prefixes',()=>{
  assert.equal(resumen('Error: Error: ❌ SESION DE STUDIO CAIDA'),'❌ SESION DE STUDIO CAIDA')
  assert.equal(resumen('Backup creado: /Users/tu-usuario/Developer/x/store/backups/claudeclaw_backup_1.db'),'Backup creado: claudeclaw_backup_1.db')
  assert.equal(resumen('**Autoresearch** — corrió `limpio`'),'Autoresearch — corrió limpio')
  assert.ok((resumen('a'.repeat(400))??'').length<=191)
})

test('relative time uses the business day in Mexico City',()=>{
  const now=Date.parse('2026-09-25T20:00:00-06:00')
  assert.equal(hace(now-5*60_000,now),'hace 5 min')
  assert.equal(hace(Date.parse('2026-09-25T08:50:00-06:00'),now),'hoy 08:50')
  assert.equal(hace(Date.parse('2026-09-24T23:30:00-06:00'),now),'ayer 23:30')
})

test('every routine in the catalogue has an owner name and a plain explanation',()=>{
  for(const [id,r] of Object.entries(RUTINAS)){
    assert.ok(r.nombre&&r.queHace.length>20,id)
    assert.doesNotMatch(r.queHace,/\b(cron|cronjob|script|daemon|launchd|supabase)\b|RAW_SCRIPT|\.py\b|\.sh\b/i,`${id} uses jargon`)
  }
  assert.equal(nombreRutina('custom-weekly-thing-a1b2c3d4'),'weekly thing')
})
