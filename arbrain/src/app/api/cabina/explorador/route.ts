import { planningOwner, planningError } from '@/lib/planning/server'
import { listaDe, raizExplorador } from '@/lib/cabina/explorador-server'
import { absoluta, buscar, esCarpeta, hijosDe, relativaSegura } from '@/features/cabina/explorador/arbol'

// Explorador de archivos del panel (8 oct 2026). Solo lee: GET ?dir=<relativa> da lo que hay en esa carpeta; GET ?buscar=<texto>
// busca por nombre en todo el árbol. Todo relativo a la raíz (sin «..», sin absolutas) y sin lo escondido (node_modules, .git,
// .next, credenciales). Abrir un archivo va por /api/cabina/documento, que vuelve a validar la ruta con sus propias reglas.

export const runtime = 'nodejs'
const NO_CACHE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    await planningOwner()
    const q = new URL(request.url).searchParams
    const raiz = await raizExplorador()
    const { lista, deGit } = await listaDe(raiz.ruta)
    const cabeza = { raiz: { nombre: raiz.nombre, ruta: raiz.ruta }, total: lista.length, deGit, ...(raiz.aviso ? { aviso: raiz.aviso } : {}) }

    const consulta = q.get('buscar')
    if (consulta != null) {
      const texto = consulta.slice(0, 200)
      return Response.json({ ...cabeza, consulta: texto, ...buscar(lista, texto) }, { headers: NO_CACHE })
    }

    const pedida = relativaSegura(q.get('dir'))
    if ('error' in pedida) return Response.json({ error: pedida.error }, { status: 403, headers: NO_CACHE })
    if (!esCarpeta(lista, pedida.rel)) return Response.json({ error: 'Esa carpeta no existe en el explorador.' }, { status: 404, headers: NO_CACHE })
    return Response.json({ ...cabeza, dir: pedida.rel, abs: absoluta(raiz.ruta, pedida.rel), entradas: hijosDe(lista, pedida.rel) }, { headers: NO_CACHE })
  } catch (error) { return planningError(error) }
}
