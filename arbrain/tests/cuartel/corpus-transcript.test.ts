/**
 * Transcript a un clic sin depender del PATH (cuartel v2, 15 nov 2026). El servidor instalado corre con el PATH mínimo de
 * launchd, sin `rg` ni Homebrew: la búsqueda del corpus tiene que salir solo con Node.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { entornoHerramientas, indexarCorpus, rutaTranscript } from '../../src/features/contenido/corpus'

function corpusDePrueba() {
  const R = mkdtempSync(path.join(tmpdir(), 'cuartel-corpus-'))
  const t = path.join(R, 'contenido', 'youtube', 'intel', 'canal-uno', 'transcripts')
  mkdirSync(t, { recursive: true })
  writeFileSync(path.join(t, '20260618_nQwJVHCtDDY.md'), '# Video de prueba\n\n---\n\n## Transcript\n\n`[00:00]` hola\n')
  const anidado = path.join(R, 'contenido', 'youtube', 'intel', 'canal-dos', 'transcripts', '2024')
  mkdirSync(anidado, { recursive: true })
  writeFileSync(path.join(anidado, 'abcdefghijk.en.md'), 'x')
  writeFileSync(path.join(R, 'contenido', 'youtube', 'intel', 'README.md'), 'no es un transcript')
  const cuartel = path.join(R, 'arbrain', 'server', 'store', 'cuartel')
  mkdirSync(path.join(cuartel, 'vistas'), { recursive: true })
  writeFileSync(path.join(cuartel, 'vistas', 'videos.json'), JSON.stringify({ videos: [] }))
  return { R, cuartel }
}

test('encuentra el transcript sin rg aunque el PATH no tenga Homebrew', async () => {
  const antes = process.env.PATH
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
  try {
    const { R, cuartel } = corpusDePrueba()
    const ruta = await rutaTranscript(R, 'nQwJVHCtDDY', cuartel)
    assert.ok(ruta?.endsWith('canal-uno/transcripts/20260618_nQwJVHCtDDY.md'))
    assert.ok((await rutaTranscript(R, 'abcdefghijk', cuartel))?.endsWith('abcdefghijk.en.md'))
    assert.equal(await rutaTranscript(R, 'noexisteeee', cuartel), null)
  } finally { process.env.PATH = antes }
})

test('el índice reconoce los nombres del corpus y no confunde otros .md', async () => {
  const { R } = corpusDePrueba()
  const mapa = await indexarCorpus(path.join(R, 'contenido', 'youtube', 'intel'))
  assert.deepEqual([...mapa.keys()].sort(), ['abcdefghijk', 'nQwJVHCtDDY'])
})

test('los hijos (python, yt-dlp) reciben Homebrew en el PATH', () => {
  const env = entornoHerramientas({ PATH: '/usr/bin:/bin' })
  const partes = env.PATH!.split(':')
  assert.equal(partes[0], '/opt/homebrew/bin')
  assert.equal(new Set(partes).size, partes.length)
})
