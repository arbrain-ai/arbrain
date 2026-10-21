// Segundo Cerebro — síntesis: slice de nodos (o pregunta) → artefacto accionable.
// Primario: claudeclaw POST /synthesize (SSE, one-shot sin sesión persistida) —
// funciona en web (túnel) y desktop (localhost:3099). Fallback: spawn del CLI
// `claude -p` en el Mac (dev/desktop) si claudeclaw no responde o no tiene el
// endpoint todavía. Sin APIs de pago nuevas: es la misma infra del chat.
import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import { createClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth-utils'
import {
  autoSelectNodes,
  readNodeContents,
} from '@/features/cerebro/server/graph'
import { buildSynthesisPrompt } from '@/features/cerebro/server/synthesis'
import type { SynthesisMode } from '@/features/cerebro/types'
import { instalacion } from '@/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CLAUDECLAW_URL = process.env.CLAUDECLAW_URL ?? 'http://localhost:3099'
const CLAUDECLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''
const ROOT = process.env.BUSINESS_OS_ROOT || instalacion().raizRepoRespaldo

const VALID_MODES: SynthesisMode[] = ['brief', 'simple', 'journey', 'contenido']

const enc = new TextEncoder()
const sse = (data: unknown) => enc.encode(`data: ${JSON.stringify(data)}\n\n`)

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await hasRole(user.id, 'owner', 'admin'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { question?: string; nodeIds?: string[]; mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const mode = (VALID_MODES as string[]).includes(body.mode ?? '')
    ? (body.mode as SynthesisMode)
    : 'brief'
  const question = typeof body.question === 'string' ? body.question.slice(0, 2000) : ''
  let nodeIds = Array.isArray(body.nodeIds)
    ? body.nodeIds.filter((n): n is string => typeof n === 'string').slice(0, 15)
    : []

  if (nodeIds.length === 0) {
    if (!question.trim()) {
      return NextResponse.json(
        { error: 'no_slice', message: 'Selecciona nodos o escribe una pregunta.' },
        { status: 400 },
      )
    }
    nodeIds = await autoSelectNodes(question)
    if (nodeIds.length === 0) {
      return NextResponse.json(
        { error: 'no_match', message: 'Ningún nodo del cerebro matchea la pregunta.' },
        { status: 400 },
      )
    }
  }

  const docs = await readNodeContents(nodeIds)
  if (docs.length === 0) {
    return NextResponse.json({ error: 'empty_slice' }, { status: 400 })
  }
  const prompt = buildSynthesisPrompt(mode, question, docs)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        try {
          controller.enqueue(enc.encode('data: [DONE]\n\n'))
          controller.close()
        } catch {
          /* ya cerrado */
        }
      }
      controller.enqueue(
        sse({ type: 'meta', nodeIds: docs.map((d) => d.id), mode }),
      )

      // ── Primario: claudeclaw /synthesize ────────────────────────────────
      let upstreamReached = false
      try {
        const upstream = await fetch(`${CLAUDECLAW_URL}/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CLAUDECLAW_TOKEN}`,
          },
          body: JSON.stringify({ prompt }),
          signal: request.signal,
        })
        upstreamReached = true
        if (upstream.ok && upstream.body) {
          const reader = upstream.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value) // passthrough: mismo formato SSE
          }
          try {
            controller.close()
          } catch {
            /* */
          }
          return
        }
        // upstream respondió pero no-ok (404 daemon viejo, 401 token, 5xx).
        // Solo el 404 justifica el fallback CLI; el resto es error real.
        if (upstream.status !== 404) {
          controller.enqueue(
            sse({ type: 'error', message: `Síntesis no disponible (claudeclaw HTTP ${upstream.status}).` }),
          )
          close()
          return
        }
      } catch {
        // claudeclaw inalcanzable (conexión) → intentar fallback CLI
      }

      // Si el cliente ya canceló, NO arrancar un proceso nuevo no-abortable.
      if (request.signal.aborted) {
        close()
        return
      }
      // Si el upstream SÍ respondió (y no fue 404 manejado arriba) no caemos al
      // CLI; solo cuando claudeclaw fue inalcanzable o dio 404.
      void upstreamReached

      // ── Fallback: claude CLI headless en el Mac ─────────────────────────
      const bin = resolveClaudeBin()
      if (!bin) {
        controller.enqueue(
          sse({
            type: 'error',
            message:
              'Síntesis no disponible: claudeclaw no responde y no hay CLI claude en este host.',
          }),
        )
        close()
        return
      }
      controller.enqueue(sse({ type: 'status', status: 'Generando con claude CLI…' }))
      try {
        const text = await runClaudeCli(bin, prompt, request.signal)
        if (text.trim()) {
          controller.enqueue(sse({ type: 'text_delta', text }))
          controller.enqueue(sse({ type: 'result', text }))
        } else {
          controller.enqueue(sse({ type: 'error', message: 'El CLI no devolvió texto.' }))
        }
      } catch (err) {
        controller.enqueue(sse({ type: 'error', message: String(err) }))
      }
      close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function resolveClaudeBin(): string | null {
  const candidates = [
    process.env.CLAUDE_BIN,
    `${os.homedir()}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

function runClaudeCli(bin: string, prompt: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    // Si el signal ya está abortado, addEventListener('abort') NO se dispara
    // retroactivamente → nunca mataríamos al hijo. Cortamos antes de spawnear.
    if (signal.aborted) {
      reject(new Error('Cancelado'))
      return
    }
    // -p lee el prompt de stdin; cwd = repo para que cargue el contexto de Levy
    const child = spawn(bin, ['-p', '--output-format', 'text'], {
      cwd: existsSync(ROOT) ? ROOT : process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Timeout de síntesis (240s)'))
    }, 240_000)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        child.kill('SIGKILL')
        reject(new Error('Cancelado'))
      },
      { once: true },
    )
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve(out)
      else reject(new Error(`claude CLI exit ${code}: ${err.slice(0, 300)}`))
    })
    child.on('error', (e) => {
      clearTimeout(timeout)
      reject(e)
    })
    child.stdin.write(prompt)
    child.stdin.end()
  })
}
