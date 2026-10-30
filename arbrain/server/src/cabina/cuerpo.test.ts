import { describe, expect, it } from 'vitest'
import { estadoDe, tachar, cwdPermitido, leerPantalla } from './cuerpo.js'

describe('cuerpo', () => {
  it('Claude inactivo no se confunde con trabajando', () => {
    expect(estadoDe('claude', 'listo\n\n✻ Brewed for 6s · done 4:03 PM\n> ')).toBe('esperando')
    expect(estadoDe('claude', '✻ Pondering… (12s · esc to interrupt)')).toBe('trabajando')
    expect(estadoDe('claude', '✱ Spinning… (4s · ↓ 120 tokens)\n  ⎿  Tip: …')).toBe('trabajando')
    expect(estadoDe('zsh', 'esc to interrupt')).toBe('terminal')
  })
  it('tacha secretos antes de mostrarlos', () => {
    expect(tachar('OPENAI_API_KEY=sk-abc1234567890abcdefghij')).toBe('OPENAI_API_KEY=••••')
    expect(tachar('Authorization: Bearer abcdefghijklmnop123')).toContain('Bearer ••••')
    expect(tachar('hola desde el subagente 16:03')).toBe('hola desde el subagente 16:03')
  })
  it('traduce la pantalla a estado y última acción', () => {
    const p = leerPantalla('⏺ Creé /tmp/x/hola.txt y cat muestra el contenido.\n\n  listo\n✱ Spinning… (4s · ↓ 120 tokens)\n  ⎿  Tip: use worktrees')
    expect(p.ultimaAccion).toBe('Creé /tmp/x/hola.txt y cat muestra el contenido.')
    expect(p.actividad).toBe('Spinning…')
  })
  it('solo /tmp o ~/Developer para subagentes', () => {
    expect(cwdPermitido('/tmp/prueba')).toBe(true)
    expect(cwdPermitido('/etc')).toBe(false)
    expect(cwdPermitido('/tmp/../etc')).toBe(false)
  })
})

describe('delegar sin tropiezos', async () => {
  const { comando, dialogoDeArranque, entregar, permisosDefault } = await import('./cuerpo.js')
  it('nace en bypassPermissions por defecto y se puede bajar por entorno', () => {
    delete process.env.CABINA_PERMISOS
    expect(permisosDefault()).toBe('bypass')
    expect(comando('claude', 'claude-sonnet-5-5', 'hola', 'abc')).toMatch(/--permission-mode bypassPermissions .*--session-id abc 'hola'$/)
    expect(comando('codex', null, 'x')).toContain('--dangerously-bypass-approvals-and-sandbox')
    process.env.CABINA_PERMISOS = 'auto'
    expect(comando('claude', null)).toContain('--permission-mode auto')
    delete process.env.CABINA_PERMISOS
  })
  it('ve la caja de Claude en bypass aunque traiga texto de ejemplo', async () => {
    const { enSuPrompt } = await import('./cuerpo.js')
    const bypass = '────\n❯ Try "fix lint errors"\n────\n  ⏵⏵ bypass permissions on (shift+tab to cycle)'
    expect(enSuPrompt('claude', bypass)).toBe(true)
    expect(enSuPrompt('claude', bypass + '\n✻ Pondering… (3s · esc to interrupt)')).toBe(false)
  })
  it('reconoce los diálogos de arranque', () => {
    expect(dialogoDeArranque('WARNING: Claude Code running in Bypass Permissions mode\n  1. No, exit\n❯ 2. Yes, I accept')?.que).toBe('aceptar el modo bypass')
    expect(dialogoDeArranque('Do you trust the files in this folder?\n❯ 1. Yes, proceed\n  2. No, exit')?.que).toBe('confiar en la carpeta')
    expect(dialogoDeArranque('❯ \n? for shortcuts')).toBeNull()
  })
  it('pasa el diálogo, espera la caja, entrega con Enter y reintenta hasta que llega', async () => {
    const pantallas = ['', 'Do you trust the files in this folder?\n❯ 1. Yes, proceed', '❯ \n? for shortcuts', '❯ \n? for shortcuts', '❯ \n? for shortcuts']
    const escrito: string[] = []
    let i = 0, llegaAlEscribir = 2
    const r = await entregar({ harness: 'claude', encargo: 'haz X' }, {
      pantalla: async () => pantallas[Math.min(i++, pantallas.length - 1)],
      escribir: async d => { escrito.push(d); if (d === '\r' && escrito.filter(x => x === '\r').length >= llegaAlEscribir) llegaAlEscribir = -1 },
      llego: async () => llegaAlEscribir === -1,
    }, { enArgv: false, pausaMs: 1, plazoMs: 5000 })
    expect(r.ok).toBe(true)
    expect(escrito[0]).toBe('\r') // el diálogo de confianza
    expect(escrito.filter(x => x.includes('haz X'))).toHaveLength(1)
  })
  it('si nunca llega, lo dice sin tirar el registro', async () => {
    const r = await entregar({ harness: 'claude', encargo: 'y' }, { pantalla: async () => '❯ \n? for shortcuts', escribir: async () => {}, llego: async () => false }, { enArgv: false, pausaMs: 1, plazoMs: 300 })
    expect(r.ok).toBe(false)
    expect(r.nota).toMatch(/retomar/)
  })
})

