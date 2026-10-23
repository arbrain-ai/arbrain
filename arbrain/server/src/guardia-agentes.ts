/**
 * Guardia de los agentes en la edición cliente (seguridad, 10 oct 2026; AUDITORIA riesgo 2 e I4; red team C1/C2,
 * 11 oct 2026).
 *
 * Corre como PreToolUse programático (los hooks del SDK corren en cualquier modo de permisos, en crons y en los
 * subagentes del propio CLI) y, como segunda red, en `canUseTool` (`permisosCliente`). Decide con la política de lista
 * blanca de `cliente/politica-agentes.ts`:
 *   - permitir: sigue el flujo normal (y `canUseTool` lo aprueba);
 *   - negar: no se ejecuta y el modelo recibe el motivo;
 *   - confirmar: se crea una confirmación humana con el comando LITERAL (I8) y se espera el clic de la persona. Si la
 *     aprueba, la acción corre una vez, fuera del sandbox (es lo que la persona vio y aprobó).
 * Las confirmaciones de la guardia llevan huella con el espacio de su origen (`agente:` o `cron:`): una aprobación
 * pedida por HTTP (manos) nunca destraba una acción de la guardia.
 *
 * Instalación de Daniel: no se activa (su operación no cambia). Edición cliente: activa siempre.
 */
import type { CanUseTool, HookCallbackMatcher, HookInput, Options, PermissionResult, SyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'
import { esEdicionCliente } from './edicion.js'
import { confirmacionesDelDaemon, huellaGuardia, type Confirmaciones } from './cliente/confirmaciones.js'
import { haySecretoConfirmar } from './cliente/secreto.js'
import { contextoPolitica, decidirHerramienta, type ContextoPolitica, type DecisionPolitica } from './cliente/politica-agentes.js'
import { opcionesSandbox, sandboxActivo } from './cliente/sandbox.js'
import { verificarHooksProyecto, type VerificacionHooks } from './cliente/hooks-proyecto.js'
import { aprobarDominioWeb, fuenteExterna, efectoSinPreguntar, expandirRuta, marcaContenidoExterno, rutaReal } from './cliente/politica-agentes.js'
import { extraerUrls, normalizarUrl, procedenciaDelDaemon, type Procedencia } from './cliente/procedencia.js'
import { bitacoraDelDaemon, type DecisionBitacora } from './cliente/bitacora.js'
import { MENSAJE_PAUSA, pausado } from './cliente/pausa.js'
import { NOMBRE_MODO } from './cliente/modo-permisos.js'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Motivo para negar la herramienta, o null si no se niega (puede pedir confirmación). Pura salvo el disco. */
export function motivoGuardia(herramienta: string, input: unknown, ctx: ContextoPolitica = contextoGuardia()): string | null {
  const d = decidirHerramienta(herramienta, input, ctx)
  return d.tipo === 'negar' ? d.motivo : null
}

/** Las rutinas corren sin la persona delante: no usan el modo de permisos (siempre «preguntar», nunca sin freno). */
const modoDelOrigen = (op: OpcionesGuardia): Partial<ContextoPolitica> => op.origen === 'cron' ? { modo: 'preguntar', sinFreno: false } : {}

/** Contexto de la política para este daemon (cerebro, carpetas protegidas, sandbox). */
export function contextoGuardia(over: Partial<ContextoPolitica> = {}): ContextoPolitica {
  return contextoPolitica({ sandbox: sandboxActivo(), ...over })
}

export interface OpcionesGuardia {
  /** Almacén de confirmaciones humanas (I8). Por defecto, el del daemon. */
  confirmaciones?: () => Confirmaciones | null
  /** ¿La app puede aprobar? (hay secreto de confirmar). Por defecto, el del daemon. */
  hayQuienConfirme?: () => boolean
  /** Cuánto espera el turno el clic humano antes de negar (ms). */
  esperaMs?: number
  origen?: 'agente' | 'cron'
  /** Contexto de la política (pruebas). Por defecto, el del daemon con la carpeta del turno. */
  contexto?: (cwd?: string) => ContextoPolitica
  /** Procedencia de notas escritas tras leer contenido de afuera (pruebas). Por defecto, la del daemon. */
  procedencia?: () => Procedencia
  /**
   * Sesión de la que esta nace (editar un mensaje bifurca: `forkSession`). La copia trae el mismo contexto, así que
   * hereda la marca de contaminada de la original.
   */
  heredaDe?: string
}

const ESPERA_MS = () => (Number(process.env.ARBRAIN_CONFIRMAR_ESPERA_S) || 90) * 1000

type Decision = SyncHookJSONOutput
const negarHook = (razon: string): Decision => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: razon } })
const mensajeNegado = (motivo: string) => `Guardia de Arbrain: ${motivo}. No se ejecutó. No busques otra vía; si de verdad hace falta, pídele a la persona que lo haga ella misma.`

