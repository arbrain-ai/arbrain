import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { armarBandeja, formularioDecision, motivoDeCierre, presentar, temaDe, tokenDecidir, type AvisoFila, type EstadoDecision } from '../../src/features/avisos/bandeja'

// Fixtures con la forma real de la campana del 29 oct 2026 (textos de los emisores, sin datos privados de más).
const AHORA = new Date('2026-10-29T13:10:00Z')
const TOK_A = 'fJwWidVDikH80Sf4oMaaaaaaaaaaaaaaaaaaaaa'
const TOK_B = 'am_qpGvWwUWVIS22WQbbbbbbbbbbbbbbbbbbbbb'
let n = 0
const aviso = (p: Partial<AvisoFila>): AvisoFila => ({
  id: `a${++n}`, created_at: '2026-10-29T13:00:00Z', kind: 'persona', source: 'otro', title: 'x', body: null, url: null, read_at: null, ...p,
})
const comunidad = (quien: string, token: string, hora: string, p: Partial<AvisoFila> = {}) => aviso({
  source: 'ht-comunidad', created_at: hora, url: `https://arbrain.ai/decidir/${token}`,
  title: `¿Publico la respuesta de Levy a ${quien}?`,
  body: `${quien} escribió: «Buenas. Alguien tiene el transcript que me pueda pasar? Gracias»\nTe la paso a ti y no a tu equipo: compromiso tuyo.\nQueda en borrador: el modelo no la marcó segura. NO VERIFICADO — falta el enlace\nhttps://arbrain.ai/community?post=1`,
  ...p,
})
const vps = (hora: string) => aviso({ kind: 'alerta', source: 'vigia-seguridad', created_at: hora, title: 'Seguridad: VPS', url: '/rutinas',
  body: 'VPS: disco al 97.3% (respaldos y base en riesgo)\nRunbook: docs/seguridad/RUNBOOK-INCIDENTES.md' })
const sinEstado = new Map<string, EstadoDecision>()

test('una respuesta de la comunidad se lee como decisión humana, sin jerga interna, con sus tres botones', () => {
  const f = presentar(comunidad('Fulano Pérez', TOK_B, '2026-10-28T21:30:00Z'))
  assert.equal(f.grupo, 'decidir')
  assert.equal(f.titulo, 'Fulano Pérez en la comunidad')
  assert.equal(f.frase, '¿Publico la respuesta de Levy?')
  assert.equal(f.cita, 'Buenas. Alguien tiene el transcript que me pueda pasar? Gracias')
  assert.deepEqual(f.acciones.map(a => a.etiqueta), ['Publicar', 'Ver borrador', 'Descartar'])
  const todo = JSON.stringify(f)
  for (const jerga of ['NO VERIFICADO', 'el modelo no la marcó segura', 'Queda en borrador', 'Te la paso a ti']) assert.ok(!todo.includes(jerga), jerga)
})

test('el riesgo real es Urgente con título de una línea; el Studio apretado es solo Para saber', () => {
  const f = presentar(vps('2026-10-29T13:05:00Z'))
  assert.equal(f.grupo, 'urgente')
  assert.equal(f.titulo, 'VPS: disco al 97.3%')
  assert.equal(f.frase, 'Respaldos y base en riesgo.')
  const memoria = presentar(aviso({ kind: 'alerta', source: 'vigia-recursos', title: '🟠 Studio apretado de memoria', body: 'Memoria libre 44% · swap 12.8 GB.' }))
  assert.equal(memoria.grupo, 'saber')
  assert.equal(memoria.titulo, 'Studio apretado de memoria', 'sin emoji de semáforo')
  const reporte = presentar(aviso({ kind: 'agenda', source: 'rutina:morning-briefing', title: 'Reporte diario', body: '☀️ Jueves 29 oct. Ayer: 0 altas' }))
  assert.equal(reporte.grupo, 'saber', 'un reporte nunca es decisión')
})

test('autorresolución: la decisión ya tomada en /decidir cierra su aviso; la pendiente sigue contando', () => {
  const a = comunidad('Mengano Ruiz Tal', TOK_A, '2026-10-29T13:00:00Z')
  const b = comunidad('Fulano Pérez', TOK_B, '2026-10-28T21:30:00Z')
  const estados = new Map<string, EstadoDecision>([[TOK_A, { estado: 'pendiente', borrador: 'Bienvenido, Mengano' }], [TOK_B, { estado: 'cerrada' }]])
  const bandeja = armarBandeja([a, b], estados, AHORA)
  assert.deepEqual(bandeja.cerrar, [{ id: b.id, por: 'decidido' }])
  assert.deepEqual(bandeja.decidir.map(x => x.id), [a.id])
  assert.equal(bandeja.decidir[0].borrador, 'Bienvenido, Mengano')
})

