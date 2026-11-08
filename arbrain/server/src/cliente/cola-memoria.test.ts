/**
 * Cola por memoria (5 nov 2026, uno a uno con un fundador de MacBook de 8 GB: «mínimo 1.8 GB libres para lanzar un
 * agente; si no, entra en cola»). Estas pruebas simulan la memoria de la máquina y fijan:
 *   1. el umbral se calibra por la RAM total (8 GB → 1.8 GB, techo de 3 GB);
 *   2. con poca memoria, rutinas y subagentes se forman y salen solos EN ORDEN, uno a la vez, cuando hay aire;
 *      subir la prioridad cambia el orden y «Lanzar ya» lo saca sin aire;
 *   3. la instalación original no cambia (apagada) y, prendida en una máquina como el Studio, nunca encola con RAM de sobra;
 *   4. el gancho del subagente espera, lo devuelve al agente con su lugar y, al haber aire, Arbrain le escribe en su
 *      conversación; la misma llamada repetida sale sin volver a formarse;
 *   5. el scheduler deja vencida la rutina sin aire y la corre cuando hay; con el espejo, la otra máquina puede tomarla.
 */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ASENTAMIENTO_MS, ColaMemoria, colaActiva, huellaSubagente, iniciarRelojCola, mensajeAdmitido, turnoSubagente, umbralBytes, _colaParaPruebas, type Medida } from './cola-memoria.js'

const GB = 1024 ** 3
const previo = { edicion: process.env.ARBRAIN_EDICION, cola: process.env.ARBRAIN_COLA_MEMORIA, mb: process.env.ARBRAIN_COLA_MEMORIA_MB, espera: process.env.ARBRAIN_COLA_MEMORIA_ESPERA_MAX_S }
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_EDICION', previo.edicion], ['ARBRAIN_COLA_MEMORIA', previo.cola], ['ARBRAIN_COLA_MEMORIA_MB', previo.mb], ['ARBRAIN_COLA_MEMORIA_ESPERA_MAX_S', previo.espera]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
})
beforeEach(() => { process.env.ARBRAIN_EDICION = 'cliente'; delete process.env.ARBRAIN_COLA_MEMORIA; delete process.env.ARBRAIN_COLA_MEMORIA_MB; delete process.env.ARBRAIN_COLA_MEMORIA_ESPERA_MAX_S })

/** Una máquina de mentira: RAM total fija, memoria libre que la prueba mueve, reloj que la prueba avanza. */
function maquina(totalGb: number, libreGb: number) {
  const m = { libre: libreGb * GB, t: 1_000_000 }
  const db = new Database(':memory:')
  const cola = new ColaMemoria(db, { medir: async (): Promise<Medida> => ({ libreBytes: m.libre, totalBytes: totalGb * GB }), ahora: () => m.t, cacheMs: 0 })
  return { m, db, cola, pasa: (ms: number) => { m.t += ms } }
}

describe('umbral calibrado por la RAM total', () => {
  it('8 GB → 1.8 GB (la regla del fundador); 16 GB → 2.4 GB; 24 GB o más → 3 GB de techo', () => {
    expect(umbralBytes(8 * GB) / GB).toBeCloseTo(1.8, 5)
    expect(umbralBytes(16 * GB) / GB).toBeCloseTo(2.4, 5)
    expect(umbralBytes(24 * GB) / GB).toBeCloseTo(3, 5)
    expect(umbralBytes(192 * GB) / GB).toBeCloseTo(3, 5)
  })
  it('ARBRAIN_COLA_MEMORIA_MB lo fija a mano', () => {
    expect(umbralBytes(8 * GB, { ARBRAIN_COLA_MEMORIA_MB: '1024' })).toBe(1024 ** 3)
  })
})

