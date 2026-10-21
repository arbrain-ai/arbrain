// Ajustes › Notificaciones (12 oct 2026): la suscripción y la prueba van SIEMPRE al usuario de la sesión.
// Sin red ni base: el almacén es falso y el envío también (ninguna notificación real sale de estas pruebas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  altaSuscripcion, bajaSuscripcion, crearLimitador, enviarPrueba, estadoSuscripcion, payloadPrueba, validarSuscripcion,
  VENTANA_PRUEBA_MS, type AlmacenPush, type FilaSuscripcion, type IntentoPush, type SuscripcionValida,
} from '../../src/features/notifications/lib/pushServidor'
import { almacenSupabase } from '../../src/features/notifications/lib/almacenSupabase'

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const sub = (n: string) => ({ endpoint: `https://web.push.apple.com/falso-${n}`, keys: { p256dh: `p256-${n}`, auth: `auth-${n}` } })

/** Almacén en memoria con la misma semántica que `almacenSupabase`: upsert por endpoint y todo filtrado por usuario. */
function almacenFalso() {
  const filas: (FilaSuscripcion & { user_id: string })[] = []
  const log: IntentoPush[] = []
  let n = 0
  const a: AlmacenPush = {
    async guardar(userId, s) {
      const i = filas.findIndex((f) => f.endpoint === s.endpoint)
      const fila = { id: i >= 0 ? filas[i].id : `id-${++n}`, user_id: userId, ...s }
      if (i >= 0) filas[i] = fila; else filas.push(fila)
    },
    async borrar(userId, endpoint) {
      const i = filas.findIndex((f) => f.user_id === userId && f.endpoint === endpoint)
      if (i >= 0) filas.splice(i, 1)
    },
    async deUsuario(userId) { return filas.filter((f) => f.user_id === userId).map(({ user_id: _u, ...f }) => f) },
    async borrarIds(userId, ids) { for (const id of ids) { const i = filas.findIndex((f) => f.id === id && f.user_id === userId); if (i >= 0) filas.splice(i, 1) } },
    async registrar(i) { log.push(...i) },
  }
  return { a, filas, log }
}

test('alta: sin sesión 401 y no escribe nada', async () => {
  const { a, filas } = almacenFalso()
  const r = await altaSuscripcion(null, { subscription: sub('x') }, a)
  assert.equal(r.status, 401)
  assert.equal(filas.length, 0)
})

test('alta: queda a nombre del usuario de la SESIÓN aunque el cliente mande otro userId', async () => {
  const { a, filas } = almacenFalso()
  const r = await altaSuscripcion('usuaria-a', { subscription: sub('tel'), userId: 'usuario-b', user_id: 'usuario-b' }, a)
  assert.equal(r.status, 200)
  assert.deepEqual(filas.map((f) => f.user_id), ['usuaria-a'])
})

test('alta: re-registrar el mismo teléfono no duplica; si entra otra cuenta, el teléfono pasa a esa cuenta', async () => {
  const { a, filas } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  assert.equal(filas.length, 1)
  await altaSuscripcion('usuario-b', { subscription: sub('tel') }, a)
  assert.deepEqual(filas.map((f) => f.user_id), ['usuario-b'])
})

test('alta: rechaza suscripciones inválidas o sin HTTPS', async () => {
  const { a, filas } = almacenFalso()
  for (const malo of [null, {}, { subscription: { endpoint: 'http://inseguro', keys: { p256dh: 'a', auth: 'b' } } }, { subscription: { endpoint: 'https://x', keys: {} } }]) {
    assert.equal((await altaSuscripcion('usuaria-a', malo, a)).status, 400)
  }
  assert.equal(filas.length, 0)
  assert.equal(validarSuscripcion({ endpoint: `https://${'x'.repeat(3000)}`, keys: { p256dh: 'a', auth: 'b' } }), null)
})

