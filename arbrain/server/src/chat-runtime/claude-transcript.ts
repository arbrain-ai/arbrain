import { createReadStream, existsSync, readdirSync } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { join } from 'path'

/**
 * Reader of Claude Code session transcripts (<configDir>/projects/<munged cwd>/<sessionId>.jsonl).
 *
 * Equivalent to the SDK's `getSessionMessages` for the main chain, with one
 * difference that matters for a daemon serving several accounts at once: the
 * config dir is a PARAMETER instead of `process.env.CLAUDE_CONFIG_DIR`, so a
 * read for `bro` never mutates the process environment under a concurrent
 * `default` turn. Keeps file order (chronological), returns user/assistant
 * entries of the main chain, never follows links: a transcript is data.
 */
export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'system'
  uuid: string
  parentUuid: string | null
  sessionId?: string
  timestamp?: string
  isSidechain?: boolean
  message?: unknown
  [key: string]: unknown
}

/** Same encoding Claude Code applies to the working directory of a project. */
export function mungeProjectDir(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, '-')
}

export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
}

/** Path of the transcript when it lives under `dir`; otherwise the first project that holds it. */
export function transcriptPath(sessionId: string, dir?: string, configDir = claudeConfigDir()): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null
  const projects = join(configDir, 'projects')
  if (dir) {
    const candidate = join(projects, mungeProjectDir(dir), `${sessionId}.jsonl`)
    if (existsSync(candidate)) return candidate
  }
  let entries: string[] = []
  try { entries = readdirSync(projects) } catch { return null }
  for (const name of entries) {
    const candidate = join(projects, name, `${sessionId}.jsonl`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function readTranscriptFile(file: string, options: { includeSystemMessages?: boolean } = {}): Promise<TranscriptMessage[]> {
  const messages: TranscriptMessage[] = []
  const reader = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of reader) {
    if (!line.trim()) continue
    let entry: Record<string, unknown>
    try { entry = JSON.parse(line) as Record<string, unknown> } catch { continue }
    const type = entry.type
    if (type !== 'user' && type !== 'assistant' && !(options.includeSystemMessages && type === 'system')) continue
    if (entry.isSidechain === true) continue
    if (typeof entry.uuid !== 'string') continue
    messages.push({ ...entry, type, uuid: entry.uuid, parentUuid: typeof entry.parentUuid === 'string' ? entry.parentUuid : null } as TranscriptMessage)
  }
  return messages
}

/** Drop-in for the SDK's getSessionMessages: `[]` when the session does not exist. */
export async function readSessionMessages(sessionId: string, options: { dir?: string; includeSystemMessages?: boolean; configDir?: string } = {}): Promise<TranscriptMessage[]> {
  const file = transcriptPath(sessionId, options.dir, options.configDir)
  if (!file) return []
  return readTranscriptFile(file, options)
}
