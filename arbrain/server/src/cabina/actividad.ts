/**
 * Actividad viva de un subagente sin pantalla (7 oct 2026, pedido de Daniel: «me gustaba esa sensación de entrar y
 * verlo trabajando… ahora se siente estático»).
 *
 * Desde el 6 oct los subagentes no tienen PTY: su stdout de eventos JSON queda en la bitácora
 * (`~/.config/arbrain/subagentes/<id>.jsonl`). `harness/` la resume para Levy (texto, nombres de herramientas,
 * fin). Aquí se lee lo que un humano vería en una terminal: cada comando con su salida, cada archivo que toca,
 * lo que dice y cuándo está pensando. Lectura incremental por offset: la app pide «desde» y recibe solo lo nuevo.
 *
 * Proveedor agnóstico: claude y qwen (stream-json), codex (exec --json y app-server), opencode; gemini y cualquier
 * otro caen al adaptador común (texto y nombre de herramienta).
 */
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { adaptador } from './harness/index.js'
import { json, num, obj, str } from './harness/tipos.js'

export type Paso =
  | { k: 'encargo'; texto: string; n: number }
  | { k: 'entrada'; texto: string }
  | { k: 'texto'; texto: string; sub?: boolean }
  /** `id` enlaza con su resultado y su progreso, que pueden llegar en otra lectura. */
  | { k: 'herramienta'; id: string; nombre: string; que: string; detalle: string; cambio?: { quita: number; pone: number }; sub?: boolean }
  | { k: 'resultado'; id: string; ok: boolean; salida: string; lineas: number; codigo?: number }
  | { k: 'progreso'; id: string; seg: number }
  | { k: 'pensando'; tokens: number }
  | { k: 'fin'; codigo: number; detenido?: boolean }
  | { k: 'error'; texto: string }

const SALIDA_LINEAS = 14, SALIDA_CHARS = 1800, TEXTO_CHARS = 4000

