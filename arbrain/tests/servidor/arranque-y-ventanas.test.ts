// Arranque y ventanas (29 oct 2026, cohorte). Dos quejas:
//  - Mac: «una ventana en blanco, luego la de Arbrain y luego una en Safari». `servidor.mjs abrir` abría siempre el
//    navegador aunque hubiera app de escritorio, y la app 0.1.x podía seguir instalada junto a la nueva.
//  - «Se fue el internet y ya no me dejó entrar». El supervisor se rendía tras 5 caídas en 5 minutos.
// Todo con funciones puras y carpetas temporales: nunca toca la instalación real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  avisoAppVieja, buscarAppsViejas, comandoApp, corriendoEnLista, elegirApertura, ID_APP_VIEJA, ID_ESCRITORIO, idDeBundle,
  lugaresApp, nombreRespaldo, patronProcesoBundle, scriptEnfocarWindows,
} from '../../scripts/servidor/ventanas.mjs'
import { avisoCaida, ESPERAS_MS, ESTABLE_MS, esperaTras, trasCaida } from '../../scripts/servidor/reintentos.mjs'
import { reintentarConexion } from '../../src/features/chat/lib/reintentar-conexion'
import { esperaPideReintento } from '../../src/features/chat/lib/espera-explicada'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

// ── A: app o navegador ──────────────────────────────────────────────────────────────────────────────────────────

const HOME = '/Users/alumno'
const REPO = '/Users/alumno/Arbrain'
const DATOS = '/Users/alumno/Library/Application Support/ai.arbrain.servidor'
const APP = '/Applications/Arbrain.app'
const base = { repo: REPO, datos: DATOS, datosPorDefecto: DATOS, home: HOME, plataforma: 'darwin', existe: (r: string) => r === APP }

test('con la app de escritorio instalada para esta copia, se abre la app y no el navegador', () => {
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP, repo: REPO } }), { via: 'app', app: APP })
  // Sin `repo` en la configuración la app usa ~/Arbrain (servidor.rs › Config::cargar): también es esta copia.
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP } }), { via: 'app', app: APP })
})

test('sin app, o con la app de otra copia u otra carpeta de datos, el navegador queda de respaldo', () => {
  assert.deepEqual(elegirApertura({ ...base, cfg: null }), { via: 'navegador', motivo: 'sin-app' })
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: '/Applications/Borrada.app', repo: REPO } }), { via: 'navegador', motivo: 'sin-app' })
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP, repo: '/Users/alumno/OtraCopia' } }), { via: 'navegador', motivo: 'otra-copia' })
  assert.deepEqual(elegirApertura({ ...base, datos: '/tmp/prueba-ci', cfg: { app: APP, repo: REPO } }), { via: 'navegador', motivo: 'otros-datos' })
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP, repo: REPO, datos: '/tmp/otra' } }), { via: 'navegador', motivo: 'otros-datos' })
})

test('--navegador lo fuerza y --sin-navegador no abre nada (la app y el arranque automático lo usan)', () => {
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP }, navegador: true }), { via: 'navegador', motivo: 'pedido' })
  assert.deepEqual(elegirApertura({ ...base, cfg: { app: APP }, sinNavegador: true }), { via: 'nada' })
})

test('Windows compara rutas sin distinguir mayúsculas', () => {
  const exe = 'C:\\Users\\Fulano\\AppData\\Local\\Programs\\Arbrain\\Arbrain.exe'
  const r = elegirApertura({
    cfg: { app: exe, repo: 'C:\\Users\\Fulano\\Arbrain' }, repo: 'c:\\users\\fulano\\arbrain', datos: 'C:\\D', datosPorDefecto: 'c:\\d',
    home: 'C:\\Users\\Fulano', plataforma: 'win32', existe: () => true,
  })
  assert.equal(r.via, 'app')
})

test('abrir la app: en Mac con `open` (enfoca la que ya está); en Windows primero se busca la ventana abierta', () => {
  assert.deepEqual(comandoApp('darwin', APP), ['/usr/bin/open', [APP]])
  assert.deepEqual(comandoApp('linux', '/home/a/.local/share/arbrain-escritorio/arbrain'), ['/home/a/.local/share/arbrain-escritorio/arbrain', []])
  const ps = scriptEnfocarWindows("C:\\Users\\O'Hara\\Arbrain.exe")
  assert.match(ps, /-ieq 'C:\\Users\\O''Hara\\Arbrain\.exe'/)
  assert.match(ps, /AppActivate\(\$p\.Id\)/)
  assert.equal(corriendoEnLista('/usr/bin/zsh\n/home/a/app/arbrain --x\n', '/home/a/app/arbrain'), true)
  assert.equal(corriendoEnLista('/home/a/app/arbrain-otro\n', '/home/a/app/arbrain'), false)
})

