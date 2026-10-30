import { beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { ChatJournal } from '../src/chat-runtime/journal'
import { freezeChatContext } from '../src/chat-runtime/chat-envelope'
const f = vi.hoisted(() => ({
  // El correo de la persona dueña sale de la configuración de la instalación (arbrain/src/config), no del código.
  correo: '',
  user: null as { id: string; email: string } | null,
  role: 'owner', sessions: [] as Array<Record<string, unknown>>, reads: [] as string[],
  fetch: vi.fn(), host: vi.fn(),
  history: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: f.user } }) } }) }))
vi.mock('@/lib/auth-utils', () => ({ getUserRole: async () => f.role, hasRole: async () => ['owner', 'admin'].includes(f.role) }))
vi.mock('@/lib/claudeclaw', () => ({ getClaudeclawUrl: f.host, CLAUDECLAW_TOKEN: 'synthetic', upstreamError: () => new Response('upstream failed', { status: 503 }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({
  from(table: string) {
    f.reads.push(table)
    const filters = new Map<string, unknown>()
    const query = {
      select() { return query }, eq(k: string, v: unknown) { filters.set(k, v); return query },
      order() { return query }, limit() { return query },
      async maybeSingle() {
        const rows = table === 'profiles' ? [{ id: 'daniel', email: f.correo, role: 'owner' }] : f.sessions
        return { data: rows.find(row => [...filters].every(([k, v]) => row[k] === v || (k === 'id' && typeof v === 'string' && /^[a-f0-9-]{36}$/i.test(v) && typeof row[k] === 'string' && row[k].toLowerCase() === v.toLowerCase()))) ?? null, error: null }
      },
      then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: table === 'chat_messages' ? f.history : [], error: null }).then(resolve) },
    }
    return query
  },
}) }))
import { instalacion } from '../../src/config'
import { LOCAL_DESKTOP_USER_ID } from '../../src/lib/desktop-auth'
import { POST as stream } from '../../src/app/api/chat/stream/route'
import { GET as models } from '../../src/app/api/chat/models/route'
import { GET as model } from '../../src/app/api/chat/model/route'
import { GET as efforts } from '../../src/app/api/chat/efforts/route'
import { GET as selection } from '../../src/app/api/chat/selection/route'
import { POST as recover } from '../../src/app/api/chat/turn/route'
import { POST as interrupt } from '../../src/app/api/chat/interrupt/route'
import { POST as live } from '../../src/app/api/chat/live/route'
import { POST as title } from '../../src/app/api/chat/title/route'

