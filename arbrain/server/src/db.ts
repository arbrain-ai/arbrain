import Database from 'better-sqlite3'
import { join } from 'path'
import { chmodSync, existsSync, mkdirSync } from 'fs'
import { STORE_DIR, UPLOADS_DIR } from './config.js'
import { esEdicionCliente } from './edicion.js'

export interface Memory {
  id: number
  chat_id: string
  topic_key: string | null
  content: string
  sector: 'semantic' | 'episodic'
  salience: number
  created_at: number
  accessed_at: number
}

export interface ScheduledTask {
  id: string
  chat_id: string
  thread_id: number | null
  prompt: string
  schedule: string
  next_run: number
  last_run: number | null
  last_result: string | null
  status: 'active' | 'paused'
  created_at: number
}

let db: Database.Database

export function initDatabase(): void {
  mkdirSync(STORE_DIR, { recursive: true })
  mkdirSync(UPLOADS_DIR, { recursive: true })

  db = new Database(join(STORE_DIR, 'claudeclaw.db'))
  db.pragma('journal_mode = WAL')
  // Edición cliente (AUDITORIA I9): las conversaciones solo las lee su dueño (carpeta 0700, base y WAL 0600).
  if (esEdicionCliente()) {
    try {
      chmodSync(STORE_DIR, 0o700)
      for (const f of ['claudeclaw.db', 'claudeclaw.db-wal', 'claudeclaw.db-shm']) if (existsSync(join(STORE_DIR, f))) chmodSync(join(STORE_DIR, f), 0o600)
    } catch { /* permisos best-effort: nunca impiden arrancar */ }
  }

  db.exec(`
    -- Sesiones: cada chat_id mapea a un session_id de Claude Code
    CREATE TABLE IF NOT EXISTS sessions (
      chat_id   TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Memorias dual-sector (semantic + episodic)
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     TEXT NOT NULL,
      topic_key   TEXT,
      content     TEXT NOT NULL,
      sector      TEXT NOT NULL CHECK(sector IN ('semantic','episodic')),
      salience    REAL NOT NULL DEFAULT 1.0,
      created_at  INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL
    );

    -- FTS5 para búsqueda semántica sobre memorias
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content='memories',
      content_rowid='id'
    );

    -- Triggers para mantener FTS5 sincronizado
    CREATE TRIGGER IF NOT EXISTS memories_ai
      AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;

    CREATE TRIGGER IF NOT EXISTS memories_ad
      AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content)
          VALUES ('delete', old.id, old.content);
      END;

    CREATE TRIGGER IF NOT EXISTS memories_au
      AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content)
          VALUES ('delete', old.id, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;

    -- Tareas programadas (cron jobs)
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id          TEXT PRIMARY KEY,
      chat_id     TEXT NOT NULL,
      thread_id   INTEGER,
      prompt      TEXT NOT NULL,
      schedule    TEXT NOT NULL,
      next_run    INTEGER NOT NULL,
      last_run    INTEGER,
      last_result TEXT,
      status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_next
      ON scheduled_tasks(status, next_run);

    -- Usage tracking per query (cost, tokens, duration)
    CREATE TABLE IF NOT EXISTS query_usage (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key   TEXT NOT NULL,
      cost_usd      REAL NOT NULL DEFAULT 0,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms   INTEGER NOT NULL DEFAULT 0,
      num_turns     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_query_usage_created
      ON query_usage(created_at);

    -- Cron session reuse: one SDK session per category per week.
    -- Rotates weekly (week_key = ISO week like '2026-W15').
    CREATE TABLE IF NOT EXISTS cron_sessions (
      category   TEXT NOT NULL,
      week_key   TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (category, week_key)
    );

    -- Overrides de /model, /effort, /fast y /ultracode POR CONVERSACIÓN del chat
    -- web (session_key = chatSessionId de Arbrain, o SESSION_KEY para clientes
    -- sin sesión). Antes eran globales del daemon: el /effort max de una convo
    -- (o de la cuenta bro) pisaba TODAS las demás. Persistidos aquí para
    -- sobrevivir los restarts del auto-deploy (varios al día). Los crons
    -- (runAgent) NUNCA leen esta tabla — corren siempre en el default.
    CREATE TABLE IF NOT EXISTS chat_overrides (
      session_key TEXT PRIMARY KEY,
      model       TEXT,
      effort      TEXT,
      fast        INTEGER NOT NULL DEFAULT 0,
      ultracode   INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL
    );
  `)
}

