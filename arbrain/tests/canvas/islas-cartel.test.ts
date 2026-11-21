import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { ESQUEMA_RECETA, leerReceta } from '../../src/features/canvas/islas/receta'
import { prepararIsla } from '../../src/features/canvas/islas/modelo'
import { datosDelCartel, formaCartel, fuentesDelCartel, diaCorto, type DatosCartelOrgano } from '../../src/features/canvas/islas/bloques/cartel'
import { leerFuente, semana1De, pendienteDe, type LecturaFuente, type UrlsApp } from '../../src/features/canvas/islas/fuentes'
import { pulsoMarketing } from '../../src/features/negocio/pulso'
import { organoDeTarjeta } from '../../src/features/decisiones/lib/bandeja'

// Mapa v16 · pulido (14 nov 2026): el cartel de lejos, las fuentes que lo alimentan y la bandeja por órgano.

const ok = (valor: unknown): LecturaFuente => ({ estado: 'ok', valor, fecha: '2026-11-14T15:00:00Z' })
const organo = (o: string, extra: Record<string, unknown>[] = [], receta: Record<string, unknown> = {}) => prepararIsla({
  esquema: ESQUEMA_RECETA, id: o, titulo: o, organo: o, ...receta,
  bloques: [{ tipo: 'organo-vivo', organo: o, en: [0, 0, 12, 8] }, ...extra],
})

test('cartel · un órgano tiene cartel de órgano; Mi norte, NOVA; el timonel, el suyo; lo demás solo si la receta lo pide', () => {
  const m = organo('marketing'); assert.ok(m.ok)
  if (m.ok) assert.equal(formaCartel(m.isla), 'organo')
  const n = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'norte', titulo: 'Mi norte', bloques: [{ tipo: 'estrella', anillos: [] }] })
  if (n.ok) assert.equal(formaCartel(n.isla), 'nova')
  const t = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'timonel', titulo: 'El timonel', bloques: [{ tipo: 'timonel' }] })
  if (t.ok) assert.equal(formaCartel(t.isla), 'timonel')
  const o = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'oferta', titulo: 'La oferta', bloques: [{ tipo: 'encabezado', titulo: 'La oferta' }] })
  if (o.ok) assert.equal(formaCartel(o.isla), null, 'sin «lejos» un capítulo encoge sus bloques')
  const c = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'oferta', titulo: 'La oferta', lejos: { forma: 'capitulo', icono: 'escalera' }, bloques: [{ tipo: 'encabezado', titulo: 'La oferta' }] })
  if (c.ok) assert.equal(formaCartel(c.isla), 'capitulo')
  const apagado = organo('venta', [], { lejos: { forma: 'ninguna' } })
  if (apagado.ok) assert.equal(formaCartel(apagado.isla), null)
})

test('cartel · «lejos» se valida en palabras y lo que no existe no rompe la receta', () => {
  const l = leerReceta({ esquema: ESQUEMA_RECETA, id: 'x', titulo: 'X', lejos: { icono: 'cohete', acento: 'rojo', forma: 'organo', cifra: { fuente: 'bi:mrr', campo: 'cifra' } }, bloques: [{ tipo: 'texto', texto: 'x' }] })
  assert.ok(l.ok)
  if (!l.ok) return
  assert.deepEqual(l.receta.lejos, { forma: 'organo', cifra: { fuente: 'bi:mrr', campo: 'cifra' } })
  assert.ok(l.errores.some(e => /lejos\.icono/.test(e)) && l.errores.some(e => /lejos\.acento/.test(e)))
})

test('cartel · el host pide el pulso y la bandeja del órgano (y la cifra que pida «lejos»)', () => {
  const m = organo('finanzas', [], { lejos: { cifra: { fuente: 'bi:mrr' } } })
  assert.ok(m.ok)
  if (!m.ok) return
  assert.deepEqual(fuentesDelCartel(m.isla).sort(), ['bandeja:finanzas', 'bi:mrr', 'pulso:finanzas'])
  for (const f of ['bandeja:finanzas', 'pulso:finanzas', 'bi:mrr']) assert.ok(m.isla.fuentes.includes(f), f)
})

