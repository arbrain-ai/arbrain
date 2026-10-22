import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatJournal } from './journal.js'
const f = vi.hoisted(() => ({ events: [] as unknown[], codex: vi.fn(), claude: vi.fn(), getSession: vi.fn(), setSession: vi.fn(), usage: vi.fn(), memory: vi.fn(), rewind: vi.fn(), download: vi.fn(), stage: vi.fn(), markers: vi.fn() }))
vi.mock('../agent.js', () => ({
  runAgentStream: (...args: unknown[]) => { f.claude(...args); return (async function* () { yield* f.events })() },
  computeRewindCheckpoint: f.rewind,
}))
vi.mock('../codex-agent.js', () => ({
  isCodexAccount: (account: string) => ['codex', 'yt'].includes(account),
  runCodexStream: (...args: unknown[]) => { f.codex(...args); return (async function* () { yield* f.events })() },
}))
vi.mock('../memory.js', () => ({ saveConversationTurn: f.memory }))
vi.mock('../db.js', () => ({ getSession: f.getSession, setSession: f.setSession, saveQueryUsage: f.usage }))
vi.mock('../media.js', () => ({ downloadFromUrl: f.download, esDocumento: (file: string) => file.endsWith('.pdf'), buildAttachmentMessage: (file: string) => file.endsWith('.pdf') ? `Read file ${file}` : `Read image ${file}`, validarAdjunto: (url: string) => url.startsWith('https://') ? null : 'invalid URL' }))
vi.mock('../file-attach.js', () => ({ extractFileMarkers: f.markers, stageAttachment: f.stage }))
vi.mock('../security.js', () => ({ validateUrl: (url: string) => url.startsWith('https://') ? null : 'invalid URL' }))
// Apertura y Live simulados: permiten verificar que un slash command llega sin prefijos ni sufijos.
vi.mock('../cabina/llegado.js', () => ({ loQueLlego: async () => [], bloqueApertura: () => 'APERTURA-SINTETICA' }))
vi.mock('../live/runtime.js', () => ({ liveToolbox: () => ({}), liveStore: () => ({ begin: () => {}, end: () => {} }) }))
vi.mock('../live/capability.js', () => ({ registerLiveCapability: () => ({ file: '/tmp/cap.json', close: () => {} }) }))
vi.mock('../live/capa-rapida.js', () => ({ acuseDe: () => null, capaRapidaActiva: () => false, capaRapidaEsfuerzoActiva: () => false, clasificarLive: async () => null, esfuerzoParaOpus: () => null, LIVE_DOS_CAPAS_CONTEXT: '' }))
import { executeChatJob, esSlashCommand, type ChatJobInput } from './chat-job.js'
import { JobRejected } from './supervisor.js'
let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:'); vi.clearAllMocks()
  f.markers.mockImplementation((text: string) => ({ cleanText: text, paths: [] }))
  f.stage.mockResolvedValue({ localPath: '/frozen/file', storageKey: 'key', filename: 'file' })
  f.getSession.mockReturnValue(undefined)
  f.download.mockResolvedValue('/synthetic/image.png')
  f.events = [{ type: 'init', sessionId: 'native-thread' }, { type: 'native_turn', threadId: 'native-thread', turnId: 'native-turn', account: 'codex' }, { type: 'text_delta', text: 'hello' }, { type: 'result', text: 'hello', terminalReason: 'completed' }]
})
afterEach(() => db.close())
const input: ChatJobInput = { message: 'hello', source: 'desktop', overrides: { model: null, effort: null, fast: false, ultracode: false } }
function turn(account = 'codex', patch: Partial<ChatJobInput> = {}) {
  const journal = new ChatJournal(db)
  const id = { owner: 'owner', account, conversationId: 'chat', turnId: 'turn' }
  journal.accept(id, { ...input, ...patch }); journal.claim(id, 'worker')
  return { journal, id, record: journal.get(id)! }
}