test('autorresolución: «No encontré la grabación» se cierra cuando esa grupal ya es lección', () => {
  const falta = aviso({ source: 'ht-grupales', created_at: '2026-10-28T21:23:00Z', title: 'No encontré la grabación de la grupal', url: 'https://arbrain.ai/classroom',
    body: '👥 Grupal · Cerebro Artificial (cohorte fundadora) (mié 28 oct): no hay enlace de Fathom compartido ni mp4 en Drive.' })
  const otraFecha = aviso({ source: 'ht-grupales', created_at: '2026-10-28T22:11:00Z', title: 'Nueva lección en Cursos', url: 'https://arbrain.ai/classroom/c?lesson=1',
    body: '👥 Grupal · lun 26 oct · Otra cosa: resumen y capítulos listos.' })
  assert.equal(motivoDeCierre(falta, [otraFecha, falta], sinEstado), null, 'una lección de otro día no la resuelve')
  const leccion = aviso({ source: 'ht-grupales', created_at: '2026-10-28T22:12:00Z', title: 'Nueva lección en Cursos', url: 'https://arbrain.ai/classroom/c?lesson=2',
    body: '👥 Grupal · mié 28 oct · Automatizar procesos repetitivos con rutinas: resumen y capítulos listos.' })
  assert.equal(motivoDeCierre(falta, [leccion, otraFecha, falta], sinEstado), 'causa-resuelta')
})

test('autorresolución: la misma alerta repetida deja solo la más nueva', () => {
  const vieja = vps('2026-10-29T06:57:00Z'), nueva = vps('2026-10-29T13:05:00Z')
  assert.equal(temaDe(vieja), temaDe(nueva))
  const b = armarBandeja([vieja, nueva], sinEstado, AHORA)
  assert.deepEqual(b.cerrar, [{ id: vieja.id, por: 'repetido' }])
  assert.deepEqual(b.urgente.map(x => x.id), [nueva.id])
  // Dos respuestas distintas a la misma persona son dos decisiones (cada una con su enlace).
  const r1 = comunidad('Fulano Pérez', TOK_A, '2026-10-28T20:00:00Z'), r2 = comunidad('Fulano Pérez', TOK_B, '2026-10-28T21:30:00Z')
  assert.notEqual(temaDe(r1), temaDe(r2))
})

test('el número de la campana cuenta solo decisiones pendientes, nunca urgentes ni informativos', () => {
  const filas = [
    comunidad('Mengano Ruiz Tal', TOK_A, '2026-10-29T13:00:00Z'),
    aviso({ source: 'ht-grupales', created_at: '2026-10-29T13:04:00Z', title: 'Recap de la grupal listo para tu «va»', url: 'https://arbrain.ai/community?post=8ce1',
      body: '🧠 El contexto es lo que hace tuyo a tu cerebro: quedó como borrador en Anuncios. Si va, ábrelo y toca «Publicar»; hasta entonces nadie lo ve' }),
    vps('2026-10-29T13:05:00Z'),
    aviso({ kind: 'agenda', source: 'rutina:morning-briefing', created_at: '2026-10-29T11:31:00Z', title: 'Reporte diario', body: '☀️ Jueves 29 oct.' }),
    aviso({ source: 'ht-grupales', created_at: '2026-10-28T22:11:00Z', title: 'Nueva lección en Cursos', url: 'https://arbrain.ai/classroom/c?lesson=9', body: '👥 Grupal · mié 28 oct · Rutinas.' }),
  ]
  const b = armarBandeja(filas, new Map([[TOK_A, { estado: 'pendiente' }]]), AHORA)
  assert.equal(b.pendientes, 2)
  assert.equal(b.decidir.length, 2)
  assert.equal(b.urgente.length, 1)
  assert.equal(b.saber.length, 2)
  assert.equal(b.decidir.find(x => x.titulo === 'Recap de la grupal')?.cita, 'El contexto es lo que hace tuyo a tu cerebro')
})

test('lo vencido deja de contar: una urgencia sin repetirse en 8 h y una decisión sin estado vivo tras su plazo', () => {
  const b = armarBandeja([vps('2026-10-28T20:00:00Z'), comunidad('Zutano', TOK_A, '2026-10-25T10:00:00Z')], sinEstado, AHORA)
  assert.equal(b.pendientes, 0)
  assert.equal(b.urgente.length, 0)
  assert.equal(b.saber.length, 2)
  assert.ok(b.saber.every(x => x.acciones.every(a => a.tipo === 'abrir')), 'en Para saber no quedan botones de decidir')
  // …pero si arbrain.ai dice que sigue pendiente, sigue contando.
  assert.equal(armarBandeja([comunidad('Zutano', TOK_A, '2026-10-25T10:00:00Z')], new Map([[TOK_A, { estado: 'pendiente' }]]), AHORA).pendientes, 1)
})

