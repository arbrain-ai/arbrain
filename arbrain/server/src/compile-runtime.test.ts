import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireCompileLock, COMPILE_BATCH_MS, COMPILE_FILE_MS, withCompileDeadline } from './compile-runtime.js'
const dirs: string[] = []
function lockFile() { const dir = mkdtempSync(join(tmpdir(), 'compile-lock-')); dirs.push(dir); return join(dir, 'lock') }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.useRealTimers() })
test('exclusive ownership survives repeated contenders and can be released', () => {
  const file = lockFile(); const release = acquireCompileLock(file)!
  for (let i = 0; i < 10; i++) expect(acquireCompileLock(file)).toBeNull()
  release(); expect(acquireCompileLock(file)).toBeTypeOf('function')
})
test('old owner cannot delete a replacement lock', () => {
  const file = lockFile(); const release = acquireCompileLock(file)!
  writeFileSync(file, 'replacement'); release(); expect(readFileSync(file, 'utf8')).toBe('replacement')
})
test('legacy timestamp is not assumed dead by age', () => {
  const file = lockFile(); writeFileSync(file, '1'); expect(acquireCompileLock(file)).toBeNull()
})
test('deadline abort reaches the running operation and cleanup finishes', async () => {
  vi.useFakeTimers(); let closed = false
  const operation = withCompileDeadline(async controller => {
    await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }))
    closed = true; return 'checkpoint'
  }, 100)
  await vi.advanceTimersByTimeAsync(100)
  expect(await operation).toBe('checkpoint'); expect(closed).toBe(true); expect(vi.getTimerCount()).toBe(0)
})
test('early success cancels timeout and maximum batch fits scheduler', async () => {
  vi.useFakeTimers(); expect(await withCompileDeadline(async () => 7)).toBe(7)
  expect(vi.getTimerCount()).toBe(0); expect(COMPILE_BATCH_MS + COMPILE_FILE_MS).toBeLessThan(45 * 60_000)
})