describe('persisted chat envelope execution', () => {
  it('marks the turn waiting while a question is pending and running again once it is answered', async () => {
    const t = turn('default'); t.journal.transition(t.id, 'running')
    const seen: string[] = []
    f.events = [{ type: 'init', sessionId: 's' }, { type: 'ask_user_question', requestId: 'q-1', questions: [] }, { type: 'question_resolved', requestId: 'q-1', outcome: 'answered' }, { type: 'result', text: 'ok' }]
    await executeChatJob(t.journal, t.record, (e: unknown) => { const type = (e as { type: string }).type; if (type === 'ask_user_question' || type === 'question_resolved') seen.push(`${type}:${t.journal.get(t.id)!.status}`) }, new AbortController().signal)
    expect(seen).toEqual(['ask_user_question:waiting', 'question_resolved:running'])
    expect(t.journal.activeTurns('owner')[0]?.status).toBe('running')
  })
  it('passes the accepted native selection unchanged through the durable worker', async () => {
    const codexSelection = { model: 'gpt-6-astra', effort: 'ultra', serviceTier: 'priority' }
    const t = turn('codex', { codexSelection })
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(f.codex.mock.calls[0][9]).toEqual(codexSelection)
  })
  it('starts a fresh Claude process for first-message edits and journals late observations', async () => {
    f.getSession.mockReturnValue('old-claude-thread')
    f.rewind.mockResolvedValueOnce({ found: true, checkpointUuid: undefined })
    const t = turn('default', { editOriginalText: 'first message' })
    f.events = [{ type: 'init', sessionId: 'new-claude-thread' }, { type: 'native_turn', threadId: 'new-claude-thread', turnId: 'turn', account: 'default' }, { type: 'result', text: 'replacement' }]
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    const args = f.claude.mock.calls[0]
    expect(args[1]).toBeUndefined(); expect(args[8]).toBeUndefined()
    expect(args[10]).toMatchObject({ freshSession: true, scope: t.id })
    expect(f.setSession).toHaveBeenCalledWith('owner:chat::default', 'new-claude-thread')
    args[10].onBackground({ type: 'message', turnId: 'turn', message: { type: 'system', subtype: 'task_notification', task_id: 'task' } })
    expect(t.journal.providerObservations(t.id)).toHaveLength(1)
  })
  it('binds native IDs early and produces a full delivery without an HTTP request', async () => {
    const t = turn(); const events: unknown[] = []
    const result = await executeChatJob(t.journal, t.record, e => events.push(e), new AbortController().signal)
    expect(t.journal.get(t.id)).toMatchObject({ nativeThreadId: 'native-thread', nativeTurnId: 'native-turn' })
    expect(f.setSession).toHaveBeenCalledWith('owner:chat::codex', 'native-thread')
    expect(result).toMatchObject({ status: 'completed', snapshot: { text: 'hello' }, payload: { ownerId: 'owner', account: 'codex', turnId: 'turn', assistantMessage: 'hello' } })
    expect(f.codex).toHaveBeenCalledTimes(1); expect(f.claude).not.toHaveBeenCalled()
  })
  it('sends native image paths to OpenAI and text context to Claude', async () => {
    const t = turn('bro', { imageUrl: 'https://synthetic.test/image', context: 'context' })
    f.events = [{ type: 'init', sessionId: 'native-thread' }, { type: 'result', text: 'done' }]
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(f.claude.mock.calls[0][0]).toContain('Read image /synthetic/image.png')
    expect(f.claude.mock.calls[0][0]).toContain('[Context: context]')
    expect(f.claude.mock.calls[0][7]).toBe('bro'); expect(f.codex).not.toHaveBeenCalled()
  })
  it('documents reach Codex as a path in the text, never as a native image; images stay native', async () => {
    f.download.mockImplementation(async (url: string) => url.endsWith('.pdf') ? '/synthetic/web-1-estado.pdf' : '/synthetic/image.png')
    const t = turn('codex', { imageUrl: 'https://synthetic.test/image.png\nhttps://synthetic.test/chat-1-ab12-estado.pdf', message: 'cuadra esto' })
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(f.codex.mock.calls[0][0]).toContain('Read file /synthetic/web-1-estado.pdf\n\ncuadra esto')
    expect(f.codex.mock.calls[0][0]).not.toContain('Read image')
    expect(f.codex.mock.calls[0][5]).toEqual(['/synthetic/image.png'])
  })
  it('Claude reads every attachment by path, separated from the message', async () => {
    f.download.mockImplementation(async (url: string) => url.endsWith('.pdf') ? '/synthetic/web-1-estado.pdf' : '/synthetic/image.png')
    const t = turn('bro', { imageUrl: 'https://synthetic.test/image.png\nhttps://synthetic.test/chat-1-ab12-estado.pdf', message: 'cuadra esto' })
    f.events = [{ type: 'init', sessionId: 'native-thread' }, { type: 'result', text: 'done' }]
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(f.claude.mock.calls[0][0]).toContain('Read image /synthetic/image.png\n\nRead file /synthetic/web-1-estado.pdf\n\ncuadra esto')
  })
  it('requests a native fork and persists parent provenance before the edited turn runs', async () => {
    f.getSession.mockReturnValue('old-thread')
    const t = turn('codex', { editOriginalText: 'old' })
    f.events.unshift({ type: 'native_branch', parentThreadId: 'old-thread', beforeTurnId: 'old-turn', threadId: 'native-thread' })
    const seen: unknown[] = []
    const result = await executeChatJob(t.journal, t.record, (_event, snapshot) => { if (snapshot) seen.push(snapshot) }, new AbortController().signal)
    expect(f.codex.mock.calls[0][8]).toEqual({ originalText: 'old', occurrenceFromEnd: 1 })
    expect(seen[0]).toMatchObject({ branch: { parentThreadId: 'old-thread', beforeTurnId: 'old-turn', threadId: 'native-thread' } })
    expect(result.snapshot).toMatchObject({ branch: { parentThreadId: 'old-thread' } })
  })
  it('distinguishes preflight rejection from ambiguous native execution', async () => {
    const t = turn('codex', { imageUrl: 'not-a-url' })
    await expect(executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)).rejects.toBeInstanceOf(JobRejected)
    expect(f.codex).not.toHaveBeenCalled()
  })
  it('edits a preserved older branch using its scoped journal identity', async () => {
    const t = turn('codex', { editOriginalText: 'old message', editTurnId: 'old-app-turn' })
    const old = { ...t.id, turnId: 'old-app-turn' }
    t.journal.accept(old, { ...input, message: 'old message' })
    t.journal.bindNative(old, 'original-branch', 'original-native-turn')
    f.getSession.mockReturnValue('newer-branch')
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(f.codex.mock.calls[0][1]).toBe('original-branch')
    expect(f.codex.mock.calls[0][8]).toEqual({ originalText: 'old message', occurrenceFromEnd: 1, nativeTurnId: 'original-native-turn' })
  })
  it('keeps the current native session when a forked replacement is never accepted', async () => {
    f.getSession.mockReturnValue('parent')
    const t = turn('codex', { editOriginalText: 'old' })
    f.events = [{ type: 'native_branch', parentThreadId: 'parent', beforeTurnId: 'old', threadId: 'child' }, { type: 'init', sessionId: 'child' }, { type: 'error', message: 'turn rejected' }]
    const result = await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(result.status).toBe('failed')
    expect(f.setSession).not.toHaveBeenCalled()
    expect(t.journal.get(t.id)?.nativeThreadId).toBe('child')
  })
  it('rejects unresolved explicit edit identity rather than selecting a matching text', async () => {
    const t = turn('codex', { editOriginalText: 'same', editTurnId: 'unknown' })
    await expect(executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)).rejects.toBeInstanceOf(JobRejected)
    expect(f.codex).not.toHaveBeenCalled()
  })
  it('does not issue a completed delivery after transport uncertainty', async () => {
    const t = turn()
    f.events = [{ type: 'error', message: 'connection lost', uncertain: true }]
    await expect(executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)).rejects.toThrow('incierto')
    expect(f.codex).toHaveBeenCalledTimes(1)
  })
  it('preserves partial output and failed status without treating it as success', async () => {
    const t = turn()
    f.events = [{ type: 'text_delta', text: 'partial' }, { type: 'native_update', update: { type: 'terminal', status: 'failed', error: 'quota' } }, { type: 'error', message: 'quota' }]
    const result = await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(result).toMatchObject({ status: 'failed', payload: { assistantMessage: 'partial', terminalStatus: 'failed', error: 'quota' } })
  })
  it('stages attachments for delivery retries without losing the completed model result', async () => {
    const t = turn()
    f.markers.mockReturnValue({ cleanText: 'hello', paths: ['/file'] })
    const result = await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(result).toMatchObject({ status: 'completed', payload: { stagedAttachments: [{ localPath: '/frozen/file' }] } })
    expect(f.stage).toHaveBeenCalledWith('/file', 'turn')
  })
  it('preserves completion with a visible artifact error if a file cannot be staged', async () => {
    const t = turn()
    f.markers.mockReturnValue({ cleanText: 'hello', paths: ['/missing'] }); f.stage.mockRejectedValueOnce(new Error('file missing'))
    const result = await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(result).toMatchObject({ status: 'completed', snapshot: { artifactErrors: ['file missing'] }, payload: { assistantMessage: expect.stringContaining('hello') } })
  })

  it('retains a confirmed completion and usage when auxiliary indexes fail', async () => {
    const t = turn()
    f.usage.mockImplementationOnce(() => { throw new Error('usage index unavailable') })
    f.memory.mockRejectedValueOnce(new Error('memory index unavailable'))
    f.events.splice(1, 0, { type: 'usage', inputTokens: 20, outputTokens: 5, costUsd: 0, durationMs: 100, numTurns: 1 })
    const result = await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    expect(result).toMatchObject({ status: 'completed', payload: { assistantMessage: 'hello', usage: { inputTokens: 20 }, runtimeSnapshot: { persistenceWarnings: [expect.stringContaining('uso'), expect.stringContaining('memoria')] } } })
    expect(f.codex).toHaveBeenCalledTimes(1)
  })

})