const corto = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s
const lineasDe = (s: string) => s ? s.split('\n').length : 0
const casa = (s: string) => s.split(homedir()).join('~')
/** La cola de una salida, como la vería quien mira la terminal al final. */
export function cola(s: string): string {
  const l = s.replace(/\r/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\n')
  while (l.length && !l.at(-1)!.trim()) l.pop()
  const t = l.slice(-SALIDA_LINEAS).join('\n')
  return t.length > SALIDA_CHARS ? '…' + t.slice(-SALIDA_CHARS) : t
}

const VERBO: Record<string, string> = {
  Bash: 'Corre', Read: 'Lee', Write: 'Escribe', Edit: 'Edita', MultiEdit: 'Edita', NotebookEdit: 'Edita', Grep: 'Busca', Glob: 'Busca archivos',
  WebFetch: 'Abre', WebSearch: 'Busca en la web', Task: 'Lanza un agente', Agent: 'Lanza un agente', Skill: 'Carga la skill', TodoWrite: 'Anota pendientes',
  ToolSearch: 'Busca herramientas', Monitor: 'Vigila', LSP: 'Consulta el código',
}

/** Herramienta + entrada → verbo legible y el detalle que importa (comando, archivo, patrón…). */
export function describir(nombre: string, input: Record<string, unknown>): { que: string; detalle: string; cambio?: { quita: number; pone: number } } {
  const s = (k: string) => str(input[k]) ?? ''
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(nombre)
  const que = VERBO[nombre] ?? (mcp ? `${mcp[2].replace(/_/g, ' ')}` : nombre)
  switch (nombre) {
    case 'Bash': return { que: s('description') || que, detalle: s('command') }
    case 'Read': return { que, detalle: s('file_path') + (input.offset ? ` (desde ${num(input.offset)})` : '') }
    case 'Write': return { que, detalle: s('file_path'), cambio: { quita: 0, pone: lineasDe(s('content')) } }
    case 'Edit': return { que, detalle: s('file_path'), cambio: { quita: lineasDe(s('old_string')), pone: lineasDe(s('new_string')) } }
    case 'MultiEdit': {
      const ed = Array.isArray(input.edits) ? input.edits.map(obj) : []
      return { que, detalle: s('file_path'), cambio: { quita: ed.reduce((a, e) => a + lineasDe(str(e.old_string) ?? ''), 0), pone: ed.reduce((a, e) => a + lineasDe(str(e.new_string) ?? ''), 0) } }
    }
    case 'NotebookEdit': return { que, detalle: s('notebook_path') }
    case 'Grep': return { que, detalle: [s('pattern'), s('path') || s('glob')].filter(Boolean).join('  en ') }
    case 'Glob': return { que, detalle: s('pattern') }
    case 'WebFetch': return { que, detalle: s('url') }
    case 'WebSearch': return { que, detalle: s('query') }
    case 'Task': case 'Agent': return { que, detalle: s('description') || s('prompt').split('\n')[0] }
    case 'Skill': return { que, detalle: s('skill') || s('name') }
    case 'TodoWrite': { const t = Array.isArray(input.todos) ? input.todos.map(obj) : []; return { que, detalle: t.map(x => `${x.status === 'completed' ? '✓' : x.status === 'in_progress' ? '›' : '·'} ${str(x.content) ?? ''}`).join('\n') } }
    default: {
      // MCP y herramientas sin traducción: la entrada compacta, sin valores enormes.
      const partes = Object.entries(input).filter(([, v]) => v != null && v !== '').slice(0, 4).map(([k, v]) => `${k}: ${typeof v === 'string' ? corto(v.replace(/\s+/g, ' '), 80) : corto(JSON.stringify(v), 80)}`)
      return { que, detalle: partes.join(' · ') }
    }
  }
}

const textoDeContenido = (c: unknown): string => typeof c === 'string' ? c
  : Array.isArray(c) ? c.map(obj).map(b => b.type === 'text' ? str(b.text) ?? '' : b.type === 'image' ? '[imagen]' : '').filter(Boolean).join('\n') : ''

/** Read devuelve el archivo entero: en la vista basta cuántas líneas leyó. */
const nombres = new Map<string, string>()

// ── claude / qwen: stream-json ──
function pasosClaude(d: Record<string, unknown>): Paso[] {
  const sub = typeof d.parent_tool_use_id === 'string' && !!d.parent_tool_use_id
  if (d.type === 'system' && d.subtype === 'thinking_tokens') return [{ k: 'pensando', tokens: num(d.estimated_tokens) }]
  if (d.type === 'tool_progress') { const id = str(d.parent_tool_use_id) ?? str(d.tool_use_id); return id ? [{ k: 'progreso', id, seg: num(d.elapsed_time_seconds) }] : [] }
  if (d.type === 'assistant') {
    const bloques = Array.isArray(obj(d.message).content) ? (obj(d.message).content as unknown[]).map(obj) : []
    const out: Paso[] = []
    for (const b of bloques) {
      if (b.type === 'text') { const t = (str(b.text) ?? '').trim(); if (t) out.push({ k: 'texto', texto: corto(t, TEXTO_CHARS), ...(sub ? { sub } : {}) }) }
      else if (b.type === 'thinking') out.push({ k: 'pensando', tokens: 0 })
      else if (b.type === 'tool_use') {
        const id = str(b.id) ?? '', nombre = str(b.name) ?? 'herramienta'
        nombres.set(id, nombre); if (nombres.size > 2000) nombres.delete(nombres.keys().next().value!)
        out.push({ k: 'herramienta', id, nombre, ...describir(nombre, obj(b.input)), ...(sub ? { sub } : {}) })
      }
    }
    if (typeof d.error === 'string' && d.error && !out.some(p => p.k === 'texto')) out.push({ k: 'error', texto: d.error })
    return out
  }
  if (d.type === 'user') {
    const c = obj(d.message).content
    if (!Array.isArray(c)) return []
    return c.map(obj).filter(b => b.type === 'tool_result').map((b): Paso => {
      const id = str(b.tool_use_id) ?? '', texto = textoDeContenido(b.content)
      const esRead = nombres.get(id) === 'Read'
      return { k: 'resultado', id, ok: b.is_error !== true, salida: esRead && b.is_error !== true ? '' : cola(texto), lineas: lineasDe(texto) }
    })
  }
  if (d.type === 'result' && (d.is_error === true || (d.subtype && d.subtype !== 'success'))) return [{ k: 'error', texto: str(d.result) || String(d.subtype ?? 'error') }]
  return []
}

// ── codex: exec --json y app-server (JSON-RPC) ──
/** `/bin/zsh -lc "cmd"` → `cmd`: lo que el agente escribió, no la envoltura. */
export const sinEnvoltura = (c: string) => {
  const m = /^\/bin\/(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(c.trim())
  return m ? (m[1] === '"' ? m[2].replace(/\\(["\\$`])/g, '$1') : m[2].replace(/'\\''/g, "'")) : c
}
function pasosCodexItem(it: Record<string, unknown>, fase: 'inicio' | 'fin'): Paso[] {
  const tipo = String(it.type), id = str(it.id) ?? ''
  if (tipo === 'command_execution' || tipo === 'commandExecution') {
    const comando = sinEnvoltura(str(it.command) ?? '')
    const her: Paso = { k: 'herramienta', id, nombre: 'Bash', que: 'Corre', detalle: comando }
    if (fase === 'inicio') return [her]
    const salida = str(it.aggregated_output) ?? str(it.aggregatedOutput) ?? ''
    const codigo = typeof it.exit_code === 'number' ? it.exit_code : typeof it.exitCode === 'number' ? it.exitCode : undefined
    // app-server a veces solo avisa al completar: la herramienta se emite igual (el cliente ignora un id repetido)
    return [her, { k: 'resultado', id, ok: codigo == null || codigo === 0, salida: cola(salida), lineas: lineasDe(salida), ...(codigo != null ? { codigo } : {}) }]
  }
  if (tipo === 'file_change' || tipo === 'fileChange') {
    const cambios = Array.isArray(it.changes) ? it.changes.map(obj) : []
    const detalle = cambios.map(c => `${str(c.kind) ?? str(obj(c.kind).type) ?? ''} ${str(c.path) ?? ''}`.trim()).join('\n')
    const her: Paso = { k: 'herramienta', id, nombre: 'Edit', que: 'Edita', detalle }
    return fase === 'inicio' ? [her] : [her, { k: 'resultado', id, ok: it.status !== 'failed', salida: '', lineas: 0 }]
  }
  if (tipo === 'mcp_tool_call' || tipo === 'mcpToolCall') {
    const her: Paso = { k: 'herramienta', id, nombre: str(it.tool) ?? 'mcp', ...describir(str(it.tool) ?? 'mcp', obj(it.arguments)) }
    return fase === 'inicio' ? [her] : [her, { k: 'resultado', id, ok: it.status !== 'failed' && !it.error, salida: '', lineas: 0 }]
  }
  if (tipo === 'web_search' || tipo === 'webSearch') { const her: Paso = { k: 'herramienta', id, nombre: 'WebSearch', que: 'Busca en la web', detalle: str(it.query) ?? '' }; return fase === 'inicio' ? [her] : [her, { k: 'resultado', id, ok: true, salida: '', lineas: 0 }] }
  if (tipo === 'reasoning') return fase === 'inicio' ? [{ k: 'pensando', tokens: 0 }] : []
  if ((tipo === 'agent_message' || tipo === 'agentMessage') && fase === 'fin') { const t = (str(it.text) ?? '').trim(); return t ? [{ k: 'texto', texto: corto(t, TEXTO_CHARS) }] : [] }
  if (tipo === 'todo_list' && fase === 'fin') {
    const items = Array.isArray(it.items) ? it.items.map(obj) : []
    return [{ k: 'herramienta', id, nombre: 'TodoWrite', que: 'Anota pendientes', detalle: items.map(x => `${x.completed ? '✓' : '·'} ${str(x.text) ?? ''}`).join('\n') }]
  }
  return []
}
function pasosCodex(d: Record<string, unknown>): Paso[] {
  if (d.type === 'item.started') return pasosCodexItem(obj(d.item), 'inicio')
  if (d.type === 'item.completed') return pasosCodexItem(obj(d.item), 'fin')
  if (d.type === 'turn.failed') return [{ k: 'error', texto: str(obj(d.error).message) ?? 'el turno falló' }]
  if (d.method === 'item/started') return pasosCodexItem(obj(obj(d.params).item), 'inicio')
  if (d.method === 'item/completed') return pasosCodexItem(obj(obj(d.params).item), 'fin')
  if (d.method === 'turn/completed' && obj(obj(d.params).turn).status === 'failed') return [{ k: 'error', texto: str(obj(obj(obj(d.params).turn).error).message) ?? 'el turno falló' }]
  return []
}

// ── opencode: cada tool_use llega ya completo ──
function pasosOpencode(d: Record<string, unknown>): Paso[] {
  const part = obj(d.part)
  if (d.type === 'text') { const t = (str(part.text) ?? '').trim(); return t ? [{ k: 'texto', texto: corto(t, TEXTO_CHARS) }] : [] }
  if (d.type === 'reasoning') return [{ k: 'pensando', tokens: 0 }]
  if (d.type === 'tool_use') {
    const id = str(part.callID) ?? str(part.id) ?? '', nombre = str(part.tool) ?? 'herramienta', st = obj(part.state), input = obj(st.input)
    const NOMBRE: Record<string, string> = { bash: 'Bash', read: 'Read', write: 'Write', edit: 'Edit', grep: 'Grep', glob: 'Glob', webfetch: 'WebFetch', todowrite: 'TodoWrite' }
    const canon = NOMBRE[nombre] ?? nombre
    const entrada = { ...input, ...(input.filePath ? { file_path: input.filePath } : {}), ...(input.oldString != null ? { old_string: input.oldString, new_string: input.newString } : {}) }
    const out: Paso[] = [{ k: 'herramienta', id, nombre: canon, ...describir(canon, entrada) }]
    if (st.status === 'completed' || st.status === 'error') { const s = str(st.output) ?? str(st.error) ?? ''; out.push({ k: 'resultado', id, ok: st.status === 'completed', salida: canon === 'Read' ? '' : cola(s), lineas: lineasDe(s) }) }
    return out
  }
  if (d.type === 'error') { const er = obj(d.error); return [{ k: 'error', texto: str(obj(er.data).message) ?? str(er.name) ?? 'error' }] }
  return []
}

/** Una línea de la bitácora → pasos. Las marcas de Arbrain valen para todos los harness. */
export function pasosDeLinea(harness: string, linea: string, n: { turno: number }): Paso[] {
  const d = json(linea)
  if (!d) return []
  if (typeof d.arbrain === 'string') {
    if (d.arbrain === 'inicio') { n.turno += 1; return [{ k: 'encargo', texto: str(d.texto) ?? '', n: n.turno }] }
    if (d.arbrain === 'entrada' && d.entregado === true && str(d.texto)) return [{ k: 'entrada', texto: str(d.texto)! }]
    if (d.arbrain === 'salida') return [{ k: 'fin', codigo: num(d.codigo), ...(d.detenido === true ? { detenido: true } : {}) }]
    if (d.arbrain === 'error') return [{ k: 'error', texto: str(d.mensaje) ?? 'error del pastor' }]
    return []
  }
  if (harness === 'claude' || harness === 'qwen') return pasosClaude(d)
  if (harness === 'codex') return pasosCodex(d)
  if (harness === 'opencode') return pasosOpencode(d)
  // Cualquier otro CLI: lo que su adaptador ya sabe leer.
  const e = adaptador(harness)?.leerEvento(linea)
  if (!e) return []
  const out: Paso[] = []
  if (e.texto) out.push({ k: 'texto', texto: corto(e.texto, TEXTO_CHARS) })
  if (e.herramienta) out.push({ k: 'herramienta', id: `${harness}-${Math.random().toString(36).slice(2, 10)}`, nombre: e.herramienta, que: VERBO[e.herramienta] ?? e.herramienta, detalle: '' })
  if (e.error) out.push({ k: 'error', texto: e.error })
  return out
}

/** Pensar emite cientos de eventos seguidos: se funden en uno (el último, con su cuenta). */
export function fundir(pasos: Paso[]): Paso[] {
  const out: Paso[] = []
  for (const p of pasos) {
    const ult = out.at(-1)
    if (p.k === 'pensando' && ult?.k === 'pensando') { out[out.length - 1] = { k: 'pensando', tokens: Math.max(ult.tokens, p.tokens) }; continue }
    if (p.k === 'progreso') { let i = out.length - 1; while (i >= 0 && !(out[i].k === 'progreso' && (out[i] as { id: string }).id === p.id)) i--; if (i >= 0) { out[i] = p; continue } }
    out.push(p)
  }
  return out
}

export interface Lectura { pasos: Paso[]; offset: number; recortado: boolean; turnoBase: number }

/** Primera lectura: solo la cola (una bitácora de horas pesa cientos de MB). Las siguientes: desde `offset`. */
const COLA_BYTES = 3 * 1024 * 1024, TANDA_BYTES = 4 * 1024 * 1024, PRIMEROS_PASOS = 400

export async function leerActividad(ruta: string, harness: string, desde: number | null, tachar: (s: string) => string, turnoBase = 0): Promise<Lectura> {
  let f
  try { f = await open(ruta, 'r') } catch { return { pasos: [], offset: 0, recortado: false, turnoBase } }
  try {
    const { size } = await f.stat()
    // offset más allá del tamaño = la bitácora se rehízo: empezar de nuevo por la cola
    const inicial = desde == null || desde > size
    let inicio = inicial ? Math.max(0, size - COLA_BYTES) : desde
    const fin = Math.min(size, inicio + TANDA_BYTES)
    if (fin <= inicio) return { pasos: [], offset: inicio, recortado: false, turnoBase }
    const buf = Buffer.alloc(fin - inicio)
    const { bytesRead } = await f.read(buf, 0, buf.length, inicio)
    let texto = buf.subarray(0, bytesRead).toString('utf8')
    const recortado = inicial && inicio > 0
    let base = turnoBase
    if (recortado) {
      // contar los turnos de antes del recorte sería leer todo; se cuentan las marcas «inicio» del principio
      base = await contarInicios(f, inicio)
      const nl = texto.indexOf('\n'); inicio += nl + 1; texto = texto.slice(nl + 1)
    }
    // solo líneas completas: la última puede estar a medio escribir
    const ultimoNl = texto.lastIndexOf('\n')
    if (ultimoNl < 0) return { pasos: [], offset: inicio, recortado, turnoBase: base }
    const completo = texto.slice(0, ultimoNl + 1)
    const n = { turno: base }
    const pasos: Paso[] = []
    for (const l of completo.split('\n')) if (l.trim()) pasos.push(...pasosDeLinea(harness, l, n))
    let limpios = fundir(pasos).map(p => limpiar(p, tachar))
    if (inicial && limpios.length > PRIMEROS_PASOS) limpios = limpios.slice(-PRIMEROS_PASOS)
    return { pasos: limpios, offset: inicio + Buffer.byteLength(completo, 'utf8'), recortado: recortado || (inicial && pasos.length > PRIMEROS_PASOS), turnoBase: n.turno }
  } finally { await f.close() }
}

/** Marcas de turno antes del recorte: grep barato de `"arbrain":"inicio"` por bloques. */
async function contarInicios(f: import('node:fs/promises').FileHandle, hasta: number): Promise<number> {
  let n = 0, pos = 0, resto = ''
  const b = Buffer.alloc(4 * 1024 * 1024)
  while (pos < hasta) {
    const { bytesRead } = await f.read(b, 0, Math.min(b.length, hasta - pos), pos)
    if (!bytesRead) break
    pos += bytesRead
    const t = resto + b.subarray(0, bytesRead).toString('latin1')
    n += t.split('{"arbrain":"inicio"').length - 1
    resto = t.slice(-20)
  }
  return n
}

function limpiar(p: Paso, tachar: (s: string) => string): Paso {
  const t = (s: string) => casa(tachar(s))
  switch (p.k) {
    case 'encargo': case 'entrada': case 'texto': case 'error': return { ...p, texto: t(p.texto) }
    case 'herramienta': return { ...p, detalle: t(p.detalle), que: t(p.que) }
    case 'resultado': return { ...p, salida: t(p.salida) }
    default: return p
  }
}
