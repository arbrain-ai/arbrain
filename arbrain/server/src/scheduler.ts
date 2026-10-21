import { DUENO, DUENO_M } from './dueno.js'
import { configuredCronEnvironment } from './cron-account.js'
import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
// cron-parser is CJS — use createRequire for reliable interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { parseExpression } = _require('cron-parser') as any
import { getDueTasks, createTask, updateTaskAfterRun, taskExists, deleteTask, listTasks, getDb, saveQueryUsage, type ScheduledTask } from './db.js'
import { runAgent, type AgentUsage } from './agent.js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from './logger.js'
import { ALLOWED_CHAT_ID } from './config.js'
import { mcCronResult } from './mc-client.js'
import { opsLogger } from './ops-logger.js'
import { autoCommitCronChanges } from './autoCommit.js'
import { readEnvFile } from './env.js'
import { esEdicionCliente } from './edicion.js'
import { carpetaOriginal } from './dueno.js'
import { faltaLlaveClaude, MENSAJE_FALTA_LLAVE } from './cliente/llaves.js'
import { MENSAJE_PAUSA, pausado } from './cliente/pausa.js'

let schedulerInterval: ReturnType<typeof setInterval> | null = null

// Only these jobs send output to Mission Control chat UI.
// Everything else runs silently (results stored in DB but no message sent).
// Excepción (4 oct 2026): los jobs con hilo en la carpeta «Rutinas» (arbrain/src/shared/constants/rutinas-hilos.ts)
// entregan su RESULTADO aunque salgan silent; lo decide el webhook, no esta lista. Sin push. v3 (10 oct 2026): los de
// «Reportes» llegan a la conversación favorita de Daniel y los de «Información», a la bitácora.
// 'evening-briefing' quitado en v40 (15 jul 2026): el job no existe en la DB
// desde hace tiempo (murió en el rediseño 80/20 de morning-briefing), era
// referencia muerta.
const VISIBLE_JOBS = new Set([
  'morning-briefing',
  // 'ritual-noche' quitado (10 oct 2026): el ritual ya no es aviso; lo inyecta el hook de contexto (agenda-context.py).
  'business-council',
  'monthly-review',
  // v42: mensual, dia 1 — SOLO habla si falta dictar el snapshot (output vacio = silencio)
  'snapshot-finanzas',
  // v66: solo habla si sfocus está roto (salida vacía = silencio)
  'sfocus-guardia',
])

// Jobs that need more than the default 30-minute timeout (ms).
// Autoresearch runs 30 iterations × 16 API calls = can take 30-45 min.
const JOB_TIMEOUT_MS: Record<string, number> = {
  'autoresearch-trinity': 3_600_000, // 60 min
  'autoresearch-sensei':  3_600_000, // 60 min
  'autoresearch-levy':    3_600_000, // 60 min
  // Councils + reviews: analisis profundo, el default de 30 min los truncaba
  // ("Me tardé demasiado pensando"). Son semanales/mensuales, hay espacio.
  'business-council':     3_600_000, // 60 min
  'monthly-review':       3_600_000, // 60 min
  // Jobs de datos/ML pesados que tronaban a los 30 min (semanales o 2x/dia).
  // 'churn-predict' y 'video-conversion-model' podados en v40 (15 jul 2026,
  // ver migrateToV40) — entradas retiradas para no dejar timeouts de jobs
  // que ya no existen.
  'intel-youtube-scan':          2_700_000, // 45 min (8:15 y 20:15, 12h aparte)
  'video-feature-engineering':   2_700_000, // 45 min (domingos)
  'youtube-comments-feedback-loop': 2_700_000, // 45 min (domingos)
  // Firma Metabolismo 6 jul 2026: hermanos del mismo pipeline/síntoma que el
  // fix del 30 jun omitió — el timeout default era su causa #1 de muerte
  // (respond: 16/23 errores 30d; twitter-monitor: 4/4 esta semana).
  'youtube-comments-respond':    2_700_000, // 45 min (4x/día)
  'youtube-comments-post':       2_700_000, // 45 min (4x/día)
}

