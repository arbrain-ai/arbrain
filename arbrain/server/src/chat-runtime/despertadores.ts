import { DUENO, DUENO_M } from '../dueno.js'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { ChatJournal } from './journal.js'
import type { ChatJobInput } from './chat-job.js'

/**
 * Despertadores de Levy (chat vivo, 3 oct 2026).
 *
 * «Despiértame en 5 min», «revisa cada hora», «a las 14:05 corre la QA». El `CronCreate` del SDK vive
 * dentro del proceso de Claude: no es durable y muere cuando el corredor se retira tras 30 min ocioso
 * (el de las 06:17 del 3 oct nunca disparó). Aquí el despertador es una fila en SQLite; el agent-server
 * (vivo por launchd) revisa cada pocos segundos y, al vencer, acepta un turno NORMAL en el journal de
 * esa conversación. Ese turno lo toma el corredor (o lo lanza si se había retirado), retoma la sesión
 * nativa y la respuesta se ve en vivo como cualquier otro turno. Sobrevive a reinicios de todo.
 */
export interface DespertadorScope { owner: string; account: string; conversationId: string }
export type EstadoDespertador = 'pendiente' | 'hecho' | 'cancelado' | 'frenado'
/** `subagente`: aviso del motor cuando un subagente lanzado con `delegar` desde esta conversación termina. */
/** `confirmacion`: la persona decidió algo de su cola de aprobaciones (edición cliente, cliente/cola.ts). */
export type TipoDespertador = 'despertador' | 'subagente' | 'confirmacion'
export interface Despertador extends DespertadorScope {
  id: string
  texto: string
  dueAt: number
  cadaMs: number | null
  restantes: number | null
  disparos: number
  estado: EstadoDespertador
  motivo: string | null
  creadoAt: number
  ultimoDisparoAt: number | null
  ultimoTurnId: string | null
  tipo: TipoDespertador
}

/** Topes contra bucles (un despertador que crea otro despertador cada minuto, para siempre). */
export const TOPES = {
  pendientesPorConversacion: 10,
  cadaMinimoMs: 5 * 60_000,
  recurrenteMaxDisparos: 48,
  horizonteMaxMs: 8 * 24 * 60 * 60_000,
  disparosPorHoraPorConversacion: 12,
  /** Un despertador que venció hace más de esto (servidor apagado) se dispara una vez y avisa del retraso. */
  retrasoAvisoMs: 2 * 60_000,
}

/** México dejó el horario de verano en 2022: America/Mexico_City es UTC-6 todo el año. */
const OFFSET_MX = '-06:00'

export class DespertadorInvalido extends Error {}

export interface CrearDespertador { texto: string; enMinutos?: number; aLas?: string; cadaMinutos?: number; veces?: number }

/** Resuelve «a las 14:05» (hoy o mañana, hora de México) o un ISO con zona. */
export function resolverHora(aLas: string, ahora: number): number {
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(aLas.trim())
  if (hhmm) {
    const h = Number(hhmm[1]), m = Number(hhmm[2])
    if (h > 23 || m > 59) throw new DespertadorInvalido('Hora inválida; usa HH:MM (24 h, hora de México).')
    const hoy = new Date(ahora - 6 * 3600_000).toISOString().slice(0, 10)
    let t = Date.parse(`${hoy}T${hhmm[1].padStart(2, '0')}:${hhmm[2]}:00${OFFSET_MX}`)
    if (t <= ahora) t += 24 * 3600_000
    return t
  }
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(aLas.trim())) throw new DespertadorInvalido('aLas debe ser HH:MM (hora de México) o un ISO con zona, p. ej. 2026-10-03T14:05:00-06:00.')
  const t = Date.parse(aLas.trim())
  if (!Number.isFinite(t)) throw new DespertadorInvalido('No entendí la fecha de aLas.')
  return t
}

