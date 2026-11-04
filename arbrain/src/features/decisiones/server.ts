import 'server-only'
/**
 * La web habla con la bandeja del daemon (autonomía v2). Las dos ediciones:
 *   - original: la sesión de su dueño (Supabase) + el token del daemon; decidir lleva además el secreto que el daemon dejó
 *     en `<config>/autonomia/secreto-decidir` (0600): un agente con el token puede pedir, no decidir.
 *   - cliente: solo la app (cookie del secreto por instalación) y el secreto de confirmar que la app le pasó a la web.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { esEdicionCliente } from '@/lib/edicion'
import { alDaemon, NOCACHE, soloAppCliente } from '@/lib/daemon-local'
import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { checkMutationOrigin, planningError } from '@/lib/planning/server'
import { CLAUDECLAW_TOKEN, getSchedulerUrl } from '@/lib/claudeclaw'

const secretoDecidir = (): string => {
  const dir = process.env.ARBRAIN_CONFIG_DIR || join(homedir(), '.config', 'arbrain')
  try { return readFileSync(process.env.ARBRAIN_SECRETO_DECIDIR_ARCHIVO || join(dir, 'autonomia', 'secreto-decidir'), 'utf8').trim() } catch { return '' }
}

/** Llama a la bandeja del daemon como la persona (lectura) o como la persona que decide (`decidir`). */
export async function aLaBandeja(request: Request, ruta: string, op: { metodo?: 'GET' | 'POST'; cuerpo?: unknown; decidir?: boolean } = {}): Promise<Response> {
  const metodo = op.metodo ?? 'GET'
  if (esEdicionCliente()) {
    const no = await soloAppCliente(request, metodo === 'POST')
    if (no) return no
    return alDaemon(ruta, { method: metodo, ...(op.cuerpo !== undefined ? { body: JSON.stringify(op.cuerpo) } : {}), confirmar: !!op.decidir })
  }
  try {
    const principal = await requireChatPrincipal()
    if (!principal.personalOwner) throw new ChatAccessError('La bandeja es del dueño de este Arbrain.', 403)
    if (metodo === 'POST') checkMutationOrigin(request)
    const headers: Record<string, string> = { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' }
    if (op.decidir) {
      const s = secretoDecidir()
      if (!s) return Response.json({ error: 'Esta web no puede decidir: falta el secreto de la bandeja (reinicia el servidor de Arbrain).' }, { status: 503, headers: NOCACHE })
      headers['x-arbrain-decidir'] = s
    }
    const r = await fetch(`${await getSchedulerUrl()}${ruta}`, { method: metodo, headers, ...(op.cuerpo !== undefined ? { body: JSON.stringify(op.cuerpo) } : {}), cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    const texto = await r.text()
    return new Response(texto || '{}', { status: r.status, headers: { 'Content-Type': 'application/json', ...NOCACHE } })
  } catch (error) { return planningError(error) }
}
