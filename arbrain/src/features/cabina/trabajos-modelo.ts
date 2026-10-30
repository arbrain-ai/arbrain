/**
 * Una sola fuente para «qué corre en el Studio» (unificado, 1 oct 2026).
 *
 * La vista «trabajos» del chat y el panel derecho (En curso y Taller) leen la MISMA
 * respuesta de `/api/cabina/trabajos` → agent-server `trabajos()`: el motor de Arbrain
 * cuando responde y el gate de SFTerm como respaldo (`fuente` lo dice), más las tareas
 * internas de los turnos de Levy (subagentes del SDK y comandos en segundo plano).
 * Aquí viven los tipos y las reglas de lectura que comparten; ninguna de las dos
 * superficies decide por su cuenta qué es un agente o en qué estado está.
 */

export interface Subagente { id: number; nombre: string; harness: string; encargo: string; cwd: string; creado: string; modelo?: string; /** Esfuerzo PEDIDO (lo medido va en `Conversacion.coherencia`). */ esfuerzo?: string; tokens?: number | null; permisos?: 'bypass' | 'auto' | 'acceptEdits'; entrega?: 'entregado' | 'pendiente' | 'falló'; entregaNota?: string
  /** Conversación del chat desde la que Levy lo lanzó (3 oct 2026); null o ausente = «Sin conversación». */
  origen?: string | null
  /** Pregunta abierta que vio el servidor (caja con «?», AskUserQuestion o permiso, 5 oct 2026): primero la atiende Levy. */
  pregunta?: { texto: string; tipo: 'dialogo' | 'pregunta'; desde: number }
  /** ISO: Levy no la atendió a tiempo (o su conversación ya no existe) y subió a Daniel. */
  escalado?: string
  escaladoPor?: string
  rescatado?: string
  /** Veredicto del juez separado sobre su último turno (agent-server `cabina/juez.ts`, 27 oct 2026). */
  juicio?: Juicio
  /** De dónde salieron modelo y esfuerzo y contra qué se validaron (agent-server `cabina/catalogo-delegar.ts`). */
  eleccion?: string
  /** Su propio worktree con su rama, o la carpeta pedida (agent-server `cabina/aislamiento.ts`, 29 oct 2026). */
  aislamiento?: 'worktree' | 'carpeta'
  rama?: string
  /** Perfil de permisos (agent-server `cabina/perfiles.ts`, 29 oct 2026): total, codigo o lectura. Sin campo = total. */
  perfil?: 'total' | 'codigo' | 'lectura'
  /** El CLI no acepta la guardia: corre sin lista negra. */
  sinGuardia?: boolean
  /** Plan versionado del que salió (agent-server `cabina/plan.ts`): ruta en el repo y commit aprobado. */
  plan?: { ruta: string; commit: string | null } }
