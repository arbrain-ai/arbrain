// Prueba real en modo alumno (28 oct 2026, release v0.2.13): en una instalación con ARBRAIN_EDICION=cliente y un turno
// real, «Deshacer desde aquí» respondía «No disponible en esta edición» porque su ruta no estaba en la lista blanca.
// Lo mismo pasaba con las reglas de «Permitir siempre» (Ajustes) y los botones de la meta. Este sensor fija que las
// superficies de Play y Deshacer que el chat del alumno pinta tengan su ruta abierta en la edición cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('Play y Deshacer: sus rutas existen en la edición cliente', () => {
  for (const ruta of ['/api/chat/deshacer', '/api/chat/meta', '/api/permisos/reglas', '/api/confirmaciones', '/api/confirmaciones/resolver']) {
    assert.equal(apiPermitidaEnCliente(ruta), true, ruta)
  }
  // La historia sigue sin estar en esta edición: su ruta responde 404 y el diff del turno no ofrece el atajo.
  assert.equal(apiPermitidaEnCliente('/api/historia'), false)
  assert.match(fuente('src/features/chat/components/CambiosTurno.tsx'), /const CON_HISTORIA = !esEdicionCliente\(\)/)
  assert.match(fuente('src/features/chat/components/CambiosTurno.tsx'), /\{CON_HISTORIA && <button[^>]*data-ver-historia/)
})

test('cada ruta que piden los componentes de Play y Deshacer está en la lista blanca', () => {
  const archivos = ['src/features/chat/lib/deshacer-api.ts', 'src/features/permisos/lib/pendientes.ts', 'src/features/permisos/components/ReglasSiempre.tsx']
  for (const a of archivos) {
    const rutas = [...fuente(a).matchAll(/['`](\/api\/[a-z0-9/_-]+)/gi)].map(m => m[1])
    assert.ok(rutas.length > 0, `${a} no pide ninguna ruta (¿cambió de lugar?)`)
    for (const r of rutas) assert.equal(apiPermitidaEnCliente(r), true, `${a} pide ${r}`)
  }
})
