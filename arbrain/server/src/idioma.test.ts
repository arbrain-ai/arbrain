// Idioma del agente (13 nov 2026): con English en Ajustes, cada sesión del chat y cada rutina nacen con la instrucción
// de contestar en inglés; con español (o sin archivo) las opciones del SDK no cambian en nada.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { INSTRUCCION_INGLES, RUTAS_MARCADOR_IDIOMA, idiomaInstalacion, marcadorIdioma, normalizarIdioma, opcionesIdioma, rutasMarcadorDe } from './idioma.js'
import { fijarIdiomaPrueba, tr } from './i18n/tr.js'

describe('idioma de la instalación', () => {
  afterEach(() => fijarIdiomaPrueba(null))

  it('sin archivo es español; el archivo manda; ARBRAIN_IDIOMA manda sobre el archivo; BOM y basura no rompen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idioma-daemon-'))
    // Sin marcador (hermética también dentro de una copia inglesa, que trae arbrain/IDIOMA).
    const sin: string[] = []
    expect(idiomaInstalacion({}, dir, sin)).toBe('es')
    writeFileSync(join(dir, 'idioma.json'), JSON.stringify({ idioma: 'en' }))
    expect(idiomaInstalacion({}, dir, sin)).toBe('en')
    expect(idiomaInstalacion({ ARBRAIN_IDIOMA: 'es' }, dir, sin)).toBe('es')
    writeFileSync(join(dir, 'idioma.json'), '﻿{"idioma":"en"}')
    expect(idiomaInstalacion({}, dir, sin)).toBe('en')
    writeFileSync(join(dir, 'idioma.json'), '{roto')
    expect(idiomaInstalacion({}, dir, sin)).toBe('es')
  })

  it('marcador IDIOMA de la copia inglesa (fase 3): ARBRAIN_IDIOMA > idioma.json de Ajustes > marcador > español', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idioma-daemon-'))
    const marcador = join(mkdtempSync(join(tmpdir(), 'idioma-marcador-')), 'IDIOMA')
    const rutas = [join(dir, 'no-existe', 'IDIOMA'), marcador]
    writeFileSync(marcador, '# Language of this Arbrain copy.\n\nen\n')
    expect(marcadorIdioma(rutas)).toBe('en')
    expect(idiomaInstalacion({}, dir, rutas)).toBe('en') // sin nada elegido en Ajustes: nace en inglés
    writeFileSync(join(dir, 'idioma.json'), JSON.stringify({ idioma: 'es' }))
    expect(idiomaInstalacion({}, dir, rutas)).toBe('es') // la persona volvió a Español en Ajustes: gana el archivo
    writeFileSync(join(dir, 'idioma.json'), '{roto')
    expect(idiomaInstalacion({}, dir, rutas)).toBe('en') // Ajustes ilegible cuenta como ausente
    expect(idiomaInstalacion({ ARBRAIN_IDIOMA: 'es' }, dir, rutas)).toBe('es')
    writeFileSync(marcador, 'es\n')
    expect(idiomaInstalacion({}, join(dir, 'otra'), rutas)).toBe('es')
    writeFileSync(marcador, '# solo comentarios\n')
    expect(marcadorIdioma(rutas)).toBe(null)
    expect(marcadorIdioma([])).toBe(null)
  })

  it('busca arbrain/server/IDIOMA y arbrain/IDIOMA junto a este módulo (como el marcador EDICION)', () => {
    expect(RUTAS_MARCADOR_IDIOMA[0].endsWith(join('server', 'IDIOMA'))).toBe(true)
    expect(RUTAS_MARCADOR_IDIOMA[1].endsWith(join('arbrain', 'IDIOMA'))).toBe(true)
  })

  it('en español la sesión queda idéntica; en inglés lleva la instrucción de sistema', () => {
    expect(opcionesIdioma('es')).toEqual({})
    expect(opcionesIdioma('en')).toEqual({ systemPrompt: INSTRUCCION_INGLES })
    expect(INSTRUCCION_INGLES).toMatch(/US English/)
    expect(INSTRUCCION_INGLES).toMatch(/Arbrain, Levy/)
  })

  it('normaliza variantes', () => {
    for (const v of ['en', 'EN', 'en-US', 'english', 'inglés']) expect(normalizarIdioma(v)).toBe('en')
    for (const v of ['es', '', null, 'fr']) expect(normalizarIdioma(v)).toBe('es')
  })

  it('tr del daemon: español tal cual, variables, y sin traducción cae al español', () => {
    fijarIdiomaPrueba('es')
    expect(tr('Hola, {nombre}', { nombre: 'Fulano' })).toBe('Hola, Fulano')
    fijarIdiomaPrueba('en')
    expect(tr('Texto que no está en el catálogo')).toBe('Texto que no está en el catálogo')
    expect(tr('Ajustes')).toBe('Settings')
  })
  it('daemon compilado fuera de la copia (app de escritorio, modo servidor): también busca <ARBRAIN_HOME>/arbrain/IDIOMA', () => {
    expect(rutasMarcadorDe({})).toEqual([...RUTAS_MARCADOR_IDIOMA])
    const home = mkdtempSync(join(tmpdir(), 'idioma-home-'))
    mkdirSync(join(home, 'arbrain'), { recursive: true })
    writeFileSync(join(home, 'arbrain', 'IDIOMA'), 'en\n')
    const rutas = rutasMarcadorDe({ ARBRAIN_HOME: home })
    expect(rutas.at(-1)).toBe(join(home, 'arbrain', 'IDIOMA'))
    const config = mkdtempSync(join(tmpdir(), 'idioma-config-'))
    expect(idiomaInstalacion({ ARBRAIN_HOME: home }, config, [join(home, 'arbrain', 'IDIOMA')])).toBe('en')
  })
})
