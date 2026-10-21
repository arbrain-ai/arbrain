/**
 * Lo que trabaja para Daniel DENTRO de los turnos de Levy: los subagentes internos del
 * SDK (herramienta Agent/Task, eventos con `parent_tool_use_id`), sus comandos en segundo
 * plano (Bash con run_in_background) y los workflows. Pedido de Daniel (1 oct, 08:20):
 * «una sola lista para todo lo que trabaja para Daniel, corra donde corra». El panel y la
 * vista «trabajos» los leen junto a las terminales del motor (`trabajos()` en `cuerpo.ts`).
 *
 * Fuente: el ciclo de vida que el SDK ya emite (`task_started`, `task_progress`,
 * `task_updated`, `task_notification`) y que `agent.ts` reenvía; se observa en
 * `chat-runtime/chat-job.ts` (en el turno y en el buzón de fondo), sin tocar `agent.ts`.
 *
 * Durable en `~/.config/arbrain/internos.json`: el turno puede correr en otro proceso que
 * el que sirve `/cabina`, y un reinicio del agent-server no debe borrar lo que pasó hoy.
 * Una tarea «trabajando» cuyo proceso dueño ya no existe se muestra como detenida.
 */
import { DIR_ARBRAIN } from '../edicion.js'
import { readFileSync } from 'node:fs'
import { access, mkdir, readdir, readFile, realpath, open, stat, writeFile, rename } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { cierresRecientes, type Cierres } from './internos-cierre.js'
import { carpetasClaude } from '../cuentas-alternas.js'

export type TipoInterna = 'subagente' | 'comando' | 'workflow' | 'otra'
export type EstadoInterna = 'trabajando' | 'completada' | 'falló' | 'detenida'
export interface TareaInterna {
  id: string; tipo: TipoInterna; descripcion: string; detalle?: string
  estado: EstadoInterna; segundoPlano?: boolean; desde: string; actualizado: string; fin?: string
  resumen?: string; ultimaHerramienta?: string; tokens?: number; usos?: number; duracionMs?: number
  /** Lo que hace AHORA, tal como lo anuncia el SDK («Running Run typecheck»). Va aparte del título:
   *  `descripcion` es la tarea con la que se lanzó y no se reescribe (2 oct 2026). */
  actividad?: string
  /** Id del modelo (p. ej. `claude-sonnet-5-5`) leído de la transcripción del subagente; sin transcripción, sin dato. */
  modelo?: string
  /** Tokens en contexto en su última llamada (transcripción); se calcula al leer, no se guarda. */
  contexto?: number
  /** Archivo de salida que escribe el CLI (comandos y agentes en segundo plano). */
  salida?: string
  /** Lo que devolvió un subagente en primer plano (su tool_result), recortado. */
  resultado?: string
  conversacion: string; turno: string; toolUseId?: string
  /** Id de la tarea-subagente que la lanzó (SDK `parent_task_id`, 14 oct 2026): un comando de fondo es un
   *  PROCESO de ese agente, no otro agente. Ausente = la lanzó Levy desde el hilo principal (o registro viejo). */
  padre?: string
  /** PID del proceso que la observó: si ya no vive, la tarea murió con él. */
  pid: number; nota?: string
}

const archivo = () => join(DIR_ARBRAIN(), 'internos.json')
const DIA_MS = 24 * 3600_000
const MAX = 80

export function tipoDe(taskType?: string, subagentType?: string): TipoInterna {
  if (taskType === 'local_bash') return 'comando'
  if (taskType === 'local_workflow') return 'workflow'
  if (taskType === 'local_agent' || taskType === 'remote_agent' || (!taskType && subagentType)) return 'subagente'
  return taskType ? 'otra' : 'subagente'
}

