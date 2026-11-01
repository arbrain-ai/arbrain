/**
 * Ciclo de vida atado al turno (1 nov 2026, opción 2): soltar los candados de la sesión en cuanto termina el turno que
 * usó las manos, y matar huérfanos al arrancar. Sin pantalla: el daemon es el contador real (`TurnosManos`).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { TurnosManos } from '../cliente/permisos-app.js'
import { binariosManos, matarHuerfanos, VigiaTurno, type FuenteTurno } from './ciclo.js'
import type { Adaptador } from './contrato.js'

const previo = { ...process.env }
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in previo)) delete process.env[k]; Object.assign(process.env, previo) })

function adaptador() {
  const soltadas: number[] = []
  const a = { nombre: 'falso', soltar: async () => { soltadas.push(Date.now()) } } as unknown as Adaptador
  return { a, soltadas }
}
const fuenteDe = (t: TurnosManos): FuenteTurno => ({ estado: async c => t.estado(c) })
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('soltar al terminar el turno', () => {
  it('al terminar el turno de su conversación, la sesión suelta sus candados al instante (sin esperar los 15 s)', async () => {
    const turnos = new TurnosManos()
    const { a, soltadas } = adaptador()
    const v = new VigiaTurno(() => a, { conversacion: () => 'conv-1', fuente: fuenteDe(turnos), cadaMs: 20 })
    turnos.empezar('conv-1')
    await v.actuo()
    await esperar(80)
    expect(soltadas).toHaveLength(0) // el turno sigue vivo: los candados siguen
    const fin = Date.now()
    turnos.terminar('conv-1')
    await esperar(80)
    expect(soltadas).toHaveLength(1)
    expect(soltadas[0] - fin).toBeLessThan(1000)
    expect(v.soltadas).toBe(1)
  })

  it('el fin de OTRA conversación no suelta nada', async () => {
    const turnos = new TurnosManos()
    const { a, soltadas } = adaptador()
    const v = new VigiaTurno(() => a, { conversacion: () => 'conv-1', fuente: fuenteDe(turnos), cadaMs: 20 })
    turnos.empezar('conv-1'); turnos.empezar('conv-2')
    await v.actuo()
    turnos.terminar('conv-2')
    await esperar(80)
    expect(soltadas).toHaveLength(0)
    v.cerrar()
  })

  it('un turno que termina y otro que empieza enseguida: igual suelta (cuenta turnos terminados, no «vivo»)', async () => {
    const turnos = new TurnosManos()
    const { a, soltadas } = adaptador()
    const v = new VigiaTurno(() => a, { conversacion: () => 'conv-1', fuente: fuenteDe(turnos), cadaMs: 40 })
    turnos.empezar('conv-1')
    await v.actuo()
    turnos.terminar('conv-1'); turnos.empezar('conv-1')
    await esperar(120)
    expect(soltadas).toHaveLength(1)
    v.cerrar()
  })

  it('deja de vigilar cuando los candados ya vencieron solos', async () => {
    const turnos = new TurnosManos()
    let consultas = 0
    const fuente: FuenteTurno = { estado: async c => { consultas++; return turnos.estado(c) } }
    const { a } = adaptador()
    const v = new VigiaTurno(() => a, { conversacion: () => 'conv-1', fuente, cadaMs: 10, vigilarMs: 50 })
    turnos.empezar('conv-1')
    await v.actuo()
    await esperar(150)
    const n = consultas
    await esperar(80)
    expect(consultas).toBe(n)
  })

  it('sin conversación (instalación de Daniel, donde encargar ya suelta) no hace nada', async () => {
    delete process.env.ARBRAIN_MANOS_CONVERSACION
    let consultas = 0
    const { a } = adaptador()
    const v = new VigiaTurno(() => a, { fuente: { estado: async () => { consultas++; return { vivo: true, fin: 0 } } } })
    await v.actuo()
    expect(consultas).toBe(0)
  })
})

describe('matar huérfanos al arrancar', () => {
  it('macOS: termina solo las copias del binario exacto de esta app; nunca la ArbrainManos de Daniel ni a sí mismo', async () => {
    const bin = '/Applications/Arbrain.app/Contents/Resources/manos/ArbrainManos.app/Contents/MacOS/ArbrainManos'
    const muertos: number[] = []
    const r = await matarHuerfanos({
      plataforma: 'darwin', binarios: [bin], yo: 50,
      listar: async () => [
        { pid: 11, comando: bin },
        { pid: 12, comando: `${bin} --algo` },
        { pid: 13, comando: '/Users/x/Applications/ArbrainManos.app/Contents/MacOS/ArbrainManos' },
        { pid: 14, comando: `${bin}-otra` },
        { pid: 50, comando: bin },
      ],
      matar: pid => { muertos.push(pid) },
    })
    expect(r).toEqual([11, 12])
    expect(muertos).toEqual([11, 12])
  })

  it('Windows: el exe del instalador o cualquiera de la caché de esta instalación (sin distinguir mayúsculas)', async () => {
    const bins = binariosManos('win32', { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' })
    expect(bins).toHaveLength(1)
    expect(bins[0]).toMatch(/Arbrain.manos-windows\\$/)
    const r = await matarHuerfanos({
      plataforma: 'win32', binarios: ['C:\\Users\\a\\AppData\\Local\\Arbrain\\manos-windows\\'], yo: 1,
      listar: async () => [
        { pid: 21, comando: 'c:\\users\\a\\appdata\\local\\arbrain\\manos-windows\\abc123\\ManosWindows.exe' },
        { pid: 22, comando: 'C:\\Otra\\ManosWindows.exe' },
      ],
      matar: () => {},
    })
    expect(r).toEqual([21])
  })

  it('Linux (sin adaptador todavía): no hay binario que buscar', async () => {
    expect(binariosManos('linux')).toEqual([])
    expect(await matarHuerfanos({ plataforma: 'linux', listar: async () => [{ pid: 3, comando: 'x' }] })).toEqual([])
  })
})
