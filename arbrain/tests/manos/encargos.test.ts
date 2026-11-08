import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  emparejarEncargo, emparejarLlamadas, inicioEncargo, pedidoDeInput, relojEncargo, resumirEncargo, textoPaso, validarOrden, visible,
  type EncargoVivo,
} from '../../src/features/manos/lib/encargos'
import { dirEncargos, escribirOrden, leerEncargo, leerEncargosVivos } from '../../src/features/manos/lib/encargos-disco'
import { agruparHerramientas, encargosCorriendo } from '../../src/features/chat/lib/rastro'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'

const T0 = Date.parse('2026-11-06T01:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function enc(o: Partial<EncargoVivo> = {}): EncargoVivo {
  return { id: 'enc-mw4b1015-689e2a', estado: 'en_curso', pedido: 'Sube el banner a YouTube', inicio: iso(T0), actualizado: iso(T0), ms: 0, paso: null, pasos: 0, valores: ['detener', 'control'], ...o }
}

// ─── Reloj ──────────────────────────────────────────────────────────────────

test('reloj del encargo desde su inicio: 0:42, 1:05, 12:03 y con horas 1:02:03', () => {
  const e = enc({ inicio: iso(T0) })
  assert.equal(relojEncargo(e, T0 + 42_400), '0:42')
  assert.equal(relojEncargo(e, T0 + 65_000), '1:05')
  assert.equal(relojEncargo(e, T0 + 12 * 60_000 + 3_000), '12:03')
  assert.equal(relojEncargo(e, T0 + 3_723_000), '1:02:03')
  assert.equal(relojEncargo(e, T0 - 5_000), '0:00')   // reloj del navegador atrasado: nunca negativo
})

test('sin `inicio` el reloj cae a actualizado − ms; sin nada, no hay reloj', () => {
  const e = enc({ inicio: null, actualizado: iso(T0 + 41_000), ms: 41_000 })
  assert.equal(inicioEncargo(e), T0)
  assert.equal(relojEncargo(e, T0 + 65_000), '1:05')
  assert.equal(inicioEncargo(enc({ inicio: null, actualizado: null, ms: null })), null)
  assert.equal(relojEncargo(enc({ inicio: null, actualizado: null, ms: null }), T0), null)
  assert.equal(inicioEncargo(enc({ inicio: 'no es fecha', actualizado: iso(T0 + 2_000), ms: 2_000 })), T0)
})

test('terminado: el reloj se congela en su última actualización', () => {
  const e = enc({ estado: 'hecho', inicio: iso(T0), actualizado: iso(T0 + 75_000) })
  assert.equal(relojEncargo(e, T0 + 90_000), '1:15')
})

test('el paso: la frase humana, si no el mensaje técnico; terminado dice cómo acabó', () => {
  assert.equal(textoPaso(enc({ paso: 'tocando «Subir»' })), 'tocando «Subir»')
  assert.equal(textoPaso(enc({ paso: null })), null)
  assert.equal(textoPaso(enc({ estado: 'hecho', paso: null })), 'Terminó')
  assert.equal(textoPaso(enc({ estado: 'fallo', paso: null })), 'No pudo terminar')
  assert.equal(textoPaso(enc({ estado: 'requiere_confirmacion', paso: null })), 'Espera tu toque')
})

// ─── Resumir el archivo ─────────────────────────────────────────────────────