it('a requested cancellation with an SDK abort error is interrupted, not failed',async()=>{
 const t=turn('bro'),ac=new AbortController()
 f.events=[{type:'init',sessionId:'native-thread'},{type:'error',message:'Abortado.'}]
 const result=await executeChatJob(t.journal,t.record,e=>{if((e as {type?:string}).type==='error')ac.abort()},ac.signal)
 expect(result.status).toBe('interrupted');expect(f.memory).not.toHaveBeenCalled()
})
it('a late cancellation does not erase an already confirmed result',async()=>{
 const t=turn('bro'),ac=new AbortController()
 f.events=[{type:'init',sessionId:'native-thread'},{type:'result',text:'Confirmed result',terminalReason:'completed'}]
 const result=await executeChatJob(t.journal,t.record,e=>{if((e as {type?:string}).type==='result')ac.abort()},ac.signal)
 expect(result.status).toBe('completed');expect(result.snapshot).toMatchObject({text:'Confirmed result'})
})

describe('slash commands llegan al CLI empezando con «/» (19 oct 2026, «/compact» llegó como texto)', () => {
  const cron = '## Reporte diario (2026-10-19T11:31)\n☀️ Lunes 19 oct.'
  const run = async (patch: Partial<ChatJobInput>) => {
    const t = turn('default', patch)
    f.events = [{ type: 'init', sessionId: 's' }, { type: 'result', text: 'ok' }]
    await executeChatJob(t.journal, t.record, () => {}, new AbortController().signal)
    return f.claude.mock.calls[0][0] as string
  }
  it('«/compact» con contexto de cron no vacío llega exacto, sin [Context:] ni apertura', async () => {
    expect(await run({ message: '/compact', context: cron })).toBe('/compact')
  })
  it('«/alguna-skill args» con contexto de cron llega exacto y conserva sus argumentos', async () => {
    expect(await run({ message: '  /alguna-skill revisa el lanzamiento  ', context: cron, clientContext: 'cliente' })).toBe('/alguna-skill revisa el lanzamiento')
  })
  it('un comando en modo Live no recibe el bloque LIVE_CONTEXT', async () => {
    expect(await run({ message: '/compact', context: cron, liveWorkspace: true })).toBe('/compact')
  })
  it('un mensaje normal sigue recibiendo el contexto de cron y la apertura', async () => {
    const prompt = await run({ message: 'hola Levy', context: cron })
    expect(prompt.startsWith(`[Context: ${cron}]\n\nhola Levy`)).toBe(true)
    expect(prompt).toContain('APERTURA-SINTETICA')
  })
  it('una ruta o un texto que no es comando no se trata como slash command', () => {
    expect(esSlashCommand('/Users/usuario/archivo.md revisa')).toBe(false)
    expect(esSlashCommand('hola /compact')).toBe(false)
    expect(esSlashCommand('/compact')).toBe(true)
    expect(esSlashCommand('/plugin:skill a b')).toBe(true)
  })
})
