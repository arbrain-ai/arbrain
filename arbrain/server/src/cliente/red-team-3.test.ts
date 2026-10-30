/**
 * Red team 3 (docs/builds/empaquetado-2026-10-11/RED-TEAM-3.md), parte del daemon:
 *   A-4  autorizar y despachar sobre UNA ruta canónica (`/x/../apagar` con el pase ya no apaga el daemon);
 *   A-6  opciones de «lectura» que escriben o ejecutan, con abreviaturas largas y clústeres cortos; sandbox real;
 *   M-1  el pase no escribe en nombre de la persona ni en sus cifras (`/newchat`, `/cohorte/venta`, `/synthesize`,
 *        `/schedule/*`).
 * Disco falso en /tmp; nada toca la pantalla ni la red.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decidirHerramienta, type ContextoPolitica } from './politica-agentes.js'
import { rutaSoloApp } from './cofre.js'
import { rutaCanonica } from './rutas.js'
import { _sandboxParaPruebas, esFalloDeSandbox, marcarSandboxFallido, opcionesSandbox, sandboxActivo } from './sandbox.js'

let ctx: ContextoPolitica
const previo = process.env.ARBRAIN_EDICION

beforeAll(() => {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-rt3-')))
  const usuario = join(raiz, 'usuario'), home = join(usuario, 'cerebro'), datos = join(usuario, 'datos')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(datos, 'config'), { recursive: true })
  writeFileSync(join(home, 'notas.md'), '# notas')
  writeFileSync(join(home, 'payload.txt'), '{}')
  writeFileSync(join(home, '.claude', 'settings.json'), '{}')
  ctx = { home, cwd: home, usuario, protegidas: [datos, join(datos, 'config')], lecturaExtra: [], sandbox: true }
  process.env.ARBRAIN_EDICION = 'cliente'
})
afterEach(() => { process.env.ARBRAIN_EDICION = 'cliente'; _sandboxParaPruebas() })
afterAll(() => { if (previo === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo })

describe('A-4: una sola ruta canónica para la lista del pase y para el router', () => {
  it('las rutas rectas pasan tal cual (con su query)', () => {
    for (const r of ['/', '/health', '/apagar', '/chat/stream', '/confirmaciones/cf_0123456789ab', '/fs/read', '/chat/'])
      expect(rutaCanonica(r), r).toBe(r)
    expect(rutaCanonica('/fs/read?path=notas.md&x=../y')).toBe('/fs/read')   // la query no es ruta
    expect(rutaCanonica('/schedule?x=%2e%2e')).toBe('/schedule')
  })
  it('toda variante que el router normalizaría a otra ruta se rechaza', () => {
    for (const r of [
      '/x/../apagar', '/./apagar', '/x/./apagar', '//apagar', '/x//apagar', '/apagar/..', '/apagar/.',
      '/x/%2e%2e/apagar', '/x/%2E%2E/apagar', '/x/.%2e/apagar', '/x/%2e./apagar', '/x%2f..%2fapagar', '/x/..%2Fapagar',
      '/%2e/apagar', '/x/..%5capagar', '/x\\..\\apagar', '/apagar#x', '/apagar%00', '/apa gar', '/%zz',
      'apagar', '*', 'http://127.0.0.1/apagar', '//evil.test/apagar', '/llaves/../llaves/probar', '/x/../manos/interruptor',
      '/x/../newchat', '/x/../cohorte/venta', '/x/../chat', '',
    ]) expect(rutaCanonica(r), r).toBeNull()
    expect(rutaCanonica(undefined)).toBeNull()
  })
  it('lo que queda canónico es exactamente lo que ve new URL (no hay segunda lectura posible)', () => {
    for (const r of ['/apagar', '/chat/stream', '/schedule/abc/run', '/fs/read', '/%61pagar'])
      if (rutaCanonica(r) !== null) expect(new URL(r, 'http://127.0.0.1').pathname).toBe(rutaCanonica(r))
    // `/%61pagar` no es `/apagar` para el router (WHATWG no decodifica la ruta): no hay atajo por codificación.
    expect(new URL('/%61pagar', 'http://127.0.0.1').pathname).not.toBe('/apagar')
  })
})

describe('M-1/M-2: el pase no escribe en nombre de la persona ni en sus cifras', () => {
  it('rutas de la app: 403 con el pase', () => {
    for (const r of ['/apagar', '/llaves/probar', '/manos/interruptor', '/confirmaciones/resolver', '/cohorte/consentimiento',
      '/chat', '/chat/stream', '/chat/fork', '/newchat', '/cohorte/venta', '/synthesize', '/schedule/abc/run', '/schedule/abc/pause', '/schedule/abc/resume'])
      expect(rutaSoloApp('POST', r), r).toBe(true)
  })
  it('las rutas de agente siguen abiertas al pase', () => {
    for (const [m, r] of [['GET', '/schedule'], ['GET', '/manos/estado'], ['POST', '/confirmaciones/pedir'], ['GET', '/health']] as const)
      expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(false)
  })
})

describe('A-6: ninguna bandera vuelve escritura o ejecución un Bash «de solo lectura»', () => {
  const casos: Array<[string, 'negar' | 'confirmar']> = [
    // La tabla del red team: escribir los ajustes del cerebro se NIEGA; ejecutar otro programa pide confirmación.
    ['sort -ro .claude/settings.json payload.txt', 'negar'],
    ['sort --outp=.claude/settings.json payload.txt', 'negar'],
    ['sort --o=.claude/settings.json payload.txt', 'negar'],
    ['sort -o .claude/settings.json payload.txt', 'negar'],
    ['sort -nro .claude/settings.json payload.txt', 'negar'],
    ['sort --compress-prog=sh payload.txt', 'confirmar'],
    ['sort --compress-program=sh payload.txt', 'confirmar'],
    ['sort --comp=sh payload.txt', 'confirmar'],
    ['sort -T /tmp payload.txt', 'confirmar'],
    ['sort -nT /tmp payload.txt', 'confirmar'],
    ['sort --temp=/tmp payload.txt', 'confirmar'],
    ['sort -o salida.txt notas.md', 'confirmar'],
    ['rg --hostname-bin=./x.sh x notas.md', 'confirmar'],
    ['rg --hostname=./x.sh x notas.md', 'confirmar'],
    ['rg --pre=./x.sh x notas.md', 'confirmar'],
    ['rg --pre ./x.sh x notas.md', 'confirmar'],
    ['rg --pre-glob=*.md x notas.md', 'confirmar'],
    ['rg -z x notas.md', 'confirmar'],
    ['rg -uuz x notas.md', 'confirmar'],
    ['rg --search-z x notas.md', 'confirmar'],
    ['git grep --open-f=sh MARKER x', 'confirmar'],
    ['git grep --open-files-in-pager=sh MARKER', 'confirmar'],
    ['git grep -O MARKER', 'confirmar'],
    ['git grep -Osh MARKER', 'confirmar'],
    ['git grep -nO MARKER', 'confirmar'],
    ['git grep -nLO MARKER', 'confirmar'],
    ['git grep -iGO MARKER', 'confirmar'],
    ['git log --outp=notas2.md', 'confirmar'],
    ['git diff --ext-d', 'confirmar'],
    ['git show --textc HEAD', 'confirmar'],
    ['git cat-file --filters HEAD:notas.md', 'confirmar'],
    ['git log --exe=x', 'confirmar'],
    ['date -f /etc/hosts', 'confirmar'],
    ['date --fi=/etc/hosts', 'confirmar'],
    ['date -s 2020-01-01', 'confirmar'],
    ['date --se=2020-01-01', 'confirmar'],
    ['file -C -m magia', 'confirmar'],
    ['file --comp -m magia', 'confirmar'],
    ['tree -o salida.txt', 'confirmar'],
    ['tree --out=salida.txt', 'confirmar'],
    ['tree -R -H . .', 'confirmar'],
  ]
  for (const [cmd, espera] of casos) {
    it(cmd, () => {
      const d = decidirHerramienta('Bash', { command: cmd }, ctx)
      expect(d.tipo, JSON.stringify(d)).toBe(espera)
    })
  }
  it('sin regresión: las lecturas de siempre siguen sin preguntar', () => {
    for (const cmd of ['sort notas.md', 'sort -nr notas.md', 'sort -t: -k2 notas.md', 'sort -u notas.md | head', 'rg todo', 'rg -n todo notas.md',
      'rg -uu todo', 'git grep -n todo', 'git log --oneline -5', 'git log --stat -3', 'git diff HEAD~1 -- notas.md', 'git show HEAD --stat',
      'date', 'date +%Y-%m-%d', 'date -u', 'date -Iseconds', 'file notas.md', 'tree -L 2', 'uniq notas.md'])
      expect(decidirHerramienta('Bash', { command: cmd }, ctx).tipo, cmd).toBe('permitir')
  })
})

describe('A-6: el sandbox cuenta solo si de verdad se aplica', () => {
  it('el CLI corre con failIfUnavailable: true (nunca «lectura sin clic» sin contención)', () => {
    expect(opcionesSandbox(ctx).failIfUnavailable).toBe(true)
  })
  it('sin prueba real o tras un fallo del CLI: sin sandbox, y entonces TODO Bash se confirma', () => {
    _sandboxParaPruebas({ prueba: false })
    expect(sandboxActivo({ PATH: '/usr/bin:/bin' }, 'darwin')).toBe(false)
    _sandboxParaPruebas({ prueba: true })
    expect(sandboxActivo({ ARBRAIN_SANDBOX: '0' }, 'darwin')).toBe(false)
    expect(sandboxActivo({}, 'win32')).toBe(false)
    expect(esFalloDeSandbox('Error: sandbox required but unavailable: bwrap not found')).toBe(true)
    expect(esFalloDeSandbox('Error: SandboxUnavailableForShellError')).toBe(true)
    expect(esFalloDeSandbox('rate limit')).toBe(false)
    expect(marcarSandboxFallido('sandbox required but unavailable')).toBe(true)
    expect(marcarSandboxFallido('otra vez')).toBe(false)
    expect(sandboxActivo()).toBe(false)
    expect(decidirHerramienta('Bash', { command: 'ls' }, { ...ctx, sandbox: false }).tipo).toBe('confirmar')
    expect(decidirHerramienta('Bash', { command: 'cat notas.md' }, { ...ctx, sandbox: false }).tipo).toBe('confirmar')
  })
  it.runIf(process.platform === 'darwin')('macOS: la prueba real de Seatbelt corre y se recuerda', () => {
    _sandboxParaPruebas()
    const a = sandboxActivo()
    expect(typeof a).toBe('boolean')
    expect(sandboxActivo()).toBe(a)
  })
})
