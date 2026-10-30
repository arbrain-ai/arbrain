import { NextResponse } from 'next/server'
import { listLibrary } from '@/features/library/server'
import { requireChatPrincipal, chatAccessResponse } from '@/lib/chat-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lista la biblioteca personal (personal/libros) por carpetas. En Vercel devuelve
// { available:false } porque esa carpeta no existe -> el PWA no muestra la sección.
// Seguridad (21 oct 2026, carril 5-STUDIO): el proxy deja pasar /api sin sesión y esto se leía desde internet.
export async function GET() {
  try { await requireChatPrincipal() } catch (error) { return chatAccessResponse(error) }
  try {
    const data = await listLibrary()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ available: false, folders: [] })
  }
}
