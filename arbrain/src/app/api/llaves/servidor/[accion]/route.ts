import { NOCACHE, soloAppCliente, tokenDaemon } from '@/lib/daemon-local'
import { ACCIONES, esModoServidor, urlControl } from '@/lib/modo-servidor'

// Modo servidor (21 oct 2026): lo que en la app hacen los comandos de Tauri (`llaves_estado`, `llave_guardar`,
// `llave_borrar`, `daemon_estado`, `daemon_reiniciar`) lo atiende el supervisor de `npm run servidor`. Esta ruta lo
// reenvía a su control local con el token del daemon (que la web recibe por stdin; el navegador nunca lo ve).
// Exige la sesión de la web (cookie) y, al cambiar algo, origen propio. Fuera del modo servidor: 404.
// La llave pasa por aquí una sola vez, del campo de texto al archivo privado del supervisor; nunca se devuelve.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function atender(request: Request, params: Promise<{ accion: string }>, metodo: 'GET' | 'POST') {
  if (!esModoServidor()) return Response.json({ error: 'No disponible en esta edición.' }, { status: 404, headers: NOCACHE })
  const no = await soloAppCliente(request, metodo === 'POST')
  if (no) return no
  const { accion } = await params
  const destino = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : undefined
  if (!destino || destino.metodo !== metodo) return Response.json({ error: 'No existe.' }, { status: 404, headers: NOCACHE })
  const control = urlControl()
  const token = tokenDaemon()
  if (!control || !token) return Response.json({ error: 'El servidor de Arbrain no le pasó a la web su control. Reinícialo con `npm run servidor`.' }, { status: 503, headers: NOCACHE })
  let cuerpo: string | undefined
  if (metodo === 'POST') {
    const j = await request.json().catch(() => ({})) as Record<string, unknown>
    cuerpo = JSON.stringify({ nombre: j.nombre, valor: j.valor })
  }
  try {
    const r = await fetch(`${control}${destino.control}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const j = await r.json().catch(() => ({ error: 'Respuesta ilegible del servidor de Arbrain.' }))
    return Response.json(j, { status: r.status, headers: NOCACHE })
  } catch {
    return Response.json({ error: 'No pude hablar con el servidor de Arbrain. ¿Sigue corriendo `npm run servidor`?' }, { status: 503, headers: NOCACHE })
  }
}

export function GET(request: Request, ctx: { params: Promise<{ accion: string }> }) {
  return atender(request, ctx.params, 'GET')
}

export function POST(request: Request, ctx: { params: Promise<{ accion: string }> }) {
  return atender(request, ctx.params, 'POST')
}
