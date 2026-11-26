// «Su embudo» en la ficha del canal (19 nov 2026): el resumen corto que pinta la tarjeta, sacado de embudos.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { competidorDe, conteoModelos, diaCorto, modelosDe, precioCorto, resumirEmbudo, urlSegura, type FichaEmbudoJson } from '../../src/features/contenido/embudo'

const ficha: FichaEmbudoJson = {
  slug: 'fulano', channel_id: 'UC' + '1'.repeat(22),
  destinos_video: [
    { rol: 'afiliado_o_patrocinio', nombre: 'Patrocinador', url: 'https://patrocinador.example/x', en_videos: 9, de_videos: 10 },
    { rol: 'comunidad_pago', nombre: 'Escuela Fulano', url: 'https://skool.com/escuela-fulano/about', en_videos: 3, de_videos: 10 },
    { rol: 'comunidad_gratis', nombre: 'Club Fulano', url: 'https://go.fulano.example/x', en_videos: 7, de_videos: 10 },
    { rol: 'comunidad', nombre: 'Discord de Mengano (no suyo)', url: 'https://discord.gg/x', en_videos: 5, de_videos: 10 },
    { rol: 'otro_video', nombre: null, url: 'https://youtube.com/watch?v=x', en_videos: 8, de_videos: 10 },
    { rol: 'web_propia', nombre: null, url: 'https://www.fulano-agencia.example/', en_videos: 2, de_videos: 10 },
    { rol: 'newsletter', nombre: 'Boletín', url: 'https://x.substack.com', en_videos: 1, de_videos: 10 },
  ],
  regalo_entrada: [{ nombre: 'Club Fulano (Skool gratis)', url: 'https://www.skool.com/club-fulano/about' }],
  oferta_pagada: [
    { nombre: 'Agencia Fulano', precio: null, url: 'https://fulano-agencia.example/' },
    { nombre: 'Escuela Fulano', precio: { monto: 50, moneda: 'USD', recurrencia: 'mensual', texto: '$50/mes' }, url: 'https://www.skool.com/escuela-fulano/about' },
  ],
  promesa: [{ cita: '  Tu primer cliente\n en 90 días. ' }],
  vehiculo: ['comunidad_gratis', 'comunidad_pago', 'agencia', 'agencia', 'algo_nuevo'],
  cobertura: { estado: 'completa' },
}

test('resume lo que vende (primero lo que tiene precio), el regalo, la promesa y el vehículo', () => {
  const e = resumirEmbudo(ficha, '2026-11-19', null)
  assert.equal(e.vende[0].nombre, 'Escuela Fulano')
  assert.equal(e.vende[0].precio, '50 USD/mes')
  assert.equal(e.vende[0].url, 'https://www.skool.com/escuela-fulano/about')
  assert.equal(e.vende[1].precio, null)
  assert.deepEqual(e.regalo, { nombre: 'Club Fulano (Skool gratis)', url: 'https://www.skool.com/club-fulano/about' })
  assert.equal(e.promesa, 'Tu primer cliente en 90 días.')
  assert.deepEqual(e.vehiculo, ['comunidad gratis', 'comunidad de pago', 'agencia', 'algo nuevo'])
  assert.equal(e.completa, true)
  assert.equal(e.cambio, null)
})

test('a dónde manda sus videos: máximo 3, por frecuencia, sin patrocinios, otros videos ni lo que no es suyo', () => {
  const e = resumirEmbudo(ficha, '2026-11-19')
  assert.deepEqual(e.destinos.map(d => [d.nombre, d.en, d.de]), [['Club Fulano', 7, 10], ['Escuela Fulano', 3, 10], ['fulano-agencia.example', 2, 10]])
})

