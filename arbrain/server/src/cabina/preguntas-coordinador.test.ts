import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatJournal } from '../chat-runtime/journal.js'
import { Despertadores, dispararVencidos } from '../chat-runtime/despertadores.js'
import { decidirPregunta, revisarSubagentes, type Observacion, type PuertoAviso } from './aviso-subagentes.js'
import { anotar, dialogoAbierto, enviarSeguimiento, leerAnuncio, leerRegistro, mutarRegistro, podarRegistro, rescatar, rescatarHuerfanos, type Lanzamiento, type PuertoSeguimiento, type Subagente } from './cuerpo.js'

const origen = { owner: 'daniel', account: 'default', conversationId: 'planeacion-mensual' }
const T0 = Date.parse('2026-10-05T23:00:00Z')
const sub = (id: number, extra: Partial<Subagente> = {}): Subagente => ({ id, pid: id * 10, nombre: `s${id}`, harness: 'claude', encargo: 'mide el lienzo', cwd: '/tmp/s', creado: new Date(T0).toISOString(), motor: true, entrega: 'entregado', avisarA: origen, ...extra })

const DIALOGO = `╭──────────────────────────────╮
│ ☐ Enfoque                    │
│ ¿Qué técnica uso para el culling? │
│ ❯ 1. Quadtree                │
│      Más rápido con miles     │
│   2. Rejilla fija            │
│   3. Type something.         │
╰──────────────────────────────╯
 Enter to select · Tab/Arrow keys to navigate · Esc to cancel`

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cabina-reg-')); process.env.ARBRAIN_CONFIG_DIR = dir })
afterEach(() => { delete process.env.ARBRAIN_CONFIG_DIR })

describe('registro de subagentes: la propiedad no se pierde', () => {
  it('20 escrituras en paralelo no pierden ninguna entrada (candado + escritura atómica)', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => mutarRegistro(l => [...l, sub(100000 + i)])))
    expect((await leerRegistro()).map(s => s.id).sort()).toEqual(Array.from({ length: 20 }, (_, i) => 100000 + i))
  })

  it('un archivo a medio escribir NUNCA se lee como vacío: se usa el respaldo y delegar no lo pisa', async () => {
    await mutarRegistro(() => [sub(100091), sub(100092)])
    writeFileSync(join(dir, 'subagentes.json'), '[{"id": 100091, "nom')
    expect((await leerRegistro()).map(s => s.id)).toEqual([100091, 100092])
    await mutarRegistro(l => [...l, sub(100101)])
    expect(JSON.parse(readFileSync(join(dir, 'subagentes.json'), 'utf8')).map((s: Subagente) => s.id)).toEqual([100091, 100092, 100101])
  })

  it('sin archivo ni respaldo legibles, falla en vez de devolver vacío', async () => {
    writeFileSync(join(dir, 'subagentes.json'), '{roto')
    writeFileSync(join(dir, 'subagentes.json.bak'), '{roto')
    await expect(leerRegistro()).rejects.toThrow(/no se puede leer/)
  })

  it('la poda solo quita cerrados viejos, nunca a un subagente abierto', () => {
    const l = [sub(1), ...Array.from({ length: 60 }, (_, i) => sub(10 + i, { cerrado: 'x' })), sub(2)]
    const p = podarRegistro(l)
    expect(p.filter(s => !s.cerrado).map(s => s.id)).toEqual([1, 2])
    expect(p.filter(s => s.cerrado)).toHaveLength(50)
  })

  it('anotar no pisa lo que otro proceso escribió entre medias', async () => {
    await mutarRegistro(() => [sub(7)])
    await Promise.all([anotar(7, 70, { tokens: 5 }), mutarRegistro(l => [...l, sub(8)])])
    const l = await leerRegistro()
    expect(l.find(s => s.id === 7)?.tokens).toBe(5)
    expect(l.map(s => s.id)).toContain(8)
  })
})

