import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { estadoDirecto } from '@/lib/modo-directo/servidor'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { FUENTES_COMPRADOR, leerVoz, piezaDe, RUTA_VOZ, velarVoz, type Pieza, type RespuestaComprador } from '@/features/negocio/pulso'

// Tu negocio › El pulso › Mente del comprador (7 nov 2026). El avatar (arquitectura de marketing), el vehículo del alumno
// (su memoria canónica) y la voz del cliente (voz-del-cliente.json, la arma Levy con llamadas y mensajes). El canal lo lee
// el cliente del embudo que ya trae /api/negocio/embudo. Modo directo: quien sale en iniciales y los textos pasan por el
// velo (lib/modo-directo/reglas.ts). Mismo interruptor que el panel: apagado o en la edición cliente, { activo: false }.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store' }

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
const raiz = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

async function pieza(base: string, f: (typeof FUENTES_COMPRADOR)[keyof typeof FUENTES_COMPRADOR]): Promise<Pieza | null> {
  try { return piezaDe(await readFile(path.join(base, f.ruta), 'utf8'), f) } catch { return null }
}

export async function GET() {
  if (!panelNegocioEncendido() || esEdicionCliente()) return Response.json({ activo: false } satisfies RespuestaComprador, { headers: NOCACHE })
  try {
    await planningOwner()
    const { prendido, velo } = await estadoDirecto()
    const base = raiz()
    const vozVacia = { ruta: RUTA_VOZ, existe: false, datos: null }
    if (!base) return Response.json({ activo: true, avatar: null, vehiculo: null, voz: vozVacia, directo: prendido } satisfies RespuestaComprador, { headers: NOCACHE })
    const [avatar, vehiculo] = await Promise.all([pieza(base, FUENTES_COMPRADOR.avatar), pieza(base, FUENTES_COMPRADOR.vehiculo)])
    let voz: Extract<RespuestaComprador, { activo: true }>['voz'] = vozVacia
    try {
      const { voz: datos, errores } = leerVoz(JSON.parse(await readFile(path.join(base, RUTA_VOZ), 'utf8')))
      voz = { ruta: RUTA_VOZ, existe: true, datos: datos && prendido ? velarVoz(datos, velo) : datos, ...(errores.length ? { errores: errores.slice(0, 8) } : {}) }
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') voz = { ruta: RUTA_VOZ, existe: true, datos: null, errores: ['El archivo de la voz del cliente no es JSON válido.'] }
    }
    return Response.json({ activo: true, avatar, vehiculo, voz, directo: prendido } satisfies RespuestaComprador, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