test('cartel · Finanzas: número del pulso, meta firmada contra la serie del BI, en calma y su decisión', () => {
  const m = organo('finanzas', [{ tipo: 'meta-error', serie: { consulta: 'mrr' }, meta: { valor: 100000, unidad: 'USD', texto: 'Meta finita', fuente: 'RETRATO.md' } }])
  assert.ok(m.ok)
  if (!m.ok) return
  const fuentes: Record<string, LecturaFuente> = {
    'pulso:finanzas': ok({ estado: 'numero', cifra: '$900 MXN', unidad: 'entró en 30 días', detalle: ['Salió $300 MXN'] }),
    'bi:mrr': ok({ ultimo: 790, cifra: '$790', nombre: 'Serie', usd: true, mejor: 'arriba', puntos: [780, 782, 784, 786, 788, 790], senal: null, fecha: '2026-11-13' }),
    'bandeja:finanzas': ok({ organo: 'finanzas', pendientes: 1, titulos: ['Recargar'] }),
  }
  const d = datosDelCartel(m.isla, f => fuentes[f]) as DatosCartelOrgano
  assert.equal(d.forma, 'organo')
  assert.equal(d.cifra, '$900 MXN')
  assert.equal(d.estado, 'calma')
  assert.equal(d.meta?.texto, '$100K USD')
  assert.ok(d.meta?.fraccion && Math.abs(d.meta.fraccion - 0.0079) < 1e-9)
  assert.equal(d.decisiones, 1)
  assert.equal(d.acento, 'oro'); assert.equal(d.icono, 'cartera')
  assert.equal(d.serie.length, 6)
})

test('cartel · sin meta escrita: hueco (nunca una meta inventada), con la realidad y su día', () => {
  const m = organo('marketing', [{ tipo: 'meta-error', serie: { consulta: 'vistas-canal' } }])
  assert.ok(m.ok)
  if (!m.ok) return
  const d = datosDelCartel(m.isla, f => (f === 'bi:vistas-canal' ? ok({ ultimo: 1037, cifra: '1,037', nombre: 'Vistas de tu canal', puntos: [], fecha: '2026-11-11' }) : f === 'pulso:marketing' ? ok({ cifra: '7,134', unidad: 'vistas en 7 días' }) : undefined)) as DatosCartelOrgano
  assert.equal(d.meta, null)
  assert.equal(d.realidad, 'Vistas de tu canal: 1,037 el 11 nov')
  assert.equal(d.cifra, '7,134')
  assert.equal(diaCorto('2026-01-05'), '5 ene')
})

test('cartel · duele por la misma razón que de cerca: la señal del BI o el error que crece', () => {
  const m = organo('venta', [{ tipo: 'meta-error', serie: { consulta: 'altas' }, meta: { valor: 50, texto: 'x', fuente: 'y' } }])
  assert.ok(m.ok)
  if (!m.ok) return
  const pulso = ok({ cifra: '8' })
  const cae = datosDelCartel(m.isla, f => (f === 'pulso:venta' ? pulso : f === 'bi:altas' ? ok({ ultimo: 2, puntos: [9, 8, 7, 5, 4, 3, 2], mejor: 'arriba', senal: null }) : undefined)) as DatosCartelOrgano
  assert.equal(cae.estado, 'duele'); assert.equal(cae.porque, 'el error crece')
  const senal = datosDelCartel(m.isla, f => (f === 'pulso:venta' ? pulso : f === 'bi:altas' ? ok({ ultimo: 9, puntos: [1, 2, 3, 4, 5, 6, 9], mejor: 'arriba', senal: { tono: 'dolor' }, frase: 'Se fueron más' }) : undefined)) as DatosCartelOrgano
  assert.equal(senal.estado, 'duele')
  const sin = datosDelCartel(m.isla, f => (f === 'pulso:venta' ? { estado: 'sin-dato', valor: { falta: 'Polar no respondió.' }, fecha: null } : undefined)) as DatosCartelOrgano
  assert.equal(sin.estado, 'sin-sensor'); assert.equal(sin.cifra, null); assert.equal(sin.porque, 'Polar no respondió.')
  assert.equal(pendienteDe([1, 2]), null, 'con poca historia no hay tendencia')
})

