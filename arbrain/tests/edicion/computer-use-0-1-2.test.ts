// Computer use en la edición cliente 0.1.2 (17 oct 2026; revierte DECISIONES #11 con su red team). Antes (v1,
// 0.1.0/0.1.1) este archivo era «v1 sin computer use». Ahora: macOS y Windows lo traen, apagado en cada apertura; en
// Linux queda el aviso de no disponible. También la parte web de A-5 (CSP sin `https:` en imágenes ni marcos) y de M-4
// (sin MCP de Next en cliente), que siguen igual.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  COMPUTER_USE_NO_DISPONIBLE, computerUseDisponible, decisionInterruptorCliente, ESTADO_CLIENTE_SIN_COMPUTER_USE,
  explicacionComputerUse, plataformaServidor,
} from '../../src/features/permisos/lib/disponibilidad'
import { fichaEnEdicion, FICHAS, type PermisoId } from '../../src/features/permisos/lib/permisos'
import { PASOS, pasosVisibles } from '../../src/features/primer-arranque/lib/pasos'
import { mensajeBienvenida } from '../../src/features/primer-arranque/textos/bienvenida'
import { PRIVACIDAD, TERMINOS, VERSION_TEXTOS } from '../../src/features/primer-arranque/textos/legales'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('disponibilidad: cliente en macOS y Windows sí, en Linux no; la instalación original siempre', () => {
  assert.equal(computerUseDisponible(true, 'darwin'), true)
  assert.equal(computerUseDisponible(true, 'win32'), true)
  assert.equal(computerUseDisponible(true, 'linux'), false)
  assert.equal(computerUseDisponible(true, 'freebsd'), false)
  for (const p of ['darwin', 'win32', 'linux']) assert.equal(computerUseDisponible(false, p), true, p)
  assert.equal(plataformaServidor({}, 'linux'), 'linux')
  assert.equal(plataformaServidor({ ARBRAIN_PLATAFORMA_PRUEBA: 'win32' }, 'linux'), 'win32')
  assert.deepEqual(ESTADO_CLIENTE_SIN_COMPUTER_USE, { edicion: 'cliente', encendido: false, decidido: true, disponible: false })
  assert.match(COMPUTER_USE_NO_DISPONIBLE, /no está disponible en Linux/)
})

test('explicación: apagado por cada apertura, el clic para lo irreversible y los permisos de cada sistema', () => {
  for (const p of ['darwin', 'win32']) {
    const e = explicacionComputerUse(p)
    assert.match(e, /cada vez que cierras Arbrain/, p)
    assert.match(e, /te pide tu clic/, p)
    assert.match(e, /banco/, p)
  }
  assert.match(explicacionComputerUse('darwin'), /«ArbrainManos»: Accesibilidad y Grabación de pantalla/)
  assert.match(explicacionComputerUse('win32'), /no hay permisos extra/)
  assert.ok(!/ArbrainManos/.test(explicacionComputerUse('win32')))
})

test('la ruta del interruptor: en Linux encender es 403 sin hablar con el daemon; en Mac y Windows va al daemon', () => {
  assert.equal(decisionInterruptorCliente(true).status, 403)
  assert.match(decisionInterruptorCliente(true).error!, /no está disponible en Linux/)
  assert.deepEqual(decisionInterruptorCliente(false), { status: 200 })
  assert.equal(decisionInterruptorCliente('true').status, 400)
  assert.equal(decisionInterruptorCliente(undefined).status, 400)
  const ruta = fuente('src/app/api/manos/interruptor/route.ts')
  assert.match(ruta, /computerUseDisponible\(true, plataforma\(\)\)/)
  // Encender en cliente pasa por el daemon con el secreto de confirmar (fijarComputerUseCliente → alDaemon confirmar).
  assert.match(ruta, /fijarComputerUseCliente\(alDaemon, body\.encendido\)/)
  assert.match(ruta, /leerComputerUseCliente\(alDaemon\)/)
  // La rama sin computer use se decide ANTES de hablar con el daemon.
  const post = ruta.slice(ruta.indexOf('export async function POST'))
  assert.ok(post.indexOf('decisionInterruptorCliente') < post.indexOf('fijarComputerUseCliente'))
  // La instalación original sigue escribiendo su archivo, como siempre.
  assert.match(ruta, /fijarComputerUse\(body\.encendido\)/)
})

