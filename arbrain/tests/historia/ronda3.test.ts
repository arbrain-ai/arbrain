// «La historia de tu cerebro», ronda 3 (27 oct 2026): lo automático plegado en una fila, «Lo importante de hoy» y
// frases completas sin cortar a media palabra. Contrato: docs/builds/harness-noche-2026-10-27/nodos/historia.md.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agruparAutomaticos, esAutomatico, eventoDe, fraseCorta, loImportante, motivoImportante, type Evento } from '../../src/features/historia/modelo'

const IA = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const ahora = Date.parse('2026-10-27T21:00:00-06:00')
let n = 0
const ev = (o: Partial<Evento> & { cuando: string }, areas: [Evento['areas'][number]['area'], number][] = [['producto', 1]]): Evento => ({
  sha: `s${n++}`, corto: 'x', tipo: 'cambio', quien: 'levy', quienNombre: 'Levy', frase: 'Algo', corre: 'al-instante',
  areas: areas.map(([area, archivos]) => ({ area, archivos, mas: 1, menos: 0 })), total: { archivos: areas.reduce((s, a) => s + a[1], 0), mas: 1, menos: 0 }, ...o,
})

test('automáticos: rutinas, sincronías y puestas al día se pliegan en una sola fila, en el lugar del primero', () => {
  const yo = { autor: 'Autora Ejemplo', correo: 'd@example.com', sha: 'a', padres: ['p'], fecha: '2026-10-27T10:00:00-06:00', archivos: [] }
  assert.ok(esAutomatico(eventoDe({ ...yo, mensaje: 'auto(tareas-espejo): 1 file(s) updated' })))
  assert.ok(esAutomatico(eventoDe({ ...yo, padres: ['p', 'q'], mensaje: "Merge remote-tracking branch 'origin/main'" })))
  assert.ok(!esAutomatico(eventoDe({ ...yo, mensaje: `Memoria: regla nueva\n\n${IA}` })))
  const xs = [
    ev({ cuando: '2026-10-27T20:00:00-06:00', frase: 'Uno' }),
    ev({ cuando: '2026-10-27T19:00:00-06:00', quien: 'rutina', frase: 'Se puso al día sola' }),
    ev({ cuando: '2026-10-27T18:00:00-06:00', tipo: 'sincroniza', frase: 'Se puso al día con la copia en GitHub' }),
    ev({ cuando: '2026-10-27T17:00:00-06:00', frase: 'Dos' }),
    ev({ cuando: '2026-10-27T16:00:00-06:00', quien: 'rutina', frase: 'Otra rutina' }),
  ]
  const filas = agruparAutomaticos(xs)
  assert.deepEqual(filas.map(f => f.tipo), ['evento', 'automaticos', 'evento'])
  const auto = filas[1]
  assert.ok(auto.tipo === 'automaticos' && auto.eventos.length === 3, 'una fila con los 3 automáticos')
  // Uno solo no se pliega.
  assert.deepEqual(agruparAutomaticos(xs.slice(0, 3).filter((_, i) => i !== 2)).map(f => f.tipo), ['evento', 'evento'])
  assert.deepEqual(agruparAutomaticos([]), [])
})

