import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buscarModelo, resolverEleccion, type Catalogo } from './catalogo-delegar.js'
import { ADAPTADORES, defaultsDelegar } from './harness/index.js'
import { camposDelegar } from './ayuda.js'
import { esfuerzoParaCli } from './sin-pantalla.js'

/** El catálogo vivo tal como lo devolvió el agent-server del Studio el 29 oct 2026 (/models?account=default|codex). */
const CLAUDE: Catalogo = { actual: null, modelos: [
  { value: 'opus', resolvedModel: 'claude-opus-5-5', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', supportedEfforts: ['low', 'medium', 'high'] },
] }
const CODEX: Catalogo = { actual: 'gpt-6.1-sol', modelos: [
  { value: 'gpt-5.6-terra', supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] },
  { value: 'gpt-5.6-luna', supportedEfforts: ['low', 'medium', 'high', 'xhigh'] },
] }
const vivo = (c: Catalogo | null) => async () => c
const sinEnv = () => undefined

describe('delegar: modelo y esfuerzo contra el catálogo vivo (brecha 2)', () => {
  it('default de la casa: sale del adaptador y la respuesta lo dice', async () => {
    const e = await resolverEleccion(ADAPTADORES.claude, { esfuerzo: 'max' }, sinEnv, vivo(CLAUDE))
    expect(e).toMatchObject({ modelo: 'claude-opus-5-5', esfuerzo: 'max', catalogo: 'vivo' })
    expect(e.resumen).toBe('modelo claude-opus-5-5 (default de la casa, harness/claude.ts) · esfuerzo max (pedido) · validado contra el catálogo vivo')
  })
  it('CABINA_MODELO_CLAUDE del .env manda sobre el default, y se nombra', async () => {
    const e = await resolverEleccion(ADAPTADORES.claude, {}, k => k === 'CABINA_MODELO_CLAUDE' ? 'claude-sonnet-5-5' : undefined, vivo(CLAUDE))
    expect(e.origen.modelo).toBe('CABINA_MODELO_CLAUDE del .env')
    expect(e.resumen).toContain('esfuerzo sin pedir (default de claude)')
  })
  it('un modelo que no está en el catálogo se rechaza ANTES de lanzar, con la lista', async () => {
    await expect(resolverEleccion(ADAPTADORES.claude, { modelo: 'claude-opus-9-9' }, sinEnv, vivo(CLAUDE))).rejects.toThrow(/no está en el catálogo vivo de claude\. Hay: opus \(claude-opus-5-5\)/)
  })
  it('un esfuerzo que el modelo no soporta se rechaza con los que sí', async () => {
    await expect(resolverEleccion(ADAPTADORES.claude, { modelo: 'claude-sonnet-5-5', esfuerzo: 'max' }, sinEnv, vivo(CLAUDE))).rejects.toThrow('«max» no es un esfuerzo de claude-sonnet-5-5 en claude. Acepta: low, medium, high.')
  })
  it('codex: si su modelo acepta max, va max; si no, baja a xhigh y se dice; sin catálogo, xhigh', async () => {
    const terra = await resolverEleccion(ADAPTADORES.codex, { modelo: 'gpt-5.6-terra', esfuerzo: 'max' }, sinEnv, vivo(CODEX))
    expect(terra).toMatchObject({ esfuerzo: 'max', esfuerzoCli: 'max' })
    expect(terra.origen.esfuerzo).toBe('pedido')
    const e = await resolverEleccion(ADAPTADORES.codex, { modelo: 'gpt-5.6-luna', esfuerzo: 'max' }, sinEnv, vivo(CODEX))
    expect(e).toMatchObject({ esfuerzo: 'max', esfuerzoCli: 'xhigh' })
    expect(e.origen.esfuerzo).toBe('pedido; codex corre xhigh, su techo')
    expect((await resolverEleccion(ADAPTADORES.codex, { modelo: 'gpt-5.6-terra', esfuerzo: 'max' }, sinEnv, vivo(null))).esfuerzoCli).toBe('xhigh')
    // claude acepta max: viaja tal cual
    expect((await resolverEleccion(ADAPTADORES.claude, { esfuerzo: 'max' }, sinEnv, vivo(CLAUDE))).esfuerzoCli).toBe('max')
  })
  it('el modelo de la config de codex que no está en el catálogo se rechaza', async () => {
    await expect(resolverEleccion(ADAPTADORES.codex, {}, sinEnv, vivo(CODEX))).rejects.toThrow(/config de codex \(«gpt-6\.1-sol»\) no está en su catálogo vivo/)
  })
  it('sin catálogo (agent-server caído) valida la forma y lo dice; sin catálogo propio, también', async () => {
    const e = await resolverEleccion(ADAPTADORES.claude, {}, sinEnv, vivo(null))
    expect(e.catalogo).toBe('no-respondio')
    expect(e.resumen).toContain('el catálogo vivo no respondió')
    await expect(resolverEleccion(ADAPTADORES.claude, { esfuerzo: 'altisimo' }, sinEnv, vivo(null))).rejects.toThrow(/Esfuerzo inválido/)
    const o = await resolverEleccion(ADAPTADORES.opencode, {}, sinEnv)
    expect(o.catalogo).toBe('sin-catalogo')
    await expect(resolverEleccion(ADAPTADORES.gemini, { esfuerzo: 'high' }, sinEnv)).rejects.toThrow(/gemini no recibe esfuerzo/)
  })
  it('al lanzar: el valor del catálogo manda; registros viejos sin él caen al equivalente del adaptador', () => {
    expect(esfuerzoParaCli(ADAPTADORES.codex, 'max', 'max')).toBe('max')
    expect(esfuerzoParaCli(ADAPTADORES.codex, 'max', null)).toBe('xhigh')
    expect(esfuerzoParaCli(ADAPTADORES.claude, 'max', null)).toBe('max')
    expect(esfuerzoParaCli(ADAPTADORES.codex, null, null)).toBeNull()
  })
  it('buscarModelo por valor, por id resuelto y sin el calificador [1m]', () => {
    expect(buscarModelo(CLAUDE, 'opus')?.resolvedModel).toBe('claude-opus-5-5')
    expect(buscarModelo(CLAUDE, 'claude-opus-5-5')?.value).toBe('opus')
    expect(buscarModelo(CLAUDE, 'claude-fable-5-1')?.value).toBe('claude-fable-5-1[1m]')
    expect(ADAPTADORES.claude.modeloOk('claude-fable-5-1[1m]')).toBe(true)
  })
})

