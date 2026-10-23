/**
 * Modo de permisos (grupal del 23 oct 2026): «Preguntar siempre», «Automático en mi carpeta» y «Sin preguntar». Lo que
 * ningún modo afloja: el freno (enviar, borrar, publicar, pagar), los secretos, escribir fuera del cerebro y de las
 * carpetas abiertas, los ajustes y ganchos del cerebro, y una conversación que leyó contenido de afuera.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aplicarModo, contextoPolitica, decidirHerramienta, type ContextoPolitica } from './politica-agentes.js'
import { fijarModoPermisos, modoPermisos, MODO_POR_DEFECTO } from './modo-permisos.js'
import { permisosCliente } from '../guardia-agentes.js'

let raiz = '', usuario = '', home = '', datos = '', abierta = '', fuera = ''
const previo = { config: process.env.ARBRAIN_CONFIG_DIR, edicion: process.env.ARBRAIN_EDICION }
const ctxDe = (modo: ContextoPolitica['modo'], over: Partial<ContextoPolitica> = {}): ContextoPolitica =>
  ({ home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], abiertas: [abierta], sandbox: false, modo, ...over })
const tipo = (h: string, input: unknown, ctx: ContextoPolitica) => decidirHerramienta(h, input, ctx).tipo

beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-modo-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Arbrain'); datos = join(raiz, 'datos')
  abierta = join(usuario, 'Documents', 'clientes'); fuera = join(usuario, 'Documents', 'otra')
  for (const d of [join(home, 'notas'), join(home, '.claude', 'skills', 'ventas'), datos, abierta, fuera, join(usuario, '.ssh')]) mkdirSync(d, { recursive: true })
  writeFileSync(join(home, 'notas', 'a.md'), 'a'); writeFileSync(join(fuera, 'b.md'), 'b'); writeFileSync(join(abierta, 'c.md'), 'c')
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_CONFIG_DIR', previo.config], ['ARBRAIN_EDICION', previo.edicion]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(raiz, { recursive: true, force: true })
})

describe('el modo vive en la carpeta de la app', () => {
  it('por defecto «carpeta»; se guarda y se lee; un valor raro vuelve al defecto', () => {
    expect(MODO_POR_DEFECTO).toBe('carpeta')
    expect(modoPermisos()).toBe('carpeta')
    expect(fijarModoPermisos('libre')).toBe('libre')
    expect(contextoPolitica({}, { HOME: usuario, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config') }).modo).toBe('libre')
    writeFileSync(join(datos, 'config', 'permisos.json'), '{"modo":"todo"}')
    expect(modoPermisos()).toBe('carpeta')
    fijarModoPermisos('preguntar')
    expect(modoPermisos()).toBe('preguntar')
  })
  it('el agente no puede escribir el archivo del modo, ni con clic, en ningún modo', () => {
    for (const modo of ['preguntar', 'carpeta', 'libre'] as const) {
      const ctx = ctxDe(modo, { protegidas: [datos, join(datos, 'config')] })
      expect(tipo('Write', { file_path: join(datos, 'config', 'permisos.json'), content: '{"modo":"libre"}' }, ctx), modo).toBe('negar')
      expect(tipo('Bash', { command: `echo '{"modo":"libre"}' > ${join(datos, 'config', 'permisos.json')}` }, ctx), modo).toBe('negar')
    }
  })
})

describe('Automático en mi carpeta', () => {
  it('sin sandbox (Windows): comandos de solo lectura y crear carpetas en su cerebro corren sin clic', () => {
    expect(tipo('Bash', { command: 'ls notas && cat notas/a.md' }, ctxDe('preguntar'))).toBe('confirmar')
    expect(tipo('Bash', { command: 'ls notas && cat notas/a.md' }, ctxDe('carpeta'))).toBe('permitir')
    expect(tipo('Bash', { command: 'mkdir -p notas/clientes' }, ctxDe('preguntar'))).toBe('confirmar')
    expect(tipo('Bash', { command: 'mkdir -p notas/clientes' }, ctxDe('carpeta'))).toBe('permitir')
  })
  it('escribir en una carpeta abierta y editar sus instrucciones y skills en Markdown, sin clic', () => {
    expect(tipo('Write', { file_path: join(abierta, 'nuevo.md'), content: 'x' }, ctxDe('preguntar'))).toBe('confirmar')
    expect(tipo('Write', { file_path: join(abierta, 'nuevo.md'), content: 'x' }, ctxDe('carpeta'))).toBe('permitir')
    expect(tipo('Edit', { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), old_string: 'a', new_string: 'b' }, ctxDe('carpeta'))).toBe('permitir')
    expect(tipo('Write', { file_path: join(home, 'CLAUDE.md'), content: 'x' }, ctxDe('carpeta'))).toBe('permitir')
  })
  it('lo que sale de su carpeta o ejecuta código sigue preguntando, con la pista de dónde cambiarlo', () => {
    const leerFuera = decidirHerramienta('Read', { file_path: join(fuera, 'b.md') }, ctxDe('carpeta'))
    expect(leerFuera.tipo).toBe('confirmar')
    if (leerFuera.tipo === 'confirmar') expect(leerFuera.avisos.join(' ')).toMatch(/Ajustes › Permisos y seguridad.*Sin preguntar/)
    expect(tipo('Bash', { command: 'npm install left-pad' }, ctxDe('carpeta'))).toBe('confirmar')
    expect(tipo('Bash', { command: 'python3 script.py' }, ctxDe('carpeta'))).toBe('confirmar')
    expect(tipo('Write', { file_path: join(home, '.claude', 'skills', 'ventas', 'correr.py'), content: 'x' }, ctxDe('carpeta'))).toBe('confirmar')
    expect(tipo('Write', { file_path: join(home, 'arbrain', 'src', 'app', 'page.tsx'), content: 'x' }, ctxDe('carpeta'))).toBe('confirmar')
    expect(tipo('WebFetch', { url: 'https://ejemplo-nuevo.com/x' }, ctxDe('carpeta', { dominiosWeb: new Set() }))).toBe('confirmar')
  })
  it('en «preguntar», lo que en «carpeta» correría solo trae la pista de ese modo', () => {
    const d = decidirHerramienta('Bash', { command: 'ls notas' }, ctxDe('preguntar'))
    expect(d.tipo).toBe('confirmar')
    if (d.tipo === 'confirmar') expect(d.avisos.join(' ')).toMatch(/Automático en mi carpeta/)
  })
})

describe('Sin preguntar', () => {
  it('comandos, leer fuera, páginas nuevas y código propio corren sin clic', () => {
    for (const [h, input] of [
      ['Bash', { command: 'npm install left-pad' }], ['Bash', { command: 'python3 script.py' }], ['Read', { file_path: join(fuera, 'b.md') }],
      ['Write', { file_path: join(home, 'arbrain', 'src', 'app', 'page.tsx'), content: 'x' }], ['mcp__todoist__update_task', { id: 1 }],
    ] as const) expect(tipo(h, input, ctxDe('libre', { dominiosWeb: new Set() })), `${h} ${JSON.stringify(input)}`).toBe('permitir')
    expect(tipo('WebFetch', { url: 'https://ejemplo-nuevo.com/x' }, ctxDe('libre', { dominiosWeb: new Set() }))).toBe('permitir')
  })
})

describe('lo que ningún modo afloja', () => {
  const modos = ['preguntar', 'carpeta', 'libre'] as const
  it('el freno: enviar, borrar y publicar siempre piden clic; pagar se niega', () => {
    for (const modo of modos) {
      const ctx = ctxDe(modo)
      expect(tipo('Bash', { command: 'rm notas/a.md' }, ctx), modo).toBe('confirmar')
      expect(tipo('Bash', { command: 'git push origin mi-arbrain' }, ctx), modo).toBe('confirmar')
      expect(tipo('Bash', { command: 'curl -X POST https://api.ejemplo.com -d x=1' }, ctx), modo).toBe('confirmar')
      expect(tipo('mcp__gmail__send_email', { to: 'a@b.c' }, ctx), modo).toBe('confirmar')
      expect(tipo('mcp__todoist__delete_task', { id: 1 }, ctx), modo).toBe('confirmar')
      expect(tipo('mcp__stripe__create_payment', { amount: 1 }, ctx), modo).toBe('negar')
    }
  })
  it('secretos, escribir fuera de sus carpetas, ajustes, ganchos y git: negados', () => {
    for (const modo of modos) {
      const ctx = ctxDe(modo)
      expect(tipo('Read', { file_path: join(usuario, '.ssh', 'id_ed25519') }, ctx), modo).toBe('negar')
      expect(tipo('Write', { file_path: join(fuera, 'x.md'), content: 'x' }, ctx), modo).toBe('negar')
      expect(tipo('Write', { file_path: join(home, '.claude', 'settings.json'), content: '{}' }, ctx), modo).toBe('negar')
      expect(tipo('Write', { file_path: join(home, '.claude', 'hooks', 'x.py'), content: '' }, ctx), modo).toBe('negar')
      expect(tipo('Bash', { command: 'rm -rf notas' }, ctx), modo).toBe('negar')
    }
  })
  it('el motivo de negar ajustes y carpetas guía a la persona a Ajustes', () => {
    const a = decidirHerramienta('Write', { file_path: join(home, '.claude', 'settings.json'), content: '{}' }, ctxDe('libre'))
    const b = decidirHerramienta('Write', { file_path: join(fuera, 'x.md'), content: 'x' }, ctxDe('libre'))
    expect(a.tipo === 'negar' && a.motivo).toMatch(/ningún agente cambia sus propios permisos.*Ajustes › Permisos y seguridad/)
    expect(b.tipo === 'negar' && b.motivo).toMatch(/Carpetas a las que tu cerebro puede entrar/)
  })
  it('una conversación que leyó contenido de afuera vuelve a preguntar, aun en «Sin preguntar»', () => {
    const sucia = ctxDe('libre', { contaminada: { fuente: 'una página web' }, dominiosWeb: new Set() })
    expect(tipo('Bash', { command: 'python3 script.py' }, sucia)).toBe('confirmar')
    expect(tipo('Read', { file_path: join(fuera, 'b.md') }, sucia)).toBe('confirmar')
    expect(tipo('Write', { file_path: join(home, '.claude', 'skills', 'ventas', 'SKILL.md'), content: 'x' }, ctxDe('carpeta', { contaminada: { fuente: 'correo' } }))).toBe('confirmar')
  })
  it('aplicarModo nunca convierte un negar ni una categoría del freno', () => {
    expect(aplicarModo({ tipo: 'negar', motivo: 'x' }, ctxDe('libre'))).toEqual({ tipo: 'negar', motivo: 'x' })
    for (const categoria of ['enviar', 'borrar', 'publicar', 'pagar'] as const) {
      expect(aplicarModo({ tipo: 'confirmar', categoria, resumen: 'r', literal: 'l', avisos: [], relajable: 'carpeta' }, ctxDe('libre')).tipo).toBe('confirmar')
    }
  })
})

describe('las rutinas no usan el modo', () => {
  it('permisosCliente con origen cron conserva «preguntar» aunque la persona eligió «Sin preguntar»', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const base = async () => ({ behavior: 'allow' as const, updatedInput: {} })
    const contexto = () => ctxDe('libre')
    const chat = permisosCliente(base, () => {}, { contexto, origen: 'agente', confirmaciones: () => null, hayQuienConfirme: () => false })
    const cron = permisosCliente(base, () => {}, { contexto, origen: 'cron', confirmaciones: () => null, hayQuienConfirme: () => false })
    const o = { signal: new AbortController().signal, toolUseID: 't1' } as Parameters<typeof chat>[2]
    expect((await chat('Bash', { command: 'python3 script.py' }, o))?.behavior).toBe('allow')
    expect((await cron('Bash', { command: 'python3 script.py' }, o))?.behavior).toBe('deny')
  })
})
