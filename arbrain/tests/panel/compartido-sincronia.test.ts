// El panel compartido de punta a punta (14 oct 2026): el store REAL de pestañas de un aparato (fijadas.ts + compartido.ts)
// contra la lógica REAL del Studio (server/src/cabina/panel-compartido.ts) en una carpeta temporal. «El otro aparato» escribe
// directo en el Studio, como lo haría su latido.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const mem = new Map<string, string>()
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0 }
g.sessionStorage = g.localStorage

const dir = mkdtempSync(path.join(tmpdir(), 'compartido-sincronia-'))
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

async function montar() {
  const { usePanelFijadas } = await import('../../src/features/cabina/panel/fijadas')
  const c = await import('../../src/features/cabina/panel/compartido')
  const studio = await import('../../server/src/cabina/panel-compartido')
  rmSync(path.join(dir, 'compartido.json'), { force: true })
  c.reiniciarCompartido()
  mem.clear()
  usePanelFijadas.setState({ fijadas: [], orden: ['tareas'], taller: true, ancladas: [], enVentana: {}, activa: 'tareas', cargado: true })
  const st = () => usePanelFijadas.getState()
  /** Un latido de ESTE aparato. */
  const latir = () => c.recibirCompartido(studio.sincronizarCompartido(c.pedidoCompartido() as never, 'este', Date.now(), dir) as never)
  /** Lo que hace el latido del OTRO aparato. */
  const otro = (cambio: (e: ReturnType<typeof studio.leerCompartido>) => Partial<ReturnType<typeof studio.leerCompartido>>, activa?: string) => {
    const e = studio.leerCompartido(dir)
    return studio.sincronizarCompartido({ rev: e.rev, activaRev: e.activaRev, cambio: { base: e.rev, fijadas: e.fijadas, orden: e.orden, taller: e.taller, ancladas: e.ancladas, ...cambio(e) }, ...(activa ? { activa } : {}) }, 'otro', Date.now(), dir)
  }
  return { st, latir, otro, studio, usePanelFijadas }
}
const fij = (id: string, vista: string, extra: Record<string, unknown> = {}) => ({ id, input: { vista, ...extra }, en: 1 })

test('con el Studio vacío, este aparato lo siembra con sus pestañas', async () => {
  const { st, latir, studio } = await montar()
  st().fijar('mano-cal', { vista: 'calendario' } as never)
  latir() // primer contacto: el Studio dice «vacío»
  latir() // manda su panel
  assert.deepEqual(studio.leerCompartido(dir).fijadas.map(f => f.id), ['mano-cal'])
})

test('un teléfono adopta el panel del escritorio; lo que abre en el teléfono llega al Studio', async () => {
  const { st, latir, otro, studio } = await montar()
  st().fijar('vieja-del-telefono', { vista: 'finanzas' } as never)
  otro(() => ({ fijadas: [fij('levy-embudo', 'lienzo', { paginaId: 'embudo' })], orden: ['tareas', 'levy-embudo'] }))
  latir()
  assert.deepEqual(st().fijadas.map(f => f.id), ['levy-embudo'])
  st().fijar('tel-salud', { vista: 'salud' } as never)
  latir()
  assert.deepEqual(studio.leerCompartido(dir).fijadas.map(f => f.id), ['levy-embudo', 'tel-salud'])
  // Ya acordado: el siguiente latido no manda nada nuevo.
  const rev = studio.leerCompartido(dir).rev
  latir()
  assert.equal(studio.leerCompartido(dir).rev, rev)
})

test('dos aparatos abren algo en los mismos segundos: quedan las dos pestañas en los dos', async () => {
  const { st, latir, otro, studio } = await montar()
  otro(() => ({ fijadas: [fij('a', 'calendario')], orden: ['tareas', 'a'] }))
  latir()
  st().fijar('aqui', { vista: 'salud' } as never)          // este aparato abre Salud…
  otro(e => ({ fijadas: [...e.fijadas, fij('alla', 'finanzas')], orden: [...e.orden, 'alla'] })) // …y el otro, Finanzas
  latir() // rechazado: rehace lo suyo encima
  assert.deepEqual(st().fijadas.map(f => f.id).sort(), ['a', 'alla', 'aqui'])
  latir() // y lo manda
  assert.deepEqual(studio.leerCompartido(dir).fijadas.map(f => f.id).sort(), ['a', 'alla', 'aqui'])
})

test('cerrar en el otro aparato cierra aquí', async () => {
  const { st, latir, otro } = await montar()
  otro(() => ({ fijadas: [fij('a', 'calendario'), fij('b', 'salud')], orden: ['tareas', 'a', 'b'] }))
  latir()
  otro(e => ({ fijadas: e.fijadas.filter(f => f.id !== 'b'), orden: e.orden.filter(c => c !== 'b') }))
  latir()
  assert.deepEqual(st().fijadas.map(f => f.id), ['a'])
})

test('la pestaña a la vista: el escritorio no la sigue y nadie se la arrebata al otro', async () => {
  const { st, latir, otro, studio } = await montar()
  otro(() => ({ fijadas: [fij('a', 'calendario'), fij('b', 'salud')], orden: ['tareas', 'a', 'b'] }), 'a')
  latir()
  st().activar('b')
  latir() // este aparato eligió b: se manda
  assert.equal(studio.leerCompartido(dir).activa, 'b')
  otro(() => ({}), 'a') // el otro elige a
  latir()
  // Aquí no es teléfono: no cambia de pestaña, y tampoco re-manda la suya (no hay ping-pong).
  assert.equal(st().activa, 'b')
  latir()
  assert.equal(studio.leerCompartido(dir).activa, 'a')
})
