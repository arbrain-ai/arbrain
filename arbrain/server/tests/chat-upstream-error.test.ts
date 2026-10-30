import { expect, it } from 'vitest'
import { upstreamError } from '../../src/lib/claudeclaw'

it('identifies a rejected bridge credential without blaming provider login or leaking upstream data', async () => {
  const response = await upstreamError(new Response('private upstream body', { status: 401 }), 'selección')
  expect(response.status).toBe(502)
  const data = await response.json()
  expect(data.code).toBe('DAEMON_AUTH_FAILED')
  expect(data.error).toContain('credencial del puente')
  expect(JSON.stringify(data)).not.toContain('private upstream body')
})

it('preserves provider/runtime errors other than bridge authorization', async () => {
  const response = await upstreamError(new Response(JSON.stringify({error:'Account quota exhausted'}), {status:429}), 'chat')
  expect(response.status).toBe(429)
  expect(await response.json()).toEqual({error:'Account quota exhausted'})
})
