// instalar.sh (3 nov 2026, vuelta 2 del primer uso; docs/builds/primer-uso-2026-11-03/MARCADOR.md, tropiezos 1 y 3):
// la guía corre UN bloque, el instalador abre el login de Claude Code justo después de los requisitos y la app no se
// abre sin sesión. Aquí con un repo falso: requisitos, servidor, app y `claude` simulados (nada se instala ni se baja).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..', '..')
const INSTALAR = join(RAIZ, 'scripts', 'instalar', 'instalar.sh')

function escribir(ruta: string, texto: string, ejecutable = false) {
  mkdirSync(join(ruta, '..'), { recursive: true })
  writeFileSync(ruta, texto)
  if (ejecutable) chmodSync(ruta, 0o755)
}

/** Repo falso con VERSION y los scripts que llama instalar.sh; HOME con un `claude` que tiene sesión si existe ~/.sesion. */
function montar() {
  const base = mkdtempSync(join(tmpdir(), 'instalar-'))
  const home = join(base, 'home'), repo = join(home, 'Arbrain'), bin = join(base, 'bin')
  mkdirSync(home, { recursive: true })
  escribir(join(bin, 'claude'), `#!/usr/bin/env bash
[ "$1 $2" = "auth status" ] && { [ -f "$HOME/.sesion" ] && echo '{"loggedIn":true}' || echo '{"loggedIn":false}'; exit 0; }
echo "claude $*" >> "$HOME/llamadas"
`, true)
  escribir(join(repo, 'VERSION'), '0.2.99\n')
  escribir(join(repo, 'arbrain', 'scripts', 'instalar', 'requisitos.sh'), `mkdir -p "$HOME/.arbrain"
printf 'export PATH="${bin}:$PATH"\\nexport PY=python3\\n' > "$HOME/.arbrain/entorno.sh"
echo "requisitos" >> "$HOME/llamadas"
. "$HOME/.arbrain/entorno.sh"
S=no; [ -f "$HOME/.sesion" ] && S=si
echo "REQUISITOS_OK node=v22 python=3 claude=2 sesion=$S"
`)
  escribir(join(repo, 'arbrain', 'scripts', 'servidor.mjs'), `import fs from 'node:fs'; import p from 'node:path'; const H = process.env.HOME
const a = process.argv.slice(2), marca = p.join(H, '.arbrain', 'corriendo')
const anotar = (s) => fs.appendFileSync(p.join(H, 'llamadas'), s + '\\n')
if (a[0] === 'estado') console.log(fs.existsSync(marca) ? '[arbrain] Corriendo (pid 1)' : '[arbrain] No está corriendo.')
else if (a[0] === 'arranque-automatico' || a[0] === 'abrir') anotar(a.join(' '))
else { anotar('arranque'); setTimeout(() => fs.writeFileSync(marca, ''), 600); setTimeout(() => {}, 4000) }
`)
  escribir(join(repo, 'arbrain', 'scripts', 'escritorio.mjs'), `import fs from 'node:fs'; import p from 'node:path'; const H = process.env.HOME
fs.appendFileSync(p.join(H, 'llamadas'), 'app ' + process.argv.slice(2).join(' ') + ' sesion=' + (fs.existsSync(p.join(H, '.sesion')) ? 'si' : 'no') + '\\n')
`)
  escribir(join(repo, 'arbrain', 'cerebro', 'sembrar.py'), 'import pathlib, os\np = pathlib.Path(".claude/memory/MEMORY.md")\np.parent.mkdir(parents=True, exist_ok=True)\np.exists() or p.write_text("semilla")\n')
  const git = (...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', 'Arbrain v0.2.99')
  const correr = (extra: Record<string, string> = {}, ...opciones: string[]) => {
    const r = spawnSync('bash', [INSTALAR, repo, ...opciones], {
      encoding: 'utf8', timeout: 60_000,
      env: { NODE_ENV: 'test', HOME: home, PATH: `${bin}:${process.env.PATH}`, ARBRAIN_INSTALAR_PLAZO_S: '8', ...extra },
    })
    return { ...r, ultima: r.stdout.trim().split('\n').pop() ?? '', fases: [...r.stdout.matchAll(/^INSTALAR_FASE (\S+) \d+ (.*)$/gm)].map((m) => `${m[1]}:${m[2]}`) }
  }
  const llamadas = () => (existsSync(join(home, 'llamadas')) ? readFileSync(join(home, 'llamadas'), 'utf8').trim().split('\n') : [])
  const rama = () => git('branch', '--show-current').stdout.trim()
  return { home, repo, correr, llamadas, rama }
}

test('instalar.sh: el login se abre justo después de los requisitos y la app solo con sesión', () => {
  const m = montar()
  const login = { ARBRAIN_INSTALAR_LOGIN: 'sleep 1; touch "$HOME/.sesion"; sleep 5' }
  const r1 = m.correr(login)
  assert.equal(r1.status, 0, r1.stderr)
  assert.match(r1.ultima, /^INSTALAR_SIGUE login /, 'primera corrida: avisa del navegador y regresa')
  assert.deepEqual(r1.fases, ['rama:ok', 'requisitos:sesion=no', 'arranque:ok', 'login:abierto'])
  assert.ok(existsSync(join(m.home, '.arbrain', 'arranque.pid')), 'el programa baja mientras la persona autoriza')
  assert.ok(!m.llamadas().some((l) => l.startsWith('app ')), 'nada de app todavía')
  assert.equal(m.rama(), 'mi-arbrain')

  const r2 = m.correr(login)
  assert.equal(r2.status, 0, r2.stderr)
  assert.match(r2.ultima, /^INSTALAR_OK version=0\.2\.99 sesion=si app=abierta llave_api=no$/)
  const orden = r2.fases.map((f) => f.split(':')[0])
  assert.ok(orden.indexOf('sesion') < orden.indexOf('app'), `la sesión antes de la app: ${orden}`)
  assert.ok(r2.fases.includes('sesion:si'))
  const apps = m.llamadas().filter((l) => l.startsWith('app '))
  assert.deepEqual(apps, ['app instalar sesion=si'], 'la app se instala y se abre una vez, ya con sesión')
  assert.ok(m.llamadas().includes('arranque-automatico activar'))
  assert.equal(m.llamadas().filter((l) => l === 'arranque').length, 1, 'no arranca dos veces')
  assert.equal(readFileSync(join(m.repo, '.claude', 'memory', 'MEMORY.md'), 'utf8'), 'semilla', 'su capa sembrada y guardada')
  assert.equal(spawnSync('git', ['status', '--short'], { cwd: m.repo, encoding: 'utf8' }).stdout.trim(), '')

  const r3 = m.correr(login)
  assert.match(r3.ultima, /^INSTALAR_OK /, 'reentrante: correrlo otra vez no reinstala la app')
  assert.equal(m.llamadas().filter((l) => l.startsWith('app ')).length, 1)
})

test('instalar.sh: sin sesión la app no se abre; con --sin-sesion sí (quien conecta OpenRouter en Llaves)', () => {
  const m = montar()
  const login = { ARBRAIN_INSTALAR_LOGIN: 'sleep 2' } // la persona cierra el navegador sin autorizar
  const t1 = Date.now(); assert.match(m.correr(login).ultima, /^INSTALAR_SIGUE login /); const d1 = Date.now() - t1
  const r2 = m.correr(login)
  assert.match(r2.ultima, /^INSTALAR_SIGUE sesion /, `${d1} ms\n${r2.stdout}`)
  assert.equal(m.llamadas().filter((l) => l.startsWith('app ')).length, 0, 'sin sesión no hay app')
  assert.match(m.correr(login).ultima, /^INSTALAR_SIGUE login /, 'la siguiente corrida vuelve a abrir el login')
  const r4 = m.correr(login, '--sin-sesion')
  assert.match(r4.ultima, /^INSTALAR_OK version=0\.2\.99 sesion=no app=abierta /)
  assert.deepEqual(m.llamadas().filter((l) => l.startsWith('app ')), ['app instalar sesion=no'])
})

test('instalar.sh: con sesión desde los requisitos no abre el login; opciones de prueba para el arnés', () => {
  const m = montar()
  writeFileSync(join(m.home, '.sesion'), '')
  const r = m.correr({ ARBRAIN_INSTALAR_SIN_ARRANQUE_AUTO: '1', ARBRAIN_INSTALAR_APP_SIN_ABRIR: '1', ARBRAIN_INSTALAR_APP_DESTINO: join(m.home, 'Applications') })
  assert.match(r.ultima, /^INSTALAR_OK version=0\.2\.99 sesion=si app=instalada /)
  assert.ok(r.fases.includes('login:ya') && r.fases.includes('arranque-auto:omitido'))
  assert.ok(!m.llamadas().some((l) => /^claude auth login|arranque-automatico/.test(l)))
  assert.deepEqual(m.llamadas().filter((l) => l.startsWith('app ')), [`app instalar --destino ${join(m.home, 'Applications')} --sin-abrir sesion=si`])
})

test('INSTALAR.md: el camino «en tu computadora» son dos bloques y el instalador sale de la etiqueta firmada', () => {
  const guia = readFileSync(join(RAIZ, 'empaquetado', 'plantillas', 'INSTALAR.plantilla.md'), 'utf8')
  const seccion = (titulo: string) => { const a = guia.indexOf(titulo); return guia.slice(a, guia.indexOf('\n## ', a + 1)) }
  const bloques = (s: string) => s.match(/^```bash$/gm)?.length ?? 0
  assert.equal(bloques(seccion('## PASO 1 ')), 1)
  assert.equal(bloques(seccion('## PASO 2 ')), 1)
  const paso2 = seccion('## PASO 2 ')
  assert.match(paso2, /git show "\$V:arbrain\/scripts\/instalar\/instalar\.sh"/, 'corre el instalador de la versión firmada, no el de la copia')
  assert.match(paso2, /verify-tag "\$V"/)
  assert.match(paso2, /git diff --quiet "\$V" -- arbrain/, 'en las corridas siguientes, nada de arbrain/ cambió respecto de la etiqueta')
  assert.doesNotMatch(guia, /setup-token|CLAUDE_CODE_OAUTH_TOKEN/)
  // Lo que el servidor (INSTALAR-NUBE N2) corre literal sigue en el PASO 3.
  assert.equal(bloques(seccion('## PASO 3 ')), 2)
  assert.ok(!/## PASO [4-9]/.test(guia), 'ya no hay PASOS 4 a 9')
})