// Jobs de SCRIPT DIRECTO que NO deben pasar por la capa de agente LLM externa:
// envueltos en runAgent heredaban fallas ajenas al script (OAuth 401,
// session/weekly limit compartido con Daniel, timeout de 30 min de agente) —
// 7/7 errores de metrics-snapshot en 7d fueron de esa capa, cero del script.
// knowledge-compile llama al SDK ÉL MISMO (una capa LLM interna es suficiente;
// dos era el anti-patrón). Firma Metabolismo 6 jul 2026.
// Si el stdout trae el marcador [[USAGE_COST_USD=x]], se une jobId↔costo igual
// que un job de agente (compile.ts lo emite).
const __dirname_sched = path.dirname(fileURLToPath(import.meta.url))
const CLAUDECLAW_ROOT = path.resolve(__dirname_sched, '..')
const REPO_ROOT = path.resolve(CLAUDECLAW_ROOT, '..', '..')
/** Scripts directos (sin agente). Los registra la instalación original al cargar sus crons; el núcleo no trae ninguno
 * (la copia del alumno solo corre tareas de agente). */
export const RAW_SCRIPT_JOBS: Record<string, { cmd: string; args: string[]; timeoutMs: number }> = {}
export function registrarScriptsDirectos(jobs: Record<string, { cmd: string; args: string[]; timeoutMs: number }>): void {
  Object.assign(RAW_SCRIPT_JOBS, jobs)
}
const execFileAsync = promisify(execFile)

// TZ en la que se interpretan las expresiones cron. Configurable con CRON_TZ
// (p. ej. si la máquina pasa una temporada en otra zona horaria); sin la
// variable, la zona por defecto de la instalación. Mission Control la lee del
// response de /schedule para proyectar ocurrencias identicas en el Cron Lens.
// Nota: el daemon NO carga .env en process.env (ver env.ts), usar readEnvFile.
// Edición cliente: la zona del sistema del alumno (puede no estar en México).
export const CRON_TZ = process.env.CRON_TZ || readEnvFile(['CRON_TZ']).CRON_TZ || (esEdicionCliente() ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'America/Mexico_City')

export function computeNextRun(cronExpression: string): number {
  const interval = parseExpression(cronExpression, { tz: CRON_TZ })
  return Math.floor(interval.next().getTime() / 1000)
}

/**
 * Ejecuta UN cron job end-to-end con instrumentación completa. Compartido por
 * el scheduler (corridas programadas) y el run manual del HTTP bridge
 * (/schedule/:id/run) — así TODA corrida deja el mismo rastro:
 *   1. conversations en MC (via webhook mcCronResult) con `usage` = jobId + costo UNIDOS
 *   2. query_usage local (session_key `cron:<jobId>`) — antes solo el chat escribía aquí
 *   3. ops_events cron_done con costo/tokens junto al jobId
 * Nunca rechaza por errores del agente (los reporta por los mismos canales).
 */
