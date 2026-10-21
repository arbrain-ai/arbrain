import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alRecibir, basePrimerContacto, codificarVista, decodificarVista, firmaEstado, iguales, rehacer, VACIO, type EstadoPanel, type FijadaCompartida } from '../../src/features/cabina/panel/compartido-puro'

const f = (id: string, vista = 'calendario', extra: Record<string, unknown> = {}): FijadaCompartida => ({ id, input: { vista, ...extra }, en: 1 })
const e = (fs: FijadaCompartida[], extra: Partial<EstadoPanel> = {}): EstadoPanel => ({ fijadas: fs, orden: ['tareas', ...fs.map(x => x.id)], taller: true, ancladas: [], ...extra })
const ids = (x: EstadoPanel) => x.fijadas.map(y => y.id)

describe('panel compartido: rehacer lo de aquí sobre lo que llegó', () => {
  it('sin cambios aquí, se adopta lo remoto tal cual', () => {
    const base = e([f('a')]), remoto = e([f('a'), f('levy', 'lienzo', { paginaId: 'p' })])
    assert.deepEqual(alRecibir(remoto, base, base), remoto)
  })

  it('lo que se abrió aquí y lo que abrió otro aparato en los mismos segundos quedan los dos', () => {
    const base = e([f('a')])
    const local = e([f('a'), f('tel')]), remoto = e([f('a'), f('levy')])
    const r = rehacer(remoto, base, local)
    assert.deepEqual(ids(r), ['a', 'levy', 'tel'])
    assert.deepEqual(r.orden, ['tareas', 'a', 'levy', 'tel'])
  })

  it('lo que se cerró aquí se quita aunque el remoto lo tenga; lo que cerró otro no vuelve', () => {
    const base = e([f('a'), f('b'), f('c')])
    const local = e([f('a'), f('c')]), remoto = e([f('a'), f('b')])
    assert.deepEqual(ids(rehacer(remoto, base, local)), ['a'])
  })

  it('una pestaña cambiada aquí (otra semana del calendario) manda sobre la remota', () => {
    const base = e([f('a')]), local = e([f('a', 'calendario', { fecha: '2026-10-20' })]), remoto = e([f('a'), f('b')])
    const r = rehacer(remoto, base, local)
    assert.equal(r.fijadas[0].input.fecha, '2026-10-20')
    assert.deepEqual(ids(r), ['a', 'b'])
  })

  it('el orden: si aquí se reacomodó manda el de aquí; si no, el remoto', () => {
    const base = e([f('a'), f('b')])
    const reacomodado = { ...base, orden: ['b', 'tareas', 'a'] }
    assert.deepEqual(rehacer(e([f('a'), f('b'), f('c')]), base, reacomodado).orden, ['b', 'tareas', 'a', 'c'])
    assert.deepEqual(rehacer({ ...base, orden: ['a', 'b', 'tareas'] }, base, base).orden, ['a', 'b', 'tareas'])
  })

  it('cerrar Tareas o el Taller aquí viaja; si no se tocaron, manda lo remoto', () => {
    const base = e([f('a')])
    const sinTareas = { ...base, orden: ['a'], taller: false }
    const r = rehacer(base, base, sinTareas)
    assert.equal(r.orden.includes('tareas'), false)
    assert.equal(r.taller, false)
    assert.equal(rehacer({ ...base, taller: false }, base, e([f('a'), f('n')])).taller, false)
  })

  it('las ancladas que ya no existen se sueltan', () => {
    const base = e([f('a'), f('b')], { ancladas: ['a'] })
    assert.deepEqual(rehacer(e([f('b')], { ancladas: ['a'] }), base, base).ancladas, [])
  })

  it('rehacer dos veces lo mismo no cambia nada (el acuse de un cambio aceptado)', () => {
    const base = e([f('a')]), local = e([f('a'), f('n')])
    const una = rehacer(local, base, local)
    assert.ok(iguales(una, local))
  })
})

describe('primer contacto', () => {
  it('el escritorio suma lo suyo a lo del Studio; un teléfono adopta el del Studio', () => {
    const aqui = e([f('vieja')]), studio = e([f('a')])
    assert.deepEqual(ids(alRecibir(studio, basePrimerContacto(aqui, 3, true), aqui)), ['a', 'vieja'])
    assert.deepEqual(ids(alRecibir(studio, basePrimerContacto(aqui, 3, false), aqui)), ['a'])
  })
  it('con el Studio vacío cualquiera lo siembra', () => {
    assert.equal(basePrimerContacto(e([f('x')]), 0, false), VACIO)
  })
  it('la hora en que se fijó no cuenta como cambio', () => {
    assert.equal(firmaEstado(e([{ ...f('a'), en: 5 }])), firmaEstado(e([{ ...f('a'), en: 9 }])))
  })
})

describe('enlace propio de una vista', () => {
  const VISTAS = ['lienzo', 'documento', 'salud']
  it('ida y vuelta con acentos y comillas', () => {
    const v = { vista: 'lienzo', paginaId: 'p-1', titulo: 'Embudo «ñ» · prueba' }
    assert.deepEqual(decodificarVista(codificarVista(v), VISTAS), v)
    assert.doesNotMatch(codificarVista(v), /[+/=]/)
  })
  it('lo que viene del servidor (base64url de Node) también se lee', () => {
    const v = { vista: 'documento', ruta: 'docs/ñandú.md' }
    assert.deepEqual(decodificarVista(Buffer.from(JSON.stringify(v), 'utf8').toString('base64url'), VISTAS), v)
  })
  it('vista desconocida, basura u órdenes (fijar, soltar) no pasan', () => {
    assert.equal(decodificarVista(codificarVista({ vista: 'rm -rf' }), VISTAS), null)
    assert.equal(decodificarVista('%%%', VISTAS), null)
    assert.equal(decodificarVista(null, VISTAS), null)
    assert.deepEqual(decodificarVista(codificarVista({ vista: 'salud', soltar: true, fijar: true, guardar: true }), VISTAS), { vista: 'salud' })
  })
})

describe('enlaces de un artefacto', async () => {
  const { enlaceArtefacto, enlaceTelefono, leerVista, idDeEnlace } = await import('../../src/features/cabina/panel/artefacto-enlace')
  it('el enlace no lleva órdenes y se lee de vuelta', () => {
    const url = enlaceArtefacto({ vista: 'lienzo', paginaId: 'p', fijar: true } as never)
    const v = new URL(url, 'https://x').searchParams.get('v')
    assert.deepEqual(leerVista(v), { vista: 'lienzo', paginaId: 'p' })
    assert.match(enlaceTelefono({ vista: 'salud' } as never), /^\/telefono\?abrir=/)
    assert.equal(idDeEnlace('abc'), idDeEnlace('abc'))
    assert.notEqual(idDeEnlace('abc'), idDeEnlace('abd'))
  })
})