/**
 * Herramientas ya aprobadas por la persona en el hook, por tool_use_id: `canUseTool` no vuelve a preguntar por la misma
 * llamada. Vive en memoria del daemon y se vacía sola.
 */
const aprobadasPorId = new Map<string, number>()
function marcarAprobada(id: string | undefined): void {
  if (!id) return
  const ahora = Date.now()
  for (const [k, t] of aprobadasPorId) if (ahora - t > 15 * 60_000) aprobadasPorId.delete(k)
  aprobadasPorId.set(id, ahora)
}
const tomarAprobada = (id: string | undefined): boolean => !!id && aprobadasPorId.delete(id)

type Resultado = { ok: true } | { ok: false; razon: string }

/** «Lo que hizo Levy»: anota en la bitácora local (redactada) una acción con efecto y cómo terminó. */
function anotar(herramienta: string, input: unknown, decision: DecisionBitacora, extra: { motivo?: string; confirmacion?: string; origen?: 'agente' | 'cron' } = {}): void {
  try { bitacoraDelDaemon()?.anotar({ herramienta, input, decision, ...extra }) } catch { /* la bitácora nunca rompe un turno */ }
}

/** I8: crea la confirmación con el literal que interceptó la guardia y espera el clic humano. */
async function confirmacionHumana(herramienta: string, input: unknown, d: Extract<DecisionPolitica, { tipo: 'confirmar' }>, op: OpcionesGuardia, registrar: (e: Record<string, unknown>) => void, signal?: AbortSignal): Promise<Resultado> {
  const store = (op.confirmaciones ?? confirmacionesDelDaemon)()
  if (!store || !(op.hayQuienConfirme ?? haySecretoConfirmar)()) {
    registrar({ herramienta, decision: 'negado', motivo: 'sin confirmación humana configurada', categoria: d.categoria })
    anotar(herramienta, input, 'negado', { motivo: 'sin confirmación humana configurada', origen: op.origen })
    return { ok: false, razon: `Arbrain necesita la confirmación de la persona para esto (${d.resumen}) y esta instalación no puede pedirla. No se ejecutó. Pídele que lo haga ella misma.` }
  }
  const origen = op.origen ?? 'agente'
  const huella = huellaGuardia(origen, herramienta, input)
  if (store.consumir(huella)) { registrar({ herramienta, decision: 'permitido', motivo: 'confirmación humana', categoria: d.categoria }); anotar(herramienta, input, 'confirmado', { origen }); return { ok: true } }
  const c = store.pedir({ origen, categoria: d.categoria, resumen: d.resumen, detalle: d.literal.slice(0, 2000), literal: d.literal, avisos: d.avisos, herramienta, huella, creadaPor: 'guardia' })
  registrar({ herramienta, decision: 'esperando', confirmacion: c.id, categoria: d.categoria })
  const estado = await store.esperar(c.id, op.esperaMs ?? ESPERA_MS(), 500, signal)
  if (estado === 'permitida' && store.consumir(huella)) { registrar({ herramienta, decision: 'permitido', confirmacion: c.id }); anotar(herramienta, input, 'confirmado', { confirmacion: c.id, origen }); return { ok: true } }
  registrar({ herramienta, decision: 'negado', confirmacion: c.id, estado })
  anotar(herramienta, input, estado === 'rechazada' ? 'rechazado' : estado === 'pendiente' ? 'sin_respuesta' : 'vencido', { confirmacion: c.id, motivo: d.resumen, origen })
  if (estado === 'rechazada') return { ok: false, razon: `La persona RECHAZÓ esta acción en Arbrain (${d.resumen}). No se ejecutó. No la repitas ni busques otra vía; pregúntale qué prefiere.` }
  if (estado === 'pendiente') return { ok: false, razon: `Esta acción (${d.resumen}) espera la confirmación de la persona en Arbrain (pendiente ${c.id}). No se ejecutó. Avísale que tiene una confirmación pendiente y, cuando la apruebe, repite exactamente la misma acción.` }
  return { ok: false, razon: `La confirmación de esta acción venció sin respuesta (${d.resumen}). No se ejecutó.` }
}

