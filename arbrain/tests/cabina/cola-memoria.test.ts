// Taller › Agentes › En cola por memoria (5 nov 2026): lo que espera aire se ve con su lugar, cuánto lleva y qué hace
// falta; el bloque solo aparece si algo espera; la web solo habla con el daemon por la ruta de la app.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { aireHaciaUmbral, demoCola, fraseCola, fraseReciente, haceCuanto, hayQueMostrar, metaEncargo, type VistaCola } from '../../src/features/cabina/panel/cola-memoria-modelo'

const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
const GB = 1024 ** 3
const AHORA = 1_800_000_000_000

test('la frase dice cuánto hay, cuánto hace falta y que salen solos en orden', () => {
  const v = demoCola(AHORA)
  assert.equal(fraseCola(v), '3 encargos esperan: tu computadora tiene 1.1 GB libres y cada agente sale con 1.8 GB. Salen solos, en este orden.')
  assert.equal(fraseCola({ ...v, esperando: v.esperando.slice(0, 1) }).startsWith('1 encargo espera:'), true)
  assert.ok(Math.abs(aireHaciaUmbral(v) - 1.1 / 1.8) < 1e-9)
  assert.equal(aireHaciaUmbral({ ...v, libreBytes: 5 * GB }), 1)
})

test('cada encargo dice qué es y cuánto lleva; lo que sale o se lanzó ya, también', () => {
  const [sub, rutina] = demoCola(AHORA).esperando
  assert.equal(metaEncargo(sub, AHORA), 'Subagente · esperando 6 min')
  assert.equal(metaEncargo(rutina, AHORA), 'Rutina · esperando 4 min')
  assert.equal(metaEncargo({ ...rutina, estado: 'admitido', posicion: 0 }, AHORA), 'Rutina · saliendo ahora')
  assert.equal(metaEncargo({ ...rutina, forzar: true }, AHORA), 'Rutina · lo lanzaste ya, sale en segundos')
  assert.equal(haceCuanto(AHORA - 70 * 60_000, AHORA), 'hace 1 h 10 min')
  assert.equal(haceCuanto(AHORA - 10_000, AHORA), 'hace un momento')
})

test('lo que salió de la cola: con aire, lanzado a mano, tras esperar mucho o en la otra máquina del espejo', () => {
  const base = { id: 'cm_000000000009', tipo: 'rutina' as const, titulo: 'x', estado: 'lanzado', motivo: 'aire', derivadoA: null, cuando: AHORA - 5 * 60_000 }
  assert.equal(fraseReciente(base, AHORA), 'Salió cuando hubo aire · hace 5 min')
  assert.match(fraseReciente({ ...base, motivo: 'forzado' }, AHORA), /lo lanzaste ya/)
  assert.match(fraseReciente({ ...base, motivo: 'espera_larga' }, AHORA), /tras esperar mucho/)
  assert.equal(fraseReciente({ ...base, estado: 'derivado', derivadoA: 'mi-vps' }, AHORA), 'La corrió mi-vps (aquí no había aire) · hace 5 min')
})

test('el bloque solo aparece con la cola prendida y algo en ella (la instalación original no lo ve)', () => {
  const vacia: VistaCola = { activa: true, libreBytes: 4 * GB, totalBytes: 8 * GB, umbralBytes: 1.8 * GB, esperando: [], recientes: [] }
  assert.equal(hayQueMostrar(undefined), false)
  assert.equal(hayQueMostrar(vacia), false)
  assert.equal(hayQueMostrar({ ...demoCola(AHORA), activa: false }), false)
  assert.equal(hayQueMostrar(demoCola(AHORA)), true)
})

test('la ruta de la web: solo la app de la edición cliente, ids validados y solo mover o lanzar ya', () => {
  const ruta = leer('src/app/api/taller/cola-memoria/route.ts')
  assert.match(ruta, /soloAppCliente\(\)/)
  assert.match(ruta, /soloAppCliente\(request, true\)/)
  assert.match(ruta, /\^cm_\[0-9a-f\]\{12\}\$/)
  assert.match(ruta, /'\/cola-memoria\/mover'/)
  assert.match(ruta, /'\/cola-memoria\/forzar'/)
  const taller = leer('src/features/cabina/panel/Taller.tsx')
  assert.match(taller, /<ColaMemoriaTaller \/>/)
  // El proxy de la edición cliente deja pasar la ruta (v0.2.23 y antes: 404 y el bloque nunca salía).
  assert.equal(apiPermitidaEnCliente('/api/taller/cola-memoria'), true)
})