export async function executeCronJob(task: ScheduledTask, opts?: { manual?: boolean }): Promise<void> {
  const manual = opts?.manual ?? false
  const nextRun = computeNextRun(task.schedule)

  logger.info({ taskId: task.id, manual, prompt: task.prompt.slice(0, 80) }, 'running scheduled task')
  opsLogger.log('cron_start', 'cron', { jobId: task.id, schedule: task.schedule, manual })

  try {
    let text: string
    let usage: AgentUsage | undefined
    // Edición cliente: ningún script de Daniel (python3/bash) aunque una tarea del alumno se llame igual.
    const rawScript = esEdicionCliente() ? undefined : RAW_SCRIPT_JOBS[task.id]
    if (!rawScript && faltaLlaveClaude()) throw new Error(MENSAJE_FALTA_LLAVE)
    if (esEdicionCliente() && pausado()) throw new Error(MENSAJE_PAUSA)
    if (rawScript) {
      // Script directo: sin capa de agente externa no hay OAuth/limits/timeout ajenos.
      const { stdout, stderr } = await execFileAsync(
        rawScript.cmd, rawScript.args,
        { timeout: rawScript.timeoutMs, cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024, env: configuredCronEnvironment() },
      ).catch((e: Error & { stdout?: string; stderr?: string; code?: number }) => {
        throw new Error(e.stderr?.trim()?.slice(0, 500) || e.stdout?.trim()?.slice(-500) || `script failed: ${e.message}`)
      })
      if (stderr?.trim()) logger.warn({ taskId: task.id, stderr: stderr.slice(0, 300) }, 'raw script stderr')
      const costMarker = stdout?.match(/\[\[USAGE_COST_USD=([\d.]+)\]\]/)
      // TOKENS (15 jul 2026): antes se registraba inputTokens:0 hardcodeado — un
      // 0 FABRICADO, lo mismo que la linea de abajo se cuida de no hacer con el
      // costo. El metabolismo no podia juzgar por cuota (lo escaso bajo Max)
      // porque el dato llegaba en cero. compile.ts ya emite este marcador.
      const tokMarker = stdout?.match(/\[\[USAGE_TOKENS=(\d+)\/(\d+)\]\]/)
      text = (stdout ?? '')
        .replace(/\[\[USAGE_COST_USD=[\d.]+\]\]\n?/, '')
        .replace(/\[\[USAGE_TOKENS=\d+\/\d+\]\]\n?/, '')
        .trim()
      // Sin marcador = sin LLM = sin costo: null honesto, no $0 fabricado.
      usage = costMarker
        ? {
            costUsd: parseFloat(costMarker[1]),
            inputTokens: tokMarker ? parseInt(tokMarker[1], 10) : 0,
            outputTokens: tokMarker ? parseInt(tokMarker[2], 10) : 0,
            durationMs: 0,
            numTurns: 0,
          }
        : undefined
    } else {
      const timeout = JOB_TIMEOUT_MS[task.id]
      // Prefix con 🤖 + taskId para distinguir sesiones cron de conversaciones humanas
      // en el listado de Claude Code (/resume, ~/.claude/projects/). El primer user
      // message es lo que Claude Code usa como título de sesión.
      const cronPrompt = `🤖 [${task.id}]\n\n${task.prompt}`
      const result = await runAgent(cronPrompt, undefined, undefined, 'cron', timeout)
      text = result.text?.trim() ?? ''
      usage = result.usage
    }

    // jobId + costo unidos en SQLite local (mismo formato que el path de chat)
    if (usage) {
      saveQueryUsage({
        sessionKey: `cron:${task.id}`,
        costUsd: usage.costUsd,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs: usage.durationMs,
        numTurns: usage.numTurns,
      })
    }

    // TODOS los runs se registran en MC (historial input/output del Cron Lens +
    // usage para la sala Acciones), incluso sin output. Solo los VISIBLE_JOBS
    // ademas inyectan al chat Automatizaciones + push; el resto va con silent
    // (conversations si, chat/push no — eso lo resuelve el webhook).
    const isVisible = VISIBLE_JOBS.has(task.id)
    await mcCronResult(task.id, text, undefined, { silent: !isVisible, usage })

    updateTaskAfterRun(task.id, text || '(no output)', nextRun)
    opsLogger.log('cron_done', 'cron', {
      jobId: task.id,
      resultLength: text.length,
      manual,
      costUsd: usage?.costUsd ?? 0,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      durationMs: usage?.durationMs ?? 0,
      numTurns: usage?.numTurns ?? 0,
      model: usage?.model,
    })
    logger.info({ taskId: task.id, nextRun, costUsd: usage?.costUsd }, 'task completed')

    // Auto-commit any tracked files this cron mutated (knowledge base,
    // autoresearch results, submodule pointers). Whitelisted paths only,
    // never throws. See autoCommit.ts.
    await autoCommitCronChanges(task.id)
  } catch (err) {
    logger.error({ err, taskId: task.id }, 'scheduled task error')
    // Firma Metabolismo (instrumentacion:costo-crons): el usage ya calculado por
    // runAgent NO se descarta en error — se propaga a los 3 canales igual que
    // en el happy path (antes se perdía aunque existía una línea arriba).
    const partialUsage = (err as Error & { partialUsage?: AgentUsage }).partialUsage
    if (partialUsage) {
      saveQueryUsage({
        sessionKey: `cron:${task.id}`,
        costUsd: partialUsage.costUsd,
        inputTokens: partialUsage.inputTokens,
        outputTokens: partialUsage.outputTokens,
        durationMs: partialUsage.durationMs,
        numTurns: partialUsage.numTurns,
      })
    }
    opsLogger.log('cron_error', 'cron', {
      jobId: task.id,
      error: String(err),
      manual,
      ...(partialUsage && {
        costUsd: partialUsage.costUsd,
        inputTokens: partialUsage.inputTokens,
        outputTokens: partialUsage.outputTokens,
        numTurns: partialUsage.numTurns,
      }),
    })
    // Errors always visible — Daniel needs to know if something breaks
    await mcCronResult(task.id, '', String(err), partialUsage ? { usage: partialUsage } : undefined)
    // Backoff consciente de límites (firma auditoria:youtube-comments-respond):
    // si el error es session/weekly limit, reintentar poco después del reset en
    // vez del próximo slot natural (que hoy suele caer en otra ventana agotada).
    // Jitter estable por jobId para no estampidar todos al mismo minuto.
    const limitRetry = parseLimitResetEpoch(String(err), task.id)
    const effectiveNext = limitRetry != null && limitRetry < nextRun ? limitRetry : nextRun
    if (effectiveNext !== nextRun) {
      logger.info({ taskId: task.id, retryAt: new Date(effectiveNext * 1000).toISOString() }, 'limit hit — rescheduled to just after reset')
    }
    updateTaskAfterRun(task.id, `Error: ${String(err)}`, effectiveNext)
    // Even on agent error, the cron may have produced partial side effects
    // worth committing (e.g. autoresearch wrote results.tsv before timing out).
    await autoCommitCronChanges(task.id)
  }
}