describe('poca memoria: forma, ordena y lanza solo cuando hay aire', () => {
  it('tres encargos con 1.0 GB libres en 8 GB: los tres esperan con su lugar; con aire salen en orden, uno a la vez', async () => {
    const { m, cola, pasa } = maquina(8, 1.0)
    const a = await cola.pedir({ tipo: 'rutina', ref: 'brief', titulo: 'Brief' })
    const b = await cola.pedir({ tipo: 'subagente', ref: 'h-b', titulo: 'Investigar competencia', conversacion: { owner: 'o', account: 'default', conversationId: 'c1' } })
    const c = await cola.pedir({ tipo: 'rutina', ref: 'cierre', titulo: 'Cierre' })
    expect([a, b, c].map(t => t.lanzar)).toEqual([false, false, false])
    expect([a, b, c].map(t => !t.lanzar && t.posicion)).toEqual([1, 2, 3])

    // Se libera memoria: sale SOLO la primera; las de atrás esperan a que lo recién lanzado se asiente.
    m.libre = 2.2 * GB
    expect(await cola.pedir({ tipo: 'rutina', ref: 'cierre', titulo: 'Cierre' })).toMatchObject({ lanzar: false, posicion: 2 })
    // La revisión de arriba ya le apartó el lugar a «brief» (la primera): al pedir, sale.
    const r1 = await cola.pedir({ tipo: 'rutina', ref: 'brief', titulo: 'Brief' })
    expect(r1).toMatchObject({ lanzar: true, motivo: 'admitido' })
    expect((await cola.revisar()).map(e => e.ref)).toEqual([]) // 2.2 − 0.6 en vuelo = 1.6 < 1.8

    pasa(ASENTAMIENTO_MS + 1)
    // El subagente es el siguiente: queda admitido (su conversación lo relanzará); la rutina de atrás sigue esperando.
    expect((await cola.revisar()).map(e => e.ref)).toEqual(['h-b'])
    expect(await cola.pedir({ tipo: 'rutina', ref: 'cierre', titulo: 'Cierre' })).toMatchObject({ lanzar: false, posicion: 1 })
    expect(await cola.pedir({ tipo: 'subagente', ref: 'h-b', titulo: 'Investigar competencia' })).toMatchObject({ lanzar: true, motivo: 'admitido' })

    pasa(ASENTAMIENTO_MS + 1)
    expect(await cola.pedir({ tipo: 'rutina', ref: 'cierre', titulo: 'Cierre' })).toMatchObject({ lanzar: true, motivo: 'aire' })
    expect(cola.esperando()).toEqual([])
  })

  it('subir prioridad: lo que se mueve al primer lugar sale primero', async () => {
    const { m, cola, pasa } = maquina(8, 0.8)
    for (const ref of ['a', 'b', 'c']) await cola.pedir({ tipo: 'rutina', ref, titulo: ref })
    const c = cola.esperando().find(e => e.ref === 'c')!
    expect(cola.mover(c.id, 0)).toBe(true)
    expect(cola.esperando().map(e => e.ref)).toEqual(['c', 'a', 'b'])
    m.libre = 2.5 * GB
    pasa(1)
    // 2.5 GB alcanzan para dos (cada uno reserva 0.6 GB y hacen falta 1.8 libres): «c» primero, luego «a»; «b» espera.
    expect((await cola.pedir({ tipo: 'rutina', ref: 'a', titulo: 'a' })).lanzar).toBe(true)
    expect(cola.obtener(c.id)?.estado).toBe('admitido')
    expect(cola.esperando().map(e => e.ref)).toEqual(['b'])
  })

  it('«Lanzar ya» lo saca aunque no haya aire; la espera larga sin salidas también (nunca se traba)', async () => {
    const { cola, pasa } = maquina(8, 0.5)
    const t = await cola.pedir({ tipo: 'rutina', ref: 'x', titulo: 'x' })
    expect(t.lanzar).toBe(false)
    expect(cola.forzar(t.id!)).toBe(true)
    expect(await cola.pedir({ tipo: 'rutina', ref: 'x', titulo: 'x' })).toMatchObject({ lanzar: true, motivo: 'forzado' })

    process.env.ARBRAIN_COLA_MEMORIA_ESPERA_MAX_S = '60'
    pasa(61_000)
    const y = await cola.pedir({ tipo: 'rutina', ref: 'y', titulo: 'y' })
    expect(y.lanzar).toBe(false)
    pasa(61_000)
    expect(await cola.pedir({ tipo: 'rutina', ref: 'y', titulo: 'y' })).toMatchObject({ lanzar: true, motivo: 'espera_larga' })
  })

  it('el mismo encargo pedido dos veces no se duplica en la cola', async () => {
    const { cola } = maquina(8, 1)
    await cola.pedir({ tipo: 'rutina', ref: 'r', titulo: 'r' })
    await cola.pedir({ tipo: 'rutina', ref: 'r', titulo: 'r' })
    expect(cola.esperando()).toHaveLength(1)
  })
})

