import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { query, Query } from '@anthropic-ai/claude-agent-sdk'
import { anotarUso, CONFIG_ABLITERATED, configAbliterated, costoDeUso, destinoAbliterated, entornoAbliterated, motivoNoDisponible, resumenUso } from './abliterated-chat.js'
import { entornoClaude, fijarSecreto, llavesByok, parsearSecretos, vaciarCofreParaPruebas } from '../cliente/cofre.js'
import { ClaudeInteractiveSession } from './claude-session.js'
import { seleccionAbliterated } from './claude-selection.js'
import { catalogoPublico, ID_ABLITERATED } from '../modelos/catalogo.js'
import { cuentasChat } from '../modelos/registro.js'

const sinLlave = () => null
const conLlave = () => 'llave-archivo'

describe('espacio abliterated: destino y llave', () => {
  it('sin pod va a abliteration.ai con la llave del .env o, si falta, la del archivo', () => {
    expect(destinoAbliterated({}, { ABLITERATION_AI_API_KEY: 'llave-env' }, conLlave)).toMatchObject({ destino: 'abliteration.ai', baseUrl: 'https://api.abliteration.ai', token: 'llave-env', modelo: 'abliterated-model-large-flash' })
    expect(destinoAbliterated({}, {}, conLlave).token).toBe('llave-archivo')
    expect(destinoAbliterated({}, {}, sinLlave).token).toBeNull()
  })
  it('el pod va en pareja: su URL con SU llave, nunca la de abliteration.ai', () => {
    const d = destinoAbliterated({}, { ABLITERATED_BASE_URL: 'https://pod.example:8000', ABLITERATION_AI_API_KEY: 'llave-abl', CABINA_MODELO_ABLITERATED: 'ds41' }, conLlave)
    expect(d).toMatchObject({ destino: 'pod', baseUrl: 'https://pod.example:8000', token: null, modelo: 'ds41' })
    expect(motivoNoDisponible(d, false)).toMatch(/ABLITERATED_API_KEY/)
    expect(destinoAbliterated({}, { ABLITERATED_BASE_URL: 'https://pod.example:8000', ABLITERATED_API_KEY: 'llave-pod' }, sinLlave).token).toBe('llave-pod')
  })
  it('sin llave no está disponible y dice dónde ponerla', () => {
    const d = destinoAbliterated({}, {}, sinLlave)
    expect(motivoNoDisponible(d, false)).toMatch(/ABLITERATION_AI_API_KEY.*abliteration\.key/)
    expect(motivoNoDisponible({ ...d, token: 'x' }, false)).toBeNull()
  })
})

describe('espacio abliterated: edición del alumno (v0.2.23, su propia llave)', () => {
  it('solo abliteration.ai con la llave de SU cofre: ni pod, ni .env, ni archivo de llaves', () => {
    vaciarCofreParaPruebas()
    try {
      const pod = { ABLITERATED_BASE_URL: 'https://pod.example:8000', ABLITERATED_API_KEY: 'llave-pod', ABLITERATION_AI_API_KEY: 'llave-env' }
      const sin = destinoAbliterated(pod, pod, conLlave, true)
      expect(sin).toMatchObject({ destino: 'abliteration.ai', baseUrl: 'https://api.abliteration.ai', modelo: 'abliterated-model-large-flash', token: null })
      expect(motivoNoDisponible(sin, true)).toMatch(/Ajustes › Sin filtro/)
      fijarSecreto('ABLITERATION_AI_API_KEY', 'llave-alumno')
      const con = destinoAbliterated(pod, pod, conLlave, true)
      expect(con.token).toBe('llave-alumno')
      expect(motivoNoDisponible(con, true)).toBeNull()
    } finally { vaciarCofreParaPruebas() }
  })
  it('su llave entra al cofre, nunca cuenta como llave del chat y nunca llega al CLI de Claude', () => {
    vaciarCofreParaPruebas()
    try {
      expect(parsearSecretos(JSON.stringify({ ABLITERATION_AI_API_KEY: ' abl-123 ' }))).toEqual({ ABLITERATION_AI_API_KEY: 'abl-123' })
      fijarSecreto('ABLITERATION_AI_API_KEY', 'abl-123')
      expect(llavesByok()).not.toHaveProperty('ABLITERATION_AI_API_KEY')
      expect(entornoClaude({ PATH: '/bin', ABLITERATION_AI_API_KEY: 'abl-123' }, true)).not.toHaveProperty('ABLITERATION_AI_API_KEY')
    } finally { vaciarCofreParaPruebas() }
  })
  it('su carpeta de Claude Code vive dentro de los datos de su Arbrain', () => {
    expect(configAbliterated(true, { ARBRAIN_DATA_DIR: '/datos/daemon' })).toBe('/datos/daemon/claude-abliterated')
    expect(configAbliterated(false, { ARBRAIN_DATA_DIR: '/datos/daemon' })).toBe(CONFIG_ABLITERATED)
  })
})

