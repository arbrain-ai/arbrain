import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'
import { createServiceClient } from '@/lib/supabase/service'
import { esEdicionCliente } from '@/lib/edicion'
import { armarBandeja, postDeRecap, type AvisoFila, type EstadoDecision } from '@/features/avisos/bandeja'
import { estadosDecisiones, recapsPublicados } from '@/features/avisos/decisiones'

// La campana (25 sep 2026; decisiones, no reportes, 29 oct). Lee y marca `avisos` del principal por el servidor:
// funciona igual en la PWA (sesión Supabase) y en el escritorio (bypass local), sin exponer la tabla al navegador.
// La telemetría vive en `bitacora` y nunca sale por aquí. Cada lectura arma la bandeja (features/avisos/bandeja.ts):
// «Te toca decidir», «Urgente» y «Para saber»; lo que se resolvió solo queda cerrado con su motivo.

const noStore = { 'Cache-Control': 'no-store' }
const COLUMNAS = 'id,created_at,kind,source,title,body,url,read_at'

type Service = ReturnType<typeof createServiceClient>

async function abiertos(supabase: Service, userId: string): Promise<AvisoFila[]> {
  const nuevo = await supabase.from('avisos').select(`${COLUMNAS},clave,resuelto_at,resuelto_por`).eq('user_id', userId)
    .is('resuelto_at', null).order('created_at', { ascending: false }).limit(80)
  if (!nuevo.error) return (nuevo.data ?? []) as AvisoFila[]
  // Base sin la migración 20261029: la campana sigue, sin cierres guardados.
  const viejo = await supabase.from('avisos').select(COLUMNAS).eq('user_id', userId).order('created_at', { ascending: false }).limit(80)
  if (viejo.error) throw new Error(viejo.error.message)
  return (viejo.data ?? []) as AvisoFila[]
}

/** Guarda los cierres: dejan de aparecer y cuentan como leídos (now.md y la píldora del chat leen `read_at`). */
async function cerrar(supabase: Service, userId: string, cierres: { id: string; por: string }[]) {
  const ahora = new Date().toISOString()
  const porMotivo = new Map<string, string[]>()
  for (const c of cierres) porMotivo.set(c.por, [...(porMotivo.get(c.por) ?? []), c.id])
  await Promise.all([...porMotivo].map(([por, ids]) =>
    supabase.from('avisos').update({ resuelto_at: ahora, resuelto_por: por }).eq('user_id', userId).in('id', ids).is('resuelto_at', null)))
  const ids = cierres.map(c => c.id)
  await supabase.from('avisos').update({ read_at: ahora }).eq('user_id', userId).in('id', ids).is('read_at', null)
}

export async function GET() {
  try {
    const principal = await requireChatPrincipal()
    const supabase = createServiceClient()
    const filas = await abiertos(supabase, principal.id)
    const cliente = esEdicionCliente()
    const recaps = filas.map(postDeRecap).filter((x): x is string => !!x)
    const [estados, publicados]: [Map<string, EstadoDecision>, Set<string>] = cliente ? [new Map(), new Set()]
      : await Promise.all([estadosDecisiones(filas.map(f => f.url)), recapsPublicados(recaps)])
    const b = armarBandeja(filas, estados, new Date(), 20, publicados)
    if (b.cerrar.length && 'resuelto_at' in (filas[0] ?? {})) await cerrar(supabase, principal.id, b.cerrar).catch(() => undefined)
    return Response.json({
      decidir: b.decidir, urgente: b.urgente, saber: b.saber, pendientes: b.pendientes,
      // Compatibilidad: `avisos` (todo lo abierto) y `unread`, que ahora es el número de la campana.
      avisos: [...b.decidir, ...b.urgente, ...b.saber].map(v => ({ ...v, title: v.titulo, body: v.frase })), unread: b.pendientes,
    }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return Response.json({ error: 'No se pudo leer la campana.' }, { status: 503, headers: noStore })
    }
    return chatAccessResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    const principal = await requireChatPrincipal()
    const body = await request.json().catch(() => ({})) as { ids?: unknown }
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 100) : null
    let query = createServiceClient().from('avisos').update({ read_at: new Date().toISOString() })
      .eq('user_id', principal.id).is('read_at', null)
    if (ids) query = query.in('id', ids)
    const { error } = await query
    if (error) throw new Error(error.message)
    return Response.json({ ok: true }, { headers: noStore })
  } catch (error) {
    if (error instanceof Error && !('status' in error)) {
      return Response.json({ error: 'No se pudo marcar la campana.' }, { status: 503, headers: noStore })
    }
    return chatAccessResponse(error)
  }
}
