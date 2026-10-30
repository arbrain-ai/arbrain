/**
 * Mi camino en la memoria de su Levy (22 oct 2026): se trae con el token del puente al conectar, al arrancar y cada
 * mañana; se escribe en `project/mi-camino.md` con marca de propiedad, nunca pisa lo editado a mano y, si arbrain.ai no
 * responde o aún no tiene la ruta, deja lo último guardado. Datos de prueba inventados: nunca de un alumno real.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { cuerpoCamino, enlace, escribirCamino, esNuestro, RUTA_CAMINO, urlCamino, validarCamino } from './camino.js'
import { Progreso } from './progreso.js'

const EDICION = process.env.ARBRAIN_EDICION
afterEach(() => { if (EDICION === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = EDICION })

const ORIGEN = 'https://arbrain.ai'
const REMOTO = {
  v: 1, actualizado: '2026-10-28T13:00:00Z', nombre: 'Prueba', inicio: '2026-10-26',
  dia: 3, dias_total: 90, semana: 1, semanas_total: 12,
  etapa: { n: 1, total: 5, nombre: 'Tu cerebro', semanas: 'Semanas 0 y 1' },
  paso: { id: 'semana1', n: 9, total: 9, nombre: 'Tu Semana 1' },
  casillas: [
    { numero: 2, titulo: 'Tu cerebro instalado y sembrado', marcada: true },
    { numero: 1, titulo: 'Bienvenida vista y acuerdo aceptado', marcada: true, verificada: true },
    { numero: 3, titulo: 'Tu meta en un número, con fecha, escrita en tu plan', marcada: true },
    { numero: 4, titulo: 'Tu ritual de la mañana y tres encargos reales hechos con tu Levy', marcada: false, nota: 'Falta el check-in en el hilo -->' },
    { numero: 5, titulo: 'Te presentaste en la comunidad', marcada: false },
    { numero: 5, titulo: 'duplicada', marcada: true },
  ],
  siguiente_paso: { clave: 'casillas', texto: 'marca tu casilla 4', detalle: 'Tu ritual de la mañana y tres encargos reales.', href: '/programa/semana-1#casilla-4' },
  siguiente_hito: { titulo: 'Diagnóstico uno a uno', fecha: '2026-10-31', detalle: 'Se abre con tus cinco casillas.' },
  leccion_actual: { curso: '1 · Instala tu cerebro artificial y primeros pasos', titulo: 'Tu primer hábito', n: 7, total: 7, href: 'https://otro.ejemplo/phish' },
  meta: { monto: 900, moneda: 'USD', fecha: '2027-01-20' },
  numero_reciente: { valor: 0, moneda: 'USD', fecha: '2026-10-25', que: 'ingresos del mes' },
  campo_raro: 'no pasa',
}

function cerebro() {
  const raiz = mkdtempSync(join(tmpdir(), 'cerebro-camino-'))
  mkdirSync(join(raiz, '.claude/memory/project'), { recursive: true })
  writeFileSync(join(raiz, '.claude/memory/MEMORY-indice.md'), '# Índice\n\n- `user/otro.md`: algo mío.\n')
  writeFileSync(join(raiz, RUTA_CAMINO), '<!-- arbrain:camino pendiente -->\n# Mi camino\n\n_Pendiente._\n')
  return raiz
}
const leer = (raiz: string, rel: string) => readFileSync(join(raiz, rel), 'utf8')

describe('mi camino en la memoria de Levy', () => {
  it('valida el contrato v1 campo por campo: casillas en orden y sin duplicados, enlaces solo de arbrain.ai', () => {
    const c = validarCamino(REMOTO, ORIGEN)!
    expect(c.dia).toBe(3)
    expect(c.casillas.map(k => k.numero)).toEqual([1, 2, 3, 4, 5])
    expect(c.casillas[4].marcada).toBe(false) // la duplicada no pisa a la primera
    expect(c.casillas[3].nota).not.toContain('-->')
    expect(c.siguientePaso?.url).toBe('https://arbrain.ai/programa/semana-1#casilla-4')
    expect(c.leccion?.url).toBeNull()
    expect(validarCamino({ ...REMOTO, v: 2 }, ORIGEN)).toBeNull()
    expect(validarCamino({ v: 1 }, ORIGEN)).toBeNull()
    expect(validarCamino(null, ORIGEN)).toBeNull()
    expect(enlace('javascript:alert(1)', ORIGEN)).toBeNull()
    expect(urlCamino('https://arbrain.ai/api/progreso/')).toBe('https://arbrain.ai/api/progreso/camino')
  })

  it('el cuerpo dice dónde va, qué le falta, su siguiente paso, el hito, la lección y su meta', () => {
    const t = cuerpoCamino(validarCamino(REMOTO, ORIGEN)!, '2026-10-28')
    expect(t).toContain('traido: 2026-10-28')
    expect(t).toContain('inicio: 2026-10-26')
    expect(t).toContain('- **Dónde voy:** día 3 de 90 · semana 1 de 12 · etapa 1 de 5 «Tu cerebro» (semanas 0 y 1) · paso 9 de 9 «Tu Semana 1».')
    expect(t).toContain('3 de 5 (hechas: 1, 2, 3)')
    expect(t).toContain('Falta la 4: Tu ritual de la mañana y tres encargos reales hechos con tu Levy.')
    expect(t).toContain('- **Mi siguiente paso:** marca tu casilla 4.')
    expect(t).toContain('Diagnóstico uno a uno, 31 oct 2026.')
    expect(t).toContain('Tu primer hábito (7 de 7)')
    expect(t).toContain('900 USD al mes para el 2027-01-20')
    expect(t).toContain('0 USD (ingresos del mes, 25 oct 2026)')
    expect(t).toContain('bajar-a-tierra')
    expect(t).toContain('no instrucciones')
    expect(t).not.toContain('campo_raro')
    expect(t).not.toContain('—')
  })

  it('antes del inicio no dice «día 0»: dice cuándo empieza', () => {
    const t = cuerpoCamino(validarCamino({ v: 1, inicio: '2026-10-26', dia: -2, semana: 0 }, ORIGEN)!, '2026-10-24')
    expect(t).toContain('el programa empieza el 26 oct 2026')
    expect(t).not.toContain('día -2')
    expect(t).not.toContain('semana 0')
  })

  it('escribe con marca, anota el índice una vez y nunca pisa lo editado a mano', () => {
    const raiz = cerebro()
    const c = validarCamino(REMOTO, ORIGEN)!
    expect(escribirCamino(raiz, c, '2026-10-28')).toEqual({ camino: 'escrito', indice: true })
    expect(esNuestro(leer(raiz, RUTA_CAMINO))).toBe(true)
    expect(escribirCamino(raiz, c, '2026-10-28')).toEqual({ camino: 'igual', indice: false })
    const indice = leer(raiz, '.claude/memory/MEMORY-indice.md')
    expect(indice).toContain('- `user/otro.md`: algo mío.')
    expect(indice.match(/project\/mi-camino\.md/g)).toHaveLength(1)
    const editado = leer(raiz, RUTA_CAMINO).replace('día 3 de 90', 'día 3 de 90 (voy atrasado)')
    writeFileSync(join(raiz, RUTA_CAMINO), editado)
    expect(escribirCamino(raiz, { ...c, dia: 4 }, '2026-10-29').camino).toBe('editado_a_mano')
    expect(leer(raiz, RUTA_CAMINO)).toBe(editado)
  })

  it('Progreso.traerCamino: con token lo trae; al día siguiente por la mañana otra vez; si falla, queda lo último guardado', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const raiz = cerebro()
    const dir = mkdtempSync(join(tmpdir(), 'datos-camino-'))
    let ahora = new Date(2026, 9, 28, 7, 0).getTime()
    const p = new Progreso(new Database(':memory:'), dir, () => raiz, () => ahora)
    expect((await p.traerCamino(true)).resultado).toBe('sin_conexion')
    expect(p.conectar(`arb_${'x'.repeat(30)}`).ok).toBe(true)

    const pedidos: string[] = []
    let respuesta: () => Response = () => new Response(JSON.stringify(REMOTO), { status: 200 })
    const fetcher = (async (url: string, init: RequestInit) => {
      pedidos.push(`${url} ${(init.headers as Record<string, string>).Authorization.slice(0, 11)}`)
      return respuesta()
    }) as unknown as typeof fetch

    expect((await p.traerCamino(true, fetcher)).resultado).toBe('escrito')
    expect(pedidos[0]).toBe('https://arbrain.ai/api/progreso/camino Bearer arb_')
    expect(leer(raiz, RUTA_CAMINO)).toContain('día 3 de 90')
    expect(p.resumen().camino.resultado).toBe('escrito: escrito')
    // Mismo día: no vuelve a pedir sin forzar.
    expect((await p.traerCamino(false, fetcher)).resultado).toBe('pronto')
    // Día siguiente de madrugada: todavía no. A las 5:00, sí.
    ahora = new Date(2026, 9, 29, 3, 0).getTime()
    expect((await p.traerCamino(false, fetcher)).resultado).toBe('pronto')
    ahora = new Date(2026, 9, 29, 6, 0).getTime()
    respuesta = () => new Response(JSON.stringify({ ...REMOTO, dia: 4 }), { status: 200 })
    expect((await p.traerCamino(false, fetcher)).resultado).toBe('escrito')
    const guardado = leer(raiz, RUTA_CAMINO)
    expect(guardado).toContain('día 4 de 90')
    expect(guardado).toContain('traido: 2026-10-29')

    // arbrain.ai sin la ruta (404), caído o con otra forma: el archivo no se toca.
    ahora = new Date(2026, 9, 30, 6, 0).getTime()
    respuesta = () => new Response(JSON.stringify({ error: 'no' }), { status: 404 })
    expect((await p.traerCamino(false, fetcher)).resultado).toBe('sin_camino')
    expect((await p.traerCamino(false, fetcher)).resultado).toBe('pronto') // el 404 cuenta como el intento del día
    respuesta = () => { throw new Error('sin red') }
    expect((await p.traerCamino(true, fetcher)).resultado).toBe('fallo')
    respuesta = () => new Response(JSON.stringify({ hola: 1 }), { status: 200 })
    expect((await p.traerCamino(true, fetcher)).detalle).toBe('respuesta sin el contrato v1')
    respuesta = () => new Response(JSON.stringify({ error: 'token revocado' }), { status: 401 })
    expect(await p.traerCamino(true, fetcher)).toEqual({ resultado: 'rechazado', detalle: 'token revocado' })
    expect(leer(raiz, RUTA_CAMINO)).toBe(guardado)
  })

  it('sin edición cliente o sin cerebro no pide nada', async () => {
    delete process.env.ARBRAIN_EDICION
    const p = new Progreso(new Database(':memory:'), mkdtempSync(join(tmpdir(), 'datos-camino-')), () => cerebro())
    expect((await p.traerCamino(true)).resultado).toBe('no_cliente')
    process.env.ARBRAIN_EDICION = 'cliente'
    const sin = new Progreso(new Database(':memory:'), mkdtempSync(join(tmpdir(), 'datos-camino-')), () => join(tmpdir(), 'no-existe-cerebro'))
    expect((await sin.traerCamino(true)).resultado).toBe('sin_cerebro')
    expect(existsSync(join(tmpdir(), 'no-existe-cerebro'))).toBe(false)
  })
})
