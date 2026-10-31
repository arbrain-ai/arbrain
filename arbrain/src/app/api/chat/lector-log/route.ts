import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'
import { dirLogs } from '@/features/chat/lib/rueda-log'
import { lineaRegistroLector } from '@/features/chat/lib/lector-registro'

// Bitácora ligera del lector (31 oct 2026, features/chat/lib/lector-registro.ts): primer audio, fallas, reintentos y
// cambios de motor van a `lector.jsonl` junto a los demás logs del cliente. Telemetría para Levy, nunca la campana.
const ARCHIVO_LOG_LECTOR = 'lector.jsonl'
const TOPE_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    await requireChatPrincipal()
    const cuerpo = (await request.json().catch(() => ({}))) as { eventos?: unknown; red?: unknown }
    const eventos = Array.isArray(cuerpo.eventos) ? cuerpo.eventos.slice(0, 20) : []
    const equipo = request.headers.get('user-agent') ?? ''
    const ahora = new Date()
    const lineas = eventos.map((e) => lineaRegistroLector(e, equipo, ahora, cuerpo.red)).filter(Boolean).join('')
    if (lineas) {
      try {
        const dir = dirLogs()
        await mkdir(dir, { recursive: true })
        const archivo = path.join(dir, ARCHIVO_LOG_LECTOR)
        const tam = await stat(archivo).then((s) => s.size).catch(() => 0)
        if (tam > TOPE_BYTES) await rename(archivo, `${archivo}.1`).catch(() => {})
        await appendFile(archivo, lineas, { mode: 0o600 })
      } catch { /* telemetría: nunca falla la petición */ }
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return chatAccessResponse(error)
  }
}
