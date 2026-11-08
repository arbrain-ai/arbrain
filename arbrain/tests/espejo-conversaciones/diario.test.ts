// Conversaciones únicas en el modo espejo (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05/DISENO.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DIARIO_DIR, exportar, importar, leerEstado, hayNuevo, type AlmacenCrudo, type Contexto, type Fila } from '../../src/lib/espejo-conversaciones/diario'
import { REGLAS, TAPADO, taparValor, pareceSecreto } from '../../src/lib/espejo-conversaciones/reglas'
import { armarPuente, comoMensajes } from '../../src/lib/espejo-conversaciones/puente'
import { maquinaEnEspejo } from '../../src/lib/espejo-conversaciones/pulso'
import { textoConversaciones } from '../../src/features/telefono/LineaConversaciones'
import { almacenArchivos } from '../../src/lib/base-local/archivos'
import { REGLAS as REGLAS_ESCANER, escanearArchivo } from '../../scripts/espejo/lib/escaner.mjs'
import { cargarCapas, viaja } from '../../scripts/espejo/lib/viaja.mjs'

const tmp = (p: string) => mkdtempSync(join(tmpdir(), `conv-${p}-`))

function memoria(): AlmacenCrudo & { tablas: Record<string, Fila[]> } {
  const tablas: Record<string, Fila[]> = {}
  return { tablas, leer: (t) => tablas[t] ?? [], escribir: (t, f) => { tablas[t] = f.map((x) => ({ ...x })) } }
}

/** Una máquina: su copia (cerebro), su base y su estado. `reloj` controla la hora de exportar. */
function maquina(host: string, reloj = { t: Date.parse('2026-11-05T18:00:00Z') }) {
  const cerebro = tmp(host)
  const almacen = memoria()
  const ctx: Contexto = { cerebro, host, almacen, estadoArchivo: join(tmp(`${host}-datos`), 'espejo-conversaciones.json'), ahora: () => reloj.t }
  return { host, cerebro, almacen, ctx, reloj }
}

/** «git»: copia el diario de una máquina a la otra (lo que hace el ciclo del espejo). */
function viajar(de: { host: string; cerebro: string }, a: { cerebro: string }) {
  const src = join(de.cerebro, DIARIO_DIR, de.host)
  if (!existsSync(src)) return
  cpSync(src, join(a.cerebro, DIARIO_DIR, de.host), { recursive: true })
}

const sesion = (id: string, extra: Fila = {}): Fila => ({ id, title: 'Plan de Fulano', profile_id: 'p', account: null, is_favorite: false, archived_at: null, created_at: '2026-11-05T18:00:00Z', updated_at: '2026-11-05T18:00:00Z', last_message_at: '2026-11-05T18:00:00Z', ...extra })
const msj = (id: string, session_id: string, role: string, content: string, created_at: string): Fila => ({ id, session_id, role, content, metadata: {}, created_at })

test('reglas: idénticas a las del escáner del espejo (paridad)', () => {
  assert.deepEqual(REGLAS.map((r) => [r.id, r.re.source, r.re.flags]), (REGLAS_ESCANER as Array<{ id: string; re: RegExp }>).map((r) => [r.id, r.re.source, r.re.flags]))
})

