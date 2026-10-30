import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { mungeProjectDir, readSessionMessages, transcriptPath } from './claude-transcript.js'

const SID = '0a0a0a0a-1b1b-4c2c-8d3d-4e4e4e4e4e4e'
const lines = [
  { type: 'queue-operation', operation: 'enqueue', sessionId: SID },
  { type: 'attachment', uuid: 'a1', parentUuid: null, sessionId: SID, attachment: { type: 'skill_listing' } },
  { type: 'user', uuid: 'u1', parentUuid: 'a1', sessionId: SID, message: { role: 'user', content: 'Memoriza: ALFA. Responde OK.' } },
  { type: 'assistant', uuid: 's1', parentUuid: 'u1', sessionId: SID, message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] } },
  { type: 'user', uuid: 'side', parentUuid: 's1', sessionId: SID, isSidechain: true, message: { role: 'user', content: 'subagent prompt' } },
  { type: 'system', uuid: 'sys', parentUuid: 's1', sessionId: SID, subtype: 'compact_boundary' },
  'not json',
  { type: 'user', uuid: 'u2', parentUuid: 's1', sessionId: SID, message: { role: 'user', content: [{ type: 'text', text: 'Mi color es AZUL.' }] } },
  { type: 'assistant', uuid: 's2', parentUuid: 'u2', sessionId: SID, message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] } },
]

function project(dir: string) {
  const config = mkdtempSync(join(tmpdir(), 'claude-config-'))
  const folder = join(config, 'projects', mungeProjectDir(dir))
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, `${SID}.jsonl`), lines.map(line => typeof line === 'string' ? line : JSON.stringify(line)).join('\n') + '\n')
  return config
}

describe('claude transcript reader', () => {
  it('munges the working directory like the CLI', () => {
    expect(mungeProjectDir('/Users/alumno/Developer/mi-cerebro')).toBe('-Users-alumno-Developer-mi-cerebro')
    expect(mungeProjectDir('/tmp/a.b_c')).toBe('-tmp-a-b-c')
  })
  it('returns user/assistant messages of the main chain in file order, skipping queue/attachment/sidechain/bad lines', async () => {
    const configDir = project('/w/app')
    const messages = await readSessionMessages(SID, { dir: '/w/app', configDir })
    expect(messages.map(m => `${m.type}:${m.uuid}`)).toEqual(['user:u1', 'assistant:s1', 'user:u2', 'assistant:s2'])
    const withSystem = await readSessionMessages(SID, { dir: '/w/app', configDir, includeSystemMessages: true })
    expect(withSystem.map(m => m.uuid)).toContain('sys')
  })
  it('finds the transcript in another project of the same config dir, and returns [] when absent', async () => {
    const configDir = project('/w/other')
    expect(transcriptPath(SID, '/w/app', configDir)).toContain(mungeProjectDir('/w/other'))
    expect((await readSessionMessages(SID, { dir: '/w/app', configDir })).length).toBe(4)
    expect(await readSessionMessages('00000000-0000-4000-8000-000000000000', { dir: '/w/app', configDir })).toEqual([])
    expect(await readSessionMessages('../../etc/passwd', { configDir })).toEqual([])
  })
})
