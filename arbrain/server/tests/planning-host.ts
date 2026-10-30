// Isolated HTTP mount of the production handler. No scheduler, DB, agent worker
// or notification process is initialized by this test server.
import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { handlePlanning } from '../src/planning-http.js'
import { readEnvFile } from '../src/env.js'

const token = readEnvFile(['OPENCLAW_GATEWAY_TOKEN']).OPENCLAW_GATEWAY_TOKEN
if (!token) throw new Error('Missing local gateway credential')
const expected = Buffer.from(`Bearer ${token}`)
createServer(async (req, res) => {
  const supplied = Buffer.from(req.headers.authorization ?? '')
  res.setHeader('Content-Type', 'application/json')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return
  }
  if (req.method !== 'POST' || req.url !== '/planning') {
    res.writeHead(404); res.end(JSON.stringify({ error: 'Only the isolated planning handler is mounted.' })); return
  }
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 100_000) { res.writeHead(413); res.end('{}'); return }
  }
  try {
    const result = await handlePlanning(JSON.parse(raw))
    res.writeHead(result.status); res.end(JSON.stringify(result.body))
  } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })) }
}).listen(3437, '127.0.0.1', () => console.log('Isolated production planning handler: 127.0.0.1:3437'))
