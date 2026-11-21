/**
 * MCP «editor» de Levy (stdio, 19 nov 2026): las herramientas de dirección de Arbrain (herramientas.ts) más una selección
 * de las de Scarlet, que se piden a un hijo `bin/mcp-levy <proyecto>` (el MCP de Scarlet apuntado al motor). El MCP de Scarlet
 * es de UN proyecto por proceso: al cambiar el proyecto activo de la conversación, el hijo se reinicia con el nuevo.
 *
 * El proyecto activo vive por conversación en `<DIR_ARBRAIN>/editor/activo.json` (env ARBRAIN_EDITOR_CONVERSACION, estable
 * entre turnos para no romper la firma del pool). Sin elección, el proyecto del motor tocado más recientemente.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { DIR_ARBRAIN } from '../edicion.js'
import { DUENO } from '../dueno.js'
import { anotarBitacora, emitirEditor, esperarAcuses, informe } from '../cabina/panel-bus.js'
import { HERRAMIENTAS_EDITOR, INGESTA, NOMBRES_EDITOR, SCARLET_VISIBLES, ejecutarEditor, proyectoMasReciente, type Contexto } from './herramientas.js'
import { clienteMotor, MOTOR_DIR } from './motor.js'

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }
type Herramienta = { name: string; description?: string; inputSchema?: unknown }

const CONVERSACION = process.env.ARBRAIN_EDITOR_CONVERSACION || 'sin-conversacion'
const ARCHIVO_ACTIVO = () => path.join(DIR_ARBRAIN(), 'editor', 'activo.json')
const TODAS = process.env.EDITOR_MCP_TODAS === '1'

function leerActivos(): Record<string, string> { try { return JSON.parse(readFileSync(ARCHIVO_ACTIVO(), 'utf8')) as Record<string, string> } catch { return {} } }
function guardarActivo(p: string) {
  const todos = leerActivos(); todos[CONVERSACION] = p
  // Solo las 200 conversaciones más recientes (el orden de inserción de un objeto JSON es estable).
  const claves = Object.keys(todos); for (const k of claves.slice(0, Math.max(0, claves.length - 200))) delete todos[k]
  mkdirSync(path.dirname(ARCHIVO_ACTIVO()), { recursive: true })
  const tmp = `${ARCHIVO_ACTIVO()}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(todos)); renameSync(tmp, ARCHIVO_ACTIVO())
}

const motor = clienteMotor()

/** El MCP de Scarlet como hijo, para un proyecto. */
class Scarlet {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pend = new Map<number, (m: Msg) => void>()
  private sig = 1
  private listo: Promise<void> | null = null
  proyecto: string | null = null
  herramientas: Herramienta[] | null = null

  async asegurar(proyecto: string): Promise<void> {
    if (this.proc && this.proyecto === proyecto && this.listo) return this.listo
    this.cerrar()
    this.proyecto = proyecto
    const proc = spawn(path.join(MOTOR_DIR(), 'bin/mcp-levy'), [proyecto], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, SCARLET_AGENT: 'claude' } })
    this.proc = proc
    proc.stderr.resume()
    createInterface({ input: proc.stdout }).on('line', l => {
      let m: Msg; try { m = JSON.parse(l) as Msg } catch { return }
      if (typeof m.id === 'number' && this.pend.has(m.id)) { this.pend.get(m.id)!(m); this.pend.delete(m.id) }
    })
    proc.on('exit', () => { if (this.proc === proc) { this.proc = null; this.listo = null; for (const r of this.pend.values()) r({ error: { message: 'El MCP de Scarlet se cerró.' } }); this.pend.clear() } })
    proc.on('error', () => { /* lo atrapa `exit` o el timeout de la petición */ })
    this.listo = (async () => {
      await this.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'arbrain-editor', version: '1.0.0' } }, 20_000)
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    })()
    return this.listo
  }

  pedir(method: string, params: unknown, esperaMs = 600_000): Promise<Msg> {
    const proc = this.proc
    if (!proc) return Promise.reject(new Error('El MCP de Scarlet no está corriendo.'))
    const id = this.sig++
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pend.delete(id); reject(new Error(`Scarlet no respondió ${method} en ${Math.round(esperaMs / 1000)} s.`)) }, esperaMs)
      this.pend.set(id, m => { clearTimeout(t); resolve(m) })
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  cerrar() { if (this.proc) { try { this.proc.kill() } catch { /* ya salió */ } } this.proc = null; this.listo = null }
}

const scarlet = new Scarlet()

async function activo(): Promise<string | undefined> {
  const elegido = leerActivos()[CONVERSACION]
  if (elegido) return elegido
  try { return proyectoMasReciente((await motor<{ projects: { id: string; updatedAt?: string; createdAt?: string }[] }>('GET', '/projects')).projects) } catch { return undefined }
}

