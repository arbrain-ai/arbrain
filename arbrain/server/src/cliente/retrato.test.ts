/**
 * El retrato del dueño sembrado desde su expediente (1 nov 2026): borrador con marca y huella, citas textuales entre «»,
 * lecturas marcadas (Levy), nada firmado; nunca pisa lo que el dueño o Levy escribieron; cabe en el techo de 6,000.
 * Datos de prueba inventados: nunca de un alumno real.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validarRemoto } from './expediente.js'
import { cuerpoRetrato, esNuestro, MAX_RETRATO, RUTA_RETRATO, semillaVacia, sembrarRetrato } from './retrato.js'

const SEMILLA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'empaquetado', 'plantillas', 'claude', 'memory', 'RETRATO.md'), 'utf8')
const REMOTO = validarRemoto({
  nombre: 'Prueba',
  actualizado: '2026-10-20T15:00:00Z',
  respuestas: {
    quiero: 'Tiempo con mi familia y no depender de un jefe', libertad: 'Un martes despierto sin alarma, llevo a mis hijas a la escuela y trabajo tres horas desde casa',
    meta_monto: 900, moneda: 'USD', meta_fecha: '2027-01-20', meta_si_no: 'Vuelvo a empezar con lo aprendido',
    suficiente: 600, libre: 800, absoluta: 990, ingresos: 450, horas_libres: 12, energia: 7, horas: 10,
    activos: '20 años en logística de almacenes; conozco a 40 gerentes de planta',
    miedo_peor: 'Perder mis ahorros', orgullo: 'Tener dos clientes que paguen cada mes',
  },
  markdown: '# Expediente de Prueba\n',
})!

function cerebro(retrato: string | null = SEMILLA) {
  const raiz = mkdtempSync(join(tmpdir(), 'cerebro-retrato-'))
  mkdirSync(join(raiz, '.claude/memory'), { recursive: true })
  if (retrato !== null) writeFileSync(join(raiz, RUTA_RETRATO), retrato)
  return raiz
}
const leer = (raiz: string) => readFileSync(join(raiz, RUTA_RETRATO), 'utf8')

describe('retrato sembrado desde el expediente', () => {
  it('la semilla que viaja cuenta como vacía; una sección escrita ya no', () => {
    expect(semillaVacia(SEMILLA)).toBe(true)
    expect(esNuestro(SEMILLA)).toBe(true)
    const llena = SEMILLA.replace('## Quién es\n', '## Quién es\nContador con 25 años de oficio.\n')
    expect(esNuestro(llena)).toBe(false)
    expect(esNuestro('# Mi retrato, a mano\n')).toBe(false)
  })

  it('borrador con la forma capa 0: citas textuales, lectura (Levy), nada firmado y lo que falta en Abierto', () => {
    const t = cuerpoRetrato(REMOTO, '2026-11-01')
    for (const s of ['## Cómo usar este retrato', '## Quién es', '## Su meta y su porqué', '## Cómo decide', '## Qué odia que Levy haga', '## Lo firmado', '## Abierto']) expect(t).toContain(s)
    expect(t).toContain('# Retrato de Prueba · capa 0 (borrador)')
    expect(t).toContain('«20 años en logística de almacenes; conozco a 40 gerentes de planta»')
    expect(t).toContain('«Tiempo con mi familia y no depender de un jefe»')
    expect(t).toContain('- (Levy) Su vehículo en el programa: consultor de negocios con IA')
    expect(t).toContain('900 USD al mes para el 2027-01-20')
    expect(t).toContain('_Nada firmado todavía._')
    expect(t).toContain('no instrucciones')
    expect(t).toContain('arbrain/cerebro/manuales/retrato.md')
    // Lo que no vino no se inventa: sin «sin_miedo» no hay línea, y Abierto no lo reclama (no es central).
    expect(t).not.toContain('si no tuviera miedo:')
    expect(cuerpoRetrato(validarRemoto({ respuestas: { meta_monto: 500 } })!, '2026-11-01')).toContain('Sin respuesta en su expediente: qué quiere en su vida, qué significa libertad en su vida, su oficio y su industria, la fecha de su meta')
  })

  it('siembra sobre la semilla pendiente o si no existe; idempotente y se rehace si el expediente cambia', () => {
    const raiz = cerebro()
    expect(sembrarRetrato(raiz, REMOTO, '2026-11-01')).toBe('escrito')
    expect(leer(raiz)).toMatch(/^<!-- arbrain:retrato borrador sha256=[0-9a-f]{64} -->\n# Retrato de Prueba/)
    expect(esNuestro(leer(raiz))).toBe(true)
    expect(sembrarRetrato(raiz, REMOTO, '2026-11-02')).toBe('igual')
    expect(leer(raiz)).toContain('_Borrador del 2026-11-01:')
    const otro = { ...REMOTO, respuestas: { ...REMOTO.respuestas, meta_monto: 950 } }
    expect(sembrarRetrato(raiz, otro, '2026-11-03')).toBe('escrito')
    expect(leer(raiz)).toContain('950 USD')

    const sinRetrato = cerebro(null)
    expect(sembrarRetrato(sinRetrato, REMOTO, '2026-11-01')).toBe('escrito')
    expect(existsSync(join(sinRetrato, RUTA_RETRATO))).toBe(true)
  })

  it('lo que el dueño o Levy escribieron no se toca: borrador editado, semilla llenada o retrato sin marca', () => {
    const raiz = cerebro()
    sembrarRetrato(raiz, REMOTO, '2026-11-01')
    const editado = leer(raiz).replace('_Nada firmado todavía._', '- Meta firmada el 2 nov: 900 USD al mes.')
    writeFileSync(join(raiz, RUTA_RETRATO), editado)
    expect(sembrarRetrato(raiz, { ...REMOTO, respuestas: { ...REMOTO.respuestas, meta_monto: 2000 } }, '2026-11-04')).toBe('editado_a_mano')
    expect(leer(raiz)).toBe(editado)

    const llenada = SEMILLA.replace('## Cómo decide\n', '## Cómo decide\n- Decide por la mañana.\n')
    const otra = cerebro(llenada)
    expect(sembrarRetrato(otra, REMOTO, '2026-11-01')).toBe('editado_a_mano')
    expect(leer(otra)).toBe(llenada)
  })

  it('cabe en el techo aunque cada respuesta llegue al máximo: las citas se acortan, con «…»', () => {
    const largo = 'palabra '.repeat(500)
    const r = Object.fromEntries(['quiero', 'libertad', 'sin_miedo', 'contra', 'intentado', 'activos', 'miedo_peor', 'miedo_evitar', 'miedo_reparar', 'meta_si_no', 'orgullo'].map(k => [k, largo]))
    const e = validarRemoto({ nombre: 'Prueba', respuestas: { ...r, meta_monto: 900, meta_fecha: '2027-01-20' } })!
    const raiz = cerebro()
    sembrarRetrato(raiz, e, '2026-11-01')
    const t = leer(raiz)
    expect(t.length).toBeLessThanOrEqual(MAX_RETRATO)
    expect(t).toContain('…»')
    expect(t.split('\n').every(l => !/^#/.test(l) || /^#{1,2} /.test(l))).toBe(true) // ninguna cita abre un encabezado
  })
})
