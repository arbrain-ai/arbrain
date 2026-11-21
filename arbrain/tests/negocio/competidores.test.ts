// Estrategia › Competidores (15 nov 2026, Daniel: «quiero algo dedicado a esto, tipo una lista… faltan "las nuevas
// promesas"… esta desactualizado pues dice todavia HT acompañamiento»). Fija que el censo se lee sin inventar (sin fuente
// pública no hay ficha; sin dato es null, no 0), que el orden por tamaño y por velocidad no pierde a nadie, que un archivo
// v1 arma la lista desde «Contra quién» y que el encabezado sale del rumbo firmado (y se va en directo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { leerMercado, ocultarEnDirecto, RUTA_MERCADO, titularDe } from '../../src/features/negocio/estrategia'
import { aNumero, compacto, conDato, cuentas, entradaDe, filtrar, listaDe, ordenar, tamanoDe, velocidadDe } from '../../src/features/negocio/competidores'

const F = { fuente: 'Fuente de prueba', fecha: '2026-11-15' }
const FU = [{ url: 'https://www.youtube.com/@a', que: 'canal', fecha: '2026-11-15' }]
const ficha = (id: string, extra: Record<string, unknown> = {}) => ({ id, nombre: id.toUpperCase(), mercado: 'hispano', grupo: 'establecido', descripcion: `Quién es ${id}.`, fuentes: FU, ...extra })

const base = () => ({
  esquema: 'arbrain.mercado/v2', actualizado: '2026-11-15',
  rumbo: { ...F, titular: 'Full bajo ticket', frase: 'SaaS Factory al frente.', cita: 'de acuerdo', firmado: '2026-11-15', abierto: ['Skool sin decidir'] },
  competidores: { ...F, tu: { valor: '35.6K suscriptores', seguidores: 35600, ...F }, metodo: 'Páginas públicas.', limites: ['IG no se deja leer.'], lista: [
    ficha('grande', { canales: [{ tipo: 'YouTube', valor: '1.2M suscriptores', seguidores: 1200000, ...F }], velocidad: { valor: '+1%', pct_30d: 1, ...F } }),
    ficha('chico', { grupo: 'promesa', canales: [{ tipo: 'YouTube', valor: '12K', seguidores: 12000, ...F }], velocidad: { valor: '+2K en 30 días', seguidores_30d: 2000, ...F },
      comunidad: { plataforma: 'Skool', acceso: 'pago', miembros: 300, valor: '300 miembros', ...F },
      oferta: [{ nombre: 'Curso', precio: '0', forma: 'gratis' }, { nombre: 'Membresía', precio: '29 USD/mes', usd_mes: 29, forma: 'mensual', inferido: true }],
      sofisticacion: { nivel: 4, por_que: 'Mecanismo nuevo.' }, mecanismo: { texto: 'Agentes que venden' } }),
    ficha('vistas', { grupo: 'promesa', velocidad: { valor: '300K vistas', vistas_30d: 300000, ...F }, cambios: 'Subió el precio.' }),
    ficha('anglo', { mercado: 'anglo', grupo: 'anglo', comunidad: { plataforma: 'Skool', valor: '480.5k miembros', ...F } }),
    ficha('sin-fuente', { fuentes: [] }),
    ficha('chico'),
  ] },
})

test('el censo se lee sin inventar: sin fuente pública no hay ficha, un id repetido no se duplica', () => {
  const { mercado: m, errores } = leerMercado(base())
  const l = m!.competidores!.lista
  assert.deepEqual(l.map(f => f.id), ['grande', 'chico', 'vistas', 'anglo'])
  assert.ok(errores.some(e => /fuentes/.test(e)) && errores.some(e => /repetido/.test(e)))
  assert.equal(m!.competidores!.tu?.seguidores, 35600, 'tu canal, con la misma regla')
  const chico = l[1]
  assert.equal(chico.grupo, 'promesa')
  assert.equal(chico.comunidad?.miembros, 300)
  assert.equal(chico.oferta[1].inferido, true)
  assert.equal(chico.mecanismo?.inferido, true, 'un mecanismo sin «inferido: false» se marca inferido')
  assert.equal(chico.sofisticacion?.nivel, 4)
  assert.equal(l[0].cadencia, null, 'sin dato es null, no 0')
  assert.equal(l[2].cambios, 'Subió el precio.')
})

test('tamaño y velocidad: números del texto cuando falta el número, y el % sale de lo ganado sobre lo que tenía', () => {
  assert.deepEqual(['260K suscriptores · 199 videos', '1.12M', '480.5k miembros', '4,283 miembros', '~367K', '4.283', 'sin dato'].map(aNumero), [260000, 1120000, 480500, 4283, 367000, 4283, null])
  const l = leerMercado(base()).mercado!.competidores!.lista
  assert.equal(tamanoDe(l[3]), 480500)
  assert.equal(tamanoDe(l[2]), null)
  assert.equal(Math.round(velocidadDe(l[1]).pct!), 20, '2K ganados sobre 10K de antes')
  assert.deepEqual(velocidadDe(l[2]), { pct: null, semana: null }, 'las vistas no se vuelven %')
  assert.deepEqual(compacto(1_200_000), '1.2M')
  assert.deepEqual(entradaDe(l[1]), { precio: '29 USD/mes', oculto: false, usd_mes: 29 })
  assert.equal(entradaDe({ ...l[1], oferta: [{ ...l[1].oferta[1], precio: 'sin dato', usd_mes: null }] }), null, '«sin dato» no es un precio')
})