test('tapar: una llave pegada en el chat no llega al diario y el archivo pasa el escáner', () => {
  const m = maquina('mac-fulano')
  const llave = `sk-ant-api03-${'A1b2C3d4'.repeat(6)}`
  const or = `sk-or-v1-${'f'.repeat(48)}`
  m.almacen.escribir('chat_sessions', [sesion('s1')])
  m.almacen.escribir('chat_messages', [
    msj('m1', 's1', 'user', `mi llave es ${llave} y la otra ${or}\nOPENAI_API_KEY=abc123def456ghi789jkl`, '2026-11-05T18:00:01Z'),
    { ...msj('m2', 's1', 'assistant', 'listo', '2026-11-05T18:00:02Z'), metadata: { api_key: 'zzzzzzzzzzzzzzzzzz', nota: '"password": "123456789012345"' } },
    msj('m3', 's1', 'user', [`${'-'.repeat(5)}BEGIN PRIVATE KEY${'-'.repeat(5)}`, 'MIIEvQIBADANBg', `${'-'.repeat(5)}END PRIVATE KEY${'-'.repeat(5)}`].join('\n'), '2026-11-05T18:00:03Z'),
  ])
  const r = exportar(m.ctx)
  assert.equal(r.escritas, 4)
  const ruta = join(m.cerebro, DIARIO_DIR, 'mac-fulano', '2026-11.jsonl')
  const texto = readFileSync(ruta, 'utf8')
  assert.ok(!texto.includes(llave) && !texto.includes(or) && !texto.includes('zzzzzzzzzzzz') && !texto.includes('MIIEvQ'))
  assert.match(texto, new RegExp(TAPADO.replace(/[[\]]/g, '\\$&')))
  assert.match(texto, /OPENAI_API_KEY=\[llave omitida/)
  assert.deepEqual(escanearArchivo(`${DIARIO_DIR}/mac-fulano/2026-11.jsonl`, readFileSync(ruta)), [])
  // La base de esta máquina no se toca: lo suyo sigue completo aquí.
  assert.match(String(m.almacen.leer('chat_messages')[0].content), /sk-ant-api03/)
  assert.equal(pareceSecreto(JSON.stringify(taparValor({ a: [llave, { password: 'xxxxxxxxxxxxxxxx' }] }))), null)
})

test('el diario viaja por el espejo (capa del cerebro) y nunca lo que no debe', () => {
  const capas = cargarCapas(tmp('capas'))
  assert.equal(viaja(`${DIARIO_DIR}/mac-fulano/2026-11.jsonl`, capas), true)
  assert.equal(viaja(`${DIARIO_DIR}/mac-fulano/llaves.json`, capas), false)
})

test('dos máquinas, una sola lista: lo de cada una llega a la otra y nada rebota', () => {
  const mac = maquina('mac-fulano'), vps = maquina('vps-fulano')
  mac.almacen.escribir('chat_sessions', [sesion('s-mac')])
  mac.almacen.escribir('chat_messages', [msj('a1', 's-mac', 'user', 'hola desde la mac', '2026-11-05T18:00:01Z'), msj('a2', 's-mac', 'assistant', 'hola Fulano', '2026-11-05T18:00:02Z')])
  vps.almacen.escribir('chat_sessions', [sesion('s-vps', { title: 'Desde el VPS' })])
  vps.almacen.escribir('chat_messages', [msj('b1', 's-vps', 'user', 'hola desde el vps', '2026-11-05T17:00:00Z')])
  exportar(mac.ctx); exportar(vps.ctx)
  viajar(mac, vps); viajar(vps, mac)
  assert.equal(hayNuevo(mac.ctx), true)
  const rm = importar(mac.ctx), rv = importar(vps.ctx)
  assert.equal(rm.aplicadas, 2); assert.equal(rv.aplicadas, 3)
  const ids = (a: AlmacenCrudo, t: string) => a.leer(t).map((f) => f.id).sort()
  assert.deepEqual(ids(mac.almacen, 'chat_sessions'), ['s-mac', 's-vps'])
  assert.deepEqual(ids(vps.almacen, 'chat_sessions'), ['s-mac', 's-vps'])
  assert.deepEqual(ids(mac.almacen, 'chat_messages'), ids(vps.almacen, 'chat_messages'))
  // Sin eco: exportar después de importar no escribe nada.
  assert.equal(exportar(mac.ctx).escritas, 0)
  assert.equal(exportar(vps.ctx).escritas, 0)
  // Idempotente: releer no aplica nada.
  assert.equal(importar(mac.ctx).operaciones, 0)
  assert.equal(hayNuevo(mac.ctx), false)
})

test('seguir la conversación en la otra máquina: el puente lleva lo que se dijo allá, y solo eso', () => {
  const mac = maquina('mac-fulano'), vps = maquina('vps-fulano')
  mac.almacen.escribir('chat_sessions', [sesion('s1')])
  mac.almacen.escribir('chat_messages', [msj('a1', 's1', 'user', '¿Qué le vendo al importador?', '2026-11-05T18:00:01Z'), msj('a2', 's1', 'assistant', 'Operación mensual con garantía', '2026-11-05T18:00:02Z')])
  exportar(mac.ctx); viajar(mac, vps); importar(vps.ctx)
  // En el VPS: la conversación nació en la Mac, así que el puente lleva todo.
  const enVps = () => armarPuente(comoMensajes(vps.almacen.leer('chat_messages').filter((f) => f.session_id === 's1')), leerEstado(vps.ctx.estadoArchivo).ajenos)
  const p1 = enVps()
  assert.ok(p1)
  assert.match(p1!, /siguió en tu otra máquina \(mac-fulano\)/)
  assert.match(p1!, /Persona: ¿Qué le vendo al importador\?/)
  assert.match(p1!, /Levy: Operación mensual con garantía/)
  // El VPS responde: ya no hace falta puente allá (su motor ya vio todo).
  vps.almacen.escribir('chat_messages', [...vps.almacen.leer('chat_messages'), msj('b1', 's1', 'user', '¿y la garantía?', '2026-11-05T18:05:00Z'), msj('b2', 's1', 'assistant', 'Devolución o te acompaño hasta lograrlo', '2026-11-05T18:05:05Z')])
  assert.equal(enVps(), null)
  vps.reloj.t += 5 * 60_000
  exportar(vps.ctx); viajar(vps, mac); importar(mac.ctx)
  // De vuelta en la Mac: solo lo que pasó en el VPS después de su última respuesta.
  const p2 = armarPuente(comoMensajes(mac.almacen.leer('chat_messages').filter((f) => f.session_id === 's1')), leerEstado(mac.ctx.estadoArchivo).ajenos)
  assert.ok(p2)
  assert.match(p2!, /vps-fulano\) después de tu última respuesta aquí/)
  assert.match(p2!, /¿y la garantía\?/)
  assert.ok(!p2!.includes('importador'))
  assert.deepEqual(mac.almacen.leer('chat_messages').map((f) => f.id), ['a1', 'a2', 'b1', 'b2'])
})

