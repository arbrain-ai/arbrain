/**
 * Lo mismo que windows-documentos-lienzo y windows-taller-memoria, pero con el disco DE VERDAD: solo corre en Windows (CI
 * `plataforma-windows.yml`, runner windows-latest). Crea un cerebro de prueba, lo resuelve con `realpath` (que en Windows da
 * `C:\…`, a veces con otra caja o en forma corta) y pasa por las mismas funciones que usan el visor, el lienzo y el Taller.
 * En Mac y Linux se salta: allí las pruebas con rutas escritas a mano cubren lo mismo.
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { alcanceDeAssets, resolverRuta, rutaPermitida } from '../../src/features/cabina/documento/ruta'
import { dentroDeRaiz } from '../../src/features/canvas/model/doc'
import { esEntradaSkill, unirRel } from '../../src/features/cabina/archivos-cerebro'
import { dentroDe, rutaAUrl, urlARuta } from '../../src/lib/ruta-portable'
import { avisoSinMotor } from '../../src/lib/motor-plataforma'

const soloWindows = { skip: process.platform !== 'win32' ? 'solo en Windows (CI plataforma-windows)' : false }

test('Windows real: pieza, documento, assets y URL del visor dentro del cerebro', soloWindows, () => {
  const raiz = mkdtempSync(path.join(tmpdir(), 'cerebro alumno '))
  try {
    mkdirSync(path.join(raiz, 'docs', 'lienzos'), { recursive: true })
    writeFileSync(path.join(raiz, 'docs', 'lienzos', 'pieza.html'), '<p>hola</p>')
    const ws = path.resolve(raiz), r = { repo: ws, home: ws }
    const real = realpathSync.native(path.join(ws, 'docs', 'lienzos', 'pieza.html'))
    assert.match(real, /^[A-Za-z]:\\/)
    const pedida = resolverRuta('docs/lienzos/pieza.html', r)
    assert.ok('abs' in pedida, JSON.stringify(pedida))
    assert.equal(realpathSync.native(pedida.abs), real)
    // Como documento-disco.ts y la ruta de piezas: contra la raíz ya resuelta (tmpdir puede venir en forma corta `RUNNER~1`).
    assert.equal(rutaPermitida(real, { ...r, repo: realpathSync.native(ws) }), null)
    assert.equal(dentroDeRaiz(real, realpathSync.native(ws)), true)
    const alcance = alcanceDeAssets(real, r)
    const vuelta = urlARuta('/' + rutaAUrl(real).split('/').filter(Boolean).map(decodeURIComponent).join('/'))
    assert.ok(dentroDe(vuelta, alcance), `${vuelta} fuera de ${alcance}`)
    assert.equal(realpathSync.native(vuelta), real)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('Windows real: el Taller reconoce las skills y la terminal avisa', soloWindows, () => {
  assert.equal(esEntradaSkill(path.join('.claude', 'skills', 'presentaciones', 'SKILL.md')), true)
  assert.equal(esEntradaSkill(unirRel(path.join('.claude', 'skills', 'presentaciones'), 'SKILL.md')), true)
  assert.ok(avisoSinMotor(process.platform))
})
