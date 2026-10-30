import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {decidir,decidirRutina} from '../../src/features/avisos/policy'

test('telemetry never rings or reaches the bell, even when the emitter forgets to declare it',()=>{
  assert.equal(decidir({kind:'sistema',source:'health-sentinel'}).entrega,'bitacora')
  assert.equal(decidir({tag:'health-sentinel',title:'Arbrain: 2 problema(s)'} as never).entrega,'bitacora')
  assert.equal(decidir({kind:'agente',source:'pipeline-video'}).entrega,'bitacora','a declared kind cannot smuggle a telemetry emitter into the bell')
})

test('a dead server is the one system alert that still rings',()=>{
  assert.deepEqual(decidir({kind:'alerta',source:'health-sentinel'}),{kind:'alerta',entrega:'push',source:'health-sentinel'})
})

test('valuable kinds ring; quiet ones only land in the bell; unknown emitters never ring',()=>{
  assert.equal(decidir({kind:'agente',source:'sfterm-aviso'}).entrega,'push')
  assert.equal(decidir({kind:'dinero',source:'polar',quiet:true}).entrega,'campana')
  assert.deepEqual(decidir({source:'script-nuevo'}),{kind:'otro',entrega:'campana',source:'script-nuevo'})
  assert.equal(decidir({kind:'inventado',source:'x'}).kind,'otro')
})

test('routines speak only when a visible one finishes well; failures go to the log',()=>{
  assert.deepEqual(decidirRutina('morning-briefing',false),{kind:'agenda',entrega:'push',source:'rutina:morning-briefing'})
  assert.equal(decidirRutina('morning-briefing',true).entrega,'bitacora')
  assert.equal(decidirRutina('youtube-comments-respond',false).entrega,'bitacora')
  assert.equal(decidirRutina('snapshot-finanzas',false).kind,'dinero')
  assert.deepEqual(decidirRutina('ritual-noche',false),{kind:'agenda',entrega:'push',source:'ritual:bajar-a-tierra'})
})