export const contexto: Contexto = {
  motor,
  activo,
  elegir: p => { guardarActivo(p); if (scarlet.proyecto !== p) scarlet.cerrar() },
  lanzarIngesta: (carpeta, conPase) => {
    const log = path.join(homedir(), 'Library/Logs/editor-ingesta.log')
    mkdirSync(path.dirname(log), { recursive: true })
    const fd = openSync(log, 'a')
    const hijo = spawn('/opt/homebrew/bin/python3', [INGESTA(), carpeta, ...(conPase ? [] : ['--sin-pase'])], { detached: true, stdio: ['ignore', fd, fd], cwd: carpeta })
    hijo.unref()
    return { pid: hijo.pid, log }
  },
  abrir: async (proyecto, titulo) => {
    const conv = CONVERSACION === 'sin-conversacion' ? undefined : CONVERSACION
    const { comando, objetivos, destino, versionVieja } = emitirEditor(proyecto, titulo, conv)
    if (versionVieja) {
      anotarBitacora({ evento: 'editor-version-vieja', comando: comando.id, proyecto })
      return { confirmado: false, text: `NO abierto: la app de ${DUENO} es de una versión que todavía no sabe abrir el editor (se instala sola en reposo). Dale el enlace /editor${proyecto ? `?proyecto=${proyecto}` : ''} o espera la actualización.` }
    }
    const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos), Date.now(), undefined, destino)
    if (!r.confirmado) anotarBitacora({ evento: 'editor-sin-confirmar', comando: comando.id, proyecto, detalle: r.text })
    return r
  },
}

/** Las de Scarlet que se ofrecen (todas con EDITOR_MCP_TODAS=1). Sin motor o sin proyecto: ninguna, quedan las de Arbrain. */
async function herramientasScarlet(): Promise<Herramienta[]> {
  if (scarlet.herramientas) return scarlet.herramientas
  const p = await activo()
  if (!p) return []
  try {
    await scarlet.asegurar(p)
    const r = await scarlet.pedir('tools/list', {}, 20_000)
    const ts = ((r.result as { tools?: Herramienta[] })?.tools ?? []).filter(t => TODAS || SCARLET_VISIBLES.has(t.name)).filter(t => !NOMBRES_EDITOR.has(t.name))
    scarlet.herramientas = ts
    return ts
  } catch { return [] }
}

export async function handle(msg: Msg): Promise<Record<string, unknown> | null> {
  const { id, method, params } = msg
  if (id === undefined || id === null) return null
  if (method === 'initialize') return { id, result: { protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'editor', version: '1.0.0' } } }
  if (method === 'ping') return { id, result: {} }
  if (method === 'tools/list') return { id, result: { tools: [...HERRAMIENTAS_EDITOR, ...(await herramientasScarlet())] } }
  if (method === 'tools/call') {
    const nombre = String(params?.name ?? '')
    if (NOMBRES_EDITOR.has(nombre)) {
      const r = await ejecutarEditor(nombre, params?.arguments, contexto)
      return { id, result: { content: [{ type: 'text', text: r.text }], isError: !!r.error } }
    }
    try {
      const p = await activo()
      if (!p) throw new Error('No hay proyecto en el editor: créalo con crear_desde_toma.')
      await scarlet.asegurar(p)
      const r = await scarlet.pedir('tools/call', params)
      if (r.error) return { id, result: { content: [{ type: 'text', text: `Scarlet: ${JSON.stringify(r.error).slice(0, 500)}` }], isError: true } }
      return { id, result: r.result }
    } catch (e) {
      return { id, result: { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true } }
    }
  }
  return { id, error: { code: -32601, message: `Método no soportado: ${method}` } }
}

if (process.argv[1] && /editor\/mcp-stdio\.(js|ts)$/.test(process.argv[1])) {
  const send = (payload: Record<string, unknown>) => { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...payload }) + '\n') }
  const rl = createInterface({ input: process.stdin })
  // En orden: una elección de proyecto vale para la llamada que viene detrás (el SDK puede mandar varias juntas).
  let cola: Promise<void> = Promise.resolve()
  rl.on('line', line => {
    if (!line.trim()) return
    let m: Msg
    try { m = JSON.parse(line) as Msg } catch { send({ id: null, error: { code: -32700, message: 'JSON inválido' } }); return }
    cola = cola.then(() => handle(m)).then(reply => { if (reply) send(reply) }, e => { if (m.id != null) send({ id: m.id, error: { code: -32603, message: String(e) } }) })
  })
  rl.on('close', () => { void cola.finally(() => { scarlet.cerrar(); process.exit(0) }) })
}