describe('rescate de huérfanos desde el diario de turnos', () => {
  const resultado = 'Subagente «Lienzo: que no se trabe (rendimiento)» lanzado en el motor de Arbrain: agenteId 100091 (claude · claude-opus-5-5, permisos bypassPermissions, /Users/alumno/Developer/wt-lienzo-rendimiento). El encargo ya le llegó.'
  const snapshot = JSON.stringify({ items: [{ type: 'tool', name: 'mcp__cabina__delegar', input: JSON.stringify({ nombre: 'Lienzo: que no se trabe (rendimiento)', harness: 'claude', encargo: 'Mide y arregla el lienzo', cwd: '/Users/alumno/Developer/wt-lienzo-rendimiento' }), result: resultado }] })

  it('lee nombre, harness, modelo, carpeta y encargo del anuncio de delegar', () => {
    expect(leerAnuncio(100091, snapshot)).toEqual({ nombre: 'Lienzo: que no se trabe (rendimiento)', harness: 'claude', modelo: 'claude-opus-5-5', cwd: '/Users/alumno/Developer/wt-lienzo-rendimiento', encargo: 'Mide y arregla el lienzo' })
    expect(leerAnuncio(100009, snapshot)).toBeNull()
  })

  const lanz: Lanzamiento = { origen, nombre: 'Lienzo', harness: 'claude', modelo: 'claude-opus-5-5', cwd: '/Users/alumno/Developer/wt-lienzo-rendimiento', encargo: 'Mide', anunciadoMs: T0 - 1000 }
  it('solo adopta terminales propias del motor que el diario anunció, en su misma carpeta', () => {
    const buscar = (id: number) => id === 100091 ? lanz : null
    const terms = [
      { id: 100091, pid: 19306, origin: 'motor', born_ms: T0, cwd: '/Users/alumno/Developer/wt-lienzo-rendimiento' },
      { id: 100092, pid: 1, origin: 'motor', born_ms: T0 },
      { id: 42, pid: 2, origin: 'sfterm-ptyd', born_ms: T0 },
    ]
    const r = rescatar([], terms, buscar, T0)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 100091, pid: 19306, nombre: 'Lienzo', avisarA: origen, origen: origen.conversationId, motor: true, entrega: 'entregado', avisadoHasta: T0 })
    expect(rescatar([], [{ ...terms[0], cwd: '/Users/alumno/Developer/otra' }], buscar, T0)).toEqual([])
    // ya está en el registro con su pid: no se duplica
    expect(rescatar([sub(100091, { pid: 19306 })], terms, buscar, T0)).toEqual([])
  })

  it('en disco: tras el rescate, retomar y cerrar lo reconocen como de Levy (y no se busca dos veces)', async () => {
    await mutarRegistro(() => [sub(100101)])
    let busquedas = 0
    const buscar = (id: number) => { busquedas++; return id === 100091 ? lanz : null }
    const vistos = new Set<string>()
    const terms = [{ id: 100091, pid: 19306, origin: 'motor', born_ms: T0, cwd: lanz.cwd }]
    expect(await rescatarHuerfanos(terms, vistos, buscar)).toHaveLength(1)
    expect(await rescatarHuerfanos(terms, vistos, buscar)).toHaveLength(0)
    expect(busquedas).toBe(1)
    expect((await leerRegistro()).map(s => s.id)).toEqual([100101, 100091])
  })
})

