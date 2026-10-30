import { describe, it, expect } from 'vitest'
import type { Decisor, PedidoDecidir } from '../contrato.js'
import type { Receta } from '../recetas.js'
import { citas, elegirReceta, objetivoDelPedido, tieneDatosPersonales } from './atajos.js'
import { DecisorEncadenado } from '../registro.js'
import { CedeDecision } from './jev.js'

const receta = (nombre: string, descripcion: string, parametros: string[] = [], disparadores: string[] = []): Receta => ({
  nombre, descripcion, app: 'x', version: 1, creada: '', actualizada: '', parametros: Object.fromEntries(parametros.map(p => [p, ''])),
  pasos: [], verificador: [], corridas: 0, fallos: 0, reparaciones: [], ...(disparadores.length ? { disparadores } : {}),
} as Receta)

const RECETAS = [
  receta('whatsapp-escribir-sin-enviar', 'En WhatsApp, escribir un texto en la caja de mensaje de un chat sin enviarlo', ['contacto', 'texto'], ['whatsapp escribele a contacto el texto sin enviarlo']),
  receta('calculadora-12-por-3', 'En la Calculadora calcular 12 × 3 y leer el resultado', [], ['calculadora calcula 12 × 3 resultado']),
  receta('dock-ocultar-auto', 'Activar ocultar automáticamente el Dock en Configuración'),
]

describe('atajo: receta sin modelo', () => {
  it('el pedido real de WhatsApp cae en su receta con los parámetros entre «»', async () => {
    const c = await elegirReceta('En WhatsApp escríbele a «Contacto Prueba 💬» el texto «Prueba de Levy» en la caja de mensaje, pero NO lo envíes.', RECETAS)
    expect(c?.receta.nombre).toBe('whatsapp-escribir-sin-enviar')
    expect(c?.parametros).toEqual({ contacto: 'Contacto Prueba 💬', texto: 'Prueba de Levy' })
  })
  it('sin las citas que pide la receta, no aplica (va al modelo)', async () => {
    expect(await elegirReceta('En WhatsApp escríbele a Lucía que llego tarde', RECETAS)).toBeNull()
  })
  it('la Calculadora cae en su receta; un pedido distinto no', async () => {
    expect((await elegirReceta('En la Calculadora calcula 12 × 3 y dime el resultado que muestra.', RECETAS))?.receta.nombre).toBe('calculadora-12-por-3')
    expect(await elegirReceta('Abre el tercer video del canal de Prankedy en YouTube.', RECETAS)).toBeNull()
  })
  it('regresión 3 oct (nodo E): otros números no caen en la receta de 12 × 3 (verificaría «36» y diría hecho)', async () => {
    expect(await elegirReceta('En la Calculadora calcula 7 × 8 y dime el resultado', RECETAS)).toBeNull()
    expect(await elegirReceta('En la Calculadora calcula 12 × 4 y dime el resultado', RECETAS)).toBeNull()
    expect((await elegirReceta('calcula 12 por 3 en la calculadora', RECETAS))?.receta.nombre).toBe('calculadora-12-por-3')
    // Los números dentro de «» son parámetros, no datos fijos.
    expect((await elegirReceta('En WhatsApp escríbele a «Ana» el texto «llego a las 5» sin enviarlo', RECETAS))?.receta.nombre).toBe('whatsapp-escribir-sin-enviar')
  })
  it('empate: Jev desempata solo sin datos personales; con datos personales no se le pregunta', async () => {
    const dos = [receta('a-abrir-panel', 'abrir panel de sonido'), receta('b-abrir-panel', 'abrir panel de sonido')]
    const vistos: PedidoDecidir[] = []
    const jev: Decisor = { nombre: 'jev', decidir: async p => { vistos.push(p); return { eleccion: 'b-abrir-panel', confianza: 0.9, decisor: 'jev', ms: 1 } as any } }
    expect((await elegirReceta('abre el panel de sonido', dos, () => jev))?.receta.nombre).toBe('b-abrir-panel')
    expect(vistos).toHaveLength(1)
    expect(await elegirReceta('abre el panel de sonido y mándale un mensaje a «Ana»', dos, () => jev)).toBeNull()
    expect(vistos).toHaveLength(1)
  })
  it('detecta datos personales', () => {
    expect(tieneDatosPersonales('escríbele a «Ana»')).toBe(true)
    expect(tieneDatosPersonales('llama al +52 55 1234 5678')).toBe(true)
    expect(tieneDatosPersonales('abre el panel de sonido')).toBe(false)
    expect(citas('a «uno» y "dos"')).toEqual(['uno', 'dos'])
  })
})

