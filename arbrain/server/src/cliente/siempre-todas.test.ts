/**
 * «Permitir siempre» en todas las tarjetas rutinarias (un fundador en Windows 11, 28 y 29 oct 2026: «18 clics por permisos…
 * llevo dos días luchando con los permisos»; «no me sale la opción de siempre»). Antes, solo Bash de categoría «otra»
 * traía patrón; ahora también PowerShell, herramientas MCP, escribir dentro de una carpeta y leer páginas de un dominio.
 *
 * Lo que no cambia y estas pruebas cuidan: lo negado sigue negado; el freno (enviar, borrar, publicar, pagar) nunca tiene
 * «siempre»; ninguna regla vale en rutinas; tras leer afuera solo vale la regla de la memoria, que nace en la tarjeta que
 * ya avisaba del contenido de afuera; ninguna regla salta la R6 ni la salida de datos; el navegador no manda el patrón.
 */
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Confirmaciones } from './confirmaciones.js'
import { decidirHerramienta, _dominiosWebParaPruebas, type ContextoPolitica } from './politica-agentes.js'
import {
  agregarReglaDe, alcanceEscritura, coincidePatron, derivarPatron, familiaDe, patronParaTarjeta, patronValido, quitarRegla,
  reglaQueAplica, reglasSiempre, rutaEnAlcance, valeTrasAfuera,
} from './reglas-siempre.js'
import { listarReglas, resolverTarjeta } from './tarjeta.js'
import { avisoPatron, frasePatron } from './frase-humana.js'
import { guardiaHooks, _contaminadasParaPruebas } from '../guardia-agentes.js'

let raiz = '', usuario = '', home = '', datos = '', abierta = ''
const previo = { config: process.env.ARBRAIN_CONFIG_DIR, edicion: process.env.ARBRAIN_EDICION }
const ctxDe = (over: Partial<ContextoPolitica> = {}): ContextoPolitica =>
  ({ home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], abiertas: [abierta], sandbox: false, modo: 'preguntar', reglas: reglasSiempre(), ...over })
const contaminada = { fuente: 'una página web (web.whatsapp.com)' }
const AUTONOMO = 'para que no te pregunte esto, en Ajustes › Permisos y seguridad elige «Autónomo»'
/** Como la guardia: el patrón que ofrecería la tarjeta para esta decisión. */
const patronDe = (h: string, input: unknown, ctx: ContextoPolitica) => {
  const d = decidirHerramienta(h, input, ctx)
  return d.tipo === 'confirmar' ? patronParaTarjeta(h, input, d.categoria, { home: ctx.home, abiertas: ctx.abiertas, contaminada: !!ctx.contaminada }) : `(${d.tipo})`
}

beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-siempre-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Arbrain'); datos = join(raiz, 'datos'); abierta = join(usuario, 'Proyectos', 'web')
  for (const d of [join(home, '.claude', 'memory'), join(home, '.claude', 'skills', 'ventas'), abierta, datos]) mkdirSync(d, { recursive: true })
  writeFileSync(join(home, '.claude', 'memory', 'a.md'), 'a')
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_CONFIG_DIR', previo.config], ['ARBRAIN_EDICION', previo.edicion]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(raiz, { recursive: true, force: true })
})
beforeEach(() => { for (const r of reglasSiempre()) quitarRegla(r.id); _dominiosWebParaPruebas().clear() })

