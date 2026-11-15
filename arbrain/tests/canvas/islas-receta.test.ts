import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { leerReceta, llenar, maquetar, fuentesDeTexto, ESQUEMA_RECETA } from '../../src/features/canvas/islas/receta'
import { prepararIsla } from '../../src/features/canvas/islas/modelo'
import { TIPOS_BLOQUE, prepararBloque } from '../../src/features/canvas/islas/bloques/esquemas'

const base = (bloques: unknown[], extra: Record<string, unknown> = {}) => ({ esquema: ESQUEMA_RECETA, id: 'finanzas', titulo: 'Finanzas', bloques, ...extra })

test('islas · receta: sin esquema, otra versión o sin bloques no se pinta; dice por qué', () => {
  assert.equal(leerReceta(null).ok, false)
  const v = leerReceta({ esquema: 'arbrain.isla/v9', bloques: [{ tipo: 'texto', texto: 'x' }] })
  assert.equal(v.ok, false)
  assert.match(!v.ok ? v.errores[0] : '', /arbrain\.isla\/v1/)
  assert.equal(leerReceta(base([])).ok, false)
})

test('islas · receta: un bloque roto no tumba a sus vecinos y su error se dice en palabras', () => {
  const r = prepararIsla(base([
    { tipo: 'titulo', texto: 'Finanzas', ceja: 'Órgano' },
    { tipo: 'numero' },                                   // sin fuente
    { tipo: 'cohete', texto: 'x' },                       // tipo inexistente
    { tipo: 'boton', texto: 'Polar', destino: 'url:https://polar.sh/dashboard/mi-organizacion', estilo: 'oro' },
    { tipo: 'boton', texto: 'Malo', destino: 'url:https://sitio-raro.example' },
  ]))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.isla.bloques.length, 5)
  assert.deepEqual(r.isla.bloques.map(b => b.ok), [true, false, false, true, true])
  assert.ok(r.isla.errores.some(e => /fuente/.test(e)))
  assert.ok(r.isla.errores.some(e => /cohete/.test(e)))
  assert.ok(r.isla.errores.some(e => /lista blanca/.test(e)), 'el destino fuera de la lista se señala')
})

test('islas · receta: la rejilla pone cada bloque en su sitio; sin «en», uno debajo del otro', () => {
  const l = leerReceta(base([
    { tipo: 'titulo', texto: 'A', en: [0, 0, 6, 2] },
    { tipo: 'numero', fuente: 'pulso:venta', en: [6, 0, 6, 3] },
    { tipo: 'texto', texto: 'abajo' },
  ], { rejilla: { columnas: 12, fila: 60, hueco: 20, margen: 40 }, ancho: 1440 }))
  assert.ok(l.ok)
  if (!l.ok) return
  const { cajas, alto } = maquetar(l.receta, () => 2)
  const col = (1440 - 80 - 11 * 20) / 12
  assert.deepEqual(cajas[0], { x: 40, y: 40, w: 6 * col + 5 * 20, h: 2 * 60 + 20 })
  assert.equal(cajas[1].x, 40 + 6 * (col + 20))
  assert.equal(cajas[2].y, 40 + 3 * (60 + 20), 'el bloque sin «en» va debajo del más bajo')
  assert.equal(cajas[2].w, 1440 - 80)
  assert.equal(alto, cajas[2].y + cajas[2].h + 40)
})

test('islas · receta: lo reservado para la v17 se valida y se conserva', () => {
  const l = leerReceta(base([{ tipo: 'separador' }], {
    organo: 'finanzas',
    tiempo: { foto: 'diaria', desde: '2026-11-14' },
    simulacion: { palancas: [{ id: 'precio', etiqueta: 'Precio', fuente: 'pulso:venta', min: 0 }] },
    submapa: { pagina: 'aaaa-bbbb' },
    camaras: [{ nombre: 'de cerca', zona: { x: 0, y: 0, width: 10, height: 10 } }, { sin: 'nombre' }],
    voz: { nombres: ['finanzas', 'el dinero'] },
  }))
  assert.ok(l.ok)
  if (!l.ok) return
  assert.equal(l.receta.organo, 'finanzas')
  assert.deepEqual(l.receta.tiempo, { foto: 'diaria', desde: '2026-11-14' })
  assert.equal(l.receta.simulacion?.palancas[0].fuente, 'pulso:venta')
  assert.deepEqual(l.receta.submapa, { pagina: 'aaaa-bbbb' })
  assert.equal(l.receta.camaras?.length, 1)
  assert.deepEqual(l.receta.voz?.nombres, ['finanzas', 'el dinero'])
  const mal = leerReceta(base([{ tipo: 'separador' }], { tiempo: 'ayer' }))
  assert.ok(mal.ok && mal.errores.some(e => /tiempo/.test(e)))
})

test('islas · plantillas: los huecos se llenan con el dato vivo; sin dato dice «sin dato», nunca 0', () => {
  assert.deepEqual(fuentesDeTexto('Entró {finanzas:resumen.texto.entro} y {pulso:venta.cifra}; {no es hueco}'), ['finanzas:resumen', 'pulso:venta'])
  const datos: Record<string, { estado: string; valor: unknown }> = {
    'pulso:venta': { estado: 'ok', valor: { cifra: '7' } },
    'finanzas:resumen': { estado: 'oculto', valor: null },
    'pulso:marketing': { estado: 'sin-dato', valor: { cifra: null } },
  }
  const leer = (f: string) => datos[f]
  assert.equal(llenar('Lugares: {pulso:venta.cifra}', leer), 'Lugares: 7')
  assert.equal(llenar('Entró {finanzas:resumen.texto.entro}', leer), 'Entró •••')
  assert.equal(llenar('Vistas {pulso:marketing.cifra}', leer), 'Vistas sin dato')
  assert.equal(llenar('Nada {pulso:entrega.cifra}', leer), 'Nada sin dato')
  assert.equal(llenar('Obj {pulso:venta}', leer), 'Obj sin dato', 'un objeto entero no se imprime')
})

test('islas · bloques: cada tipo valida lo suyo; las fuentes de la isla se juntan', () => {
  for (const t of TIPOS_BLOQUE) assert.ok(prepararBloque(t, {}).ok === false || t === 'separador', `${t} sin props no debería pintarse (salvo separador)`)
  const r = prepararIsla(base([
    { tipo: 'organo', organo: 'finanzas', botones: [{ texto: 'Ver finanzas', destino: 'panel:finanzas' }] },
    { tipo: 'numero', fuente: 'bi:ventas', tendencia: {} },
    { tipo: 'texto', texto: 'Hoy: {cohorte:resumen.conectados} cerebros' },
    { tipo: 'nova', centro: { texto: 'Por qué' }, anillos: [{ nombre: 'Nicho' }, { nombre: 'Oferta' }] },
    { tipo: 'escalera', peldanos: [{ nombre: 'Comunidad', precio: '$39', estado: 'vivo' }, { nombre: 'Enero', estado: 'abierto' }] },
  ]))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.isla.fuentes, ['bi:ventas', 'cohorte:resumen', 'pulso:finanzas'])
  assert.deepEqual(r.isla.errores, [])
  const n = r.isla.bloques[1]
  assert.ok(n.ok && n.tipo === 'numero')
  assert.deepEqual(n.ok && (n.p as { tendencia?: unknown }).tendencia, { fuente: 'bi:ventas', campo: 'puntos' })
})
