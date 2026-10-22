import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { decidirRutina } from '@/features/avisos/policy'
import { ownerIds as buzonDelDueno, registrar } from '@/features/avisos/server'
import { nombreRutina } from '@/features/rutinas/catalogo'
import { remark } from 'remark'
import strip from 'strip-markdown'
import { createServiceClient } from '@/lib/supabase/service'
import { openClawEventSchema, CODING_TOOLS } from '@/types/openclaw'
import type { OpenClawEvent } from '@/types/openclaw'
import { SEGUNDA_EMAIL, SEGUNDA_REPORTES_SESION, JOB_REPORTE_SEGUNDA, REPORTES_VIVOS, elegirFavorita, fechaDelReporte, invocacionDiario, invocacionVista, vistaDelReporte } from '@/shared/constants/reporte-vivo'
import { declaracionDecision, destinoDeRutina, documentoDelResultado, fuenteInformacion, hiloDeRutina, RUTINAS_HILOS_VERSION, type HiloRutina } from '@/shared/constants/rutinas-hilos'
import { instalacion } from '@/config'
import { DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '@/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizePrompt(prompt: string | undefined): string {
  if (!prompt) return 'Untitled Task'
  const cleaned = prompt.trim()
  const firstLine = cleaned.split('\n')[0].trim()
  if (firstLine.length <= 80) return firstLine
  const truncated = firstLine.slice(0, 77)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > 50) return truncated.slice(0, lastSpace) + '...'
  return truncated + '...'
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

/**
 * Detect whether an eventType + message combo indicates a coding tool.
 * e.g. eventType = "tool:start", message = "Using tool: edit ..."
 */
function isCodingToolEvent(eventType: string | undefined, message: string | undefined): boolean {
  if (eventType !== 'tool:start' || !message) return false
  const toolMatch = message.match(/Using tool:\s*(\S+)/)
  if (!toolMatch) return false
  return (CODING_TOOLS as readonly string[]).includes(toolMatch[1])
}

// ---------------------------------------------------------------------------
// Agent resolution
// ---------------------------------------------------------------------------

interface AgentRow {
  id: string
  name: string
  session_key: string | null
}

class AgentLookupError extends Error {}
class EntregaError extends Error {}

async function resolveAgent(
  supabase: ReturnType<typeof createServiceClient>,
  agentId: string | undefined,
  sessionKey: string | undefined,
): Promise<AgentRow | null> {
  // 1. Try matching agentId against session_key column
  if (agentId) {
    const { data: bySessionKey, error } = await supabase
      .from('agents')
      .select('id, name, session_key')
      .eq('session_key', agentId)
      .limit(1)
      .single()

    // Base inalcanzable ≠ agente inexistente. El 29–30 sep, con la base caída,
    // esto respondía «No agent found» (400) y el reporte diario se perdía sin
    // reintento. Un error de conexión es 5xx: el emisor reintenta.
    if (error && error.code !== 'PGRST116') throw new AgentLookupError(error.message)
    if (bySessionKey) return bySessionKey
  }

  // 2. Try matching agentId against name (case-insensitive)
  if (agentId) {
    const { data: byName } = await supabase
      .from('agents')
      .select('id, name, session_key')
      .ilike('name', agentId)
      .limit(1)
      .single()

    if (byName) return byName
  }

  // 3. Try matching sessionKey against session_key column
  if (sessionKey) {
    const { data: byKey } = await supabase
      .from('agents')
      .select('id, name, session_key')
      .eq('session_key', sessionKey)
      .limit(1)
      .single()

    if (byKey) return byKey
  }

  // 4. Fallback: use the first agent in the table
  const { data: fallback } = await supabase
    .from('agents')
    .select('id, name, session_key')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return fallback ?? null
}

// ---------------------------------------------------------------------------
// Task resolution
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string
  title: string
  status: string
  started_at: string | null
  used_coding_tools: boolean | null
  openclaw_run_id: string | null
  created_at: string | null
}