describe('Windows: PowerShell y rutas con barra invertida', () => {
  it('PowerShell deriva igual que Bash para programas externos; un cmdlet, exacto; sin distinguir mayúsculas', () => {
    expect(derivarPatron('npm test', 'ps')).toBe('npm test *')
    expect(derivarPatron('git status --short', 'ps')).toBe('git status *')
    expect(derivarPatron('Get-ChildItem -Path C:\\Users\\alumno\\Arbrain', 'ps')).toBe('Get-ChildItem -Path C:\\Users\\alumno\\Arbrain')
    expect(derivarPatron('python C:\\Users\\alumno\\Arbrain\\scripts\\x.py', 'ps')).toBe('python C:\\Users\\alumno\\Arbrain\\scripts\\x.py')
    expect(derivarPatron('Get-Content "C:\\Users\\alumno\\Arbrain\\notas\\mi nota.md"', 'ps')).toBe('Get-Content "C:\\Users\\alumno\\Arbrain\\notas\\mi nota.md"')
    expect(coincidePatron('npm test *', 'NPM test --watch', 'ps')).toBe(true)
    expect(coincidePatron('Get-ChildItem -Path C:\\Users\\alumno\\Arbrain', 'get-childitem -Path C:\\Users\\alumno\\Arbrain', 'ps')).toBe(true)
    expect(coincidePatron('Get-ChildItem -Path C:\\Users\\alumno\\Arbrain', 'Get-ChildItem -Path C:\\Users\\alumno', 'ps')).toBe(false)
    // Bash sí distingue (Git Bash): `NPM` no es `npm`.
    expect(coincidePatron('npm test *', 'NPM test')).toBe(false)
  })
  it('PowerShell: lo encadenado, las variables, el borrado y lo que ejecuta texto no tienen patrón (o solo exacto)', () => {
    for (const c of ['npm test; Remove-Item x', 'npm test | Out-File a', 'npm test $env:X', 'Remove-Item C:\\x', 'del C:\\x', 'rm x', 'Invoke-WebRequest https://x.example', 'iwr x', 'Set-Content a b', 'npm test @a', 'npm test `n'])
      expect(derivarPatron(c, 'ps'), c).toBeNull()
    expect(derivarPatron('iex hola', 'ps')).toBe('iex hola')
    expect(patronValido('iex *', 'PowerShell')).toBe(false)
    expect(patronValido('Get-ChildItem *', 'PowerShell')).toBe(false)
    expect(coincidePatron('Get-ChildItem *', 'Get-ChildItem C:\\', 'ps')).toBe(false)
  })
  it('Bash acepta la barra invertida de una ruta de Windows y sigue sin aceptar comillas ni encadenados', () => {
    expect(derivarPatron('python C:\\Users\\alumno\\Arbrain\\x.py')).toBe('python C:\\Users\\alumno\\Arbrain\\x.py')
    for (const c of ['echo "x"', 'npm test; curl x', 'npm test \\$(id)']) expect(derivarPatron(c), c).toBeNull()
  })
  it('escribir en tu memoria con rutas de Windows: alcance, mayúsculas y lo que nunca cubre', () => {
    const h = 'C:\\Users\\alumno\\Arbrain'
    expect(alcanceEscritura('C:\\Users\\alumno\\Arbrain\\.claude\\memory\\x.md', h, [], true)).toBe('.claude/memory/**')
    expect(alcanceEscritura('c:\\users\\alumno\\arbrain\\.claude\\Memory\\sub\\y.md', h, [], true)).toBe('.claude/memory/**')
    expect(alcanceEscritura('C:\\Users\\alumno\\Arbrain\\.claude\\skills\\Ventas\\SKILL.md', h, [], true)).toBe('.claude/skills/ventas/**')
    expect(alcanceEscritura('D:\\Proyectos\\Web\\src\\a.ts', h, ['D:\\Proyectos\\Web'], true)).toBe('d:/proyectos/web/**')
    expect(rutaEnAlcance('C:\\USERS\\ALUMNO\\ARBRAIN\\.CLAUDE\\MEMORY\\x.md', '.claude/memory/**', h, true)).toBe(true)
    expect(rutaEnAlcance('D:\\proyectos\\web\\b.ts', 'd:/proyectos/web/**', h, true)).toBe(true)
    for (const r of ['C:\\Users\\alumno\\Arbrain\\.claude\\memory\\CLAUDE.md', 'C:\\Users\\alumno\\Arbrain\\.claude\\memory\\.claude\\settings.json', 'C:\\Users\\alumno\\Arbrain\\.claude\\memory\\..\\settings.json', 'C:\\Users\\alumno\\Arbrain\\.claude\\memoryx\\a.md', 'C:\\Users\\alumno\\Arbrain\\.claude\\memory'])
      expect(rutaEnAlcance(r, '.claude/memory/**', h, true), r).toBe(false)
    // Lo demás de .claude (agentes, ajustes, ganchos) y la raíz del cerebro no tienen alcance.
    for (const r of ['C:\\Users\\alumno\\Arbrain\\.claude\\agents\\x.md', 'C:\\Users\\alumno\\Arbrain\\CLAUDE.md', 'C:\\Users\\alumno\\Arbrain\\notas\\a.md'])
      expect(alcanceEscritura(r, h, [], true), r).toBeNull()
    // En un disco que distingue mayúsculas (Linux), «Memory» no es «memory».
    expect(rutaEnAlcance('/home/j/Arbrain/.claude/Memory/a.md', '.claude/memory/**', '/home/j/Arbrain', false)).toBe(false)
  })
  it('lo que llega de la red se revalida: alcances, dominios y herramientas inventadas no se guardan', () => {
    for (const p of ['/**', 'c:/**', '/home/**', 'c:/users/**', '/Users/x/.ssh/**', '.claude/**', '.claude/hooks/**', '.claude/skills/../hooks/**', '/a/b/../c/**', '/a/b*/**'])
      expect(patronValido(p, 'Escribir'), p).toBe(false)
    expect(patronValido('/Users/x/Proyectos/web/**', 'Escribir')).toBe(true)
    for (const p of ['evil.example/ruta', 'http://evil.example', 'localhost', '*.example.com']) expect(patronValido(p, 'WebFetch'), p).toBe(false)
    for (const p of ['mcp__manos__actuar', 'mcp__cabina__delegar', 'mcp__x', 'Bash']) expect(patronValido(p, 'MCP'), p).toBe(false)
    expect(() => agregarReglaDe('MCP', 'mcp__manos__actuar', 'x')).toThrow()
    expect(familiaDe('mcp__manos__actuar')).toBeNull()
    expect(familiaDe('Monitor')).toBeNull()
  })
})