/** Red team 2 M-5: al permitir un WebFetch, su dominio queda aprobado para esta sesión del daemon. */
function aprobadaPorLaPersona(herramienta: string, input: unknown): void {
  if (herramienta === 'WebFetch' && input && typeof input === 'object') aprobarDominioWeb((input as Record<string, unknown>).url)
}

/** Lo aprobado por la persona corre fuera del sandbox: es lo que vio y aprobó (y suele necesitar red). */
const fueraDelSandbox = (herramienta: string, input: unknown): Record<string, unknown> | undefined =>
  herramienta === 'Bash' && input && typeof input === 'object' ? { ...(input as Record<string, unknown>), dangerouslyDisableSandbox: true } : undefined

/**
 * Sesiones contaminadas (seguridad del alumno, 12 oct 2026, punto 2): por `session_id` del CLI, qué contenido de afuera
 * entró a la conversación (web, correo, PDF, descargas, archivos fuera del cerebro). Vive en memoria del daemon: una
 * conversación nueva nace limpia; reabrir la misma después de reiniciar el daemon también (el contenido sigue en su
 * contexto, pero sin turno vivo no hay a quién obedecer; el primer contenido externo nuevo la vuelve a marcar).
 */
const contaminadas = new Map<string, { fuente: string; desde: number }>()
/**
 * Seguridad noche 21 oct (carril 2): la marca sobrevive al reinicio del daemon. Antes, reabrir la conversación tras
 * reiniciar la dejaba limpia con la página inyectada todavía en su contexto (y un despertador sí tiene turno vivo). Vive
 * en `<ARBRAIN_DATA_DIR>/sesiones-contaminadas.json` (carpeta protegida). Sin carpeta de datos (pruebas), en memoria.
 */
let contaminadasCargadas = false
const archivoContaminadas = () => process.env.ARBRAIN_DATA_DIR ? join(process.env.ARBRAIN_DATA_DIR, 'sesiones-contaminadas.json') : null
function cargarContaminadas(): void {
  if (contaminadasCargadas) return
  contaminadasCargadas = true
  const a = archivoContaminadas()
  if (!a || !existsSync(a)) return
  try {
    const j = JSON.parse(readFileSync(a, 'utf8')) as Record<string, { fuente?: string; desde?: number }>
    for (const [k, v] of Object.entries(j)) if (typeof v?.fuente === 'string' && !contaminadas.has(k)) contaminadas.set(k, { fuente: v.fuente.slice(0, 200), desde: Number(v.desde) || 0 })
  } catch { /* ilegible: se empieza de cero */ }
}
function guardarContaminadas(): void {
  const a = archivoContaminadas()
  if (!a) return
  try {
    mkdirSync(dirname(a), { recursive: true, mode: 0o700 })
    writeFileSync(`${a}.tmp`, JSON.stringify(Object.fromEntries(contaminadas)) + '\n', { mode: 0o600 })
    renameSync(`${a}.tmp`, a)
  } catch { /* la marca en memoria sigue valiendo */ }
}
export function marcarContaminada(sesion: string | undefined, fuente: string): void {
  cargarContaminadas()
  if (!sesion || contaminadas.has(sesion)) return
  if (contaminadas.size > 500) contaminadas.delete(contaminadas.keys().next().value as string)
  contaminadas.set(sesion, { fuente, desde: Date.now() })
  guardarContaminadas()
}
export const contaminadaDe = (sesion: string | undefined) => { cargarContaminadas(); return sesion ? contaminadas.get(sesion) ?? null : null }
/** Solo pruebas. */
export function _contaminadasParaPruebas(): Map<string, { fuente: string; desde: number }> { return contaminadas }