describe('delegar2: retomar encola, «¿Arranco?» y skills', async () => {
  const { enviarSeguimiento, preguntaPendiente, esConfirmacion, entregar, preludioSkills, CONFIRMACION_DE_LEVY } = await import('./cuerpo.js')
  const caja = '────\n❯ \n────\n  ⏵⏵ bypass permissions on (shift+tab to cycle)'

  it('retomar encola cuando el subagente está en medio de un paso y confirma que quedó en cola', async () => {
    const escrito: string[] = []
    const r = await enviarSeguimiento('también revisa X', {
      estado: async () => ({ enCaja: false, trabajando: true }),
      pantalla: async () => '✻ Pondering… (3s · esc to interrupt)\n  también revisa X (en cola)',
      escribir: async d => { escrito.push(d) },
      consta: async () => false,
    }, { pausaMs: 1, confirmaMs: 200 })
    expect(r).toEqual({ encolado: true, confirmado: true })
    expect(escrito[0]).toContain('también revisa X')
    expect(escrito[1]).toBe('\r')
  })
  it('retomar en su caja entrega directo; con la cola sin confirmar lo dice', async () => {
    const dir = await enviarSeguimiento('hola', { estado: async () => ({ enCaja: true, trabajando: false }), pantalla: async () => caja, escribir: async () => {}, consta: async () => true }, { pausaMs: 1 })
    expect(dir).toEqual({ encolado: false, confirmado: true })
    const dudoso = await enviarSeguimiento('hola', { estado: async () => ({ enCaja: false, trabajando: true }), pantalla: async () => '', escribir: async () => {}, consta: async () => false }, { pausaMs: 1, confirmaMs: 50 })
    expect(dudoso).toEqual({ encolado: true, confirmado: false })
  })
  it('retomar nunca da Enter a ciegas sobre un diálogo (ni trabajando ni en caja)', async () => {
    const escrito: string[] = []
    await expect(enviarSeguimiento('x', { estado: async () => ({ enCaja: false, trabajando: false }), pantalla: async () => '', escribir: async d => { escrito.push(d) }, consta: async () => false }, { pausaMs: 1, esperaMs: 20 })).rejects.toThrow(/diálogo/)
    expect(escrito).toHaveLength(0)
  })

  it('distingue «¿Arranco?» de otras preguntas', () => {
    const arranco = '⏺ Entendí el encargo: crear /tmp/x/hola.txt. ¿Arranco?\n' + caja
    expect(preguntaPendiente('claude', arranco)).toMatch(/¿Arranco\?$/)
    expect(esConfirmacion(preguntaPendiente('claude', arranco)!)).toBe(true)
    expect(esConfirmacion('Antes de empezar: ¿procedo?')).toBe(true)
    expect(esConfirmacion('Shall I proceed?')).toBe(true)
    expect(esConfirmacion('¿Uso Postgres o SQLite para guardar esto?')).toBe(false)
    expect(esConfirmacion('¿Cuál de las dos carpetas es la buena, empiezo por A o por B?')).toBe(false)
    expect(preguntaPendiente('claude', '⏺ Listo, creé el archivo.\n' + caja)).toBeNull()
    expect(preguntaPendiente('claude', '⏺ ¿Arranco?\n✻ Pondering… (3s · esc to interrupt)')).toBeNull()
  })
  it('entregar confirma «¿Arranco?» UNA vez en nombre de Levy y no deja pregunta abierta', async () => {
    const escrito: string[] = []
    let confirmado = false
    const r = await entregar({ harness: 'claude', encargo: 'haz X' }, {
      pantalla: async () => confirmado ? '⏺ Hecho.\n' + caja : '⏺ Ok, entendí. ¿Arranco?\n' + caja,
      escribir: async d => { escrito.push(d); if (d.includes(CONFIRMACION_DE_LEVY)) confirmado = true },
      llego: async () => true,
    }, { enArgv: true, pausaMs: 1, vigilaMs: 2000 })
    expect(r).toMatchObject({ ok: true, confirmo: true })
    expect(r.espera).toBeUndefined()
    expect(escrito.filter(x => x.includes(CONFIRMACION_DE_LEVY))).toHaveLength(1)
  })
  it('si pregunta otra cosa, la deja como espera de Levy y no responde', async () => {
    const escrito: string[] = []
    const r = await entregar({ harness: 'claude', encargo: 'haz X' }, {
      pantalla: async () => '⏺ ¿Uso Postgres o SQLite para guardar esto?\n' + caja,
      escribir: async d => { escrito.push(d) },
      llego: async () => true,
    }, { enArgv: true, pausaMs: 1, vigilaMs: 2000 })
    expect(r.ok).toBe(true)
    expect(r.espera).toMatch(/Postgres o SQLite/)
    expect(escrito).toHaveLength(0)
  })
  it('una segunda pregunta de confirmación ya no se responde sola (UNA vez)', async () => {
    let n = 0
    const r = await entregar({ harness: 'claude', encargo: 'x' }, {
      pantalla: async () => `⏺ Pregunta ${n}. ¿Arranco?\n` + caja,
      escribir: async d => { if (d.includes(CONFIRMACION_DE_LEVY)) n++ },
      llego: async () => true,
    }, { enArgv: true, pausaMs: 1, vigilaMs: 500 })
    expect(n).toBe(1)
    expect(r.espera).toMatch(/¿Arranco\?/)
  })

  it('con cwd fuera del repo el encargo lleva el directorio de skills; dentro, no', async () => {
    const { mkdtempSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    mkdirSync(join(repo, '.claude/skills'), { recursive: true })
    process.env.ARBRAIN_REPO = repo
    try {
      const fuera = preludioSkills('/tmp/otra-cosa')
      expect(fuera?.texto).toContain(join(repo, '.claude/skills'))
      expect(fuera?.aviso).toMatch(/fuera del repo/)
      expect(preludioSkills(join(repo, 'arbrain'))).toBeNull()
      process.env.ARBRAIN_REPO = join(repo, 'no-existe')
      expect(preludioSkills('/tmp/otra-cosa')).toBeNull()
    } finally { delete process.env.ARBRAIN_REPO }
  })
})

describe('origen de los subagentes (3 oct 2026)', () => {
  it('lee el agenteId del resultado de delegar y completa lo que falta sin inventar', async () => {
    const { agenteDeResultado, completarOrigenes } = await import('./cuerpo.js')
    expect(agenteDeResultado('Subagente «Panel» lanzado en el motor de Arbrain: agenteId 100024 (claude · x).')).toBe(100024)
    expect(agenteDeResultado('otra cosa agenteId 5')).toBeNull()
    const base = { nombre: 'x', harness: 'claude' as const, encargo: 'e', cwd: '/tmp/x' }
    const ahora = Date.parse('2026-10-03T13:00:00Z')
    const r = completarOrigenes([
      { ...base, id: 1, creado: '2026-10-03T12:00:00Z' },
      { ...base, id: 2, creado: '2026-10-03T12:00:00Z' },
      { ...base, id: 3, creado: '2026-10-03T12:59:00Z' },
      { ...base, id: 4, creado: '2026-10-03T12:00:00Z', origen: 'ya' },
    ], id => id === 1 ? 'c1888e9a' : null, ahora)
    expect(r.cambio).toBe(true)
    expect(r.registro.map(s => s.origen)).toEqual(['c1888e9a', null, undefined, 'ya'])
  })
})