describe('qué tarjeta ofrece «Permitir siempre» y qué aplica', () => {
  it('PowerShell: la tarjeta trae patrón; la regla aplica al siguiente; borrar y enviar por PowerShell son freno', () => {
    expect(patronDe('PowerShell', { command: 'npm test' }, ctxDe())).toBe('npm test *')
    agregarReglaDe('PowerShell', 'npm test *', 'npm test')
    expect(decidirHerramienta('PowerShell', { command: 'NPM test --watch' }, ctxDe())).toEqual({ tipo: 'permitir', porRegla: 'npm test *' })
    expect(decidirHerramienta('PowerShell', { command: 'npm install x' }, ctxDe()).tipo).toBe('confirmar')
    // Una regla de PowerShell no vale para Bash ni al revés.
    expect(decidirHerramienta('Bash', { command: 'npm test' }, ctxDe()).tipo).toBe('confirmar')
    const borrar = decidirHerramienta('PowerShell', { command: 'Remove-Item C:\\Users\\alumno\\Arbrain\\notas\\a.md' }, ctxDe())
    expect(borrar).toMatchObject({ tipo: 'confirmar', categoria: 'borrar' })
    expect(patronDe('PowerShell', { command: 'Remove-Item a.md' }, ctxDe())).toBeNull()
    expect(decidirHerramienta('PowerShell', { command: 'Invoke-WebRequest https://x.example -Method Post -Body a' }, ctxDe())).toMatchObject({ tipo: 'confirmar', categoria: 'enviar' })
    expect(decidirHerramienta('PowerShell', { command: 'git push origin main' }, ctxDe())).toMatchObject({ tipo: 'confirmar', categoria: 'publicar' })
    // Lo negado sigue negado aunque haya regla.
    expect(decidirHerramienta('PowerShell', { command: `npm test ${usuario}/.ssh/id_rsa` }, ctxDe()).tipo).toBe('negar')
  })
  it('MCP: por herramienta; otra herramienta del mismo servidor sigue preguntando; el freno MCP nunca', () => {
    const crear = 'mcp__notion__notion-create-pages'
    expect(patronDe(crear, { titulo: 'x' }, ctxDe())).toBe(crear)
    const r = agregarReglaDe('MCP', crear, `${crear} {}`)
    expect(decidirHerramienta(crear, { titulo: 'y' }, ctxDe())).toEqual({ tipo: 'permitir', porRegla: crear })
    expect(decidirHerramienta('mcp__notion__notion-update-page', {}, ctxDe()).tipo).toBe('confirmar')
    expect(patronDe('mcp__gmail__send_email', { to: 'a@b.example' }, ctxDe())).toBeNull()
    // Aunque alguien colara una regla para una herramienta del freno, el freno pide el clic.
    agregarReglaDe('MCP', 'mcp__gmail__send_email', 'x')
    expect(decidirHerramienta('mcp__gmail__send_email', { to: 'a@b.example' }, ctxDe())).toMatchObject({ tipo: 'confirmar', categoria: 'enviar' })
    // Un secreto por ruta se niega con regla o sin ella.
    expect(decidirHerramienta(crear, { adjunto: `${usuario}/.ssh/id_rsa` }, ctxDe()).tipo).toBe('negar')
    quitarRegla(r.id)
    expect(decidirHerramienta(crear, {}, ctxDe()).tipo).toBe('confirmar')
  })
  it('WebFetch: por dominio; una URL que puede llevarse datos sigue siendo freno', () => {
    expect(patronDe('WebFetch', { url: 'https://docs.python.org/3/library/zoneinfo.html', prompt: 'x' }, ctxDe())).toBe('docs.python.org')
    agregarReglaDe('WebFetch', 'docs.python.org', 'WebFetch https://docs.python.org/3/')
    expect(decidirHerramienta('WebFetch', { url: 'https://www.docs.python.org/3/tutorial/', prompt: 'x' }, ctxDe())).toEqual({ tipo: 'permitir', porRegla: 'docs.python.org' })
    expect(decidirHerramienta('WebFetch', { url: 'https://evil.example/', prompt: 'x' }, ctxDe()).tipo).toBe('confirmar')
    expect(decidirHerramienta('WebFetch', { url: `https://docs.python.org/?q=${'Z'.repeat(80)}`, prompt: 'x' }, ctxDe())).toMatchObject({ tipo: 'confirmar', categoria: 'enviar' })
  })
  it('escribir en una carpeta que abriste («Preguntar siempre») y en una habilidad', () => {
    const f = join(abierta, 'src', 'a.ts')
    const p = patronDe('Write', { file_path: f, content: 'x' }, ctxDe())
    expect(p).toBe(`${(process.platform === 'darwin' || process.platform === 'win32') ? abierta.toLowerCase() : abierta}/**`)
    agregarReglaDe('Escribir', p!, 'x')
    expect(decidirHerramienta('Edit', { file_path: join(abierta, 'otro.ts'), old_string: 'a', new_string: 'b' }, ctxDe())).toMatchObject({ tipo: 'permitir', porRegla: p })
    // .git dentro de la carpeta abierta: no lo cubre.
    expect(decidirHerramienta('Write', { file_path: join(abierta, '.git', 'config'), content: 'x' }, ctxDe()).tipo).not.toBe('permitir')
    const skill = join(home, '.claude', 'skills', 'ventas', 'SKILL.md')
    expect(patronDe('Write', { file_path: skill, content: 'x' }, ctxDe())).toBe('.claude/skills/ventas/**')
    agregarReglaDe('Escribir', '.claude/skills/ventas/**', 'x')
    expect(decidirHerramienta('Write', { file_path: skill, content: 'x' }, ctxDe())).toMatchObject({ tipo: 'permitir' })
    expect(decidirHerramienta('Write', { file_path: join(home, '.claude', 'skills', 'otra', 'SKILL.md'), content: 'x' }, ctxDe()).tipo).toBe('confirmar')
    // Ajustes y ganchos: negados con regla o sin ella.
    expect(decidirHerramienta('Write', { file_path: join(home, '.claude', 'settings.json'), content: '{}' }, ctxDe()).tipo).toBe('negar')
  })
  it('ninguna regla vale en una rutina', () => {
    agregarReglaDe('MCP', 'mcp__notion__notion-create-pages', 'x')
    expect(decidirHerramienta('mcp__notion__notion-create-pages', {}, ctxDe({ rutina: true })).tipo).toBe('confirmar')
  })
})

