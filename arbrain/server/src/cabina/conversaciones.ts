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
