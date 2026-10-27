// La memoria de la plantilla del alumno nace sin datos, pero viajan los marcadores `pendiente` que la sincronización
// con el sitio del programa reescribe (v0.2.9 rompió el build por ellos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { memoriaVacia } from '../../scripts/paquete-seguro.mjs'

function memoria(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'memoria-plantilla-'))
  for (const [rel, texto] of Object.entries(archivos)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), texto)
  }
  return dir
}

test('acepta índices, README, .gitkeep y marcadores pendiente', () => {
  const dir = memoria({
    'MEMORY.md': '# x\n', 'MEMORY-indice.md': '# x\n', 'feedback/README.md': '# x\n', 'user/.gitkeep': '',
    'project/meta-90-dias.md': '<!-- arbrain:expediente pendiente -->\n# Mi meta\n',
    'project/mi-camino.md': '<!-- arbrain:camino pendiente -->\r\n# Mi camino\r\n',
  })
  assert.doesNotThrow(() => memoriaVacia(dir))
})

test('la plantilla real del repo pasa', () => {
  assert.doesNotThrow(() => memoriaVacia(resolve(__dirname, '../../empaquetado/plantillas/claude/memory')))
})

test('rechaza memoria con datos, marcador fuera de la primera línea o con datos personales', () => {
  for (const [rel, texto, motivo] of [
    ['project/lanzamiento.md', '# Lanzamiento 15 oct\n', 'sin marcador'],
    ['project/a.md', '# Título\n<!-- arbrain:camino pendiente -->\n', 'sin marcador'],
    ['project/b.md', '<!-- arbrain:camino listo -->\n', 'sin marcador'],
    ['project/c.md', '<!-- arbrain:camino pendiente -->\nEscríbeme a alguien@ejemplo.com\n', 'correo'],
    ['project/d.md', '<!-- arbrain:camino pendiente -->\nWhatsApp +52 55 1234 5678\n', 'teléfono'],
    ['project/e.json', '{}', 'no es un marcador'],
  ]) {
    assert.throws(() => memoriaVacia(memoria({ [rel]: texto })), (e: Error) => e.message.includes(rel) && e.message.includes(motivo), rel)
  }
})
