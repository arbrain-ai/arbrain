#!/usr/bin/env node
/**
 * CLI para gestionar tareas programadas de ClaudeClaw.
 * Uso: npx tsx src/schedule-cli.ts <command> [args]
 *
 * Comandos:
 *   list                          — Lista todas las tareas
 *   create <prompt> <cron> <chatId> [threadId]  — Crea una tarea
 *   delete <id>                   — Elimina una tarea
 *   pause <id>                    — Pausa una tarea
 *   resume <id>                   — Reactiva una tarea
 *   run <id>                      — Ejecuta una tarea ahora (one-shot)
 */

import { initDatabase, listTasks, createTask, deleteTask, updateTaskStatus, getTask, updateTaskAfterRun } from './db.js'
import { computeNextRun } from './scheduler.js'
import { runAgent } from './agent.js'
import { mcCronResult } from './mc-client.js'

initDatabase()

const [, , command, ...args] = process.argv

function printHelp(): void {
  console.log(`
ClaudeClaw Schedule CLI

Commands:
  list                                    List all scheduled tasks
  create <prompt> <cron> <chatId>         Create a new task (optional 4th arg: threadId)
  delete <id>                             Delete a task by ID
  pause <id>                              Pause a task
  resume <id>                             Resume a paused task
  run <id>                                Run a task immediately (one-shot)

Examples:
  npx tsx src/schedule-cli.ts list
  npx tsx src/schedule-cli.ts create "Di hola" "* * * * *" 8172633951
  npx tsx src/schedule-cli.ts create "Reporte" "0 9 * * *" -1003884558347 3
  npx tsx src/schedule-cli.ts delete my-task-id
  npx tsx src/schedule-cli.ts pause my-task-id
  npx tsx src/schedule-cli.ts resume my-task-id
  npx tsx src/schedule-cli.ts run morning-briefing
`)
}

function formatDate(unixSeconds: number | null): string {
  if (!unixSeconds) return 'never'
  return new Date(unixSeconds * 1000).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
}

function truncate(str: string, len: number): string {
  if (!str) return ''
  return str.length > len ? str.slice(0, len - 1) + '…' : str
}

switch (command) {
  case 'list': {
    const tasks = listTasks().filter(t => !t.id.endsWith('-migrated'))
    if (tasks.length === 0) {
      console.log('No scheduled tasks found.')
      break
    }

    console.log(`\n${'ID'.padEnd(24)} ${'STATUS'.padEnd(8)} ${'SCHEDULE'.padEnd(14)} ${'NEXT RUN'.padEnd(22)} PROMPT`)
    console.log('─'.repeat(100))

    for (const task of tasks) {
      const id = truncate(task.id, 24).padEnd(24)
      const status = task.status.padEnd(8)
      const schedule = task.schedule.padEnd(14)
      const nextRun = formatDate(task.next_run).padEnd(22)
      const prompt = truncate(task.prompt, 40)
      console.log(`${id} ${status} ${schedule} ${nextRun} ${prompt}`)
    }
    console.log()
    break
  }

  case 'create': {
    const [prompt, schedule, chatId, threadIdStr] = args

    if (!prompt || !schedule || !chatId) {
      console.error('Usage: create <prompt> <cron> <chatId> [threadId]')
      process.exit(1)
    }

    // Validar expresión cron
    let nextRun: number
    try {
      nextRun = computeNextRun(schedule)
    } catch {
      console.error(`Invalid cron expression: "${schedule}"`)
      process.exit(1)
    }

    const threadId = threadIdStr ? parseInt(threadIdStr, 10) : null

    // Generar ID desde el prompt (primeras palabras, slug)
    const slug = prompt
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join('-')
    const id = `custom-${slug}-${Date.now().toString(36)}`

    createTask({
      id,
      chat_id: chatId,
      thread_id: threadId,
      prompt,
      schedule,
      next_run: nextRun,
      status: 'active',
      created_at: Math.floor(Date.now() / 1000),
    })

    console.log(`✓ Task created: ${id}`)
    console.log(`  Schedule : ${schedule}`)
    console.log(`  Next run : ${formatDate(nextRun)}`)
    console.log(`  Chat     : ${chatId}${threadId ? ` (thread ${threadId})` : ''}`)
    break
  }

  case 'delete': {
    const [id] = args
    if (!id) {
      console.error('Usage: delete <id>')
      process.exit(1)
    }

    const task = getTask(id)
    if (!task) {
      console.error(`Task not found: ${id}`)
      process.exit(1)
    }

    deleteTask(id)
    console.log(`✓ Task deleted: ${id}`)
    break
  }

  case 'pause': {
    const [id] = args
    if (!id) {
      console.error('Usage: pause <id>')
      process.exit(1)
    }

    const task = getTask(id)
    if (!task) {
      console.error(`Task not found: ${id}`)
      process.exit(1)
    }

    updateTaskStatus(id, 'paused')
    console.log(`✓ Task paused: ${id}`)
    break
  }

  case 'resume': {
    const [id] = args
    if (!id) {
      console.error('Usage: resume <id>')
      process.exit(1)
    }

    const task = getTask(id)
    if (!task) {
      console.error(`Task not found: ${id}`)
      process.exit(1)
    }

    const nextRun = computeNextRun(task.schedule)
    updateTaskStatus(id, 'active')
    console.log(`✓ Task resumed: ${id}`)
    console.log(`  Next run: ${formatDate(nextRun)}`)
    break
  }

  case 'run': {
    const [id] = args
    if (!id) {
      console.error('Usage: run <id>')
      process.exit(1)
    }

    const task = getTask(id)
    if (!task) {
      console.error(`Task not found: ${id}`)
      process.exit(1)
    }

    console.log(`Running task: ${id}`)
    console.log(`Prompt: ${truncate(task.prompt, 80)}`)
    console.log('...')

    try {
      const result = await runAgent(task.prompt)
      const text = result.text?.trim() ?? ''
      console.log('\n── Result ──')
      console.log(text || '(no output)')

      // Deliver to Mission Control only if job is in VISIBLE_JOBS whitelist
      const VISIBLE_JOBS = new Set(['morning-briefing', 'evening-briefing', 'business-council', 'monthly-review', 'evening-reflection'])
      if (VISIBLE_JOBS.has(id) && text) {
        await mcCronResult(id, text)
      }
      const nextRun = computeNextRun(task.schedule)
      updateTaskAfterRun(id, text || '(no output)', nextRun)
    } catch (err) {
      await mcCronResult(id, '', String(err))
      console.error(`Error: ${String(err)}`)
      process.exit(1)
    }
    break
  }

  default: {
    printHelp()
    if (command && command !== 'help') {
      console.error(`Unknown command: ${command}`)
      process.exit(1)
    }
  }
}
