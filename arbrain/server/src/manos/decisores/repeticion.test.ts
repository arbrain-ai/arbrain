/**
 * Cambiar de vía en vez de repetir (5 nov 2026, bitácora 20261106013100-08e8): el cerebro mandó ⌘⇧G, la ruta y Return
 * al panel «Abrir» de macOS siete veces entre Sonnet y Opus, con el mismo resultado, hasta error_max_turns.
 */
import { describe, expect, it } from 'vitest'
import { Repeticiones, avisoTurnos } from './repeticion.js'

const tecla = { pid: 400, ventana: 15562, accion: 'tecla', tecla: 'g', modificadores: ['cmd', 'shift'] }
const falla = '{"ok":false,"efecto":"fallo","detalle":"el menú «Seleccionar todo» está inactivo","ms":320}'

describe('Repeticiones', () => {
  it('un paso que falla dos veces igual: la segunda avisa «cambia de vía» y la tercera no se corre', () => {
    const r = new Repeticiones()
    expect(r.antes('actuar', tecla)).toEqual({ correr: true })
    expect(r.despues('actuar', tecla, falla, false)).toBe('')
    expect(r.antes('actuar', tecla)).toEqual({ correr: true })
    expect(r.despues('actuar', tecla, falla.replace('320', '290'), false)).toMatch(/cambia de vía/i)
    const tercera = r.antes('actuar', tecla)
    expect(tercera.correr).toBe(false)
    expect(!tercera.correr && tercera.texto).toMatch(/NO SE CORRIÓ/)
  })

  it('un ok sin verificar con el mismo resultado también es no avanzar', () => {
    const r = new Repeticiones()
    const ok = '{"ok":true,"efecto":"sin_verificar","ms":7072}'
    r.despues('actuar', tecla, ok, false)
    expect(r.despues('actuar', tecla, ok.replace('7072', '2951'), false)).toMatch(/cambia de vía/i)
    expect(r.antes('actuar', tecla).correr).toBe(false)
  })

  it('lo confirmado y lo que cambia (scroll que trae más) nunca se frena', () => {
    const r = new Repeticiones()
    const conf = '{"ok":true,"efecto":"confirmado"}'
    for (let i = 0; i < 4; i++) { expect(r.antes('actuar', tecla).correr).toBe(true); r.despues('actuar', tecla, conf, false) }
    const scroll = { accion: 'scroll', direccion: 'abajo' }
    for (let i = 0; i < 5; i++) { expect(r.antes('web_actuar', scroll).correr).toBe(true); expect(r.despues('web_actuar', scroll, `CAMBIOS (12 líneas): + [${i}] link «Video ${i}»`, false)).toBe('') }
  })

  it('las lecturas iguales avisan pero nunca se niegan', () => {
    const r = new Repeticiones()
    const lectura = 'Google Chrome · 5/23 elementos (2391 ms)'
    r.despues('observar', { pid: 400 }, lectura, false)
    expect(r.despues('observar', { pid: 400 }, lectura.replace('2391', '1400'), false)).toMatch(/nada cambió/i)
    for (let i = 0; i < 3; i++) expect(r.antes('observar', { pid: 400 }).correr).toBe(true)
  })

  it('otro argumento es otra vía: no hereda el conteo', () => {
    const r = new Repeticiones()
    r.despues('actuar', tecla, falla, false); r.despues('actuar', tecla, falla, false)
    expect(r.antes('actuar', { ...tecla, tecla: 'escape', modificadores: [] }).correr).toBe(true)
  })
})

describe('avisoTurnos', () => {
  it('callado lejos del tope; a 5 o menos le pide cerrar con terminar', () => {
    expect(avisoTurnos(10, 40)).toBe('')
    expect(avisoTurnos(35, 40)).toMatch(/QUEDAN 5 TURNOS/)
    expect(avisoTurnos(39, 40)).toMatch(/terminar/)
  })
})