/**
 * Parsea la hora de reset de los mensajes de límite del SDK
 * ("You've hit your session limit · resets 7am (Europe/Madrid)") y regresa el
 * epoch (segundos) de ese reset + 10 min + jitter estable (0-20 min por jobId).
 * Regresa null si el error no es de límite o no se puede parsear con confianza.
 */
export function parseLimitResetEpoch(errText: string, jobId: string): number | null {
  if (!/session limit|weekly limit/i.test(errText)) return null
  const m = errText.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i)
  if (!m) return Math.floor(Date.now() / 1000) + 2 * 3600 // límite sin hora parseable: +2h
  const hour12 = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  const isPm = m[3].toLowerCase() === 'pm'
  const tz = m[4].trim()
  const hour = (hour12 % 12) + (isPm ? 12 : 0)
  // Buscar la próxima ocurrencia de esa hora:minuto en esa tz (hoy o mañana).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const nowSec = Math.floor(Date.now() / 1000)
  for (let addDays = 0; addDays <= 1; addDays++) {
    // Camina en pasos de 15 min desde ahora hasta +48h buscando el primer
    // instante cuyo reloj-en-tz sea >= hora de reset (robusto sin libs de tz).
    for (let t = nowSec + addDays * 86400; t < nowSec + (addDays + 1) * 86400; t += 900) {
      const parts = fmt.formatToParts(new Date(t * 1000))
      const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
      const min = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
      if (h === hour && min >= minute) {
        let jitter = 0
        for (const ch of jobId) jitter = (jitter * 31 + ch.charCodeAt(0)) % 1200
        return t + 600 + jitter // reset + 10 min + jitter 0-20 min
      }
    }
  }
  return nowSec + 2 * 3600
}

// Anti-pileup guard (incidente 18 jul 2026): el setInterval de 60s disparaba
// runDueTasks() sin esperar al pase anterior. Tras un boot con backlog (Mac
// apagado toda la noche), cada tick creaba un runner NUEVO con un snapshot
// stale de las tareas vencidas → ~12 runners concurrentes ejecutaron cada cron
// hasta 13 veces (162 runs, cuota gastada de más y ~30 avisos duplicados).
let runDueTasksActive = false

// Catch-up con criterio (18 jul 2026): tras un boot con backlog, los jobs de
// CONVERSACION diaria pierden su valor si llegan horas tarde — un "morning
// briefing" a las 2 PM o una "evening reflection" del dia anterior solo hacen
// ruido. Si van >6h tarde, se SALTAN (next_run avanza sin ejecutar). Los jobs
// de DATOS (snapshots, syncs, backups, compile) NO van aqui: su catch-up
// siempre vale, llegue a la hora que llegue.
const STALE_SKIP_JOBS = new Set(['morning-briefing', 'evening-reflection'])
const STALE_SKIP_AFTER_S = 6 * 3600

