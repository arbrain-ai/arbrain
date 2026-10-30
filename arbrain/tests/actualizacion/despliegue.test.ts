import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { VIGENCIA_FASE_MS, decidirEstado } from '../../src/lib/actualizacion-web'
import {
  ARRANQUE_DESPLIEGUE_MS, TOPE_DESPLIEGUE_MS, evaluarDespliegue, hayQueAplicar, textoDespliegue, textoFinDespliegue,
} from '../../src/lib/actualizacion'

const ahora = 1_000_000_000
const base = { nuevo: 'bbb', hecho: 'aaa', lockVivo: false, marca: null, ahora }

test('árbol de origin distinto al desplegado = pendiente; igual = nada', () => {
  assert.equal(decidirEstado(base).pendiente, true)
  assert.equal(decidirEstado({ ...base, hecho: 'bbb' }).pendiente, false)
  assert.equal(decidirEstado({ ...base, nuevo: null }).pendiente, false) // sin lectura de git no se inventa un deploy
})

test('candado vivo = desplegando, con la fase vigente; una fase final vieja no se muestra como en curso', () => {
  const e = decidirEstado({ ...base, lockVivo: true, marca: { fase: 'esperando', ts: ahora - 1000 } })
  assert.equal(e.desplegando, true); assert.equal(e.fase, 'esperando')
  assert.equal(decidirEstado({ ...base, lockVivo: true, marca: { fase: 'listo', ts: ahora - 1000 } }).fase, 'compilando')
})

test('una marca vieja (script muerto) se ignora', () => {
  assert.equal(decidirEstado({ ...base, marca: { fase: 'cambiando', ts: ahora - VIGENCIA_FASE_MS - 1 } }).fase, null)
})

test('fallo solo se reporta si sigue pendiente y nadie intenta desplegar', () => {
  const marca = { fase: 'fallo', ts: ahora - 1000 }
  assert.equal(decidirEstado({ ...base, marca }).fallo, true)
  assert.equal(decidirEstado({ ...base, marca, lockVivo: true }).fallo, false)
  assert.equal(decidirEstado({ ...base, marca, hecho: 'bbb' }).fallo, false)
})

const p = { buildMio: 'x1', desde: 0, ahora: 5_000 }
const trabajando = { desplegando: true, fallo: false, pendiente: true }

test('el build del servidor cambió = listo (el cambio de slot ocurrió)', () => {
  assert.equal(evaluarDespliegue({ ...p, buildServidor: 'x2', estado: trabajando }), 'listo')
})

test('mientras compila, o con el servidor reiniciando (sin respuesta), sigue esperando', () => {
  assert.equal(evaluarDespliegue({ ...p, buildServidor: 'x1', estado: trabajando }), 'esperar')
  assert.equal(evaluarDespliegue({ ...p, buildServidor: null, estado: null }), 'esperar')
})

test('fallo del script, nada pendiente sin cambio de build y tope de tiempo', () => {
  assert.equal(evaluarDespliegue({ ...p, buildServidor: 'x1', estado: { desplegando: false, fallo: true, pendiente: true, faseTs: 3_000 } }), 'fallo')
  assert.equal(evaluarDespliegue({ ...p, ahora: 20_000, buildServidor: 'x1', estado: { desplegando: false, fallo: false, pendiente: false } }), 'listo')
  assert.equal(evaluarDespliegue({ ...p, ahora: 5_000, buildServidor: 'x1', estado: { desplegando: false, fallo: false, pendiente: false } }), 'esperar')
  assert.equal(evaluarDespliegue({ ...p, ahora: TOPE_DESPLIEGUE_MS + 1, buildServidor: 'x1', estado: trabajando }), 'tiempo')
})

// 5 oct 17:27–17:42: el árbol de origin no compilaba (CSS de Salud). Cada «Reiniciar» lanzaba un build que fallaba
// y la píldora volvía igual. Estas pruebas fijan el contrato: nunca volver en silencio, y un árbol roto no se ofrece.
test('un fallo ANTERIOR a este «Reiniciar» no corta la espera: el deploy recién pedido aún no toma el candado', () => {
  const viejo = { desplegando: false, fallo: true, pendiente: true, faseTs: -60_000 }
  assert.equal(evaluarDespliegue({ ...p, ahora: 2_000, buildServidor: 'x1', estado: viejo }), 'esperar')
})

test('nadie toma la orden = sinArranque (visible), no espera infinita ni silencio', () => {
  const quieto = { desplegando: false, fallo: false, pendiente: true }
  assert.equal(evaluarDespliegue({ ...p, ahora: 20_000, buildServidor: 'x1', estado: quieto }), 'esperar')
  assert.equal(evaluarDespliegue({ ...p, ahora: ARRANQUE_DESPLIEGUE_MS + 1, buildServidor: 'x1', estado: quieto }), 'sinArranque')
})

test('compilando más allá del arranque sigue esperando (progreso real, aplica solo al terminar)', () => {
  assert.equal(evaluarDespliegue({ ...p, ahora: 5 * 60_000, buildServidor: 'x1', estado: trabajando }), 'esperar')
})

test('el árbol que falló deja de ofrecerse; un commit nuevo lo vuelve a ofrecer', () => {
  const marca = { fase: 'fallo', ts: ahora - VIGENCIA_FASE_MS - 1, arbol: 'bbb' } // vieja, pero dice qué árbol
  assert.equal(decidirEstado({ ...base, marca }).fallo, true)
  assert.equal(decidirEstado({ ...base, marca, nuevo: 'ccc' }).fallo, false)
  assert.equal(decidirEstado({ ...base, marca, lockVivo: true }).fallo, false)
  assert.equal(decidirEstado({ ...base, marca }).faseTs, marca.ts)
})

test('la píldora solo aparece si hay algo que aplicar', () => {
  const nada = { webNueva: false, estado: null, shell: null }
  assert.equal(hayQueAplicar(nada).alguna, false)
  assert.equal(hayQueAplicar({ ...nada, webNueva: true }).alguna, true)
  const pendiente = { disponible: true, pendiente: true, fallo: false }
  assert.equal(hayQueAplicar({ ...nada, estado: pendiente }).sinDesplegar, true)
  assert.equal(hayQueAplicar({ ...nada, estado: { ...pendiente, fallo: true } }).alguna, false)
  assert.equal(hayQueAplicar({ ...nada, estado: { ...pendiente, disponible: false } }).alguna, false)
  assert.equal(hayQueAplicar({ ...nada, shell: { pendiente: true, cambiaBinario: false } }).alguna, false)
  assert.equal(hayQueAplicar({ ...nada, shell: { pendiente: true, cambiaBinario: true } }).shell, true)
})

test('texto de progreso con fase real y tiempo; los finales dicen por qué', () => {
  assert.equal(textoDespliegue('compilando'), 'Compilando versión nueva…')
  assert.equal(textoDespliegue('compilando', 42_000), 'Compilando versión nueva… · 42 s')
  assert.equal(textoDespliegue('cambiando', 125_000), 'Casi listo… · 2 min 05 s')
  assert.match(textoFinDespliegue('fallo'), /no compiló/)
  assert.match(textoFinDespliegue('sinArranque'), /reintenta/)
})
