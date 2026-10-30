// Ver y deshacer, ronda 4 (harness-noche 27 oct 2026): el código nunca se abre solo, el pie del turno no queda
// cortado al abrirlo y el diálogo no estrena un anillo de foco morado que compita con el ámbar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8')
const DIFF = leer('../../src/features/chat/components/DiffEdicion.tsx')
const TURNO = leer('../../src/features/chat/components/CambiosTurno.tsx')
const CSS = leer('../../src/features/chat/components/diff-edicion.module.css')

test('ronda 4: el código se ve solo tras «Ver el código»; la vista por defecto es la frase', () => {
  const codigo = DIFF.slice(DIFF.indexOf('function Codigo('), DIFF.indexOf('function DiffCodigo('))
  assert.match(codigo, /const \[ver, setVer\] = useState\(false\)/, 'cerrado al montar')
  assert.match(codigo, /\{ver && <DiffCodigo e=\{e\} \/>\}/, 'las líneas solo con ver')
  assert.ok(codigo.indexOf('fraseCodigo(e)') < codigo.indexOf('<DiffCodigo'), 'la frase va primero')
  // Nadie más pinta las líneas de código directamente.
  assert.equal(DIFF.match(/<DiffCodigo\b/g)?.length, 1)
  assert.match(DIFF, /export function DiffEdicion\(\{ e, abierto: inicial = false/)
})

test('ronda 4: al abrir el código, el pie del turno («Deshacer desde aquí») se trae a la vista', () => {
  assert.match(DIFF, /closest\('\[data-cambios\]'\)\?\.querySelector<HTMLElement>\('\[data-pie-turno\]'\)/)
  assert.match(DIFF, /scrollIntoView\(\{ block: 'nearest'/)
  assert.match(TURNO, /className=\{s\.pie\} data-pie-turno/)
  assert.match(CSS, /@media \(max-width: 560px\) \{ \.lineas \{ max-height: calc\(1\.6em \* 12 \+ 6px\); \} \}/, 'a lo angosto, un número entero de renglones')
})

test('ronda 4: el diálogo recibe el foco sin anillo; «Cancelar» no se enfoca al abrir', () => {
  const dialogo = TURNO.slice(TURNO.indexOf('function Dialogo('), TURNO.indexOf('export function CambiosTurno('))
  assert.match(dialogo, /caja\.current\?\.focus\(/)
  assert.doesNotMatch(dialogo, /cancelar\.current\?\.focus\(/)
  assert.match(dialogo, /ref=\{caja\} tabIndex=\{-1\} role="dialog"/)
  assert.match(CSS, /\.dialogo:focus, \.dialogo:focus-visible \{ outline: none; \}/)
  // Los botones solo muestran el foco con teclado.
  assert.match(CSS, /\.secundario:focus-visible/)
  assert.doesNotMatch(CSS, /\.secundario:focus\s*[,{]/)
})
