// El encargo como plan versionado en git (29 oct 2026, idea 4 del reporte de Warp): proponer, editar, aprobar y juzgar.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aprobarPlan, correrPlan, descartarPlan, leerPlan, planEnDisco, planesPendientes, proponerPlan, rutaDePlan, slugPlan, textoAprobado, textoPlan, textoAOrigen, origenATexto } from './plan.js'
import { extraerDoD } from './juez.js'

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'Daniel', GIT_AUTHOR_EMAIL: 'd@d', GIT_COMMITTER_NAME: 'Daniel', GIT_COMMITTER_EMAIL: 'd@d' }
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV }).trim()
const ENCARGO = `Revisa la cohorte y arma la ficha de cada fundador.\n\nDefinición de Terminado:\n- Una ficha por fundador en docs/fichas.\n- npm test en verde, con su salida pegada.`

let repo: string
beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'plan-')))
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), 'x\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'inicio')
  process.env.GIT_AUTHOR_NAME = 'Daniel'; process.env.GIT_AUTHOR_EMAIL = 'd@d'; process.env.GIT_COMMITTER_NAME = 'Daniel'; process.env.GIT_COMMITTER_EMAIL = 'd@d'
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('plan versionado', () => {
  it('texto ↔ plan: frontmatter con lo de delegar y el encargo tal cual', () => {
    const t = textoPlan({ nombre: 'fichas: cohorte\nfundadora', harness: 'claude', cwd: '/tmp/x', perfil: 'lectura', encargo: ENCARGO, propuesto: '2026-10-29T12:00:00.000Z' })
    expect(t).toMatch(/^---\ntipo: plan-de-encargo\nnombre: fichas: cohorte fundadora\nharness: claude\nperfil: lectura\ncwd: \/tmp\/x\n/)
    const p = leerPlan(t, 'docs/planes/a.md')!
    expect(p).toMatchObject({ nombre: 'fichas: cohorte fundadora', harness: 'claude', perfil: 'lectura', cwd: '/tmp/x', encargo: ENCARGO })
    expect(leerPlan('# sin frontmatter', 'x')).toBeNull()
    expect(slugPlan('Página de la Cohorte #2 ¡ya!')).toBe('pagina-de-la-cohorte-2-ya')
  })
  it('la ruta solo vale dentro de docs/planes del repo', () => {
    expect(rutaDePlan('docs/planes/a.md', repo).rel).toBe('docs/planes/a.md')
    expect(() => rutaDePlan('../fuera/docs/planes/a.md', repo)).toThrow(/docs\/planes/)
    expect(() => rutaDePlan('docs/planes/../../CLAUDE.md', repo)).toThrow()
    expect(() => rutaDePlan('docs/planes/sub/a.md', repo)).toThrow()
  })
  it('proponer escribe y commitea SOLO el plan (lo demás del índice no viaja) y no lanza nada', async () => {
    writeFileSync(join(repo, 'otro.md'), 'de otro agente\n'); git(repo, 'add', 'otro.md')
    const p = await proponerPlan({ nombre: 'fichas de la cohorte', harness: 'claude', cwd: repo, perfil: 'codigo', encargo: ENCARGO }, { repo, ahora: new Date('2026-10-29T15:00:00Z') })
    expect(p.ruta).toBe('docs/planes/2026-10-29-fichas-de-la-cohorte.md')
    expect(p.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(git(repo, 'show', '--name-only', '--format=%s%n%b', p.commit!)).toMatch(/^Plan propuesto: fichas de la cohorte\nSubagente: fichas de la cohorte\n+docs\/planes\/2026-10-29-fichas-de-la-cohorte\.md$/)
    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('otro.md')
    // el mismo nombre el mismo día no pisa: -2
    const p2 = await proponerPlan({ nombre: 'fichas de la cohorte', harness: 'claude', cwd: repo, encargo: 'otro' }, { repo, ahora: new Date('2026-10-29T16:00:00Z') })
    expect(p2.ruta).toBe('docs/planes/2026-10-29-fichas-de-la-cohorte-2.md')
  })
  it('Daniel edita; aprobar commitea su versión y el juez lee la DoD de ESE commit aunque luego cambie el archivo', async () => {
    const p = await proponerPlan({ nombre: 'fichas', harness: 'claude', cwd: repo, encargo: ENCARGO }, { repo })
    const abs = join(repo, p.ruta)
    writeFileSync(abs, readFileSync(abs, 'utf8').replace('- npm test en verde, con su salida pegada.', '- npm test en verde, con su salida pegada.\n- Capturas a 520 px en claro y oscuro.'))
    const aprobado = await aprobarPlan(p.ruta, { repo })
    expect(aprobado.commit).not.toBe(p.commit)
    expect(git(repo, 'log', '-1', '--format=%s', aprobado.commit!)).toBe('Plan aprobado: fichas')
    expect(git(repo, 'diff', p.commit!, aprobado.commit!, '--', p.ruta)).toMatch(/\+- Capturas a 520 px en claro y oscuro\./)
    // alguien toca el archivo después: el juez sigue con lo aprobado
    writeFileSync(abs, readFileSync(abs, 'utf8').replace('Capturas a 520 px', 'Nada de capturas'))
    const dod = extraerDoD(await textoAprobado({ ruta: p.ruta, commit: aprobado.commit }, { repo }))
    expect(dod).toMatch(/Capturas a 520 px en claro y oscuro/)
    expect(dod).not.toMatch(/Nada de capturas/)
    // aprobar sin cambios no crea otro commit: devuelve el último del archivo
    git(repo, 'checkout', '-q', '--', p.ruta)
    expect((await aprobarPlan(p.ruta, { repo })).commit).toBe(aprobado.commit)
  })
  it('planes por correr: sin descartar y sin subagente; descartar lo marca y lo deja en git', async () => {
    const a = await proponerPlan({ nombre: 'uno', harness: 'claude', cwd: repo, encargo: 'Primero esto.\nDoD: algo verificable hoy.' }, { repo })
    const b = await proponerPlan({ nombre: 'dos', harness: 'codex', cwd: repo, perfil: 'lectura', encargo: 'Investiga X' }, { repo })
    expect(planesPendientes(new Set(), { repo }).map(x => x.nombre).sort()).toEqual(['dos', 'uno'])
    expect(planesPendientes(new Set([a.ruta]), { repo }).map(x => x.nombre)).toEqual(['dos'])
    expect(planesPendientes(new Set(), { repo }).find(x => x.nombre === 'dos')).toMatchObject({ perfil: 'lectura', harness: 'codex', resumen: 'Investiga X' })
    const d = await descartarPlan(b.ruta, { repo })
    expect(d.descartado).toBeTruthy()
    expect(planEnDisco(b.ruta, repo).descartado).toBeTruthy()
    expect(planesPendientes(new Set(), { repo }).map(x => x.nombre)).toEqual(['uno'])
    await expect(aprobarPlan(b.ruta, { repo })).rejects.toThrow(/descartado/)
    expect(git(repo, 'log', '--format=%s', '--', b.ruta)).toBe('Plan descartado: dos\nPlan propuesto: dos')
  })
  it('correr: lanza por delegar con el texto aprobado, su perfil y el commit; el aviso vuelve a la conversación que lo propuso', async () => {
    const origen = { owner: 'dueno', account: 'default', conversationId: 'c-123' }
    expect(textoAOrigen(origenATexto(origen))).toEqual(origen)
    const p = await proponerPlan({ nombre: 'fichas', harness: 'codex', cwd: repo, perfil: 'lectura', aislamiento: 'carpeta', esfuerzo: 'high', avisar: origenATexto(origen), encargo: ENCARGO }, { repo })
    const delegar = vi.fn(async (x: Record<string, unknown>) => ({ id: 900500, ...x }) as never)
    const r = await correrPlan(p.ruta, { repo, delegar: delegar as never })
    expect(delegar).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'fichas', harness: 'codex', cwd: repo, perfil: 'lectura', aislamiento: 'carpeta', esfuerzo: 'high', encargo: ENCARGO, avisarA: origen, plan: { ruta: p.ruta, commit: r.plan.commit } }))
    expect(r.sub.id).toBe(900500)
  })
  it('sin git posible (no es repo) el plan igual queda escrito y lo dice', async () => {
    const suelto = realpathSync(mkdtempSync(join(tmpdir(), 'plan-suelto-')))
    const p = await proponerPlan({ nombre: 'x', harness: 'claude', cwd: suelto, encargo: 'algo' }, { repo: suelto })
    expect(p.commit).toBeNull()
    expect(p.aviso).toMatch(/no pude commitearlo/)
    expect(readFileSync(join(suelto, p.ruta), 'utf8')).toMatch(/tipo: plan-de-encargo/)
    rmSync(suelto, { recursive: true, force: true })
  })
})
