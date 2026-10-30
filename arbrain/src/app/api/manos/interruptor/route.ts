import { isDesktopAuthBypassFromHeaders } from '@/lib/desktop-auth-server'
import { requireChatPrincipal } from '@/lib/chat-access'
import { checkMutationOrigin, planningError } from '@/lib/planning/server'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { alDaemon, soloAppCliente } from '@/lib/daemon-local'
import { edicionCliente, fijarComputerUse, fijarComputerUseCliente, leerComputerUse, leerComputerUseCliente } from '@/features/permisos/lib/computer-use'
import { computerUseDisponible, decisionInterruptorCliente, ESTADO_CLIENTE_SIN_COMPUTER_USE, plataformaServidor } from '@/features/permisos/lib/disponibilidad'
import { estadoSandbox } from '@/features/permisos/lib/sandbox-server'

// Interruptor de computer use (10 oct 2026, AUDITORIA I7): GET = estado; POST { encendido } = decisión de la persona.
// Instalación original: el archivo de config que leen las manos. Edición cliente (contrato v3 §6.2, red team M1): el
// daemon es la fuente; este servidor le habla con su Bearer y, para encender, con el secreto de confirmar. Solo la app.
// La respuesta lleva `sandbox` (v3 §6.1) para que el primer arranque y Ajustes avisen si la terminal no tiene sandbox.
// 0.1.2 (17 oct 2026, revierte DECISIONES #11 con su red team): en cliente computer use existe en macOS y Windows; el
// daemon manda y cada apertura nace apagada. En Linux el estado es fijo (apagado, no disponible), encender es 403 y no
// se le pregunta nada al daemon. La respuesta de cliente lleva `disponible` y `plataforma` para que la app pinte el
// interruptor o el aviso. La instalación original sigue igual.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NOCACHE = { 'Cache-Control': 'no-store' }

const plataforma = () => plataformaServidor(process.env, process.platform)
const conComputerUse = () => computerUseDisponible(true, plataforma())

async function soloDueno() {
  if (await isDesktopAuthBypassFromHeaders()) return
  const principal = await requireChatPrincipal()
  if (!principal.owner) throw new ChatAccessError('Solo la dueña o el dueño de esta Mac decide sobre computer use.', 403)
}

export async function GET() {
  if (edicionCliente()) {
    const no = await soloAppCliente()
    if (no) return no
    if (!conComputerUse()) return Response.json({ ...ESTADO_CLIENTE_SIN_COMPUTER_USE, plataforma: plataforma(), sandbox: estadoSandbox() }, { headers: NOCACHE })
    const r = await leerComputerUseCliente(alDaemon)
    if ('error' in r) return r.error
    return Response.json({ ...r.estado, disponible: true, plataforma: plataforma(), sandbox: estadoSandbox() }, { headers: NOCACHE })
  }
  try {
    await soloDueno()
    return Response.json(leerComputerUse(), { headers: NOCACHE })
  } catch (error) { return planningError(error) }
}

export async function POST(request: Request) {
  if (edicionCliente()) {
    const no = await soloAppCliente(request, true)
    if (no) return no
    const body = await request.json().catch(() => ({})) as { encendido?: unknown }
    if (!conComputerUse()) {
      const d = decisionInterruptorCliente(body.encendido)
      if (d.error) return Response.json({ error: d.error }, { status: d.status, headers: NOCACHE })
      return Response.json({ ...ESTADO_CLIENTE_SIN_COMPUTER_USE, plataforma: plataforma(), sandbox: estadoSandbox() }, { headers: NOCACHE })
    }
    if (typeof body.encendido !== 'boolean') return Response.json({ error: 'encendido debe ser true o false' }, { status: 400, headers: NOCACHE })
    // Encender lleva el secreto de confirmar del daemon (v3 §6.2); el navegador nunca lo ve.
    const r = await fijarComputerUseCliente(alDaemon, body.encendido)
    if ('error' in r) return r.error
    return Response.json({ ...r.estado, disponible: true, plataforma: plataforma(), sandbox: estadoSandbox() }, { headers: NOCACHE })
  }
  try {
    checkMutationOrigin(request)
    await soloDueno()
    const body = await request.json().catch(() => ({})) as { encendido?: unknown }
    if (typeof body.encendido !== 'boolean') return Response.json({ error: 'encendido debe ser true o false' }, { status: 400, headers: NOCACHE })
    return Response.json(fijarComputerUse(body.encendido), { headers: NOCACHE })
  } catch (error) { return planningError(error) }
}
