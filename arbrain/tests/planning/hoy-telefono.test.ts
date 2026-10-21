import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {splitLabel,focusFor,dayAgenda,habitProgress} from '../../src/features/goals/hoy-model'
import type {Goal} from '../../src/features/goals/model'
import type {PlanningSnapshot,PlanEvent,CalendarSource} from '../../src/features/planning/types'

const source=(id:string,title:string,objective:boolean):CalendarSource=>({id,calendarId:id,account:'a',title,color:null,timeZone:'America/Mexico_City',editable:true,selected:true,objective})
const event=(id:string,sourceId:string,title:string,start:string,end:string,allDay=false):PlanEvent=>({id,externalId:id,kind:'event',sourceId,account:'a',calendarId:sourceId,title,description:'',location:'',start,end,allDay,timeZone:'America/Mexico_City',etag:null,recurringEventId:null,recurrence:[],editable:true})
const snapshot=(events:PlanEvent[]):PlanningSnapshot=>({ownerId:'o',sources:[source('w','Objetivo de la semana',true),source('d','Objetivo del dia',true),source('t','Trabajo Duro',false),source('p','Pagos',false)],events,tasks:[],projects:[],health:[],loadedAt:'',range:{from:'',to:''}})
const goal=(scope:Goal['scope'],start:string,end:string,title:string,status:Goal['status']='agreed'):Goal=>({id:title,scope,start,end,title,success:'',notes:'',status,parentId:null,taskIds:[],eventIds:[],completionNote:''})

test('calendar objective titles lose the emoji and keep their horizon label',()=>{
  assert.deepEqual(splitLabel('🎯 Semana 1 · Decidir la oferta y anunciar la masterclass del 15'),{label:'Semana 1',title:'Decidir la oferta y anunciar la masterclass del 15'})
  assert.deepEqual(splitLabel('Publicar 6 videos'),{label:null,title:'Publicar 6 videos'})
})

test('the objectives registry wins; the Google objective calendar only fills an empty horizon',()=>{
  const snap=snapshot([event('s1','w','🎯 Semana 1 · Decidir la oferta','2026-09-26','2026-10-02',true)])
  const fromCalendar=focusFor([goal('month','2026-09-01','2026-10-01','Publicar 6 videos')],snap,'2026-09-26','week')
  assert.equal(fromCalendar.length,1)
  assert.equal(fromCalendar[0].origin,'calendario')
  assert.equal(fromCalendar[0].label,'Semana 1')
  const fromPlan=focusFor([goal('week','2026-09-21','2026-09-28','Vender el HT')],snap,'2026-09-26','week')
  assert.deepEqual(fromPlan.map(f=>[f.title,f.origin]),[['Vender el HT','plan']])
  assert.equal(focusFor([goal('week','2026-09-14','2026-09-21','Semana vieja')],snapshot([]),'2026-09-25','week').length,0,'a past week is never shown as current')
})

test('agenda marks the block in progress and only the first upcoming one as next',()=>{
  const snap=snapshot([
    event('a','t','Despertar','2026-09-26T05:30:00-06:00','2026-09-26T06:00:00-06:00'),
    event('b','t','Marketing','2026-09-26T06:00:00-06:00','2026-09-26T10:00:00-06:00'),
    event('c','t','Llamada','2026-09-26T12:00:00-06:00','2026-09-26T13:30:00-06:00'),
    event('d','t','Gym','2026-09-26T14:00:00-06:00','2026-09-26T16:00:00-06:00'),
    event('y','t','Ayer','2026-09-25T20:00:00-06:00','2026-09-25T21:00:00-06:00'),
    event('m','p','💳 Claude Max','2026-09-26','2026-09-27',true),
    event('s','w','🎯 Semana 1 · Oferta','2026-09-26','2026-10-02',true),
  ])
  const now=Date.parse('2026-09-26T07:15:00-06:00')
  const {allDay,timed}=dayAgenda(snap,'2026-09-26',now,true)
  assert.deepEqual(allDay.map(e=>e.id),['m'],'objective calendars are not agenda items')
  assert.deepEqual(timed.map(r=>[r.event.id,r.state]),[['a','past'],['b','now'],['c','next'],['d','later']])
  assert.deepEqual(dayAgenda(snap,'2026-09-26',now,false).timed.map(r=>r.state),['later','later','later','later'],'another day has no "now"')
})

test('habit progress counts only explicit completions',()=>{
  assert.deepEqual(habitProgress([true,false,null,undefined,true]),{done:2,total:5})
})
