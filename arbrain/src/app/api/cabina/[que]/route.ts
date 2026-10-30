import { planningOwner, planningError, checkMutationOrigin } from '@/lib/planning/server'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { sinRespuestaDelServidor } from '@/lib/edicion'
import { createServiceClient } from '@/lib/supabase/service'

// Vistas del Studio (goal 2): «negocio» (libro del negocio con fechas reales de
// revisión), «trabajos» (terminales del motor de Arbrain, servidores y servicios) y
// «servidores» (4 oct: ¿abre lo que usan tus miembros?; `ahora=1` pide revisar ya). Viven
// donde vive la máquina: el daemon del Studio las lee; esta ruta solo las pide.
// «memoria» (4 oct: la memoria de Levy; `leer=ruta` abre un archivo) y «contexto» (la anatomía medida de la
// ventana de una conversación; `medir=1` corre la sonda /context).
// «salida» = la salida de un subagente interno o comando en segundo plano de Levy;
// «actividad» (7 oct) = lo que hace un subagente sin pantalla, leído de su bitácora desde un offset (agente, desde, turno).
// «masterclass» (7 oct) = la fuente única de la masterclass del 17 oct, leída del repo del Studio.
// con el mismo bearer que ya usa la planificación.

export const runtime = 'nodejs'
const VISTAS = new Set(['negocio', 'trabajos', 'salida', 'servidores', 'memoria', 'contexto', 'actividad', 'masterclass'])

const entero = (v: string | null) => v != null && /^\d{1,12}$/.test(v) ? Number(v) : undefined
const actividad = (q: URLSearchParams) => ({ agente: entero(q.get('agente')), desde: entero(q.get('desde')), turno: entero(q.get('turno')) })

export async function GET(request: Request, { params }: { params: Promise<{ que: string }> }) {
  try {
    const dueno = await planningOwner()
    const { que } = await params
    if (!VISTAS.has(que)) return Response.json({ error: 'Vista desconocida.' }, { status: 404 })
    const q = new URL(request.url).searchParams
    const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ que, conTexto: q.get('texto') === '1', lineas: Number(q.get('lineas')) || undefined, ...(que === 'servidores' ? { ahora: q.get('ahora') === '1' } : {}), ...(que === 'memoria' && q.get('leer') ? { leer: q.get('leer')!.slice(0, 300) } : {}), ...(que === 'contexto' ? { conversacion: q.get('conversacion')?.slice(0, 80) || undefined, medir: q.get('medir') === '1' } : {}), ...(que === 'salida' ? { tarea: (q.get('tarea') ?? '').slice(0, 120) } : {}), ...(que === 'actividad' ? actividad(q) : {}) }),
      signal: AbortSignal.timeout(40_000), cache: 'no-store',
    })
    const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
    if (que === 'trabajos' && res.ok) await sinTrabajosAjenos(body, dueno)
    return Response.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}

/**
 * Los trabajos internos que nacieron en la conversación de OTRO perfil (29 oct 2026: los de la segunda persona con su
 * Levy) no son del Taller del dueño: la app pedía el título de esa conversación y recibía 404, y él veía qué hacía ella.
 * Si la base no responde, quedan como estaban.
 */
async function sinTrabajosAjenos(body: { internas?: Array<{ conversacion?: string | null }> }, dueno: string) {
  if (!Array.isArray(body.internas)) return
  const ids = [...new Set(body.internas.map((i) => i.conversacion).filter((c): c is string => typeof c === 'string' && /^[0-9a-f-]{36}$/i.test(c)))]
  if (!ids.length) return
  const { data, error } = await createServiceClient().from('chat_sessions').select('id, profile_id').in('id', ids)
  if (error || !data) return
  const ajenas = new Set(data.filter((f) => f.profile_id && f.profile_id !== dueno).map((f) => f.id as string))
  if (ajenas.size) body.internas = body.internas.filter((i) => !i.conversacion || !ajenas.has(i.conversacion))
}

// «Apagar» del Taller (5 oct 2026): solo un proceso que el Studio marca como huérfano. Se manda su firma (pid:arranque)
// y el agent-server re-verifica en el momento; si cambió de dueño o de pid, no toca nada y lo dice.
export async function POST(request: Request, { params }: { params: Promise<{ que: string }> }) {
  try {
    await planningOwner()
    const { que } = await params
    // Tablero de agentes (27 oct 2026): Detener y Responder a un subagente de Levy. El agent-server re-verifica que sea
    // suyo y siga abierto, y usa la misma vía que Levy (detener / retomar).
    if (que === 'detener' || que === 'responder') {
      checkMutationOrigin(request)
      const { agente, texto, esfuerzo } = await request.json().catch(() => ({})) as { agente?: unknown; texto?: unknown; esfuerzo?: unknown }
      if (typeof agente !== 'number' || !Number.isInteger(agente) || agente <= 0) return Response.json({ error: 'Falta el agente.' }, { status: 400 })
      if (que === 'responder' && (typeof texto !== 'string' || !texto.trim() || texto.length > 4000)) return Response.json({ error: 'Escribe el mensaje (máximo 4,000 caracteres).' }, { status: 400 })
      const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
        method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
        // esfuerzo («Reintentar con más esfuerzo»): el agent-server lo valida contra su lista y el catálogo vivo
        body: JSON.stringify({ que, agente, ...(que === 'responder' ? { texto, ...(typeof esfuerzo === 'string' ? { esfuerzo: esfuerzo.slice(0, 20) } : {}) } : {}) }), signal: AbortSignal.timeout(45_000), cache: 'no-store',
      })
      const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
      return Response.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
    }
    // Comentarios en lote sobre el entregable (29 oct 2026) y planes versionados (correr o descartar): el agent-server valida
    // forma, topes y ruta (acciones-tablero.ts); aquí solo se acota el tamaño y se pasa tal cual.
    if (que === 'comentarios' || que === 'correr-plan' || que === 'descartar-plan') {
      checkMutationOrigin(request)
      const crudo = await request.text()
      if (crudo.length > 64_000) return Response.json({ error: 'Demasiado grande.' }, { status: 413 })
      const cuerpo = (() => { try { return JSON.parse(crudo) as Record<string, unknown> } catch { return null } })()
      if (!cuerpo || typeof cuerpo !== 'object') return Response.json({ error: 'Se espera JSON.' }, { status: 400 })
      const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
        method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(que === 'comentarios' ? { que, agente: cuerpo.agente, comentarios: cuerpo.comentarios } : { que, ruta: cuerpo.ruta }),
        signal: AbortSignal.timeout(60_000), cache: 'no-store',
      })
      const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
      return Response.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
    }
    if (que !== 'apagar') return Response.json({ error: 'Acción desconocida.' }, { status: 404 })
    const { firma } = await request.json().catch(() => ({})) as { firma?: unknown }
    if (typeof firma !== 'string' || !/^\d+:\d+$/.test(firma)) return Response.json({ error: 'Falta la firma del proceso.' }, { status: 400 })
    const res = await fetch(`${await getSchedulerUrl()}/cabina`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ que: 'apagar', firma }), signal: AbortSignal.timeout(30_000), cache: 'no-store',
    })
    const body = await res.json().catch(() => ({ error: sinRespuestaDelServidor() }))
    return Response.json(body, { status: res.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
