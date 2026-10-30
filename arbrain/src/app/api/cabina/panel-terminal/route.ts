import { homedir } from 'node:os'
import { join } from 'node:path'
import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { MotorError, unaVez } from '@/lib/motor'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'

// Terminal inferior de Arbrain (⌘J, 2 oct 2026).
// GET  = ids de terminales vivas del motor (el panel reconcilia las suyas tras recargar).
// POST = { op: 'crear', cols, rows } abre un shell en el motor (PTY inmortal: se ve en «trabajos»),
//        { op: 'cerrar', id } cierra uno. Escribir/redimensionar/ver va por `../terminal/[id]`.
// Solo Daniel y solo donde vive el socket del motor.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NOCACHE = { 'Cache-Control': 'no-store' }

const CWD = () => esEdicionCliente() ? raizWorkspace() : process.env.ARBRAIN_PANEL_CWD || join(homedir(), 'Developer/artificial-brain')

export async function GET() {
  try {
    await planningOwner()
    const info = await unaVez({ op: 'info' })
    const terms = (info.terms as { id: number; readonly: boolean; origin: string }[] | undefined) ?? []
    return Response.json({ ids: terms.filter(t => !t.readonly).map(t => t.id) }, { headers: NOCACHE })
  } catch (error) {
    if (error instanceof MotorError) return Response.json({ error: error.message }, { status: 409, headers: NOCACHE })
    return planningError(error)
  }
}

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    await planningOwner()
    const body = await request.json().catch(() => ({})) as { op?: unknown; id?: unknown; cols?: unknown; rows?: unknown }
    if (body.op === 'crear') {
      const num = (v: unknown, min: number, max: number, def: number) => typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, min), max)) : def
      const r = await unaVez({ op: 'spawn', cwd: CWD(), cols: num(body.cols, 20, 400, 100), rows: num(body.rows, 5, 200, 20), scrollback: null, shell_integration: true, colorfgbg: '15;0', command: null })
      return Response.json({ id: r.id, pid: r.pid }, { headers: NOCACHE })
    }
    if (body.op === 'cerrar') {
      if (typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id < 0) throw new MotorError('Terminal inválida.')
      await unaVez({ op: 'kill', id: body.id })
      return Response.json({ ok: true }, { headers: NOCACHE })
    }
    throw new MotorError('Nada que hacer.')
  } catch (error) {
    if (error instanceof MotorError) return Response.json({ error: error.message }, { status: 409, headers: NOCACHE })
    return planningError(error)
  }
}