test('del archivo solo salen los campos de la línea viva; `paso` cae a `mensaje`', () => {
  const crudo = {
    id: 'enc-mw4b1015-689e2a', actualizado: iso(T0 + 41_000), inicio: iso(T0), estado: 'en_curso', pedido: 'Sube el banner',
    fase: 'paso', mensaje: 'actuar ref=12 clic', pasos: 12, ms: 41_000, ultimos: ['secreto de la app'], quien: 'claude-code',
    resultado: 'no debe salir', captura: '/tmp/x.png',
    franja: { texto: 'Levy está trabajando', orden: 'enc-mw4b1015-689e2a.detener', valores: ['detener', 'control', 'otra'] },
  }
  const e = resumirEncargo(crudo)!
  assert.deepEqual(Object.keys(e).sort(), ['actualizado', 'estado', 'id', 'inicio', 'ms', 'paso', 'pasos', 'pedido', 'valores'])
  assert.equal(e.paso, 'actuar ref=12 clic')
  assert.deepEqual(e.valores, ['detener', 'control'])
  assert.equal(resumirEncargo({ ...crudo, paso: 'subiendo banner.png' })!.paso, 'subiendo banner.png')
  // El estado final guarda `pasos` como resumen (lista): cuenta su largo.
  assert.equal(resumirEncargo({ ...crudo, estado: 'hecho', pasos: ['a', 'b', 'c'], franja: undefined })!.pasos, 3)
  assert.deepEqual(resumirEncargo({ ...crudo, franja: undefined })!.valores, [])
})

test('un archivo sin id válido o sin estado no es un encargo', () => {
  assert.equal(resumirEncargo(null), null)
  assert.equal(resumirEncargo('texto'), null)
  assert.equal(resumirEncargo({ id: '../../etc/passwd', estado: 'en_curso' }), null)
  assert.equal(resumirEncargo({ id: 'enc-mw4b1015-689e2a' }), null)
})

test('visibles: los vivos y los terminados hace ≤ 15 s', () => {
  assert.equal(visible(enc({ estado: 'en_curso' }), T0 + 9 * 60_000), true)
  assert.equal(visible(enc({ estado: 'cerrando' }), T0), true)
  assert.equal(visible(enc({ estado: 'hecho', actualizado: iso(T0) }), T0 + 14_000), true)
  assert.equal(visible(enc({ estado: 'fallo', actualizado: iso(T0) }), T0 + 16_000), false)
  assert.equal(visible(enc({ estado: 'hecho', actualizado: null }), T0 + 5_000, T0), true)   // sin fecha: manda el mtime
})

// ─── Emparejar con la llamada ───────────────────────────────────────────────

test('empareja por el pedido (recortado a 200 y sin espacios a los lados); entre iguales, el más reciente', () => {
  const largo = 'x'.repeat(250)
  const a = enc({ id: 'enc-a-000001', pedido: 'Sube el banner a YouTube', inicio: iso(T0) })
  const b = enc({ id: 'enc-b-000002', pedido: 'Abre el 6.º guardado', inicio: iso(T0 + 5_000) })
  const c = enc({ id: 'enc-c-000003', pedido: largo.slice(0, 200), inicio: iso(T0 + 1_000) })
  const viejo = enc({ id: 'enc-d-000004', estado: 'fallo', pedido: 'Sube el banner a YouTube', inicio: iso(T0 - 60_000) })
  const lista = [b, viejo, a, c]
  assert.equal(emparejarEncargo(lista, '  Sube el banner a YouTube \n')?.id, 'enc-a-000001')
  assert.equal(emparejarEncargo(lista, `  ${largo}`)?.id, 'enc-c-000003')
})

test('si ningún pedido empata, el encargo vivo más reciente; un terminado no entra por descarte', () => {
  const a = enc({ id: 'enc-a-000001', pedido: 'uno', inicio: iso(T0) })
  const b = enc({ id: 'enc-b-000002', pedido: 'dos', inicio: iso(T0 + 5_000) })
  const fin = enc({ id: 'enc-c-000003', estado: 'hecho', pedido: 'tres', inicio: iso(T0 + 9_000) })
  assert.equal(emparejarEncargo([a, fin, b], 'otro pedido')?.id, 'enc-b-000002')
  assert.equal(emparejarEncargo([a, fin, b], null)?.id, 'enc-b-000002')
  assert.equal(emparejarEncargo([fin], 'otro pedido'), null)
  assert.equal(emparejarEncargo([], 'uno'), null)
  // Un terminado reciente sí se muestra si su pedido es el de la llamada (el archivo cerró antes que la herramienta).
  assert.equal(emparejarEncargo([a, fin], 'tres')?.id, 'enc-c-000003')
})