beforeEach(() => {
  f.correo = instalacion().correoDueno
  f.user = { id: 'daniel', email: f.correo }; f.role = 'owner'; f.reads = []
  f.history = []
  f.sessions = [{ id: 'chat', profile_id: 'daniel', account: 'codex' }]
  f.host.mockReset().mockResolvedValue('http://synthetic-host')
  f.fetch.mockReset().mockImplementation(async () => new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', f.fetch)
})
const send = (body: unknown) => stream(new Request('http://arbrain.test/api/chat/stream', { method: 'POST', body: JSON.stringify(body) }))
const forwarded = () => JSON.parse(f.fetch.mock.calls[0][1].body)

describe('real chat proxy route authorization and routing', () => {
  it('rejects unauthenticated requests before any host discovery', async () => {
    f.user = null
    const get = (name: string) => new Request(`http://arbrain.test/api/chat/${name}`)
    const post = (name: string) => new Request(`http://arbrain.test/api/chat/${name}`, { method: 'POST', body: JSON.stringify({ message: 'synthetic', chatSessionId: 'chat', sessionId: 'chat', account: 'codex' }) })
    for (const response of [await selection(get('selection')), await model(get('model')), await models(get('models')), await efforts(get('efforts')), await stream(post('stream')), await live(post('live')), await recover(post('turn')), await interrupt(post('interrupt'))]) expect(response.status).toBe(401)
    expect(f.host).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled()
  })

  it('scopes effort discovery to the owned conversation and its provider account', async () => {
    f.fetch.mockResolvedValueOnce(Response.json({ efforts: [{ value: 'ultra' }], current: 'ultra' }))
    const response = await efforts(new Request('http://arbrain.test/api/chat/efforts?session=chat&account=codex'))
    expect(response.status).toBe(200)
    const url = new URL(f.fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/efforts'); expect(url.searchParams.get('account')).toBe('codex'); expect(url.searchParams.get('ownerId')).toBe('daniel'); expect(url.searchParams.get('verifiedConversation')).toBe('1')
    f.fetch.mockClear()
    const rejected = await efforts(new Request('http://arbrain.test/api/chat/efforts?session=chat&account=yt'))
    expect(rejected.status).toBe(409); expect(f.fetch).not.toHaveBeenCalled()
  })
  it('authorizes selection discovery before host access and forwards captured intent unchanged', async () => {
    const intent = { version: 1, owner: 'daniel', account: 'codex', conversationId: 'chat', model: 'gpt-6-astra', effort: 'ultra', fast: false, ultracode: false, observedAt: '2026-09-07T02:00:00Z' }
    f.fetch.mockResolvedValueOnce(Response.json({ intent }))
    const response = await selection(new Request('http://arbrain.test/api/chat/selection?session=chat&account=codex&ownerId=forged'))
    expect(await response.json()).toEqual({ intent })
    const url = new URL(f.fetch.mock.calls[0][0]); expect(url.pathname).toBe('/selection'); expect(url.searchParams.get('ownerId')).toBe('daniel')
    f.fetch.mockClear(); f.host.mockClear()
    expect((await selection(new Request('http://arbrain.test/api/chat/selection?session=chat&account=yt'))).status).toBe(409)
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.host).not.toHaveBeenCalled()
    await send({ message: 'offline', chatSessionId: 'chat', intent })
    expect(forwarded().intent).toEqual(intent)
    expect(forwarded().verifiedConversation).toBe(true)
  })
  it('does not trust client legacy-migration claims for native or sessionless controls', async () => {
    for (const session of ['', 'sdk:native']) {
      f.fetch.mockClear(); f.fetch.mockResolvedValueOnce(Response.json({ intent: null }))
      const response = await selection(new Request(`http://arbrain.test/api/chat/selection?session=${session}&verifiedConversation=1&account=codex`))
      expect(response.status).toBe(200)
      const url = new URL(f.fetch.mock.calls[0][0]); expect(url.searchParams.has('verifiedConversation')).toBe(false)
      expect(url.searchParams.get('verifiedNativeOwner')).toBe(session ? '1' : null)
      f.fetch.mockClear()
      await send({ message: 'hello', ...(session ? { chatSessionId: session } : {}), account: 'codex', verifiedConversation: true })
      expect(forwarded().verifiedConversation).toBe(false)
      expect(forwarded().verifiedNativeOwner).toBe(!!session)
    }
  })
  it('does not grant native legacy adoption to an admin who is not the personal owner', async () => {
    f.user = { id: 'other-admin', email: 'admin@example.test' }; f.role = 'admin'
    const response = await selection(new Request('http://arbrain.test/api/chat/selection?session=sdk:native&account=bro&verifiedNativeOwner=1'))
    expect(response.status).toBe(403)
    expect((await send({ message: 'hello', chatSessionId: 'sdk:native', account: 'bro', verifiedNativeOwner: true })).status).toBe(403)
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.host).not.toHaveBeenCalled()
  })
  it('uses the authorized canonical conversation ID consistently for GET and POST controls', async () => {
    const canonical = 'abcdef00-1111-4222-8333-444444444444'
    f.sessions = [{ id: canonical, profile_id: 'daniel', account: 'codex' }]
    f.fetch.mockResolvedValueOnce(Response.json({ intent: null }))
    await selection(new Request(`http://arbrain.test/api/chat/selection?session=${canonical.toUpperCase()}&account=codex`))
    expect(new URL(f.fetch.mock.calls[0][0]).searchParams.get('session')).toBe(canonical)
    f.fetch.mockClear()
    await send({ message: '/model gpt-6-astra', chatSessionId: canonical.toUpperCase(), account: 'codex' })
    expect(forwarded()).toMatchObject({ chatSessionId: canonical, verifiedConversation: true })
  })
  it('keeps the title compatibility endpoint local without another provider call', async () => {
    const response = await title(new Request('http://arbrain.test/api/chat/title', { method: 'POST', body: JSON.stringify({ message: 'Mi conversación desde el teléfono' }) }))
    expect(await response.json()).toEqual({ title: 'Mi conversación desde el teléfono', source: 'local' })
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('resolves missing account from the conversation and ignores forged owner/native overrides', async () => {
    const response = await send({ message: 'hola', chatSessionId: 'chat', ownerId: 'other', sdkSessionId: 'foreign-thread' })
    expect(response.status).toBe(200)
    expect(forwarded()).toMatchObject({ ownerId: 'daniel', account: 'codex', chatSessionId: 'chat' })
    expect(forwarded()).not.toHaveProperty('sdkSessionId')
  })
  it('rejects wrong account before inference or reading the conversation content', async () => {
    expect((await send({ message: 'hola', chatSessionId: 'chat', account: 'yt' })).status).toBe(409)
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.reads).not.toContain('chat_messages')
  })
  it('rejects a different owner even if the requester has admin role', async () => {
    f.user = { id: 'admin', email: 'admin@example.test' }; f.role = 'admin'
    expect((await send({ message: 'hola', chatSessionId: 'chat' })).status).toBe(404)
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.reads).not.toContain('chat_messages')
  })
  it('resolves the authenticated desktop principal to Daniel and preserves legacy null-owned chats', async () => {
    f.user = { id: LOCAL_DESKTOP_USER_ID, email: f.correo }
    f.sessions = [{ id: 'chat', profile_id: null, account: 'yt' }]
    expect((await send({ message: 'hola', chatSessionId: 'chat' })).status).toBe(200)
    expect(forwarded()).toMatchObject({ ownerId: 'daniel', account: 'yt' })
  })
  it('does not read private rows without authentication', async () => {
    f.user = null
    expect((await send({ message: 'hola', chatSessionId: 'chat' })).status).toBe(401)
    expect(f.reads).toEqual([]); expect(f.fetch).not.toHaveBeenCalled()
  })
  it('scopes resume to the same persisted owner and account', async () => {
    // Persisted scope wins; a client that sends a different account is rejected
    // (chat-access-policy 409) instead of being silently re-routed.
    expect((await live(new Request('http://arbrain.test/api/chat/live', { method: 'POST', body: JSON.stringify({ chatSessionId: 'chat', ownerId: 'other', account: 'yt' }) }))).status).toBe(409)
    expect(f.fetch).not.toHaveBeenCalled()
    expect((await live(new Request('http://arbrain.test/api/chat/live', { method: 'POST', body: JSON.stringify({ chatSessionId: 'chat', ownerId: 'other' }) }))).status).toBe(200)
    expect(forwarded()).toMatchObject({ ownerId: 'daniel', account: 'codex' })
  })
  it('preserves explicit turn identity and cursor on reconnect and rejects malformed cursors', async () => {
    const request = (body: unknown) => new Request('http://arbrain.test/api/chat/live', { method: 'POST', body: JSON.stringify(body) })
    expect((await live(request({ chatSessionId: 'chat', turnId: 'old-turn', cursor: 31 }))).status).toBe(200)
    expect(forwarded()).toMatchObject({ turnId: 'old-turn', cursor: 31, ownerId: 'daniel', account: 'codex' })
    f.fetch.mockClear()
    expect((await live(request({ chatSessionId: 'chat', cursor: -1 }))).status).toBe(400)
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('resolves the model picker account server-side', async () => {
    f.fetch.mockResolvedValueOnce(Response.json({ models: [] }))
    expect((await models(new Request('http://arbrain.test/api/chat/models?session=chat'))).status).toBe(200)
    const url = new URL(f.fetch.mock.calls[0][0])
    expect(url.searchParams.get('account')).toBe('codex')
    expect(url.searchParams.get('ownerId')).toBe('daniel')
  })
  it('forwards scoped snapshot/cursor recovery without executing a prompt', async () => {
    f.fetch.mockResolvedValueOnce(Response.json({ turn: { status: 'running' }, events: [], nextCursor: 25 }))
    const response = await recover(new Request('http://arbrain.test/api/chat/turn', { method: 'POST', body: JSON.stringify({ chatSessionId: 'chat', turnId: 'turn', cursor: 25, account: 'yt' }) }))
    expect(response.status).toBe(200)
    expect(forwarded()).toEqual({ chatSessionId: 'chat', turnId: 'turn', cursor: 25, account: 'codex', ownerId: 'daniel' })
    expect(f.fetch.mock.calls[0][0]).toBe('http://synthetic-host/chat/turn')
  })
  it('requires a conversation for interrupt instead of aborting all sessions', async () => {
    expect((await interrupt(new Request('http://arbrain.test/api/chat/interrupt', { method: 'POST', body: '{}' }))).status).toBe(400)
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('preserves cancellation receipts and conflicts without claiming execution stopped', async () => {
    const request = () => new Request('http://arbrain.test/api/chat/interrupt', { method: 'POST', body: JSON.stringify({ sessionId: 'chat', turnId: 'pending-turn', ownerId: 'forged', account: 'yt' }) })
    const receipt = { ok: true, cancellationRequested: true, turnId: 'pending-turn', status: 'running', terminal: false }
    f.fetch.mockResolvedValueOnce(Response.json(receipt))
    const response = await interrupt(request())
    expect(await response.json()).toEqual(receipt)
    expect(forwarded()).toEqual({ sessionId: 'chat', turnId: 'pending-turn', account: 'codex', ownerId: 'daniel' })
    f.fetch.mockResolvedValueOnce(Response.json({ ok: false, error: 'Turn conflict' }, { status: 409 }))
    expect((await interrupt(request())).status).toBe(409)
  })
  it('rejects an offline envelope after an identity change before any inference', async () => {
    expect((await send({ message: 'hola', chatSessionId: 'chat', expectedOwnerId: 'other', acceptOnly: true, turnId: 'turn' })).status).toBe(409)
    expect(f.fetch).not.toHaveBeenCalled()
  })
  it('preserves durable acceptance receipts as JSON instead of disguising them as streams', async () => {
    f.fetch.mockResolvedValueOnce(Response.json({ accepted: true, turnId: 'turn' }, { status: 202 }))
    const response = await send({ message: 'hola', chatSessionId: 'chat', expectedOwnerId: 'daniel', acceptOnly: true, turnId: 'turn' })
    expect(response.status).toBe(202)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(forwarded()).toMatchObject({ acceptOnly: true, ownerId: 'daniel', turnId: 'turn' })
    expect(await response.json()).toEqual({ accepted: true, turnId: 'turn' })
  })
  it('accepts a lost-ACK retry after history hints change but rejects changed client intent', async () => {
    const db = new Database(':memory:')
    const journal = new ChatJournal(db)
    const contexts: string[] = []
    f.fetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body)
      contexts.push(body.context)
      const identity = { owner: body.ownerId, account: body.account, conversationId: body.chatSessionId, turnId: body.turnId }
      const previous = journal.get(identity)?.input as { context?: string | null } | undefined
      try {
        journal.accept(identity, { message: body.message, ...freezeChatContext(body, previous) })
        return Response.json({ accepted: true, turnId: body.turnId }, { status: 202 })
      } catch { return Response.json({ error: 'Turn conflict' }, { status: 409 }) }
    })
    try {
      const envelope = { message: 'hola', chatSessionId: 'chat', expectedOwnerId: 'daniel', acceptOnly: true, turnId: 'retry-turn', context: 'client context' }
      f.history = [{ content: 'first hint', metadata: { source: 'cron' }, created_at: '2026-09-06' }]
      expect((await send(envelope)).status).toBe(202)
      f.history = [{ content: 'changed hint', metadata: { source: 'cron' }, created_at: '2026-09-06' }]
      expect((await send(envelope)).status).toBe(202)
      expect(contexts[0]).not.toBe(contexts[1])
      expect((await send({ ...envelope, context: 'different intent' })).status).not.toBe(202)
      expect(journal.get({ owner: 'daniel', account: 'codex', conversationId: 'chat', turnId: 'retry-turn' })?.input).toMatchObject({ clientContext: 'client context', context: expect.stringContaining('first hint') })
    } finally { db.close() }
  })

})
