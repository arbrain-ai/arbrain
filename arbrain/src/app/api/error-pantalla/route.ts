import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { dirLogs } from '@/features/chat/lib/rueda-log'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { checkMutationOrigin } from '@/lib/planning/server'

// «Esta pantalla tuvo un problema» con su stack (27 oct 2026). Antes el error solo iba a la consola del webview, que nadie
// ve: dos caídas del mismo día (React #130) se diagnosticaron a ciegas. Ahora cada pantalla de error deja una línea en
// errores-pantalla.jsonl (rueda-log.ts › dirLogs: ~/Library/Logs/Arbrain del autor o la carpeta de datos del alumno) con el mensaje, el stack minificado, la ruta y el build.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 30 oct 2026: en la edición cliente, en SU carpeta de datos (también Windows y Linux), junto a hilo-rueda.jsonl.
const corta = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)

export async function POST(request: Request) {
  try {
    checkMutationOrigin(request)
    await requireChatPrincipal()
    const r = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const linea = {
      en: new Date().toISOString(),
      donde: corta(r.donde, 20),
      ruta: corta(r.ruta, 300),
      mensaje: corta(r.mensaje, 1_000),
      stack: corta(r.stack, 6_000),
      componentes: corta(r.componentes, 8_000),
      digest: corta(r.digest, 100),
      build: corta(r.build, 40),
      buildServidor: process.env.NEXT_PUBLIC_ARBRAIN_BUILD ?? null,
      ua: (request.headers.get('user-agent') ?? '').slice(0, 200),
    }
    const dir = dirLogs()
    await mkdir(dir, { recursive: true })
    await appendFile(join(dir, 'errores-pantalla.jsonl'), JSON.stringify(linea) + '\n')
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return chatAccessResponse(error)
  }
}
