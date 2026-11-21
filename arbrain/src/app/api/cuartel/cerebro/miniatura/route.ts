import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { raiz } from '@/lib/cuartel/cerebro-servidor'

// La miniatura real de un título de una idea (19 nov 2026): la genera `cerebro/miniaturas.py` con Sunburst y la cara de
// Daniel, y vive junto al banco (`store/cuartel/cerebro/miniaturas/<idea>-<n>.jpg`, o el PNG si no hubo copia ligera).
// Solo lectura; el id se valida para que nadie lea fuera de esa carpeta.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^idea-[A-Za-z0-9_-]{1,80}$/

export async function GET(request: Request) {
  try {
    await planningOwner()
    const u = new URL(request.url)
    const id = u.searchParams.get('id') ?? '', n = Number(u.searchParams.get('n'))
    // la misma raíz de datos que usa el cerebro (comun.raiz: CUARTEL_RAIZ manda sobre la raíz del repo)
    const R = process.env.CUARTEL_RAIZ || raiz()
    if (!R || !ID.test(id) || !Number.isInteger(n) || n < 0 || n > 20) return new Response('No existe', { status: 404 })
    const dir = path.join(R, 'arbrain', 'server', 'store', 'cuartel', 'cerebro', 'miniaturas')
    for (const [ext, tipo] of [['jpg', 'image/jpeg'], ['png', 'image/png']] as const) {
      try {
        const cuerpo = await readFile(path.join(dir, `${id}-${n}.${ext}`))
        // se genera una vez y no cambia: el navegador la guarda
        return new Response(new Uint8Array(cuerpo), { headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=86400' } })
      } catch { /* la siguiente extensión */ }
    }
    return new Response('No existe', { status: 404 })
  } catch (error) { return planningError(error) }
}
