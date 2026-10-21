import { createServiceClient } from '@/lib/supabase/service'
import { muestrasDeHae } from '@/features/salud/hae'
import { hashToken, tokenDe } from '@/features/salud/servidor'

// Ingesta de salud multiusuario (5 oct 2026): Health Auto Export (automatización REST API) → aquí, con el token de
// cada usuario. Sin sesión: el token es la llave y solo escribe salud de su dueño. Cada muestra entra con su
// timestamp exacto; lo que HAE reenvía se actualiza en vez de duplicarse (llave usuario, métrica, ts).
export const runtime = 'nodejs'
export const maxDuration = 60
const LIMITE = 12_000_000
const LOTE = 1000
const noStore = { 'Cache-Control': 'no-store' }
const responder = (cuerpo: Record<string, unknown>, status = 200) => Response.json(cuerpo, { status, headers: noStore })

export async function GET() { return responder({ ok: true, servicio: 'salud-ingest', uso: 'POST con Authorization: Bearer <tu token>' }) }

export async function POST(request: Request) {
  const token = tokenDe(request)
  if (!token) return responder({ ok: false, error: 'Falta el token. Usa el encabezado Authorization: Bearer <tu token>.' }, 401)
  const db = createServiceClient()
  const { data: conexion, error } = await db.from('salud_conexiones').select('user_id').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) return responder({ ok: false, error: 'No se pudo verificar el token. Reintenta.' }, 503)
  if (!conexion) return responder({ ok: false, error: 'Token inválido o regenerado. Copia el nuevo desde «Conecta tu reloj».' }, 401)
  const userId = conexion.user_id as string
  const marcar = (cambios: Record<string, unknown>) => db.from('salud_conexiones').update(cambios).eq('user_id', userId)

  if (Number(request.headers.get('content-length') ?? 0) > LIMITE) return responder({ ok: false, error: 'Envío demasiado grande: manda menos días por envío.' }, 413)
  const texto = await request.text()
  if (texto.length > LIMITE) return responder({ ok: false, error: 'Envío demasiado grande: manda menos días por envío.' }, 413)
  let doc: unknown
  try { doc = JSON.parse(texto) } catch {
    await marcar({ ultimo_error: 'El último envío no era JSON. En Health Auto Export elige el formato JSON.' })
    return responder({ ok: false, error: 'El envío no es JSON. Elige el formato JSON en Health Auto Export.' }, 400)
  }

  const hoy = new Date(), maximo = new Date(hoy.getTime() + 2 * 864e5).toISOString().slice(0, 10), minimo = new Date(hoy.getTime() - 3 * 365 * 864e5).toISOString().slice(0, 10)
  const muestras = muestrasDeHae(doc).filter(m => m.fecha >= minimo && m.fecha <= maximo)
  const ahora = new Date().toISOString()
  if (!muestras.length) {
    await marcar({ ultimo_envio: ahora, ultimo_envio_muestras: 0, ultimo_error: 'El último envío llegó sin ninguna de las 7 métricas. Revisa las métricas elegidas en la automatización.' })
    return responder({ ok: true, muestras: 0, aviso: 'Llegó, pero sin ninguna de las 7 métricas.' })
  }
  for (let i = 0; i < muestras.length; i += LOTE) {
    const filas = muestras.slice(i, i + LOTE).map(m => ({ user_id: userId, metrica: m.metrica, ts: m.ts, fecha: m.fecha, valor: m.valor, extra: m.extra ?? null, recibido_en: ahora }))
    const { error: e } = await db.from('salud_muestras').upsert(filas, { onConflict: 'user_id,metrica,ts' })
    if (e) {
      await marcar({ ultimo_error: 'El último envío no se pudo guardar completo. Health Auto Export lo reintentará.' })
      return responder({ ok: false, error: 'No se pudo guardar el envío. Reintenta.' }, 503)
    }
  }
  await marcar({ ultimo_envio: ahora, ultimo_envio_muestras: muestras.length, ultimo_error: null })
  const fechas = [...new Set(muestras.map(m => m.fecha))].sort()
  return responder({ ok: true, muestras: muestras.length, dias: fechas.length, desde: fechas[0], hasta: fechas.at(-1) })
}
