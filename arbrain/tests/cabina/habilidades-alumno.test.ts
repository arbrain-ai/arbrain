/**
 * Taller › Habilidades en la copia del alumno, en cualquier sistema (16 nov 2026, un alumno: «en habilidades tampoco me
 * aparece ninguna, entonces no sé si las que vienen incorporadas con el cerebro no son parte»).
 * Las rutas con «\» de Windows las cubre tests/plataforma/windows-taller-memoria.test.ts. Aquí lo demás:
 *   1. Con la memoria sin sembrar (sin `.claude/memory/MEMORY.md`) la ruta daba el cerebro por no montado: todo vacío.
 *   2. «Para qué sirve»: `description: >` salía «>», el resto con disparadores o en inglés, y con CRLF nada.
 *   3. Las que el alumno crea aparecen y se distinguen de las que trae el cerebro.
 * Usa las skills reales que viajan al alumno (empaquetado/plantillas/skills).
 */
import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { esEntradaSkill, unirRel } from '../../src/features/cabina/archivos-cerebro'
import { frontmatter, origenDe, paraQueSirve, raizTaller, skillsDelAutor, tituloDe } from '../../src/features/cabina/habilidades-cerebro'

const WEB = fileURLToPath(new URL('../../', import.meta.url))
const PLANTILLAS = path.join(WEB, 'empaquetado/plantillas/skills')
const DEL_AUTOR = readdirSync(PLANTILLAS).filter(n => !n.startsWith('.')).sort()
const tmp = mkdtempSync(path.join(tmpdir(), 'habilidades-alumno-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

const MIA = '---\nname: mi-propuesta\ndescription: "Arma la propuesta comercial para un prospecto con mis precios. Usar ante «hazme la propuesta»."\n---\n\n# Mi propuesta\n'

/** Una copia del alumno: las skills del cerebro, una suya, CAPAS.json y (opcional) su memoria sembrada. */
function copia(nombre: string, { crlf = false, memoria = true } = {}) {
  const raiz = path.join(tmp, nombre)
  cpSync(PLANTILLAS, path.join(raiz, '.claude', 'skills'), { recursive: true })
  mkdirSync(path.join(raiz, '.claude', 'skills', 'mi-propuesta'), { recursive: true })
  writeFileSync(path.join(raiz, '.claude', 'skills', 'mi-propuesta', 'SKILL.md'), MIA)
  if (memoria) { mkdirSync(path.join(raiz, '.claude', 'memory'), { recursive: true }); writeFileSync(path.join(raiz, '.claude', 'memory', 'MEMORY.md'), '# Memoria\n') }
  writeFileSync(path.join(raiz, 'CAPAS.json'), JSON.stringify({ skills_del_autor: DEL_AUTOR }))
  if (crlf) for (const n of [...DEL_AUTOR, 'mi-propuesta']) {
    const f = path.join(raiz, '.claude', 'skills', n, 'SKILL.md')
    writeFileSync(f, readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'))
  }
  return raiz
}

/** Las filas de Habilidades como las arma la ruta (sus mismas piezas). */
async function habilidades(raiz: string) {
  const delAutor = await skillsDelAutor(raiz)
  return readdirSync(path.join(raiz, '.claude', 'skills')).map(n => unirRel(unirRel('.claude/skills', n), 'SKILL.md')).filter(esEntradaSkill)
    .map(r => ({ ruta: r, origen: origenDe(delAutor, r), ...tituloDe(readFileSync(path.join(raiz, r), 'utf8').slice(0, 6000), r) }))
}

test('Mac y Linux: sin la memoria sembrada, la copia del alumno igual muestra su Taller (antes: «no montado», vacío)', () => {
  const sinMemoria = copia('sin-memoria', { memoria: false })
  assert.equal(raizTaller([sinMemoria], true, existsSync), sinMemoria)
  assert.equal(raizTaller([path.join(tmp, 'no-existe')], true, existsSync), null)
  // La instalación original no cambia: sigue buscando su MEMORY.md.
  assert.equal(raizTaller([sinMemoria], false, existsSync), null)
  assert.equal(raizTaller([copia('con-memoria')], false, existsSync), path.join(tmp, 'con-memoria'))
  const ruta = readFileSync(path.join(WEB, 'src/app/api/cabina/archivos/route.ts'), 'utf8')
  assert.match(ruta, /raizTaller\(RAICES\(\), esEdicionCliente\(\), existsSync\)/)
  assert.doesNotMatch(ruta, /const raiz = \(\) => RAICES\(\)\.find\(r => existsSync\(path\.join\(r, '\.claude', 'memory', 'MEMORY\.md'\)\)\)/)
})

test('cada habilidad dice su nombre y para qué sirve en palabras de persona (LF y CRLF de Windows)', async () => {
  for (const crlf of [false, true]) {
    const filas = await habilidades(copia(crlf ? 'crlf' : 'lf', { crlf }))
    assert.deepEqual(filas.map(f => f.titulo).sort(), [...DEL_AUTOR, 'mi-propuesta'].sort())
    for (const f of filas) {
      assert.ok(f.detalle && f.detalle.length >= 20, `${crlf ? 'CRLF' : 'LF'} · ${f.titulo}: sin «para qué sirve»`)
      assert.doesNotMatch(f.detalle!, /^[>|]|Usar (ante|para|cuando|siempre)|Use when|Triggers:/, `${f.titulo}: «${f.detalle}»`)
    }
    assert.match(filas.find(f => f.titulo === 'presentaciones')!.detalle!, /presentaciones/i)
  }
})

test('las 20 del cerebro traen su resumen; las que crea el alumno usan su descripción sin disparadores', async () => {
  for (const n of DEL_AUTOR) assert.ok(frontmatter(readFileSync(path.join(PLANTILLAS, n, 'SKILL.md'), 'utf8'))['metadata.resumen'], `${n} sin metadata.resumen`)
  const filas = await habilidades(copia('origen'))
  const mia = filas.find(f => f.titulo === 'mi-propuesta')!
  assert.equal(mia.origen, 'tuya')
  assert.equal(mia.detalle, 'Arma la propuesta comercial para un prospecto con mis precios.')
  for (const f of filas.filter(x => x.titulo !== 'mi-propuesta')) assert.equal(f.origen, 'arbrain', f.titulo)
  // En la instalación original (sin CAPAS.json) no hay etiqueta de origen.
  assert.equal(origenDe(await skillsDelAutor(path.join(tmp, 'no-existe')), '.claude/skills/x/SKILL.md'), undefined)
})

test('frontmatter: bloques doblados, comillas, CRLF, BOM y metadata.resumen', () => {
  const fm = frontmatter('﻿---\r\nname: x\r\ndescription: >\r\n  Primera línea\r\n  y segunda.\r\nallowed-tools: Read\r\nmetadata:\r\n  author: Yo\r\n  resumen: "Hace X por ti."\r\n---\r\n# X\r\n')
  assert.deepEqual(fm, { name: 'x', description: 'Primera línea y segunda.', 'allowed-tools': 'Read', 'metadata.author': 'Yo', 'metadata.resumen': 'Hace X por ti.' })
  assert.deepEqual(frontmatter('# sin frontmatter'), {})
  assert.equal(paraQueSirve('Ficha viva de cada cliente: quién es y qué quiere. Usar ante «contexto de X».'), 'Ficha viva de cada cliente: quién es y qué quiere.')
  assert.equal(paraQueSirve('Usar ante todo'), 'Usar ante todo')
})
