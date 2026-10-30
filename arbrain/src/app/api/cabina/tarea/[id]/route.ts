import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'

// Detalle de una tarea de Todoist para el panel (panel-claridad Fase 2, 1 oct 2026).
// SOLO LECTURA por la API v1: descripción, proyecto, etiquetas, subtareas y comentarios.
// Las escrituras (completar, reprogramar, prioridad) siguen por /api/planning, la pluma
// de siempre. El token es el mismo que usa esa pluma (`arbrain/server/.env`).

export const runtime = 'nodejs'
const API = 'https://api.todoist.com/api/v1/'

function token(): string | null {
  if (process.env.TODOIST_API_TOKEN) return process.env.TODOIST_API_TOKEN
  try {
    const root = process.env.BUSINESS_OS_ROOT ?? join(homedir(), 'Developer/business-os')
    const linea = readFileSync(join(root, 'arbrain/server/.env'), 'utf8').split('\n').find(l => l.startsWith('TODOIST_API_TOKEN='))
    return linea?.slice('TODOIST_API_TOKEN='.length).trim().replace(/^["']|["']$/g, '') || null
  } catch { return null }
}

type Json = Record<string, unknown>
async function leer(t: string, ruta: string): Promise<Json> {
  const r = await fetch(API + ruta, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' })
  if (!r.ok) throw Object.assign(new Error(r.status === 404 ? 'Esa tarea ya no existe en Todoist.' : `Todoist respondió ${r.status}.`), { estado: r.status === 404 ? 404 : 502 })
  return r.json() as Promise<Json>
}
const lista = (j: Json) => (Array.isArray(j.results) ? j.results : Array.isArray(j) ? j : []) as Json[]

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await planningOwner()
    const id = (await params).id
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ error: 'Tarea inválida.' }, { status: 400 })
    const t = token()
    if (!t) return Response.json({ error: 'Todoist no está configurado en este servidor.' }, { status: 503 })
    const q = encodeURIComponent(id)
    const tarea = await leer(t, `tasks/${q}`)
    const [hijas, notas, proyecto] = await Promise.all([
      leer(t, `tasks?parent_id=${q}&limit=50`).then(lista).catch(() => []),
      leer(t, `comments?task_id=${q}&limit=50`).then(lista).catch(() => []),
      tarea.project_id ? leer(t, `projects/${encodeURIComponent(String(tarea.project_id))}`).catch(() => null) : Promise.resolve(null),
    ])
    const due = (tarea.due ?? null) as Json | null
    return Response.json({
      id, titulo: tarea.content, descripcion: tarea.description ?? '', prioridad: 5 - Number(tarea.priority ?? 1),
      fecha: due ? (due.datetime ?? due.date ?? null) : null, recurrente: !!due?.is_recurring, repite: due?.is_recurring ? due.string ?? null : null,
      proyecto: proyecto ? String(proyecto.name ?? '') : null, etiquetas: Array.isArray(tarea.labels) ? tarea.labels : [],
      hecha: !!(tarea.checked ?? tarea.is_completed),
      subtareas: hijas.map(h => ({ id: String(h.id), titulo: String(h.content ?? ''), hecha: !!(h.checked ?? h.is_completed) })),
      comentarios: notas.filter(c => !c.is_deleted).map(c => ({ id: String(c.id), texto: String(c.content ?? ''), en: String(c.posted_at ?? '') })),
      url: `https://app.todoist.com/app/task/${q}`,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const estado = (error as { estado?: number }).estado
    if (estado) return Response.json({ error: (error as Error).message }, { status: estado })
    return planningError(error)
  }
}
