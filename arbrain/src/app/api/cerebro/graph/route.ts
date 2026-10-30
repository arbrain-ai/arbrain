// Segundo Cerebro — grafo completo del conocimiento curado.
// La memoria/knowledge se lee del FILESYSTEM server-side (gotcha RLS/desktop:
// data del dueño jamás via supabase.from() del browser). Read-only estricto.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'
import { buildGraph } from '@/features/cerebro/server/graph'
import type { CerebroCapa } from '@/features/cerebro/types'

const CAPAS: CerebroCapa[] = ['memoria', 'skills', 'documentos', 'knowledge']

export const dynamic = 'force-dynamic'

async function authorized(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  return hasRole(user.id, 'owner', 'admin')
}

export async function GET(request: Request) {
  if (!(await authorized())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const params = new URL(request.url).searchParams
  const force = params.get('refresh') === '1'
  // ?capas=memoria,skills,documentos,knowledge (5 oct 2026). Sin parámetro: las tres de Taller › Archivos.
  const pedidas = (params.get('capas') ?? '').split(',').filter((c): c is CerebroCapa => (CAPAS as string[]).includes(c))
  const graph = await buildGraph(force, pedidas.length ? pedidas : undefined)
  // Ligero: el extracto no viaja (el panel del nodo lee el archivo completo al abrirlo). ~40 % menos bytes.
  return NextResponse.json({ ...graph, nodes: graph.nodes.map(({ excerpt: _e, ...n }) => ({ ...n, excerpt: '' })) })
}
