import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { esEdicionCliente } from '@/lib/edicion'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { raizCerebro } from '@/features/bi/servidor'
import { aplicar, ESQUEMA_BI, RUTA_BI, validarBI, type Accion, type ArchivoBI, type Grafica } from '@/features/bi/modelo'

// Business Intelligence (7 nov 2026). GET: las gráficas que Levy escribió en la memoria (RUTA_BI), validadas; las inválidas
// llegan como errores en palabras. POST: lo que el dueño hace desde el panel (fijar, soltar, descartar, mover), escrito de
// forma atómica en el mismo archivo. Detrás de ARBRAIN_PANEL_NEGOCIO=1, como Tu negocio; fuera de la edición del dueño, apagado.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'private, no-store' }
export type RespuestaBI = { activo: false } | { activo: true; ruta: string; graficas: Grafica[]; errores: string[]; simulado?: string }
const apagado = () => Response.json({ activo: false } satisfies RespuestaBI, { headers: NOCACHE })
const simulado = () => (process.env.NODE_ENV !== 'production' ? process.env.ARBRAIN_BI_SIMULADO : undefined)

async function leerArchivo(base: string): Promise<{ crudo: unknown; falta: boolean }> {
  try { return { crudo: JSON.parse(await readFile(path.join(base, RUTA_BI), 'utf8')), falta: false } } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { crudo: { esquema: ESQUEMA_BI, graficas: [] }, falta: true }
    return { crudo: null, falta: false }
  }
}

export async function GET() {
  if (!panelNegocioEncendido() || esEdicionCliente()) return apagado()
  try {
    await planningOwner()
    const base = raizCerebro()
    if (!base) return Response.json({ activo: true, ruta: RUTA_BI, graficas: [], errores: ['No se encontró la raíz del cerebro.'] } satisfies RespuestaBI, { headers: NOCACHE })
    const { crudo } = await leerArchivo(base)
    if (crudo === null) return Response.json({ activo: true, ruta: RUTA_BI, graficas: [], errores: ['El archivo de gráficas no es JSON válido.'] } satisfies RespuestaBI, { headers: NOCACHE })
    const v = validarBI(crudo)
    return Response.json({ activo: true, ruta: RUTA_BI, graficas: v.graficas, errores: v.errores.slice(0, 12), ...(simulado() ? { simulado: simulado() } : {}) } satisfies RespuestaBI, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}

export async function POST(request: Request) {
  if (!panelNegocioEncendido() || esEdicionCliente()) return apagado()
  try {
    checkMutationOrigin(request)
    await planningOwner()
    const cuerpo = await request.json().catch(() => null) as Accion | null
    const acciones = ['fijar', 'soltar', 'descartar', 'mover']
    if (!cuerpo || typeof cuerpo.id !== 'string' || !acciones.includes(cuerpo.accion) || (cuerpo.accion === 'mover' && typeof cuerpo.a !== 'number'))
      return Response.json({ ok: false, error: 'Acción inválida.' }, { status: 400, headers: NOCACHE })
    const base = raizCerebro()
    if (!base) return Response.json({ ok: false, error: 'No se encontró la raíz del cerebro.' }, { status: 503, headers: NOCACHE })
    const { crudo } = await leerArchivo(base)
    if (crudo === null) return Response.json({ ok: false, error: 'El archivo de gráficas no es JSON válido; Levy lo corrige.' }, { status: 409, headers: NOCACHE })
    const v = validarBI(crudo)
    // Lo que no valida se conserva tal cual: el panel no borra lo que no entiende.
    const invalidas = Array.isArray((crudo as { graficas?: unknown[] }).graficas) ? (crudo as { graficas: unknown[] }).graficas.filter(g => !v.graficas.includes(g as Grafica)) : []
    const r = aplicar({ esquema: ESQUEMA_BI, graficas: v.graficas }, cuerpo)
    if ('error' in r) return Response.json({ ok: false, error: r.error }, { status: 404, headers: NOCACHE })
    const archivo: { esquema: ArchivoBI['esquema']; graficas: unknown[] } = { esquema: ESQUEMA_BI, graficas: [...r.archivo.graficas, ...invalidas] }
    const destino = path.join(base, RUTA_BI), tmp = `${destino}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(archivo, null, 2)}\n`, 'utf8')
    await rename(tmp, destino)
    return Response.json({ ok: true, graficas: r.archivo.graficas }, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}
