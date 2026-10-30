import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { leerCompartido, limpiarPestanas, sincronizarCompartido } from './panel-compartido.js'
import { sincronizar } from './panel-bus.js'

let dir = ''
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'panel-compartido-')); process.env.ARBRAIN_PANEL_DIR = dir; process.env.ARBRAIN_PANEL_AJUSTES = path.join(dir, 'panel-ajustes.json') })
afterEach(() => { delete process.env.ARBRAIN_PANEL_DIR; delete process.env.ARBRAIN_PANEL_AJUSTES; rmSync(dir, { recursive: true, force: true }) })

const f = (id: string, vista = 'calendario', extra: Record<string, unknown> = {}) => ({ id, input: { vista, ...extra }, en: 1 })
const estado = (...fs: ReturnType<typeof f>[]) => ({ fijadas: fs, orden: fs.map(x => x.id), taller: true, ancladas: [] as string[] })

describe('panel compartido entre aparatos', () => {
  it('sin nada guardado responde versión 0 y sin estado', () => {
    expect(sincronizarCompartido({ rev: 0, activaRev: 0 }, 'disp-a', 0, dir)).toEqual({ rev: 0, activaRev: 0 })
  })

  it('el primer cambio (base 0) se guarda y vuelve como estado acordado', () => {
    const r = sincronizarCompartido({ rev: 0, cambio: { base: 0, ...estado(f('a'), f('b', 'lienzo', { paginaId: 'p1' })) } }, 'escritorio', 0, dir)
    expect(r.rev).toBe(1)
    expect(r.estado?.fijadas.map(x => x.id)).toEqual(['a', 'b'])
    expect(leerCompartido(dir).dispositivo).toBe('escritorio')
  })

  it('otro aparato con una versión vieja recibe el estado vigente', () => {
    sincronizarCompartido({ rev: 0, cambio: { base: 0, ...estado(f('a')) } }, 'escritorio', 0, dir)
    const r = sincronizarCompartido({ rev: 0, activaRev: 0 }, 'telefono', 0, dir)
    expect(r.estado?.fijadas.map(x => x.id)).toEqual(['a'])
    // Y quien ya la tiene no la vuelve a recibir (el latido es barato).
    expect(sincronizarCompartido({ rev: 1, activaRev: 0 }, 'telefono', 0, dir).estado).toBeUndefined()
  })

  it('un cambio sobre una base vieja se rechaza y no pisa lo que escribió otro', () => {
    sincronizarCompartido({ rev: 0, cambio: { base: 0, ...estado(f('a')) } }, 'escritorio', 0, dir)
    sincronizarCompartido({ rev: 1, cambio: { base: 1, ...estado(f('a'), f('levy')) } }, 'escritorio', 0, dir)
    const r = sincronizarCompartido({ rev: 1, cambio: { base: 1, ...estado() } }, 'telefono', 0, dir)
    expect(r.rechazado).toBe(true)
    expect(r.estado?.fijadas.map(x => x.id)).toEqual(['a', 'levy'])
    expect(leerCompartido(dir).rev).toBe(2)
  })

  it('la pestaña a la vista viaja aparte, sin chocar con las pestañas', () => {
    sincronizarCompartido({ rev: 0, cambio: { base: 0, ...estado(f('a'), f('b')) } }, 'escritorio', 0, dir)
    expect(sincronizarCompartido({ rev: 1, activaRev: 0, activa: 'b' }, 'escritorio', 0, dir).activaRev).toBe(1)
    const tel = sincronizarCompartido({ rev: 1, activaRev: 0 }, 'telefono', 0, dir)
    expect(tel.activa).toBe('b')
    expect(sincronizarCompartido({ rev: 1, activaRev: 1 }, 'telefono', 0, dir).activa).toBeUndefined()
  })

  it('limpia lo inválido: sin id, sin vista o repetido', () => {
    const l = limpiarPestanas({ fijadas: [f('a'), { id: 'x' }, { input: { vista: 'lienzo' } }, f('a')], orden: ['a', 3, 'a'], taller: false })
    expect(l).toEqual({ fijadas: [f('a')], orden: ['a'], taller: false, ancladas: [] })
  })

  it('un cambio demasiado grande no tumba el latido', () => {
    const enorme = f('a', 'documento', { ruta: 'x'.repeat(500_000) })
    const r = sincronizarCompartido({ rev: 0, cambio: { base: 0, ...estado(enorme) } }, 'escritorio', 0, dir)
    expect(r.error).toBeTruthy()
    expect(r.rev).toBe(0)
  })

  it('viaja en el latido del bus; una web anterior (sin compartido) no lo recibe', () => {
    const viejo = sincronizar({ clientId: 'w-1', pestanas: [] }, Date.now(), dir)
    expect(viejo.compartido).toBeUndefined()
    const nuevo = sincronizar({ clientId: 'w-2', dispositivo: 'tel', pestanas: [], compartido: { rev: 0, cambio: { base: 0, ...estado(f('a')) } } }, Date.now(), dir)
    expect(nuevo.compartido?.rev).toBe(1)
  })
})