/** Plan de encargo por correr (agent-server `cabina/plan.ts`, 29 oct 2026). */
export interface PlanPendiente { ruta: string; abs: string; nombre: string; harness: string; perfil: 'total' | 'codigo' | 'lectura'; propuesto: string | null; resumen: string }
/** Lo pedido contra lo que el CLI reportó que corre (agent-server `cabina/harness/coherencia.ts`, 29 oct 2026). */
export interface ValorCoherencia { pedido: string | null; efectivo: string | null; estado: 'coincide' | 'distinto' | 'sin-medir' | 'default' }
export interface Coherencia { modelo: ValorCoherencia; esfuerzo: ValorCoherencia; desajuste: string | null }
/** Lo que cambió en su rama desde main (lo guardado y lo que aún no guarda). */
export interface CambiosRama { rama: string; mas: number; menos: number; archivos: number }
export type Veredicto = 'cumple' | 'no-cumple' | 'no-verificable' | 'sin-dod'
export interface Juicio { veredicto: Veredicto; razon: string; en: string; turno?: number; modelo?: string }
/** Columna del tablero con su latido medido (agent-server `cabina/tablero.ts`): proceso vivo y última escritura. */
export type Columna = 'trabajando' | 'te-espera' | 'listo' | 'falló' | 'murió'
export interface EstadoTablero {
  columna: Columna; motivo: string; latido: { ultimaEscritura: number | null; procesoVivo: boolean; edadMs: number | null; umbralMs: number }
  /** Su último paso en humano («Corriendo las pruebas»), de su última herramienta; el servidor viejo no lo manda. */
  paso?: string
  /** ms epoch en que empezó su turno actual. */
  desde?: number
}
export interface Mensaje { rol: 'user' | 'assistant'; texto: string; herramientas: string[] }
export interface Conversacion { harness: string; modelo: string | null; esfuerzo?: string | null; coherencia?: Coherencia; ctxPct: number | null; ctxVentana?: number | null; turno: 'trabajando' | 'terminado' | null; pregunta: boolean; tokens: number | null; mensajes: Mensaje[]; titulo: string | null; error?: string }
export type EstadoTerminal = 'trabajando' | 'esperando' | 'terminal'
export interface Terminal { id: number; pid?: number; titulo: string; cwd: string; proc: string; estado: EstadoTerminal; actividad: string | null; ultimaAccion: string | null; ultimas: string[]; origen?: 'motor' | 'sfterm-ptyd' | 'sin-pantalla'; soloLectura?: boolean; conversacion?: Conversacion; subagente?: Subagente; tablero?: EstadoTablero; cambios?: CambiosRama }
export interface Servidor { puerto: number; proceso: string; nombre: string }
export type AreaServicio = 'Casa' | 'Voz' | 'Salud' | 'Arbrain' | 'Levy' | 'Túneles' | 'Datos' | 'Manos' | 'Apps'
/** `nombre`/`area` en palabras de dueño (5 oct 2026); con falla, `explicacion` en español llano, `menor` = su app sí corre, `detalle` = última línea del log. */
export interface Servicio { label: string; pid: number | null; estado: 'corriendo' | 'programado' | 'falló'; codigo: number | null; nombre?: string; area?: AreaServicio; explicacion?: string; menor?: boolean; detalle?: string }
/** Un proceso que escucha, con su dueño (agent-server `cabina/procesos.ts`, 5 oct 2026). Solo `huerfano` se puede apagar. */
export type ClaseProceso = 'sistema' | 'casa' | 'conversacion' | 'huerfano' | 'oculto'
export interface DuenoProceso { tipo: 'agente' | 'sesion' | 'levy' | 'terminal' | 'worktree' | 'nadie'; nombre: string; conversacion?: string; sesion?: string; vivo: boolean; ultimaSenal?: string }
export interface Proceso { pid: number; puertos: number[]; nombre: string; que?: string; clase: ClaseProceso; area?: AreaServicio; dueno?: DuenoProceso; razon?: string; desde: string; web: boolean; publicado?: boolean; firma: string }
export interface Motor { pid: number; relevos: number; propias: number; adoptadas: number; sfterm: 'enlazado' | 'desconectado' | 'sin adopción'; soloLectura: boolean; desde: string }
export interface Topes { paralelo: { vivos: number; max: number }; tokens: { hoy: number; max: number; sinMedir: number } }
export type TipoInterna = 'subagente' | 'comando' | 'workflow' | 'otra'
export type EstadoInterna = 'trabajando' | 'completada' | 'falló' | 'detenida'
export interface TareaInterna {
  id: string; tipo: TipoInterna
  /** El título: la tarea con la que Levy lanzó al agente (el daemon no la reescribe con la última acción). */
  descripcion: string; detalle?: string; estado: EstadoInterna; segundoPlano?: boolean; desde: string; actualizado: string; fin?: string
  /** Lo que hace ahora según el SDK, en inglés («Running Typecheck arbrain»): pista para `actividadLegible`, no título. */
  actividad?: string
  resumen?: string; ultimaHerramienta?: string; tokens?: number; usos?: number; duracionMs?: number
  /** Id del modelo y tokens en contexto leídos de la transcripción del agente; ausentes si no hay transcripción. */
  modelo?: string; contexto?: number
  salida?: string; conversacion: string; turno: string; nota?: string
  /** Id de la tarea-subagente que la lanzó (SDK `parent_task_id`, 14 oct 2026). Ausente = hilo principal de Levy o registro viejo. */
  padre?: string
}
/** Proceso = un comando en segundo plano (14 oct 2026, Daniel: «muchos son procesos de la terminal… debería decir X agentes
 *  y Y procesos»). No conversa ni gasta tokens: se cuenta aparte y se muestra bajo el agente que lo lanzó. */