describe('diálogos del subagente', () => {
  it('reconoce AskUserQuestion y permisos, no la caja normal', () => {
    expect(dialogoAbierto(DIALOGO)).toEqual({ pregunta: '¿Qué técnica uso para el culling?', opciones: ['Quadtree', 'Rejilla fija', 'Type something.'] })
    expect(dialogoAbierto(' Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and don\'t ask again\n   3. No (esc)')?.pregunta).toBe('Do you want to proceed?')
    expect(dialogoAbierto('⏺ Listo. ¿Arranco con la fase 2?\n────\n❯ \n────\n  ⏵⏵ bypass permissions on')).toBeNull()
  })

  const puerto = (pantallas: string[]) => {
    const escrito: string[] = []
    let i = 0
    const p: PuertoSeguimiento = {
      estado: async () => ({ enCaja: !dialogoAbierto(pantallas[Math.min(i, pantallas.length - 1)]), trabajando: false }),
      pantalla: async () => pantallas[Math.min(i, pantallas.length - 1)],
      escribir: async d => { escrito.push(d); if (d === '\r' || d === '\x1b') i++ },
      consta: async t => escrito.some(e => e.includes(t)),
      dialogo: async () => dialogoAbierto(pantallas[Math.min(i, pantallas.length - 1)]),
    }
    return { p, escrito }
  }

  it('retomar con un número elige esa opción (flechas + Enter) y confirma que el diálogo se fue', async () => {
    const { p, escrito } = puerto([DIALOGO, '⏺ Uso Rejilla fija.\n❯ \n? for shortcuts'])
    const r = await enviarSeguimiento('2', p, { pausaMs: 5, confirmaMs: 200 })
    expect(r).toEqual({ encolado: false, confirmado: true, eligio: 2 })
    expect(escrito).toEqual(['\x1b[B', '\r'])
  })

  it('retomar con texto libre cierra el diálogo con Esc y lo manda como mensaje', async () => {
    const { p, escrito } = puerto([DIALOGO, '❯ \n? for shortcuts'])
    const r = await enviarSeguimiento('Usa la rejilla, es más simple', p, { pausaMs: 5, confirmaMs: 200 })
    expect(escrito[0]).toBe('\x1b')
    expect(escrito.some(e => e.includes('Usa la rejilla'))).toBe(true)
    expect(r.confirmado).toBe(true)
  })
})