test('la misma conversación tocada en las dos: gana la última y las horas toman el mayor', () => {
  const reloj = { t: Date.parse('2026-11-05T18:00:00Z') }
  const mac = maquina('mac-fulano', reloj), vps = maquina('vps-fulano', reloj)
  mac.almacen.escribir('chat_sessions', [sesion('s1')])
  exportar(mac.ctx); viajar(mac, vps); importar(vps.ctx)
  reloj.t += 1_000
  mac.almacen.escribir('chat_sessions', [sesion('s1', { title: 'Mac renombró', last_message_at: '2026-11-05T19:00:00Z' })])
  exportar(mac.ctx)
  reloj.t += 1_000
  vps.almacen.escribir('chat_sessions', [sesion('s1', { title: 'VPS renombró después', last_message_at: '2026-11-05T18:30:00Z' })])
  exportar(vps.ctx)
  viajar(mac, vps); viajar(vps, mac)
  importar(mac.ctx); importar(vps.ctx)
  for (const m of [mac, vps]) {
    const s = m.almacen.leer('chat_sessions')[0]
    assert.equal(s.title, 'VPS renombró después', m.host)
    assert.equal(s.last_message_at, '2026-11-05T19:00:00Z', m.host)
  }
})

test('borrar viaja; una edición más vieja no resucita lo borrado', () => {
  const reloj = { t: Date.parse('2026-11-05T18:00:00Z') }
  const mac = maquina('mac-fulano', reloj), vps = maquina('vps-fulano', reloj)
  mac.almacen.escribir('chat_sessions', [sesion('s1')])
  mac.almacen.escribir('chat_messages', [msj('a1', 's1', 'user', 'uno', '2026-11-05T18:00:01Z'), msj('a2', 's1', 'assistant', 'dos', '2026-11-05T18:00:02Z')])
  exportar(mac.ctx); viajar(mac, vps); importar(vps.ctx)
  reloj.t += 1_000
  // El VPS edita a2 (más viejo) y la Mac lo borra después (deshacer).
  vps.almacen.escribir('chat_messages', vps.almacen.leer('chat_messages').map((f) => (f.id === 'a2' ? { ...f, content: 'dos editado' } : f)))
  exportar(vps.ctx)
  reloj.t += 1_000
  mac.almacen.escribir('chat_messages', mac.almacen.leer('chat_messages').filter((f) => f.id !== 'a2'))
  assert.equal(exportar(mac.ctx).borradas, 1)
  viajar(mac, vps); viajar(vps, mac)
  importar(vps.ctx); importar(mac.ctx)
  assert.deepEqual(vps.almacen.leer('chat_messages').map((f) => f.id), ['a1'])
  assert.deepEqual(mac.almacen.leer('chat_messages').map((f) => f.id), ['a1'])
})