describe('instalación original y máquinas grandes: no cambia nada', () => {
  it('original: apagada por defecto, lanza siempre aunque la memoria esté baja y no escribe en la tabla', async () => {
    process.env.ARBRAIN_EDICION = 'original'
    expect(colaActiva()).toBe(false)
    const { db, cola } = maquina(8, 0.2)
    for (let i = 0; i < 10; i++) expect(await cola.pedir({ tipo: 'rutina', ref: `r${i}`, titulo: 'r' })).toMatchObject({ lanzar: true, motivo: 'apagada' })
    expect((db.prepare('SELECT COUNT(*) AS n FROM cola_memoria').get() as { n: number }).n).toBe(0)
    expect((await cola.vista()).activa).toBe(false)
  })
  it('Studio (192 GB, 40 GB libres) con la cola prendida a mano: 30 lanzamientos seguidos, ninguno se forma', async () => {
    process.env.ARBRAIN_EDICION = 'original'
    process.env.ARBRAIN_COLA_MEMORIA = '1'
    expect(colaActiva()).toBe(true)
    const { cola } = maquina(192, 40)
    for (let i = 0; i < 30; i++) {
      const t = await cola.pedir({ tipo: i % 2 ? 'rutina' : 'subagente', ref: `e${i}`, titulo: 'e' })
      expect(t.lanzar, `lanzamiento ${i}`).toBe(true)
    }
    expect(cola.esperando()).toEqual([])
  })
  it('cliente con 16 GB y 6 GB libres: tampoco encola', async () => {
    const { cola } = maquina(16, 6)
    for (let i = 0; i < 5; i++) expect((await cola.pedir({ tipo: 'subagente', ref: `s${i}`, titulo: 's' })).lanzar).toBe(true)
  })
})