test('servidor.mjs: abrir/iniciar pasan por la elección (ya no abren el navegador siempre)', () => {
  const s = fuente('scripts/servidor.mjs')
  const abrirCon = s.slice(s.indexOf('async function abrirConSesion'), s.indexOf('function resolverCerebro'))
  assert.match(abrirCon, /const a = apertura\(\)/)
  assert.match(abrirCon, /if \(a\.via === 'app'\) return abrirApp\(a\.app\)/)
  const fin = s.slice(s.indexOf('Para apagarlo: Ctrl+C'), s.indexOf('async function sembrarLienzos'))
  assert.match(fin, /if \(a\.via === 'app'\) abrirApp\(a\.app\)\n\s+else if \(a\.via === 'navegador'\) abrirNavegador/)
  const abrir = s.slice(s.indexOf("if (orden === 'abrir')"), s.indexOf("if (orden === 'detener')"))
  assert.ok(abrir.indexOf("a.via === 'app'") < abrir.indexOf('return iniciar()'), 'apagado y con app: la app lo enciende')
})

// ── A: la app 0.1.x junto a la nueva ────────────────────────────────────────────────────────────────────────────

const plist = (id: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Arbrain</string>
  <key>CFBundleIdentifier</key>
  <string>${id}</string>
</dict></plist>
`

test('detecta la app 0.1.x (otro identificador) y no confunde la nueva', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'arbrain-ventanas-'))
  try {
    const sistema = join(tmp, 'Applications', 'Arbrain.app')
    const usuario = join(tmp, 'home', 'Applications', 'Arbrain.app')
    for (const [ruta, id] of [[sistema, ID_ESCRITORIO], [usuario, ID_APP_VIEJA]] as const) {
      mkdirSync(join(ruta, 'Contents'), { recursive: true })
      writeFileSync(join(ruta, 'Contents', 'Info.plist'), plist(id))
    }
    assert.equal(idDeBundle(sistema), ID_ESCRITORIO)
    assert.equal(idDeBundle(usuario), ID_APP_VIEJA)
    const lugares = [sistema, usuario, join(tmp, 'no-existe', 'Arbrain.app')]
    assert.deepEqual(buscarAppsViejas({ plataforma: 'darwin', home: tmp, lugares }), [{ ruta: usuario, id: ID_APP_VIEJA }])
    // Solo la nueva: nada que avisar.
    assert.deepEqual(buscarAppsViejas({ plataforma: 'darwin', home: tmp, lugares: [sistema] }), [])
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('dónde se busca, el aviso y el respaldo (nunca se borra)', () => {
  assert.deepEqual(lugaresApp('darwin', HOME), ['/Applications/Arbrain.app', '/Users/alumno/Applications/Arbrain.app'])
  assert.deepEqual(lugaresApp('win32', 'C:\\U', { LOCALAPPDATA: 'C:\\U\\L' }).length, 1)
  assert.deepEqual(lugaresApp('linux', '/home/a'), [])
  // Windows: el .exe de la 0.1.x se reporta; la app nueva nunca.
  const nueva = 'C:\\U\\L\\Programs\\Arbrain\\Arbrain.exe'
  assert.deepEqual(buscarAppsViejas({ plataforma: 'win32', home: 'C:\\U', lugares: ['C:\\U\\L\\Arbrain\\Arbrain.exe', nueva], existe: () => true, appNueva: nueva }),
    [{ ruta: 'C:\\U\\L\\Arbrain\\Arbrain.exe', id: null }])
  const aviso = avisoAppVieja([{ ruta: '/Users/alumno/Applications/Arbrain.app', id: ID_APP_VIEJA }], 'darwin')
  assert.match(aviso, /^ya hay otra app «Arbrain»/, 'la skill y el INSTALAR reconocen este inicio')
  assert.match(aviso, /--reemplazar-app-vieja/)
  assert.match(aviso, /Arbrain-respaldos/)
  assert.match(avisoAppVieja([{ ruta: 'C:\\x', id: null }], 'win32'), /Desinstalar/)
  assert.equal(nombreRespaldo('/Applications/Arbrain.app'), 'Arbrain-anterior.app')
  assert.equal(patronProcesoBundle('/Users/usuario/Mis Apps/Arbrain.app'), '/Users/usuario/Mis Apps/Arbrain\\.app/Contents/MacOS/')
})

test('escritorio.mjs: revisa la app vieja al instalar y en estado; retirar solo con --reemplazar-app-vieja y moviendo', () => {
  const s = fuente('scripts/escritorio.mjs')
  assert.match(s, /revisarAppsViejas\(cfg\.app\)\n\s+if \(!bandera\('--sin-abrir'\)\)/, 'también cuando ya estaba al día')
  assert.match(s, /di\(`Instalada: \$\{app\}`\)\n\s+revisarAppsViejas\(app\)/)
  assert.match(s, /revisarAppsViejas\(cfg\?\.app \?\? null, false\)/, 'estado solo avisa')
  const fn = s.slice(s.indexOf('function revisarAppsViejas'), s.indexOf('// ── Órdenes'))
  assert.match(fn, /mover\(v\.ruta, r\)/)
  assert.doesNotMatch(fn, /rmSync/, 'la app vieja nunca se borra')
})

// ── B: el supervisor nunca se rinde ─────────────────────────────────────────────────────────────────────────────

test('espera creciente 2 s, 5 s, 15 s, 30 s y tope de 60 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map(esperaTras), [2_000, 5_000, 15_000, 30_000, 60_000, 60_000, 60_000])
  assert.equal(esperaTras(0), 2_000)
  assert.equal(esperaTras(Number.NaN), 2_000)
})

test('no se rinde: cien caídas seguidas siguen teniendo un siguiente intento', () => {
  let caidas = 0
  for (let i = 0; i < 100; i++) {
    const r = trasCaida(caidas, 1_000)
    assert.ok(Number.isFinite(r.esperaMs) && r.esperaMs > 0 && r.esperaMs <= 60_000)
    caidas = r.caidas
  }
  assert.equal(caidas, 100)
  assert.equal(Math.max(...ESPERAS_MS), 60_000)
})

test('si aguantó arriba un rato, vuelve a la espera corta', () => {
  assert.deepEqual(trasCaida(7, ESTABLE_MS), { caidas: 1, esperaMs: 2_000 })
  assert.deepEqual(trasCaida(7, ESTABLE_MS - 1), { caidas: 8, esperaMs: 60_000 })
})

test('el aviso dice que reintenta solo (lo leen la app y la web), sin mandar a la terminal', () => {
  const t = avisoCaida('daemon', 4, 30_000)
  assert.match(t, /motor de Arbrain/)
  assert.match(t, /4 veces seguidas/)
  assert.match(t, /solo en 30 s/)
  assert.match(t, /no tienes que hacer nada/)
  assert.doesNotMatch(t, /terminal|npm run/)
})

test('servidor.mjs: sin el límite de 5 en 5 minutos y con la espera creciente', () => {
  const s = fuente('scripts/servidor.mjs')
  assert.doesNotMatch(s, /dejé de reintentar/)
  assert.doesNotMatch(s, /r\.length >= 5/)
  const v = s.slice(s.indexOf('function vigilar('), s.indexOf('function apagarHuerfano'))
  assert.match(v, /trasCaida\(S\.caidas\[nombre\], Date\.now\(\) - \(hijo\.inicio/)
  assert.match(v, /registrar\(aviso\)/)
  assert.match(v, /setTimeout\(\(\) => \{[\s\S]*\}, esperaMs\)/)
})

// ── B: botón «Reintentar» ───────────────────────────────────────────────────────────────────────────────────────

function deps(estado: { ready: boolean } | Error | null) {
  const hechos: string[] = []
  return {
    hechos,
    d: {
      hayApp: () => estado !== null,
      daemonEstado: async () => { hechos.push('estado'); if (estado instanceof Error) throw estado; return estado as { ready: boolean } },
      daemonReiniciar: async () => { hechos.push('reiniciar') },
      esperarDaemon: async () => { hechos.push('esperar') },
      recargar: () => { hechos.push('recargar') },
    },
  }
}

test('Reintentar: motor caído → lo enciende, espera y recarga', async () => {
  const { d, hechos } = deps({ ready: false })
  assert.equal(await reintentarConexion(d), 'motor-reiniciado')
  assert.deepEqual(hechos, ['estado', 'reiniciar', 'esperar', 'recargar'])
})

test('Reintentar: motor sano → solo recarga (no corta lo que trabaja)', async () => {
  const { d, hechos } = deps({ ready: true })
  assert.equal(await reintentarConexion(d), 'motor-sano')
  assert.deepEqual(hechos, ['estado', 'recargar'])
})

test('Reintentar: sin app (teléfono) o sin control → recarga', async () => {
  const sin = deps(null)
  assert.equal(await reintentarConexion(sin.d), 'solo-recargar')
  assert.deepEqual(sin.hechos, ['recargar'])
  const caido = deps(new Error('sin control'))
  assert.equal(await reintentarConexion(caido.d), 'sin-control')
  assert.deepEqual(caido.hechos, ['estado', 'recargar'])
})

test('la espera explicada ofrece Reintentar solo si no hay conexión o el motor no responde', () => {
  assert.equal(esperaPideReintento(null), true)
  assert.equal(esperaPideReintento({ ok: true, etapas: { daemon: { ok: false } } }), true)
  assert.equal(esperaPideReintento({ ok: true, etapas: { daemon: { ok: true }, supabase: { ok: false } } }), false)
  const panel = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(panel, /Reconectando con el servidor…'\}[\s\S]{0,400}<BotonReintentar/)
})