/**
 * Seguridad noche 21 oct (carril 2): por sesión, las URLs que ya aparecieron (lo que pidió la persona y lo que devolvieron
 * las herramientas) y cuántas páginas abrió sin clic desde que se contaminó. En memoria, como las contaminadas.
 */
const urlsVistas = new Map<string, Set<string>>()
const webSinClic = new Map<string, number>()
const MAX_URLS_SESION = 5000
/**
 * URLs que el modelo NO controla: las que escribió la PERSONA en su mensaje. Solo de ahí se alimenta la lista de
 * «vistas» (red team adversarial de la noche, hallazgos 1 y 6). La salida de una herramienta (una página, un correo, un
 * `echo`, el resumen de WebFetch cuyo prompt pone el modelo) es un canal que el modelo o el atacante controlan: nunca
 * alimenta la lista. En una sesión contaminada, WebFetch sin clic solo abre direcciones que la persona escribió.
 */
function verUrls(sesion: string | undefined, texto: string): void {
  if (!sesion || !texto) return
  let set = urlsVistas.get(sesion)
  if (!set) {
    if (urlsVistas.size > 500) urlsVistas.delete(urlsVistas.keys().next().value as string)
    set = new Set(); urlsVistas.set(sesion, set)
  }
  for (const u of extraerUrls(texto.slice(0, 400_000))) {
    const n = normalizarUrl(u)
    if (n && set.size < MAX_URLS_SESION) set.add(n)
  }
}
/** Solo pruebas. */
export function _urlsVistasParaPruebas(): Map<string, Set<string>> { return urlsVistas }

const ESCRITURA_ARCHIVOS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
/** tool_use_id de los Bash que la persona aprobó (corren fuera del sandbox); su salida contamina. */
const fueraDelSandboxPorId = new Set<string>()
const FUENTE_APROBADO = 'la salida de un comando que aprobaste (corrió fuera del sandbox)'

