/**
 * Red team 4 (ronda final, 11 oct 2026), lo que se cierra en código del lado del daemon:
 *   M4-2  el pase de agente no lee conversaciones ni datos de la persona: lista BLANCA de rutas del pase.
 *   M4-3  la política niega el socket del motor de terminales (también en su ruta alterna de `$TMPDIR`).
 *   L4-1  `.git/**` y `.claude/settings.local.json` no se leen sin más.
 *   L4-2  `mcp__manos__*` negado en cliente (la v1 no tiene computer use).
 * Las pruebas en vivo contra el daemon real están en `ps-entorno.test.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { rutaSoloApp } from './cofre.js'
import { contextoPolitica, decidirHerramienta } from './politica-agentes.js'

describe('M4-2: el pase de agente solo abre lo que usan los agentes', () => {
  it('lecturas de la persona: 403 con el pase', () => {
    const cerradas: Array<[string, string]> = [
      ['GET', '/sessions'], ['GET', '/chat/backstage'], ['GET', '/chat/sessions'], ['POST', '/chat/sdk-sessions'],
      ['GET', '/ops/recent'], ['GET', '/ops/stream'], ['GET', '/usage'], ['GET', '/confirmaciones'], ['GET', '/confirmaciones/cf_000000000000'],
      ['GET', '/fs/read'], ['GET', '/fs/list'], ['GET', '/fs/index'], ['POST', '/cabina'], ['GET', '/cohorte'],
      ['GET', '/commands'], ['GET', '/limits'], ['GET', '/models'], ['POST', '/efforts'], ['POST', '/preferencias/motor'],
      ['POST', '/modelos/catalogo'], ['POST', '/tts'], ['POST', '/live/workspace'], ['POST', '/live/transcribe'],
      ['POST', '/chat/despertadores'], ['POST', '/schedule/x/run'],
    ]
    for (const [m, r] of cerradas) expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(true)
  })
  it('rutas de agente: abiertas, y solo con su método', () => {
    for (const [m, r] of [['GET', '/health'], ['GET', '/schedule'], ['GET', '/manos/estado'], ['GET', '/manos/interruptor'], ['POST', '/confirmaciones/pedir'], ['POST', '/confirmaciones/consumir']] as const)
      expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(false)
    for (const [m, r] of [['POST', '/health'], ['POST', '/schedule'], ['POST', '/manos/interruptor'], ['GET', '/confirmaciones/pedir'], ['DELETE', '/schedule']] as const)
      expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(true)
  })
})

describe('M4-3 y bajos: la política de los agentes', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'arbrain-rt4-'))
  afterAll(() => { rmSync(raiz, { recursive: true, force: true }); rmSync(alterna, { recursive: true, force: true }) })
  const home = join(raiz, 'cerebro'), datos = join(raiz, 'datos')
  // La carpeta alterna vive de verdad en la carpeta temporal del sistema, como en la app (`$TMPDIR/arbrain-<hash>`).
  const hash = `0a1b${process.pid.toString(16).padStart(8, '0')}`
  const alterna = join(tmpdir(), `arbrain-${hash}`)
  mkdirSync(join(home, '.git'), { recursive: true }); mkdirSync(join(home, '.claude'), { recursive: true }); mkdirSync(alterna, { recursive: true }); mkdirSync(datos, { recursive: true })
  writeFileSync(join(home, '.git', 'config'), '[remote "origin"]\n'); writeFileSync(join(home, '.claude', 'settings.local.json'), '{}')
  writeFileSync(join(alterna, 'motor.sock'), '')
  const ctx = contextoPolitica({ sandbox: true }, { HOME: raiz, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_CONFIG_DIR: join(datos, 'config'), ARBRAIN_MOTOR_SOCK: join(alterna, 'motor.sock') })

  it('M4-3: la carpeta alterna del socket queda protegida (normalizada)', () => {
    expect(ctx.protegidas.some(p => p.endsWith(`arbrain-${hash}`))).toBe(true)
    for (const p of [join(alterna, 'motor.sock'), alterna, `${alterna}/./motor.sock`, `${alterna}/../arbrain-${hash}/motor.sock`, join(alterna, 'otro')])
      expect(decidirHerramienta('Read', { file_path: p }, ctx).tipo, p).toBe('negar')
    expect(decidirHerramienta('Glob', { pattern: '*', path: alterna }, ctx).tipo).toBe('negar')
  })
  it('M4-3: cualquier comando que nombre el socket se niega, ni con clic', () => {
    for (const cmd of [
      `nc -U ${alterna}/motor.sock`, 'nc -U "$TMPDIR"/arbrain-*/motor.sock', "python3 -c 'import socket;s=socket.socket(1);s.connect(\"x/motor.sock\")'",
      `socat - UNIX-CONNECT:$TMPDIR/arbrain-${hash}/motor.sock`, `ls \${TMPDIR}/arbrain-${hash}`, `ls $TMPDIR/arbrain-${hash}/`, `ls ${alterna}`, 'node -e "net.connect(process.env.ARBRAIN_MOTOR_SOCK)"',
      'cat motor.so""ck', 'echo $ARBRAIN_MOTOR_TOKEN',
    ]) expect(decidirHerramienta('Bash', { command: cmd }, ctx).tipo, cmd).toBe('negar')
    expect(decidirHerramienta('Read', { file_path: join(home, 'notas', 'motor.sock') }, ctx).tipo).toBe('negar')
  })
  it('M4-3: sin la ruta alterna, nada cambia para el resto de /tmp', () => {
    const sin = contextoPolitica({ sandbox: true }, { HOME: raiz, ARBRAIN_HOME: home, ARBRAIN_DATA_DIR: datos, ARBRAIN_MOTOR_SOCK: join(datos, 'config', 'motor.sock') })
    expect(sin.protegidas.filter(p => p.includes(`arbrain-${hash}`))).toEqual([])
    // Un socket cuyo directorio no tiene la forma esperada no protege su carpeta entera (sería demasiado ancho).
    const raro = contextoPolitica({ sandbox: true }, { HOME: raiz, ARBRAIN_HOME: home, ARBRAIN_MOTOR_SOCK: join(raiz, 'tmp', 'motor.sock') })
    expect(raro.protegidas).not.toContain(join(raiz, 'tmp'))
  })
  it('L4-1: .git y settings.local.json no se leen (ni se escriben)', () => {
    for (const p of ['.git/config', join(home, '.git', 'config'), '.claude/settings.local.json', './.git/HEAD'])
      expect(decidirHerramienta('Read', { file_path: p }, ctx).tipo, p).toBe('negar')
    for (const cmd of ['cat .git/config', 'head -5 .claude/settings.local.json'])
      expect(decidirHerramienta('Bash', { command: cmd }, ctx).tipo, cmd).toBe('negar')
    // Lo demás de git sigue igual: leer el historial y `.gitignore` no es leer la carpeta.
    expect(decidirHerramienta('Bash', { command: 'git log --oneline -5' }, ctx).tipo).toBe('permitir')
    expect(decidirHerramienta('Read', { file_path: '.gitignore' }, ctx).tipo).toBe('permitir')
  })
  it('L4-2 (0.1.2): manos lo decide su propio freno en macOS y Windows; en Linux sigue negado', () => {
    const esperado = process.platform === 'darwin' || process.platform === 'win32' ? 'permitir' : 'negar'
    for (const h of ['mcp__manos__actuar', 'mcp__manos__navegar'])
      expect(decidirHerramienta(h, {}, ctx).tipo, h).toBe(esperado)
    expect(decidirHerramienta('mcp__cabina__mostrar', { vista: 'lienzo' }, ctx).tipo).toBe('permitir')
  })
})
