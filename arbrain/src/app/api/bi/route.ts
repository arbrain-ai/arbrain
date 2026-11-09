import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { checkMutationOrigin, planningError, planningOwner } from '@/lib/planning/server'
import { panelNegocioEncendido } from '@/features/negocio/embudo'
import { catalogoVigente, raizCerebro } from '@/features/bi/servidor'
import { RUTA_FUENTES } from '@/features/bi/generico'
import { aplicar, ESQUEMA_BI, RUTA_BI, validarBI, type Accion, type ArchivoBI, type Grafica } from '@/features/bi/modelo'
import type { RespuestaBI } from '@/features/bi/fuente'

// Business Intelligence (7 nov 2026). GET: las gráficas que Levy escribió en la memoria (RUTA_BI), validadas contra el catálogo
// vigente (el del autor o el genérico, servidor.ts), y ese catálogo; las inválidas llegan como errores en palabras. Con el
// genérico, también cómo está `bi-fuentes.json` (qué consultas ya tienen fuente). POST: lo que el dueño hace desde el panel
// (fijar, soltar, descartar, mover), escrito de forma atómica en el mismo archivo. Detrás del interruptor de Tu negocio
// (ARBRAIN_PANEL_NEGOCIO): en la instalación del autor con =1; en la del alumno encendido como motor vacío (8 nov).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOCACHE = { 'Cache-Control': 'private, no-store' }
const apagado = () => Response.json({ activo: false } satisfies RespuestaBI, { headers: NOCACHE })
const simulado = () => (process.env.NODE_ENV !== 'production' ? process.env.ARBRAIN_BI_SIMULADO : undefined)

async function leerArchivo(base: string): Promise<{ crudo: unknown; falta: boolean }> {
  try { return { crudo: JSON.parse(await readFile(path.join(base, RUTA_BI), 'utf8')), falta: false } } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { crudo: { esquema: ESQUEMA_BI, graficas: [] }, falta: true }
    return { crudo: null, falta: false }
  }
}

export async function GET() {
  if (!panelNegocioEncendido()) return apagado()
  try {
    await planningOwner()
    const base = raizCerebro()
    const vigente = await catalogoVigente(base)
    const comun = {
      activo: true as const, ruta: RUTA_BI, catalogo: vigente.catalogo, generico: vigente.generico,
      ...(vigente.fuentes ? { fuentes: { ruta: RUTA_FUENTES, existe: vigente.fuentes.existe, errores: vigente.fuentes.errores.slice(0, 12), ...(vigente.fuentes.archivo?.negocio ? { negocio: vigente.fuentes.archivo.negocio } : {}) } } : {}),
    }
    if (!base) return Response.json({ ...comun, graficas: [], errores: ['No se encontró la raíz del cerebro.'] } satisfies RespuestaBI, { headers: NOCACHE })
    const { crudo } = await leerArchivo(base)
    if (crudo === null) return Response.json({ ...comun, graficas: [], errores: ['El archivo de gráficas no es JSON válido.'] } satisfies RespuestaBI, { headers: NOCACHE })
    const v = validarBI(crudo, vigente.catalogo)
    return Response.json({ ...comun, graficas: v.graficas, errores: v.errores.slice(0, 12), ...(simulado() && !vigente.generico ? { simulado: simulado() } : {}) } satisfies RespuestaBI, { headers: NOCACHE })
  } catch (error) {
    return planningError(error)
  }
}

export async function POST(request: Request) {
  if (!panelNegocioEncendido()) return apagado()
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
    const v = validarBI(crudo, (await catalogoVigente(base)).catalogo)
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
