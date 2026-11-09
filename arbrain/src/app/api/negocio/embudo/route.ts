import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { instalacion } from '@/config'
import { medirFuente } from '@/lib/canvas/nervio-estado'
import { motorDe, panelNegocioEncendido, RUTA_EMBUDO, validarEmbudo, type RespuestaEmbudo } from '@/features/negocio/embudo'

// Tu negocio › El sistema (4 nov 2026, prototipo detrás de ARBRAIN_PANEL_NEGOCIO=1). Lee el embudo que escribió Levy
// en la memoria (docs/embudo/README.md) y la última corrida de cada rutina launchd del Studio (las del scheduler las lee
// el cliente de /api/planning/crons, la misma caché que Rutinas). 5 nov: también el inventario de skills vivas, para la
// vista «Skills por etapa». Apagado: { activo: false }. En la edición del alumno (8 nov 2026) viene encendido y lee SU
// embudo (el de Tu primer día).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store' }
const APAGADO = () => Response.json({ activo: false } satisfies RespuestaEmbudo, { headers: NOCACHE })

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
const raiz = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

/** Las skills vivas: cada carpeta de `.claude/skills/` con su SKILL.md (sigue enlaces). Sin carpeta legible, undefined:
 *  el panel dice que no pudo leerlas en vez de marcar todo «sin revisar». */
async function inventarioSkills(base: string): Promise<string[] | undefined> {
  const dir = path.join(base, '.claude', 'skills')
  try {
    const nombres = await readdir(dir)
    return nombres.filter(n => !/^[._]/.test(n) && existsSync(path.join(dir, n, 'SKILL.md'))).sort()
  } catch { return undefined }
}

export async function GET() {
  if (!panelNegocioEncendido()) return APAGADO()
  try {
    await planningOwner()
    const base = raiz()
    const vacio: RespuestaEmbudo = { activo: true, ruta: RUTA_EMBUDO, embudo: null, launchd: {} }
    if (!base) return Response.json(vacio, { headers: NOCACHE })
    let crudo: unknown
    try { crudo = JSON.parse(await readFile(path.join(base, RUTA_EMBUDO), 'utf8')) } catch (e) {
      const falta = (e as NodeJS.ErrnoException)?.code === 'ENOENT'
      return Response.json({ ...vacio, ...(falta ? {} : { errores: ['El archivo del embudo no es JSON válido.'] }) }, { headers: NOCACHE })
    }
    const v = validarEmbudo(crudo)
    if (!v.ok) return Response.json({ ...vacio, errores: v.errores.slice(0, 12) }, { headers: NOCACHE })
    // launchd solo existe en la Mac del dueño; en otro sistema cada rutina queda «sin dato aquí» (gris), nunca verde.
    const opciones = { hosts: instalacion().dominiosPropios, launchd: process.platform === 'darwin' }
    const labels = [...new Set(v.embudo.etapas.flatMap(et => et.rutinas).filter(r => motorDe(r) === 'launchd').map(r => r.id!))]
    const launchd: Extract<RespuestaEmbudo, { activo: true }>['launchd'] = {}
    await Promise.all(labels.map(async label => {
      const m = await medirFuente({ tipo: 'launchd', label }, opciones)
      launchd[label] = { semaforo: m.semaforo, texto: m.texto, medidoEn: m.medidoEn }
    }))
    const skills = await inventarioSkills(base)
    return Response.json({ activo: true, ruta: RUTA_EMBUDO, embudo: v.embudo, launchd, skills } satisfies RespuestaEmbudo, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
