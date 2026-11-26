import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {separarCriticas,plegarCritica,desdeCriticas,DECISIONES_BANDEJA} from '../../src/features/comments/escudo'

test('ninguna crítica sale en primer plano: van plegadas aparte',()=>{
  const filas=[
    {comment_id:'a',category:'simple-question',decision:'AUTO_PUBLISH',draft_text:'x'},
    {comment_id:'b',category:'criticism',decision:'ESCALATE',comment_text:'esto es humo'},
    {comment_id:'c',category:'complex',decision:'ESCALATE',draft_text:'y'},
    {comment_id:'d',category:'CRITICISM',decision:'ESCALATE'},
  ]
  const {items,criticas}=separarCriticas(filas)
  assert.deepEqual(items.map(f=>f.comment_id),['a','c'])
  assert.deepEqual(criticas.map(f=>f.comment_id),['b','d'])
})

test('con la autopublicación apagada, lo que antes era AUTO_PUBLISH también entra a la bandeja',()=>{
  assert.deepEqual([...DECISIONES_BANDEJA].sort(),['AUTO_PUBLISH','ESCALATE'])
})

test('una crítica plegada no lleva borrador',()=>{
  const p=plegarCritica({comment_id:'b',category:'criticism',comment_text:'t',draft_text:'no debe viajar',final_text:'tampoco'})
  assert.equal('draft_text' in p,false)
  assert.equal('final_text' in p,false)
  assert.equal(p.comment_text,'t')
})

test('las críticas plegadas son solo las de los últimos 30 días',()=>{
  assert.equal(desdeCriticas(new Date('2026-11-19T12:00:00Z')),'2026-10-20T12:00:00.000Z')
})