test('cartel · la realidad que no vive en el BI: la Semana 1 de la cohorte', () => {
  const m = organo('entrega', [{ tipo: 'meta-error', realidad: { fuente: 'cohorte:resumen', campo: 'semana1.completos', total: 'semana1.total', etiqueta: 'fundadores con la Semana 1 completa' } }])
  assert.ok(m.ok)
  if (!m.ok) return
  const d = datosDelCartel(m.isla, f => (f === 'cohorte:resumen' ? ok({ semana1: { completos: 13, total: 14 } }) : f === 'pulso:entrega' ? ok({ cifra: '6' }) : undefined)) as DatosCartelOrgano
  assert.equal(d.realidad, '13 de 14 fundadores con la Semana 1 completa')
  const casilla = (marcada: boolean) => ({ numero: 1, marcada })
  assert.deepEqual(semana1De({ fundadores: [
    { cerebro: 1, atorado: null, casillas: [casilla(true), casilla(true)] },
    { cerebro: null, atorado: null, casillas: [casilla(true), casilla(false)] },
    { cerebro: null, atorado: null, casillas: null },
  ] }), { completos: 1, total: 3, marcadas: 3, casillas: 4 })
  assert.equal(semana1De({ fundadores: [{ cerebro: null, atorado: null }] }), null, 'sin casillas legibles: sin dato, no «ninguna»')
})

test('cartel · NOVA y el timonel salen de su receta y del embudo', () => {
  const n = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'norte', titulo: 'Mi norte', bloques: [{ tipo: 'estrella', nucleo: { rotulo: 'porqué · para qué', frase: '«Automatizar\nla economía\nen español»' },
    anillos: [{ id: 'juego', nombre: 'mi juego infinito', inicial: '∞', tono: 'oro' }, { id: 'nicho', nombre: 'nicho', inicial: 'N' }] }] })
  assert.ok(n.ok)
  if (n.ok) {
    const d = datosDelCartel(n.isla, () => undefined)
    assert.ok(d && d.forma === 'nova')
    if (d && d.forma === 'nova') { assert.equal(d.nucleo, 'Automatizar la economía en español'); assert.deepEqual(d.anillos.map(a => a.inicial), ['∞', 'N']); assert.equal(d.anillos[0].oro, true) }
  }
  const t = prepararIsla({ esquema: ESQUEMA_RECETA, id: 'timonel', titulo: 'El timonel', bloques: [{ tipo: 'timonel' }] })
  assert.ok(t.ok)
  if (t.ok) {
    const emb = ok({ embudos: [{ id: 'trafico', nombre: 'Tráfico propio' }], etapas: [{ nombre: 'Convertir vistas en contactos tuyos', embudo: 'trafico', cuello: { es: true }, mide: { nombre: 'Contactos nuevos por semana', hay_numero: false } }] })
    const d = datosDelCartel(t.isla, f => (f === 'embudo' ? emb : undefined))
    assert.ok(d && d.forma === 'timonel')
    if (d && d.forma === 'timonel') { assert.equal(d.correccion, 'Empujar «Convertir vistas en contactos tuyos»'); assert.equal(d.numero, null); assert.equal(d.embudo, 'Tráfico propio') }
  }
})

const URLS: UrlsApp = { cohorte: '/c', finanzas: '/f', rutinas: '/r', trabajos: '/t', marketing: '/m', comprador: '/co', embudo: '/e', marcador: '/ml', bi: '/api/bi', bandeja: '/api/decisiones', mrr: '/api/negocio/mrr' }
const CTX = { directo: false, cliente: false }

test('fuentes · bi:<consulta> lee el catálogo y la serie como el panel: último día, cifra, puntos y señal', async () => {
  const catalogo = [{ id: 'mrr', nombre: 'MRR', que: '', familia: 'metricas', fuente: 'Polar', tipo: 'linea', tipos: ['linea'], unidad: 'usd', mejor: 'arriba', alarma: true, ventanas: [7, 30, 90] }]
  const puntos = Array.from({ length: 20 }, (_, i) => ({ fecha: `2026-10-${String(i + 10).padStart(2, '0')}`, valor: i === 5 ? null : 7800 + i }))
  const pedidas: string[] = []
  const l = await leerFuente('bi:mrr', URLS, CTX, async url => {
    pedidas.push(url)
    return url === '/api/bi' ? { data: { activo: true, catalogo } } : { data: { ok: true, consulta: 'mrr', ventana: 30, hasta: '2026-10-29', datos: { forma: 'serie', puntos } } }
  })
  assert.deepEqual(pedidas.sort(), ['/api/bi', '/api/bi/consulta?id=mrr&ventana=30'])
  assert.equal(l.estado, 'ok')
  const v = l.valor as { ultimo: number; puntos: number[]; usd: boolean; fecha: string; cifra: string }
  assert.equal(v.ultimo, 7819); assert.equal(v.puntos.length, 19, 'el día sin dato se salta, nunca es 0'); assert.equal(v.usd, true); assert.equal(v.fecha, '2026-10-29')
  assert.match(v.cifra, /7,819/)
  const desconocida = await leerFuente('bi:no-existe', URLS, CTX, async url => (url === '/api/bi' ? { data: { activo: true, catalogo } } : { data: { ok: true, datos: { forma: 'serie', puntos: [] } } }))
  assert.equal(desconocida.estado, 'error')
  const cliente = await leerFuente('bi:mrr', URLS, { directo: false, cliente: true }, async () => { throw new Error('no debía pedir') })
  assert.equal(cliente.estado, 'sin-dato')
})