test('lo ya cerrado no vuelve a la campana', () => {
  const b = armarBandeja([comunidad('Mengano', TOK_A, '2026-10-29T13:00:00Z', { resuelto_at: '2026-10-29T13:02:00Z' })], sinEstado, AHORA)
  assert.equal(b.pendientes, 0)
  assert.equal(b.cerrar.length, 0)
})

test('tokenDecidir solo reconoce enlaces de /decidir', () => {
  assert.equal(tokenDecidir(`https://arbrain.ai/decidir/${TOK_A}`), TOK_A)
  assert.equal(tokenDecidir('https://arbrain.ai/community?post=1'), null)
  assert.equal(tokenDecidir('/decidir/corto'), null)
})

// La forma real de /decidir/<token> (29 oct, renderizada sin JavaScript): un formulario por botón con su server action.
const PAGINA = `<main><form class="e" action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_ID_40e19ec3ee"/><input type="hidden" name="token" value="${TOK_A}"/><input type="hidden" name="paso" value="decision"/><input type="hidden" name="r" value="si"/><textarea name="texto">Bienvenido</textarea><button type="submit">Publicar editado</button></form>
<form class="b" action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_ID_40e19ec3ee"/><input type="hidden" name="token" value="${TOK_A}"/><input type="hidden" name="paso" value="decision"/><input type="hidden" name="r" value="si"/><button type="submit">Publícala</button></form>
<form class="b" action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_ID_40e19ec3ee"/><input type="hidden" name="token" value="${TOK_A}"/><input type="hidden" name="paso" value="decision"/><input type="hidden" name="r" value="no"/><button type="submit">No</button></form></main>`

test('Publicar envía el formulario de «Publícala» tal cual (sin el texto editado); Descartar, el de «No»', () => {
  assert.deepEqual(formularioDecision(PAGINA, 'si'), { $ACTION_ID_40e19ec3ee: '', token: TOK_A, paso: 'decision', r: 'si' })
  assert.equal(formularioDecision(PAGINA, 'no')?.r, 'no')
  // Ya respondida: la página no ofrece botones y no se envía nada.
  assert.equal(formularioDecision('<main><p>Ya respondiste: Publícala</p></main>', 'si'), null)
  // Sin server action no hay toque válido.
  assert.equal(formularioDecision(PAGINA.replaceAll('$ACTION_ID_40e19ec3ee', 'otro'), 'si'), null)
})

test('la cita llega aunque el emisor haya cortado el cuerpo antes del «»»', () => {
  const f = presentar(comunidad('Mengano', TOK_A, '2026-10-29T13:00:00Z', { body: 'Mengano escribió: «Soy Mengano Ruiz, de Lima. Soy contador y po' }))
  assert.equal(f.cita, 'Soy Mengano Ruiz, de Lima. Soy contador y po')
})

test('quien tiene duda llega con su nombre en la frase, sin nombres fijos en el código', () => {
  const f = presentar(comunidad('Fulano Pérez', TOK_A, '2026-10-29T13:00:00Z', { title: 'Mengana tiene duda: ¿Publico tu respuesta a Fulano Pérez?' }))
  assert.equal(f.titulo, 'Fulano Pérez en la comunidad')
  assert.equal(f.frase, 'Mengana tiene duda. ¿Publico tu respuesta?')
})

// ── 29 oct, segunda vuelta: recap de un toque, recap publicado que se cierra en vivo y enlaces exactos ──

const POST = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa'
const recap = (p: Partial<AvisoFila> = {}) => aviso({
  source: 'ht-grupales', created_at: '2026-10-29T13:04:31Z', title: 'Recap de la grupal listo para tu «va»',
  body: '🧠 Lo que vimos en la grupal: quedó como borrador en Anuncios. Si va, ábrelo y toca «Publicar»; hasta entonces nadie lo ve.',
  url: `https://arbrain.ai/community?post=${POST}`, ...p,
})

test('el recap trae «Publicar» de un toque y «Ver borrador» abre ESE post', () => {
  const f = presentar(recap())
  assert.equal(f.grupo, 'decidir')
  assert.deepEqual(f.acciones.map(a => a.tipo), ['publicar', 'abrir', 'visto'])
  assert.deepEqual(f.acciones[1], { tipo: 'abrir', etiqueta: 'Ver borrador', url: `https://arbrain.ai/community?post=${POST}` })
  // Sin el id del post en el enlace no hay toque posible: solo verlo.
  assert.ok(!presentar(recap({ url: 'https://arbrain.ai/community' })).acciones.some(a => a.tipo === 'publicar'))
})

