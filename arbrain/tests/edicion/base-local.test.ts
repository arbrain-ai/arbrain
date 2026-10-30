// Base local de la edición cliente (empaquetado, 11 oct 2026): el subconjunto del cliente de Supabase que usan chat y
// lienzo, sobre filas locales. Las consultas son las mismas que escriben las rutas (chat/sessions, chat/complete…).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { almacenMemoria, clienteLocal, predicadoOr } from '../../src/lib/base-local/consulta'
import { almacenArchivos } from '../../src/lib/base-local/archivos'

const nuevo = (inicial = {}) => { const a = almacenMemoria(inicial); return { a, db: clienteLocal(a) } }

test('insert con select().single() devuelve la fila con id, created_at y updated_at', async () => {
  const { db } = nuevo()
  const r = await db.from('chat_sessions').insert({ title: 'Hola', profile_id: 'p1', account: null }).select('*').single()
  const { error } = r
  const data = r.data as Record<string, unknown>
  assert.equal(error, null)
  assert.ok(data && typeof data.id === 'string')
  assert.equal(data.title, 'Hola')
  assert.ok(typeof data.created_at === 'string' && typeof data.updated_at === 'string')
})

test('insert con id repetido = 23505 (lo que espera chat/sessions POST)', async () => {
  const { db } = nuevo({ chat_sessions: [{ id: 'x', title: 'a' }] })
  const { error } = await db.from('chat_sessions').insert({ id: 'x', title: 'b' }).select('*').single()
  assert.equal(error?.code, '23505')
})

