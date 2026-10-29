// Guardián de disco del VPS (29 oct 2026): el pedido del vigía, el encargo y el candado del lado del motor.
import { describe, it, expect, vi } from 'vitest'
import { encargoGuardian, GUARDIAN_NOMBRE, lanzarGuardian, pedidoGuardian, vpsSsh, type PuertoGuardian } from './guardian-disco.js'

const DIR = '/Users/x/Library/Application Support/ArbrainSeguridad/guardian'
const BUENO = { fase: 'accion', pct: 96.04, id: '1761750000', resultado: `${DIR}/resultado-1761750000.json` }

function puerto(abiertos: Awaited<ReturnType<PuertoGuardian['abiertos']>> = []) {
  const delegar = vi.fn(async () => ({ id: 77 }))
  return { delegar, p: { abiertos: async () => abiertos, delegar, repo: () => '/Users/x/Developer/artificial-brain' } satisfies PuertoGuardian }
}

describe('guardián de disco', () => {
  it('valida el pedido: fase, porcentaje, id y la ruta del resultado solo en su carpeta o en /tmp', () => {
    expect(pedidoGuardian(BUENO, DIR)).toEqual({ fase: 'accion', pct: 96, id: '1761750000', resultado: BUENO.resultado, simulacro: false })
    expect(pedidoGuardian({ ...BUENO, resultado: '/tmp/g/r.json', simulacro: true }, DIR)).toMatchObject({ simulacro: true })
    expect(pedidoGuardian({ ...BUENO, fase: 'borrar' }, DIR)).toHaveProperty('error')
    expect(pedidoGuardian({ ...BUENO, pct: 'x' }, DIR)).toHaveProperty('error')
    expect(pedidoGuardian({ ...BUENO, id: '../x' }, DIR)).toHaveProperty('error')
    expect(pedidoGuardian({ ...BUENO, resultado: '/Users/x/.ssh/authorized_keys.json' }, DIR)).toHaveProperty('error')
    expect(pedidoGuardian({ ...BUENO, resultado: `${DIR}/../../../.zshrc.json` }, DIR)).toHaveProperty('error')
  })

  it('el encargo lleva el oficio, la fase, el resultado y su Definición de Terminado; el simulacro no aplica', () => {
    const p = pedidoGuardian(BUENO, DIR) as Exclude<ReturnType<typeof pedidoGuardian>, { error: string }>
    const e = encargoGuardian(p, '/repo')
    expect(e).toContain('/repo/.claude/skills/agentic-server/references/limpieza-disco-vps.md')
    expect(e).toContain('< /repo/negocio/ops/seguridad/vps/limpieza-disco-segura')
    expect(e).toContain('Fase ACCIÓN')
    expect(e).toContain(BUENO.resultado)
    expect(e).toContain('--aplicar')
    expect(e).toMatch(/Definición de Terminado:/)
    const s = encargoGuardian({ ...p, fase: 'aviso', simulacro: true }, '/repo')
    expect(s).toContain('Fase AVISO')
    expect(s).toContain('SIMULACRO')
    expect(s).not.toContain('--aplicar')
  })

  it('lanza por delegar con claude, en su carpeta de /tmp (no el checkout principal), perfil total', async () => {
    const { p, delegar } = puerto()
    const r = await lanzarGuardian(pedidoGuardian(BUENO, DIR) as never, p)
    expect(r).toEqual({ ok: true, agente: 77 })
    expect(delegar).toHaveBeenCalledWith(expect.objectContaining({ nombre: GUARDIAN_NOMBRE, harness: 'claude', aislamiento: 'carpeta', perfil: 'total', cwd: '/tmp/guardian-disco-1761750000' }))
  })

  it('candado: con un guardián trabajando no lanza otro; uno viejo o terminado ya no bloquea', async () => {
    const ahora = Date.parse('2026-10-29T15:00:00Z')
    const vivo = puerto([{ id: 5, creado: '2026-10-29T14:30:00Z', corriendo: true }])
    expect(await lanzarGuardian(pedidoGuardian(BUENO, DIR) as never, vivo.p, ahora)).toMatchObject({ ok: false, status: 409 })
    expect(vivo.delegar).not.toHaveBeenCalled()
    const viejo = puerto([{ id: 5, creado: '2026-10-29T10:00:00Z', corriendo: true }, { id: 6, creado: '2026-10-29T14:50:00Z', corriendo: false }])
    expect(await lanzarGuardian(pedidoGuardian(BUENO, DIR) as never, viejo.p, ahora)).toMatchObject({ ok: true })
  })
})

describe('vpsSsh', () => {
  it('la variable manda; sin ella, la instalación original o un marcador (nunca una IP fija en el código)', () => {
    expect(vpsSsh({ ARBRAIN_VPS_SSH: 'root@vps.ejemplo.ts.net' } as NodeJS.ProcessEnv)).toBe('root@vps.ejemplo.ts.net')
    expect(vpsSsh({} as NodeJS.ProcessEnv)).toMatch(/^root@\S+$/)
  })
})
