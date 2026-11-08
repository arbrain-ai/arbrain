/**
 * Conversación nueva fijada (31 oct 2026). El dueño: «abre una nueva conversación y que pueda verla fijada… en el campo de
 * conversaciones a la izquierda». La herramienta `conversacion` de la Cabina crea una conversación REAL del chat (fila de
 * chat_sessions, mismo dueño y cuenta que la conversación desde donde Levy la pide), fijada, y le manda un primer mensaje
 * que el runtime procesa como uno tecleado: Levy responde y sigue trabajando ahí.
 *
 * Por qué un pedido en SQLite y no una llamada directa: el MCP de la Cabina corre como hijo del CLI y no tiene (ni debe
 * tener: edición cliente, cliente/cofre.ts) el token del servidor ni el de la web. El MCP deja el pedido en el store del
 * agent-server; el pulso del agent-server (el de los despertadores) lo atiende con SU token: la web crea la fila y entrega
 * el mensaje al daemon por /chat/stream, el mismo camino que un mensaje escrito en la app. El MCP espera el resultado.
 */
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { DUENO, DUENO_M } from '../dueno.js'

export interface ConversacionScope { owner: string; account: string; conversationId: string }
export type EstadoConversacion = 'pendiente' | 'creando' | 'hecha' | 'error'
export interface PedidoConversacion {
  id: string; owner: string; account: string; origen: string
  titulo: string; mensaje: string; turnId: string
  estado: EstadoConversacion; intentos: number; motivo: string | null
  creadoAt: number; hechoAt: number | null
}

/** Topes contra bucles (una conversación que abre otra que abre otra…). */
export const TOPES_CONVERSACION = { porHoraPorConversacion: 6, porHoraPorDueno: 20, intentos: 5, titulo: 80, mensaje: 6000 }

export class ConversacionInvalida extends Error {}

export interface EntradaConversacion { titulo: string; mensaje: string; abrir: boolean }

/** Valida lo que manda Levy. */
export function parseConversacion(raw: unknown): EntradaConversacion {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const titulo = typeof o.titulo === 'string' ? o.titulo.replace(/\s+/g, ' ').trim() : ''
  const mensaje = typeof o.mensaje === 'string' ? o.mensaje.trim() : ''
  if (!titulo) throw new ConversacionInvalida('conversacion necesita titulo (el nombre que verá en Fijadas).')
  if (titulo.length > TOPES_CONVERSACION.titulo) throw new ConversacionInvalida(`titulo pasa de ${TOPES_CONVERSACION.titulo} caracteres.`)
  if (!mensaje) throw new ConversacionInvalida('conversacion necesita mensaje: el primer mensaje, el que la otra conversación trabaja.')
  if (mensaje.length > TOPES_CONVERSACION.mensaje) throw new ConversacionInvalida(`mensaje pasa de ${TOPES_CONVERSACION.mensaje} caracteres.`)
  // El daemon trata «/algo» como comando de la conversación, no como encargo (chat-envelope.ts).
  if (mensaje.startsWith('/')) throw new ConversacionInvalida('mensaje no puede empezar con «/»: sería un comando, no un encargo.')
  if (o.abrir != null && typeof o.abrir !== 'boolean') throw new ConversacionInvalida('abrir debe ser true o false.')
  return { titulo, mensaje, abrir: o.abrir === true }
}

