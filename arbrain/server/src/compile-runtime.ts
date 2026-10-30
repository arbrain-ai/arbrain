import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/** Atomic ownership; age alone is never evidence that a compiler has stopped. */
export function acquireCompileLock(file: string): (() => void) | null {
  const owner = JSON.stringify({ pid: process.pid, started: Date.now(), token: randomUUID() })
  try { writeFileSync(file, owner, { flag: 'wx', mode: 0o600 }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null
    throw error
  }
  return () => {
    try { if (readFileSync(file, 'utf8') === owner) unlinkSync(file) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

/** Soft batch bound leaves room for one final bounded file below the 45m scheduler limit. */
export const COMPILE_BATCH_MS = 20 * 60_000
export const COMPILE_FILE_MS = 15 * 60_000

export async function withCompileDeadline<T>(
  work: (controller: AbortController) => Promise<T>, milliseconds = COMPILE_FILE_MS,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), milliseconds)
  try { return await work(controller) }
  finally { clearTimeout(timer) }
}