describe('guardianes: una sola fuente del default de modelo', () => {
  const raiz = dirname(fileURLToPath(import.meta.url))
  const archivos = (d: string): string[] => readdirSync(d).flatMap(n => {
    const r = join(d, n)
    return statSync(r).isDirectory() ? (n === 'muestras' ? [] : archivos(r)) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [r] : []
  })
  it('ningún literal de modelo Claude en server/src/cabina fuera de harness/claude.ts y juez.ts', () => {
    const permitidos = new Set(['harness/claude.ts', 'juez.ts'])
    const fuera = archivos(raiz).map(f => relative(raiz, f)).filter(f => !permitidos.has(f) && /claude-(opus|sonnet|haiku|fable)-\d/.test(readFileSync(join(raiz, f), 'utf8')))
    expect(fuera, `literales de modelo fuera de la fuente única: ${fuera.join(', ')}`).toEqual([])
  })
  it('la ayuda de delegar cita los defaults reales de cada adaptador (y la variable que los cambió)', () => {
    const texto = camposDelegar(sinEnv)
    for (const d of defaultsDelegar(sinEnv)) expect(texto).toContain(`${d.harness} → ${d.modelo ?? 'el de su config'}`)
    expect(camposDelegar(k => k === 'CABINA_MODELO_CLAUDE' ? 'claude-x' : undefined)).toContain('claude → claude-x (CABINA_MODELO_CLAUDE del .env)')
  })
})