describe('espacio abliterated: entorno del CLI', () => {
  const d = { destino: 'abliteration.ai' as const, baseUrl: 'https://api.abliteration.ai', modelo: 'abliterated-model-large-flash', token: 'tok' }
  it('quita toda credencial de Anthropic, pone la del endpoint, su carpeta y el modelo en todas las ranuras', () => {
    const env = entornoAbliterated({ PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant', ANTHROPIC_AUTH_TOKEN: 'otro', ANTHROPIC_BASE_URL: 'https://api.anthropic.com', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CONFIG_DIR: '/Users/x/.claude' }, d)
    expect(env).toMatchObject({ PATH: '/bin', ANTHROPIC_AUTH_TOKEN: 'tok', ANTHROPIC_BASE_URL: 'https://api.abliteration.ai', CLAUDE_CONFIG_DIR: CONFIG_ABLITERATED, ANTHROPIC_MODEL: d.modelo, ANTHROPIC_DEFAULT_HAIKU_MODEL: d.modelo, CLAUDE_CODE_SUBAGENT_MODEL: d.modelo, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
  })
  it('conserva el proxy local de imágenes (solo loopback); cualquier otro destino se ignora', () => {
    expect(entornoAbliterated({ PATH: '/bin' }, d, 'http://127.0.0.1:51234').ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:51234')
    expect(entornoAbliterated({ PATH: '/bin' }, d, 'https://evil.example').ANTHROPIC_BASE_URL).toBe('https://api.abliteration.ai')
    expect(entornoAbliterated({ PATH: '/bin' }, d, 'https://api.anthropic.com').ANTHROPIC_BASE_URL).toBe('https://api.abliteration.ai')
  })
  it('sin token lanza: nunca se cae a otra cuenta', () => {
    expect(() => entornoAbliterated({}, { ...d, token: null })).toThrow(/no está disponible/)
  })
  it('la sesión del pool corre con ese entorno y no pide confirmar suscripción (no es Claude)', async () => {
    const accountInfo = vi.fn()
    let visto: Record<string, string> | undefined
    const create = (({ options }: Parameters<typeof query>[0]) => {
      visto = options?.env as Record<string, string>
      return { accountInfo, close() {}, interrupt: async () => ({}), async *[Symbol.asyncIterator]() { /* nada */ } } as unknown as Query
    }) as typeof query
    const prev = process.env.ABLITERATION_AI_API_KEY
    process.env.ABLITERATION_AI_API_KEY = 'tok-proc'
    try {
      const s = new ClaudeInteractiveSession({ owner: 'o', account: 'abliterated', conversationId: 'c' }, { env: { ANTHROPIC_API_KEY: 'sk-ant' } }, () => {}, create)
      expect(visto).toMatchObject({ ANTHROPIC_AUTH_TOKEN: 'tok-proc', CLAUDE_CONFIG_DIR: CONFIG_ABLITERATED })
      expect(visto!.ANTHROPIC_API_KEY).toBeUndefined()
      expect(accountInfo).not.toHaveBeenCalled()
      s.close(); await s.drained
    } finally { if (prev === undefined) delete process.env.ABLITERATION_AI_API_KEY; else process.env.ABLITERATION_AI_API_KEY = prev }
  })
})

describe('espacio abliterated: selección, catálogo y espacios', () => {
  it('la selección es fija y rechaza esfuerzo y ultracode', () => {
    const prev = process.env.ABLITERATION_AI_API_KEY
    process.env.ABLITERATION_AI_API_KEY = 'tok'
    try {
      expect(seleccionAbliterated({ fast: false, ultracode: false } as never)).toMatchObject({ account: 'abliterated', effort: null, fast: false, ultracode: false, adaptiveThinking: false })
      expect(() => seleccionAbliterated({ fast: false, ultracode: false } as never, 'high')).toThrow(/esfuerzo/)
      expect(() => seleccionAbliterated({ fast: false, ultracode: true } as never)).toThrow(/ultracode/)
    } finally { if (prev === undefined) delete process.env.ABLITERATION_AI_API_KEY; else process.env.ABLITERATION_AI_API_KEY = prev }
  })
  const base = { openrouter: { consultadoEn: '', modelos: new Map(), error: null }, habilitados: [], resolverClaude: () => null, motorApi: false, llave: false }
  it('el catálogo la muestra siempre (sin interruptor); sin llave, deshabilitada con su motivo y su tarifa', () => {
    const sin = catalogoPublico({ ...base, cliente: false, abliterated: { modelo: 'm', motivo: 'Falta la llave' } }).modelos.find(m => m.id === ID_ABLITERATED)!
    expect(sin).toMatchObject({ via: 'abliterated', cuenta: 'abliterated', habilitado: true, disponible: false, motivo: 'Falta la llave', openrouter: { precio: { entrada: 1, salida: 2 } } })
    const con = catalogoPublico({ ...base, cliente: false, abliterated: { modelo: 'm', motivo: null } }).modelos.find(m => m.id === ID_ABLITERATED)!
    expect(con).toMatchObject({ habilitado: true, disponible: true, motivo: null, modelo: 'm' })
  })
  it('en la edición del alumno existe (v0.2.23): en el catálogo y como espacio; sin llave, deshabilitado con el motivo', () => {
    const fila = catalogoPublico({ ...base, cliente: true, abliterated: { modelo: 'm', motivo: 'Pon tu llave de abliteration.ai en Ajustes › Sin filtro.' } }).modelos.find(m => m.via === 'abliterated')
    expect(fila).toMatchObject({ disponible: false, habilitado: true, cuenta: 'abliterated' })
    vi.stubEnv('ARBRAIN_EDICION', 'cliente')
    try { expect(cuentasChat()).toContain('abliterated') } finally { vi.unstubAllEnvs() }
    expect(cuentasChat()).toContain('abliterated')
  })
})

describe('espacio abliterated: costo por turno', () => {
  it('tarifa 1 / 0.10 / 2 por millón; la escritura de caché como entrada', () => {
    // turno real del 3 nov: 54 de entrada, 57 088 escritos en caché, 117 de salida
    expect(costoDeUso({ input_tokens: 54, cache_creation_input_tokens: 57088, cache_read_input_tokens: 0, output_tokens: 117 }).costoUsd).toBeCloseTo(0.057376, 6)
    expect(costoDeUso({ input_tokens: 111, cache_creation_input_tokens: 640, cache_read_input_tokens: 57216, output_tokens: 3 }).costoUsd).toBeCloseTo(0.0064786, 7)
    expect(costoDeUso({}).costoUsd).toBe(0)
  })
  it('la bitácora suma turnos y estima cuántos alcanza un dólar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'abl-'))
    expect(resumenUso(dir)).toEqual({ turnos: 0, costoUsd: 0, promedioUsd: null, turnosPorDolar: null })
    anotarUso(dir, { ...costoDeUso({ input_tokens: 0, output_tokens: 10_000 }), destino: 'abliteration.ai', modelo: 'm' })
    anotarUso(dir, { ...costoDeUso({ input_tokens: 0, output_tokens: 30_000 }), destino: 'abliteration.ai', modelo: 'm' })
    writeFileSync(join(dir, 'abliterated-uso.jsonl'), 'línea rota\n', { flag: 'a' })
    expect(resumenUso(dir)).toMatchObject({ turnos: 2, costoUsd: 0.08, turnosPorDolar: 25 })
  })
})
