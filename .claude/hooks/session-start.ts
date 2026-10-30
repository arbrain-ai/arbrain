#!/usr/bin/env node
/**
 * SessionStart: aviso de cuántos artículos compilados hay en `.claude/knowledge/`.
 *
 * Edición del alumno (red team 2, C-1): este hook NO ejecuta nada ni importa archivos del workspace. Solo cuenta
 * archivos con módulos de Node. La agenda (`.claude/now.md`) la entrega `memory-recall.py` en cada turno si existe.
 * El código no lleva tipos para que lo corra el `node` del sistema tal cual.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Dentro del daemon de la app los hooks de arranque no aplican (las conversaciones ya llevan su contexto).
if (process.env.CLAUDECLAW_DAEMON) process.exit(0)

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const KNOWLEDGE_DIR = join(ROOT, '.claude', 'knowledge')

function countArticles() {
  let count = 0
  for (const dir of ['concepts', 'connections', 'qa']) {
    const path = join(KNOWLEDGE_DIR, dir)
    if (existsSync(path)) count += readdirSync(path).filter(f => f.endsWith('.md')).length
  }
  return count
}

const articleCount = countArticles()
if (articleCount > 0) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Knowledge Base: ${articleCount} articulos compilados disponibles. Usa skill \`knowledge-search\` para consultar.`,
    },
  }))
}
process.exit(0)
