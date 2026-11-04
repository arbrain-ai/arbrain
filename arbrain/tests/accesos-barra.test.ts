import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Accesos de la barra lateral (3 nov 2026): Loops, Habilidades y Artefactos abren lo que ya existe. Las llaves que escribe
// `irA` deben ser las mismas que leen las vistas al montarse, o el clic abriría el Taller en la parte equivocada.

const leer = (r: string) => readFileSync(path.join(__dirname, '..', r), 'utf8')
const irA = leer('src/shared/navigation/ir-a.ts')
const llave = (src: string, nombre: string) => src.match(new RegExp(`${nombre} = '([^']+)'`))?.[1]

test('la llave de Rutinas › Loops es la misma en la barra y en RutinasCliente', () => {
  assert.equal(llave(irA, 'LLAVE_VISTA_RUTINAS'), llave(leer('src/features/rutinas/RutinasCliente.tsx'), 'CLAVE_VISTA'))
})

test('la llave de Memoria › Habilidades es la misma en la barra y en MemoriaTaller', () => {
  const memoria = leer('src/features/cabina/panel/MemoriaTaller.tsx')
  assert.equal(llave(irA, 'LLAVE_PARTE_MEMORIA'), llave(memoria, 'export const LLAVE_PARTE_MEMORIA'))
  assert.match(memoria, /id: 'skills'/)
})

test('las dos vistas escuchan su destino para cambiar en sitio', () => {
  assert.match(leer('src/features/rutinas/RutinasCliente.tsx'), /escucharIrA\('loops'/)
  assert.match(leer('src/features/cabina/panel/MemoriaTaller.tsx'), /escucharIrA\('habilidades'/)
})

test('la barra muestra los tres accesos', () => {
  const barra = leer('src/shared/components/ColumnaConversaciones.tsx')
  for (const n of ['Loops', 'Habilidades', 'Artefactos']) assert.match(barra, new RegExp(`>${n}<`))
})