test('máquina apagada a media escritura: una línea incompleta espera, nada se pierde ni se duplica', () => {
  const mac = maquina('mac-fulano'), vps = maquina('vps-fulano')
  mac.almacen.escribir('chat_sessions', [sesion('s1')])
  exportar(mac.ctx)
  const linea = readFileSync(join(mac.cerebro, DIARIO_DIR, 'mac-fulano', '2026-11.jsonl'), 'utf8')
  const dir = join(vps.cerebro, DIARIO_DIR, 'mac-fulano')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '2026-11.jsonl'), linea.slice(0, 40))
  assert.equal(importar(vps.ctx).operaciones, 0)
  appendFileSync(join(dir, '2026-11.jsonl'), linea.slice(40))
  assert.equal(importar(vps.ctx).aplicadas, 1)
  assert.equal(importar(vps.ctx).operaciones, 0)
  assert.equal(vps.almacen.leer('chat_sessions').length, 1)
})

test('si de golpe falta más de la mitad (base reinstalada), no se borra nada en la otra máquina', () => {
  const mac = maquina('mac-fulano')
  mac.almacen.escribir('chat_sessions', [sesion('s1')])
  mac.almacen.escribir('chat_messages', Array.from({ length: 30 }, (_, i) => msj(`m${i}`, 's1', 'user', `m${i}`, '2026-11-05T18:00:00Z')))
  exportar(mac.ctx)
  mac.almacen.escribir('chat_messages', [])
  const r = exportar(mac.ctx)
  assert.equal(r.borradas, 0)
  assert.match(r.aviso ?? '', /no las borré en tu otra máquina/)
  assert.ok(!readFileSync(join(mac.cerebro, DIARIO_DIR, 'mac-fulano', '2026-11.jsonl'), 'utf8').includes('"borra"'))
})

test('pasar a espejo con historial en las dos: la primera vez se unen las dos listas', () => {
  const mac = maquina('mac-fulano'), vps = maquina('vps-fulano')
  mac.almacen.escribir('chat_sessions', Array.from({ length: 5 }, (_, i) => sesion(`mac-${i}`)))
  vps.almacen.escribir('chat_sessions', Array.from({ length: 3 }, (_, i) => sesion(`vps-${i}`)))
  exportar(mac.ctx); exportar(vps.ctx); viajar(mac, vps); viajar(vps, mac); importar(mac.ctx); importar(vps.ctx)
  assert.equal(mac.almacen.leer('chat_sessions').length, 8)
  assert.equal(vps.almacen.leer('chat_sessions').length, 8)
})

test('funciona sobre la base local real (archivos JSON de la edición del alumno)', () => {
  const datos = tmp('base')
  const a = almacenArchivos(join(datos, 'a')), b = almacenArchivos(join(datos, 'b'))
  const ca = tmp('ca'), cb = tmp('cb')
  const ctxA: Contexto = { cerebro: ca, host: 'mac-fulano', almacen: a, estadoArchivo: join(datos, 'ea.json') }
  const ctxB: Contexto = { cerebro: cb, host: 'nube-fulano', almacen: b, estadoArchivo: join(datos, 'eb.json') }
  a.escribir('chat_sessions', [sesion('s1')])
  a.escribir('chat_messages', [msj('a1', 's1', 'user', 'hola', '2026-11-05T18:00:01Z')])
  exportar(ctxA)
  cpSync(join(ca, DIARIO_DIR), join(cb, DIARIO_DIR), { recursive: true })
  importar(ctxB)
  assert.deepEqual(b.leer('chat_messages').map((f) => f.content), ['hola'])
  assert.ok(readdirSync(join(datos, 'b')).includes('chat_messages.json'))
})

