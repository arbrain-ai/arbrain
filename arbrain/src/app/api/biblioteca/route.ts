import { NextResponse } from 'next/server'
import { listLibrary } from '@/features/library/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lista la biblioteca personal (personal/libros) por carpetas. En Vercel devuelve
// { available:false } porque esa carpeta no existe -> el PWA no muestra la sección.
export async function GET() {
  try {
    const data = await listLibrary()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ available: false, folders: [] })
  }
}