test('la consulta de Recientes: or de dueño, is null, order con nulls al final, limit', async () => {
  const { db } = nuevo({
    chat_sessions: [
      { id: '1', profile_id: 'p1', archived_at: null, last_message_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-10T00:00:00Z' },
      { id: '2', profile_id: null, archived_at: null, last_message_at: null, updated_at: '2026-10-11T00:00:00Z' },
      { id: '3', profile_id: 'otro', archived_at: null, last_message_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' },
      { id: '4', profile_id: 'p1', archived_at: '2026-10-01T00:00:00Z', last_message_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' },
      { id: '5', profile_id: 'p1', archived_at: null, last_message_at: '2026-10-11T05:00:00Z', updated_at: '2026-10-09T00:00:00Z' },
    ],
  })
  const { data, error } = await db.from('chat_sessions').select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false })
    .limit(30).or('profile_id.eq.p1,profile_id.is.null').is('archived_at', null)
  assert.equal(error, null)
  assert.deepEqual((data as Array<{ id: string }>).map((f) => f.id), ['5', '1', '2'])
})

test('update().eq().neq().select() toca solo lo que coincide y fija updated_at', async () => {
  const { db, a } = nuevo({ chat_sessions: [
    { id: 'a', profile_id: 'p', is_starred: true, updated_at: '2020-01-01T00:00:00Z' },
    { id: 'b', profile_id: 'p', is_starred: true, updated_at: '2020-01-01T00:00:00Z' },
    { id: 'c', profile_id: 'q', is_starred: true, updated_at: '2020-01-01T00:00:00Z' },
  ] })
  const { data } = await db.from('chat_sessions').update({ is_starred: false }).eq('profile_id', 'p').eq('is_starred', true).neq('id', 'a').select('id')
  assert.deepEqual(data, [{ id: 'b' }])
  assert.equal(a.tablas.chat_sessions.find((f) => f.id === 'c')!.is_starred, true)
  assert.notEqual(a.tablas.chat_sessions.find((f) => f.id === 'b')!.updated_at, '2020-01-01T00:00:00Z')
})

test('upsert con ignoreDuplicates no pisa; sin él, mezcla', async () => {
  const { db, a } = nuevo({ chat_sessions: [{ id: 'h', title: 'viejo' }] })
  await db.from('chat_sessions').upsert([{ id: 'h', title: 'nuevo' }, { id: 'i', title: 'otro' }], { onConflict: 'id', ignoreDuplicates: true })
  assert.equal(a.tablas.chat_sessions.find((f) => f.id === 'h')!.title, 'viejo')
  assert.equal(a.tablas.chat_sessions.length, 2)
  await db.from('chat_sessions').upsert({ id: 'h', title: 'nuevo' })
  assert.equal(a.tablas.chat_sessions.find((f) => f.id === 'h')!.title, 'nuevo')
})

test('delete, maybeSingle, in, not is null, ilike, conteo con head', async () => {
  const { db } = nuevo({ m: [{ id: '1', s: 'a', t: 'Hola Mundo', x: null }, { id: '2', s: 'a', t: 'adiós', x: 1 }, { id: '3', s: 'b', t: 'hola', x: 2 }] })
  assert.equal((await db.from('m').select('id').eq('id', 'zzz').maybeSingle()).data, null)
  assert.equal((await db.from('m').select('id').eq('id', 'zzz').single()).error?.code, 'PGRST116')
  assert.deepEqual(((await db.from('m').select('id').in('id', ['1', '3'])).data as unknown[]).length, 2)
  assert.deepEqual(((await db.from('m').select('id').not('x', 'is', null)).data as Array<{ id: string }>).map((f) => f.id), ['2', '3'])
  assert.deepEqual(((await db.from('m').select('id').ilike('t', 'hola%')).data as Array<{ id: string }>).map((f) => f.id), ['1', '3'])
  const conteo = await db.from('m').select('*', { count: 'exact', head: true }).eq('s', 'a')
  assert.equal(conteo.count, 2)
  assert.equal(conteo.data, null)
  await db.from('m').delete().eq('s', 'a')
  assert.deepEqual(((await db.from('m').select('id')).data as Array<{ id: string }>).map((f) => f.id), ['3'])
})

test('select de columnas proyecta y relaciones anidadas se ignoran sin romper', async () => {
  const { db } = nuevo({ draw: [{ page_id: 'p', name: 'Mapa', page_elements: [1], extra: 'no' }] })
  const { data } = await db.from('draw').select('page_id, name, draw_folders(name)').single()
  assert.deepEqual(data, { page_id: 'p', name: 'Mapa' })
})

test('or con and anidado y con comparaciones', () => {
  const p = predicadoOr('and(a.gte.2,a.lt.5),b.eq.x')
  assert.equal(p({ a: 3 }), true)
  assert.equal(p({ a: 5 }), false)
  assert.equal(p({ a: 9, b: 'x' }), true)
})

test('rpc, storage y nombres de tabla raros devuelven error legible, nunca lanzan', async () => {
  const { db } = nuevo()
  assert.ok((await db.rpc('create_draw_from_agent', {})).error)
  assert.ok((await db.storage.from('chat-audio').upload()).error)
  assert.ok((await db.from('../etc/passwd').select('*')).error)
  const canal = db.channel('x').on().subscribe(() => {})
  assert.ok(canal)
})

test('almacén de archivos: carpeta 0700, archivo 0600, relee lo que escribió otra copia', async () => {
  const carpeta = join(mkdtempSync(join(tmpdir(), 'base-local-')), 'base')
  const uno = clienteLocal(almacenArchivos(carpeta))
  const dos = clienteLocal(almacenArchivos(carpeta))
  await uno.from('chat_messages').insert({ id: 'm1', session_id: 's', content: 'hola' })
  const leido = await dos.from('chat_messages').select('*').eq('session_id', 's')
  assert.equal((leido.data as unknown[]).length, 1)
  await dos.from('chat_messages').insert({ id: 'm2', session_id: 's', content: 'otra' })
  assert.equal(((await uno.from('chat_messages').select('id')).data as unknown[]).length, 2)
  if (process.platform !== 'win32') {
    assert.equal(statSync(carpeta).mode & 0o777, 0o700)
    assert.equal(statSync(join(carpeta, 'chat_messages.json')).mode & 0o777, 0o600)
  }
  assert.equal(JSON.parse(readFileSync(join(carpeta, 'chat_messages.json'), 'utf8')).length, 2)
})

test('sin ARBRAIN_DATA_DIR el almacén de la instalación falla con un error claro (nunca cae a ~/.config/arbrain)', async () => {
  const previo = process.env.ARBRAIN_DATA_DIR
  delete process.env.ARBRAIN_DATA_DIR
  try {
    const { almacenDeLaInstalacion } = await import('../../src/lib/base-local/archivos')
    const r = await clienteLocal(almacenDeLaInstalacion()).from('chat_sessions').select('*')
    assert.match(r.error?.message ?? '', /ARBRAIN_DATA_DIR/)
  } finally { if (previo !== undefined) process.env.ARBRAIN_DATA_DIR = previo }
})

test('filtros sobre JSON: metadata->>turnId (chat/complete y el borrado de un turno)', async () => {
  const { db } = nuevo({ chat_messages: [
    { id: '1', session_id: 's', role: 'user', metadata: { turnId: 't1' } },
    { id: '2', session_id: 's', role: 'assistant', metadata: { turnId: 't1', usage: { a: 1 } } },
    { id: '3', session_id: 's', role: 'user', metadata: { turnId: 't2' } },
  ] })
  const r = await db.from('chat_messages').select('id').eq('session_id', 's').eq('metadata->>turnId', 't1').eq('role', 'assistant').limit(1)
  assert.deepEqual(r.data, [{ id: '2' }])
  await db.from('chat_messages').delete().eq('session_id', 's').eq('metadata->>turnId', 't1')
  assert.deepEqual(((await db.from('chat_messages').select('id')).data as Array<{ id: string }>).map((f) => f.id), ['3'])
})

test('esquema local: draw nace con page_id y defaults (lo que esperan las rutas del lienzo)', async () => {
  const { db } = nuevo()
  const { data } = await db.from('draw').insert({ user_id: 'u', name: 'Lienzo nuevo', page_elements: { elements: [] } }).select('page_id, name, folder_id').single()
  const fila = data as { page_id: string; name: string; folder_id: null }
  assert.ok(fila.page_id)
  const lista = await db.from('draw').select('page_id').eq('user_id', 'u').eq('is_deleted', false)
  assert.equal((lista.data as unknown[]).length, 1)
  const actualizado = await db.from('draw').update({ name: 'Otro' }).eq('page_id', fila.page_id).eq('agent_version', 1).select('page_id')
  assert.equal((actualizado.data as unknown[]).length, 1)
  const s = await db.from('chat_sessions').insert({ title: 't', profile_id: 'p' }).select('*').single()
  assert.equal((s.data as { is_favorite: boolean }).is_favorite, false)
})

test('red team 2 (I9): <datos>/web y base/ quedan 0700 y las tablas 0600 aunque ya existieran abiertas', { skip: process.platform === 'win32' && 'sin modos POSIX' }, async () => {
  const { chmodSync, mkdirSync, writeFileSync } = await import('node:fs')
  const web = join(mkdtempSync(join(tmpdir(), 'base-local-web-')), 'web')
  const base = join(web, 'base')
  mkdirSync(base, { recursive: true, mode: 0o755 })
  chmodSync(web, 0o755)
  chmodSync(base, 0o755)
  writeFileSync(join(base, 'vieja.json'), '[]', { mode: 0o644 })
  chmodSync(join(base, 'vieja.json'), 0o644)
  const previo = process.env.ARBRAIN_DATA_DIR
  process.env.ARBRAIN_DATA_DIR = web
  try {
    const almacen = almacenArchivos()
    // Solo leer ya cierra lo que estaba abierto.
    assert.deepEqual(almacen.leer('vieja'), [])
    assert.equal(statSync(web).mode & 0o777, 0o700)
    assert.equal(statSync(base).mode & 0o777, 0o700)
    assert.equal(statSync(join(base, 'vieja.json')).mode & 0o777, 0o600)
    await clienteLocal(almacen).from('chat_sessions').insert({ id: 's1' })
    assert.equal(statSync(join(base, 'chat_sessions.json')).mode & 0o777, 0o600)
  } finally {
    if (previo === undefined) delete process.env.ARBRAIN_DATA_DIR
    else process.env.ARBRAIN_DATA_DIR = previo
  }
})

test('red team 2 (I9): sin base previa, <datos>/web nace 0700 al primer escrito', { skip: process.platform === 'win32' && 'sin modos POSIX' }, async () => {
  const { mkdirSync, chmodSync } = await import('node:fs')
  const web = join(mkdtempSync(join(tmpdir(), 'base-local-web-')), 'web')
  mkdirSync(web)
  chmodSync(web, 0o755)
  const previo = process.env.ARBRAIN_DATA_DIR
  process.env.ARBRAIN_DATA_DIR = web
  try {
    await clienteLocal(almacenArchivos()).from('draw').insert({ id: 'd1' })
    assert.equal(statSync(web).mode & 0o777, 0o700)
    assert.equal(statSync(join(web, 'base')).mode & 0o777, 0o700)
    assert.equal(statSync(join(web, 'base', 'draw.json')).mode & 0o777, 0o600)
  } finally {
    if (previo === undefined) delete process.env.ARBRAIN_DATA_DIR
    else process.env.ARBRAIN_DATA_DIR = previo
  }
})

// Resiliencia (12 oct 2026): un archivo dañado se leía como tabla vacía y la siguiente escritura lo pisaba, así se
// perdían todas las conversaciones del alumno sin aviso. Ahora: copia anterior o 503, nunca escribir sobre lo ilegible.
test('base dañada: se recupera de la copia anterior y nunca se pisa con una tabla vacía', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'base-danada-'))
  const db = clienteLocal(almacenArchivos(dir))
  await db.from('chat_sessions').insert({ id: 's1', title: 'uno' })
  await db.from('chat_sessions').insert({ id: 's2', title: 'dos' })
  writeFileSync(join(dir, 'chat_sessions.json'), '{"roto": ')
  // Otra copia del módulo (Next empaqueta rutas por separado) lee el disco sin caché.
  const otra = clienteLocal(almacenArchivos(dir))
  const leidas = await otra.from('chat_sessions').select('id')
  assert.equal(leidas.error, null)
  assert.deepEqual((leidas.data as { id: string }[]).map(f => f.id), ['s1'], 'la copia anterior (antes de s2) manda; nunca vacío')
  await otra.from('chat_sessions').insert({ id: 's3', title: 'tres' })
  const ids = (JSON.parse(readFileSync(join(dir, 'chat_sessions.json'), 'utf8')) as { id: string }[]).map(f => f.id)
  assert.deepEqual(ids, ['s1', 's3'])
  const copia = (JSON.parse(readFileSync(join(dir, 'chat_sessions.json.bak'), 'utf8')) as { id: string }[]).map(f => f.id)
  assert.deepEqual(copia, ['s1'], 'la copia buena no se reemplazó con el archivo dañado')
})

test('base dañada sin copia útil: 503 LOCAL_DANADA y el archivo queda intacto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'base-danada-'))
  writeFileSync(join(dir, 'chat_messages.json'), 'basura')
  const db = clienteLocal(almacenArchivos(dir))
  const r = await db.from('chat_messages').select('*')
  assert.equal(r.status, 503)
  assert.equal(r.error?.code, 'LOCAL_DANADA')
  assert.match(r.error?.message ?? '', /dañada.*Tus datos no se tocaron/)
  const w = await db.from('chat_messages').insert({ session_id: 'x', role: 'user', content: 'hola' })
  assert.equal(w.status, 503)
  assert.equal(readFileSync(join(dir, 'chat_messages.json'), 'utf8'), 'basura', 'nada se escribió encima')
})

test('tabla que no existe todavía sigue siendo vacía (no es daño)', async () => {
  const db = clienteLocal(almacenArchivos(mkdtempSync(join(tmpdir(), 'base-vacia-'))))
  const r = await db.from('chat_sessions').select('*')
  assert.equal(r.error, null)
  assert.deepEqual(r.data, [])
})