export const esProceso = (t: Pick<TareaInterna, 'tipo'>) => t.tipo === 'comando'
export interface Trabajos { fuente?: 'motor' | 'sfterm-gate' | 'ninguna'; sfterm: boolean; motor?: Motor; topes?: Topes; internas?: TareaInterna[]; terminales: Terminal[]; servidores: Servidor[]; servicios: Servicio[]; procesos?: Proceso[]; planes?: PlanPendiente[]; leidoEn: string; error?: string }
/** Lo que el daemon lee de la transcripción de un subagente (`DetalleSubagente` en `arbrain/server/src/cabina/internos.ts`). */
export interface DetalleSubagente {
  encargo?: string; modelo?: string; contexto?: number
  /** Sus últimos mensajes de texto, del más viejo al más nuevo. */
  dicho: string[]
  /** Su último mensaje de texto: el informe final cuando ya terminó. */
  final?: string
  herramientas: { nombre: string; n: number }[]; usos: number
  acciones: { herramienta: string; objetivo?: string }[]
  parcial?: boolean
}
export interface Salida { id: string; descripcion: string; estado: EstadoInterna; texto: string; fuente: 'archivo' | 'resultado' | 'resumen'; detalle?: DetalleSubagente }

/** Una URL por nivel de detalle: la vista y el panel con las mismas líneas comparten lectura (useFuente). */
export const urlTrabajos = (lineas = 6) => `/api/cabina/trabajos?lineas=${lineas}`
export const urlSalida = (id: string, lineas = 80) => `/api/cabina/salida?tarea=${encodeURIComponent(id)}&lineas=${lineas}`

const HARNESS = /^(claude|codex|opencode|qwen|gemini|crush|pi|node)$/i
/** Agente = algo que conversa: lo lanzó Levy, el lector encontró su conversación, su TUI
 *  trabaja o espera, o corre un harness conocido. Lo demás es una shell. */
export const esAgente = (t: Terminal) => !!t.subagente || !!t.conversacion || t.estado !== 'terminal' || HARNESS.test(t.proc)
/** «Te pregunta algo» manda sobre «terminó»: el lector ve si el turno acabó en pregunta, y el servidor ve los
 *  diálogos (AskUserQuestion, permisos) de los subagentes de Levy, que dejan el turno «trabajando». */
export const preguntaAlgo = (t: Terminal) => !!t.conversacion?.pregunta && t.estado === 'esperando' || !!t.subagente?.pregunta
/** La pregunta de un subagente de Levy es primero de Levy (5 oct 2026): a Daniel solo le toca si subió (`escalado`). */
export const esperaALevy = (t: Terminal) => !!t.subagente && !t.subagente.escalado && preguntaAlgo(t)
export const estadoEnPalabras = (t: Terminal) => esperaALevy(t) ? 'Le preguntó a Levy' : preguntaAlgo(t) ? 'Te pregunta algo' : t.estado === 'trabajando' ? 'Trabajando' : t.estado === 'esperando' ? 'Terminó' : 'Terminal lista'
/** Lo último que dijo el agente según su conversación real (no la pantalla). */
export const ultimaRespuesta = (t: Terminal) => t.conversacion ? [...t.conversacion.mensajes].reverse().find(m => m.rol === 'assistant' && m.texto) ?? null : null