describe('el subagente del SDK: espera, vuelve a su conversación y relanza sin perderse', () => {
  const scope = { owner: 'o', account: 'default', conversationId: 'conv-1' }
  const llamada = { description: 'Resumir clientes', prompt: 'Lee clientes/ y resume', subagent_type: 'general-purpose' }

  it('sin aire: espera, se devuelve con su lugar; al haber aire Arbrain le escribe al agente y la misma llamada sale', async () => {
    const { m, cola } = maquina(8, 1.0)
    const r = await turnoSubagente(cola, llamada, scope, { esperaMs: 30, pasoMs: 10 })
    expect(r).toMatch(/cola por memoria de Arbrain \(cm_[0-9a-f]{12}, lugar 1 de 1\)/)
    expect(r).toMatch(/Arbrain te escribe en esta conversación/)
    expect(cola.esperando()).toHaveLength(1)

    const avisos: Array<{ scope: unknown; texto: string }> = []
    let pases = 0
    const parar = iniciarRelojCola(cola, { avisar: (s, texto) => avisos.push({ scope: s, texto }), correrRutinas: () => { pases++ } }, 10)
    m.libre = 3 * GB
    await new Promise(res => setTimeout(res, 80))
    parar()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].scope).toEqual(scope)
    expect(avisos[0].texto).toContain('misma llamada')
    expect(pases).toBe(0)
    // El agente repite la llamada: sale directo (su lugar estaba apartado) aunque la memoria vuelva a bajar.
    m.libre = 0.5 * GB
    expect(await turnoSubagente(cola, llamada, scope, { esperaMs: 0 })).toBeNull()
    expect(cola.esperando()).toEqual([])
  })

  it('si el aire llega mientras el gancho espera, sale ahí mismo y nadie le escribe al agente (no se duplica)', async () => {
    const { m, cola } = maquina(8, 1.0)
    const avisos: string[] = []
    const parar = iniciarRelojCola(cola, { avisar: (_s, t) => avisos.push(t), correrRutinas: () => {} }, 5)
    setTimeout(() => { m.libre = 3 * GB }, 30)
    expect(await turnoSubagente(cola, llamada, scope, { esperaMs: 2000, pasoMs: 10 })).toBeNull()
    await new Promise(res => setTimeout(res, 30))
    parar()
    expect(avisos).toEqual([])
  })

  it('en una rutina (sin conversación) no se forma: el agente hace el trabajo él mismo', async () => {
    const { cola } = maquina(8, 1.0)
    const r = await turnoSubagente(cola, llamada, null, { esperaMs: 0 })
    expect(r).toMatch(/haz su trabajo tú mismo en esta corrida/)
    expect(cola.esperando()).toEqual([])
  })

  it('apagada o sin cola: no se mete', async () => {
    expect(await turnoSubagente(null, llamada, scope)).toBeNull()
    process.env.ARBRAIN_COLA_MEMORIA = '0'
    expect(await turnoSubagente(maquina(8, 0.1).cola, llamada, scope)).toBeNull()
  })

  it('la huella ignora el orden de las claves y distingue encargos distintos', () => {
    expect(huellaSubagente({ prompt: 'p', description: 'd' })).toBe(huellaSubagente({ description: 'd', prompt: 'p' }))
    expect(huellaSubagente({ description: 'd', prompt: 'p' })).not.toBe(huellaSubagente({ description: 'd', prompt: 'q' }))
    expect(mensajeAdmitido({ id: 'cm_000000000000', titulo: 'x' })).toContain('cm_000000000000')
  })

  it('el gancho de la guardia: Agent sin aire se niega con el motivo de la cola; con aire corre', async () => {
    const { m, cola } = maquina(8, 1.0)
    _colaParaPruebas(cola)
    process.env.ARBRAIN_COLA_MEMORIA_ESPERA_S = '0'
    try {
      const { guardiaHooks } = await import('../guardia-agentes.js')
      const pre = guardiaHooks(() => {}, { conversacion: scope, contexto: () => ({ home: '/tmp/h', cwd: '/tmp/h', usuario: '/tmp', protegidas: [], lecturaExtra: [], abiertas: [], sandbox: false, modo: 'autonomo' }) }).PreToolUse[0]
      const llamar = () => pre.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: llamada, tool_use_id: `t-${Math.random()}`, session_id: 's', permission_mode: 'auto', cwd: '/tmp/h' } as never, undefined, { signal: new AbortController().signal }) as Promise<{ hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }>
      const negado = await llamar()
      expect(negado.hookSpecificOutput?.permissionDecision).toBe('deny')
      expect(negado.hookSpecificOutput?.permissionDecisionReason).toMatch(/cola por memoria/)
      m.libre = 3 * GB
      expect((await llamar()).hookSpecificOutput?.permissionDecision).not.toBe('deny')
    } finally { _colaParaPruebas(null); delete process.env.ARBRAIN_COLA_MEMORIA_ESPERA_S }
  })
})

