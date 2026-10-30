import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCatalog, CommandCatalogService, mergeInitNames, parseFrontmatter, readSkillsFromDisk, snapshotFrom, type SdkSnapshot } from './command-catalog.js'
import { interceptsGoal } from './chat-goal.js'

const sdk = (): SdkSnapshot => snapshotFrom([
  { name: 'compact', description: 'Compactar', argumentHint: '<texto>', builtin: true },
  { name: 'goal', description: 'Set a goal', argumentHint: '<condition>', builtin: true },
  { name: 'code-review', description: 'Review', builtin: true, aliases: ['cr'] },
  { name: 'heapdump', description: 'x', builtin: true },
  { name: '__remote-workflow', description: 'x', builtin: true },
  { name: 'workflow-launch-exec', description: 'x', builtin: true },
  { name: 'exit', description: 'salir', builtin: true },
  { name: 'habit-system', description: 'Agenda', builtin: false },
  { name: 'anthropic-skills:pdf', description: 'PDF', builtin: false },
  { name: 'clear', description: 'dup de local', builtin: true },
], [{ name: 'Plan', description: 'p' }, { name: 'Explore', description: 'e' }], ['exit'], '2026-10-05T00:00:00.000Z')

describe('buildCatalog', () => {
  it('clasifica por sección, deduplica contra locales y oculta internos y terminales', () => {
    const catalog = buildCatalog('default', sdk(), [], 'sdk')
    const names = (section: string) => catalog.commands.filter(c => c.section === section).map(c => c.name)
    expect(names('modos')).toEqual(['/goal', '/model', '/effort', '/fast', '/ultracode', '/compact', '/context', '/loop'])
    expect(names('arbrain')).toHaveLength(10)
    expect(names('nativos')).toEqual(['/code-review'])
    expect(names('skills')).toEqual(['/anthropic-skills:pdf', '/habit-system'])
    expect(names('agentes')).toEqual(['@Explore', '@Plan'])
    expect(catalog.commands.map(c => c.name)).not.toContain('/plan')
    expect(new Set(catalog.commands.map(c => c.name)).size).toBe(catalog.commands.length)
    expect(catalog.commands.find(c => c.name === '/code-review')).toMatchObject({ kind: 'sdk', origin: 'claude-code', aliases: ['cr'] })
    expect(catalog.commands.find(c => c.name === '/anthropic-skills:pdf')?.origin).toBe('plugin')
    expect(catalog.commands.find(c => c.name === '/habit-system')?.origin).toBe('proyecto')
    expect(catalog.commands.find(c => c.name === '/goal')).toMatchObject({ section: 'modos', kind: 'mode' })
    expect(catalog.commands.find(c => c.name === '/compact')?.description).toMatch(/Comprime/) // gana el local en español
  })
  it('Codex y cuentas API: sin /plan, /ultracode ni agentes; skills del disco', () => {
    const catalog = buildCatalog('codex', sdk(), [{ name: 'daniel-context', description: 'ctx' }], 'fallback')
    const names = catalog.commands.map(c => c.name)
    expect(names).toContain('/goal')
    expect(names).not.toContain('/ultracode')
    expect(names).not.toContain('/loop')
    expect(names).not.toContain('/code-review')
    expect(names.some(n => n.startsWith('@'))).toBe(false)
    expect(catalog.commands.filter(c => c.section === 'skills').map(c => c.name)).toEqual(['/daniel-context'])
  })
  it('sin SDK: modos + arbrain + skills del disco', () => {
    const catalog = buildCatalog('default', null, [{ name: 'b-skill', description: 'b' }, { name: 'a-skill', description: 'a' }, { name: 'goal', description: 'choca' }], 'fallback')
    expect(catalog.source).toBe('fallback')
    expect(catalog.commands.filter(c => c.section === 'skills').map(c => c.name)).toEqual(['/a-skill', '/b-skill'])
    expect(catalog.commands.filter(c => c.section === 'nativos')).toEqual([])
  })
})

describe('frontmatter y disco', () => {
  it('lee escalares, comillas, bloques multilínea y argument-hint', () => {
    expect(parseFrontmatter('---\nname: x\ndescription: "Dice \\"hola\\" y más"\n---\ncuerpo')).toEqual({ name: 'x', description: 'Dice "hola" y más' })
    expect(parseFrontmatter("---\nname: y\ndescription: 'it''s ok'\n---")).toMatchObject({ description: "it's ok" })
    expect(parseFrontmatter('---\nname: z\ndescription: >\n  primera línea\n  segunda línea\nargument-hint: <algo>\n---')).toEqual({ name: 'z', description: 'primera línea segunda línea', 'argument-hint': '<algo>' })
    expect(parseFrontmatter('sin frontmatter')).toEqual({})
  })
  it('descubre skills y comandos personalizados (con subcarpetas)', () => {
    const root = mkdtempSync(join(tmpdir(), 'cmdcat-'))
    mkdirSync(join(root, '.claude/skills/alfa'), { recursive: true })
    mkdirSync(join(root, '.claude/skills/sin-skill'), { recursive: true })
    mkdirSync(join(root, '.claude/commands/grupo'), { recursive: true })
    writeFileSync(join(root, '.claude/skills/alfa/SKILL.md'), '---\nname: alfa\ndescription: Hace alfa\n---\n# x')
    writeFileSync(join(root, '.claude/commands/grupo/beta.md'), '---\ndescription: Hace beta\nargument-hint: <n>\n---\n')
    writeFileSync(join(root, '.claude/commands/gamma.md'), 'sin frontmatter')
    const found = readSkillsFromDisk(root)
    expect(found).toEqual(expect.arrayContaining([
      { name: 'alfa', description: 'Hace alfa' },
      { name: 'grupo:beta', description: 'Hace beta', argumentHint: '<n>' },
      { name: 'gamma', description: '' },
    ]))
    expect(found.find(f => f.name === 'sin-skill')).toBeUndefined()
    expect(readSkillsFromDisk(join(root, 'no-existe'))).toEqual([])
  })
})