export function getDb(): Database.Database {
  return db
}

// ============================================================
// SESSIONS
// ============================================================

export function getSession(chatId: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE chat_id = ?')
    .get(chatId) as { session_id: string } | undefined
  return row?.session_id
}

export function setSession(chatId: string, sessionId: string): void {
  db.prepare(`
    INSERT INTO sessions (chat_id, session_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      session_id = excluded.session_id,
      updated_at = excluded.updated_at
  `).run(chatId, sessionId, Date.now())
}

export function clearSession(chatId: string): void {
  db.prepare('DELETE FROM sessions WHERE chat_id = ?').run(chatId)
}

// ============================================================
// MEMORIES
// ============================================================

export function searchMemoriesFTS(chatId: string, query: string, limit = 3): Memory[] {
  // Sanitizar query para FTS5: solo alfanumérico + espacios, agregar * para prefix search
  const sanitized = query
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w + '*')
    .join(' ')

  if (!sanitized) return []

  return db
    .prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts f ON m.id = f.rowid
      WHERE f.memories_fts MATCH ? AND m.chat_id = ?
      ORDER BY rank
      LIMIT ?
    `)
    .all(sanitized, chatId, limit) as Memory[]
}

export function getRecentMemories(chatId: string, limit = 5): Memory[] {
  return db
    .prepare(`
      SELECT * FROM memories
      WHERE chat_id = ?
      ORDER BY accessed_at DESC
      LIMIT ?
    `)
    .all(chatId, limit) as Memory[]
}

export function touchMemory(id: number): void {
  db.prepare(`
    UPDATE memories
    SET accessed_at = ?, salience = MIN(salience + 0.1, 5.0)
    WHERE id = ?
  `).run(Date.now(), id)
}

export function saveMemory(
  chatId: string,
  content: string,
  sector: 'semantic' | 'episodic'
): void {
  const now = Date.now()
  db.prepare(`
    INSERT INTO memories (chat_id, content, sector, salience, created_at, accessed_at)
    VALUES (?, ?, ?, 1.0, ?, ?)
  `).run(chatId, content, sector, now, now)
}

export function decayMemories(): void {
  const dayAgo = Date.now() - 86_400_000
  db.prepare(`
    UPDATE memories SET salience = salience * 0.98
    WHERE created_at < ?
  `).run(dayAgo)
  db.prepare(`DELETE FROM memories WHERE salience < 0.1`).run()
}

export function getMemoriesByChatId(chatId: string, limit = 20): Memory[] {
  return db
    .prepare(`
      SELECT * FROM memories
      WHERE chat_id = ?
      ORDER BY accessed_at DESC
      LIMIT ?
    `)
    .all(chatId, limit) as Memory[]
}

export function clearMemories(chatId: string): void {
  db.prepare('DELETE FROM memories WHERE chat_id = ?').run(chatId)
}

// ============================================================
// SCHEDULED TASKS
// ============================================================

export function getDueTasks(): ScheduledTask[] {
  const now = Math.floor(Date.now() / 1000)
  return db
    .prepare(`
      SELECT * FROM scheduled_tasks
      WHERE status = 'active' AND next_run <= ?
    `)
    .all(now) as ScheduledTask[]
}

export function createTask(task: Omit<ScheduledTask, 'last_run' | 'last_result'>): void {
  db.prepare(`
    INSERT INTO scheduled_tasks
      (id, chat_id, thread_id, prompt, schedule, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.chat_id,
    task.thread_id ?? null,
    task.prompt,
    task.schedule,
    task.next_run,
    task.status,
    task.created_at
  )
}

export function updateTaskAfterRun(id: string, result: string, nextRun: number): void {
  db.prepare(`
    UPDATE scheduled_tasks
    SET last_run = ?, last_result = ?, next_run = ?
    WHERE id = ?
  `).run(Math.floor(Date.now() / 1000), result, nextRun, id)
}

