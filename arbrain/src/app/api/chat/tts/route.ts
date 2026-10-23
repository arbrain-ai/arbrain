import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'
import { getClaudeclawUrl, CLAUDECLAW_TOKEN } from '@/lib/claudeclaw'
import { markdownHablable } from '@/features/chat/lib/lector-filtro'

// TTS = Kokoro local (open source) a traves de claudeclaw, reusando el mismo
// tunel/CLAUDECLAW_URL que el chat. Funciona en desktop (localhost) y web (tunel).

// 175/306: la voz `levy` de voz-agentes habla a 306 ppm (1.75x); el lector la pide a 1x.
const LECTOR_SPEED = 175 / 306

// Fuentes, tablas y URLs sueltas no se oyen: la misma regla que el lector de la barra.
function cleanTextForTts(text: string) {
  return markdownHablable(text)
    .replace(/```[\s\S]*?```/g, 'código')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000)
}

export async function POST(req: NextRequest) {
  // En paralelo con la auth: la URL del daemon no depende de ella.
  const claudeclawUrl = getClaudeclawUrl()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await hasRole(user.id, 'owner', 'admin'))) {
    return NextResponse.json({ error: 'Forbidden: Chat access requires owner or admin role' }, { status: 403 })
  }

  const { text, lector } = await req.json() as { text?: string; lector?: boolean }
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Lector del chat (22 oct 2026): el texto ya viene HABLADO (buildSpoken en el cliente) y el resaltado se calcula
  // sobre él, así que no se toca más que el espacio. Va a 1x: la voz `levy` hornea 1.75x (rate 306) y `speed` la
  // devuelve a 175 ppm; el navegador acelera con playbackRate.
  const clean = lector ? text.replace(/\s+/g, ' ').trim().slice(0, 5000) : cleanTextForTts(text)
  if (!clean) {
    return NextResponse.json({ error: 'text is empty after cleanup' }, { status: 400 })
  }

  const res = await fetch(`${await claudeclawUrl}/tts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLAUDECLAW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lector ? { text: clean, voice: 'levy', speed: LECTOR_SPEED } : { text: clean }),
  })

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ error: `TTS error ${res.status}: ${body}` }, { status: res.status })
  }

  const audio = await res.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': lector ? 'private, max-age=86400' : 'no-store',
    },
  })
}
