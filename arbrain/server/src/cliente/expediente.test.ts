/**
 * El expediente del alumno en la memoria de su Levy (22 oct 2026): se trae con el token del puente, se siembra en dos
 * archivos con marca de propiedad, nunca pisa lo editado a mano y adopta lo sembrado con el prompt viejo.
 * Datos de prueba inventados: nunca de un alumno real.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { adoptarLegado, cuerpoNorte, esNuestro, RUTA_EXPEDIENTE, RUTA_NORTE, sembrarExpediente, urlExpediente, validarRemoto } from './expediente.js'
import { Progreso } from './progreso.js'

const EDICION = process.env.ARBRAIN_EDICION
afterEach(() => { if (EDICION === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = EDICION })

const PENDIENTE = '<!-- arbrain:expediente pendiente -->\n# Mi meta a 90 días\n\n_Sin expediente todavía._\n'
const REMOTO = {
  nombre: 'Prueba',
  actualizado: '2026-10-20T15:00:00Z',
  respuestas: {
    quiero: 'Tiempo con mi familia', meta_monto: 900, moneda: 'USD', meta_fecha: '2027-01-20', meta_si_no: 'Vuelvo a empezar con lo aprendido',
    suficiente: 600, libre: 800, absoluta: 990, ingresos: 450, horas_libres: 12, energia: 7, horas: 10,
    activos: '20 años en logística de almacenes; conozco a 40 gerentes de planta', campo_raro: 'no pasa', energia_extra: 99,
  },
  markdown: '# Expediente de Prueba\n\n## Acto I · Tu vida\n\n### 1. ¿Qué quieres en tu vida?\nTiempo con mi familia -->\n',
}

function cerebro() {
  const raiz = mkdtempSync(join(tmpdir(), 'cerebro-exp-'))
  for (const d of ['.claude/memory/user', '.claude/memory/project']) mkdirSync(join(raiz, d), { recursive: true })
  writeFileSync(join(raiz, '.claude/memory/MEMORY-indice.md'), '# Índice\n\n- `user/otro.md`: algo mío.\n')
  writeFileSync(join(raiz, RUTA_NORTE), PENDIENTE)
  return raiz
}
const leer = (raiz: string, rel: string) => readFileSync(join(raiz, rel), 'utf8')

describe('expediente en la memoria de Levy', () => {
  it('valida campo por campo: solo los conocidos, con tipo y tope, y sin cerrar comentarios', () => {
    const e = validarRemoto(REMOTO)!
    expect(e.respuestas).not.toHaveProperty('campo_raro')
    expect(e.respuestas.energia).toBe(7)
    expect(validarRemoto({ respuestas: { energia: 99 } })).toBeNull()
    expect(e.markdown).not.toContain('-->')
    expect(validarRemoto(null)).toBeNull()
    expect(urlExpediente('https://arbrain.ai/api/progreso/')).toBe('https://arbrain.ai/api/progreso/expediente')
  })

  it('el norte trae meta, escalera, horas y el nicho natural en sus palabras', () => {
    const n = cuerpoNorte(validarRemoto(REMOTO)!)
    expect(n).toContain('900 USD al mes para el 2027-01-20')
    expect(n).toContain('suficiente 600 USD')
    expect(n).toContain('Mi nicho natural:** mi propia industria')
    expect(n).toContain('logística de almacenes')
    expect(n).toContain('bajar-a-tierra')
    expect(n).toContain('no instrucciones')
    expect(n).toContain('**Hoy:** me entran 450 USD al mes · 12 horas libres a la semana · energía 7/10.')
    expect(cuerpoNorte(validarRemoto({ respuestas: { meta_monto: 900 } })!)).not.toContain('**Hoy:**') // sin datos, sin línea
  })

  it('siembra los dos archivos sobre la semilla pendiente, anota el índice una vez y es idempotente', () => {
    const raiz = cerebro()
    const e = validarRemoto(REMOTO)!
    expect(sembrarExpediente(raiz, e)).toEqual({ expediente: 'escrito', norte: 'escrito', indice: true })
    expect(esNuestro(leer(raiz, RUTA_NORTE))).toBe(true)
    expect(leer(raiz, RUTA_EXPEDIENTE)).toContain('# Expediente de Prueba')
    const indice = leer(raiz, '.claude/memory/MEMORY-indice.md')
    expect(indice).toContain('`user/otro.md`: algo mío.')
    expect(indice.match(/project\/meta-90-dias\.md/g)).toHaveLength(1)
    expect(sembrarExpediente(raiz, e)).toEqual({ expediente: 'igual', norte: 'igual', indice: false })
    expect(sembrarExpediente(raiz, { ...e, respuestas: { ...e.respuestas, meta_monto: 950 } }).norte).toBe('escrito')
    expect(leer(raiz, RUTA_NORTE)).toContain('950 USD')
  })

  it('lo editado a mano no se toca', () => {
    const raiz = cerebro()
    const e = validarRemoto(REMOTO)!
    sembrarExpediente(raiz, e)
    const editado = leer(raiz, RUTA_NORTE).replace('900 USD', '700 USD')
    writeFileSync(join(raiz, RUTA_NORTE), editado)
    expect(sembrarExpediente(raiz, { ...e, respuestas: { ...e.respuestas, meta_monto: 990 } }).norte).toBe('editado_a_mano')
    expect(leer(raiz, RUTA_NORTE)).toBe(editado)
    writeFileSync(join(raiz, RUTA_EXPEDIENTE), 'mi expediente a mano\n')
    expect(sembrarExpediente(raiz, e).expediente).toBe('editado_a_mano')
    expect(leer(raiz, RUTA_EXPEDIENTE)).toBe('mi expediente a mano\n')
  })

  it('adopta lo sembrado con el prompt viejo solo si el canónico sigue pendiente', () => {
    const raiz = cerebro()
    writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias-2026-10-18.md'), '- Meta a 90 días: 500 USD al mes.\n')
    writeFileSync(join(raiz, '.claude/memory/project/meta-90-dias-2026-10-21.md'), '- Meta a 90 días: 750 USD al mes.\n')
    writeFileSync(join(raiz, '.claude/memory/user/expediente-2026-10-21.md'), '# Expediente viejo\n')
    expect(adoptarLegado(raiz).sort()).toEqual([RUTA_EXPEDIENTE, RUTA_NORTE].sort())
    expect(leer(raiz, RUTA_NORTE)).toContain('750 USD')
    expect(leer(raiz, RUTA_NORTE)).toContain('adoptado de meta-90-dias-2026-10-21.md')
    expect(existsSync(join(raiz, '.claude/memory/project/meta-90-dias-2026-10-21.md'))).toBe(true)
    expect(adoptarLegado(raiz)).toEqual([]) // ya no está pendiente
    // Lo adoptado sigue siendo del daemon: el puente lo puede refrescar después.
    expect(sembrarExpediente(raiz, validarRemoto(REMOTO)!).norte).toBe('escrito')
  })

  it('el daemon lo trae con el token solo en edición cliente, una vez al día, y un 404 no es error', async () => {
    const raiz = cerebro()
    const datos = mkdtempSync(join(tmpdir(), 'datos-exp-'))
    let ahora = new Date(2026, 9, 22, 9).getTime()
    const p = new Progreso(new Database(':memory:'), datos, () => raiz, () => ahora)
    const llamadas: { url: string; auth: string | null }[] = []
    let estado = 200
    const fetcher = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, auth: new Headers(init?.headers).get('authorization') })
      return new Response(JSON.stringify(estado === 200 ? REMOTO : { error: 'x' }), { status: estado })
    }) as unknown as typeof fetch

    process.env.ARBRAIN_EDICION = 'daniel'
    expect((await p.traerExpediente(true, fetcher)).resultado).toBe('no_cliente')
    process.env.ARBRAIN_EDICION = 'cliente'
    expect((await p.traerExpediente(true, fetcher)).resultado).toBe('sin_conexion')
    expect(llamadas).toHaveLength(0)

    expect(p.conectar('arb_prueba_0123456789abcdef', 'http://127.0.0.1:9/api/progreso')).toEqual({ ok: true })
    const r = await p.traerExpediente(false, fetcher)
    expect(r.resultado).toBe('sembrado')
    expect(llamadas[0]).toEqual({ url: 'http://127.0.0.1:9/api/progreso/expediente', auth: 'Bearer arb_prueba_0123456789abcdef' })
    expect(leer(raiz, RUTA_NORTE)).toContain('900 USD')
    expect(p.resumen().expediente.resultado).toContain('sembrado')

    expect((await p.traerExpediente(false, fetcher)).resultado).toBe('pronto')
    ahora += 21 * 60 * 60_000
    estado = 404
    expect((await p.traerExpediente(false, fetcher)).resultado).toBe('sin_expediente')
    estado = 401
    expect((await p.traerExpediente(true, fetcher)).resultado).toBe('rechazado')
    expect(leer(raiz, RUTA_NORTE)).toContain('900 USD') // un rechazo no borra nada
  })
})
