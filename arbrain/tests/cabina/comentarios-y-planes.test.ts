// Comentarios en lote sobre el entregable (idea 3) y planes por correr (idea 4) en el Taller, 29 oct 2026: lo puro del cliente.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agenteParaRuta, agentesAbiertos, comentarios, envioDe, lineaDeCita, lineaNuevaDelDiff, textoBoton } from '../../src/features/cabina/documento/comentarios'
import { PERFIL_EN_PALABRAS, armarTablero, demoTablero, filaDe } from '../../src/features/cabina/tablero-modelo'
import type { Terminal, Trabajos } from '../../src/features/cabina/trabajos-modelo'

const MD = `---
tipo: reporte
---
# Warp frente a Arbrain

## 3. Las 5 ideas
Criterio: el libro de rentas. ¿Qué decisión cambia,
qué minutos ahorra, qué riesgo quita?

- **Perfiles de permisos** por subagente.
- Comentarios anclados en el entregable.
`

test('lineaDeCita: el párrafo que se ve renderizado se encuentra en el markdown, aunque se parta en varias líneas', () => {
  assert.equal(lineaDeCita(MD, 'Warp frente a Arbrain'), 4)
  assert.equal(lineaDeCita(MD, 'Criterio: el libro de rentas. ¿Qué decisión cambia, qué minutos ahorra, qué riesgo quita?'), 7)
  assert.equal(lineaDeCita(MD, 'Perfiles de permisos por subagente.'), 10)
  assert.equal(lineaDeCita(MD, 'Comentarios anclados en el entregable.'), 11)
  assert.equal(lineaDeCita(MD, 'algo que no está'), undefined)
  assert.equal(lineaDeCita(MD, 'x'), undefined)
})

test('lineaNuevaDelDiff: las quitadas no tienen línea en el archivo nuevo; las demás cuentan desde `desde`', () => {
  const tipos = ['igual', 'menos', 'mas', 'cambio', 'igual'] as const
  assert.equal(lineaNuevaDelDiff(20, tipos, 0), 20)
  assert.equal(lineaNuevaDelDiff(20, tipos, 1), undefined)
  assert.equal(lineaNuevaDelDiff(20, tipos, 2), 21)
  assert.equal(lineaNuevaDelDiff(20, tipos, 3), 22)
  assert.equal(lineaNuevaDelDiff(20, tipos, 4), 23)
})

const term = (id: number, cwd: string, extra: Partial<NonNullable<Terminal['subagente']>> = {}): Terminal => ({ id, titulo: `a${id}`, cwd, proc: 'claude', estado: 'trabajando', actividad: null, ultimaAccion: null, ultimas: [], origen: 'sin-pantalla',
  subagente: { id, nombre: `agente ${id}`, harness: 'claude', encargo: 'e', cwd, creado: '2026-10-29T12:00:00Z', ...extra } })
const datos = (terminales: Terminal[]): Trabajos => ({ sfterm: false, terminales, servidores: [], servicios: [], leidoEn: '' })

test('a qué agente va: el de la carpeta más profunda que contiene el archivo, o el de la rama; los cerrados no', () => {
  const ag = agentesAbiertos(datos([
    term(1, '~/Developer/mi-proyecto'),
    term(2, '~/Developer/wt-reporte', { rama: 'reporte-warp' }),
    term(3, '~/Developer/wt-viejo', { cerrado: '2026-10-28' } as never),
  ]))
  assert.deepEqual(ag.map(a => a.id), [1, 2])
  assert.equal(agenteParaRuta('/Users/usuario/Developer/wt-reporte/docs/a.md', ag), 2)
  assert.equal(agenteParaRuta('~/Developer/mi-proyecto/docs/a.md', ag), 1)
  assert.equal(agenteParaRuta('arbrain/src/a.ts', ag, { rama: 'reporte-warp' }), 2)
  assert.equal(agenteParaRuta('arbrain/src/a.ts', ag, { carpeta: '/Users/usuario/Developer/wt-reporte' }), 2)
  assert.equal(agenteParaRuta('/tmp/otro.md', ag), undefined)
})

test('el envío lleva archivo, línea, cita y pedido; nada de ids ni fechas; el botón dice cuántos y a quién', () => {
  const e = envioDe([{ id: 'a', ruta: 'docs/a.md', linea: 7, cita: 'x', texto: '  quita esto  ', agente: 2, creado: 1 }, { id: 'b', ruta: 'docs/b.md', texto: 'y', creado: 2 }])
  assert.deepEqual(e, [{ ruta: 'docs/a.md', linea: 7, cita: 'x', texto: 'quita esto' }, { ruta: 'docs/b.md', texto: 'y' }])
  assert.equal(textoBoton(4, 'escribir el reporte'), 'Mandar 4 comentarios a «escribir el reporte»')
  assert.equal(textoBoton(1), 'Mandar 1 comentario')
})

test('el almacén junta comentarios de varias vistas y los quita al mandarlos', () => {
  comentarios._reiniciar([])
  const a = comentarios.agregar({ ruta: 'docs/a.md', texto: 'uno', agente: 2 })
  comentarios.agregar({ ruta: 'arbrain/x.ts', linea: 3, texto: 'dos' })
  assert.equal(comentarios.todos().length, 2)
  comentarios.asignar(comentarios.todos().filter(c => c.agente == null).map(c => c.id), 2)
  assert.ok(comentarios.todos().every(c => c.agente === 2))
  comentarios.quitarVarios([a.id])
  assert.deepEqual(comentarios.todos().map(c => c.texto), ['dos'])
  comentarios._reiniciar([])
})

test('tablero: el renglón trae perfil y plan; el demo trae planes por correr y un renglón con plan aprobado', () => {
  const f = filaDe(term(9, '/tmp/w', { perfil: 'lectura', plan: { ruta: 'docs/planes/x.md', commit: 'abc1234' } }))
  assert.equal(f.perfil, 'lectura')
  assert.deepEqual(f.plan, { ruta: 'docs/planes/x.md', commit: 'abc1234' })
  assert.equal(filaDe(term(10, '/tmp/w')).perfil, 'total')
  assert.match(PERFIL_EN_PALABRAS.lectura, /no escribe fuera de \/tmp/)
  const demo = demoTablero(Date.parse('2026-10-29T18:00:00Z'))
  assert.equal(demo.planes?.length, 2)
  assert.ok(demo.planes!.every(p => p.ruta.startsWith('docs/planes/') && p.abs.startsWith('/tmp/')))
  const t = armarTablero(demo, undefined, Date.parse('2026-10-29T18:00:00Z'))
  assert.ok(Object.values(t).flat().some(x => typeof x === 'object' && x && 'plan' in x && (x as { plan?: unknown }).plan))
})
