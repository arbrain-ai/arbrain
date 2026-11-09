import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { estadoDirecto } from '@/lib/modo-directo/servidor'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { leerMercado, ocultarEnDirecto, RUTA_MERCADO, type RespuestaEstrategia } from '@/features/negocio/estrategia'

// Tu negocio › El pulso › Estrategia (8 nov 2026). La investigación de mercado del dueño (`mercado.json`, la consolida
// Levy): quién compra, contra quién, hacia dónde va y lo que decides. Solo lectura. Modo directo: fuera lo que trae números
// propios (quién compra y los borradores); lo público se queda. Mismo interruptor que el panel. En la edición del alumno lee
// SU cerebro: sin su investigación, la tarjeta dice «Conecta tu investigación» (nunca hay datos del autor en su copia).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'no-store' }

const RAICES = () => [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
const raiz = () => RAICES().find(r => existsSync(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null

export async function GET() {
  if (!panelNegocioEncendido()) return Response.json({ activo: false } satisfies RespuestaEstrategia, { headers: NOCACHE })
  try {
    await planningOwner()
    const cliente = esEdicionCliente()
    const { prendido } = cliente ? { prendido: false } : await estadoDirecto()
    const base = raiz()
    const vacia: RespuestaEstrategia = { activo: true, ruta: RUTA_MERCADO, existe: false, datos: null, directo: prendido, oculto: [], cliente }
    if (!base) return Response.json(vacia, { headers: NOCACHE })
    let crudo: unknown
    try { crudo = JSON.parse(await readFile(path.join(base, RUTA_MERCADO), 'utf8')) } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return Response.json(vacia, { headers: NOCACHE })
      return Response.json({ ...vacia, existe: true, errores: ['El archivo de la investigación no es JSON válido.'] } satisfies RespuestaEstrategia, { headers: NOCACHE })
    }
    const { mercado, errores } = leerMercado(crudo)
    const velado = mercado && prendido ? ocultarEnDirecto(mercado) : null
    return Response.json({
      ...vacia, existe: true, datos: velado?.mercado ?? mercado, oculto: velado?.oculto ?? [],
      ...(errores.length ? { errores: errores.slice(0, 12) } : {}),
    } satisfies RespuestaEstrategia, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
