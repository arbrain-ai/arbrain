/**
 * POST /api/draw3 — Create a new canvas v3 page
 *
 * Auth: Bearer token (OPENCLAW_GATEWAY_TOKEN)
 * Body: { name?: string, owner?: string }
 * Returns: { ok, page_id, url, agent_version }
 */
import { NextResponse } from 'next/server'
import { authenticateDraw3 } from '@/lib/draw3-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { readCanvasPagesFromCache, writeCanvasPagesToCache } from '@/lib/local-first/server-canvas-cache'
import { siteUrl } from '@/lib/site-url'
import { instalacion } from '@/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OWNER_USER_ID = instalacion().idPerfilDueno  // perfil de la persona dueña (config/instalacion.ts)


export async function GET(request: Request) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const source = new URL(request.url).searchParams.get('source')
    if (source === 'local') {
      const cached = await readCanvasPagesFromCache()
      return NextResponse.json({ ok: true, pages: cached, source: 'local-cache' })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('draw')
      .select('page_id, user_id, name, page_elements, agent_version, is_deleted, folder_id, thumbnail_url, created_at, updated_at')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[api/draw3 GET] list failed', error)
      const cached = await readCanvasPagesFromCache()
      if (cached.length > 0) {
        return NextResponse.json({ ok: true, pages: cached, source: 'local-cache' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await writeCanvasPagesToCache(data ?? []).catch((cacheError) => {
      console.error('[api/draw3 GET] cache write failed', cacheError)
    })

    return NextResponse.json({ ok: true, pages: data ?? [], source: 'cloud' })
  } catch (err) {
    console.error('[api/draw3 GET]', err)
    const cached = await readCanvasPagesFromCache()
    if (cached.length > 0) {
      return NextResponse.json({ ok: true, pages: cached, source: 'local-cache' })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    if (!(await authenticateDraw3(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, owner, theme } = body as {
      name?: string
      owner?: string
      theme?: 'dark' | 'light' | 'mono' | 'system'
      folderId?: string | null
    }

    const supabase = createServiceClient()

    // Try RPC first (codex's helper), fallback to direct insert
    const userId = owner ?? OWNER_USER_ID
    const pageElements = {
      schemaVersion: 3,
      elements: [],
      files: {},
      theme: theme ?? 'system',
    }

    let pageId: string | null = null
    const rpc = await supabase.rpc('create_draw_from_agent', {
      p_user_id: userId,
      p_name: name || 'Canvas v3',
      p_elements: pageElements,
    })
    if (rpc.error || !rpc.data) {
      // Fallback: direct insert
      const ins = await supabase
        .from('draw')
        .insert({
          user_id: userId,
          name: name || 'Canvas v3',
          page_elements: pageElements,
          agent_version: 0,
        })
        .select('page_id')
        .single()
      if (ins.error || !ins.data) {
        console.error('[api/draw3] insert failed', ins.error)
        return NextResponse.json({ error: ins.error?.message ?? 'create failed' }, { status: 500 })
      }
      pageId = ins.data.page_id as string
    } else {
      pageId = rpc.data as string
    }

    if (body.folderId != null) {
      const { error: folderError } = await supabase
        .from('draw')
        .update({ folder_id: body.folderId, updated_at: new Date().toISOString() })
        .eq('page_id', pageId)
      if (folderError) {
        console.error('[api/draw3] folder assign failed', folderError)
        return NextResponse.json({ error: folderError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      page_id: pageId,
      url: `${siteUrl()}/draw3/${pageId}`,
      agent_version: 0,
      schema_version: 3,
      folder_id: body.folderId ?? null,
    })
  } catch (err) {
    console.error('[api/draw3 POST]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