describe('ruta de preguntas: primero el coordinador, Daniel solo si nadie responde', () => {
  const dialogo: Observacion = { vivo: true, trabajando: true, ultimaActividad: T0, ultimaRespuesta: null, pregunta: null, dialogo: { pregunta: '¿Qué técnica uso?', opciones: ['Quadtree', 'Rejilla'] } }
  const ESCALA = 10 * 60_000

  it('un diálogo nuevo despierta a la conversación de origen con la pregunta textual, sin tocar a Daniel', () => {
    const d = decidirPregunta(sub(1), dialogo, T0, { origenExiste: true, escalaMs: ESCALA })
    expect(d.dueno).toBeUndefined()
    expect(d.coordinador).toMatch(/DETENIDO EN UN DIÁLOGO[\s\S]*¿Qué técnica uso\? · Opciones: 1\. Quadtree · 2\. Rejilla[\s\S]*retomar \{agenteId:1, texto:"<número/)
    expect(d.cambio?.pregunta).toMatchObject({ tipo: 'dialogo', desde: T0 })
  })

  it('sube a Daniel a los N minutos si sigue sin respuesta, una sola vez', () => {
    const conPregunta = sub(1, decidirPregunta(sub(1), dialogo, T0, { origenExiste: true, escalaMs: ESCALA }).cambio)
    expect(decidirPregunta(conPregunta, dialogo, T0 + ESCALA - 1, { origenExiste: true, escalaMs: ESCALA })).toEqual({})
    const e = decidirPregunta(conPregunta, dialogo, T0 + ESCALA, { origenExiste: true, escalaMs: ESCALA })
    expect(e.dueno?.motivo).toBe('Levy no la atendió en 10 min')
    expect(e.cambio?.escalado).toBeTruthy()
    expect(decidirPregunta({ ...conPregunta, ...e.cambio }, dialogo, T0 + 2 * ESCALA, { origenExiste: true, escalaMs: ESCALA })).toEqual({})
  })

  it('sube de inmediato si la conversación de origen ya no existe o no se conoce', () => {
    expect(decidirPregunta(sub(1), dialogo, T0, { origenExiste: false, escalaMs: ESCALA }).dueno?.motivo).toMatch(/ya no existe/)
    expect(decidirPregunta(sub(1, { avisarA: undefined }), dialogo, T0, { origenExiste: true, escalaMs: ESCALA }).dueno?.motivo).toMatch(/No se sabe/)
  })

  it('un rescatado no repite su «terminó» viejo, pero su pregunta abierta sí llega a Levy (una vez)', async () => {
    const registro: Subagente[] = [sub(100091, { avisadoHasta: T0 })]
    const avisos: string[] = []
    const quietoConPregunta: Observacion = { vivo: true, trabajando: false, ultimaActividad: T0 - 60_000, ultimaRespuesta: 'Medí: 18 fps. ¿Sigo con el culling?', pregunta: '¿Sigo con el culling?' }
    const p: PuertoAviso = { registro: async () => registro, observar: async () => quietoConPregunta, anotar: async (s, c) => { Object.assign(registro.find(x => x.id === s.id)!, c) }, avisar: (_o, t) => { avisos.push(t) }, origenExiste: () => true }
    expect(await revisarSubagentes(p, T0 + 60_000)).toBe(1)
    expect(avisos[0]).toMatch(/QUIETO CON UNA PREGUNTA PARA TI[\s\S]*«¿Sigo con el culling\?»/)
    expect(await revisarSubagentes(p, T0 + 120_000)).toBe(0)
  })

  it('cuando Levy contesta (la pregunta desaparece) se borran la marca y la escalada', () => {
    const s = sub(1, { pregunta: { tipo: 'dialogo', texto: 'x', firma: 'f', desde: T0 }, escalado: 'ya' })
    expect(decidirPregunta(s, { ...dialogo, dialogo: null, trabajando: true }, T0 + 1, { origenExiste: true }).cambio).toEqual({ pregunta: undefined, escalado: undefined, escaladoPor: undefined })
  })

  it('de punta a punta: la pregunta llega como turno a «Planeación mensual» y a Daniel solo tras el plazo', async () => {
    const db = new Database(':memory:')
    let ahora = T0
    const clock = () => ahora
    const journal = new ChatJournal(db, clock), despertadores = new Despertadores(db, clock)
    journal.accept({ ...origen, turnId: 'previo' }, { message: 'lanza el lienzo', source: 'desktop', overrides: { model: 'claude-opus-5-5', effort: null, fast: false, ultracode: false } })
    const registro: Subagente[] = [sub(100091)]
    const aDaniel: string[] = []
    process.env.ARBRAIN_PREGUNTA_ESCALA_MIN = '10'
    const p: PuertoAviso = {
      registro: async () => registro,
      observar: async () => dialogo,
      anotar: async (s, c) => { Object.assign(registro.find(x => x.id === s.id)!, c) },
      avisar: (o, texto) => { despertadores.avisar(o, texto) },
      origenExiste: o => !!journal.latest(o.owner, o.account, o.conversationId),
      escalar: (_s, texto) => { aDaniel.push(texto) },
    }
    expect(await revisarSubagentes(p, ahora)).toBe(1)
    ahora += 1
    expect(dispararVencidos(despertadores, journal, { info: () => {}, warn: () => {} })).toBe(1)
    const turno = journal.latest(origen.owner, origen.account, origen.conversationId)!
    expect((turno.input as { message: string }).message).toMatch(/^\[Aviso del motor s-[0-9a-f]{8} · un subagente que lanzaste desde esta conversación te pregunta algo\][\s\S]*¿Qué técnica uso\?/)
    expect(aDaniel).toEqual([])
    expect(await revisarSubagentes(p, T0 + 5 * 60_000)).toBe(0)
    expect(aDaniel).toEqual([])
    await revisarSubagentes(p, T0 + 10 * 60_000)
    expect(aDaniel).toHaveLength(1)
    expect(aDaniel[0]).toMatch(/Levy no la atendió en 10 min/)
    expect(registro[0].escalado).toBeTruthy()
    delete process.env.ARBRAIN_PREGUNTA_ESCALA_MIN
  })
})