describe('conversación que leyó afuera (la tarjeta del fundador)', () => {
  const memoria = () => join(home, '.claude', 'memory', 'whatsapp.md')
  it('guardar en la memoria tras leer afuera: ofrece «siempre» con aviso claro y la regla vale ahí', () => {
    const ctx = ctxDe({ contaminada })
    const d = decidirHerramienta('Write', { file_path: memoria(), content: 'x' }, ctx)
    expect(d).toMatchObject({ tipo: 'confirmar', categoria: 'otra' })
    expect(d.tipo === 'confirmar' && d.avisos).toEqual(expect.arrayContaining(['lo que se guarda aquí vuelve en cada conversación', AUTONOMO]))
    expect(patronDe('Write', { file_path: memoria(), content: 'x' }, ctx)).toBe('.claude/memory/**')
    expect(frasePatron('.claude/memory/**', 'Write')).toBe('Permitir siempre guardar en tu memoria')
    expect(avisoPatron('.claude/memory/**', 'Write')).toMatch(/vale también cuando Levy acaba de leer algo de afuera/)
    agregarReglaDe('Escribir', '.claude/memory/**', 'x')
    expect(decidirHerramienta('Edit', { file_path: memoria(), old_string: 'a', new_string: 'b' }, ctxDe({ contaminada }))).toEqual({ tipo: 'permitir', porRegla: '.claude/memory/**' })
    // Pero no un CLAUDE.md dentro de la memoria, ni en una rutina, ni otra carpeta de .claude.
    expect(decidirHerramienta('Write', { file_path: join(home, '.claude', 'memory', 'CLAUDE.md'), content: 'x' }, ctxDe({ contaminada })).tipo).toBe('confirmar')
    expect(decidirHerramienta('Write', { file_path: memoria(), content: 'x' }, ctxDe({ contaminada, rutina: true })).tipo).toBe('confirmar')
    expect(decidirHerramienta('Write', { file_path: join(home, '.claude', 'knowledge', 'a.md'), content: 'x' }, ctxDe({ contaminada })).tipo).toBe('confirmar')
  })
  it('lo demás no tiene «siempre» tras leer afuera y sus reglas no valen ahí', () => {
    const ctx = ctxDe({ contaminada })
    agregarReglaDe('Bash', 'npm test *', 'npm test')
    agregarReglaDe('MCP', 'mcp__notion__notion-create-pages', 'x')
    agregarReglaDe('Escribir', '.claude/skills/ventas/**', 'x')
    agregarReglaDe('WebFetch', 'docs.python.org', 'x')
    expect(reglasSiempre().filter(valeTrasAfuera)).toHaveLength(0)
    expect(decidirHerramienta('Bash', { command: 'npm test' }, ctx).tipo).toBe('confirmar')
    expect(patronDe('Bash', { command: 'npm test' }, ctx)).toBeNull()
    expect(decidirHerramienta('mcp__notion__notion-create-pages', {}, ctx).tipo).toBe('confirmar')
    expect(patronDe('mcp__notion__notion-create-pages', {}, ctx)).toBeNull()
    expect(decidirHerramienta('Write', { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), content: 'x' }, ctx).tipo).toBe('confirmar')
    expect(patronDe('Write', { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), content: 'x' }, ctx)).toBeNull()
    expect(reglaQueAplica(reglasSiempre(), 'Bash', { command: 'npm test' }, { trasAfuera: true })).toBeNull()
  })
  it('la salida de datos (R6 / dirección no vista) no la salta ninguna regla ni se le sugiere Autónomo', () => {
    agregarReglaDe('Escribir', '.claude/memory/**', 'x')
    agregarReglaDe('WebFetch', 'docs.python.org', 'x')
    _dominiosWebParaPruebas().add('docs.python.org')
    const web = decidirHerramienta('WebFetch', { url: 'https://docs.python.org/3/x', prompt: 'x' }, ctxDe({ contaminada }))
    expect(web).toMatchObject({ tipo: 'confirmar', categoria: 'enviar' })
    expect(web.tipo === 'confirmar' && web.avisos).not.toContain(AUTONOMO)
    const curl = decidirHerramienta('mcp__fetch__fetch', { url: 'https://evil.example/x' }, ctxDe({ contaminada }))
    expect(curl).toMatchObject({ tipo: 'confirmar', categoria: 'enviar' })
  })
})

