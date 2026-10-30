import test from 'node:test'
import assert from 'node:assert/strict'
import {dimensionesCuadro,elegirDispositivo,leerPreferencia,mensajeErrorCamara,LADO_CUADRO} from '../../src/features/live/camera/frame'

test('el cuadro se reduce a 768 px por el lado mayor y nunca se agranda',()=>{
 assert.deepEqual(dimensionesCuadro(1920,1080),{ancho:768,alto:432})
 assert.deepEqual(dimensionesCuadro(1080,1920),{ancho:432,alto:768})
 assert.deepEqual(dimensionesCuadro(640,480),{ancho:640,alto:480})
 assert.deepEqual(dimensionesCuadro(0,0),{ancho:0,alto:0})
 assert.equal(LADO_CUADRO,768)
})
test('sin elección guardada se prefiere la Cam Link; con elección válida se respeta',()=>{
 const l=[{deviceId:'a',label:'FaceTime HD Camera'},{deviceId:'b',label:'Cam Link 4K'}]
 assert.equal(elegirDispositivo(l,null),'b')
 assert.equal(elegirDispositivo(l,'a'),'a')
 assert.equal(elegirDispositivo(l,'zzz'),'b')
 assert.equal(elegirDispositivo([{deviceId:'a',label:'FaceTime'}],null),'a')
 assert.equal(elegirDispositivo([],null),null)
})
test('la preferencia es apagada por defecto y tolera storage roto',()=>{
 assert.deepEqual(leerPreferencia(null),{encendida:false,dispositivo:null})
 assert.deepEqual(leerPreferencia({getItem:()=>{throw new Error('x')}}),{encendida:false,dispositivo:null})
 const m:Record<string,string>={'arbrain.live.camara':'1','arbrain.live.camara.dispositivo':'b'}
 assert.deepEqual(leerPreferencia({getItem:k=>m[k]??null}),{encendida:true,dispositivo:'b'})
})
test('los errores de cámara se explican en español',()=>{
 assert.match(mensajeErrorCamara({name:'NotAllowedError'}),/Privacidad/)
 assert.match(mensajeErrorCamara({name:'NotReadableError'}),/ocupada/)
 assert.match(mensajeErrorCamara({name:'NotFoundError'}),/No encuentro/)
})
