import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { LecturaFuente } from '../../src/features/canvas/islas/fuentes'
import { ORGANOS, type Pulso } from '../../src/features/negocio/pulso'
import { fuentesDeOrgano, islaDeReceta, partirCifra, porcentaje, RECETA_ORGANO, unirCifra, urlReceta, vivoDe } from '../../src/features/negocio/pulso-vivo'

// Tu negocio › El pulso con alma (15 nov 2026): cada órgano se lee con la cuenta del cartel del mapa v16 sobre la receta
// de su isla. Las recetas reales viven en docs/builds/mapa-v16/islas/<organo>/receta.json.

const RAIZ = resolve(import.meta.dirname, '../../..')
const ok = (valor: unknown): LecturaFuente => ({ estado: 'ok', valor, fecha: '2026-11-15T12:00:00Z' })
const receta = (o: (typeof ORGANOS)[number]) => {
  const ruta = join(RAIZ, RECETA_ORGANO[o])
  return existsSync(ruta) ? { ok: true, hash: 'x', receta: JSON.parse(readFileSync(ruta, 'utf8')) } : null
}
const numero = (organo: Pulso['organo'], cifra: string, unidad = ''): Pulso => ({ organo, estado: 'numero', cifra, unidad, fuente: 'prueba', detalle: ['un detalle'] })

test('pulso vivo · cada órgano tiene la receta de su isla y la URL de la ruta que relee el lienzo', () => {
  for (const o of ORGANOS) {
    assert.equal(RECETA_ORGANO[o], `docs/builds/mapa-v16/islas/${o}/receta.json`)
    assert.ok(urlReceta(o).startsWith('/api/canvas/receta?liga=doc%3Adocs%2Fbuilds%2Fmapa-v16%2Fislas%2F'))
    const r = receta(o)
    if (!r) continue // la copia del alumno no trae el mapa v16
    const isla = islaDeReceta(o, r)
    assert.equal(isla.receta.organo, o, o)
    assert.ok(isla.bloques.length > 1, `${o}: la receta real trae sus bloques`)
  }
})

test('pulso vivo · sin receta (o con la de otro órgano) el órgano sigue vivo con su número y su hueco de meta', () => {
  const sin = islaDeReceta('venta', null)
  assert.equal(sin.bloques.length, 0)
  const otra = receta('finanzas')
  if (otra) assert.equal(islaDeReceta('venta', otra).bloques.length, 0, 'una receta ajena no se toma')
  const d = vivoDe(numero('venta', '8', 'por Polar · transferencias aparte'), sin, () => undefined)
  assert.equal(d.forma, 'organo')
  assert.equal(d.cifra, '8')
  assert.equal(d.unidad, 'por Polar · transferencias aparte', 'Venta conserva su etiqueta honesta')
  assert.equal(d.acento, 'esmeralda')
  assert.equal(d.estado, 'calma')
  assert.equal(d.meta, null)
  assert.equal(d.decisiones, 0)
})

test('pulso vivo · Finanzas: la barra lee el MRR recurrente (serie mrr del BI); las cuotas del Acompañamiento van aparte, nunca en la barra', (t) => {
  const r = receta('finanzas')
  if (!r) return t.skip('sin mapa v16 en esta copia')
  const isla = islaDeReceta('finanzas', r)
  assert.deepEqual(fuentesDeOrgano('finanzas', isla).sort(), ['bandeja:finanzas', 'bi:mrr', 'polar:mrr'])
  const fuentes: Record<string, LecturaFuente> = {
    'bi:mrr': ok({ ultimo: 500, cifra: '$500 USD', nombre: 'La serie', usd: true, mejor: 'arriba', puntos: [400, 420, 450, 470, 490, 500], senal: null, fecha: '2026-11-14' }),
    'polar:mrr': ok({ recurrente: { centavos: 50000, cifra: '$500 USD', vivas: 3 }, cuotas: { centavos: 20000, n: 2, fin: null, texto: '+ $200 USD/mes en cuotas del Acompañamiento (no recurrente)' } }),
    'bandeja:finanzas': ok({ organo: 'finanzas', pendientes: 2, titulos: ['a', 'b'] }),
  }
  const d = vivoDe(numero('finanzas', '$900 MXN', 'entró en 30 días'), isla, f => fuentes[f])
  assert.equal(d.cifra, '$900 MXN', 'el número es el del pulso, el mismo que pinta el panel')
  assert.equal(d.acento, 'oro')
  assert.equal(d.meta?.valor, 100000)
  assert.equal(d.meta?.texto, '$100K USD')
  assert.ok(Math.abs((d.meta?.fraccion ?? 0) - 0.005) < 1e-9, 'la barra: solo lo recurrente (las cuotas no suman)')
  assert.equal(porcentaje(d.meta!.fraccion!), '0.5 %')
  assert.equal(porcentaje(0.42), '42 %')
  assert.equal(d.decisiones, 2)
  assert.equal(d.serie.length, 6, 'la curva es la misma serie que la barra')
  assert.equal(d.realidad, 'La serie: $500 USD el 14 nov', 'la realidad es el último día de la serie')
  assert.equal(d.aparte, '+ $200 USD/mes en cuotas del Acompañamiento (no recurrente)')
  assert.equal(d.estado, 'calma')
})

