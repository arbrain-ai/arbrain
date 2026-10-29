// Programa ya compilado del modo servidor (v0.2.7, prueba de Windows del 22 oct): la huella viaja en la etiqueta firmada
// y cualquier cosa que no cuadre cae a compilar. Repos y llaves desechables en una carpeta temporal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Programa from '../../scripts/servidor/programa.mjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = Programa as any

const SHA = 'a'.repeat(64)

test('huellas: lee solo líneas bien formadas del mensaje de la etiqueta', () => {
  const m = `Arbrain v0.2.7\n\nprograma darwin-arm64 ${SHA} 123\nprograma win32-x64 ${'b'.repeat(64)} 9\nprograma linux-x64 corto 1\n  programa linux-arm64 ${SHA} 7  \n`
  const h = P.huellasDelMensaje(m)
  assert.deepEqual(Object.keys(h).sort(), ['darwin-arm64', 'linux-arm64', 'win32-x64'])
  assert.equal(h['darwin-arm64'].bytes, 123)
  assert.equal(P.bloqueDeHuellas([{ plat: 'darwin-arm64', sha256: SHA, bytes: 123 }]), `programa darwin-arm64 ${SHA} 123`)
})

function repoFirmado() {
  const d = mkdtempSync(join(tmpdir(), 'arbrain-programa-'))
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: join(d, 'repo'), encoding: 'utf8' })
  mkdirSync(join(d, 'repo', 'arbrain', 'src'), { recursive: true })
  writeFileSync(join(d, 'repo', 'arbrain', 'src', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(d, 'repo', 'VERSION'), '0.2.7\n')
  execFileSync('git', ['init', '-q'], { cwd: join(d, 'repo') })
  g('add', '-A'); g('commit', '-qm', 'v')
  for (const n of ['buena', 'ajena']) execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', n, '-f', join(d, n)])
  const ancla = join(d, 'firmas-permitidas')
  writeFileSync(ancla, `arbrain-publicacion namespaces="git" ${readFileSync(join(d, 'buena.pub'), 'utf8').split(' ').slice(0, 2).join(' ')}\n`)
  const etiquetar = (llave: string, nombre = 'v0.2.7') =>
    g('-c', 'gpg.format=ssh', '-c', `user.signingkey=${join(d, llave)}`, 'tag', '-s', nombre, '-m', `Arbrain ${nombre}\n\nprograma ${P.plataforma()} ${SHA} 10`)
  return { d, repo: join(d, 'repo'), ancla, g, etiquetar }
}

test('firma: la etiqueta de la llave del ancla se acepta y trae su huella', () => {
  const r = repoFirmado()
  r.etiquetar('buena')
  const v = P.etiquetaVerificada(r.repo, 'v0.2.7', r.ancla)
  assert.ok(v.mensaje, v.motivo)
  assert.equal(P.huellasDelMensaje(v.mensaje)[P.plataforma()].sha256, SHA)
})

test('firma: llave ajena, sin ancla, sin etiqueta o etiqueta ligera no se aceptan', () => {
  const r = repoFirmado()
  assert.match(P.etiquetaVerificada(r.repo, 'v0.2.7', r.ancla).motivo, /no tiene la etiqueta/)
  r.etiquetar('ajena')
  assert.match(P.etiquetaVerificada(r.repo, 'v0.2.7', r.ancla).motivo, /no verifica/)
  assert.match(P.etiquetaVerificada(r.repo, 'v0.2.7', join(r.d, 'no-existe')).motivo, /ancla/)
  r.g('tag', 'v0.2.8')
  assert.match(P.etiquetaVerificada(r.repo, 'v0.2.8', r.ancla).motivo, /anotada/)
})

test('fuente: si la copia cambió el código de la app (confirmado o suelto), no se usa el programa', () => {
  const r = repoFirmado()
  r.etiquetar('buena')
  assert.equal(P.fuenteIgualALaEtiqueta(r.repo, 'v0.2.7', ['arbrain/src']), true)
  writeFileSync(join(r.repo, 'arbrain', 'src', 'nuevo.ts'), 'x\n')
  assert.equal(P.fuenteIgualALaEtiqueta(r.repo, 'v0.2.7', ['arbrain/src']), false, 'archivo suelto')
  r.g('add', '-A'); r.g('commit', '-qm', 'mío')
  assert.equal(P.fuenteIgualALaEtiqueta(r.repo, 'v0.2.7', ['arbrain/src']), false, 'commit propio')
})

test('fuente: mi-marca/ (colores, logo, nombre) no es código: el programa ya compilado sigue sirviendo', () => {
  const r = repoFirmado()
  r.etiquetar('buena')
  mkdirSync(join(r.repo, 'mi-marca'), { recursive: true })
  writeFileSync(join(r.repo, 'mi-marca', 'tema.css'), 'html:root:not(.dark) { --primary: #0E7C66; }\n')
  writeFileSync(join(r.repo, 'mi-marca', 'marca.json'), '{ "nombre": "Acme" }\n')
  assert.equal(P.fuenteIgualALaEtiqueta(r.repo, 'v0.2.7'), true, 'suelto, con las rutas reales del programa')
  r.g('add', '-A'); r.g('commit', '-qm', 'mi marca')
  assert.equal(P.fuenteIgualALaEtiqueta(r.repo, 'v0.2.7'), true, 'confirmado en su rama')
  assert.ok(!P.RUTAS_PROGRAMA.some((x: string) => 'mi-marca/tema.css'.startsWith(x)))
})

test('programaYaCompilado: sin firma válida o con huella que no cuadra devuelve null (se compila)', async () => {
  const r = repoFirmado()
  const avisos: string[] = []
  const sinEtiqueta = await P.programaYaCompilado({ repo: r.repo, dirProgramas: join(r.d, 'programa'), version: '0.2.7', ancla: r.ancla, avisar: (m: string) => avisos.push(m) })
  assert.equal(sinEtiqueta, null)
  assert.match(avisos.join('\n'), /Compilo aquí/)
  r.etiquetar('buena')
  // Servidor local que entrega bytes que NO son los de la huella firmada.
  const http = await import('node:http')
  const srv = http.createServer((_q, s) => { s.end('0123456789') })
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok))
  const { port } = srv.address() as { port: number }
  process.env.ARBRAIN_PROGRAMA_BASE = `http://127.0.0.1:${port}`
  try {
    const mala = await P.programaYaCompilado({ repo: r.repo, dirProgramas: join(r.d, 'programa'), version: '0.2.7', ancla: r.ancla, avisar: (m: string) => avisos.push(m) })
    assert.equal(mala, null)
    assert.match(avisos.at(-1) ?? '', /no coincide con la huella firmada/)
  } finally {
    delete process.env.ARBRAIN_PROGRAMA_BASE
    srv.close()
  }
})
