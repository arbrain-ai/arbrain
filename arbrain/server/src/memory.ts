import {
  searchMemoriesFTS,
  getRecentMemories,
  touchMemory,
  saveMemory,
  decayMemories as dbDecayMemories,
} from './db.js'
import { wrapMemoryContext, redactSecrets } from './security.js'

// Señales que indican memoria semántica (algo sobre el usuario / preferencias)
const SEMANTIC_PATTERN = /\b(my|i am|i'm|i'm|i prefer|remember|always|never|i work|i use|i live|i like|i hate|my name|my business|my project)\b/i

/**
 * Construye el contexto de memoria a inyectar antes del mensaje del usuario.
 * Combina FTS5 search (top 3) + memorias recientes (últimas 5) deduplicadas.
 */
export async function buildMemoryContext(chatId: string, userMessage: string): Promise<string> {
  const ftsResults = searchMemoriesFTS(chatId, userMessage, 3)
  const recentResults = getRecentMemories(chatId, 5)

  // Deduplicar por id
  const seen = new Set<number>()
  const combined = [...ftsResults, ...recentResults].filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  if (combined.length === 0) return ''

  // Tocar cada memoria (actualiza accessed_at y refuerza salience)
  for (const m of combined) {
    touchMemory(m.id)
  }

  const lines = combined.map((m) => `- ${m.content} (${m.sector})`).join('\n')
  return wrapMemoryContext(lines)
}

/**
 * Guarda un turno de conversación SOLO si contiene información semántica
 * (preferencias, facts sobre el usuario, decisiones de negocio).
 *
 * Con multi-session SDK, cada conversación mantiene su historial completo
 * via resume — no necesitamos duplicar turnos episódicos en SQLite.
 * Solo guardamos cross-session knowledge (semántico).
 */
export async function saveConversationTurn(
  chatId: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  // Saltar mensajes triviales o comandos
  if (userMsg.length <= 20 || userMsg.startsWith('/')) return

  // Only save semantic memories (cross-session knowledge about the user).
  // Episodic memories (conversation turns) are now handled by SDK session resume.
  if (!SEMANTIC_PATTERN.test(userMsg)) return

  const content = `User: ${userMsg.slice(0, 500)}\nAssistant: ${redactSecrets(assistantMsg.slice(0, 500))}`
  saveMemory(chatId, content, 'semantic')
}

/**
 * Decay diario: salience *= 0.98 para memorias de más de 24h.
 * Auto-elimina memorias con salience < 0.1.
 */
export function runDecaySweep(): void {
  dbDecayMemories()
}