test('el recap ya publicado se cierra en vivo y deja de contar (publicado en el feed antes de que corriera el cron)', () => {
  const abierto = armarBandeja([recap()], sinEstado, AHORA)
  assert.equal(abierto.pendientes, 1)
  const publicado = armarBandeja([recap()], sinEstado, AHORA, 20, new Set([POST]))
  assert.equal(publicado.pendientes, 0)
  assert.equal(publicado.cerrar[0]?.por, 'causa-resuelta')
})

test('la respuesta de la comunidad lleva al mensaje exacto de la persona', () => {
  const b = armarBandeja([comunidad('Mengano', TOK_A, '2026-10-29T13:00:00Z')],
    new Map([[TOK_A, { estado: 'pendiente', borrador: 'Hola Mengano', origen: 'https://arbrain.ai/ir/comentario/11111111-1111-4111-8111-111111111111' }]]), AHORA)
  assert.equal(b.decidir[0].origen, 'https://arbrain.ai/ir/comentario/11111111-1111-4111-8111-111111111111')
})

test('origenDeClave: post al post, comentario a su enlace profundo, lo demás a nada', async () => {
  const { origenDeClave } = await import('../../src/features/avisos/bandeja')
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(origenDeClave(`comunidad:post:${id}`, 'https://arbrain.ai/'), `https://arbrain.ai/community?post=${id}`)
  assert.equal(origenDeClave(`comunidad:comentario:${id}`, 'https://arbrain.ai'), `https://arbrain.ai/ir/comentario/${id}`)
  assert.equal(origenDeClave('entra:abc', 'https://arbrain.ai'), null)
})

// ── Quien revisa por el dueño (29 oct): sus respuestas de la comunidad, con los botones de su página, en SU campana ──

const REVISOR_TOK = 'rEvIsOrTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const delRevisor = (quien: string, p: Partial<AvisoFila> = {}) => aviso({
  source: 'ht-comunidad', created_at: '2026-10-29T12:55:00Z', url: `https://arbrain.ai/decidir/${REVISOR_TOK}`,
  title: `¿Publicas la respuesta de Levy a ${quien}?`,
  body: 'Zutano, gracias por el reporte. Lo reviso con el equipo y te escribo aquí mismo…',
  ...p,
})

test('la campana de quien revisa: «Te toca decidir» con Publícala, Ver borrador, Editar, Tengo duda y el mensaje exacto', () => {
  const origen = 'https://arbrain.ai/ir/comentario/dddddddd-3333-4ddd-8ddd-dddddddddddd'
  const b = armarBandeja([delRevisor('Zutano Gómez')],
    new Map([[REVISOR_TOK, { estado: 'pendiente', borrador: 'Zutano, gracias por el reporte.', origen }]]), AHORA)
  assert.equal(b.pendientes, 1, 'el número cuenta lo suyo')
  const v = b.decidir[0]
  assert.equal(v.titulo, 'Zutano Gómez en la comunidad')
  assert.equal(v.frase, '¿Publicas la respuesta de Levy?')
  assert.deepEqual(v.acciones.map(x => x.etiqueta), ['Publícala', 'Ver borrador', 'Editar', 'Tengo duda', 'Ver en arbrain.ai'])
  assert.deepEqual(v.acciones[2], { tipo: 'abrir', etiqueta: 'Editar', url: `https://arbrain.ai/decidir/${REVISOR_TOK}` })
  assert.deepEqual(v.acciones[4], { tipo: 'abrir', etiqueta: 'Ver en arbrain.ai', url: origen })
  // Ya respondida (por ella en su página, o rotada): se cierra sola.
  assert.equal(armarBandeja([delRevisor('Zutano Gómez')], new Map([[REVISOR_TOK, { estado: 'cerrada' }]]), AHORA).pendientes, 0)
})

test('«Tengo duda» envía el formulario r=duda de /decidir', () => {
  const pagina = `<form action=""><input type="hidden" name="$ACTION_ID_abc" value=""><input type="hidden" name="token" value="${REVISOR_TOK}"><input type="hidden" name="paso" value="decision"><input type="hidden" name="r" value="duda"><button>Tengo duda</button></form>`
  assert.equal(formularioDecision(pagina, 'duda')?.r, 'duda')
  assert.equal(formularioDecision(pagina, 'si'), null)
})
