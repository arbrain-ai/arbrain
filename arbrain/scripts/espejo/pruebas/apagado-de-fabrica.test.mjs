/**
 * Modo espejo APAGADO DE FÁBRICA (v0.2.11, 24 oct 2026). Sin `espejo.mjs activar`, la edición cliente se comporta
 * exactamente como antes del espejo, en sus cuatro caminos:
 *
 *   modo servidor   el daemon arranca con CLAUDECLAW_ROLE=full y sin la ruta de la cerca; no hay ciclo de sincronización.
 *   daemon          sin ARBRAIN_ESPEJO_GUARDA el scheduler no consulta ninguna cerca (server/src/cliente/espejo.test.ts).
 *                   Heredada de la terminal o del entorno de quien lanza la app, esa variable nunca llega al daemon.
 *   app escritorio  fija CLAUDECLAW_ROLE=full, no lanza el espejo y quita ARBRAIN_ESPEJO_GUARDA heredada.
 *   INSTALAR        en la compu de la persona (Mac, Windows o Linux con pantalla) el guion es el mismo; el único desvío
 *                   es para un servidor Linux sin pantalla o cuando la persona lo pide.
 *
 * Sin red, sin git remoto, sin llaves.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arrancarCiclo, entornoDaemon, ESPEJO_MJS, rolDe } from '../supervisor.mjs'
import { entornoLimpio, PROHIBIDAS } from '../../servidor/rutas.mjs'

const ARBRAIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const fuente = (r) => readFileSync(join(ARBRAIN, r), 'utf8')
const cerebroNuevo = () => mkdtempSync(join(tmpdir(), 'espejo-fabrica-'))

test('modo servidor: el daemon recibe exactamente el rol de siempre y nada del espejo', () => {
  const cerebro = cerebroNuevo()
  assert.deepEqual(entornoDaemon(cerebro), { CLAUDECLAW_ROLE: 'full' })
  assert.equal(rolDe(cerebro), 'full')
  assert.equal(existsSync(join(cerebro, '.arbrain-espejo')), false, 'consultar el rol no crea estado del espejo')
})

test('modo servidor: sin activar no hay ciclo de sincronización (ni un proceso, ni un temporizador)', async () => {
  const cerebro = cerebroNuevo()
  const marca = join(cerebro, 'se-lanzo.txt')
  const falso = join(cerebro, 'node-falso.mjs')
  writeFileSync(falso, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marca)}, 'si')\n`)
  // El «node» del ciclo sería este script: si el ciclo arrancara, dejaría la marca.
  const registros = []
  const c = arrancarCiclo({ cerebro, node: falso, intervaloMs: 5, registrar: (m) => registros.push(m), alCambiarRol: () => registros.push('rol') })
  assert.equal(c.activo, false)
  await new Promise((r) => setTimeout(r, 120))
  c.detener()
  assert.equal(existsSync(marca), false)
  assert.deepEqual(registros, [])
})

test('espejo.mjs sin activar: rol full y estado apagado, sin tocar la carpeta', () => {
  const cerebro = cerebroNuevo()
  const rol = execFileSync(process.execPath, [ESPEJO_MJS, 'rol', '--cerebro', cerebro], { encoding: 'utf8' }).trim()
  assert.equal(rol, 'full')
  const estado = JSON.parse(execFileSync(process.execPath, [ESPEJO_MJS, 'estado', '--json', '--cerebro', cerebro], { encoding: 'utf8' }).trim().split('\n').pop())
  assert.equal(estado.activo, false)
})

test('modo servidor: la cerca solo la pone el supervisor; heredada de la terminal no llega al daemon', () => {
  assert.ok(PROHIBIDAS.includes('ARBRAIN_ESPEJO_GUARDA'))
  const limpio = entornoLimpio({ PATH: '/bin', ARBRAIN_ESPEJO_GUARDA: '/tmp/ajeno.mjs', arbrain_espejo_guarda: '/tmp/ajeno.mjs' })
  assert.deepEqual(limpio, { PATH: '/bin' })
  // Y servidor.mjs arma el entorno del daemon con entornoLimpio primero y el del espejo después (que apagado no la trae).
  const servidor = fuente('scripts/servidor.mjs')
  const lanzar = servidor.slice(servidor.indexOf('function lanzarDaemon()'), servidor.indexOf('const linea', servidor.indexOf('function lanzarDaemon()')))
  assert.match(lanzar, /\.\.\.entornoComun\(\)[\s\S]*\.\.\.entornoEspejo\(S\.home\)/)
  assert.match(servidor, /S\.espejo = arrancarEspejo\(/)
})

test('app de escritorio: rol full fijo, sin espejo, y la cerca heredada se quita', () => {
  const daemon = fuente('src-tauri/src/daemon.rs')
  assert.match(daemon, /\.env\("CLAUDECLAW_ROLE", "full"\)/)
  const politica = daemon.slice(daemon.indexOf('pub const POLITICA_V3'), daemon.indexOf('];', daemon.indexOf('pub const POLITICA_V3')))
  assert.match(politica, /"ARBRAIN_ESPEJO_GUARDA"/)
  for (const r of ['src-tauri/src/daemon.rs', 'src-tauri/src/lib.rs']) assert.doesNotMatch(fuente(r), /espejo\.mjs|supervisor\.mjs|ARBRAIN_ESPEJO_(?!GUARDA)/, r)
})

test('daemon: el scheduler solo consulta la cerca si el supervisor pasó ARBRAIN_ESPEJO_GUARDA', () => {
  const espejo = fuente('server/src/cliente/espejo.ts')
  assert.match(espejo, /const guarda = env\.ARBRAIN_ESPEJO_GUARDA\?\.trim\(\)\n\s*if \(!guarda\) return Promise\.resolve\(\{ correr: true \}\)/)
  const scheduler = fuente('server/src/scheduler.ts')
  assert.equal(scheduler.match(/cercaEspejo\(/g)?.length, 1)
})

test('INSTALAR: en la compu de la persona el guion no cambia; el desvío es solo para un servidor Linux sin pantalla', () => {
  // En este repo, la plantilla; en la copia del alumno, el INSTALAR.md ya generado de la raíz.
  const plantilla = join(ARBRAIN, 'empaquetado', 'plantillas', 'INSTALAR.plantilla.md')
  const instalar = readFileSync(existsSync(plantilla) ? plantilla : join(ARBRAIN, '..', 'INSTALAR.md'), 'utf8')
  // Desde la v0.2.14 (tres caminos) el desvío vive en la sección «Antes de todo · ¿Dónde vive su Arbrain?» y en la
  // portada para la persona; antes era un párrafo «Si esto va en un servidor» (30 oct 2026: la prueba seguía buscándolo).
  const desde = instalar.indexOf('## Antes de todo · ¿Dónde vive su Arbrain?')
  const hasta = instalar.indexOf('## Reglas que no se rompen')
  assert.ok(desde > 0 && hasta > desde, 'la sección del camino va antes de las reglas')
  const seccion = instalar.slice(desde, hasta)
  assert.match(seccion, /`uname -s` es `Linux`, `\$DISPLAY` y `\$WAYLAND_DISPLAY` vacíos y existe\s+`\/run\/systemd\/system`/)
  assert.match(seccion, /\*\*1:\*\* sigue este guion desde el PASO 0\./)
  assert.match(seccion, /Si no contesta o duda, es \*\*1\*\*\./)
  // El guion de la computadora (de las reglas al final) no nombra el servidor ni el espejo ni sus herramientas.
  const guion = instalar.slice(hasta)
  for (const l of guion.split('\n')) assert.doesNotMatch(l, /NUBE|espejo|servidor Linux|mi nube/i, `mención fuera del desvío: ${l}`)
  assert.doesNotMatch(guion, /espejo\.mjs|INSTALAR-NUBE|nube\.sh/)
})