export class Despertadores {
  constructor(private db: Database.Database, private clock: () => number = Date.now) {
    db.pragma('busy_timeout = 5000')
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_despertadores (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL, account TEXT NOT NULL, conversation_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        cada_ms INTEGER,
        restantes INTEGER,
        disparos INTEGER NOT NULL DEFAULT 0,
        estado TEXT NOT NULL CHECK(estado IN ('pendiente','hecho','cancelado','frenado')),
        motivo TEXT,
        creado_at INTEGER NOT NULL,
        ultimo_disparo_at INTEGER,
        ultimo_turn_id TEXT
      );
      CREATE INDEX IF NOT EXISTS chat_despertadores_vencen ON chat_despertadores(estado, due_at);
      CREATE INDEX IF NOT EXISTS chat_despertadores_conversacion ON chat_despertadores(owner, account, conversation_id, estado);
      CREATE TABLE IF NOT EXISTS chat_despertador_disparos (
        despertador_id TEXT NOT NULL, owner TEXT NOT NULL, account TEXT NOT NULL, conversation_id TEXT NOT NULL,
        turn_id TEXT NOT NULL, at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_despertador_disparos_conv ON chat_despertador_disparos(owner, account, conversation_id, at);
    `)
    const columnas = (db.prepare('PRAGMA table_info(chat_despertadores)').all() as Array<{ name: string }>).map(c => c.name)
    if (!columnas.includes('tipo')) db.exec(`ALTER TABLE chat_despertadores ADD COLUMN tipo TEXT NOT NULL DEFAULT 'despertador'`)
  }

  crear(scope: DespertadorScope, pedido: CrearDespertador): Despertador {
    for (const value of [scope.owner, scope.account, scope.conversationId]) if (typeof value !== 'string' || !value.trim()) throw new DespertadorInvalido('Falta la conversación del despertador.')
    const texto = typeof pedido.texto === 'string' ? pedido.texto.trim() : ''
    if (!texto) throw new DespertadorInvalido('El despertador necesita texto: qué debes hacer al despertar.')
    if (texto.length > 2000) throw new DespertadorInvalido('El texto del despertador pasa de 2000 caracteres.')
    const ahora = this.clock()
    const formas = [pedido.enMinutos !== undefined, pedido.aLas !== undefined].filter(Boolean).length
    if (formas !== 1 && pedido.cadaMinutos === undefined) throw new DespertadorInvalido('Indica UNA forma: enMinutos, aLas o cadaMinutos.')
    if (formas > 1) throw new DespertadorInvalido('Usa enMinutos o aLas, no ambos.')
    let cadaMs: number | null = null
    if (pedido.cadaMinutos !== undefined) {
      if (!Number.isFinite(pedido.cadaMinutos) || pedido.cadaMinutos * 60_000 < TOPES.cadaMinimoMs) throw new DespertadorInvalido(`cadaMinutos mínimo ${TOPES.cadaMinimoMs / 60_000}.`)
      cadaMs = Math.round(pedido.cadaMinutos * 60_000)
    }
    let dueAt: number
    if (pedido.enMinutos !== undefined) {
      if (!Number.isFinite(pedido.enMinutos) || pedido.enMinutos <= 0) throw new DespertadorInvalido('enMinutos debe ser mayor que 0.')
      dueAt = ahora + Math.round(pedido.enMinutos * 60_000)
    } else if (pedido.aLas !== undefined) dueAt = resolverHora(String(pedido.aLas), ahora)
    else dueAt = ahora + cadaMs!
    if (dueAt - ahora > TOPES.horizonteMaxMs) throw new DespertadorInvalido('Más de 8 días: para eso usa el calendario o una rutina del servidor.')
    if (dueAt < ahora - 1000) throw new DespertadorInvalido('Esa hora ya pasó.')
    let restantes: number | null = null
    if (cadaMs) {
      const veces = pedido.veces === undefined ? TOPES.recurrenteMaxDisparos : Math.floor(pedido.veces)
      if (!Number.isFinite(veces) || veces < 1) throw new DespertadorInvalido('veces debe ser 1 o más.')
      restantes = Math.min(veces, TOPES.recurrenteMaxDisparos)
    } else if (pedido.veces !== undefined && pedido.veces !== 1) throw new DespertadorInvalido('veces solo aplica con cadaMinutos.')
    const pendientes = (this.db.prepare(`SELECT COUNT(*) AS n FROM chat_despertadores WHERE owner = ? AND account = ? AND conversation_id = ? AND estado = 'pendiente'`)
      .get(scope.owner, scope.account, scope.conversationId) as { n: number }).n
    if (pendientes >= TOPES.pendientesPorConversacion) throw new DespertadorInvalido(`Esta conversación ya tiene ${pendientes} despertadores pendientes (tope ${TOPES.pendientesPorConversacion}). Cancela alguno antes.`)
    const id = `d-${randomUUID().slice(0, 8)}`
    this.db.prepare(`INSERT INTO chat_despertadores (id, owner, account, conversation_id, texto, due_at, cada_ms, restantes, estado, creado_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
      .run(id, scope.owner, scope.account, scope.conversationId, texto, dueAt, cadaMs, restantes, ahora)
    return this.get(id)!
  }

  /** Aviso que vence YA (subagente del motor que terminó): mismo camino que un despertador, sin el tope de
   * pendientes (no los programa Levy) pero sí con el de disparos por hora al disparar. */
  avisar(scope: DespertadorScope, texto: string, tipo: TipoDespertador = 'subagente'): Despertador {
    for (const value of [scope.owner, scope.account, scope.conversationId]) if (typeof value !== 'string' || !value.trim()) throw new DespertadorInvalido('Falta la conversación del aviso.')
    const limpio = texto.trim().slice(0, 6000)
    if (!limpio) throw new DespertadorInvalido('El aviso necesita texto.')
    const id = `${tipo === 'subagente' ? 's' : tipo === 'confirmacion' ? 'c' : 'd'}-${randomUUID().slice(0, 8)}`
    const ahora = this.clock()
    this.db.prepare(`INSERT INTO chat_despertadores (id, owner, account, conversation_id, texto, due_at, estado, creado_at, tipo) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`)
      .run(id, scope.owner, scope.account, scope.conversationId, limpio, ahora, ahora, tipo)
    return this.get(id)!
  }

  get(id: string): Despertador | null {
    const row = this.db.prepare('SELECT * FROM chat_despertadores WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? decode(row) : null
  }

  listar(scope: DespertadorScope, todos = false): Despertador[] {
    return (this.db.prepare(`SELECT * FROM chat_despertadores WHERE owner = ? AND account = ? AND conversation_id = ? ${todos ? '' : "AND estado = 'pendiente'"} ORDER BY CASE WHEN estado = 'pendiente' THEN 0 ELSE 1 END, due_at LIMIT 50`)
      .all(scope.owner, scope.account, scope.conversationId) as Array<Record<string, unknown>>).map(decode)
  }

  cancelar(scope: DespertadorScope, id: string): boolean {
    return this.db.prepare(`UPDATE chat_despertadores SET estado = 'cancelado', motivo = 'cancelado' WHERE id = ? AND owner = ? AND account = ? AND conversation_id = ? AND estado = 'pendiente'`)
      .run(id, scope.owner, scope.account, scope.conversationId).changes === 1
  }

  vencidos(limit = 20): Despertador[] {
    return (this.db.prepare(`SELECT * FROM chat_despertadores WHERE estado = 'pendiente' AND due_at <= ? ORDER BY due_at LIMIT ?`).all(this.clock(), limit) as Array<Record<string, unknown>>).map(decode)
  }

  /** Dispara un despertador vencido: acepta un turno en el journal y avanza (o cierra) el despertador,
   * todo en UNA transacción: dos servidores no lo disparan dos veces y un fallo no lo pierde. */
  disparar(d: Despertador, journal: ChatJournal): { turnId: string } | { frenado: string } | null {
    return this.db.transaction(() => {
      const actual = this.get(d.id)
      const ahora = this.clock()
      if (!actual || actual.estado !== 'pendiente' || actual.dueAt > ahora) return null
      const enLaHora = (this.db.prepare('SELECT COUNT(*) AS n FROM chat_despertador_disparos WHERE owner = ? AND account = ? AND conversation_id = ? AND at > ?')
        .get(actual.owner, actual.account, actual.conversationId, ahora - 3600_000) as { n: number }).n
      if (enLaHora >= TOPES.disparosPorHoraPorConversacion) {
        const motivo = `Frenado: ${enLaHora} despertares en la última hora en esta conversación (tope ${TOPES.disparosPorHoraPorConversacion}). Posible bucle.`
        this.db.prepare(`UPDATE chat_despertadores SET estado = 'frenado', motivo = ? WHERE id = ?`).run(motivo, actual.id)
        return { frenado: motivo }
      }
      const previo = journal.latest(actual.owner, actual.account, actual.conversationId)?.input as ChatJobInput | undefined
      const turnId = randomUUID()
      const tarde = ahora - actual.dueAt > TOPES.retrasoAvisoMs
      const hora = new Date(actual.dueAt - 6 * 3600_000).toISOString().slice(11, 16)
      const disparo = actual.disparos + 1
      const message = actual.tipo === 'confirmacion' ? [
        `[Aviso de Arbrain ${actual.id} · tu cola de aprobaciones: la persona decidió algo que te quedó pendiente${tarde ? ' · llega TARDE: el servidor no estaba disponible' : ''}]`,
        `${DUENO_M} no escribió este mensaje: lo escribe Arbrain con su decisión.`,
        actual.texto,
      ].join('\n') : actual.tipo === 'subagente' ? [
        `[Aviso del motor ${actual.id} · un subagente que lanzaste desde esta conversación ${/DETENIDO EN UN DIÁLOGO|PREGUNTA PARA TI|pregunta para ti/.test(actual.texto) ? 'te pregunta algo' : 'terminó'}${tarde ? ' · llega TARDE: el servidor no estaba disponible' : ''}]`,
        `${DUENO_M} no escribió este mensaje. Si te pregunta algo y puedes decidirlo, contéstale con retomar; si necesitas a ${DUENO}, pregúntaselo en breve aquí. Si terminó, revisa lo que entregó, decide el siguiente paso y cuéntaselo a ${DUENO} en breve.`,
        actual.texto,
      ].join('\n') : [
        `[Despertador ${actual.id}${actual.cadaMs ? ` · recurrente, disparo ${disparo}${actual.restantes ? ` de ${actual.disparos + actual.restantes}` : ''}` : ''} · programado para las ${hora} (hora de México)${tarde ? ' · llega TARDE: el servidor no estaba disponible a esa hora' : ''}]`,
        `Lo programaste tú en esta conversación. ${DUENO_M} no escribió este mensaje. Lo que te pediste hacer al despertar:`,
        actual.texto,
      ].join('\n')
      const input: ChatJobInput = {
        message, source: previo?.source ?? 'desktop',
        overrides: previo?.overrides ?? { model: null, effort: null, fast: false, ultracode: false },
        ...(previo?.claudeSelection ? { claudeSelection: previo.claudeSelection } : {}),
        ...(previo?.codexSelection ? { codexSelection: previo.codexSelection } : {}),
        despertador: { id: actual.id, texto: actual.texto, programadoPara: actual.dueAt, disparo, ...(actual.tipo === 'subagente' ? { tipo: 'subagente' as const } : {}) },
      }
      journal.accept({ owner: actual.owner, account: actual.account, conversationId: actual.conversationId, turnId }, input)
      this.db.prepare('INSERT INTO chat_despertador_disparos (despertador_id, owner, account, conversation_id, turn_id, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(actual.id, actual.owner, actual.account, actual.conversationId, turnId, ahora)
      if (actual.cadaMs && (actual.restantes ?? 0) > 1) {
        let siguiente = actual.dueAt + actual.cadaMs
        while (siguiente <= ahora) siguiente += actual.cadaMs // tras un apagón no se recuperan los perdidos uno por uno
        this.db.prepare(`UPDATE chat_despertadores SET due_at = ?, restantes = restantes - 1, disparos = disparos + 1, ultimo_disparo_at = ?, ultimo_turn_id = ? WHERE id = ?`)
          .run(siguiente, ahora, turnId, actual.id)
      } else {
        this.db.prepare(`UPDATE chat_despertadores SET estado = 'hecho', restantes = CASE WHEN restantes IS NULL THEN NULL ELSE 0 END, disparos = disparos + 1, ultimo_disparo_at = ?, ultimo_turn_id = ? WHERE id = ?`)
          .run(ahora, turnId, actual.id)
      }
      return { turnId }
    }).immediate()
  }
}

function decode(row: Record<string, unknown>): Despertador {
  return {
    id: String(row.id), owner: String(row.owner), account: String(row.account), conversationId: String(row.conversation_id),
    texto: String(row.texto), dueAt: Number(row.due_at), cadaMs: row.cada_ms == null ? null : Number(row.cada_ms),
    restantes: row.restantes == null ? null : Number(row.restantes), disparos: Number(row.disparos), estado: row.estado as EstadoDespertador,
    motivo: row.motivo == null ? null : String(row.motivo), creadoAt: Number(row.creado_at),
    ultimoDisparoAt: row.ultimo_disparo_at == null ? null : Number(row.ultimo_disparo_at), ultimoTurnId: row.ultimo_turn_id == null ? null : String(row.ultimo_turn_id),
    tipo: row.tipo === 'subagente' ? 'subagente' : row.tipo === 'confirmacion' ? 'confirmacion' : 'despertador',
  }
}

/** Etiqueta del chip en la web: el texto del despertador, o solo la cabecera del aviso de un subagente. */
export function etiquetaDespertador(d: { texto: string; tipo?: string }): string {
  return d.tipo === 'subagente' || d.tipo === 'confirmacion' ? d.texto.split('\n')[0].slice(0, 160) : d.texto
}

/** Una línea legible por despertador (para la herramienta de Levy). */
export function describirDespertador(d: Despertador, ahora = Date.now()): string {
  const hora = new Date(d.dueAt - 6 * 3600_000).toISOString().replace('T', ' ').slice(0, 16)
  const falta = Math.round((d.dueAt - ahora) / 60_000)
  const cuando = d.estado === 'pendiente' ? `${hora} (${falta <= 0 ? 'ya' : `en ${falta} min`})` : d.estado
  return `${d.id} · ${cuando}${d.cadaMs ? ` · cada ${Math.round(d.cadaMs / 60_000)} min, quedan ${d.restantes}` : ''} · «${d.texto.length > 120 ? d.texto.slice(0, 119) + '…' : d.texto}»${d.motivo && d.estado !== 'cancelado' ? ` · ${d.motivo}` : ''}`
}

/** Pulso del agent-server: dispara lo vencido. Devuelve cuántos turnos aceptó. */
export function dispararVencidos(despertadores: Despertadores, journal: ChatJournal, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): number {
  let n = 0
  for (const d of despertadores.vencidos()) {
    try {
      const r = despertadores.disparar(d, journal)
      if (r && 'turnId' in r) { n++; log.info({ despertador: d.id, conversationId: d.conversationId, turnId: r.turnId }, 'despertador: disparado') }
      else if (r) log.warn({ despertador: d.id, conversationId: d.conversationId, motivo: r.frenado }, 'despertador: frenado por tope')
    } catch (error) { log.warn({ err: error, despertador: d.id }, 'despertador: no se pudo disparar') }
  }
  return n
}