describe('precalentar: app o URL directa del pedido', () => {
  it('URL directa para X y YouTube', () => {
    expect(objetivoDelPedido('Abre el 6.º post de mis guardados de X (x.com/i/bookmarks).')).toEqual({ tipo: 'web', url: 'https://x.com/i/bookmarks' })
    expect(objetivoDelPedido('Abre el tercer video del canal de Prankedy en YouTube.')).toEqual({ tipo: 'web', url: 'https://www.youtube.com/@Prankedy/videos' })
  })
  it('una URL escrita en el pedido gana (nodo E: «como la de X» no es X)', () => {
    expect(objetivoDelPedido('En http://127.0.0.1:5/virtual hay una lista de guardados (como la de X): abre el 6.º')).toEqual({ tipo: 'web', url: 'http://127.0.0.1:5/virtual' })
    expect(objetivoDelPedido('Abre https://es.wikipedia.org/wiki/Stafford_Beer.')).toEqual({ tipo: 'web', url: 'https://es.wikipedia.org/wiki/Stafford_Beer' })
  })
  it('apps nativas por nombre', () => {
    expect(objetivoDelPedido('En la Calculadora calcula 12 × 3')).toEqual({ tipo: 'app', app: 'com.apple.calculator' })
    expect(objetivoDelPedido('En sfmap abre la página «Plan»')).toEqual({ tipo: 'app', app: 'com.saasfactory.sfmap' })
    expect(objetivoDelPedido('En WhatsApp escríbele a «Ana»')).toEqual({ tipo: 'app', app: 'net.whatsapp.WhatsApp' })
    expect(objetivoDelPedido('qué hora es')).toBeNull()
  })
})

describe('privacidad: decisiones sobre un chat no salen de Anthropic', () => {
  it('con privado, Jev ni se consulta y decide el respaldo', async () => {
    let jevLlamado = false
    const jev: Decisor = { nombre: 'jev', decidir: async () => { jevLlamado = true; return { eleccion: 'e1', confianza: 1, decisor: 'jev', ms: 1 } as any } }
    const claude: Decisor = { nombre: 'claude:claude-sonnet-5-5', decidir: async () => ({ eleccion: 'e2', confianza: null, decisor: 'claude', ms: 1 } as any) }
    const d = await new DecisorEncadenado(jev, claude).decidir({ pregunta: '¿cuál?', estado: {}, opciones: { e1: 'chat «Ana»', e2: 'chat «Beto»' }, privado: true })
    expect(jevLlamado).toBe(false)
    expect(d.eleccion).toBe('e2')
    expect(d.cedio).toMatch(/privado/)
  })
  it('con privado y sin respaldo de Anthropic, falla cerrado', async () => {
    const jev: Decisor = { nombre: 'jev', decidir: async () => ({ eleccion: 'e1', confianza: 1, decisor: 'jev', ms: 1 } as any) }
    await expect(new DecisorEncadenado(jev, null).decidir({ pregunta: '¿cuál?', estado: {}, opciones: { e1: 'chat «Ana»' }, privado: true })).rejects.toBeInstanceOf(CedeDecision)
  })
})
