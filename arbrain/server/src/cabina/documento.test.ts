import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO, resolverRuta, tipoDocumento, validarDocumento } from './documento.js'
import { callCabina, parseMostrar } from './tools.js'

const raices = { repo: '/Users/x/Developer/artificial-brain', home: '/Users/x' }

describe('vista documento', () => {
  it('resuelve relativa al repo, ~ y absoluta dentro de las raíces', () => {
    expect(resolverRuta('docs/a.md', raices)).toEqual({ abs: '/Users/x/Developer/artificial-brain/docs/a.md' })
    expect(resolverRuta('~/Developer/otro/b.txt', raices)).toEqual({ abs: '/Users/x/Developer/otro/b.txt' })
    expect(resolverRuta('/tmp/c.html', raices)).toEqual({ abs: '/tmp/c.html' })
  })
  it('rechaza subir, salir de las raíces y credenciales', () => {
    expect(resolverRuta('docs/../../x.md', raices)).toMatchObject({ error: expect.stringMatching(/\.\./) })
    expect(resolverRuta('/etc/hosts', raices)).toMatchObject({ error: expect.stringMatching(/repo/) })
    expect(resolverRuta('~/Library/a.md', raices)).toMatchObject({ error: expect.any(String) })
    expect(resolverRuta('~/Developer/p/.ssh/notas.md', raices)).toMatchObject({ error: expect.stringMatching(/credenciales/) })
    expect(resolverRuta('~/Developer/p/.docker/a.txt', raices)).toMatchObject({ error: expect.any(String) })
    for (const n of ['.env', '.env.local', 'id_rsa', 'cert.pem', 'clave.key', 'credenciales-operativas.md'])
      expect(resolverRuta(`~/Developer/p/${n}`, raices)).toMatchObject({ error: expect.stringMatching(/llave|credencial/) })
  })
  it('clasifica por extensión y nunca enseña código', () => {
    expect(['a.md', 'a.txt', 'a.html', 'a.mmd', 'a.png', 'a.mov', 'a.ts', 'a.json', 'a.zip'].map(tipoDocumento))
      .toEqual(['md', 'txt', 'html', 'mermaid', 'imagen', 'video', 'codigo', 'codigo', 'otro'])
    expect(validarDocumento('arbrain/server/src/cabina/tools.ts')).toMatchObject({ error: expect.stringMatching(/código/) })
  })
  it('exige que exista y que un enlace no salga de lo permitido', () => {
    const dir = `/tmp/cabina-doc-test-${process.pid}`
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/ok.md`, '# hola')
    try { symlinkSync('/etc/hosts', `${dir}/fuera.md`) } catch { /* ya existe */ }
    expect(validarDocumento(`${dir}/ok.md`)).toMatchObject({ tipo: 'md' })
    expect(validarDocumento(`${dir}/no-existe.md`)).toMatchObject({ error: expect.stringMatching(/No existe/) })
    expect(validarDocumento(`${dir}/fuera.md`)).toMatchObject({ error: expect.stringMatching(/fuera/) })
    expect(validarDocumento(dir)).toMatchObject({ tipo: 'carpeta' })
  })
  it('mostrar documento: ruta, título de pestaña, compararCon y soltar', () => {
    // La raíz es la carpeta que contiene arbrain/server, se llame como se llame (checkout, worktree o copia del alumno).
    expect(existsSync(join(REPO, 'arbrain', 'server', 'package.json'))).toBe(true)
    const v = parseMostrar({ vista: 'documento', ruta: 'CLAUDE.md', titulo: 'Contrato', fijar: true, compararCon: 'HEAD' })
    expect(v).toMatchObject({ vista: 'documento', ruta: 'CLAUDE.md', titulo: 'Contrato', fijar: true, compararCon: 'HEAD' })
    expect(() => parseMostrar({ vista: 'documento' })).toThrow(/ruta/)
    expect(() => parseMostrar({ vista: 'calendario', ruta: 'CLAUDE.md' })).toThrow(/solo aplican/)
    expect(() => parseMostrar({ vista: 'documento', ruta: 'CLAUDE.md', fijar: true, soltar: true })).toThrow(/a la vez/)
    expect(callCabina('mostrar', { vista: 'documento', ruta: 'CLAUDE.md', titulo: 'Contrato', fijar: true }).text).toMatch(/«Contrato».*fijado como pestaña/)
    expect(callCabina('mostrar', { vista: 'documento', ruta: 'CLAUDE.md', soltar: true }).text).toMatch(/quitada/)
    expect(callCabina('mostrar', { vista: 'documento', ruta: 'arbrain/server/package.json' }).error).toBe(true)
  })
})

describe('visor único: pdf, audio, carpeta, versiones y tiempo', () => {
  it('clasifica pdf y audio y acepta tiempo, compararCon y versiones de video', () => {
    expect(['a.pdf', 'a.m4a', 'a.wav'].map(tipoDocumento)).toEqual(['pdf', 'audio', 'audio'])
    const dir = `/tmp/cabina-visor-test-${process.pid}`
    mkdirSync(dir, { recursive: true })
    for (const n of ['v1.mp4', 'v2.mp4', 'v3.mp4', 'a.m4a', 'x.pdf']) writeFileSync(`${dir}/${n}`, 'x')
    const ok = parseMostrar({ vista: 'documento', ruta: `${dir}/v1.mp4`, compararCon: `${dir}/v2.mp4`, versiones: [`${dir}/v3.mp4`], tiempo: 130.4 })
    expect(ok).toMatchObject({ compararCon: `${dir}/v2.mp4`, versiones: [`${dir}/v3.mp4`], tiempo: 130.4 })
    expect(() => parseMostrar({ vista: 'documento', ruta: `${dir}/x.pdf`, tiempo: 3 })).toThrow(/video y audio/)
    expect(() => parseMostrar({ vista: 'documento', ruta: `${dir}/v1.mp4`, compararCon: `${dir}/a.m4a` })).toThrow(/debe ser video/)
    expect(() => parseMostrar({ vista: 'documento', ruta: `${dir}/x.pdf`, versiones: [`${dir}/v1.mp4`] })).toThrow(/solo aplica a video e imagen/)
    expect(parseMostrar({ vista: 'documento', ruta: dir })).toMatchObject({ ruta: dir })
    expect(callCabina('mostrar', { vista: 'documento', ruta: `${dir}/v1.mp4`, tiempo: 12 }).text).toMatch(/abierto en 12 s/)
  })
})

describe('soltar por id de pestaña', () => {
  it('pestana solo con soltar:true y se entrega al comando', () => {
    expect(() => parseMostrar({ vista: 'calendario', pestana: 'levy-1' })).toThrow(/solo aplica con soltar/)
    expect(parseMostrar({ vista: 'calendario', soltar: true, pestana: 'levy-1' }).pestana).toBe('levy-1')
  })
})