test('el espejo de conversaciones solo existe en la edición del alumno con el espejo encendido', () => {
  const cerebro = tmp('maq')
  const env = { ARBRAIN_EDICION: 'cliente', ARBRAIN_HOME: cerebro, ARBRAIN_DATA_DIR: tmp('dw') }
  assert.equal(maquinaEnEspejo(env), null)
  mkdirSync(join(cerebro, '.arbrain-espejo'))
  writeFileSync(join(cerebro, '.arbrain-espejo', 'maquina.json'), JSON.stringify({ activo: false, host: 'mac-fulano' }))
  assert.equal(maquinaEnEspejo(env), null)
  writeFileSync(join(cerebro, '.arbrain-espejo', 'maquina.json'), JSON.stringify({ activo: true, host: 'mac-fulano' }))
  assert.deepEqual(maquinaEnEspejo(env), { cerebro, host: 'mac-fulano' })
  assert.equal(maquinaEnEspejo({ ...env, ARBRAIN_EDICION: 'original' }), null)
})

test('Ajustes › Máquinas: una línea solo con el espejo encendido', () => {
  const ahora = new Date('2026-11-05T19:00:00')
  assert.equal(textoConversaciones({ activo: false }), null)
  const ok = textoConversaciones({ activo: true, host: 'mac-fulano', maquinas: ['mac-fulano', 'vps-fulano'], ultimaSync: { en: '2026-11-05T18:58:00', codigo: 'ok', motivo: '' } }, ahora)!
  assert.match(ok.texto, /una sola lista en mac-fulano y vps-fulano/)
  assert.equal(ok.bien, true)
  const mal = textoConversaciones({ activo: true, host: 'mac-fulano', maquinas: ['mac-fulano'], ultimaSync: { en: '2026-11-05T18:58:00', codigo: 'sin_red', motivo: 'No alcancé tu GitHub' } }, ahora)!
  assert.equal(mal.bien, false)
  assert.match(mal.detalle!, /No alcancé tu GitHub\. Lo tuyo queda guardado aquí/)
})

test('ciclo periódico: solo la edición del alumno, una vez por proceso, y el arranque de la web lo arma', async () => {
  const { arrancarPeriodico, intervaloPeriodico } = await import('../../src/lib/espejo-conversaciones/pulso')
  assert.equal(intervaloPeriodico({}), 5 * 60_000)
  assert.equal(intervaloPeriodico({ ARBRAIN_ESPEJO_INTERVALO_MS: '20000' }), 20_000)
  assert.equal(intervaloPeriodico({ ARBRAIN_ESPEJO_INTERVALO_MS: '10' }), 5 * 60_000)
  assert.equal(arrancarPeriodico(() => memoria(), { ARBRAIN_EDICION: 'original' }), false)
  // Solo en Node, en una rama que webpack elimina al compilar para edge (7 nov 2026), y solo en la edición del alumno.
  const inst = readFileSync(new URL('../../src/instrumentation.ts', import.meta.url), 'utf8')
  assert.match(inst, /if \(process\.env\.NEXT_RUNTIME === 'nodejs'\) await \(await import\('\.\/instrumentation-node'\)\)\.arrancarNodo\(\)/)
  assert.doesNotMatch(inst, /import\(['"](@\/lib|node:)/, 'nada solo-Node alcanzable desde la compilación de edge')
  const nodo = readFileSync(new URL('../../src/instrumentation-node.ts', import.meta.url), 'utf8')
  assert.match(nodo, /if \(!esEdicionCliente\(\)\) return[\s\S]*arrancarPeriodico\(almacenCrudoDeLaInstalacion\)/)
})