async function findTaskByRunId(
  supabase: ReturnType<typeof createServiceClient>,
  runId: string,
): Promise<TaskRow | null> {
  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, started_at, used_coding_tools, openclaw_run_id, created_at')
    .eq('openclaw_run_id', runId)
    .limit(1)
    .single()

  return data ?? null
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleStart(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const title = summarizePrompt(event.prompt)
  const description = event.prompt || `OpenClaw agent task\nRun ID: ${event.runId}`
  const now = new Date().toISOString()

  let task = await findTaskByRunId(supabase, event.runId)

  if (!task) {
    // Create new task
    const { data: newTask, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        status: 'in_progress',
        tags: ['openclaw'],
        session_key: event.sessionKey ?? null,
        openclaw_run_id: event.runId,
        started_at: now,
      })
      .select('id, title, status, started_at, used_coding_tools, openclaw_run_id, created_at')
      .single()

    if (taskError || !newTask) {
      console.error('[openclaw/event] Failed to create task:', taskError)
      return
    }
    task = newTask
  } else {
    // Update existing task: reset to in_progress
    await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: now,
        used_coding_tools: false,
      })
      .eq('id', task.id)

    // Update title if it was a placeholder
    if (event.prompt && task.title.startsWith('Agent task')) {
      await supabase
        .from('tasks')
        .update({ title, description: event.prompt })
        .eq('id', task.id)
    }

    task = { ...task, started_at: now }
  }

  // Upsert task_assignees (avoid duplicates)
  const { data: existingAssignee } = await supabase
    .from('task_assignees')
    .select('id')
    .eq('task_id', task.id)
    .eq('agent_id', agent.id)
    .limit(1)
    .single()

  if (!existingAssignee) {
    await supabase
      .from('task_assignees')
      .insert({ task_id: task.id, agent_id: agent.id })
  }

  // Update agent status
  await supabase
    .from('agents')
    .update({ status: 'active', current_task_id: task.id })
    .eq('id', agent.id)

  // Create activity
  await supabase.from('activities').insert({
    type: 'status_update',
    agent_id: agent.id,
    message: `started "${title}"`,
    target_id: task.id,
  })

  // Create message with prompt
  const sourcePrefix = event.source ? `**${event.source}:** ` : ''
  await supabase.from('messages').insert({
    task_id: task.id,
    from_agent_id: agent.id,
    content: `Started\n\n${sourcePrefix}${event.prompt || 'N/A'}`,
  })
}

async function handleProgress(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const task = await findTaskByRunId(supabase, event.runId)
  if (!task) {
    console.warn('[openclaw/event] progress: no task found for runId', event.runId)
    return
  }

  // Check if this is a coding tool event
  if (isCodingToolEvent(event.eventType, event.message) && !task.used_coding_tools) {
    await supabase
      .from('tasks')
      .update({ used_coding_tools: true })
      .eq('id', task.id)
  }

  // Insert progress message
  await supabase.from('messages').insert({
    task_id: task.id,
    from_agent_id: agent.id,
    content: event.message || 'Progress update',
  })

  // Insert activity
  await supabase.from('activities').insert({
    type: 'message',
    agent_id: agent.id,
    message: `progress update on "${task.title}"`,
    target_id: task.id,
  })
}

