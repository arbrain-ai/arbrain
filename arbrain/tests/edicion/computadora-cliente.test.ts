// Taller › Computadora en la edición cliente (T16, 29 oct 2026): la pestaña aparece para el alumno con SU computadora y su
// API existe; la Máquina de Daniel (`/api/cabina/servidores`) sigue fuera. La edición se fija antes de importar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.ARBRAIN_EDICION = 'cliente'
const g = globalThis as unknown as Record<string, unknown>
const mem = new Map<string, string>()
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } }

test('cliente: la pestaña Computadora aparece, con su pregunta de alumno', async () => {
  const { SEGMENTOS_TALLER, aSegmento } = await import('../../src/features/cabina/panel/taller-segmento')
  const comp = SEGMENTOS_TALLER.find(s => s.id === 'maquina')
  assert.equal(comp?.etiqueta, 'Computadora')
  assert.equal(comp?.pregunta, '¿Cómo va mi computadora?')
  assert.equal(aSegmento('maquina'), 'maquina')
  assert.equal(aSegmento('servidores'), 'maquina')
  assert.equal(aSegmento('historia'), 'terminales')
})

test('cliente: /api/computadora existe; la Máquina de Daniel sigue fuera', async () => {
  const { apiPermitidaEnCliente } = await import('../../src/lib/edicion')
  assert.equal(apiPermitidaEnCliente('/api/computadora'), true)
  assert.equal(apiPermitidaEnCliente('/api/computadora/cerrar'), true)
  assert.equal(apiPermitidaEnCliente('/api/cabina/servidores'), false)
  assert.equal(apiPermitidaEnCliente('/api/computadora-x'), false)
})

test('el panel pinta la vista del alumno solo en cliente y la Máquina de Daniel queda igual', () => {
  const panel = readFileSync(join(__dirname, '../../src/features/cabina/panel/PanelDerecho.tsx'), 'utf8')
  assert.match(panel, /vista === 'maquina' && esEdicionCliente\(\) \? <ComputadoraCliente \/>/)
  assert.match(panel, /vista === 'maquina' \? <MaquinaTaller data=\{data\}/)
  // El pie «Sin conexión con el Studio» no sale en la computadora del alumno.
  assert.match(panel, /vista === 'maquina' && !esEdicionCliente\(\)\)\) && detalle == null && <Pie/)
})

test('cerrar pasa por la confirmación de la app y forzar pide una segunda', () => {
  const ruta = readFileSync(join(__dirname, '../../src/app/api/computadora/cerrar/route.ts'), 'utf8')
  assert.match(ruta, /soloAppCliente\(request, true\)/)
  assert.match(ruta, /confirmar: true/)
  const vista = readFileSync(join(__dirname, '../../src/features/computadora/ComputadoraCliente.tsx'), 'utf8')
  assert.match(vista, /Sí, cerrar/)
  assert.match(vista, /'no-cerro'/)
  assert.match(vista, /Sí, forzar/)
})

test('frases simples: memoria, disco, procesador y reposo', async () => {
  const m = await import('../../src/lib/computadora-cliente')
  const GB = 1024 ** 3
  assert.equal(m.fraseMemoria({ total: 8 * GB, disponible: 1 * GB, usada: 7 * GB, semaforo: 'rojo' }), 'Usas 7.0 GB de 8.0 GB')
  assert.equal(m.fraseDisco(25.4 * GB), '25.4 GB libres')
  assert.equal(m.fraseDisco(null), 'No pude leer el disco.')
  assert.equal(m.tamanoMb(820), '820 MB')
  assert.deepEqual(m.fraseProcesador(92), { texto: 'Al tope (92 %)', tono: 'rojo' })
  const duerme = m.fraseSueno({ plataforma: 'mac', tieneRutinas: true, sueno: { puedeDormirse: true, minutos: 10, impidenAhora: [] } })
  assert.equal(duerme.tono, 'amarillo')
  assert.match(duerme.texto, /Tu Mac se duerme sola tras 10 min sin usarla\. Mientras duerme, tus rutinas no corren\./)
  assert.equal(m.fraseSueno({ plataforma: 'windows', tieneRutinas: true, sueno: { puedeDormirse: false, minutos: null, impidenAhora: [] } }).tono, 'verde')
})

test('cuerpo de cierre: id obligatorio y forzar solo si viene true', async () => {
  const { cuerpoCierre } = await import('../../src/lib/computadora-cliente')
  assert.deepEqual(cuerpoCierre({ id: '/Applications/Google Chrome.app' }), { id: '/Applications/Google Chrome.app', forzar: false })
  assert.deepEqual(cuerpoCierre({ id: 'chrome', forzar: true }), { id: 'chrome', forzar: true })
  assert.deepEqual(cuerpoCierre({ id: 'chrome', forzar: 'si' }), { id: 'chrome', forzar: false })
  assert.ok('error' in cuerpoCierre({}))
  assert.ok('error' in cuerpoCierre({ id: 'a\nb' }))
  assert.ok('error' in cuerpoCierre(null))
})