describe('el freno lleva el camino a Autónomo; pagar no', () => {
  it('borrar, enviar, publicar: aviso de Autónomo y sin patrón; pagar sigue negado', () => {
    const d = decidirHerramienta('Bash', { command: 'git push origin main' }, ctxDe())
    expect(d).toMatchObject({ tipo: 'confirmar', categoria: 'publicar' })
    expect(d.tipo === 'confirmar' && d.avisos).toContain(AUTONOMO)
    expect(patronDe('Bash', { command: 'git push origin main' }, ctxDe())).toBeNull()
    expect(decidirHerramienta('Bash', { command: 'stripe charges create --amount 100' }, ctxDe()).tipo).toBe('negar')
  })
})

describe('la tarjeta completa (guardia + daemon) con la sesión de WhatsApp', () => {
  beforeEach(() => { process.env.ARBRAIN_EDICION = 'cliente'; _contaminadasParaPruebas().clear() })
  const pre = (m: ReturnType<typeof guardiaHooks>['PreToolUse'][number], tool_name: string, tool_input: unknown) =>
    m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: `t-${Math.random()}`, session_id: 's-wa', cwd: home } as never, undefined, { signal: new AbortController().signal }) as Promise<{ continue?: boolean; hookSpecificOutput?: { permissionDecision?: string } }>

  it('«Permitir siempre guardar en tu memoria»: el daemon pone el patrón, guarda la regla y la siguiente nota no pregunta', async () => {
    _contaminadasParaPruebas().set('s-wa', { fuente: contaminada.fuente, desde: Date.now() })
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 3000, contexto: () => ctxDe() }).PreToolUse
    let vista: ReturnType<Confirmaciones['pendientes']>[number] | undefined
    const resuelto = new Promise<void>(listo => {
      const t = setInterval(() => {
        const p = store.pendientes().find(c => c.estado === 'pendiente')
        if (!p) return
        clearInterval(t); vista = p
        // El navegador manda un patrón propio: se ignora (lo pone el daemon).
        void resolverTarjeta(store, { id: p.id, decision: 'permitir', alcance: 'siempre', patron: '/**' }, () => { throw new Error('no') }).then(() => listo())
      }, 10)
    })
    const r1 = await pre(m, 'Write', { file_path: join(home, '.claude', 'memory', 'contactos.md'), content: 'x' })
    await resuelto
    expect(r1.hookSpecificOutput?.permissionDecision).toBe('allow')
    expect(vista).toMatchObject({ patron: '.claude/memory/**', patronFrase: 'Permitir siempre guardar en tu memoria' })
    expect(vista?.patronAviso).toMatch(/afuera/)
    expect(reglasSiempre().map(r => [r.herramienta, r.patron])).toEqual([['Escribir', '.claude/memory/**']])
    expect(listarReglas().reglas[0].frase).toBe('Permitir siempre guardar en tu memoria')
    const r2 = await pre(m, 'Write', { file_path: join(home, '.claude', 'memory', 'otra.md'), content: 'y' })
    expect(r2.continue ?? r2.hookSpecificOutput?.permissionDecision === 'allow').toBe(true)
    expect(store.pendientes()).toHaveLength(0)
  })
})
