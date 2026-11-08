import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { leerPrimerArranque } from '@/features/primer-arranque/lib/estado'
import { planActual } from '@/features/primer-arranque/lib/tour-servidor'
import { debeOfrecer, evaluar, mensajeOferta, mensajePaso, PASOS, primerDiaEncendido, type IdPaso, type RespuestaPrimerDia } from '@/features/primer-dia/modelo'
import { leerEstado, leerSenales, marcarOfrecido, mostrar, ocultar, publicarOferta, rutinasDe, sembrarGuia } from '@/features/primer-dia/servidor'

// Tu primer día (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga; docs/builds/onboarding-taller-2026-11-05/). Solo la
// edición del alumno y solo la app (cookie del secreto por instalación). Apagado: { activo: false } y nada cambia.
//   GET                               el avance de los cinco pasos, leído del disco y de SU daemon, y si toca ofrecerlo solo
//   POST { accion: 'ofrecer' }        una vez: guarda la guía en su memoria y Levy abre el primer día en el chat
//   POST { accion: 'empezar', paso }  guarda la guía (si falta) y devuelve el mensaje para Levy de ese paso
//   POST { accion: 'ocultar' | 'mostrar' }
// La lógica vive en features/primer-dia (modelo.ts es puro).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APAGADO = () => Response.json({ activo: false } satisfies RespuestaPrimerDia, { headers: NOCACHE })

async function rutinas() {
  const r = await alDaemon('/schedule', { plazoMs: 2_000 })
  return r.ok ? rutinasDe(await r.json().catch(() => null)) : null
}

function tourPendiente(): boolean {
  try { return planActual() != null } catch { return true }
}

export async function GET() {
  if (!primerDiaEncendido()) return APAGADO()
  const no = await soloAppCliente()
  if (no) return APAGADO()
  try {
    const avance = evaluar(leerSenales(await rutinas()))
    const estado = leerEstado()
    const ofrecer = debeOfrecer({ bienvenidaCompleta: !!leerPrimerArranque().completado, tourPendiente: tourPendiente(), primerDia: estado })
    return Response.json({ activo: true, avance, ofrecer, oculto: !!estado.oculto } satisfies RespuestaPrimerDia, { headers: NOCACHE })
  } catch (e) {
    return Response.json({ activo: false, error: e instanceof Error ? e.message : 'No pude leer tu primer día.' }, { status: 503, headers: NOCACHE })
  }
}

type Cuerpo = { accion?: unknown; paso?: unknown; errores?: unknown }
const esPaso = (x: unknown): x is IdPaso => PASOS.some(p => p.id === x)

export async function POST(request: Request) {
  if (!primerDiaEncendido()) return Response.json({ error: 'Tu primer día está apagado.' }, { status: 404, headers: NOCACHE })
  const no = await soloAppCliente(request, true)
  if (no) return no
  const body = await request.json().catch(() => ({})) as Cuerpo
  try {
    if (body.accion === 'ocultar') return Response.json({ estado: ocultar() }, { headers: NOCACHE })
    if (body.accion === 'mostrar') return Response.json({ estado: mostrar() }, { headers: NOCACHE })
    if (body.accion === 'empezar') {
      if (!esPaso(body.paso)) return Response.json({ error: 'Paso desconocido.' }, { status: 400, headers: NOCACHE })
      sembrarGuia()
      const errores = Array.isArray(body.errores) ? body.errores.filter((x): x is string => typeof x === 'string').slice(0, 6) : undefined
      return Response.json({ mensaje: mensajePaso(body.paso, { errores }) }, { headers: NOCACHE })
    }
    if (body.accion === 'ofrecer') {
      const e = leerPrimerArranque()
      // Una sola vez y nunca encima del recorrido: si ya se ofreció, o no toca, no se publica nada.
      if (!debeOfrecer({ bienvenidaCompleta: !!e.completado, tourPendiente: tourPendiente(), primerDia: leerEstado() })) return Response.json({ sesion: null }, { headers: NOCACHE })
      sembrarGuia()
      marcarOfrecido()
      const sesion = await publicarOferta(mensajeOferta(e.nombre), e.sesionBienvenida)
      return Response.json({ sesion }, { headers: NOCACHE })
    }
    return Response.json({ error: 'Acción desconocida.' }, { status: 400, headers: NOCACHE })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No pude guardar tu primer día.' }, { status: 503, headers: NOCACHE })
  }
}
