import 'server-only'
import { llegaPorTelefono } from '@/features/telefono/host-telefono'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { requireChatPrincipal } from '@/lib/chat-access'
import { ChatAccessError } from '@/lib/chat-access-policy'
import { getSchedulerUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { dirConfigArbrain, raizWorkspace } from '@/lib/rutas-instalacion'
import { esEdicionCliente } from '@/lib/edicion'
import { NOMBRE_DUENO } from '@/config'
import { PlumaLocal } from './local'

export async function planningOwner() {
  const principal = await requireChatPrincipal()
  if (!principal.personalOwner) throw new ChatAccessError(`Este calendario personal requiere acceso de ${NOMBRE_DUENO()}.`, 403)
  return principal.id
}

export function planningError(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : 'No se pudo consultar la planificación.' },
    { status: error instanceof ChatAccessError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
}

export function checkMutationOrigin(request: Request) {
  const origin = request.headers.get('origin')
  // Next may normalize request.url to localhost even when the browser reached
  // 127.0.0.1. Compare against the actual HTTP Host, never a caller-supplied
  // forwarded-host. Cookies still authenticate the principal independently.
  const requestUrl = new URL(request.url)
  // Teléfono (23 oct 2026): por `tailscale serve` el navegador habla HTTPS y la web recibe HTTP en 127.0.0.1.
  const protocolo = llegaPorTelefono(request.headers.get('host'), request.headers.get('x-forwarded-proto')) ? 'https:' : requestUrl.protocol
  const expected = `${protocolo}//${request.headers.get('host') ?? requestUrl.host}`
  if ((origin && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ChatAccessError('Origen de escritura no autorizado.', 403)
  }
}

export async function callPlanning(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Edición cliente (21 oct 2026): la pluma es local, sobre los archivos del cerebro del alumno (lib/planning/local.ts).
  // Nunca llama a mc-event.py ni al scheduler: ni la cuenta de Google ni el Todoist de nadie más.
  if (esEdicionCliente()) return new PlumaLocal(raizWorkspace()).handle(payload)
  const root = process.env.BUSINESS_OS_ROOT ?? join(homedir(), 'Developer/business-os')
  const script = join(root, 'arbrain/server/scripts/calendar/mc-event.py')
  let residentDesktop = false
  if (!process.env.VERCEL && process.env.MISSION_CONTROL_DESKTOP_EMBED === '1') {
    try {
      const authority = JSON.parse(readFileSync(join(dirConfigArbrain(), 'planning-authority.json'), 'utf8'))
      // Explicit machine-bound authority: another Mac cannot accidentally create
      // a second duration/receipt store just because it has a checkout.
      residentDesktop = authority.host === hostname() && authority.root === root
    } catch { /* An unconfigured desktop uses the common remote host. */ }
  }
  let result: Record<string, unknown>
  // Every shipped client reaches ONE resident host, including desktop. This
  // keeps supplemental duration metadata consistent across devices. Direct
  // execution is an explicit local workbench mode, never a silent cloud fallback.
  if (!process.env.VERCEL && (process.env.PLANNING_PROVIDER_MODE === 'local' || residentDesktop) && existsSync(script)) {
    result = await new Promise((resolve, reject) => {
      const child = execFile(process.env.PLANNING_PYTHON ?? 'python3', [script, 'planning'],
        { timeout: 90_000, maxBuffer: 8_000_000 }, (error, stdout) => {
          if (error) return reject(new Error('La pluma de planificación no respondió. El borrador se conserva.'))
          try { resolve(JSON.parse(stdout)) } catch { reject(new Error('Respuesta de planificación inválida.')) }
        })
      child.stdin?.end(JSON.stringify(payload))
    })
  } else {
    if (!CLAUDECLAW_TOKEN) throw new Error('La conexión con la pluma no está configurada.')
    const res = await fetch(`${await getSchedulerUrl()}/planning`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLAUDECLAW_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000), cache: 'no-store',
    })
    result = await res.json().catch(() => ({ error: 'La conexión con la pluma no está disponible.' }))
    if (!res.ok) throw new ChatAccessError(String(result.error ?? 'No se pudo consultar la planificación.'), res.status)
  }
  if (typeof result.error === 'string') throw new ChatAccessError(result.error, typeof result.status === 'number' ? result.status : 503)
  return result
}
