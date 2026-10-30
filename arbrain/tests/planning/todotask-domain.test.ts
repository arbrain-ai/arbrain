import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { civilMidnight } from '../../src/features/sistema/calendar-days'
import { nextAction, taskGroup, taskDate, canonicalSection } from '../../src/features/todotask/model'
import type { PlanTask, PlanningSnapshot } from '../../src/features/planning/types'
const task=(id:string,patch:Partial<PlanTask>={}):PlanTask=>({id,externalId:id,kind:'task',title:id,description:'',projectId:'p',sectionId:null,parentId:null,priority:4,due:null,timeZone:null,recurring:false,recurrenceText:null,durationMinutes:null,completed:false,updatedAt:null,...patch})
const snapshot=(tasks:PlanTask[]):PlanningSnapshot=>({ownerId:'qa',sources:[],events:[],tasks,projects:[],sections:[{id:'doing',title:'🔥 Haciendo',projectId:'p'}],health:[],loadedAt:'',range:{from:'',to:''}})
test('next action prefers actual WIP over priority, never assigns undated backlog automatically',()=>{
 const list=[task('urgent',{priority:1,due:'2026-09-13'}),task('working',{sectionId:'doing'}),task('idea')]
 assert.equal(nextAction(snapshot(list),'2026-09-13','America/Mexico_City').task?.id,'working')
 assert.equal(nextAction(snapshot([list[0],list[2]]),'2026-09-13','America/Mexico_City').task?.id,'urgent')
 assert.equal(nextAction(snapshot([list[2]]),'2026-09-13','America/Mexico_City').task,null)
 assert.equal(canonicalSection('🔥 Haciendo'),'haciendo')
})
test('task grouping and calendar query respect civil day, DST and explicit offsets',()=>{
 assert.equal(taskDate(task('utc',{due:'2026-09-14T02:00:00Z'}),'America/Mexico_City'),'2026-09-13')
 assert.equal(taskGroup(task('floating',{due:'2026-09-13T23:00:00'}),'2026-09-13','America/Mexico_City'),'Hoy')
 assert.equal(taskGroup(task('seed'),'2026-09-13','America/Mexico_City'),'Sin fecha')
 assert.equal(civilMidnight('2026-09-13','America/Mexico_City').toISOString(),'2026-09-13T06:00:00.000Z')
 assert.equal((civilMidnight('2026-03-09','America/New_York').getTime()-civilMidnight('2026-03-08','America/New_York').getTime())/3600000,23)
 assert.equal((civilMidnight('2026-11-02','America/New_York').getTime()-civilMidnight('2026-11-01','America/New_York').getTime())/3600000,25)
})