/** Hooks PreToolUse, PostToolUse y UserPromptSubmit de la guardia (sin efecto fuera de la edición cliente). */
export function guardiaHooks(registrar: (evento: Record<string, unknown>) => void = () => {}, op: OpcionesGuardia = {}): { PreToolUse: HookCallbackMatcher[]; PostToolUse: HookCallbackMatcher[]; PostToolUseFailure: HookCallbackMatcher[]; UserPromptSubmit: HookCallbackMatcher[] } {
  const procedencia = () => (op.procedencia ?? procedenciaDelDaemon)()
  const contextoDe = (input: { cwd?: string; session_id?: string }): ContextoPolitica => {
    const p = procedencia()
    const madre = op.heredaDe ? contaminadaDe(op.heredaDe) : null
    if (madre && input.session_id && input.session_id !== op.heredaDe && !contaminadaDe(input.session_id)) marcarContaminada(input.session_id, madre.fuente)
    return {
      ...(op.contexto ?? ((cwd?: string) => contextoGuardia(cwd ? { cwd } : {})))(input.cwd),
      ...modoDelOrigen(op),
      contaminada: contaminadaDe(input.session_id),
      urlsVistas: (input.session_id && urlsVistas.get(input.session_id)) || new Set(),
      webSinClic: (input.session_id && webSinClic.get(input.session_id)) || 0,
      procedencia: { de: (real: string) => p.de(real), bajo: (dir: string) => p.bajo(dir) },
    }
  }
  return {
    UserPromptSubmit: [{
      hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== 'UserPromptSubmit') return { continue: true }
        contextoDe(input)
        verUrls(input.session_id, input.prompt)
        // Texto largo pegado en el chat (un correo, un artículo): viaja dentro del mensaje, sin herramienta que lo marque.
        const pegado = /\[Archivo de texto adjunto · arbrain\/v1 \{"name":"([^"]{1,120})"/.exec(input.prompt ?? '')
        if (pegado && !contaminadaDe(input.session_id)) {
          const fuente = `un texto pegado en el chat (${pegado[1]})`
          marcarContaminada(input.session_id, fuente)
          registrar({ evento: 'sesion_contaminada', herramienta: 'UserPromptSubmit', fuente })
        }
        return { continue: true }
      }],
    }],
    // Un error de herramienta también trae texto de afuera (la página que falló, el correo que no se pudo procesar).
    PostToolUseFailure: [{
      hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== 'PostToolUseFailure') return { continue: true }
        const ctx = contextoDe(input)
        const fuente = fuenteExterna(input.tool_name, input.tool_input, ctx) ?? (fueraDelSandboxPorId.delete(input.tool_use_id) && input.tool_name === 'Bash' ? FUENTE_APROBADO : null)
        if (fuente && !contaminadaDe(input.session_id)) { marcarContaminada(input.session_id, fuente); registrar({ evento: 'sesion_contaminada', herramienta: input.tool_name, fuente }) }
        return { continue: true }
      }],
    }],
    PostToolUse: [{
      hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== 'PostToolUse') return { continue: true }
        const ctx = contextoDe(input)
        const aprobadoFuera = fueraDelSandboxPorId.delete(input.tool_use_id) && input.tool_name === 'Bash'
        // Inyección de segunda orden: lo que una sesión contaminada escribe en el cerebro queda con su procedencia.
        const sucia = contaminadaDe(input.session_id)
        if (sucia && ESCRITURA_ARCHIVOS.has(input.tool_name)) {
          const i = (input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {}) as Record<string, unknown>
          const v = ['file_path', 'notebook_path', 'path'].map(c => i[c]).find(x => typeof x === 'string' && x) as string | undefined
          if (v) { try { procedencia().marcar(rutaReal(expandirRuta(v, ctx)), sucia.fuente) } catch { /* nunca rompe el turno */ } }
        }
        // Un comando que la persona aprobó corrió fuera del sandbox, quizá con red (gog, python, npm): su salida es de afuera.
        const externa = fuenteExterna(input.tool_name, input.tool_input, ctx)
        const fuente = externa ?? (aprobadoFuera ? FUENTE_APROBADO : null)
        if (!fuente) return { continue: true }
        if (!contaminadaDe(input.session_id)) {
          marcarContaminada(input.session_id, fuente)
          registrar({ evento: 'sesion_contaminada', herramienta: input.tool_name, fuente })
        }
        // Spotlighting: después de CADA resultado de afuera, la regla, pegada al dato.
        return { continue: true, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: marcaContenidoExterno(input.tool_name, fuente) } }
      }],
    }],
    PreToolUse: [{
      // El hook puede esperar el clic humano (I8): margen sobre la espera.
      timeout: Math.ceil((op.esperaMs ?? ESPERA_MS()) / 1000) + 60,
      hooks: [async (input: HookInput, _id, opciones): Promise<SyncHookJSONOutput> => {
        if (input.hook_event_name !== 'PreToolUse') return { continue: true }
        // «Pausar todo»: mientras dure, ninguna herramienta corre (lo que sobreviva al aborto no actúa).
        if (pausado()) { anotar(input.tool_name, input.tool_input, 'pausado', { origen: op.origen }); return negarHook(MENSAJE_PAUSA) }
        const ctx = contextoDe(input)
        const d = decidirHerramienta(input.tool_name, input.tool_input, ctx)
        if (d.tipo === 'negar') {
          registrar({ herramienta: input.tool_name, decision: 'negado', motivo: d.motivo })
          anotar(input.tool_name, input.tool_input, 'negado', { motivo: d.motivo, origen: op.origen })
          return negarHook(mensajeNegado(d.motivo))
        }
        if (d.tipo === 'permitir') {
          if (ctx.contaminada && input.tool_name === 'WebFetch') webSinClic.set(input.session_id, (webSinClic.get(input.session_id) ?? 0) + 1)
          // Lo que corre sin clic por el modo de permisos se anota siempre, con el modo, para que la persona lo vea.
          if (d.sinFreno) anotar(input.tool_name, input.tool_input, 'hecho', { origen: op.origen, motivo: `sin preguntar: freno quitado bajo tu responsabilidad (modo «${NOMBRE_MODO.libre}»)` })
          else if (d.porModo) anotar(input.tool_name, input.tool_input, 'hecho', { origen: op.origen, motivo: `sin preguntar: modo «${NOMBRE_MODO[d.porModo]}»` })
          else if (efectoSinPreguntar(input.tool_name, input.tool_input)) anotar(input.tool_name, input.tool_input, 'hecho', { origen: op.origen })
          return { continue: true }
        }
        const r = await confirmacionHumana(input.tool_name, input.tool_input, d, op, registrar, opciones?.signal)
        if (!r.ok) return negarHook(r.razon)
        marcarAprobada(input.tool_use_id)
        aprobadaPorLaPersona(input.tool_name, input.tool_input)
        const cambiado = fueraDelSandbox(input.tool_name, input.tool_input)
        if (cambiado && input.tool_use_id) { if (fueraDelSandboxPorId.size > 1000) fueraDelSandboxPorId.clear(); fueraDelSandboxPorId.add(input.tool_use_id) }
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'La persona lo aprobó en Arbrain.', ...(cambiado ? { updatedInput: cambiado } : {}) } }
      }],
    }],
  }
}

