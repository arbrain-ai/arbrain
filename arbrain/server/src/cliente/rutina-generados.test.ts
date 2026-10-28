/**
 * Rutinas sin la persona delante (24 oct 2026, hallazgo del prototipo del modo espejo): una rutina que escribía
 * `.claude/now.md` pedía un clic que nadie daba, se quedaba esperando y detenía la fila del scheduler.
 *
 *   (a) Lo que el cerebro genera (now.md, reportes y briefs en Markdown dentro de `.claude/`) lo escribe una rutina sin
 *       clic. Cualquier otra confirmación en una rutina no espera: queda pendiente y visible, la acción no corre y la
 *       rutina sigue.
 *   (b) Nada de esto afloja el chat, el freno (enviar, borrar, publicar, pagar), el dinero, los secretos, los ajustes y
 *       ganchos ni una sesión contaminada.
 */
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decidirHerramienta, generadoPorRutina, type ContextoPolitica } from './politica-agentes.js'
import { Confirmaciones } from './confirmaciones.js'
import { guardiaHooks, permisosCliente } from '../guardia-agentes.js'

let raiz = '', usuario = '', home = '', datos = ''
const previo = { edicion: process.env.ARBRAIN_EDICION, config: process.env.ARBRAIN_CONFIG_DIR }
const ctx = (over: Partial<ContextoPolitica> = {}): ContextoPolitica =>
  ({ home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], abiertas: [], sandbox: false, modo: 'preguntar', ...over })
const rutina = (over: Partial<ContextoPolitica> = {}) => ctx({ rutina: true, sinFreno: false, ...over })
const tipo = (h: string, input: unknown, c: ContextoPolitica) => decidirHerramienta(h, input, c).tipo

beforeAll(() => {
  process.env.ARBRAIN_EDICION = 'cliente'
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-rutina-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Arbrain'); datos = join(raiz, 'datos')
  for (const d of [join(home, '.claude', 'reportes', 'semana'), join(home, '.claude', 'skills', 'ventas'), join(home, '.claude', 'briefs'), datos, join(usuario, '.ssh')]) mkdirSync(d, { recursive: true })
  writeFileSync(join(home, '.claude', 'settings.json'), '{}')
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_EDICION', previo.edicion], ['ARBRAIN_CONFIG_DIR', previo.config]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(raiz, { recursive: true, force: true })
})

describe('qué cuenta como archivo que genera el cerebro', () => {
  it('now.md y reportes/briefs en Markdown; nada de skills, ganchos, ajustes ni otra extensión', () => {
    const si = ['.claude/now.md', '.claude/reportes/brief-2026-10-24.md', '.claude/reportes/semana/s1.md', '.claude/briefs/hoy.md', '.CLAUDE/NOW.md']
    const no = ['.claude/now.md.sh', '.claude/reportes/x.sh', '.claude/reportes/x.py', '.claude/skills/ventas/SKILL.md', '.claude/settings.json',
      '.claude/hooks/x.md', '.claude/reportes/.claude/x.md', '.claude/reportes/hooks/x.md', '.claude/CLAUDE.md', 'CLAUDE.md', 'sub/.claude/now.md']
    for (const r of si) expect(generadoPorRutina(join(home, r), home), r).toBe(true)
    for (const r of no) expect(generadoPorRutina(join(home, r), home), r).toBe(false)
    expect(generadoPorRutina(join(raiz, 'otro', '.claude', 'now.md'), home)).toBe(false)
  })
})