test('dos llamadas en paralelo no pintan el mismo encargo: primero las que empatan, luego el descarte', () => {
  const a = enc({ id: 'enc-a-000001', pedido: 'uno', inicio: iso(T0) })
  const b = enc({ id: 'enc-b-000002', pedido: 'dos', inicio: iso(T0 + 5_000) })
  // La primera llamada no empata y la segunda sí con «dos» (el más reciente): la primera se queda con «uno».
  assert.deepEqual(emparejarLlamadas([a, b], ['otro', 'dos']).map(e => e?.id ?? null), ['enc-a-000001', 'enc-b-000002'])
  assert.deepEqual(emparejarLlamadas([a], ['x', 'y']).map(e => e?.id ?? null), ['enc-a-000001', null])
})

test('el pedido sale del input de la herramienta, aunque el JSON venga a medias', () => {
  assert.equal(pedidoDeInput(JSON.stringify({ pedido: 'Sube el banner', cita: 'súbelo' })), 'Sube el banner')
  assert.equal(pedidoDeInput('{"pedido": "Sube el \\"banner\\" ya", "ci'), 'Sube el "banner" ya')
  assert.equal(pedidoDeInput(undefined), null)
  assert.equal(pedidoDeInput('{"cita": "x"}'), null)
})

// ─── Validar la orden (POST) ────────────────────────────────────────────────

test('la orden: id con la forma de un encargo, «detener» o «control», y el encargo vivo', () => {
  const vivos: Record<string, EncargoVivo> = {
    'enc-mw4b1015-689e2a': enc(),
    'enc-mw4b1015-aaaaaa': enc({ id: 'enc-mw4b1015-aaaaaa', estado: 'hecho' }),
    'enc-mw4b1015-bbbbbb': enc({ id: 'enc-mw4b1015-bbbbbb', valores: ['detener'] }),
  }
  const leer = (id: string) => vivos[id] ?? null
  const no = (r: ReturnType<typeof validarOrden>) => (r.ok ? 0 : r.status)

  assert.equal(no(validarOrden(null, leer)), 400)
  assert.equal(no(validarOrden({ id: '../../.ssh/id_rsa', orden: 'detener' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 'enc-MW4B-689E2A', orden: 'detener' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-689e2a/../x', orden: 'detener' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 42, orden: 'detener' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-689e2a', orden: 'borrar' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-689e2a' }, leer)), 400)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-cccccc', orden: 'detener' }, leer)), 404)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-aaaaaa', orden: 'detener' }, leer)), 409)
  assert.equal(no(validarOrden({ id: 'enc-mw4b1015-bbbbbb', orden: 'control' }, leer)), 409)

  assert.deepEqual(validarOrden({ id: 'enc-mw4b1015-689e2a', orden: 'control' }, leer), { ok: true, id: 'enc-mw4b1015-689e2a', orden: 'control' })
  assert.deepEqual(validarOrden({ id: 'enc-mw4b1015-689e2a', orden: 'detener' }, leer), { ok: true, id: 'enc-mw4b1015-689e2a', orden: 'detener' })
})

// ─── Disco ──────────────────────────────────────────────────────────────────

test('la carpeta: MANOS_ENCARGOS_DIR manda; si no, <config de Arbrain>/manos/encargos', () => {
  assert.equal(dirEncargos({ MANOS_ENCARGOS_DIR: '/x/encargos', ARBRAIN_EDICION: 'original' }), '/x/encargos')
  assert.equal(dirEncargos({ ARBRAIN_CONFIG_DIR: '/cfg', ARBRAIN_EDICION: 'original' }), join('/cfg', 'manos', 'encargos'))
  assert.equal(dirEncargos({ ARBRAIN_CONFIG_DIR: '/app/daemon/config', ARBRAIN_EDICION: 'cliente' }), join('/app/daemon/config', 'manos', 'encargos'))
  assert.throws(() => dirEncargos({ ARBRAIN_EDICION: 'cliente' }), /ARBRAIN_CONFIG_DIR/)
})