test('lo importante: trabajos incorporados, memorias, skills y entregables primero; nada automático; de 3 a 5, lo nuevo arriba', () => {
  const xs = [
    ev({ cuando: '2026-10-27T20:50:00-06:00', frase: 'Arreglo de un botón' }),
    ev({ cuando: '2026-10-27T20:40:00-06:00', quien: 'rutina', frase: 'Llegaron 15 archivos de memoria' }, [['memoria', 15]]),
    ev({ cuando: '2026-10-27T20:30:00-06:00', frase: 'Regla nueva de mensajes' }, [['memoria', 1]]),
    ev({ cuando: '2026-10-27T20:20:00-06:00', tipo: 'junta', frase: 'Se incorporó «Historia»' }, [['producto', 9]]),
    ev({ cuando: '2026-10-27T20:10:00-06:00', frase: 'Skill de clientes' }, [['skills', 2]]),
    ev({ cuando: '2026-10-27T20:00:00-06:00', sha: 'doc', frase: 'Reporte de la noche' }, [['contenido', 1]]),
    ev({ cuando: '2026-10-27T19:00:00-06:00', tipo: 'sincroniza', frase: 'Se puso al día con la copia en GitHub' }),
    ev({ cuando: '2026-10-27T18:00:00-06:00', frase: 'Otro arreglo' }),
    ev({ cuando: '2026-10-26T18:00:00-06:00', frase: 'Memoria de ayer' }, [['memoria', 1]]),
  ]
  const r = loImportante(xs, ahora, { entregables: new Set(['doc']) })
  assert.deepEqual(r.map(x => x.e.frase), ['Regla nueva de mensajes', 'Se incorporó «Historia»', 'Skill de clientes', 'Reporte de la noche'])
  assert.deepEqual(r.map(x => x.motivo), ['memoria', 'trabajo', 'skill', 'entregable'])
  assert.ok(r.every(x => !esAutomatico(x.e)), 'lo automático nunca sube')
  // Con pocos fuertes, el producto rellena hasta 3 (el más nuevo primero).
  const pocos = loImportante([xs[0], xs[2], xs[7], xs[6]], ahora)
  assert.deepEqual(pocos.map(x => x.e.frase), ['Arreglo de un botón', 'Regla nueva de mensajes', 'Otro arreglo'])
  // Nunca más de 5.
  const muchos = Array.from({ length: 9 }, (_, i) => ev({ cuando: `2026-10-27T1${i}:00:00-06:00`, frase: `M${i}` }, [['memoria', 1]]))
  assert.equal(loImportante(muchos, ahora).length, 5)
  assert.deepEqual(loImportante([xs[8]], ahora), [], 'lo de ayer no es «de hoy»')
  assert.equal(motivoImportante(ev({ cuando: xs[0].cuando, tipo: 'volver', frase: 'Volvió' })), 'regreso')
})

test('frase corta: completa, sin cortar a media palabra ni puntos suspensivos', () => {
  assert.equal(fraseCorta('Una frase corta'), 'Una frase corta')
  const larga = 'Se incorporó «La historia de tu cerebro» a tu cerebro principal: la marca de la última hora del mapa no se encima con «ahora»'
  assert.equal(fraseCorta(larga), 'Se incorporó «La historia de tu cerebro» a tu cerebro principal')
  assert.equal(fraseCorta('Protección contra desfase de versiones en el cliente web (recarga sola cuando el servidor cambia de compilación)'), 'Protección contra desfase de versiones en el cliente web')
  // Sin dónde partir: va entera (la fila la deja en dos líneas).
  const sin = 'Ganchos en Windows de punta a punta con captura de pantalla y verificación desde la computadora del alumno'
  assert.equal(fraseCorta(sin), sin)
  for (const f of [larga, sin]) assert.ok(!fraseCorta(f).endsWith('…'))
})

test('lo importante: variedad, una memoria y una skill no quedan fuera por muchos entregables', () => {
  const docs = Array.from({ length: 4 }, (_, i) => ev({ cuando: `2026-10-27T2${i}:00:00-06:00`, sha: `d${i}`, frase: `Doc ${i}` }, [['contenido', 1]]))
  const juntas = Array.from({ length: 3 }, (_, i) => ev({ cuando: `2026-10-27T1${i}:30:00-06:00`, tipo: 'junta', frase: `Junta ${i}` }))
  const mem = ev({ cuando: '2026-10-27T08:00:00-06:00', frase: 'Regla' }, [['memoria', 1]])
  const sk = ev({ cuando: '2026-10-27T07:00:00-06:00', frase: 'Skill' }, [['skills', 1]])
  const r = loImportante([...docs, ...juntas, mem, sk], ahora, { entregables: new Set(docs.map(d => d.sha)) })
  assert.equal(r.length, 5)
  assert.deepEqual(new Set(r.map(x => x.motivo)), new Set(['entregable', 'trabajo', 'memoria', 'skill']))
})

test('frase corta: no deja paréntesis ni comillas abiertas', () => {
  const f = 'BETA-LISTA (VPS elegido, aprovisionamiento probado y la lista de espera con correo de bienvenida lista para enviarse)'
  assert.equal(fraseCorta(f), f)
  assert.ok(!/\([^)]*$/.test(fraseCorta('Se incorporó «Uno, dos y tres» a tu cerebro principal con todo lo que trajo de la noche anterior y más')))
})
