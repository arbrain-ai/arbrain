import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// La columna izquierda es solo de conversaciones (5 nov 2026, el dueño: «me importan las conversaciones. todo va en los
// paneles, como en el taller»). Loops, Habilidades y Artefactos viven en el Taller y en «+ › Guardadas», no en la barra.

const leer = (r: string) => readFileSync(path.join(__dirname, '..', r), 'utf8')

test('la columna no lleva accesos a Loops, Habilidades ni Artefactos', () => {
  const barra = leer('src/shared/components/ColumnaConversaciones.tsx')
  for (const n of ['Loops', 'Habilidades', 'Artefactos']) assert.doesNotMatch(barra, new RegExp(`>${n}<`))
  assert.doesNotMatch(barra, /MenuArtefactos|irA\(/)
  assert.match(barra, /Nuevo chat/)
  assert.match(barra, /<RecientesNav/)
})

test('Tu negocio sigue abriendo Habilidades con la llave que lee MemoriaTaller', () => {
  const irA = leer('src/shared/navigation/ir-a.ts')
  const memoria = leer('src/features/cabina/panel/MemoriaTaller.tsx')
  const llave = (src: string, nombre: string) => src.match(new RegExp(`${nombre} = '([^']+)'`))?.[1]
  assert.equal(llave(irA, 'LLAVE_PARTE_MEMORIA'), llave(memoria, 'export const LLAVE_PARTE_MEMORIA'))
  assert.match(irA, /export function abrirHabilidad[\s\S]*?LLAVE_PARTE_MEMORIA, 'skills'[\s\S]*?pedirSegmentoTaller\('memoria'\)/)
  assert.match(memoria, /escucharPedido\(EVENTO_HABILIDAD, r => \{[^}]*setParte\('skills'\)/)
  assert.match(memoria, /id: 'skills'/)
})

test('Guardadas sigue en el «+» del panel', () => {
  assert.match(leer('src/features/cabina/panel/Secciones.tsx'), /<Guardadas onElegido=\{listo\} \/>/)
})