test('fuentes · bandeja:<organo> cuenta las tarjetas que DECLARAN ese órgano (o su categoría), nunca por palabras', async () => {
  const pendientes = [
    { titulo: 'Recargar OpenRouter', categoria: 'pagar' },
    { titulo: 'Publicar el video', categoria: 'publicar' },
    { titulo: 'Mandarle a Juan el aviso de pago', categoria: 'enviar', organo: 'venta' },
    { titulo: 'Un video sobre finanzas', categoria: 'otra' },
  ]
  const leer = async () => ({ data: { pendientes } })
  const fin = await leerFuente('bandeja:finanzas', URLS, CTX, leer)
  assert.deepEqual(fin.valor, { organo: 'finanzas', pendientes: 1, titulos: ['Recargar OpenRouter'] })
  assert.equal(((await leerFuente('bandeja:marketing', URLS, CTX, leer)).valor as { pendientes: number }).pendientes, 1)
  assert.equal(((await leerFuente('bandeja:venta', URLS, CTX, leer)).valor as { pendientes: number }).pendientes, 1)
  assert.equal(((await leerFuente('bandeja:sistemas', URLS, CTX, leer)).valor as { pendientes: number }).pendientes, 0)
  assert.equal(organoDeTarjeta({ categoria: 'publicar', organo: 'venta' }), 'venta', 'lo declarado manda sobre la categoría')
  assert.equal(organoDeTarjeta({ categoria: 'borrar' }), undefined)
  assert.equal((await leerFuente('bandeja:otro', URLS, CTX, leer)).estado, 'desconocida')
})

test('pulso · Marketing ya no dice «sin dato»: las vistas de la semana del canal principal con sus suscriptores', () => {
  const p = pulsoMarketing({ data: { activo: true, generado: '2026-11-14T12:20:28Z', canales: [{ clave: 'principal', nombre: 'Canal', estado: 'numero', cifras: [
    { id: 'subs', etiqueta: 'Suscriptores nuevos', valor: '83', nota: 'perdió 22: neto +61', fuente: 'YouTube' },
    { id: 'vistas', etiqueta: 'Vistas', valor: '7,134', cambio: '+3 % contra la semana anterior', desde: '2026-11-05', hasta: '2026-11-11', fuente: 'YouTube' },
  ] }] } })
  assert.equal(p.estado, 'numero')
  assert.equal(p.cifra, '7,134')
  assert.match(p.unidad!, /vistas en 7 días · 5 nov – 11 nov/)
  assert.deepEqual(p.detalle, ['83 suscriptores nuevos (perdió 22: neto +61)', '+3 % contra la semana anterior'])
})

test('recetas del mapa · cada órgano declara su órgano y sus decisiones no usan palabras', () => {
  for (const o of ['marketing', 'venta', 'entrega', 'finanzas', 'comprador', 'sistemas']) {
    const r = JSON.parse(readFileSync(new URL(`../../../docs/builds/mapa-v16/islas/${o}/receta.json`, import.meta.url), 'utf8'))
    assert.equal(r.organo, o, o)
    for (const b of r.bloques.filter((x: { tipo: string }) => x.tipo === 'decision')) { assert.equal(b.organo, o); assert.equal(b.palabras, undefined); assert.equal(b.categorias, undefined) }
    // Solo Finanzas tiene meta (la firmada: 100K USD al mes); los demás, hueco.
    const metas = r.bloques.filter((x: { tipo: string; meta?: unknown }) => x.tipo === 'meta-error' && x.meta)
    assert.equal(metas.length, o === 'finanzas' ? 1 : 0, o)
  }
})
