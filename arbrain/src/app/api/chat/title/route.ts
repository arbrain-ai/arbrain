import { NextResponse } from 'next/server'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'

export async function POST(req: Request) {
  // Misma puerta que el resto del chat: base o Auth caídas = 503 con causa, nunca 401/403 (12 oct 2026).
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }

  const { message } = await req.json() as { message?: string }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ title: 'Nueva conversación' })
  }

  // Compatibility for older clients: titles never trigger an extra billed
  // provider call. Native session summaries can enrich this local title later.
  const title = message.trim().slice(0, 55) + (message.trim().length > 55 ? '…' : '')
  return NextResponse.json({ title, source: 'local' })
}