async function handleEnd(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const task = await findTaskByRunId(supabase, event.runId)
  if (!task) {
    console.warn('[openclaw/event] end: no task found for runId', event.runId)
    return
  }

  // Determine final status
  const needsFeedback = event.response ? event.response.includes('?') : false

  let isCodingTask = task.used_coding_tools ?? false
  if (!isCodingTask) {
    // Check if any code documents were created for this task
    const { data: codeDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('task_id', task.id)
      .eq('type', 'code')
      .limit(1)

    isCodingTask = (codeDocs?.length ?? 0) > 0
  }

  const endStatus = 'done'

  // Calculate duration
  const startTime = task.started_at || task.created_at || new Date().toISOString()
  const durationStr = formatDuration(startTime)

  // Update task status
  await supabase
    .from('tasks')
    .update({ status: endStatus })
    .eq('id', task.id)

  // Update agent: idle, clear current task
  await supabase
    .from('agents')
    .update({ status: 'idle', current_task_id: null })
    .eq('id', agent.id)

  // Create completion activity
  const statusLabel = needsFeedback ? 'needs input on' : 'completed'
  await supabase.from('activities').insert({
    type: 'status_update',
    agent_id: agent.id,
    message: `${statusLabel} "${task.title}" in ${durationStr}`,
    target_id: task.id,
  })

  // Create completion message
  const icon = needsFeedback ? 'Needs Input' : 'Completed'
  let completionMsg = `${icon} in ${durationStr}`
  if (event.response) {
    completionMsg += `\n\n${event.response}`
  }

  await supabase.from('messages').insert({
    task_id: task.id,
    from_agent_id: agent.id,
    content: completionMsg,
  })
}

async function handleError(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const task = await findTaskByRunId(supabase, event.runId)
  if (!task) {
    console.warn('[openclaw/event] error: no task found for runId', event.runId)
    return
  }

  // Calculate duration
  const startTime = task.started_at || task.created_at || new Date().toISOString()
  const durationStr = formatDuration(startTime)

  // Update task to review
  await supabase
    .from('tasks')
    .update({ status: 'todo' })
    .eq('id', task.id)

  // Update agent to blocked
  await supabase
    .from('agents')
    .update({ status: 'blocked' })
    .eq('id', agent.id)

  // Create error activity
  await supabase.from('activities').insert({
    type: 'status_update',
    agent_id: agent.id,
    message: `error on "${task.title}" after ${durationStr}`,
    target_id: task.id,
  })

  // Create error message
  await supabase.from('messages').insert({
    task_id: task.id,
    from_agent_id: agent.id,
    content: `Error after ${durationStr}\n\n${event.error || 'Unknown error'}`,
  })
}

async function handleDocument(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  if (!event.document) {
    console.warn('[openclaw/event] document: no document payload')
    return
  }

  const task = await findTaskByRunId(supabase, event.runId)

  // Create document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      title: event.document.title,
      content: event.document.content,
      type: event.document.type,
      path: event.document.path ?? null,
      task_id: task?.id ?? null,
      created_by_agent_id: agent.id,
    })
    .select('id')
    .single()

  if (docError || !doc) {
    console.error('[openclaw/event] Failed to create document:', docError)
    return
  }

  // Create activity
  let activityMsg = `created document "${event.document.title}"`
  if (task) {
    activityMsg += ` for "${task.title}"`
  }

  await supabase.from('activities').insert({
    type: 'document_created',
    agent_id: agent.id,
    message: activityMsg,
    target_id: task?.id ?? null,
  })

  // Create message referencing the document (if task exists)
  if (task) {
    const pathLine = event.document.path ? `\nPath: ${event.document.path}` : ''
    await supabase.from('messages').insert({
      task_id: task.id,
      from_agent_id: agent.id,
      content: `Created document: ${event.document.title}\n\nType: ${event.document.type}${pathLine}`,
    })

    // Link document to message via message_attachments
    const { data: msg } = await supabase
      .from('messages')
      .select('id')
      .eq('task_id', task.id)
      .eq('from_agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (msg) {
      await supabase.from('message_attachments').insert({
        message_id: msg.id,
        document_id: doc.id,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Conversation handler (legacy + mission-control)
// ---------------------------------------------------------------------------

async function handleConversationEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const now = new Date().toISOString()

  switch (event.action) {
    case 'start': {
      await supabase.from('conversations').upsert(
        {
          run_id: event.runId,
          agent_id: agent.id,
          prompt: event.prompt ?? '',
          source: event.source ?? 'mission-control',
          status: 'pending',
          started_at: now,
        },
        { onConflict: 'run_id' },
      )
      break
    }
    case 'end': {
      await supabase
        .from('conversations')
        .update({ response: event.response ?? null, status: 'done', ended_at: now })
        .eq('run_id', event.runId)
      break
    }
    case 'error': {
      await supabase
        .from('conversations')
        .update({ error: event.error ?? 'Unknown error', status: 'error', ended_at: now })
        .eq('run_id', event.runId)
      break
    }
    default:
      // progress / document events on convos are ignored
      break
  }
}

// ---------------------------------------------------------------------------
// Cron job handler
// ---------------------------------------------------------------------------

const CRON_JOB_LABELS: Record<string, string> = {
  'gmail-cleanup': 'Gmail Cleanup',
  'morning-briefing': 'Reporte diario',
  'business-council': 'Reporte semanal',
  'system-council': 'System Council',
  'monthly-review': 'Reporte mensual',
  'funnel-watchdog': 'Funnel Watchdog',
  'workspace-backup': 'Workspace Backup',
}


async function getOrCreateAutomatizacionesSession(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<string> {
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('title', 'Automatizaciones')
    .eq('is_favorite', true)
    .limit(1)
    .single()

  if (existing) return existing.id

  // Assign cron sessions to the owner
  const [ownerId] = await buzonDelDueno(supabase)
  const { data: created, error } = await supabase
    .from('chat_sessions')
    .insert({ title: 'Automatizaciones', is_favorite: true, profile_id: ownerId ?? null })
    .select('id')
    .single()

  if (error || !created) throw new Error('Failed to create Automatizaciones session')
  return created.id
}

/**
 * La conversación favorita de Daniel (la de la estrella; sin estrella, la primera de «Fijadas»), donde entran sus
 * reportes desde el 10 oct 2026 (v3). null = no tiene (o no se pudo leer): el reporte cae al hilo «Reportes» como antes.
 */
async function favoritaDelDueno(supabase: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const [ownerId] = await buzonDelDueno(supabase)
  if (!ownerId) return null
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, is_favorite, is_starred, pinned_position, archived_at, updated_at')
    .eq('profile_id', ownerId)
    .or('is_favorite.eq.true,is_starred.eq.true')
  if (error) { console.error('[openclaw/event] favorita del dueño:', error.message); return null }
  return elegirFavorita(data ?? [])?.id ?? null
}

/**
 * El hilo de la carpeta «Rutinas» donde cae un resultado. Id fijo: crearlo es idempotente (si dos crons
 * llegan a la vez, el segundo insert choca con la llave primaria y usa el que ya existe). No va fijado:
 * la carpeta de la barra lo muestra y Recientes lo omite por su título.
 */
async function asegurarHiloRutina(
  supabase: ReturnType<typeof createServiceClient>,
  hilo: HiloRutina,
): Promise<string> {
  // «Reportes» es el hilo «Automatizaciones» de siempre (historial intacto), resuelto por título + fijado.
  if (!hilo.sesionId) return getOrCreateAutomatizacionesSession(supabase)
  const { data: existente } = await supabase.from('chat_sessions').select('id, title').eq('id', hilo.sesionId).maybeSingle()
  if (existente) {
    // «Investigaciones» de la v1 pasa a «Información»: mismo hilo, nuevo nombre.
    if (existente.title !== hilo.titulo) await supabase.from('chat_sessions').update({ title: hilo.titulo }).eq('id', hilo.sesionId)
    return existente.id
  }
  const [ownerId] = await buzonDelDueno(supabase)
  const { error } = await supabase
    .from('chat_sessions')
    .insert({ id: hilo.sesionId, title: hilo.titulo, is_favorite: false, profile_id: ownerId ?? null })
  // 23505 = otro cron lo creó justo antes: el hilo ya está.
  if (error && error.code !== '23505') throw new Error(`Failed to create hilo de Rutinas ${hilo.id}: ${error.message}`)
  return hilo.sesionId
}

async function handleCronEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: OpenClawEvent,
  agent: AgentRow,
): Promise<void> {
  const now = new Date().toISOString()
  const hasError = !!event.error

  // Keep existing conversations upsert (for /cron page)
  const { error: upsertError } = await supabase.from('conversations').upsert(
    {
      run_id: event.runId,
      agent_id: agent.id,
      prompt: event.prompt ?? '',
      response: event.response ?? null,
      source: 'cron',
      status: hasError ? 'error' : 'done',
      error: event.error ?? null,
      // jobId + costo/tokens UNIDOS en la misma fila (sala Acciones del
      // Artificial Brain). null para runs previos a la instrumentación.
      usage: event.usage ?? null,
      started_at: now,
      ended_at: now,
    },
    { onConflict: 'run_id' },
  )
  // Sin la fila el reporte no quedó en ningún lado: 5xx y el emisor reintenta
  // (antes respondía 200 y el reporte moría en silencio).
  if (upsertError) throw new EntregaError(`conversations: ${upsertError.message}`)

  // Inject into chat_messages for the "Automatizaciones" session.
  // event.silent = job silencioso: el run ya quedo en conversations (historial
  // input/output del Cron Lens) pero NO toca el chat ni manda push.
  //
  // Notificar si hay output real O si el job fallo. ANTES los errores morian en
  // silencio: con output vacio la condicion era falsa, no se inyectaba nada ni
  // se mandaba push. Resultado: jobs que tronaban (ej. timeout de business-council
  // / monthly-review) "desaparecian" sin que Daniel se enterara. Un watchdog que
  // se rompe en silencio es peor que no tenerlo.
  const output = event.response?.trim() ?? ''
  const hasOutput = !!output && output !== '(no output)'
  // Un job con hilo en la carpeta «Rutinas» entrega su RESULTADO al hilo aunque el scheduler lo mande
  // silent (rutinas-hilos.ts); su fallo no va al hilo: es telemetría y sigue a la bitácora.
  const hilo = hiloDeRutina(event.prompt ?? 'cron')
  const aHilo = !!hilo && hasOutput && !hasError
  // El reporte de la socia (5 oct 2026) llega a SU hilo «Reportes» como vista viva; su push ya lo mandó el script.
  if (event.prompt === JOB_REPORTE_SEGUNDA) {
    if (hasOutput && !hasError) await entregarReporteSegunda(supabase, event, output)
    return
  }
  // v3 (10 oct 2026): «Información» deja de llegar a Daniel. Su resultado queda en la bitácora (fuente
  // `informacion:<job>`, no es un fallo) y lo que valga lo suben la línea «Máquina» del reporte diario y «Lo que vi
  // afuera / Máquina de la semana» del semanal. El texto completo sigue en `conversations` (Cron Lens).
  const destino = destinoDeRutina(event.prompt ?? 'cron')
  if (destino === 'bitacora' && aHilo) {
    await entregarInformacion(supabase, event.prompt ?? 'cron', output)
    return
  }
  // Todo lo que caía a «Reportes» llega a la conversación favorita de Daniel (v3; el de la mañana desde el 10 oct)
  // con su vista viva cuando la tiene y el texto debajo; sin favorita, al hilo «Reportes». Solo inserción: no dispara
  // turno del modelo.
  const aFavorita = aHilo && destino === 'favorita'
  const vivo = aFavorita && REPORTES_VIVOS[event.prompt ?? ''] === DUENO()
  const vista = aFavorita && !vivo ? vistaDelReporte(event.prompt ?? '', fechaDelReporte(event.originalAt ?? now)) : null
  if ((hasOutput || hasError) && (!event.silent || aHilo)) {
    const jobId = event.prompt ?? 'cron'
    const jobLabel = CRON_JOB_LABELS[jobId] ?? nombreRutina(jobId)
    const decl = aHilo ? declaracionDecision(output) : { texto: output, pide: false, motivo: null }
    const pideDecision = aHilo && (decl.pide || event.pideDecision === true)
    const documento = aHilo ? documentoDelResultado(decl.texto) : null
    const chatContent = hasOutput
      ? documento ? `${decl.texto}\n\n📄 Documento: \`${documento}\`` : decl.texto
      : `⚠️ **${jobLabel}** falló:\n\n${event.error ?? 'Error desconocido'}`
    // Session id de "Automatizaciones" — se usa para inyectar el mensaje Y para
    // que el push deep-linkee directo a esa conversacion (?session=). El id del
    // mensaje insertado viaja tambien en el push (&msg=) para que el chat
    // aterrice en el INICIO de ese mensaje, no en el fondo de la conversacion.
    let autoSessionId: string | null = null
    let cronMessageId: string | null = null
    // Idempotencia por runId: un reintento de la cola no duplica el mensaje,
    // el aviso ni el push.
    const { data: previo, error: previoError } = await supabase.from('chat_messages').select('id').eq('metadata->>runId', event.runId).limit(1)
    if (previoError) throw new EntregaError(`chat_messages: ${previoError.message}`)
    if (previo?.length) return
    const reentrega = reentregaDe(event.originalAt)
    let favorita: string | null = null
    try {
      // Mapeado y con resultado → su hilo de Rutinas. Mapeado que falló → ninguno (bitácora). Sin mapa → el
      // hilo «Automatizaciones» de siempre (historial «Reportes»).
      if (hilo && !aHilo) autoSessionId = null
      else {
        favorita = aFavorita ? await favoritaDelDueno(supabase) : null
        autoSessionId = favorita ?? (hilo ? await asegurarHiloRutina(supabase, hilo) : await getOrCreateAutomatizacionesSession(supabase))
      }
    } catch (err) {
      console.error('[openclaw/event] Failed to resolve cron thread:', err)
    }
    if (autoSessionId) try {
      const { data: inserted } = await supabase
        .from('chat_messages')
        .insert({
          session_id: autoSessionId,
          role: 'assistant',
          content: chatContent,
          metadata: {
            source: 'cron',
            jobId,
            jobLabel,
            isError: hasError,
            runId: event.runId,
            ...(hilo && !favorita ? { hilo: hilo.id, hiloVersion: RUTINAS_HILOS_VERSION } : {}),
            ...(documento ? { documento } : {}),
            ...(pideDecision ? { pide_decision: true, ...(decl.motivo ? { decision: decl.motivo } : {}) } : {}),
            ...(reentrega ? { originalAt: event.originalAt, reentrega } : {}),
            ...(vivo ? { reporteVivo: DUENO(), reporteConTexto: true, ...invocacionDiario(event.runId, DUENO(), fechaDelReporte(event.originalAt ?? now)) } : {}),
            ...(vista ? invocacionVista(event.runId, vista) : {}),
          },
        })
        .select('id')
        .single()
      cronMessageId = inserted?.id ?? null
      // `ends_question` (que el trigger deduce de un «?» final) se fija a lo que el cron DECLARÓ: es el morado de
      // la carpeta Rutinas. También en «Reportes» (Automatizaciones), que ahora es hilo de la carpeta: un «?» final sin declarar ya no lo pone morado.
      await supabase
        .from('chat_sessions')
        .update({ updated_at: now, ends_question: pideDecision })
        .eq('id', autoSessionId)
    } catch (err) {
      console.error('[openclaw/event] Failed to inject cron message into chat:', err)
      // Non-blocking — don't break the webhook
    }

    // Un resultado que solo se entrega al hilo (job silent) no suena ni toca la campana: queda en su hilo.
    if (!event.silent) await sendCronPush(supabase, jobId, chatContent, hasError, autoSessionId, cronMessageId, reentrega)
  }
}

/**
 * Un resultado de «Información» (v3) en la bitácora: Levy lo lee, Daniel no lo ve ni lo escucha. Sin idempotencia
 * por runId (la bitácora no lo guarda): un reintento de la cola solo repetiría una fila de registro.
 */
async function entregarInformacion(supabase: ReturnType<typeof createServiceClient>, jobId: string, output: string) {
  // La ruta del documento (si la hay) viaja en el texto: la lee Levy, no un enlace de la app.
  await registrar(supabase, { kind: 'sistema', entrega: 'bitacora', source: fuenteInformacion(jobId) },
    { title: nombreRutina(jobId), body: declaracionDecision(output).texto, url: null }, [])
}

/**
 * El reporte de la socia en SU hilo «Reportes» (id fijo, profile_id = la socia) como vista viva «diario».
 * Idempotente por runId. Sin push: el script ya lo mandó con su texto corto y abre este hilo.
 */
async function entregarReporteSegunda(supabase: ReturnType<typeof createServiceClient>, event: OpenClawEvent, output: string) {
  const { data: perfil } = await supabase.from('profiles').select('id').eq('email', SEGUNDA_EMAIL).maybeSingle()
  if (!perfil?.id) { console.error(`[openclaw/event] ${JOB_REPORTE_SEGUNDA}: ${NOMBRE_SEGUNDA()} no tiene perfil; queda en conversations`); return }
  const { data: previo, error: previoError } = await supabase.from('chat_messages').select('id').eq('metadata->>runId', event.runId).limit(1)
  if (previoError) throw new EntregaError(`chat_messages: ${previoError.message}`)
  if (previo?.length) return
  const now = new Date().toISOString()
  const { data: hilo } = await supabase.from('chat_sessions').select('id').eq('id', SEGUNDA_REPORTES_SESION).maybeSingle()
  if (!hilo) {
    const { error } = await supabase.from('chat_sessions').insert({ id: SEGUNDA_REPORTES_SESION, title: 'Reportes', is_favorite: true, profile_id: perfil.id })
    if (error && error.code !== '23505') throw new EntregaError(`chat_sessions (${NOMBRE_SEGUNDA()}): ${error.message}`)
  }
  const texto = output.split(/\n\[push\]/)[0].trim()
  const { error } = await supabase.from('chat_messages').insert({
    session_id: SEGUNDA_REPORTES_SESION, role: 'assistant', content: texto,
    metadata: { source: 'cron', jobId: JOB_REPORTE_SEGUNDA, jobLabel: 'Tu reporte', isError: false, runId: event.runId, reporteVivo: SEGUNDA(),
      ...invocacionDiario(event.runId, SEGUNDA(), fechaDelReporte(event.originalAt ?? now)) },
  })
  if (error) throw new EntregaError(`chat_messages (${NOMBRE_SEGUNDA()}): ${error.message}`)
  await supabase.from('chat_sessions').update({ updated_at: now }).eq('id', SEGUNDA_REPORTES_SESION)
}

/** Etiqueta de reentrega («29 sep») si el reporte llega más de 6 h tarde. */
function reentregaDe(originalAt: string | undefined): string | null {
  if (!originalAt) return null
  const t = Date.parse(originalAt)
  if (!Number.isFinite(t) || Date.now() - t < 6 * 3600_000) return null
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' })
}

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return
  webpush.setVapidDetails(
    `mailto:${(process.env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`,
    publicKey,
    privateKey,
  )
  vapidReady = true
}

/** Strip markdown to plain text using remark + strip-markdown (handles all GFM) */
async function stripMd(md: string): Promise<string> {
  const file = await remark().use(strip).process(md)
  return String(file).replace(/\n{3,}/g, '\n\n').trim()
}

// Qué rutina le habla al dueño lo decide la política de avisos (25 sep 2026):
// solo las visibles que terminan bien suenan; un fallo es telemetría y va a la
// bitácora (la vista Rutinas lo muestra como «Necesita atención»). Reemplaza la
// lista SILENT_CRON_JOBS, que dejaba sonar los fallos de cualquier rutina.

// Acuse de entrega de push (sensor 30 jul 2026): una fila por intento en
// push_log, incluidos los caminos MUDOS (sin VAPID, sin suscripciones). Del 27
// al 30 jul Daniel leyó el briefing del 27 como si fuera el actual porque los
// pushes nuevos no le llegaban y nada medía el envío — un console.error en
// Vercel no es un sensor. El morning briefing lee esta tabla cada mañana
// (watchdog_push.py, paso 0e) y reporta el acuse de su push de ayer.
// 'accepted' = Apple/el push service aceptó el mensaje; no garantiza display,
// pero separa "el server nunca lo mandó" de "el push service lo tiene".
interface PushLogRow {
  job_id: string
  status: 'accepted' | 'failed' | 'no_subs' | 'vapid_missing'
  status_code?: number | null
  error?: string | null
  endpoint_tail?: string | null
  title?: string | null
}

async function logPush(
  supabase: ReturnType<typeof createServiceClient>,
  rows: PushLogRow[],
): Promise<void> {
  try {
    if (rows.length === 0) return
    const { error } = await supabase.from('push_log').insert(rows)
    if (error) console.error('[cron-push] push_log insert failed:', error.message)
  } catch (err) {
    console.error('[cron-push] push_log insert threw:', err instanceof Error ? err.message : err)
  }
}

async function sendCronPush(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  output: string,
  isError: boolean,
  sessionId?: string | null,
  messageId?: string | null,
  reentrega?: string | null,
): Promise<void> {
  try {
    const base = decidirRutina(jobId, isError)
    // Un reporte atrasado queda en la campana sin sonar: no despertar al dueño
    // con el briefing de ayer.
    const decision = reentrega && base.entrega === 'push' ? { ...base, entrega: 'campana' as const } : base
    const title = (isError ? `${nombreRutina(jobId)} — falló` : CRON_JOB_LABELS[jobId] ?? nombreRutina(jobId)) + (reentrega ? ` · ${reentrega} (reentrega)` : '')
    const plain = await stripMd(output)
    const body = plain.length > 200 ? plain.slice(0, 200) + '...' : plain
    // Deep-link a la conversacion de Automatizaciones (?session=) + el mensaje
    // exacto (&msg=): al tocar la notificacion cae directo en ese chat y en el
    // INICIO de ese mensaje (el SW postMessea open-chat-session en warm, y
    // ChatPanel lee ?session=/&msg= en cold open). El SW ademas usa `url` para
    // prefetchear la sesion al RECIBIR el push (antes del tap).
    //
    // morning-briefing también: desde el 10 oct 2026 su reporte entra a la conversación favorita de Daniel (sin
    // favorita, al hilo «Reportes»), y el push abre esa conversación en ese mensaje.
    const url = sessionId
        ? `/chat?session=${sessionId}${messageId ? `&msg=${messageId}` : ''}`
        : '/chat'
    if (decision.entrega === 'bitacora') {
      await registrar(supabase, decision, { title, body, url }, [])
      return
    }

    // Only send to the owner — fetch owner profile ids then filter subscriptions
    const ownerIds = await buzonDelDueno(supabase)
    if (ownerIds.length === 0) {
      await logPush(supabase, [{ job_id: jobId, status: 'no_subs', error: 'no owner profiles' }])
      return
    }

    // La campana guarda el aviso aunque el teléfono no esté suscrito.
    await registrar(supabase, decision, { title, body, url }, ownerIds)
    // Campana sin sonido (p. ej. una reentrega): el aviso quedó, no hay push.
    if (decision.entrega === 'campana') return

    ensureVapid()
    if (!vapidReady) {
      await logPush(supabase, [{ job_id: jobId, status: 'vapid_missing', error: 'VAPID keys not configured' }])
      return
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', ownerIds)
    if (!subs?.length) {
      await logPush(supabase, [{ job_id: jobId, status: 'no_subs', error: 'owner has no push subscriptions' }])
      return
    }

    const payload = JSON.stringify({
      title,
      body,
      url,
      tag: `cron-${jobId}`,
      icon: '/icon-192.png',
    })

    const invalidEndpoints: string[] = []
    const attempts: PushLogRow[] = []
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          attempts.push({
            job_id: jobId,
            status: 'accepted',
            endpoint_tail: sub.endpoint.slice(-16),
            title,
          })
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          // Log SIEMPRE: sin esto un push perdido (ej. morning-briefing 13 jul)
          // es indistinguible de uno entregado — el catch se tragaba todo.
          console.error(`[cron-push] send failed job=${jobId} status=${status ?? '?'} endpoint=${sub.endpoint.slice(0, 60)}`)
          attempts.push({
            job_id: jobId,
            status: 'failed',
            status_code: status ?? null,
            error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
            endpoint_tail: sub.endpoint.slice(-16),
            title,
          })
          if (status && status >= 400 && status < 500) {
            invalidEndpoints.push(sub.endpoint)
          }
        }
      }),
    )
    await logPush(supabase, attempts)

    if (invalidEndpoints.length > 0) {
      console.error(`[cron-push] pruning ${invalidEndpoints.length} invalid subscription(s) job=${jobId}`)
      await supabase.from('push_subscriptions').delete().in('endpoint', invalidEndpoints)
    }
  } catch (err) {
    // Push notifications are best-effort — never block the webhook
    console.error(`[cron-push] pipeline error job=${jobId}:`, err instanceof Error ? err.message : err)
    // El pipeline entero tronó ANTES de intentar los envíos: también es un
    // push que no salió, y también merece acuse (best-effort, nunca lanza).
    await logPush(supabase, [{
      job_id: jobId,
      status: 'failed',
      error: `pipeline: ${err instanceof Error ? err.message.slice(0, 280) : String(err).slice(0, 280)}`,
    }])
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // Authenticate via bearer token
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.OPENCLAW_GATEWAY_TOKEN

    if (!expectedToken) {
      console.error('[openclaw/event] OPENCLAW_GATEWAY_TOKEN env var is not set')
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 },
      )
    }

    const token = authHeader?.replace('Bearer ', '')
    if (token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // Parse and validate payload
    const body: unknown = await request.json()
    const parseResult = openClawEventSchema.safeParse(body)

    if (!parseResult.success) {
      console.warn('[openclaw/event] Invalid payload:', parseResult.error.format())
      return NextResponse.json(
        { error: 'Invalid payload', details: parseResult.error.format() },
        { status: 400 },
      )
    }

    const event = parseResult.data
    console.log(`[openclaw/event] ${event.action} | runId=${event.runId} | agent=${event.agentId ?? 'unknown'}`)

    // Initialize Supabase service client (bypasses RLS for agent writes)
    const supabase = createServiceClient()

    // Resolve agent
    const agent = await resolveAgent(supabase, event.agentId, event.sessionKey)
    if (!agent) {
      console.error('[openclaw/event] No agent found in database')
      return NextResponse.json(
        { error: 'No agent found' },
        // 503, no 400: el emisor conserva el evento y reintenta.
        { status: 503 },
      )
    }

    // Route conversation events to conversations table (not Kanban)
    if (event.source === 'mission-control') {
      await handleConversationEvent(supabase, event, agent)
      return NextResponse.json({ ok: true, action: event.action, runId: event.runId, routed: 'conversations' })
    }

    // Route cron events to conversations table + push notification
    if (event.source === 'cron') {
      await handleCronEvent(supabase, event, agent)
      return NextResponse.json({ ok: true, action: event.action, runId: event.runId, routed: 'cron' })
    }

    // Dispatch to action handler
    switch (event.action) {
      case 'start':
        await handleStart(supabase, event, agent)
        break
      case 'progress':
        await handleProgress(supabase, event, agent)
        break
      case 'end':
        await handleEnd(supabase, event, agent)
        break
      case 'error':
        await handleError(supabase, event, agent)
        break
      case 'document':
        await handleDocument(supabase, event, agent)
        break
    }

    return NextResponse.json({ ok: true, action: event.action, runId: event.runId })
  } catch (err) {
    if (err instanceof AgentLookupError || err instanceof EntregaError) {
      console.error('[openclaw/event] retryable:', err.message)
      return NextResponse.json({ error: err.message, retryable: true }, { status: 503 })
    }
    console.error('[openclaw/event] Unhandled error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