test('primer arranque: el paso de computer use solo donde existe, apagado por defecto', () => {
  assert.deepEqual([...PASOS], ['bienvenida', 'legal', 'llaves', 'computer', 'monitoreo', 'donde', 'listo'])
  assert.deepEqual(pasosVisibles(false, false), ['bienvenida', 'legal', 'llaves', 'donde', 'listo'])
  assert.deepEqual(pasosVisibles(false, true), ['bienvenida', 'legal', 'llaves', 'computer', 'donde', 'listo'])
  assert.deepEqual(pasosVisibles(false), ['bienvenida', 'legal', 'llaves', 'donde', 'listo'], 'sin respuesta: sin el paso')
  const c = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.match(c, /pasosVisibles\(conMonitoreo, cu\.disponible\)/)
  assert.match(c, /disponible: j\?\.disponible === true/)
  assert.match(c, /const \[computerUse, setComputerUse\] = useState\(false\)/, 'nace apagado')
  assert.match(c, /titulo="Dejarlo apagado" etiqueta="Recomendado"/)
  assert.match(c, /paso === 'computer' && cu\.disponible\)/)
  assert.match(c, /no está disponible en este sistema/)
})

test('Ajustes: la misma tarjeta con interruptor en Mac y Windows, aviso en Linux; sin modal suelto', () => {
  const s = fuente('src/features/configuracion/components/Secciones.tsx')
  assert.match(s, /<TarjetaComputerUse \/>/)
  assert.ok(!/TarjetaComputerUseProximamente/.test(s))
  const cu = fuente('src/features/permisos/components/ComputerUse.tsx')
  assert.match(cu, /estado\.edicion === 'cliente' && estado\.disponible === false/)
  assert.match(cu, /no disponible en Linux/)
  assert.match(cu, /explicacionComputerUse\(estado\.plataforma/)
  // Cada apertura nace apagada: una pregunta modal en cada arranque sería ruido. Solo el primer arranque pregunta.
  assert.ok(!/PrimerArranqueComputerUse/.test(fuente('src/app/(main)/dashboard-shell.tsx')))
  assert.ok(!/PrimerArranqueComputerUse/.test(cu))
})

test('permisos de Arbrain para operar la Mac: «Sin uso» en cliente (los pide ArbrainManos); como siempre en la original', () => {
  for (const id of ['accesibilidad', 'pantalla', 'automatizacion', 'entrada'] as PermisoId[]) {
    assert.equal(fichaEnEdicion(id, true).grupo, 'sin_uso', id)
    assert.match(fichaEnEdicion(id, true).para, /ArbrainManos/)
    assert.deepEqual(fichaEnEdicion(id, false), FICHAS[id])
  }
  assert.deepEqual(fichaEnEdicion('microfono', true), FICHAS.microfono)
})

test('textos: bienvenida según el sistema; términos y privacidad nombran computer use (versión nueva)', () => {
  const con = mensajeBienvenida('Fulano', { computerUse: true })
  assert.match(con, /Computer use[^\n]*Ajustes › Esta computadora[^\n]*se apaga cada vez que cierras la app/)
  assert.ok(!/Computer use[^\n]*llegan? en una versión próxima/.test(con.replace(/(El calendario|La edición de video)[^\n]*/, '')))
  const sin = mensajeBienvenida('Fulano')
  assert.match(sin, /Computer use[^\n]*no está disponible en este sistema/)
  assert.notEqual(VERSION_TEXTOS, 'borrador-2026-10-11b', 'los textos cambiaron: se vuelven a aceptar')
  assert.match(TERMINOS.cuerpo, /macOS y Windows, no en Linux/)
  assert.match(TERMINOS.cuerpo, /se apaga cada vez que cierras la app/)
  assert.match(TERMINOS.cuerpo, /banco, pagos, impuestos ni cripto/)
  assert.match(PRIVACIDAD.cuerpo, /capturas de tu pantalla/)
  // La bienvenida del servidor decide con la plataforma del servidor.
  assert.match(fuente('src/app/api/primer-arranque/route.ts'), /computerUse: computerUseDisponible\(true, plataformaServidor\(process\.env, process\.platform\)\)/)
})

test('A-5 y M-4: CSP de cliente sin https: en imágenes ni marcos; sin MCP de Next en cliente', () => {
  const n = fuente('next.config.ts')
  const csp = n.slice(n.indexOf('const CSP_CLIENTE = ['), n.indexOf("].join('; ')"))
  const directiva = (d: string) => (csp.match(new RegExp(`"${d} ([^"]*)"`)) ?? [])[1]
  assert.equal(directiva('img-src'), "'self' data: blob:")
  assert.equal(directiva('frame-src'), "'self' blob: data:")
  assert.ok(!/https:/.test(csp), 'ningún origen https en la CSP de cliente')
  assert.deepEqual(csp.match(/http:\/\/[^\s"]+/g), ['http://ipc.localhost'], 'el único http es el IPC de Tauri')
  assert.match(n, /mcpServer: !EDICION_CLIENTE/)
})
