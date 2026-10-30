// Carril T (11 oct 2026): en la app del alumno Levy remataba su presentación con «Lo que llegó: No pude leer la campana
// (Mission Control sin configurar)» y llegó a citar MC_SUPABASE_URL/KEY. En cliente no hay campana: nada de eso entra al
// prompt ni a lo que ve el alumno. La instalación original (Daniel) sigue igual.
import { afterEach, describe, expect, it } from 'vitest'
import { bloqueApertura, loQueLlego, rest, atender, SIN_CAMPANA_CLIENTE, type Llegado } from './llegado.js'
import { ejecutarCabina, cabinaToolsVisibles, cabinaDynamicTools } from './tools.js'
import { textoFaltaLlave, textoMotorApiApagado } from '../edicion.js'

const PROHIBIDO = /Mission Control|MC_SUPABASE|Supabase|\.env\b|ARBRAIN_MOTOR_API/
const previo = process.env.ARBRAIN_EDICION
afterEach(() => { if (previo === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo })

const conError: Llegado = { avisos: [], reportes: [], atrasados: [], error: 'Mission Control sin configurar (MC_SUPABASE_URL/KEY).' }

describe('lo que llegó en la edición cliente', () => {
  it('bloqueApertura: en cliente nunca hay bloque, ni con error ni con avisos', () => {
    expect(bloqueApertura(conError, true)).toBeNull()
    const lleno: Llegado = { avisos: [{ id: '00000000-0000-0000-0000-000000000000', kind: 'x', source: 's', title: 't', created_at: new Date().toISOString() }], reportes: [], atrasados: [] }
    expect(bloqueApertura(lleno, true)).toBeNull()
  })

  it('bloqueApertura: la instalación original conserva su texto (con el error de la campana)', () => {
    const b = bloqueApertura(conError, false)
    expect(b).toMatch(/LO QUE LLEGÓ/)
    expect(b).toMatch(/No pude leer la campana \(Mission Control sin configurar/)
  })

  it('loQueLlego: en cliente devuelve vacío y SIN error (un error se volvía una frase de Levy)', async () => {
    const l = await loQueLlego([], Date.now(), true)
    expect(l).toEqual({ avisos: [], reportes: [], atrasados: [] })
    expect(bloqueApertura(l, false)).toBeNull()
  })

  it('rest y atender: en cliente fallan con un texto que no nombra servicios ni variables de la instalación original', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    await expect(rest('avisos')).rejects.toThrow(SIN_CAMPANA_CLIENTE)
    await expect(atender({ todos: true })).rejects.toThrow(SIN_CAMPANA_CLIENTE)
    expect(SIN_CAMPANA_CLIENTE).not.toMatch(PROHIBIDO)
    expect(bloqueApertura(conError)).toBeNull() // el valor por defecto lee la edición del proceso
  })

  it('cabina: en cliente `atender` no se lista ni se ejecuta; en la original sigue', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    expect(cabinaToolsVisibles().map(t => t.name)).not.toContain('atender')
    expect(cabinaDynamicTools().map(t => t.name)).not.toContain('cabina_atender')
    const r = await ejecutarCabina('atender', { todos: true })
    expect(r.error).toBe(true)
    expect(r.text).not.toMatch(PROHIBIDO)
    process.env.ARBRAIN_EDICION = 'original'
    expect(cabinaToolsVisibles().map(t => t.name)).toContain('atender')
  })
})

describe('textos de llaves y motor por edición', () => {
  it('cliente: nunca cita el .env ni variables de la instalación original', () => {
    const cliente = { ARBRAIN_EDICION: 'cliente' }
    for (const n of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', '']) {
      const t = textoFaltaLlave(n, `Falta ${n} en arbrain/server/.env.`, cliente)
      expect(t).not.toMatch(PROHIBIDO)
      expect(t).not.toMatch(/DEEPSEEK/)
    }
    expect(textoFaltaLlave('OPENROUTER_API_KEY', 'x', cliente)).toMatch(/Ajustes › Llaves/)
    expect(textoMotorApiApagado('El motor por API está apagado (ARBRAIN_MOTOR_API).', cliente)).not.toMatch(PROHIBIDO)
  })

  it('original: el texto de siempre, tal cual', () => {
    const original = { ARBRAIN_EDICION: 'original' }
    expect(textoFaltaLlave('OPENROUTER_API_KEY', 'Falta OPENROUTER_API_KEY en arbrain/server/.env.', original)).toBe('Falta OPENROUTER_API_KEY en arbrain/server/.env.')
    expect(textoMotorApiApagado('Motor por API apagado (ARBRAIN_MOTOR_API).', original)).toBe('Motor por API apagado (ARBRAIN_MOTOR_API).')
  })
})