describe('(a) una rutina escribe now.md sin clic', () => {
  it('la política: rutina permite (marcado «generado»), el chat sigue preguntando', () => {
    for (const h of ['Write', 'Edit', 'MultiEdit']) {
      expect(decidirHerramienta(h, { file_path: join(home, '.claude', 'now.md'), content: '# Ahora' }, rutina()), h).toEqual({ tipo: 'permitir', generado: true })
      expect(tipo(h, { file_path: join(home, '.claude', 'now.md'), content: '# Ahora' }, ctx()), h).toBe('confirmar')
    }
    expect(tipo('Write', { file_path: join(home, '.claude', 'reportes', 'brief.md'), content: 'x' }, rutina())).toBe('permitir')
    // Con «~» y ruta relativa, igual.
    expect(tipo('Write', { file_path: '.claude/now.md', content: 'x' }, rutina())).toBe('permitir')
  })

  it('el hook de la rutina termina sin crear confirmación ni esperar', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const eventos: Record<string, unknown>[] = []
    const [m] = guardiaHooks(e => eventos.push(e), { origen: 'cron', contexto: () => ctx(), confirmaciones: () => store, hayQuienConfirme: () => true, procedencia: () => ({ de: () => null, bajo: () => null, marcar: () => {} }) as never }).PreToolUse
    const t0 = Date.now()
    const r = await m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(home, '.claude', 'now.md'), content: '# Ahora' }, session_id: 's-rutina', tool_use_id: 'u1', cwd: home } as never, undefined, { signal: new AbortController().signal })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(r).toEqual({ continue: true })
    expect(store.pendientes()).toEqual([])
    expect(eventos.some(e => e.decision === 'esperando')).toBe(false)
  })

  it('otra confirmación en una rutina no espera: queda pendiente y visible, se niega al instante y dice que siga', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { origen: 'cron', contexto: () => ctx(), confirmaciones: () => store, hayQuienConfirme: () => true, procedencia: () => ({ de: () => null, bajo: () => null, marcar: () => {} }) as never }).PreToolUse
    const t0 = Date.now()
    const r = await m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), content: 'x' }, session_id: 's-r2', tool_use_id: 'u2', cwd: home } as never, undefined, { signal: new AbortController().signal })
    expect(Date.now() - t0).toBeLessThan(2000)
    const out = (r as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toMatch(/sin la persona delante.*quedó pendiente.*No la reintentes/)
    expect(store.pendientes()).toHaveLength(1)
    // Cola de aprobaciones (ronda 2): sin nadie que la espere, queda en la cola de la persona (no vence, no corre).
    expect(store.pendientes()[0]).toMatchObject({ origen: 'cron', estado: 'en_cola' })
  })

  it('canUseTool de la rutina tampoco espera ni pregunta por now.md', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    let base = 0
    const cron = permisosCliente(async (_h, input) => { base++; return { behavior: 'allow' as const, updatedInput: input } }, () => {}, { origen: 'cron', contexto: () => ctx(), confirmaciones: () => store, hayQuienConfirme: () => true })
    const o = { signal: new AbortController().signal, toolUseID: 't-now' } as Parameters<typeof cron>[2]
    expect((await cron('Write', { file_path: join(home, '.claude', 'now.md'), content: 'x' }, o))?.behavior).toBe('allow')
    expect(base).toBe(1)
    const t0 = Date.now()
    expect((await cron('mcp__gmail__send_email', { to: 'a@b.c', body: 'hola' }, { ...o, toolUseID: 't-mail' }))?.behavior).toBe('deny')
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(base).toBe(1)
  })
})

describe('(b) lo que sigue igual de frenado', () => {
  it('en una rutina: freno, dinero, secretos, ajustes, ganchos y git', () => {
    const c = rutina()
    expect(tipo('mcp__gmail__send_email', { to: 'a@b.c' }, c)).toBe('confirmar')
    expect(tipo('mcp__todoist__delete_task', { id: 1 }, c)).toBe('confirmar')
    expect(tipo('Bash', { command: 'curl -X POST https://api.ejemplo.com -d x=1' }, c)).toBe('confirmar')
    expect(tipo('mcp__stripe__create_payment', { amount: 1 }, c)).toBe('negar')
    expect(tipo('Read', { file_path: join(usuario, '.ssh', 'id_ed25519') }, c)).toBe('negar')
    expect(tipo('Write', { file_path: join(home, '.claude', 'settings.json'), content: '{}' }, c)).toBe('negar')
    expect(tipo('Write', { file_path: join(home, '.claude', 'hooks', 'now.md'), content: '' }, c)).toBe('negar')
    expect(tipo('Write', { file_path: join(home, '.git', 'now.md'), content: '' }, c)).toBe('negar')
    expect(tipo('Write', { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), content: 'x' }, c)).toBe('confirmar')
    expect(tipo('Bash', { command: 'rm -rf .claude' }, c)).toBe('negar')
  })
  it('now.md como enlace a los ajustes: negado (se juzga la ruta real)', () => {
    const enlace = join(home, '.claude', 'reportes', 'trampa.md')
    symlinkSync(join(home, '.claude', 'settings.json'), enlace)
    expect(tipo('Write', { file_path: enlace, content: '{}' }, rutina())).toBe('negar')
  })
  it('una rutina contaminada por contenido de afuera vuelve a pedir clic para now.md', () => {
    expect(tipo('Write', { file_path: join(home, '.claude', 'now.md'), content: 'x' }, rutina({ contaminada: { fuente: 'una página web' } }))).toBe('confirmar')
  })
  it('el chat humano sigue esperando el clic (no cambia su espera)', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { origen: 'agente', esperaMs: 700, contexto: () => ctx(), confirmaciones: () => store, hayQuienConfirme: () => true, procedencia: () => ({ de: () => null, bajo: () => null, marcar: () => {} }) as never }).PreToolUse
    const t0 = Date.now()
    const r = await m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(home, '.claude', 'now.md'), content: 'x' }, session_id: 's-chat', tool_use_id: 'u3', cwd: home } as never, undefined, { signal: new AbortController().signal })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600)
    expect((r as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason).toMatch(/espera la confirmación de la persona/)
  })
})