test('estado: dice si ESTE endpoint está registrado para mí y cuántos dispositivos tengo; nunca los de otro', async () => {
  const { a } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  await altaSuscripcion('usuario-b', { subscription: sub('mac') }, a)
  assert.deepEqual((await estadoSuscripcion('usuaria-a', sub('tel').endpoint, a)).json, { registrada: true, dispositivos: 1 })
  assert.deepEqual((await estadoSuscripcion('usuaria-a', sub('mac').endpoint, a)).json, { registrada: false, dispositivos: 1 })
  assert.equal((await estadoSuscripcion(null, sub('tel').endpoint, a)).status, 401)
})

test('baja: solo borra un dispositivo propio', async () => {
  const { a, filas } = almacenFalso()
  await altaSuscripcion('usuario-b', { subscription: sub('mac') }, a)
  await bajaSuscripcion('usuaria-a', { endpoint: sub('mac').endpoint }, a)
  assert.equal(filas.length, 1, 'usuaria-a no puede apagar el teléfono de usuario-b')
  await bajaSuscripcion('usuario-b', { endpoint: sub('mac').endpoint }, a)
  assert.equal(filas.length, 0)
  assert.equal((await bajaSuscripcion(null, { endpoint: 'x' }, a)).status, 401)
  assert.equal((await bajaSuscripcion('usuario-b', {}, a)).status, 400)
})

function pruebaCon(a: AlmacenPush, usuario: string | null, opts: { enviar?: (s: SuscripcionValida) => Promise<void>; limitador?: ReturnType<typeof crearLimitador>; vapidLista?: boolean; ahora?: Date } = {}) {
  const enviados: string[] = []
  const r = enviarPrueba({
    usuario, nombre: 'Fulana Prueba', vapidLista: opts.vapidLista ?? true, almacen: a,
    enviar: async (s) => { if (opts.enviar) await opts.enviar(s); enviados.push(s.endpoint) },
    limitador: opts.limitador ?? crearLimitador(VENTANA_PRUEBA_MS), ahora: opts.ahora,
  })
  return { r, enviados }
}

test('prueba: sin sesión 401 y no envía nada', async () => {
  const { a } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  const { r, enviados } = pruebaCon(a, null)
  assert.equal((await r).status, 401)
  assert.deepEqual(enviados, [])
})

test('prueba: va SOLO a los dispositivos de quien la pide', async () => {
  const { a, log } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  await altaSuscripcion('usuaria-a', { subscription: sub('ipad') }, a)
  await altaSuscripcion('usuario-b', { subscription: sub('mac') }, a)
  const { r, enviados } = pruebaCon(a, 'usuaria-a')
  const res = await r
  assert.equal(res.status, 200)
  assert.deepEqual(enviados.sort(), [sub('ipad').endpoint, sub('tel').endpoint])
  assert.equal(res.json.enviadas, 2)
  assert.ok(log.every((i) => i.job_id === 'prueba-ajustes' && i.status === 'accepted'))
  assert.ok(log.every((i) => !String(i.endpoint_tail).includes('https://')), 'el log no guarda el endpoint completo')
})

test('prueba: límite de frecuencia por persona (429 con Retry-After), sin frenar a otra persona', async () => {
  const { a } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  await altaSuscripcion('usuario-b', { subscription: sub('mac') }, a)
  const limitador = crearLimitador(VENTANA_PRUEBA_MS)
  const t0 = new Date('2026-10-12T12:00:00Z')
  assert.equal((await pruebaCon(a, 'usuaria-a', { limitador, ahora: t0 }).r).status, 200)
  const segunda = pruebaCon(a, 'usuaria-a', { limitador, ahora: new Date(t0.getTime() + 5_000) })
  const r2 = await segunda.r
  assert.equal(r2.status, 429)
  assert.equal(r2.headers?.['Retry-After'], '25')
  assert.deepEqual(segunda.enviados, [])
  assert.equal((await pruebaCon(a, 'usuario-b', { limitador, ahora: new Date(t0.getTime() + 5_000) }).r).status, 200)
  assert.equal((await pruebaCon(a, 'usuaria-a', { limitador, ahora: new Date(t0.getTime() + VENTANA_PRUEBA_MS) }).r).status, 200)
})