test('«cambió el …» sale del estado semanal; lo que falta queda vacío, no inventado', () => {
  const e = resumirEmbudo({ slug: 'x', channel_id: 'UC' + 'a'.repeat(22) }, '2026-11-19', { canales: { x: { ultimo_cambio: '2026-11-22' } } })
  assert.equal(e.cambio, '2026-11-22')
  assert.deepEqual([e.vende, e.regalo, e.destinos, e.promesa, e.vehiculo], [[], null, [], null, []])
  assert.equal(resumirEmbudo({ slug: 'x', channel_id: 'UC' }, 'c', { canales: { x: { ultimo_cambio: 'ayer' } } }).cambio, null)
})

test('solo enlaces web; precios y fechas cortos', () => {
  assert.equal(urlSegura('javascript:alert(1)'), null)
  assert.equal(urlSegura('mailto:a@b.c'), null)
  assert.equal(urlSegura('/ruta'), null)
  assert.equal(urlSegura('https://a.com/x'), 'https://a.com/x')
  assert.equal(precioCorto({ monto: 1500, moneda: 'EUR', recurrencia: 'pago_unico' }), '1,500 EUR pago único')
  assert.equal(precioCorto({ monto: null, texto: 'a petición' }), null)
  assert.equal(diaCorto('2026-11-19'), '19 nov')
  assert.equal(diaCorto(null), '')
})

test('el embudos.json real: cada ficha se resume y toda oferta con página trae su botón', () => {
  const p = path.join(__dirname, '../../../contenido/youtube/intel/embudos/embudos.json')
  let emb: { corte: string; fichas: FichaEmbudoJson[] }
  try { emb = JSON.parse(readFileSync(p, 'utf8')) } catch { return } // checkout sin la carpeta de contenido
  const res = emb.fichas.map(f => resumirEmbudo(f, emb.corte))
  assert.equal(res.length, emb.fichas.length)
  emb.fichas.forEach((f, i) => {
    if ((f.oferta_pagada ?? []).some(o => urlSegura(o.url))) assert.ok(res[i].vende.some(v => v.url), `${f.slug}: oferta con página`)
  })
})

test('Competidores: el modelo de negocio sale del vehículo, los destinos y el precio', () => {
  // Fulano: comunidad gratis y de pago, agencia; un patrocinador en 9 videos = patrocinio.
  assert.deepEqual(modelosDe(ficha), ['comunidad_pago', 'comunidad_gratis', 'agencia', 'patrocinio'])
  // Un patrocinio en un solo video no es su modelo; un pago único de cuatro cifras es alto ticket.
  const f: FichaEmbudoJson = { slug: 'a', channel_id: 'UC', vehiculo: ['curso_pago_unico'],
    destinos_video: [{ rol: 'afiliado_o_patrocinio', url: 'https://x.com', en_videos: 1, de_videos: 10 }],
    oferta_pagada: [{ nombre: 'Programa Zutano', precio: { monto: 1500, moneda: 'EUR', recurrencia: 'pago_unico' } }] }
  assert.deepEqual(modelosDe(f), ['alto_ticket', 'curso'])
  const c = competidorDe({ ...f, nombre: 'Zutano', idioma: 'en' }, '2026-11-19')
  assert.deepEqual([c.nombre, c.oferta, c.precio, c.idioma], ['Zutano', 'Programa Zutano', '1,500 EUR pago único', 'en'])
  const n = conteoModelos([c, competidorDe({ ...ficha, nombre: 'Fulano', idioma: 'en' }, 'x')])
  assert.equal(n[0].canales >= n[n.length - 1].canales, true)
  assert.equal(n.find(x => x.id === 'alto_ticket')?.canales, 1)
})

test('Competidores sobre el embudos.json real: todos los canales clasificados, ninguno sin modelo', () => {
  const p = path.join(__dirname, '../../../contenido/youtube/intel/embudos/embudos.json')
  let emb: { corte: string; fichas: (FichaEmbudoJson & { nombre: string; idioma: string })[] }
  try { emb = JSON.parse(readFileSync(p, 'utf8')) } catch { return }
  const cs = emb.fichas.map(f => competidorDe(f, emb.corte))
  assert.deepEqual(cs.filter(c => !c.modelos.length).map(c => c.slug), [])
  assert.ok(conteoModelos(cs).length >= 5)
})