type Hooks = Partial<Record<string, HookCallbackMatcher[]>>

/** Suma la guardia a los hooks de una sesión, solo en la edición cliente. */
export function conGuardia<T extends Hooks>(hooks: T, registrar?: (evento: Record<string, unknown>) => void, op?: OpcionesGuardia): T & { PreToolUse?: HookCallbackMatcher[]; PostToolUse?: HookCallbackMatcher[]; PostToolUseFailure?: HookCallbackMatcher[]; UserPromptSubmit?: HookCallbackMatcher[] } {
  if (!esEdicionCliente()) return hooks
  const g = guardiaHooks(registrar, op)
  return {
    ...hooks,
    PreToolUse: [...g.PreToolUse, ...(hooks.PreToolUse ?? [])],
    PostToolUse: [...g.PostToolUse, ...(hooks.PostToolUse ?? [])],
    PostToolUseFailure: [...g.PostToolUseFailure, ...(hooks.PostToolUseFailure ?? [])],
    UserPromptSubmit: [...g.UserPromptSubmit, ...(hooks.UserPromptSubmit ?? [])],
  }
}

/**
 * Segunda red (edición cliente): `canUseTool` con la misma política. Si el hook ya obtuvo el clic de la persona para
 * esta llamada (tool_use_id), no pregunta otra vez; si el hook no corrió (p. ej. una configuración del proyecto lo
 * apagó), la confirmación se pide aquí. Lo que `base` resuelva primero (AskUserQuestion) se respeta.
 * Instalación de Daniel: devuelve `base` tal cual.
 */