/** Una línea de pantalla en palabras: sin el árbol del TUI («└ Running…»), sin el reloj
 *  («(15s · timeout 10m)», «(ctrl+o to expand)») y sin las preguntas del propio CLI
 *  («How is Claude doing this session?»), que no son lo que hace el agente. */
const RUIDO_CLI = /How is Claude doing this session|^\s*(Tip:|\? for shortcuts)|bypass permissions on|accept edits on/i
export function lineaLimpia(a: string | null | undefined): string | null {
  if (!a || RUIDO_CLI.test(a)) return null
  const l = a.replace(/[└├│⎿─┌┐┘┬┴]+/g, ' ').replace(/\s*\((?:\d+\s*[sm]\b|ctrl\+o|esc )[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim()
  return l.length >= 3 ? l : null
}

export const ESTADO_INTERNA: Record<EstadoInterna, string> = { trabajando: 'Trabajando', completada: 'Terminó', 'falló': 'Falló', detenida: 'Detenida' }
export const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
export const esDeHoy = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) === hoyMx()

/** Lo que trabaja para Daniel ahora, corra donde corra (terminal del motor, SFTerm o un turno de Levy). */
/** `agentes` = sesiones y subagentes (conversan, gastan tokens); `procesos` = comandos en segundo plano; `total` = algo trabaja. */
export function trabajandoAhora(d: Trabajos | undefined) {
  if (!d) return { agentes: 0, procesos: 0, total: 0 }
  const vivas = (d.internas ?? []).filter(t => t.estado === 'trabajando')
  const procesos = vivas.filter(esProceso).length
  const agentes = d.terminales.filter(t => esAgente(t) && t.estado === 'trabajando').length + vivas.length - procesos
  return { agentes, procesos, total: agentes + procesos }
}

/** Lo que trabaja para UNA conversación (5 oct 2026, Daniel: «solo los agentes de esta conversación»): los agentes que
 *  Levy lanzó desde ella (`subagente.origen`) y los subagentes internos de sus turnos. Los ids pueden venir con `sdk:`. */
export function trabajandoEn(d: Trabajos | undefined, conversacion: string | null | undefined): number {
  if (!d || !conversacion) return 0
  const id = (x: string | null | undefined) => (x ?? '').replace(/^sdk:/, '')
  const esta = id(conversacion)
  const agentes = d.terminales.filter(t => t.estado === 'trabajando' && id(t.subagente?.origen) === esta).length
  // Solo agentes: los comandos en segundo plano son procesos de esos agentes, no agentes (14 oct 2026).
  const internas = (d.internas ?? []).filter(t => t.estado === 'trabajando' && !esProceso(t) && id(t.conversacion) === esta).length
  return agentes + internas
}

/** De dónde salió la lectura, para decirlo en una línea. */
export function fuenteEnPalabras(d: Trabajos, cliente = false): string {
  // Edición cliente (29 oct 2026): sus subagentes los lee su propia Arbrain; no hay motor, SFTerm ni Studio.
  if (cliente) return 'tu Arbrain'
  if (d.fuente === 'motor') return 'motor de Arbrain'
  if (d.fuente === 'sfterm-gate') return 'terminal de respaldo (el motor no respondió)'
  if (d.fuente === 'ninguna') return 'sin terminales: ni el motor ni el respaldo respondieron'
  return d.sfterm ? 'terminal de respaldo' : 'sin terminales'
}
/** Dónde vive una terminal, para la ficha. */
export const dondeVive = (t: Terminal) => t.origen === 'sin-pantalla' ? 'Proceso propio, sin pantalla' : t.origen === 'motor' ? 'Motor de Arbrain' : t.origen === 'sfterm-ptyd' ? 'Abierta en SFTerm, la lleva el motor' : 'SFTerm'