export class ConversacionesNuevas {
  constructor(private db: Database.Database, private clock: () => number = Date.now) {
    db.pragma('busy_timeout = 5000')
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversaciones_nuevas (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL, account TEXT NOT NULL, origen TEXT NOT NULL,
        titulo TEXT NOT NULL, mensaje TEXT NOT NULL, turn_id TEXT NOT NULL,
        estado TEXT NOT NULL CHECK(estado IN ('pendiente','creando','hecha','error')),
        intentos INTEGER NOT NULL DEFAULT 0, motivo TEXT,
        creado_at INTEGER NOT NULL, hecho_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS chat_conversaciones_nuevas_estado ON chat_conversaciones_nuevas(estado, creado_at);
      CREATE INDEX IF NOT EXISTS chat_conversaciones_nuevas_origen ON chat_conversaciones_nuevas(owner, account, origen, creado_at);
    `)
  }

  /** Deja el pedido. El id de la conversación y el del primer turno nacen aquí: reintentar nunca duplica nada. */
  pedir(scope: ConversacionScope, entrada: Pick<EntradaConversacion, 'titulo' | 'mensaje'>): PedidoConversacion {
    for (const v of [scope.owner, scope.account, scope.conversationId]) if (typeof v !== 'string' || !v.trim()) throw new ConversacionInvalida('Las conversaciones nuevas solo se abren desde una conversación del chat de Arbrain.')
    const ahora = this.clock(), hora = ahora - 3_600_000
    const enEsta = (this.db.prepare('SELECT COUNT(*) AS n FROM chat_conversaciones_nuevas WHERE owner = ? AND account = ? AND origen = ? AND creado_at > ?')
      .get(scope.owner, scope.account, scope.conversationId, hora) as { n: number }).n
    if (enEsta >= TOPES_CONVERSACION.porHoraPorConversacion) throw new ConversacionInvalida(`Esta conversación ya abrió ${enEsta} en la última hora (tope ${TOPES_CONVERSACION.porHoraPorConversacion}). Posible bucle.`)
    const delDueno = (this.db.prepare('SELECT COUNT(*) AS n FROM chat_conversaciones_nuevas WHERE owner = ? AND creado_at > ?').get(scope.owner, hora) as { n: number }).n
    if (delDueno >= TOPES_CONVERSACION.porHoraPorDueno) throw new ConversacionInvalida(`Ya se abrieron ${delDueno} conversaciones en la última hora (tope ${TOPES_CONVERSACION.porHoraPorDueno}).`)
    const id = randomUUID()
    this.db.prepare(`INSERT INTO chat_conversaciones_nuevas (id, owner, account, origen, titulo, mensaje, turn_id, estado, creado_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
      .run(id, scope.owner, scope.account, scope.conversationId, entrada.titulo, entrada.mensaje, randomUUID(), ahora)
    return this.get(id)!
  }

  get(id: string): PedidoConversacion | null {
    const row = this.db.prepare('SELECT * FROM chat_conversaciones_nuevas WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? decode(row) : null
  }

  /** Toma los pendientes (y los que un servidor anterior dejó a medias hace más de un minuto) marcándolos «creando». */
  tomar(limit = 5): PedidoConversacion[] {
    return this.db.transaction(() => {
      const filas = (this.db.prepare(`SELECT * FROM chat_conversaciones_nuevas WHERE estado = 'pendiente' OR (estado = 'creando' AND creado_at < ?) ORDER BY creado_at LIMIT ?`)
        .all(this.clock() - 60_000, limit) as Array<Record<string, unknown>>).map(decode)
      const marcar = this.db.prepare(`UPDATE chat_conversaciones_nuevas SET estado = 'creando', intentos = intentos + 1 WHERE id = ?`)
      for (const p of filas) marcar.run(p.id)
      return filas.map(p => ({ ...p, estado: 'creando' as const, intentos: p.intentos + 1 }))
    }).immediate()
  }

  hecha(id: string): void {
    this.db.prepare(`UPDATE chat_conversaciones_nuevas SET estado = 'hecha', motivo = NULL, hecho_at = ? WHERE id = ?`).run(this.clock(), id)
  }

  /** Un fallo vuelve a la fila hasta agotar los intentos; `definitivo` (la web lo rechazó) lo cierra en el acto. */
  fallo(p: PedidoConversacion, motivo: string, definitivo = false): void {
    const fin = definitivo || p.intentos >= TOPES_CONVERSACION.intentos
    this.db.prepare(`UPDATE chat_conversaciones_nuevas SET estado = ?, motivo = ? WHERE id = ?`).run(fin ? 'error' : 'pendiente', motivo.slice(0, 400), p.id)
  }
}

function decode(row: Record<string, unknown>): PedidoConversacion {
  return {
    id: String(row.id), owner: String(row.owner), account: String(row.account), origen: String(row.origen),
    titulo: String(row.titulo), mensaje: String(row.mensaje), turnId: String(row.turn_id),
    estado: row.estado as EstadoConversacion, intentos: Number(row.intentos), motivo: row.motivo == null ? null : String(row.motivo),
    creadoAt: Number(row.creado_at), hechoAt: row.hecho_at == null ? null : Number(row.hecho_at),
  }
}

/** Lo que el pulso le manda a la web (arbrain/src/app/api/cabina/conversacion/route.ts). */
export interface EnvioConversacion { id: string; ownerId: string; account: string; title: string; message: string; turnId: string }
/** Respuesta de la web: `ok`, o `definitivo` si reintentar no cambiaría nada (dueño o cuenta inválidos). */
export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string; definitivo?: boolean }
export type EnviarConversacion = (e: EnvioConversacion) => Promise<ResultadoEnvio>

/** Pulso del agent-server: atiende los pedidos. Devuelve cuántas conversaciones quedaron creadas con su primer mensaje. */
export async function atenderConversaciones(store: ConversacionesNuevas, enviar: EnviarConversacion, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  let n = 0
  for (const p of store.tomar()) {
    try {
      const r = await enviar({ id: p.id, ownerId: p.owner, account: p.account, title: p.titulo, message: p.mensaje, turnId: p.turnId })
      if (r.ok) { store.hecha(p.id); n++; log.info({ conversacion: p.id, origen: p.origen, turnId: p.turnId }, 'conversacion nueva: creada y con su primer mensaje') }
      else { store.fallo(p, r.motivo, r.definitivo); log.warn({ conversacion: p.id, motivo: r.motivo, intento: p.intentos }, 'conversacion nueva: la web no la creó') }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'sin respuesta de la web'
      store.fallo(p, motivo)
      log.warn({ conversacion: p.id, motivo, intento: p.intentos }, 'conversacion nueva: la web no respondió')
    }
  }
  return n
}

/** El envío real: la web de Arbrain con el token servidor-a-servidor (el mismo de /api/chat/complete). */
export function enviarPorLaWeb(origen: string, token: string, f: typeof fetch = fetch): EnviarConversacion {
  return async (e) => {
    if (!origen || !token) return { ok: false, motivo: 'este servidor no tiene la dirección o el token de la web de Arbrain', definitivo: true }
    const r = await f(`${origen}/api/cabina/conversacion`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(e), signal: AbortSignal.timeout(30_000),
    })
    const body = await r.json().catch(() => ({})) as { error?: string }
    if (r.ok) return { ok: true }
    return { ok: false, motivo: body.error ?? `la web respondió ${r.status}`, definitivo: r.status === 400 || r.status === 401 || r.status === 403 }
  }
}

/*
 * Orquestar conversaciones EXISTENTES (6 nov 2026). El dueño: «que puedas cambiar el nombre de las conversaciones así como
 * fijar o desfijar conversaciones y enviar mensajes a otras conversaciones de modo que pueda pasar de verlas de gris a
 * amarillo y luego a morado». La herramienta `conversacion` gana `accion`: crear (lo de arriba, el default) | listar |
 * renombrar | fijar | desfijar | enviar.
 *
 * Mismo patrón que crear: el MCP deja la orden en SQLite y espera; el pulso del agent-server la atiende. Las filas
 * (título, fijada, semáforo) las lee y escribe la web con el token servidor-a-servidor (/api/cabina/conversaciones), porque
 * la base es suya (Supabase en la instalación original, la base local en la edición cliente). `enviar` acepta el turno en
 * el journal de este proceso, como un despertador: es un turno que el dueño NO escribió (sintético), así que nunca cuenta
 * como su «sí» a un permiso, no entra a su memoria semántica, cede el paso a sus mensajes y la web lo pinta con su origen,
 * «Levy, desde «<conversación que lo manda>»», nunca como burbuja suya. Solo conversaciones del mismo dueño; sin borrar ni
 * archivar.
 */

export const ACCIONES_CONVERSACION = ['crear', 'listar', 'renombrar', 'fijar', 'desfijar', 'enviar'] as const
export type AccionOrden = 'listar' | 'renombrar' | 'fijar' | 'desfijar' | 'enviar'
export type EstadoOrden = EstadoConversacion
/** Topes de `enviar`, iguales o más estrictos que los de crear: el del dueño suma lo creado y lo enviado. */
export const TOPES_ENVIO = { porHoraPorConversacion: 6, porHoraPorDestino: 6, porHoraPorDueno: 20, listar: 60 }
export interface EntradaOrden { accion: AccionOrden; id?: string; titulo?: string; mensaje?: string }
export interface PedidoOrden {
  id: string; owner: string; account: string; origen: string
  accion: AccionOrden; objetivo: string | null; titulo: string | null; mensaje: string | null; turnId: string
  estado: EstadoOrden; intentos: number; motivo: string | null; resultado: unknown
  creadoAt: number; hechoAt: number | null
}

const UUID_COMPLETO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Un id completo o su prefijo de al menos 8 caracteres («d2348403»): el pulso lo resuelve contra las del dueño. */
const ID_O_PREFIJO = /^[0-9a-f]{8}[0-9a-f-]{0,28}$/i

/** Valida una orden. `null` = accion crear (sin accion o «crear»): la valida parseConversacion. */
export function parseOrden(raw: unknown): EntradaOrden | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (o.accion == null || o.accion === '' || o.accion === 'crear') return null
  if (typeof o.accion !== 'string' || !(ACCIONES_CONVERSACION as readonly string[]).includes(o.accion)) throw new ConversacionInvalida(`accion debe ser ${ACCIONES_CONVERSACION.join(', ')}.`)
  const accion = o.accion as AccionOrden
  if (accion === 'listar') return { accion }
  const id = typeof o.id === 'string' ? o.id.trim().toLowerCase() : ''
  if (!id) throw new ConversacionInvalida(`${accion} necesita id (el que da conversacion {accion:"listar"}).`)
  if (!ID_O_PREFIJO.test(id)) throw new ConversacionInvalida('id inválido: el id de la conversación o sus primeros 8 caracteres.')
  if (accion === 'renombrar') {
    const titulo = typeof o.titulo === 'string' ? o.titulo.replace(/\s+/g, ' ').trim() : ''
    if (!titulo) throw new ConversacionInvalida('renombrar necesita titulo.')
    if (titulo.length > TOPES_CONVERSACION.titulo) throw new ConversacionInvalida(`titulo pasa de ${TOPES_CONVERSACION.titulo} caracteres.`)
    return { accion, id, titulo }
  }
  if (accion === 'enviar') {
    const mensaje = typeof o.mensaje === 'string' ? o.mensaje.trim() : ''
    if (!mensaje) throw new ConversacionInvalida('enviar necesita mensaje.')
    if (mensaje.length > TOPES_CONVERSACION.mensaje) throw new ConversacionInvalida(`mensaje pasa de ${TOPES_CONVERSACION.mensaje} caracteres.`)
    if (mensaje.startsWith('/')) throw new ConversacionInvalida('mensaje no puede empezar con «/»: sería un comando, no un encargo.')
    return { accion, id, mensaje }
  }
  return { accion, id }
}