test('leer del disco: solo .json con id válido, modificados hace ≤ 10 min, vivos o recién terminados; .tmp y basura fuera', () => {
  const dir = mkdtempSync(join(tmpdir(), 'encargos-web-'))
  const ahora = Date.now()
  const escribir = (nombre: string, datos: unknown, mtime = ahora) => {
    const ruta = join(dir, nombre)
    writeFileSync(ruta, typeof datos === 'string' ? datos : JSON.stringify(datos))
    utimesSync(ruta, mtime / 1000, mtime / 1000)
  }
  const base = (id: string, o: Record<string, unknown> = {}) => ({ id, estado: 'en_curso', pedido: 'p', actualizado: iso(ahora), inicio: iso(ahora - 30_000), mensaje: 'm', pasos: 1, ms: 30_000, franja: { valores: ['detener', 'control'] }, ...o })

  escribir('enc-vivo-000001.json', base('enc-vivo-000001', { inicio: iso(ahora - 10_000) }))
  escribir('enc-fin-000002.json', base('enc-fin-000002', { estado: 'hecho', actualizado: iso(ahora - 5_000) }))
  escribir('enc-finviejo-000003.json', base('enc-finviejo-000003', { estado: 'fallo', actualizado: iso(ahora - 60_000) }))
  escribir('enc-rancio-000004.json', base('enc-rancio-000004'), ahora - 11 * 60_000)
  escribir('enc-tmp-000005.json.tmp', base('enc-tmp-000005'))
  escribir('enc-roto-000006.json', '{ no es json')
  escribir('otra-cosa.json', base('otra-cosa'))
  escribir('enc-otro-000007.json', base('enc-distinto-000008'))   // el id de dentro no es el del nombre
  escribir('enc-vivo-000001.detener', 'detener')

  const lista = leerEncargosVivos(dir, ahora)
  assert.deepEqual(lista.map(e => e.id), ['enc-vivo-000001', 'enc-fin-000002'])   // el más reciente primero
  assert.equal(lista[0].paso, 'm')
  assert.equal(leerEncargo(dir, 'enc-fin-000002')?.estado, 'hecho')
  assert.equal(leerEncargo(dir, 'enc-nada-000009'), null)
  assert.equal(leerEncargo(dir, '../x'), null)
  assert.deepEqual(leerEncargosVivos(join(dir, 'no-existe'), ahora), [])
})

test('escribir la orden deja <id>.detener con «detener» o «control» (0600) y nunca arma rutas con texto libre', () => {
  const dir = mkdtempSync(join(tmpdir(), 'encargos-orden-'))
  escribirOrden(dir, 'enc-mw4b1015-689e2a', 'control')
  const ruta = join(dir, 'enc-mw4b1015-689e2a.detener')
  assert.equal(readFileSync(ruta, 'utf8'), 'control')
  assert.equal(statSync(ruta).mode & 0o777, 0o600)
  assert.equal(existsSync(`${ruta}.tmp`), false)
  assert.throws(() => escribirOrden(dir, '../fuera', 'detener'))
  assert.throws(() => escribirOrden(dir, 'enc-mw4b1015-689e2a', 'borrar' as never))
})

// ─── El chat: qué encargos corren en el turno ───────────────────────────────

test('encargos corriendo en el turno: las llamadas a manos encargar en curso, con su pedido', () => {
  const msg = (status: 'running' | 'done'): ChatMessage => ({
    id: 'a', role: 'assistant', content: '', timestamp: new Date(0),
    toolCalls: [
      { toolId: 't0', toolName: 'Bash', status: 'done' },
      { toolId: 't1', toolName: 'mcp__manos__encargar', status },
    ],
    toolInputs: { t0: JSON.stringify({ command: 'ls' }), t1: JSON.stringify({ pedido: 'Sube el banner', cita: 'súbelo' }) },
  })
  assert.deepEqual(encargosCorriendo(agruparHerramientas(msg('running'))), [{ toolId: 't1', pedido: 'Sube el banner' }])
  assert.deepEqual(encargosCorriendo(agruparHerramientas(msg('done'))), [])
})
