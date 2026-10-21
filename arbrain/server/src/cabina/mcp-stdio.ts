/**
 * Servidor MCP por stdio de la Cabina (JSON-RPC delimitado por líneas).
 *
 * Por qué stdio y no `createSdkMcpServer`: el pool de procesos de Claude firma
 * la configuración con JSON.stringify para decidir si reutiliza el proceso de
 * una conversación. Un servidor en proceso mete una instancia viva en esa
 * firma; una config stdio es JSON puro, estable entre turnos, y cada proceso
 * de Claude levanta su propio hijo sin compartir estado.
 */
import { createInterface } from 'node:readline'
import { cabinaToolsVisibles, ejecutarCabina } from './tools.js'

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

const send = (payload: Record<string, unknown>) => { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...payload }) + '\n') }

export async function handle(msg: Msg): Promise<Record<string, unknown> | null> {
  const { id, method, params } = msg
  if (id === undefined || id === null) return null // notificación: no se responde
  if (method === 'initialize') {
    return { id, result: { protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'cabina', version: '1.0.0' } } }
  }
  if (method === 'ping') return { id, result: {} }
  if (method === 'tools/list') return { id, result: { tools: cabinaToolsVisibles() } }
  if (method === 'tools/call') {
    const r = await ejecutarCabina(String(params?.name ?? ''), params?.arguments)
    // El pizarrón devuelve también imágenes (la foto del trazo de Daniel): Levy las VE.
    return { id, result: { content: [{ type: 'text', text: r.text }, ...(r.imagenes ?? []).map(i => ({ type: 'image', data: i.data, mimeType: i.mimeType }))], isError: !!r.error } }
  }
  return { id, error: { code: -32601, message: `Método no soportado: ${method}` } }
}

if (process.argv[1] && /mcp-stdio\.(js|ts)$/.test(process.argv[1])) {
  const rl = createInterface({ input: process.stdin })
  rl.on('line', line => {
    if (!line.trim()) return
    let msg: Msg
    try { msg = JSON.parse(line) } catch { send({ id: null, error: { code: -32700, message: 'JSON inválido' } }); return }
    void handle(msg).then(reply => { if (reply) send(reply) })
  })
  rl.on('close', () => process.exit(0))
}