test('prueba: sin dispositivos 404 con acuse no_subs; sin VAPID 503 con acuse vapid_missing', async () => {
  const { a, log } = almacenFalso()
  assert.equal((await pruebaCon(a, 'usuaria-a').r).status, 404)
  assert.equal(log.at(-1)?.status, 'no_subs')
  assert.equal((await pruebaCon(a, 'usuaria-a', { vapidLista: false }).r).status, 503)
  assert.equal(log.at(-1)?.status, 'vapid_missing')
})

test('prueba: una suscripción muerta (410) se borra; las demás siguen', async () => {
  const { a, filas } = almacenFalso()
  await altaSuscripcion('usuaria-a', { subscription: sub('vieja') }, a)
  await altaSuscripcion('usuaria-a', { subscription: sub('tel') }, a)
  const { r } = pruebaCon(a, 'usuaria-a', { enviar: async (s) => { if (s.endpoint.endsWith('vieja')) throw Object.assign(new Error('Gone'), { statusCode: 410 }) } })
  const res = await r
  assert.equal(res.status, 200)
  assert.equal(res.json.limpiadas, 1)
  assert.deepEqual(filas.map((f) => f.endpoint), [sub('tel').endpoint])
})

test('payload de prueba: nombre de pila, tag único y abre Ajustes › Notificaciones', () => {
  const p = payloadPrueba('Fulana Prueba', new Date(1))
  assert.match(p.body, /^Fulana, /)
  assert.equal(p.tag, 'prueba-1')
  assert.equal(p.url, '/settings?seccion=notificaciones')
  assert.doesNotMatch(JSON.stringify(payloadPrueba(null)), /SaaS Factory|Mission Control|comunidad/i)
})

test('almacenSupabase: cada lectura y borrado filtra por el usuario; el upsert escribe el user_id recibido', async () => {
  const llamadas: string[] = []
  const cadena = (tabla: string): any => {
    const c: any = {
      upsert: (fila: any, o: any) => { llamadas.push(`${tabla}.upsert user_id=${fila.user_id} onConflict=${o.onConflict}`); return Promise.resolve({ error: null }) },
      insert: () => { llamadas.push(`${tabla}.insert`); return Promise.resolve({ error: null }) },
      select: () => { llamadas.push(`${tabla}.select`); return c },
      delete: () => { llamadas.push(`${tabla}.delete`); return c },
      in: (k: string) => { llamadas.push(`in ${k}`); return c },
      eq: (k: string, v: string) => { llamadas.push(`eq ${k}=${v}`); return c },
      then: (r: any) => r({ data: [], error: null }),
    }
    return c
  }
  const al = almacenSupabase({ from: cadena } as any)
  await al.guardar('usuaria-a', validarSuscripcion(sub('tel'))!)
  await al.deUsuario('usuaria-a')
  await al.borrar('usuaria-a', 'https://e')
  await al.borrarIds('usuaria-a', ['id-1'])
  const t = llamadas.join('\n')
  assert.match(t, /push_subscriptions\.upsert user_id=usuaria-a onConflict=endpoint/)
  assert.match(t, /push_subscriptions\.select\neq user_id=usuaria-a/)
  assert.match(t, /push_subscriptions\.delete\neq user_id=usuaria-a\neq endpoint=https:\/\/e/)
  assert.match(t, /push_subscriptions\.delete\nin id\neq user_id=usuaria-a/)
})

test('rutas: el usuario sale de la sesión; ni subscribe ni prueba leen un userId del cliente', () => {
  for (const ruta of ['src/app/api/notifications/subscribe/route.ts', 'src/app/api/notifications/prueba/route.ts']) {
    const s = src(ruta)
    assert.match(s, /auth\.getUser\(\)/, `${ruta} resuelve la sesión`)
    assert.doesNotMatch(s, /userId|user_id/, `${ruta} no acepta destinatario del cliente`)
    assert.match(s, /respuestaServicioCaido/, `${ruta}: Auth caído = 503, no 401`)
  }
  assert.doesNotMatch(src('src/app/api/notifications/prueba/route.ts'), /req\.json|request\.json/, 'la prueba no tiene cuerpo')
})
