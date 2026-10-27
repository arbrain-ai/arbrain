/**
 * Cerca del modo espejo desde el daemon: apagado no lanza nada; encendido, la llave va por stdin (nunca por argv ni
 * entorno) y el veredicto de la cerca manda. La cerca real se prueba en arbrain/scripts/espejo/pruebas; aquí un
 * guardia falso que registra lo que recibe.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cercaEspejo, entornoCerca } from './espejo.js'

const LLAVE = 'sk-or-v1-' + 'z'.repeat(48)

function guardiaFalso(respuesta: string): { ruta: string; registro: string } {
  const dir = mkdtempSync(join(tmpdir(), 'espejo-guarda-'))
  const registro = join(dir, 'registro.json')
  const ruta = join(dir, 'guarda.mjs')
  writeFileSync(ruta, `import { readFileSync, writeFileSync } from 'node:fs'
const stdin = readFileSync(0, 'utf8')
writeFileSync(${JSON.stringify(registro)}, JSON.stringify({ argv: process.argv.slice(2), stdin, env: process.env }))
process.stdout.write(${JSON.stringify(respuesta)} + '\\n')
`)
  return { ruta, registro }
}

describe('cercaEspejo', () => {
  it('con el espejo apagado (sin ARBRAIN_ESPEJO_GUARDA) corre como siempre y no lanza nada', async () => {
    expect(await cercaEspejo('brief', {}, LLAVE)).toEqual({ correr: true })
  })

  it('pasa la llave solo por stdin y obedece el veredicto', async () => {
    const g = guardiaFalso(JSON.stringify({ correr: false, tipo: 'aviso', codigo: 'sin_tope', motivo: 'Tu llave de OpenRouter no tiene tope' }))
    const r = await cercaEspejo('brief-manana', { ARBRAIN_ESPEJO_GUARDA: g.ruta, ARBRAIN_HOME: tmpdir(), PATH: process.env.PATH, OPENROUTER_API_KEY: LLAVE }, LLAVE)
    expect(r).toMatchObject({ correr: false, tipo: 'aviso', codigo: 'sin_tope' })
    const visto = JSON.parse(readFileSync(g.registro, 'utf8'))
    expect(visto.stdin.trim()).toBe(LLAVE)
    expect(JSON.stringify(visto.argv)).not.toContain(LLAVE)
    expect(JSON.stringify(visto.env)).not.toContain(LLAVE)
    expect(visto.argv).toEqual(expect.arrayContaining(['cerca', '--rutina', 'brief-manana', '--llave-stdin']))
  })

  it('folio ya registrado: omitir sin error', async () => {
    const g = guardiaFalso(JSON.stringify({ correr: false, tipo: 'omitir', codigo: 'folio', folio: 'brief:2026-10-23:-', motivo: 'Ya salió hoy' }))
    expect(await cercaEspejo('brief', { ARBRAIN_ESPEJO_GUARDA: g.ruta, PATH: process.env.PATH }, LLAVE)).toMatchObject({ correr: false, tipo: 'omitir', folio: 'brief:2026-10-23:-' })
  })

  it('una cerca rota no deja correr la rutina', async () => {
    const g = guardiaFalso('esto no es json')
    expect(await cercaEspejo('brief', { ARBRAIN_ESPEJO_GUARDA: g.ruta, PATH: process.env.PATH }, LLAVE)).toMatchObject({ correr: false, codigo: 'cerca_fallo' })
    expect(await cercaEspejo('brief', { ARBRAIN_ESPEJO_GUARDA: '/no/existe.mjs', PATH: process.env.PATH }, LLAVE)).toMatchObject({ correr: false })
  })

  it('el entorno de la cerca no lleva llaves ni tokens', () => {
    const e = entornoCerca({ PATH: '/bin', HOME: '/h', OPENROUTER_API_KEY: LLAVE, ANTHROPIC_API_KEY: 'x', OPENCLAW_GATEWAY_TOKEN: 't', ARBRAIN_ESPEJO_AHORA: '2026-10-23T07:00:00Z', ARBRAIN_ESPEJO_GUARDA: '/g' })
    expect(e).toEqual({ PATH: '/bin', HOME: '/h', ARBRAIN_ESPEJO_AHORA: '2026-10-23T07:00:00Z' })
  })
})