test('ordenar no pierde a nadie: sin dato al final; filtros y cuentas por grupo', () => {
  const l = leerMercado(base()).mercado!.competidores!.lista
  assert.deepEqual(ordenar(l, 'tamano').map(f => f.id), ['grande', 'anglo', 'chico', 'vistas'])
  assert.deepEqual(ordenar(l, 'velocidad').map(f => f.id), ['chico', 'grande', 'anglo', 'vistas'], 'primero el % medido; los demás, por tamaño (no se inventa un %)')
  assert.equal(conDato(l[3], 'velocidad'), false)
  assert.deepEqual(filtrar(l, 'promesa').map(f => f.id), ['chico', 'vistas'])
  assert.deepEqual(cuentas(l), { todos: 4, establecido: 1, promesa: 2, anglo: 1 })
})

test('el rumbo firmado encabeza; sin fecha de firma no hay rumbo; en directo se va', () => {
  const m = leerMercado(base()).mercado!
  assert.equal(titularDe(m), 'Full bajo ticket')
  assert.equal(m.rumbo?.abierto[0], 'Skool sin decidir')
  const x = base(); (x.rumbo as Record<string, unknown>).firmado = null
  assert.equal(leerMercado(x).mercado!.rumbo, null)
  assert.equal(ocultarEnDirecto(m).mercado.rumbo, null)
  assert.equal(ocultarEnDirecto(m).mercado.competidores?.lista.length, 4, 'lo público se queda')
})

test('un archivo v1 se sigue leyendo y la lista sale de «Contra quién»', () => {
  const v1 = { esquema: 'arbrain.mercado/v1', contra_quien: { ...F,
    hispanos: [
      { nombre: 'Fulano Pérez · Escuela', grupo: 'directo', pais: 'Chile', avatar: 'Dueños de pyme.', canales: [{ tipo: 'YouTube', valor: '100K suscriptores', url: 'https://youtube.com/@f', ...F }, { tipo: 'Skool de pago', valor: '1,200 miembros', url: 'https://skool.com/e', ...F }], ofertas: [{ oferta: 'Mensual', precio: '59 USD/mes' }] },
      { nombre: 'Contraste', grupo: 'contraste', canales: [], ofertas: [] },
    ],
    anglos: [{ nombre: 'Zutano', categoria: 'AI OS', canales: [{ tipo: 'skool_gratis', valor: '480.5k miembros', url: 'https://skool.com/a', ...F }], ofertas: [] }] } }
  const { mercado: m, errores } = leerMercado(v1)
  assert.deepEqual(errores, [])
  const l = listaDe(m!)!
  assert.equal(l.desde, 'contra')
  assert.deepEqual(l.lista.map(f => [f.nombre, f.marca, f.grupo]), [['Fulano Pérez', 'Escuela', 'establecido'], ['Zutano', null, 'anglo']])
  assert.equal(l.lista[0].comunidad?.miembros, 1200)
  assert.equal(l.lista[1].comunidad?.acceso, 'gratis')
  assert.equal(titularDe(m!), 'Tu mercado', 'sin rumbo ni hueco tuyo, el titular neutro')
})

test('la sección: pestañas Panorama y Competidores, nada nace invisible', () => {
  const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
  const s = leer('src/features/negocio/SeccionEstrategia.tsx')
  assert.match(s, /<Competidores m=\{datos\}/)
  assert.match(s, /RumboFirmado/)
  for (const [, cuerpo] of leer('src/features/negocio/competidores.module.css').matchAll(/@keyframes\s+\w+\s*\{([^@]*?)\}\s*\}/g)) assert.doesNotMatch(cuerpo, /opacity:\s*0[;\s}]/)
})

const REAL = new URL(`../../../${RUTA_MERCADO}`, import.meta.url)
test('el archivo real: rumbo firmado y, si hay censo, cada ficha con fuente pública', { skip: !existsSync(REAL) && 'sin mercado.json en esta copia' }, () => {
  const crudo = JSON.parse(readFileSync(REAL, 'utf8'))
  const { mercado: m } = leerMercado(crudo)
  assert.equal(m?.rumbo?.titular, 'Full bajo ticket')
  assert.doesNotMatch(titularDe(m!), /hueco/i, 'el encabezado ya no es el hueco del Acompañamiento')
  if (crudo.competidores) {
    assert.equal(m!.competidores!.lista.length, crudo.competidores.lista.length, 'ninguna ficha se descartó')
    for (const f of m!.competidores!.lista) assert.ok(f.fuentes.length && f.descripcion, `${f.nombre}: fuente y descripción`)
    const g = cuentas(m!.competidores!.lista)
    assert.ok(g.establecido + g.anglo >= 30 && g.promesa >= 15 && g.promesa <= 30, 'el contrato: ≥30 establecidos y 15–30 nuevas promesas')
  }
})