const ESTADO_SDK: Record<string, EstadoInterna> = { completed: 'completada', failed: 'falló', stopped: 'detenida', killed: 'detenida', running: 'trabajando', pending: 'trabajando', paused: 'trabajando' }
const recorta = (s: unknown, n: number) => typeof s === 'string' ? s.slice(0, n) : undefined
/** Claude Code anuncia dónde escribe la salida de lo que mandó a segundo plano. */
export function rutaDeSalida(texto: unknown): string | undefined {
  if (typeof texto !== 'string') return undefined
  return /(\/[^\s'"`]+\/tasks\/[A-Za-z0-9_.-]+\.output)\b/.exec(texto)?.[1]
}

// ── Estado en memoria del proceso que observa + escritura diferida al archivo ──
let tareas: Map<string, TareaInterna> | null = null
let porToolUse = new Map<string, string>()
let pendiente: NodeJS.Timeout | null = null
let escribiendo: Promise<void> = Promise.resolve()

function cargar(): Map<string, TareaInterna> {
  if (tareas) return tareas
  tareas = new Map()
  try { for (const t of JSON.parse(readFileSync(archivo(), 'utf8')) as TareaInterna[]) tareas.set(t.id, t) } catch { /* primera vez */ }
  porToolUse = new Map([...tareas.values()].flatMap(t => t.toolUseId ? [[t.toolUseId, t.id] as [string, string]] : []))
  return tareas
}

function podar(l: TareaInterna[]): TareaInterna[] {
  const corte = Date.now() - DIA_MS
  // El tope recorta solo lo terminado: lo que sigue trabajando no lo desplazan los comandos cortos (2 oct).
  const orden = (a: TareaInterna, b: TareaInterna) => Date.parse(a.desde) - Date.parse(b.desde)
  const hoy = l.filter(t => Date.parse(t.actualizado) >= corte)
  return [...hoy.filter(t => t.estado === 'trabajando'), ...hoy.filter(t => t.estado !== 'trabajando').sort(orden).slice(-MAX)].sort(orden)
}

function programarEscritura() {
  if (pendiente) return
  pendiente = setTimeout(() => {
    pendiente = null
    const l = podar([...cargar().values()])
    escribiendo = escribiendo.then(async () => {
      try {
        await mkdir(dirname(archivo()), { recursive: true })
        const tmp = `${archivo()}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify(l, null, 1)); await rename(tmp, archivo())
      } catch { /* la vista es ayuda; nunca tumba un turno */ }
    })
  }, 400)
  pendiente.unref?.()
}

/** Para pruebas y para cerrar limpio. */
export async function vaciar(): Promise<void> {
  if (pendiente) { clearTimeout(pendiente); pendiente = null; const l = podar([...cargar().values()]); await mkdir(dirname(archivo()), { recursive: true }); await writeFile(archivo(), JSON.stringify(l, null, 1)) }
  await escribiendo
}
export function olvidarEnMemoria() { tareas = null; porToolUse = new Map() }

function poner(id: string, cambio: Partial<TareaInterna>, base?: () => TareaInterna) {
  const m = cargar()
  const previa = m.get(id) ?? base?.()
  if (!previa) return
  m.set(id, { ...previa, ...Object.fromEntries(Object.entries(cambio).filter(([, v]) => v !== undefined)), actualizado: new Date().toISOString() })
  programarEscritura()
}

interface Contexto { conversationId: string; turnId: string }

/** 2 oct 2026 (Daniel: «los títulos no son descriptivos»): el título es la descripción con la que Levy
 *  lanzó la tarea, la primera que llega en `task_started`. Después el SDK reescribe `description` en
 *  cada `task_progress` / `task_updated` con la última acción («Running Typecheck arbrain»): eso es la
 *  ACTIVIDAD, no la tarea, y va en otro campo. Solo si la tarea nació sin descripción se adopta la primera. */
const SIN_TITULO = 'Tarea de Levy'
function descripcionNueva(id: string, d: unknown): Partial<TareaInterna> {
  const nueva = typeof d === 'string' ? d.trim().slice(0, 240) : ''
  if (!nueva) return {}
  const previa = cargar().get(id)
  if (!previa || previa.descripcion === SIN_TITULO) return { descripcion: nueva }
  return nueva === previa.descripcion ? {} : { actividad: nueva }
}

/** Eventos ya normalizados por `agent.ts` (SSEEvent `task_*` y `tool_result`). */
export function observarEvento(ctx: Contexto, e: Record<string, unknown>) {
  try {
    cargar() // primero: carga el mapa toolUse → tarea antes de tocarlo
    const tipo = e.type
    if (tipo === 'task_started' && typeof e.taskId === 'string') {
      const ahora = new Date().toISOString()
      const toolUseId = recorta(e.toolUseId, 120)
      if (toolUseId) porToolUse.set(toolUseId, e.taskId)
      poner(e.taskId, {}, () => ({
        id: e.taskId as string, tipo: tipoDe(e.taskType as string | undefined, e.subagentType as string | undefined),
        descripcion: recorta(e.description, 240) || 'Tarea de Levy', detalle: recorta(e.workflowName ?? e.subagentType, 60),
        estado: 'trabajando', desde: ahora, actualizado: ahora, conversacion: ctx.conversationId, turno: ctx.turnId, toolUseId, padre: recorta(e.parentTaskId, 120), pid: process.pid,
      }))
    } else if (tipo === 'task_progress' && typeof e.taskId === 'string') {
      poner(e.taskId, { resumen: recorta(e.summary, 240), ultimaHerramienta: recorta(e.lastToolName, 60), tokens: e.totalTokens as number | undefined, usos: e.toolUses as number | undefined, duracionMs: e.durationMs as number | undefined, ...descripcionNueva(e.taskId, e.description) })
    } else if (tipo === 'task_updated' && typeof e.taskId === 'string') {
      const estado = typeof e.status === 'string' ? ESTADO_SDK[e.status] : undefined
      poner(e.taskId, { estado, ...(estado && estado !== 'trabajando' ? { fin: new Date().toISOString() } : {}), nota: recorta(e.error, 240), ...descripcionNueva(e.taskId, e.description) })
    } else if (tipo === 'task_notification' && typeof e.taskId === 'string') {
      // El resumen de cierre trae el informe final del agente: se guarda largo (la lista lo recorta).
      poner(e.taskId, { estado: ESTADO_SDK[e.status as string] ?? 'completada', fin: new Date().toISOString(), resumen: recorta(e.summary, 1500), tokens: e.totalTokens as number | undefined, usos: e.toolUses as number | undefined, duracionMs: e.durationMs as number | undefined, salida: recorta(e.outputFile, 400) })
    } else if (tipo === 'tool_result' && typeof e.toolId === 'string') {
      const id = porToolUse.get(e.toolId)
      if (!id) return
      const texto = typeof e.content === 'string' ? e.content : JSON.stringify(e.content ?? '')
      const salida = rutaDeSalida(texto)
      const t = cargar().get(id)
      if (salida) poner(id, { salida, segundoPlano: true })
      else if (t && !t.segundoPlano) poner(id, { resultado: texto.slice(0, 4000) })
    }
  } catch { /* observar nunca rompe el turno */ }
}

/** Mensajes crudos del SDK que llegan por el buzón de fondo (después del turno). */
export function observarSDK(ctx: Contexto, m: Record<string, unknown>) {
  if (m.type !== 'system' || typeof m.task_id !== 'string') return
  const u = m.usage as { total_tokens?: number; tool_uses?: number; duration_ms?: number } | undefined
  if (m.subtype === 'task_started' && m.skip_transcript !== true && m.ambient !== true) observarEvento(ctx, { type: 'task_started', taskId: m.task_id, description: m.description, subagentType: m.subagent_type, taskType: m.task_type, workflowName: m.workflow_name, toolUseId: m.tool_use_id, parentTaskId: m.parent_task_id })
  else if (m.subtype === 'task_progress') observarEvento(ctx, { type: 'task_progress', taskId: m.task_id, description: m.description, summary: m.summary, lastToolName: m.last_tool_name, totalTokens: u?.total_tokens, toolUses: u?.tool_uses, durationMs: u?.duration_ms })
  else if (m.subtype === 'task_updated') { const p = m.patch as Record<string, unknown> | undefined; observarEvento(ctx, { type: 'task_updated', taskId: m.task_id, status: p?.status, description: p?.description, error: p?.error }) }
  else if (m.subtype === 'task_notification') observarEvento(ctx, { type: 'task_notification', taskId: m.task_id, status: m.status, summary: m.summary, totalTokens: u?.total_tokens, toolUses: u?.tool_uses, durationMs: u?.duration_ms, outputFile: m.output_file })
}

const vive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' } }

// ── Transcripción del subagente (2 oct 2026) ──
// El CLI guarda lo que hace cada subagente en `~/.claude/projects/<proyecto>/<sesión>/subagents/agent-<id>.jsonl`
// y, a su lado, `agent-<id>.meta.json` con la `description` con la que Levy lo lanzó. De ahí salen: el
// título (aunque el registro ya lo haya pisado la actividad), el modelo REAL (`message.model`), el contexto
// (`usage` del último mensaje), lo último que dijo y qué herramientas usó. Sin transcripción: sin dato.

/** Cuántos bytes de una transcripción se leen enteros; más allá se lee la cola y se avisa `parcial`. */
const MAX_TRANSCRIPCION = 8 * 1024 * 1024
const COLA_LISTA = 256 * 1024
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/

export interface AccionSubagente { herramienta: string; objetivo?: string }
export interface DetalleSubagente {
  /** El prompt con el que nació el subagente (su encargo completo). */
  encargo?: string
  /** Id del modelo del último mensaje del agente. */
  modelo?: string
  /** Tokens que tenía en contexto en su última llamada (entrada + caché). */
  contexto?: number
  /** Sus últimos mensajes de texto, del más viejo al más nuevo. */
  dicho: string[]
  /** Su último mensaje de texto: el informe final cuando ya terminó. */
  final?: string
  /** Herramientas usadas con su conteo, de más a menos. */
  herramientas: { nombre: string; n: number }[]
  usos: number
  /** Sus últimas acciones, legibles (la vista las traduce). */
  acciones: AccionSubagente[]
  /** La transcripción pasó del máximo: conteos y textos son de su tramo final. */
  parcial?: boolean
}

const una = (s: unknown, n: number) => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : ''

/** Qué hizo una herramienta, en una frase corta: el archivo, la búsqueda o la descripción del comando. */
function objetivoDe(nombre: string, input: unknown): string | undefined {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  let o = ''
  if (/^(Read|Edit|MultiEdit|Write|NotebookEdit)$/.test(nombre)) o = basename(typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : '')
  else if (nombre === 'Bash') o = una(i.description, 140) || una(i.command, 140)
  else if (nombre === 'Grep' || nombre === 'Glob') o = una(i.pattern, 100)
  else if (nombre === 'WebSearch') o = una(i.query, 100)
  else if (nombre === 'WebFetch') { try { o = new URL(String(i.url)).host } catch { o = '' } }
  else if (nombre === 'Agent' || nombre === 'Task') o = una(i.description, 100)
  else if (nombre === 'Skill') o = una(i.skill, 60)
  return o || undefined
}

function textoDeContenido(c: unknown): string {
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return (c as { type?: string; text?: string }[]).filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n')
}

/** Lee una transcripción .jsonl de subagente. Función pura: `cabeza` es el comienzo del archivo cuando
 *  `jsonl` es solo su cola (de ahí sale el encargo). */
export function analizarTranscripcion(jsonl: string, cabeza = jsonl): DetalleSubagente {
  const d: DetalleSubagente = { dicho: [], herramientas: [], usos: 0, acciones: [] }
  for (const linea of cabeza.split('\n', 60)) {
    if (!linea.startsWith('{') || !linea.includes('"user"')) continue
    try {
      const m = JSON.parse(linea) as { type?: string; message?: { content?: unknown } }
      if (m.type !== 'user') continue
      const t = textoDeContenido(m.message?.content).trim()
      if (t) d.encargo = t.slice(0, 3000)
      break // el primer mensaje de usuario es el encargo; si venía cortado no se adivina
    } catch { break }
  }
  const textos: string[] = []
  const cuenta = new Map<string, number>()
  for (const linea of jsonl.split('\n')) {
    if (!linea.startsWith('{') || !linea.includes('"assistant"')) continue
    try {
      const m = JSON.parse(linea) as { type?: string; message?: { model?: string; usage?: Record<string, number>; content?: unknown } }
      if (m.type !== 'assistant' || !m.message) continue
      const { model, usage, content } = m.message
      if (typeof model === 'string' && model && model !== '<synthetic>') d.modelo = model
      if (usage && typeof usage.input_tokens === 'number') {
        const c = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
        if (c > 0) d.contexto = c
      }
      if (!Array.isArray(content)) continue
      for (const b of content as { type?: string; text?: string; name?: string; input?: unknown }[]) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) textos.push(b.text.trim())
        else if (b.type === 'tool_use' && b.name) {
          cuenta.set(b.name, (cuenta.get(b.name) ?? 0) + 1); d.usos++
          d.acciones.push({ herramienta: b.name, objetivo: objetivoDe(b.name, b.input) })
        }
      }
    } catch { /* línea cortada */ }
  }
  d.dicho = textos.slice(-6).map(t => t.slice(0, 1200))
  d.final = textos.at(-1)?.slice(0, 4000)
  d.acciones = d.acciones.slice(-14)
  d.herramientas = [...cuenta].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
  return d
}

const permitida = (real: string) => raicesPermitidas().some(r => real.startsWith(r))

/** Dónde vive la transcripción de un subagente que no trae su archivo de salida: los proyectos de este
 *  repo en `~/.claude` y en la carpeta de la cuenta alterna. El id se valida: nunca arma una ruta con lo que no sea un id. */
async function buscarTranscripcion(id: string): Promise<string | null> {
  if (!ID_SEGURO.test(id)) return null
  const slugs = new Set([process.cwd(), dirname(process.cwd())].map(p => p.replace(/[^A-Za-z0-9]/g, '-')))
  for (const raiz of carpetasClaude().slice(0, 2)) for (const slug of slugs) {
    const proyecto = join(homedir(), raiz, 'projects', slug)
    for (const s of await readdir(proyecto, { withFileTypes: true }).catch(() => [])) {
      if (!s.isDirectory()) continue
      const f = join(proyecto, s.name, 'subagents', `agent-${id}.jsonl`)
      if (await access(f).then(() => true, () => false)) return f
    }
  }
  return null
}

const rutas = new Map<string, { ruta: string | null; hasta: number }>()
/** Transcripción de un subagente: por su archivo de salida (enlace del CLI) o buscándola. Lo hallado se
 *  recuerda; lo no hallado se reintenta cada 20 s (el agente puede estar arrancando). */
async function rutaTranscripcion(t: TareaInterna): Promise<string | null> {
  if (t.tipo !== 'subagente' || !ID_SEGURO.test(t.id)) return null
  const c = rutas.get(t.id)
  if (c && (c.ruta || c.hasta > Date.now())) return c.ruta
  let ruta: string | null = null
  if (t.salida) {
    const real = await realpath(t.salida).catch(() => null)
    if (real && real.endsWith('.jsonl') && permitida(real)) ruta = real
  }
  ruta ??= await buscarTranscripcion(t.id)
  rutas.set(t.id, { ruta, hasta: Date.now() + 20_000 })
  return ruta
}

const firmaDe = async (ruta: string) => { const s = await stat(ruta); return `${s.size}:${Math.round(s.mtimeMs)}` }
const acotar = <V>(m: Map<string, V>, max = 120) => { while (m.size > max) m.delete(m.keys().next().value as string) }

const metas = new Map<string, string | null>()
/** `description` del Agent call, de `agent-<id>.meta.json` (el título original, aunque el registro lo haya pisado). */
async function tituloOriginal(ruta: string): Promise<string | null> {
  const k = ruta
  if (metas.has(k)) return metas.get(k) ?? null
  let d: string | null = null
  try { const j = JSON.parse(await readFile(ruta.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as { description?: unknown }; d = typeof j.description === 'string' && j.description.trim() ? j.description.trim().slice(0, 240) : null } catch { /* sin meta */ }
  if (d || !metas.has(k)) metas.set(k, d); acotar(metas)
  return d
}

const ultimos = new Map<string, { firma: string; modelo?: string; contexto?: number }>()
/** Modelo y contexto de la última llamada del agente: solo la cola del archivo, y solo si cambió. */
async function ultimoUso(ruta: string): Promise<{ modelo?: string; contexto?: number }> {
  const firma = await firmaDe(ruta)
  const c = ultimos.get(ruta)
  if (c?.firma === firma) return c
  const fh = await open(ruta, 'r')
  try {
    const { size } = await fh.stat()
    const n = Math.min(size, COLA_LISTA), buf = Buffer.alloc(n)
    await fh.read(buf, 0, n, size - n)
    const { modelo, contexto } = analizarTranscripcion(buf.toString('utf8'), '')
    ultimos.set(ruta, { firma, modelo, contexto }); acotar(ultimos)
    return { modelo, contexto }
  } finally { await fh.close() }
}

/** La tarea tal como la ve la vista: con su título original, su modelo y su contexto cuando hay transcripción. */
async function enriquecer(t: TareaInterna): Promise<TareaInterna> {
  const ruta = await rutaTranscripcion(t).catch(() => null)
  if (!ruta) return t
  const out: TareaInterna = { ...t }
  try {
    const titulo = await tituloOriginal(ruta)
    if (titulo && titulo !== t.descripcion) {
      out.descripcion = titulo
      if (!t.actividad && t.descripcion !== SIN_TITULO) out.actividad = t.descripcion
    }
    const u = await ultimoUso(ruta)
    if (u.modelo) out.modelo = u.modelo
    if (u.contexto) out.contexto = u.contexto
  } catch { /* la transcripción es un extra: sin ella, lo del registro */ }
  return out
}

const detalles = new Map<string, { firma: string; det: DetalleSubagente }>()
async function detalleDe(ruta: string): Promise<DetalleSubagente> {
  const firma = await firmaDe(ruta)
  const c = detalles.get(ruta)
  if (c?.firma === firma) return c.det
  const fh = await open(ruta, 'r')
  try {
    const { size } = await fh.stat()
    const n = Math.min(size, MAX_TRANSCRIPCION), buf = Buffer.alloc(n)
    await fh.read(buf, 0, n, size - n)
    let texto = buf.toString('utf8'), cabeza = texto
    if (size > n) {
      const h = Buffer.alloc(Math.min(size, 256 * 1024)); await fh.read(h, 0, h.length, 0)
      cabeza = h.toString('utf8'); texto = texto.slice(texto.indexOf('\n') + 1)
    }
    const det = analizarTranscripcion(texto, cabeza)
    if (size > n) det.parcial = true
    detalles.set(ruta, { firma, det }); acotar(detalles, 30)
    return det
  } finally { await fh.close() }
}

/** Lectura para la vista: del archivo (la verdad compartida entre procesos). */
export async function internas(): Promise<TareaInterna[]> {
  let l: TareaInterna[] = []
  try { l = JSON.parse(await readFile(archivo(), 'utf8')) } catch { return [] }
  // lo que este proceso aún no escribe también cuenta
  if (tareas) { const m = new Map(l.map(t => [t.id, t])); for (const t of tareas.values()) m.set(t.id, t); l = [...m.values()] }
  let vistas = podar(l).map(t => t.estado === 'trabajando' && !vive(t.pid) ? { ...t, estado: 'detenida' as const, nota: t.nota ?? 'se detuvo cuando se reinició el agent-server' } : t)
  vistas = await cerrarLoNotificado(vistas)
  return Promise.all(vistas.map(enriquecer))
}

/** Lo que la sesión ya cerró sin evento del SDK (ver internos-cierre.ts) deja de decir «Trabajando». */
export async function cerrarLoNotificado(l: TareaInterna[], leer: (desdeMs: number) => Promise<Cierres> = cierresRecientes): Promise<TareaInterna[]> {
  const abiertas = l.filter(t => t.estado === 'trabajando')
  if (!abiertas.length) return l
  let c: Cierres
  try { c = await leer(Math.min(...abiertas.map(t => Date.parse(t.desde)))) } catch { return l }
  return l.map(t => {
    if (t.estado !== 'trabajando') return t
    const status = c.notificadas.get(t.id)
    if (status && status !== 'running' && status !== 'pending') {
      const estado = ESTADO_SDK[status] ?? 'completada'
      return { ...t, estado, nota: t.nota ?? (status === 'stopped' || status === 'killed' ? 'se detuvo (la sesión lo cerró sin terminar)' : undefined) }
    }
    const r = t.toolUseId ? c.resultados.get(t.toolUseId) : undefined
    // Un resultado que NO es el aviso de «corre en segundo plano» es el fin del comando o del subagente.
    if (r && !r.fondo && !t.segundoPlano && !t.salida) return { ...t, estado: 'completada' as const }
    return t
  })
}

/** Raíces donde el CLI deja salidas de tareas; nada fuera de ellas se lee. */
function raicesPermitidas(): string[] {
  const h = homedir()
  return [tmpdir(), '/tmp', '/private/tmp', '/private/var/folders', ...carpetasClaude().slice(0, 2).map(c => join(h, c))].map(r => r.endsWith('/') ? r : r + '/')
}

/** Para pruebas: olvida lo aprendido de las transcripciones. */
export function olvidarTranscripciones() { rutas.clear(); metas.clear(); ultimos.clear(); detalles.clear() }

export interface SalidaInterna {
  id: string; descripcion: string; estado: EstadoInterna; texto: string; fuente: 'archivo' | 'resultado' | 'resumen'
  /** Solo subagentes con transcripción: lo que dijo, su informe final, herramientas usadas, modelo y contexto. */
  detalle?: DetalleSubagente
}

/** Las últimas líneas de la salida de una tarea, sin secretos. Un .jsonl (transcripción de
 *  un subagente) se traduce a su texto; lo demás se devuelve tal cual. */
export async function salidaDe(id: string, lineas = 60, tachar: (s: string) => string = s => s): Promise<SalidaInterna> {
  const t = (await internas()).find(x => x.id === id)
  if (!t) throw new Error('Esa tarea no está en el registro de hoy.')
  const base = { id: t.id, descripcion: t.descripcion, estado: t.estado }
  const real = t.salida ? await realpath(t.salida).catch(() => null) : null
  const legible = !!real && permitida(real) && /\.(output|jsonl|log|txt)$/.test(real)
  const transcripcion = legible && real!.endsWith('.jsonl') ? real! : await rutaTranscripcion(t).catch(() => null)
  let detalle: DetalleSubagente | undefined
  if (transcripcion) {
    try {
      const d = await detalleDe(transcripcion)
      detalle = {
        ...d, encargo: d.encargo && tachar(d.encargo), final: d.final && tachar(d.final), dicho: d.dicho.map(tachar),
        acciones: d.acciones.map(a => ({ herramienta: a.herramienta, objetivo: a.objetivo && tachar(a.objetivo) })),
      }
    } catch { /* sin detalle: queda el registro */ }
  }
  const archivoLegible = legible ? real! : transcripcion
  if (archivoLegible) {
    const fh = await open(archivoLegible, 'r')
    try {
      const { size } = await fh.stat()
      const n = Math.min(size, 256 * 1024), buf = Buffer.alloc(n)
      await fh.read(buf, 0, n, size - n)
      let texto = buf.toString('utf8')
      if (archivoLegible.endsWith('.jsonl') || /^\s*\{"/.test(texto.split('\n').filter(Boolean).at(-1) ?? '')) texto = textoDeTranscripcion(texto)
      return { ...base, texto: tachar(texto.split('\n').slice(-lineas).join('\n')), fuente: 'archivo', detalle }
    } finally { await fh.close() }
  }
  if (t.resultado) return { ...base, texto: tachar(t.resultado.split('\n').slice(-lineas).join('\n')), fuente: 'resultado' }
  return { ...base, texto: tachar(t.resumen ?? 'Sin salida registrada todavía.'), fuente: 'resumen' }
}

export function textoDeTranscripcion(jsonl: string): string {
  const out: string[] = []
  for (const linea of jsonl.split('\n')) {
    if (!linea.trim().startsWith('{')) continue
    try {
      const m = JSON.parse(linea) as { type?: string; message?: { role?: string; content?: unknown } }
      if (m.type !== 'assistant' || !Array.isArray(m.message?.content)) continue
      for (const b of m.message.content as { type?: string; text?: string; name?: string }[]) {
        if (b.type === 'text' && b.text?.trim()) out.push(b.text.trim())
        else if (b.type === 'tool_use' && b.name) out.push(`· usó ${b.name}`)
      }
    } catch { /* línea cortada */ }
  }
  return out.join('\n')
}