describe('mergeInitNames', () => {
  it('añade nombres faltantes sin borrar descripciones y marca plugins/skills como no nativos', () => {
    const merged = mergeInitNames(sdk(), ['compact', 'nuevo-nativo', 'mi-skill', 'plug:x'], ['exit', 'otro'], ['mi-skill'], ['Plan', 'Custom'])
    expect(merged.commands.find(c => c.name === 'compact')?.description).toBe('Compactar')
    expect(merged.commands.find(c => c.name === 'nuevo-nativo')?.builtin).toBe(true)
    expect(merged.commands.find(c => c.name === 'mi-skill')?.builtin).toBe(false)
    expect(merged.commands.find(c => c.name === 'plug:x')?.builtin).toBe(false)
    expect(merged.agents.map(a => a.name)).toEqual(['Plan', 'Explore', 'Custom'])
    expect(merged.terminal).toEqual(['exit', 'otro'])
  })
})

describe('CommandCatalogService', () => {
  const root = mkdtempSync(join(tmpdir(), 'cmdsvc-'))
  const make = (discover: () => Promise<SdkSnapshot>, extra: { storePath?: string; now?: () => number } = {}) =>
    new CommandCatalogService({ root, discover, readDisk: () => [{ name: 'disco', description: 'd' }], ...extra })
  it('cachea en memoria, sirve viejo y refresca en segundo plano pasado el TTL', async () => {
    let t = 0
    const discover = vi.fn(async () => sdk())
    const service = make(discover, { now: () => t })
    expect((await service.get('default')).source).toBe('sdk')
    expect((await service.get('default')).source).toBe('sdk')
    expect(discover).toHaveBeenCalledTimes(1)
    t = 11 * 60_000
    expect((await service.get('default')).source).toBe('cache')
    await Promise.resolve(); await Promise.resolve()
    expect(discover).toHaveBeenCalledTimes(2)
  })
  it('colapsa descubrimientos concurrentes por cuenta', async () => {
    const discover = vi.fn(async () => sdk())
    const service = make(discover)
    await Promise.all([service.get('default'), service.get('default'), service.get('bro')])
    expect(discover).toHaveBeenCalledTimes(2)
  })
  it('si el SDK falla sin caché cae a fallback con skills del disco; Codex ni consulta el SDK', async () => {
    const discover = vi.fn(async () => { throw new Error('boom') })
    const service = make(discover)
    const fallback = await service.get('default')
    expect(fallback.source).toBe('fallback')
    expect(fallback.commands.some(c => c.name === '/disco')).toBe(true)
    expect((await service.get('codex')).commands.some(c => c.name === '/ultracode')).toBe(false)
    expect(discover).toHaveBeenCalledTimes(1)
  })
  it('persiste en disco: un daemon nuevo responde al instante con source cache', async () => {
    const storePath = join(mkdtempSync(join(tmpdir(), 'cmdstore-')), 'sub', 'catalog.json')
    await make(async () => sdk(), { storePath }).get('default')
    expect(JSON.parse(readFileSync(storePath, 'utf8')).default.commands.length).toBeGreaterThan(5)
    const slow = vi.fn(() => new Promise<SdkSnapshot>(() => {}))
    const reborn = make(slow, { storePath })
    const catalog = await reborn.get('default')
    expect(catalog.source).toBe('cache')
    expect(catalog.commands.some(c => c.name === '/habit-system')).toBe(true)
    expect(slow).toHaveBeenCalledTimes(1) // refresco en segundo plano
  })
  it('ingestInit completa nombres y ingestChanged reemplaza la lista', async () => {
    const service = make(async () => sdk())
    await service.get('default')
    service.ingestInit('default', { slashCommands: ['habit-system', 'skill-recien-llegada'], skills: ['skill-recien-llegada'] })
    let names = (await service.get('default')).commands.map(c => c.name)
    expect(names).toContain('/skill-recien-llegada')
    expect((await service.get('default')).commands.find(c => c.name === '/habit-system')?.description).toBe('Agenda')
    service.ingestChanged('default', [{ name: 'solo-esta', description: 's', builtin: false }])
    names = (await service.get('default')).commands.map(c => c.name)
    expect(names).toContain('/solo-esta')
    expect(names).not.toContain('/habit-system')
    expect(names).toContain('@Plan') // agentes se conservan
  })
  it('ingestInit sin caché previa deja una caché usable', async () => {
    const service = make(() => new Promise<SdkSnapshot>(() => {}))
    service.ingestInit('default', { slashCommands: ['compact', 'mi-skill'], skills: ['mi-skill'] })
    const catalog = await service.get('default')
    expect(catalog.source).toBe('cache')
    expect(catalog.commands.find(c => c.name === '/mi-skill')?.section).toBe('skills')
  })
})

describe('/goal', () => {
  it('solo se intercepta en Codex/API; en Claude viaja al SDK', () => {
    expect(interceptsGoal('/goal terminar el informe', false)).toBe(false)
    expect(interceptsGoal('/goal terminar el informe', true)).toBe(true)
    expect(interceptsGoal('/goal', true)).toBe(true)
    expect(interceptsGoal('/goalie', true)).toBe(false)
  })
})