test('pulso vivo · Marketing: su serie del BI dibuja la curva; sin meta escrita, hueco (nunca una inventada); duele si el BI lo dice', (t) => {
  const r = receta('marketing')
  if (!r) return t.skip('sin mapa v16 en esta copia')
  const isla = islaDeReceta('marketing', r)
  assert.ok(fuentesDeOrgano('marketing', isla).includes('bi:vistas-canal'))
  const serie = ok({ ultimo: 1037, cifra: '1,037', nombre: 'Vistas del canal', usd: false, mejor: 'arriba', puntos: [900, 1200, 1100, 980, 1037], senal: { tono: 'dolor' }, frase: 'Bajo su corredor.', fecha: '2026-11-11' })
  const d = vivoDe(numero('marketing', '7,134', 'vistas en 7 días'), isla, f => (f === 'bi:vistas-canal' ? serie : undefined))
  assert.equal(d.meta, null)
  assert.equal(d.estado, 'duele')
  assert.equal(d.porque, 'Bajo su corredor.')
  assert.equal(d.serieNombre, 'Vistas del canal')
  assert.match(d.realidad ?? '', /1,037 el 11 nov/)
})

test('pulso vivo · Entrega lee su realidad de la cohorte (la Semana 1), no de su pulso', (t) => {
  const r = receta('entrega')
  if (!r) return t.skip('sin mapa v16 en esta copia')
  const isla = islaDeReceta('entrega', r)
  assert.ok(fuentesDeOrgano('entrega', isla).includes('cohorte:resumen'))
  const d = vivoDe(numero('entrega', '6', 'cerebros conectados'), isla, f => (f === 'cohorte:resumen' ? ok({ semana1: { completos: 13, total: 14 } }) : undefined))
  assert.match(d.realidad ?? '', /^13 de 14 fundadores con la Semana 1 completa/)
})

test('pulso vivo · un pulso sin número no inventa estado: sin sensor, oculto o leyendo', () => {
  const sin = islaDeReceta('sistemas', null)
  assert.equal(vivoDe({ organo: 'sistemas', estado: 'sin-sensor', fuente: 'x', falta: 'Rutinas activas' }, sin, () => undefined).estado, 'sin-sensor')
  assert.equal(vivoDe({ organo: 'venta', estado: 'oculto', fuente: 'x' }, islaDeReceta('venta', null), () => undefined).estado, 'oculto')
  assert.equal(vivoDe({ organo: 'venta', estado: 'leyendo', fuente: 'x' }, islaDeReceta('venta', null), () => undefined).estado, 'leyendo')
})

test('pulso vivo · la cifra se parte para contarla y vuelve con su mismo formato', () => {
  const c = partirCifra('#12,345 vistas')!
  assert.deepEqual(c, { antes: '#', n: 12345, decimales: 0, agrupa: true, despues: ' vistas' })
  assert.equal(unirCifra(c, 12345), '#12,345 vistas')
  assert.equal(unirCifra(c, 1200.4), '#1,200 vistas')
  assert.equal(unirCifra(partirCifra('$900 MXN')!, 450), '$450 MXN')
  const s = partirCifra('2024 rutinas')!
  assert.equal(unirCifra(s, 2024), '2024 rutinas', 'sin comas en la fuente, sin comas al contar')
  assert.equal(unirCifra(partirCifra('7.9 %')!, 7.9), '7.9 %')
  assert.equal(partirCifra('sin dato'), null)
})