export async function runDueTasks(): Promise<void> {
  // Guard 1: un solo pase a la vez. Si el anterior sigue drenando backlog,
  // este tick no hace nada — el pase activo ya tiene la lista.
  if (runDueTasksActive) return
  runDueTasksActive = true
  try {
    const tasks = getDueTasks()
    if (tasks.length === 0) return

    for (const task of tasks) {
      const nowEpoch = Math.floor(Date.now() / 1000)
      const nextRun = computeNextRun(task.schedule)

      // Jobs conversacionales muy tarde: avanzar sin ejecutar (ver STALE_SKIP_JOBS).
      if (STALE_SKIP_JOBS.has(task.id) && nowEpoch - task.next_run > STALE_SKIP_AFTER_S) {
        const advanced = getDb().prepare(
          'UPDATE scheduled_tasks SET next_run = ? WHERE id = ? AND next_run <= ?'
        ).run(nextRun, task.id, nowEpoch)
        if (advanced.changes > 0) {
          logger.info(
            { taskId: task.id, lateByHours: Math.round((nowEpoch - task.next_run) / 360) / 10 },
            'skipped: stale catch-up (conversational job >6h late)'
          )
        }
        continue
      }

      // Guard 2: CLAIM ATOMICO contra la fila FRESCA (no el snapshot).
      // Solo gana quien encuentre la tarea aun vencida Y sin correr en los
      // ultimos 30 min (restart guard). Si otro pase ya la reclamo, changes=0.
      const claimed = getDb().prepare(
        `UPDATE scheduled_tasks SET next_run = ?, last_run = ?
         WHERE id = ? AND status = 'active' AND next_run <= ?
           AND (last_run IS NULL OR last_run <= ?)`
      ).run(nextRun, nowEpoch, task.id, nowEpoch, nowEpoch - 1800)

      if (claimed.changes === 0) {
        // Perdio el claim: o ya la corrio/reclamo otro pase, o corrio hace
        // <30 min (restart guard). Si sigue vencida, avanzar next_run para
        // que no quede atorada en el backlog.
        const advanced = getDb().prepare(
          'UPDATE scheduled_tasks SET next_run = ? WHERE id = ? AND next_run <= ?'
        ).run(nextRun, task.id, nowEpoch)
        if (advanced.changes > 0) {
          logger.info({ taskId: task.id }, 'skipped: ran within last 30 minutes (restart guard)')
        }
        continue
      }

      await executeCronJob(task)
    }
  } finally {
    runDueTasksActive = false
  }
}

/**
 * Scheduler de la edición cliente (empaquetado, 11 oct 2026; contrato §8). No siembra ni migra los crons de Daniel
 * (python3, bash, rutas y Supabase suyas): solo corre las tareas que el propio alumno cree, que son prompts al agente
 * (TS puro, su llave). La consolidación de memoria y la limpieza de adjuntos ya corren en index.ts.
 */
export function initSchedulerCliente(): void {
  schedulerInterval = setInterval(() => {
    runDueTasks().catch((err) => logger.error({ err }, 'scheduler poll error'))
  }, 60_000)
  logger.info('scheduler (edición cliente) started: solo tareas del alumno')
}

/** Catálogo de crons de Daniel (migraciones v2…v75 y siembra): vive aparte, en src/daniel/, para que la copia del
 * alumno no lo lleve incrustado (datos, rutas y correos suyos). Se importa con un especificador variable: en la copia
 * del alumno el archivo no existe y nada lo pide (edición cliente → initSchedulerCliente). */
let detenido = false

function arrancarSondeo(): void {
  if (detenido || schedulerInterval) return
  // Poll cada 60 segundos
  schedulerInterval = setInterval(() => {
    runDueTasks().catch((err) => logger.error({ err }, 'scheduler poll error'))
  }, 60_000)

  logger.info('scheduler started')
}

export function initScheduler(): void {
  if (esEdicionCliente()) { initSchedulerCliente(); return }
  detenido = false
  const original = carpetaOriginal()
  void (original ? import(new URL(`./${original.nombre}/crons.js`, import.meta.url).href) as Promise<{ migrarCronsDeDaniel: () => void }> : Promise.reject(new Error('sin carpeta de la instalación original')))
    .then(m => m.migrarCronsDeDaniel())
    .catch(err => logger.error({ err }, `crons de ${DUENO}: migraciones y siembra fallaron; el sondeo sigue con lo que hay`))
    .finally(arrancarSondeo)
}

export function stopScheduler(): void {
  detenido = true
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}
