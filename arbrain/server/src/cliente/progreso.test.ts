/**
 * Conectar con arbrain.ai (puente de seguimiento, 21 oct 2026): apagado por defecto, la señal solo lleva conteos (y
 * texto de metas/hábitos solo con permiso), nunca conversaciones; en la instalación de Daniel nunca envía.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, statSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { Progreso, metasVigentes, semanaIso, urlValida, versionCerebro, URL_POR_OMISION } from './progreso.js'
import { Cohorte } from './cohorte.js'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const EDICION = process.env.ARBRAIN_EDICION
afterEach(() => { if (EDICION === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = EDICION })

const AHORA = new Date(2026, 9, 21, 12).getTime() // mié 21 oct 2026, hora local
const DIA = 86_400_000

function cerebro() {
  const raiz = tmp('cerebro-')
  mkdirSync(join(raiz, '.claude/plan'), { recursive: true })
  const goals = [
    { id: 'a', scope: 'month', start: '2026-10-01', end: '2026-11-01', title: 'Vender 3 diagnósticos', status: 'active' },
    { id: 'b', scope: 'day', start: '2026-10-21', end: '2026-10-22', title: 'Llamar a 5 prospectos', status: 'active' },
  ]
  writeFileSync(join(raiz, '.claude/plan/objetivos.md'), `# Objetivos\n\n### nota privada que no debe salir\n\n<!-- arbrain-objectives-v1\n${JSON.stringify({ version: 1, goals, receipts: {} })}\n-->\n`)
  writeFileSync(join(raiz, '.claude/plan/habitos.json'), JSON.stringify({ version: 1, habitos: [
    { clave: 'objetivo_dia', nombre: 'Objetivo del día', activo: true }, { clave: 'gym', nombre: 'Gym', activo: true }, { clave: 'viejo', nombre: 'Viejo', activo: false },
  ], registro: { '2026-10-21': { gym: { hecho: true } }, '2026-10-20': { gym: { hecho: true }, objetivo_dia: { hecho: false } }, '2026-10-10': { gym: { hecho: true } } } }))
  writeFileSync(join(raiz, '.claude/plan/calendario.json'), JSON.stringify({ version: 1, eventos: [
    { id: '1', titulo: 'Reunión con Juan Pérez', inicio: '', fin: '', actualizado: new Date(AHORA - DIA).toISOString() },
    { id: '2', titulo: 'Vieja', inicio: '', fin: '', actualizado: new Date(AHORA - 30 * DIA).toISOString() },
  ], tareas: [] }))
  return raiz
}
function db() {
  const d = new Database(':memory:')
  d.exec('CREATE TABLE chat_runtime_turns (turn_id TEXT PRIMARY KEY, owner TEXT, account TEXT, conversation_id TEXT, created_at INTEGER)')
  const ins = d.prepare('INSERT INTO chat_runtime_turns VALUES (?, ?, ?, ?, ?)')
  ins.run('t1', 'o', 'default', 'conv-secreta-a', AHORA - DIA); ins.run('t2', 'o', 'default', 'conv-secreta-a', AHORA - DIA + 5); ins.run('t3', 'o', 'default', 'conv-b', AHORA - 2 * DIA); ins.run('t4', 'o', 'default', 'conv-c', AHORA - 9 * DIA)
  return d
}

describe('puente de seguimiento', () => {
  it('semana ISO y URL', () => {
    expect(semanaIso('2026-10-21')).toBe('2026-W43')
    expect(semanaIso('2027-01-01')).toBe('2026-W53')
    expect(urlValida('https://arbrain.ai/api/progreso')).toBe(true)
    expect(urlValida('http://evil.com/x')).toBe(false)
    expect(urlValida('http://127.0.0.1:3000/api/progreso')).toBe(true)
  })

  it('metas: registro primero y formato a mano después', () => {
    const md = '## octubre 2026\n**Mes:** Lanzar\n### Semana 19-25\n**Foco:** Cerrar 2\n#### miércoles 21\n- [ ] Grabar video\n'
    expect(metasVigentes(md, '2026-10-21')).toEqual({ mes: 'Lanzar', semana: 'Cerrar 2', dia: 'Grabar video' })
    expect(metasVigentes(md, '2026-11-02')).toEqual({ mes: null, semana: null, dia: null })
  })

  it('versión del cerebro: VERSION de la copia del alumno, sin romper version_app', () => {
    const raiz = cerebro()
    writeFileSync(join(raiz, 'VERSION'), '0.2.13\n')
    expect(versionCerebro(raiz)).toBe('0.2.13')
    const s = new Progreso(db(), tmp('datos-'), () => raiz, () => AHORA).senal()
    expect(s.version_cerebro).toBe('0.2.13')
    expect(s).toHaveProperty('version_app')
    // Sin VERSION válido en el cerebro cae al del repo donde corre el código: VERSION en la raíz de la copia del alumno o
    // distribucion/VERSION en el original. Basura no pasa.
    const otra = cerebro()
    writeFileSync(join(otra, 'VERSION'), '<script>\n')
    const delRepo = ['../../../../VERSION', '../../../empaquetado/distribucion/VERSION'].map(r => new URL(r, import.meta.url)).find(u => existsSync(u))!
    expect(versionCerebro(otra)).toBe(readFileSync(delRepo, 'utf8').trim())
  })

  it('apagado por defecto; la señal solo trae conteos y el texto solo con permiso', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const raiz = cerebro(), dir = tmp('datos-'), base = db()
    const p = new Progreso(base, dir, () => raiz, () => AHORA)
    const llamadas: Array<{ url: string; init: RequestInit }> = []
    const fetcher = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return new Response('{"ok":true}', { status: 200 }) }) as unknown as typeof fetch
    expect((await p.enviar(true, fetcher)).resultado).toBe('sin_conexion')
    expect(llamadas).toHaveLength(0)
    expect(p.resumen().conectado).toBe(false)
    expect(p.resumen().url).toBe(URL_POR_OMISION)

    const s = p.senal()
    expect(s).toMatchObject({ v: 1, instalado: true, fecha: '2026-10-21', semana: '2026-W43', habitos_activos: 2, conversaciones_7d: 2, calendario: { eventos_total: 2, eventos_7d: 1 } })
    expect(s.metas).toEqual({ mes: { presente: true }, semana: { presente: false }, dia: { presente: true } })
    expect(s.habitos).toEqual([{ dias_7: 0 }, { dias_7: 2 }])
    expect(s.ventas).toEqual({ ofertas_7d: null, conversaciones_venta_7d: null, cierres_7d: null })
    expect(JSON.stringify(s)).not.toMatch(/conv-|Juan|Vender|Gym|privada/)

    expect(p.conectar('corto')).toMatchObject({ ok: false })
    expect(p.conectar('arb_' + 'x'.repeat(43), 'http://evil.com')).toMatchObject({ ok: false })
    expect(p.conectar('arb_' + 'x'.repeat(43))).toEqual({ ok: true })
    if (process.platform !== 'win32') expect(statSync(join(dir, 'progreso.json')).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(p.resumen())).not.toContain('x'.repeat(20)) // el token nunca vuelve completo

    expect(p.ajustes({ compartir_texto: true, manual: { ofertas: 3, conversaciones_venta: '5' } })).toEqual({ ok: true })
    new Cohorte(base, tmp('coh-'), () => AHORA).registrarVenta('cierre', 1000, 'MXN')
    const t = p.senal()
    expect(t.metas.mes).toEqual({ presente: true, texto: 'Vender 3 diagnósticos' })
    expect(t.habitos.map(h => h.nombre)).toEqual(['Objetivo del día', 'Gym'])
    expect(t.ventas).toEqual({ ofertas_7d: 3, conversaciones_venta_7d: 5, cierres_7d: 1 })

    const r = await p.enviar(true, fetcher)
    expect(r.resultado).toBe('enviado')
    expect(llamadas[0].url).toBe(URL_POR_OMISION)
    expect((llamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer arb_' + 'x'.repeat(43))
    const cuerpo = String(llamadas[0].init.body)
    expect(cuerpo).not.toMatch(/conv-|Juan|privada/)
    expect((await p.enviar(false, fetcher)).resultado).toBe('pronto') // una vez al día
    expect(llamadas).toHaveLength(1)

    p.desconectar()
    expect(existsSync(join(dir, 'progreso.json'))).toBe(false)
    expect((await p.enviar(true, fetcher)).resultado).toBe('sin_conexion')
  })

  it('token rechazado queda anotado y no cuenta como envío', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const dir = tmp('datos-')
    const p = new Progreso(db(), dir, () => cerebro(), () => AHORA)
    p.conectar('arb_' + 'y'.repeat(43))
    const r = await p.enviar(false, (async () => new Response('{"error":"Token desconocido o revocado."}', { status: 401 })) as unknown as typeof fetch)
    expect(r).toEqual({ resultado: 'rechazado', detalle: 'Token desconocido o revocado.' })
    const guardado = JSON.parse(readFileSync(join(dir, 'progreso.json'), 'utf8'))
    expect(guardado.ultimoEnvio).toBeUndefined()
    expect(guardado.ultimoResultado).toMatch(/^rechazado/)
  })

  it('en la instalación de Daniel nunca envía', async () => {
    process.env.ARBRAIN_EDICION = 'daniel'
    const p = new Progreso(db(), tmp('datos-'), () => cerebro(), () => AHORA)
    p.conectar('arb_' + 'z'.repeat(43))
    expect((await p.enviar(true, (async () => { throw new Error('no debe llamar') }) as unknown as typeof fetch)).resultado).toBe('no_cliente')
  })
})