export class OrdenesConversacion {
  constructor(private db: Database.Database, private clock: () => number = Date.now) {
    db.pragma('busy_timeout = 5000')
    // La tabla de crear también: el tope del dueño suma las dos.
    new ConversacionesNuevas(db, clock)
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversaciones_ordenes (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL, account TEXT NOT NULL, origen TEXT NOT NULL,
        accion TEXT NOT NULL CHECK(accion IN ('listar','renombrar','fijar','desfijar','enviar')),
        objetivo TEXT, titulo TEXT, mensaje TEXT, turn_id TEXT NOT NULL,
        estado TEXT NOT NULL CHECK(estado IN ('pendiente','creando','hecha','error')),
        intentos INTEGER NOT NULL DEFAULT 0, motivo TEXT, resultado TEXT,
        creado_at INTEGER NOT NULL, hecho_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS chat_conversaciones_ordenes_estado ON chat_conversaciones_ordenes(estado, creado_at);
      CREATE INDEX IF NOT EXISTS chat_conversaciones_ordenes_origen ON chat_conversaciones_ordenes(owner, accion, creado_at);
    `)
  }

  /** Deja la orden. El turno de un envío nace aquí: reintentar nunca manda dos veces. */
  pedir(scope: ConversacionScope, entrada: EntradaOrden): PedidoOrden {
    for (const v of [scope.owner, scope.account, scope.conversationId]) if (typeof v !== 'string' || !v.trim()) throw new ConversacionInvalida('Las conversaciones solo se orquestan desde una conversación del chat de Arbrain.')
    const ahora = this.clock(), hora = ahora - 3_600_000
    const contar = (sql: string, ...args: unknown[]) => (this.db.prepare(sql).get(...args) as { n: number }).n
    if (entrada.accion === 'enviar') {
      const objetivo = entrada.id!
      if (scope.conversationId.toLowerCase() === objetivo || (!UUID_COMPLETO.test(objetivo) && scope.conversationId.toLowerCase().startsWith(objetivo))) throw new ConversacionInvalida('No puedes enviarte un mensaje a esta misma conversación.')
      const desdeEsta = contar(`SELECT COUNT(*) AS n FROM chat_conversaciones_ordenes WHERE owner = ? AND accion = 'enviar' AND origen = ? AND creado_at > ?`, scope.owner, scope.conversationId, hora)
      if (desdeEsta >= TOPES_ENVIO.porHoraPorConversacion) throw new ConversacionInvalida(`Esta conversación ya envió ${desdeEsta} mensajes en la última hora (tope ${TOPES_ENVIO.porHoraPorConversacion}). Posible bucle.`)
      const aEsa = contar(`SELECT COUNT(*) AS n FROM chat_conversaciones_ordenes WHERE owner = ? AND accion = 'enviar' AND objetivo = ? AND creado_at > ?`, scope.owner, objetivo, hora)
      if (aEsa >= TOPES_ENVIO.porHoraPorDestino) throw new ConversacionInvalida(`Esa conversación ya recibió ${aEsa} mensajes de Levy en la última hora (tope ${TOPES_ENVIO.porHoraPorDestino}). Posible bucle.`)
      const delDueno = contar(`SELECT COUNT(*) AS n FROM chat_conversaciones_ordenes WHERE owner = ? AND accion = 'enviar' AND creado_at > ?`, scope.owner, hora)
        + contar('SELECT COUNT(*) AS n FROM chat_conversaciones_nuevas WHERE owner = ? AND creado_at > ?', scope.owner, hora)
      if (delDueno >= TOPES_ENVIO.porHoraPorDueno) throw new ConversacionInvalida(`Ya se enviaron o abrieron ${delDueno} conversaciones en la última hora (tope ${TOPES_ENVIO.porHoraPorDueno}).`)
    } else {
      // Renombrar, fijar y listar no despiertan a nadie; el tope solo frena un bucle que martille la web.
      const n = contar('SELECT COUNT(*) AS n FROM chat_conversaciones_ordenes WHERE owner = ? AND origen = ? AND creado_at > ?', scope.owner, scope.conversationId, hora)
      if (n >= TOPES_ENVIO.listar) throw new ConversacionInvalida(`Esta conversación ya hizo ${n} operaciones sobre conversaciones en la última hora (tope ${TOPES_ENVIO.listar}).`)
    }
    const id = randomUUID()
    this.db.prepare(`INSERT INTO chat_conversaciones_ordenes (id, owner, account, origen, accion, objetivo, titulo, mensaje, turn_id, estado, creado_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
      .run(id, scope.owner, scope.account, scope.conversationId, entrada.accion, entrada.id ?? null, entrada.titulo ?? null, entrada.mensaje ?? null, randomUUID(), ahora)
    return this.get(id)!
  }

  get(id: string): PedidoOrden | null {
    const row = this.db.prepare('SELECT * FROM chat_conversaciones_ordenes WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? decodeOrden(row) : null
  }

  /** Toma las pendientes (y las que un servidor anterior dejó a medias hace más de un minuto) marcándolas «creando». */
  tomar(limit = 10): PedidoOrden[] {
    return this.db.transaction(() => {
      const filas = (this.db.prepare(`SELECT * FROM chat_conversaciones_ordenes WHERE estado = 'pendiente' OR (estado = 'creando' AND creado_at < ?) ORDER BY creado_at LIMIT ?`)
        .all(this.clock() - 60_000, limit) as Array<Record<string, unknown>>).map(decodeOrden)
      const marcar = this.db.prepare(`UPDATE chat_conversaciones_ordenes SET estado = 'creando', intentos = intentos + 1 WHERE id = ?`)
      for (const p of filas) marcar.run(p.id)
      return filas.map(p => ({ ...p, estado: 'creando' as const, intentos: p.intentos + 1 }))
    }).immediate()
  }

  hecha(id: string, resultado: unknown): void {
    this.db.prepare(`UPDATE chat_conversaciones_ordenes SET estado = 'hecha', motivo = NULL, resultado = ?, hecho_at = ? WHERE id = ?`).run(JSON.stringify(resultado ?? null), this.clock(), id)
  }

  fallo(p: PedidoOrden, motivo: string, definitivo = false): void {
    const fin = definitivo || p.intentos >= TOPES_CONVERSACION.intentos
    this.db.prepare(`UPDATE chat_conversaciones_ordenes SET estado = ?, motivo = ? WHERE id = ?`).run(fin ? 'error' : 'pendiente', motivo.slice(0, 400), p.id)
  }
}

function decodeOrden(row: Record<string, unknown>): PedidoOrden {
  const txt = (v: unknown) => v == null ? null : String(v)
  let resultado: unknown = null
  try { resultado = row.resultado == null ? null : JSON.parse(String(row.resultado)) } catch { resultado = null }
  return {
    id: String(row.id), owner: String(row.owner), account: String(row.account), origen: String(row.origen),
    accion: row.accion as AccionOrden, objetivo: txt(row.objetivo), titulo: txt(row.titulo), mensaje: txt(row.mensaje), turnId: String(row.turn_id),
    estado: row.estado as EstadoOrden, intentos: Number(row.intentos), motivo: txt(row.motivo), resultado,
    creadoAt: Number(row.creado_at), hechoAt: row.hecho_at == null ? null : Number(row.hecho_at),
  }
}

/** Una fila de chat_sessions tal como la devuelve la web (arbrain/src/features/cabina/conversaciones-orquesta.ts). */
export interface FilaConversacion {
  id: string; title: string | null; account: string | null; is_favorite: boolean; pinned_position: number | null
  last_role: string | null; last_message_at: string | null; last_read_at: string | null; updated_at: string | null; archived_at: string | null
}

/**
 * El punto de la barra izquierda (arbrain/src/features/chat/lib/session-status.ts › deriveSessionState), con las mismas dos
 * fuentes: el journal dice si Levy trabaja o espera respuesta; las columnas de la fila, si terminó y no la ha visto.
 * gris = quieta y vista · amarillo = Levy trabajando · azul = Levy le hizo una pregunta · morado = lista, sin ver.
 */
export type Semaforo = 'gris' | 'amarillo' | 'azul' | 'morado'
export function semaforoDe(fila: Pick<FilaConversacion, 'last_role' | 'last_message_at' | 'last_read_at'>, turnoActivo?: string | null): Semaforo {
  if (turnoActivo === 'waiting') return 'azul'
  if (turnoActivo) return 'amarillo'
  if (fila.last_role !== 'assistant') return 'gris'
  const ultimo = fila.last_message_at ? Date.parse(fila.last_message_at) : 0
  const visto = fila.last_read_at ? Date.parse(fila.last_read_at) : 0
  return ultimo > visto ? 'morado' : 'gris'
}
export const SEMAFORO_EN_PALABRAS: Record<Semaforo, string> = { gris: 'gris (quieta, ya vista)', amarillo: 'amarillo (Levy trabajando)', azul: 'azul (Levy espera su respuesta)', morado: 'morado (lista, sin ver)' }

/** Lo que el pulso le pide a la web y lo que contesta. */
export type PedidoWebOrden =
  | { accion: 'listar'; ownerId: string; ids?: string[]; limite?: number }
  | { accion: 'renombrar'; ownerId: string; id: string; titulo: string }
  | { accion: 'fijar' | 'desfijar'; ownerId: string; id: string }
export type RespuestaWebOrden = { ok: true; conversaciones?: FilaConversacion[]; conversacion?: FilaConversacion } | { ok: false; motivo: string; definitivo?: boolean }
export type WebOrden = (p: PedidoWebOrden) => Promise<RespuestaWebOrden>

/** Del journal y del runtime de este proceso: lo que `enviar` necesita para aceptar el turno como un despertador. */
export interface DepsOrdenes {
  web: WebOrden
  /** Turnos sin terminar del dueño (journal.activeTurns): conversationId → status. */
  activos: (owner: string) => Array<{ conversationId: string; status: string }>
  turnoExiste: (identity: { owner: string; account: string; conversationId: string; turnId: string }) => boolean
  /** El último input aceptado en esa conversación (modelo, esfuerzo y selección se heredan de ahí). */
  previo: (owner: string, account: string, conversationId: string) => ChatJobInputLike | undefined
  /** Sin turno previo: la selección de modelo por defecto de esa cuenta (la que resolvería /chat/stream). */
  seleccion: (account: string, overrides: object) => Promise<Partial<ChatJobInputLike>>
  aceptar: (identity: { owner: string; account: string; conversationId: string; turnId: string }, input: Record<string, unknown>) => void
}
/** Lo mínimo de ChatJobInput que se hereda (sin importar chat-job: este módulo lo carga el MCP). */
export interface ChatJobInputLike { source?: 'mobile' | 'desktop'; overrides?: object; claudeSelection?: unknown; codexSelection?: unknown }

export interface ConversacionListada { id: string; titulo: string; estado: Semaforo; fijada: boolean; posicion: number | null; ultima: string | null; cuenta: string }
export interface ResultadoEnviar { turnId: string; destino: string; titulo: string; cuenta: string; desde: string; desdeTitulo: string }

class OrdenRechazada extends Error {}

/** Resuelve un id o prefijo contra las conversaciones del dueño; nunca devuelve una de otro. */
async function resolverConversacion(web: WebOrden, owner: string, id: string): Promise<FilaConversacion> {
  const r = await web(UUID_COMPLETO.test(id) ? { accion: 'listar', ownerId: owner, ids: [id] } : { accion: 'listar', ownerId: owner, limite: 200 })
  if (!r.ok) throw r.definitivo ? new OrdenRechazada(r.motivo) : new Error(r.motivo)
  const filas = (r.conversaciones ?? []).filter(f => f.id.toLowerCase().startsWith(id))
  if (!filas.length) throw new OrdenRechazada(`No hay una conversación de este dueño con id «${id}». Usa conversacion {accion:"listar"}.`)
  if (filas.length > 1) throw new OrdenRechazada(`«${id}» coincide con ${filas.length} conversaciones: usa el id completo.`)
  return filas[0]
}

/** Ordena como la barra: fijadas primero (las recién fijadas, sin posición, arriba), luego por último mensaje. */
export function ordenarComoLaBarra(filas: FilaConversacion[]): FilaConversacion[] {
  const t = (f: FilaConversacion) => Date.parse(f.last_message_at ?? f.updated_at ?? '') || 0
  return [...filas].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
    if (a.is_favorite) {
      const pa = a.pinned_position ?? -1, pb = b.pinned_position ?? -1
      if (pa !== pb) return pa - pb
    }
    return t(b) - t(a)
  })
}

const OVERRIDES_DE_FABRICA = { model: null, effort: null, fast: false, ultracode: false }

/** Pulso del agent-server: atiende las órdenes. Devuelve cuántas quedaron hechas. */
export async function atenderOrdenes(store: OrdenesConversacion, deps: DepsOrdenes, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<number> {
  let n = 0
  for (const p of store.tomar()) {
    try {
      const resultado = await ejecutarOrden(p, deps)
      store.hecha(p.id, resultado)
      n++
      log.info({ orden: p.id, accion: p.accion, origen: p.origen, objetivo: p.objetivo }, 'conversaciones: orden atendida')
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'sin respuesta de la web'
      store.fallo(p, motivo, error instanceof OrdenRechazada)
      log.warn({ orden: p.id, accion: p.accion, motivo, intento: p.intentos }, 'conversaciones: orden no atendida')
    }
  }
  return n
}

async function ejecutarOrden(p: PedidoOrden, deps: DepsOrdenes): Promise<unknown> {
  const exigir = (r: RespuestaWebOrden) => { if (!r.ok) throw r.definitivo ? new OrdenRechazada(r.motivo) : new Error(r.motivo); return r }
  if (p.accion === 'listar') {
    const r = exigir(await deps.web({ accion: 'listar', ownerId: p.owner, limite: 40 }))
    const activos = new Map(deps.activos(p.owner).map(t => [t.conversationId, t.status]))
    return ordenarComoLaBarra(r.conversaciones ?? []).map((f): ConversacionListada => ({
      id: f.id, titulo: f.title ?? '(sin título)', estado: semaforoDe(f, activos.get(f.id)), fijada: !!f.is_favorite,
      posicion: f.pinned_position ?? null, ultima: f.last_message_at ?? f.updated_at ?? null, cuenta: f.account ?? 'default',
    }))
  }
  const fila = await resolverConversacion(deps.web, p.owner, p.objetivo!)
  // Lo de antes se lee ANTES de escribir.
  const antes = { titulo: fila.title, fijada: !!fila.is_favorite }
  if (p.accion === 'renombrar') {
    const r = exigir(await deps.web({ accion: 'renombrar', ownerId: p.owner, id: fila.id, titulo: p.titulo! }))
    return { id: fila.id, antes: antes.titulo, titulo: r.conversacion?.title ?? p.titulo }
  }
  if (p.accion === 'fijar' || p.accion === 'desfijar') {
    const r = exigir(await deps.web({ accion: p.accion, ownerId: p.owner, id: fila.id }))
    return { id: fila.id, titulo: antes.titulo, fijada: r.conversacion?.is_favorite ?? p.accion === 'fijar', yaEstaba: antes.fijada === (p.accion === 'fijar') }
  }
  // enviar
  if (fila.id === p.origen) throw new OrdenRechazada('No puedes enviarte un mensaje a esta misma conversación.')
  if (fila.archived_at) throw new OrdenRechazada(`«${fila.title ?? fila.id}» está archivada: desarchívala primero (esta herramienta no archiva ni desarchiva).`)
  const cuenta = fila.account ?? 'default'
  const identity = { owner: p.owner, account: cuenta, conversationId: fila.id, turnId: p.turnId }
  // El título de la conversación que lo manda: el que ve el dueño en la barra.
  const origenR = UUID_COMPLETO.test(p.origen) ? await deps.web({ accion: 'listar', ownerId: p.owner, ids: [p.origen] }).catch(() => null) : null
  const desdeTitulo = (origenR?.ok && origenR.conversaciones?.[0]?.title) || 'otra conversación'
  const resultado: ResultadoEnviar = { turnId: p.turnId, destino: fila.id, titulo: fila.title ?? '(sin título)', cuenta, desde: p.origen, desdeTitulo }
  if (deps.turnoExiste(identity)) return resultado // reintento: ya entró
  const previo = deps.previo(p.owner, cuenta, fila.id)
  const overrides = previo?.overrides ?? OVERRIDES_DE_FABRICA
  const seleccion = previo?.claudeSelection || previo?.codexSelection
    ? { ...(previo.claudeSelection ? { claudeSelection: previo.claudeSelection } : {}), ...(previo.codexSelection ? { codexSelection: previo.codexSelection } : {}) }
    : await deps.seleccion(cuenta, overrides)
  deps.aceptar(identity, {
    message: mensajeEntreConversaciones(desdeTitulo, p.origen, p.mensaje!),
    source: previo?.source ?? 'desktop', overrides, ...seleccion,
    // Turno sintético por el camino del despertador (ver arriba): `tipo: 'conversacion'` y `desde` pintan su origen.
    despertador: { id: `c-${p.id.slice(0, 8)}`, texto: p.mensaje!, programadoPara: p.creadoAt, disparo: 1, tipo: 'conversacion', desde: { id: p.origen, titulo: desdeTitulo } },
  })
  return resultado
}

/** Lo que lee el turno de la conversación destino: quién lo manda, que no lo escribió el dueño, y el mensaje. La web
 * pinta solo lo que va después de la primera línea en blanco, bajo «Levy, desde «…»». */
export function mensajeEntreConversaciones(desdeTitulo: string, desdeId: string, mensaje: string): string {
  return [
    `[Mensaje de Levy desde tu conversación «${desdeTitulo}» (${desdeId}) · ${DUENO_M} no escribió este mensaje: lo manda esa otra conversación tuya, que no comparte tu contexto]`,
    `Trabájalo aquí como un encargo y respóndele a ${DUENO} en esta conversación. No le escribas de vuelta a la otra salvo que el mensaje lo pida.`,
    '',
    mensaje,
  ].join('\n')
}

/** El envío real a la web (arbrain/src/app/api/cabina/conversaciones/route.ts), con el mismo token que crear. */
export function ordenesPorLaWeb(origen: string, token: string, f: typeof fetch = fetch): WebOrden {
  return async (pedido) => {
    if (!origen || !token) return { ok: false, motivo: 'este servidor no tiene la dirección o el token de la web de Arbrain', definitivo: true }
    const r = await f(`${origen}/api/cabina/conversaciones`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido), signal: AbortSignal.timeout(20_000),
    })
    const body = await r.json().catch(() => ({})) as { error?: string; conversaciones?: FilaConversacion[]; conversacion?: FilaConversacion }
    if (r.ok) return { ok: true, ...(body.conversaciones ? { conversaciones: body.conversaciones } : {}), ...(body.conversacion ? { conversacion: body.conversacion } : {}) }
    // 404 = la web es de una versión sin esta ruta (o la conversación no es del dueño): reintentar no cambia nada.
    return { ok: false, motivo: body.error ?? (r.status === 404 ? 'la web de Arbrain aún no tiene /api/cabina/conversaciones (se despliega en reposo)' : `la web respondió ${r.status}`), definitivo: r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404 }
  }
}