export function updateTaskStatus(id: string, status: 'active' | 'paused'): void {
  db.prepare('UPDATE scheduled_tasks SET status = ? WHERE id = ?').run(status, id)
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
}

export function listTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[]
}

export function getTask(id: string): ScheduledTask | undefined {
  return db
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduledTask | undefined
}

export function taskExists(id: string): boolean {
  return db.prepare('SELECT id FROM scheduled_tasks WHERE id = ?').get(id) !== undefined
}

// ============================================================
// CRON SESSIONS (category → SDK session_id, rotated weekly)
// ============================================================

/** ISO week key like '2026-W15' */
export function currentWeekKey(): string {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000)
  const week = Math.ceil((days + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function getCronSession(category: string): string | undefined {
  const week = currentWeekKey()
  const row = db
    .prepare('SELECT session_id FROM cron_sessions WHERE category = ? AND week_key = ?')
    .get(category, week) as { session_id: string } | undefined
  return row?.session_id
}

export function setCronSession(category: string, sessionId: string): void {
  const week = currentWeekKey()
  db.prepare(`
    INSERT INTO cron_sessions (category, week_key, session_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(category, week_key) DO UPDATE SET
      session_id = excluded.session_id
  `).run(category, week, sessionId, Date.now())
}

// ============================================================
// CHAT OVERRIDES (por conversación: /model, /effort, /fast, /ultracode)
// ============================================================

export interface ChatOverrides {
  model: string | null
  effort: string | null
  fast: boolean
  ultracode: boolean
}

const DEFAULT_OVERRIDES: ChatOverrides = { model: null, effort: null, fast: false, ultracode: false }

export function getChatOverrides(sessionKey: string): ChatOverrides {
  const row = db
    .prepare('SELECT model, effort, fast, ultracode FROM chat_overrides WHERE session_key = ?')
    .get(sessionKey) as { model: string | null; effort: string | null; fast: number; ultracode: number } | undefined
  if (!row) return { ...DEFAULT_OVERRIDES }
  return { model: row.model, effort: row.effort, fast: row.fast === 1, ultracode: row.ultracode === 1 }
}

export function setChatOverrides(sessionKey: string, patch: Partial<ChatOverrides>): ChatOverrides {
  const next = { ...getChatOverrides(sessionKey), ...patch }
  // Todo en default = la fila sobra: se borra y la tabla solo guarda excepciones.
  if (next.model == null && next.effort == null && !next.fast && !next.ultracode) {
    db.prepare('DELETE FROM chat_overrides WHERE session_key = ?').run(sessionKey)
    return next
  }
  db.prepare(`
    INSERT INTO chat_overrides (session_key, model, effort, fast, ultracode, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_key) DO UPDATE SET
      model = excluded.model,
      effort = excluded.effort,
      fast = excluded.fast,
      ultracode = excluded.ultracode,
      updated_at = excluded.updated_at
  `).run(sessionKey, next.model, next.effort, next.fast ? 1 : 0, next.ultracode ? 1 : 0, Date.now())
  return next
}

// ============================================================
// QUERY USAGE
// ============================================================

export interface QueryUsageInput {
  sessionKey: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
}

export function saveQueryUsage(usage: QueryUsageInput): void {
  db.prepare(`
    INSERT INTO query_usage (session_key, cost_usd, input_tokens, output_tokens, duration_ms, num_turns, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    usage.sessionKey,
    usage.costUsd,
    usage.inputTokens,
    usage.outputTokens,
    usage.durationMs,
    usage.numTurns,
    Date.now(),
  )
}

export interface UsageSummary {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalQueries: number
  avgDurationMs: number
}

export function getUsageSummary(sinceMs?: number): UsageSummary {
  const since = sinceMs ?? Date.now() - 86_400_000 * 30 // default: last 30 days
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) as totalCostUsd,
      COALESCE(SUM(input_tokens), 0) as totalInputTokens,
      COALESCE(SUM(output_tokens), 0) as totalOutputTokens,
      COUNT(*) as totalQueries,
      COALESCE(AVG(duration_ms), 0) as avgDurationMs
    FROM query_usage
    WHERE created_at >= ?
  `).get(since) as UsageSummary
  return row
}
