import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {period,navigatePeriod,contextualAction,taskEvidence,type Goal} from '../../src/features/goals/model'
import type {PlanningSnapshot,PlanTask} from '../../src/features/planning/types'
const goal:Goal={id:'g',scope:'week',start:'2026-08-31',end:'2026-09-07',title:'Publicar',success:'Entrega',notes:'',parentId:null,status:'draft',taskIds:['todoist:1'],eventIds:[],completionNote:''}
const task={id:'todoist:1',completed:false,priority:1} as PlanTask
const snapshot={tasks:[task],completedTasks:[]} as unknown as PlanningSnapshot
test('civil periods cross month and year without day drift',()=>{assert.deepEqual(period('week','2026-09-01'),{start:'2026-08-31',end:'2026-09-07'});assert.deepEqual(period('month','2028-02-29'),{start:'2028-02-01',end:'2028-03-01'});assert.equal(navigatePeriod('month','2026-12-31',1),'2027-01-01');assert.equal(navigatePeriod('month','2026-03-31',-1),'2026-02-01');assert.throws(()=>period('day','2026-02-30'))})
test('draft never selects a task as agreed; completed work cannot imply completed goal',()=>{assert.equal(contextualAction([goal],snapshot,'2026-09-01'),null);const agreed={...goal,status:'agreed'} as Goal;assert.equal(contextualAction([agreed],snapshot,'2026-09-01')?.task.id,task.id);const result=taskEvidence(agreed,{...snapshot,tasks:[],completedTasks:[{...task,completed:true}]});assert.equal(result.completed,1);assert.equal(agreed.status,'agreed')})
test('a missing linked task remains unknown',()=>{const e=taskEvidence({...goal,taskIds:['todoist:missing']},snapshot);assert.equal(e.unknown,1);assert.equal(e.completed,0)})
