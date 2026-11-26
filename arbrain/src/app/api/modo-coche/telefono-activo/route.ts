// La voz al celular (modo coche, complemento de SFlow 2.3): el celular avisa que lo estás usando (con cada toque, a lo
// sumo cada 15 s) y SFlow (`claude_hooks/celular.py`) lo lee para decidir si la voz de tu agente suena en el celular o
// en la Mac. Solo guarda la hora, en la carpeta de configuración de tu Arbrain (la misma que SFlow encuentra en el
// entorno del agente, ARBRAIN_CONFIG_DIR).
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'
import { dirConfigArbrain } from '@/lib/rutas-instalacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function escribir(t: number): Promise<void> {
  const dir = dirConfigArbrain()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(join(dir, 'telefono-activo.json'), JSON.stringify({ t }) + '\n', { mode: 0o600 })
}

export async function POST() {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  try {
    await escribir(Date.now())
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/** El celular pasa a segundo plano (o apagas la voz al celular): la Mac vuelve a hablar. */
export async function DELETE() {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  try { await escribir(0) } catch { /* nada que apagar */ }
  return NextResponse.json({ ok: true })
}