describe('el scheduler: la rutina sin aire sigue vencida y corre cuando hay', () => {
  const store = mkdtempSync(join(tmpdir(), 'arbrain-cola-memoria-'))
  const previoStore = process.env.CLAUDECLAW_STORE_DIR
  type Sched = typeof import('../scheduler.js')
  type Db = typeof import('../db.js')
  let s: Sched, db: Db
  beforeAll(async () => {
    process.env.CLAUDECLAW_STORE_DIR = store
    db = await import('../db.js')
    s = await import('../scheduler.js')
    db.initDatabase()
  })
  afterAll(() => {
    s._ejecutorParaPruebas(null)
    _colaParaPruebas(null)
    if (previoStore === undefined) delete process.env.CLAUDECLAW_STORE_DIR; else process.env.CLAUDECLAW_STORE_DIR = previoStore
    delete process.env.ARBRAIN_ESPEJO_GUARDA
    rmSync(store, { recursive: true, force: true })
  })
  afterEach(() => { db.getDb().prepare('DELETE FROM scheduled_tasks').run(); try { db.getDb().prepare('DELETE FROM cola_memoria').run() } catch { /* aún sin tabla */ } })
  const vencida = (id: string) => db.createTask({ id, chat_id: 'c', thread_id: null, prompt: `rutina ${id}`, schedule: '0 7 * * *', next_run: Math.floor(Date.now() / 1000) - 60, status: 'active', created_at: 1 } as never)
  const esperar = async (cond: () => boolean, ms = 2000) => { const fin = Date.now() + ms; while (!cond() && Date.now() < fin) await new Promise(r => setTimeout(r, 10)); return cond() }

  it('cliente con 1 GB libre: no corre ni se reclama; al liberar memoria corren en el orden de la cola', async () => {
    const m = { libre: 1 * GB, t: Date.now() }
    const cola = new ColaMemoria(db.getDb(), { medir: async () => ({ libreBytes: m.libre, totalBytes: 8 * GB }), ahora: () => m.t, cacheMs: 0 })
    _colaParaPruebas(cola)
    const corridas: string[] = []
    s._ejecutorParaPruebas(async t => { corridas.push(t.id) })
    vencida('r-uno'); vencida('r-dos')
    await s.runDueTasks()
    expect(corridas).toEqual([])
    expect(db.getTask('r-uno')?.last_run ?? null).toBeNull() // sin reclamar: sigue vencida
    const fila = cola.esperando()
    expect(fila.map(e => e.ref).sort()).toEqual(['r-dos', 'r-uno'])
    cola.mover(fila.find(e => e.ref === 'r-dos')!.id, 0) // la persona sube «r-dos»

    m.libre = 2.0 * GB
    await s.runDueTasks()
    expect(await esperar(() => corridas.length === 1)).toBe(true)
    expect(corridas).toEqual(['r-dos'])
    m.t += ASENTAMIENTO_MS + 1
    await s.runDueTasks()
    expect(await esperar(() => corridas.length === 2)).toBe(true)
    expect(corridas).toEqual(['r-dos', 'r-uno'])
    expect(cola.esperando()).toEqual([])
  })

  it('una rutina pausada mientras esperaba sale de la cola', async () => {
    const cola = new ColaMemoria(db.getDb(), { medir: async () => ({ libreBytes: 0.5 * GB, totalBytes: 8 * GB }), cacheMs: 0 })
    _colaParaPruebas(cola)
    s._ejecutorParaPruebas(async () => {})
    vencida('r-pausa')
    await s.runDueTasks()
    expect(cola.esperando()).toHaveLength(1)
    db.getDb().prepare(`UPDATE scheduled_tasks SET status = 'paused' WHERE id = 'r-pausa'`).run()
    await s.runDueTasks()
    expect(cola.esperando()).toEqual([])
  })

  it('modo espejo: tras esperar, la otra máquina la acepta; aquí no corre y queda «derivada»', async () => {
    const guarda = join(store, 'espejo-falso.mjs')
    writeFileSync(guarda, `const a = process.argv.slice(2); if (a[0] === 'derivar' && a.includes('r-espejo')) console.log(JSON.stringify({ derivada: true, a: 'vps-de-prueba' })); else { console.log(JSON.stringify({ ok: false, codigo: 'orden_desconocida' })); process.exit(1) }\n`)
    process.env.ARBRAIN_ESPEJO_GUARDA = guarda
    const m = { t: Date.now() }
    const cola = new ColaMemoria(db.getDb(), { medir: async () => ({ libreBytes: 0.5 * GB, totalBytes: 8 * GB }), ahora: () => m.t, cacheMs: 0 })
    _colaParaPruebas(cola)
    const corridas: string[] = []
    s._ejecutorParaPruebas(async t => { corridas.push(t.id) })
    vencida('r-espejo'); vencida('r-local')
    await s.runDueTasks()
    expect(cola.esperando()).toHaveLength(2) // recién formadas: todavía no se ofrecen
    m.t += 61_000
    // La cerca del espejo corre antes de cada rutina real; aquí el ejecutor es de mentira, solo cuenta la derivación.
    await s.runDueTasks()
    expect(corridas).toEqual([])
    const espejo = (cola as unknown as { db: Database.Database }).db.prepare(`SELECT estado, derivado_a FROM cola_memoria WHERE ref = 'r-espejo'`).get() as { estado: string; derivado_a: string }
    expect(espejo).toEqual({ estado: 'derivado', derivado_a: 'vps-de-prueba' })
    expect(db.getTask('r-espejo')!.next_run).toBeGreaterThan(Math.floor(Date.now() / 1000)) // reclamada sin correr
    // La que el espejo no acepta (orden desconocida = «no») sigue esperando aquí, y no se vuelve a ofrecer.
    expect(cola.esperando().map(e => e.ref)).toEqual(['r-local'])
    expect(cola.esperando()[0].derivacionIntentada).toBe(true)
  })
})