export function permisosCliente(base: CanUseTool, registrar: (evento: Record<string, unknown>) => void = () => {}, op: OpcionesGuardia = {}): CanUseTool {
  if (!esEdicionCliente()) return base
  return async (herramienta, input, opciones): Promise<PermissionResult | null> => {
    if (pausado()) return { behavior: 'deny', message: MENSAJE_PAUSA }
    if (herramienta === 'AskUserQuestion') return base(herramienta, input, opciones)
    const ctx = { ...(op.contexto ?? ((cwd?: string) => contextoGuardia(cwd ? { cwd } : {})))(), ...modoDelOrigen(op) }
    const d = decidirHerramienta(herramienta, input, ctx)
    if (d.tipo === 'negar') { registrar({ herramienta, decision: 'negado', motivo: d.motivo, capa: 'canUseTool' }); return { behavior: 'deny', message: mensajeNegado(d.motivo) } }
    if (d.tipo === 'confirmar' && !tomarAprobada(opciones?.toolUseID)) {
      const r = await confirmacionHumana(herramienta, input, d, op, registrar, opciones?.signal)
      if (!r.ok) return { behavior: 'deny', message: r.razon }
      aprobadaPorLaPersona(herramienta, input)
      const cambiado = fueraDelSandbox(herramienta, input)
      return { behavior: 'allow', updatedInput: (cambiado ?? input) as Record<string, unknown> }
    }
    return base(herramienta, input, opciones)
  }
}

/** Solo pruebas. */
export function _aprobadasParaPruebas(): Map<string, number> { return aprobadasPorId }

/** Huellas de ganchos ya avisadas (un aviso por huella distinta, no uno por turno). */
const avisadas = new Set<string>()

/**
 * Opciones del SDK que la edición cliente suma a cada sesión con herramientas (chat y rutinas): el sandbox del sistema
 * para Bash (si existe) y, en la capa de flags, `disableAllHooks`: `false` si los ganchos del cerebro son los de la
 * plantilla (así un `.claude/settings.json` del proyecto no apaga nada) y `true` si no coinciden (red team 2 C-1: la
 * sesión arranca sin ganchos del proyecto; la guardia de Arbrain son callbacks del SDK y sigue corriendo). La huella
 * viaja en `env` de la capa de flags para que el pool de sesiones reabra el proceso si los ganchos cambian entre turnos.
 * Instalación de Daniel: nada.
 */
export function opcionesSesionCliente(settings?: Record<string, unknown>, op: { verificar?: () => VerificacionHooks; registrar?: (evento: Record<string, unknown>) => void } = {}): { sandbox?: Options['sandbox']; settings?: Options['settings'] } {
  if (!esEdicionCliente()) return settings ? { settings: settings as Options['settings'] } : {}
  const ctx = contextoGuardia()
  const v = (op.verificar ?? verificarHooksProyecto)()
  if (!v.ok) {
    const clave = v.huella ?? v.motivo ?? 'sin-huella'
    if (!avisadas.has(clave)) { avisadas.add(clave); (op.registrar ?? ((e) => process.stderr.write(`guardia: ${JSON.stringify(e)}\n`)))({ evento: 'ganchos_del_proyecto_apagados', motivo: v.motivo, huella: v.huella }) }
  }
  // La huella y el estado del sandbox viajan en `env`: si cambian, el pool reabre la sesión con las opciones nuevas.
  const env = { ...((settings?.env as Record<string, string> | undefined) ?? {}), ARBRAIN_HOOKS_HUELLA: (v.huella ?? 'ninguna').slice(0, 16), ARBRAIN_SANDBOX_ESTADO: ctx.sandbox ? 'activo' : 'sin' }
  return {
    ...(ctx.sandbox ? { sandbox: opcionesSandbox(ctx) } : {}),
    settings: { ...(settings ?? {}), disableAllHooks: !v.ok, env } as Options['settings'],
  }
}

/** Sesiones de solo metadatos (`/status`, modelos, `/context`) en la edición cliente: sin ganchos del proyecto. */
export function sinGanchosCliente(): { settings?: Options['settings'] } {
  return esEdicionCliente() ? { settings: { disableAllHooks: true } as Options['settings'] } : {}
}
