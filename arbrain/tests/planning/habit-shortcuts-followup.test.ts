import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {habitKey,HABIT_SHORTCUTS} from '../../src/features/sistema/habit-shortcuts'
import {workoutForDay,habitDisplayName} from '../../src/features/sistema/habit-presentation'
import {period,taskDay} from '../../src/features/goals/model'
import type {PlanTask} from '../../src/features/planning/types'
const event=(code:string,extras={})=>({code,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,repeat:false,isComposing:false,...extras})
test('both keyboards preserve the assigned shortcuts and retired positions',()=>{
 // El 3 es un hábito propio de cada instalación (config/instalacion.ts › atajosHabitos): se lee del mapa.
 const tres=Object.keys(HABIT_SHORTCUTS).find(k=>HABIT_SHORTCUTS[k]==='3')
 assert.ok(tres,'el 3 tiene hábito asignado')
 const names=['objetivo_dia','dormir',tres,'luz_am','ducha_fria','entrenamiento']
 for(let i=0;i<names.length;i++){assert.equal(habitKey(event('Digit'+(i+1))),names[i]);assert.equal(habitKey(event('Numpad'+(i+1))),names[i])}
 assert.equal(HABIT_SHORTCUTS.nsdr,'8');assert.equal(HABIT_SHORTCUTS.cafe_90,'0');assert.equal(habitKey(event('Numpad1',{shiftKey:true})),'ayuno')
 for(const extras of [{metaKey:true},{ctrlKey:true},{altKey:true},{repeat:true},{isComposing:true},{shiftKey:true}])assert.equal(habitKey(event('Digit2',extras)),null)
})
test('training labels follow Daniel weekday split across month boundaries',()=>{
 assert.equal(workoutForDay('2026-09-14'),'Pierna');assert.equal(workoutForDay('2026-09-17'),'Pierna');assert.equal(workoutForDay('2026-09-15'),'Brazo, espalda y abs');assert.equal(workoutForDay('2026-09-18'),'Brazo, espalda y abs');assert.equal(workoutForDay('2026-09-16'),'Pecho, tríceps y hombros');assert.equal(workoutForDay('2026-09-19'),'Pecho, tríceps y hombros');assert.equal(workoutForDay('2026-09-20'),'Natación');assert.equal(workoutForDay('2026-10-01'),'Pierna')
 assert.equal(habitDisplayName({clave:'dormir',nombre:'Dormir +8 horas'},'2026-09-14'),'Dormir +8 horas')
})
test('next week includes Monday and Sunday, excludes following Monday and undated ideas',()=>{
 const p=period('week','2026-09-14');const rows=[null,'2026-09-13','2026-09-14','2026-09-20','2026-09-21','2026-09-21T02:00:00Z'].map(due=>({due} as PlanTask));const selected=rows.map(t=>taskDay(t,'America/Mexico_City')).filter(d=>d&&d>=p.start&&d<p.end);assert.deepEqual(selected,['2026-09-14','2026-09-20','2026-09-20'])
})
