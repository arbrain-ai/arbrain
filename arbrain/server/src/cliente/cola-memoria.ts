/**
 * Cola por memoria (5 nov 2026, uno a uno con un fundador). Su MacBook de 8 GB se trababa al lanzar agentes desde
 * Arbrain («se me ha agravado el problema de la RAM») y él mismo armó la regla: «mínimo 1.8 GB libres para lanzar un
 * agente; si no, entra en cola», con un panel de cola que reordena por prioridad. Daniel: que Arbrain lo traiga de
 * fábrica y funcione suave en cualquier laptop.
 *
 * Qué hace: antes de lanzar algo pesado (una rutina del scheduler o un subagente del SDK) se mide la memoria libre de
 * la máquina. Con aire, sale ya. Sin aire, entra a esta cola (SQLite, la misma base del daemon: la ven el agent-server,
 * el corredor y el Taller) y sale sola, en orden, cuando hay aire.
 *
 * Reglas:
 *   · Umbral calibrado por la RAM total (`umbralBytes`): 1.2 GB + 7.5 % de la RAM, con techo de 3 GB. 8 GB → 1.8 GB (la
 *     regla que el fundador probó en su máquina); 16 GB → 2.4 GB; 24 GB o más → 3 GB. `ARBRAIN_COLA_MEMORIA_MB` lo fija.
 *   · Orden estricto: sale la primera de la cola; las de atrás esperan aunque quepan (la prioridad es de la persona).
 *   · Solo lo que cabe: cada lanzamiento reserva `COSTO_BYTES` durante `ASENTAMIENTO_MS` (el proceso tarda en crecer y
 *     la medida todavía no lo ve). Así no salen cinco de golpe cuando se libera un poco: sale uno, se asienta, se mide.
 *   · Nunca se pierde un encargo: vive en la tabla hasta que se lanza (o la rutina deja de existir). Una rutina sigue
 *     vencida en el scheduler mientras espera; un subagente queda con su conversación y, al haber aire, Arbrain le
 *     escribe al agente ahí para que lo lance (`mensajeAdmitido`).
 *   · Nunca se traba: si la primera lleva `ESPERA_MAX_MS` esperando sin que nada haya salido en ese rato, sale igual
 *     (la memoria no se iba a liberar sola); la persona puede «Lanzar ya» desde el Taller cuando quiera.
 *   · Mientras algo espera, se cierran los procesos de chat ociosos (`cerrarOciosos` del pool): retoman su sesión con el
 *     siguiente mensaje y devuelven su memoria.
 *
 * Dónde está prendida: edición cliente, siempre (`ARBRAIN_COLA_MEMORIA=0` la apaga). Instalación original: apagada
 * salvo `ARBRAIN_COLA_MEMORIA=1`; el Studio no cambia su operación.
 *
 * Modo espejo (contrato con `cliente/espejo.ts › derivarEspejo`): si el espejo está prendido y una rutina lleva
 * `DERIVAR_TRAS_MS` esperando, se le ofrece a la otra máquina una sola vez. Si la acepta, queda «derivada» (la corre
 * ella) y aquí no se ejecuta; si no (o el espejo no sabe derivar todavía), sigue esperando aquí como siempre.
 */
import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { freemem, platform, totalmem } from 'node:os'
import type Database from 'better-sqlite3'
import { esEdicionCliente } from '../edicion.js'
import { leerVmStat } from './computadora.js'

export type TipoEncargo = 'rutina' | 'subagente'
export type EstadoEncargo = 'esperando' | 'admitido' | 'lanzado' | 'derivado' | 'soltado'

export interface ConversacionCola { owner: string; account: string; conversationId: string }

export interface EncargoCola {
  id: string
  tipo: TipoEncargo
  /** Rutina: id de la tarea. Subagente: huella de la llamada (`huellaSubagente`). */
  ref: string
  titulo: string
  conversacion: ConversacionCola | null
  estado: EstadoEncargo
  orden: number
  creado: number
  admitidoEn: number | null
  lanzadoEn: number | null
  /** Por qué salió: con aire, «Lanzar ya» o tras esperar demasiado. */
  motivo: string | null
  forzar: boolean
  derivadoA: string | null
  derivacionIntentada: boolean
}

export interface Medida { libreBytes: number; totalBytes: number }

export type Turno =
  | { lanzar: true; id: string | null; motivo: 'apagada' | 'aire' | 'forzado' | 'espera_larga' | 'admitido' }
  | { lanzar: false; id: string; posicion: number; total: number; libreBytes: number; umbralBytes: number }

export interface PedidoCola { tipo: TipoEncargo; ref: string; titulo: string; conversacion?: ConversacionCola | null }

export interface VistaCola {
  activa: boolean
  libreBytes: number | null
  totalBytes: number | null
  umbralBytes: number | null
  esperando: Array<Pick<EncargoCola, 'id' | 'tipo' | 'titulo' | 'creado' | 'forzar'> & { posicion: number; conversacion: string | null; estado: 'esperando' | 'admitido' }>
  recientes: Array<Pick<EncargoCola, 'id' | 'tipo' | 'titulo' | 'estado' | 'motivo' | 'derivadoA'> & { cuando: number }>
}

const GB = 1024 ** 3
export const COSTO_BYTES = 600 * 1024 ** 2
export const ASENTAMIENTO_MS = 20_000
/** Número de una variable de entorno; vacía o ilegible = `porDefecto` (un «0» escrito sí vale 0). */
const numeroEnv = (v: string | undefined, porDefecto: number) => v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : porDefecto
export const ESPERA_MAX_MS = () => Math.max(numeroEnv(process.env.ARBRAIN_COLA_MEMORIA_ESPERA_MAX_S, 15 * 60), 30) * 1000
export const DERIVAR_TRAS_MS = 60_000
/** Un subagente admitido que el agente no relanza se retira solo (su conversación ya lo tiene en contexto). */
const VIDA_ADMITIDO_MS = 2 * 3600_000
/** Un subagente que espera más de un día ya no tiene turno vivo que lo pida. */
const VIDA_ESPERA_SUBAGENTE_MS = 24 * 3600_000

/** Memoria libre necesaria para lanzar algo pesado, según la RAM total. Pura. */
export function umbralBytes(totalBytes: number, env: NodeJS.ProcessEnv = process.env): number {
  const fijo = Number(env.ARBRAIN_COLA_MEMORIA_MB)
  if (Number.isFinite(fijo) && fijo > 0) return Math.round(fijo * 1024 ** 2)
  return Math.round(Math.min(1.2 * GB + 0.075 * totalBytes, 3 * GB))
}

/** ¿La cola está prendida en esta instalación? */
export function colaActiva(env: NodeJS.ProcessEnv = process.env): boolean {
  return esEdicionCliente() ? env.ARBRAIN_COLA_MEMORIA !== '0' : env.ARBRAIN_COLA_MEMORIA === '1'
}

/** Huella estable de una llamada a `Agent`/`Task`: la misma llamada repetida encuentra su lugar en la cola. */
export function huellaSubagente(input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const base = JSON.stringify([i.description ?? '', i.prompt ?? '', i.subagent_type ?? '', i.model ?? '', !!i.run_in_background])
  return createHash('sha256').update(base).digest('hex').slice(0, 24)
}

/** Memoria disponible de la máquina. Mac: `vm_stat` (libre + inactiva + especulativa + purgable, la cuenta del vigía);
 *  en Windows y Linux, `os.freemem()` ya es la disponible. */
export function medirMemoria(): Promise<Medida> {
  const totalBytes = totalmem()
  if (platform() !== 'darwin') return Promise.resolve({ libreBytes: freemem(), totalBytes })
  return new Promise(ok => {
    execFile('/usr/bin/vm_stat', { timeout: 3000 }, (err, salida) => {
      const v = err ? null : leerVmStat(String(salida))
      ok({ libreBytes: v ?? freemem(), totalBytes })
    })
  })
}

const gb = (b: number) => `${(b / GB).toFixed(1)} GB`

/** Lo que el daemon le escribe al agente cuando su subagente encolado ya tiene aire. */
export function mensajeAdmitido(e: Pick<EncargoCola, 'id' | 'titulo'>): string {
  return [
    `Ya hay memoria libre: el subagente que quedó en la cola por memoria (${e.id}, «${e.titulo.replace(/\s+/g, ' ').slice(0, 160)}») ya puede salir.`,
    'Lánzalo ahora repitiendo EXACTAMENTE la misma llamada a Agent que te quedó pendiente (misma descripción, mismo prompt, mismo tipo). Su lugar está apartado; si cambias algo, vuelve a formarse.',
  ].join('\n')
}

/** Lo que recibe el agente cuando su subagente queda en la cola (la herramienta no corrió). */
export function mensajeEncolado(t: Extract<Turno, { lanzar: false }>, conConversacion: boolean): string {
  const donde = `quedó en la cola por memoria de Arbrain (${t.id}, lugar ${t.posicion} de ${t.total}): hay ${gb(t.libreBytes)} libres y para lanzar uno sin trabar la computadora hacen falta ${gb(t.umbralBytes)}`
  return conConversacion
    ? `Este subagente no se lanzó todavía: ${donde}. No lo repitas ahora ni hagas tú su trabajo pesado: sigue con lo que no dependa de él y dile a la persona en una línea que está en la cola (la ve en Taller › Agentes y puede subirlo o lanzarlo ya). Cuando haya memoria, Arbrain te escribe en esta conversación para que lo lances con la misma llamada.`
    : `Este subagente no se lanzó: ${donde}. En una rutina no hay quién lo retome después: haz su trabajo tú mismo en esta corrida, sin subagentes.`
}

type Fila = {
  id: string; tipo: string; ref: string; titulo: string; conversacion: string | null; estado: string; orden: number; creado: number
  admitido_en: number | null; lanzado_en: number | null; motivo: string | null; forzar: number; derivado_a: string | null; derivacion: number
}
const deFila = (f: Fila): EncargoCola => ({
  id: f.id, tipo: f.tipo === 'rutina' ? 'rutina' : 'subagente', ref: f.ref, titulo: f.titulo,
  conversacion: f.conversacion ? (() => { try { return JSON.parse(f.conversacion) as ConversacionCola } catch { return null } })() : null,
  estado: f.estado as EstadoEncargo, orden: f.orden, creado: f.creado, admitidoEn: f.admitido_en, lanzadoEn: f.lanzado_en,
  motivo: f.motivo, forzar: !!f.forzar, derivadoA: f.derivado_a, derivacionIntentada: !!f.derivacion,
})

export interface OpcionesCola {
  medir?: () => Promise<Medida>
  ahora?: () => number
  env?: NodeJS.ProcessEnv
  /** Cache de la medida (ms): varias preguntas seguidas no lanzan varios `vm_stat`. */
  cacheMs?: number
}

export class ColaMemoria {
  private medir: () => Promise<Medida>
  private ahora: () => number
  private env: NodeJS.ProcessEnv
  private cacheMs: number
  private ultima: { t: number; m: Medida } | null = null
  constructor(private db: Database.Database, op: OpcionesCola = {}) {
    this.medir = op.medir ?? medirMemoria
    this.ahora = op.ahora ?? Date.now
    this.env = op.env ?? process.env
    this.cacheMs = op.cacheMs ?? 2000
    db.exec(`CREATE TABLE IF NOT EXISTS cola_memoria (
      id TEXT PRIMARY KEY, tipo TEXT NOT NULL, ref TEXT NOT NULL, titulo TEXT NOT NULL, conversacion TEXT,
      estado TEXT NOT NULL, orden REAL NOT NULL, creado INTEGER NOT NULL, admitido_en INTEGER, lanzado_en INTEGER,
      motivo TEXT, forzar INTEGER NOT NULL DEFAULT 0, derivado_a TEXT, derivacion INTEGER NOT NULL DEFAULT 0,
      devuelto INTEGER NOT NULL DEFAULT 0, avisado INTEGER NOT NULL DEFAULT 0, actualizado INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cola_memoria_estado ON cola_memoria(estado, orden)`)
  }

  get activa(): boolean { return colaActiva(this.env) }

  /** El reloj de la cola (el de las pruebas, si lo pasan). */
  ahoraMs(): number { return this.ahora() }

  async medida(fresca = false): Promise<Medida> {
    const t = this.ahora()
    if (!fresca && this.ultima && t - this.ultima.t < this.cacheMs) return this.ultima.m
    const m = await this.medir()
    this.ultima = { t, m }
    return m
  }

  /** La fila viva (esperando o admitida) de este encargo, si la hay. */
  private viva(tipo: TipoEncargo, ref: string): EncargoCola | null {
    const f = this.db.prepare(`SELECT * FROM cola_memoria WHERE tipo = ? AND ref = ? AND estado IN ('esperando','admitido') ORDER BY creado LIMIT 1`).get(tipo, ref) as Fila | undefined
    return f ? deFila(f) : null
  }

  obtener(id: string): EncargoCola | null {
    const f = this.db.prepare('SELECT * FROM cola_memoria WHERE id = ?').get(id) as Fila | undefined
    return f ? deFila(f) : null
  }

  /** Lo que espera, en el orden en que saldrá. */
  esperando(): EncargoCola[] {
    return (this.db.prepare(`SELECT * FROM cola_memoria WHERE estado = 'esperando' ORDER BY orden, creado`).all() as Fila[]).map(deFila)
  }

  hayEspera(): boolean {
    return !!this.db.prepare(`SELECT 1 FROM cola_memoria WHERE estado = 'esperando' LIMIT 1`).get()
  }

  private poner(id: string, campos: Record<string, unknown>): void {
    const claves = Object.keys(campos)
    this.db.prepare(`UPDATE cola_memoria SET ${claves.map(k => `${k} = @${k}`).join(', ')}, actualizado = @__t WHERE id = @__id`).run({ ...campos, __t: this.ahora(), __id: id })
  }

  /** Memoria que ya está comprometida y la medida todavía no ve: lo lanzado o admitido hace poco. */
  private enVuelo(t: number): number {
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM cola_memoria WHERE (estado = 'lanzado' AND lanzado_en > ?) OR (estado = 'admitido' AND admitido_en > ?)`).get(t - ASENTAMIENTO_MS, t - ASENTAMIENTO_MS) as { n: number }
    return r.n * COSTO_BYTES
  }

  private ultimaSalida(): number {
    const r = this.db.prepare(`SELECT MAX(COALESCE(lanzado_en, admitido_en)) AS t FROM cola_memoria WHERE estado IN ('lanzado','admitido')`).get() as { t: number | null }
    return r.t ?? 0
  }

  /**
   * Recorre la cola en orden y decide quién sale ahora. Devuelve las que pasaron a «admitido» (con su motivo). Orden
   * estricto: la primera que no cabe detiene a las de atrás (salvo «Lanzar ya», que sale siempre).
   */
  async revisar(): Promise<EncargoCola[]> {
    if (!this.activa) return []
    const fila = this.esperando()
    if (!fila.length) return []
    const t = this.ahora()
    const m = await this.medida()
    const umbral = umbralBytes(m.totalBytes, this.env)
    let libre = m.libreBytes - this.enVuelo(t)
    const salen: EncargoCola[] = []
    let primera = true
    for (const e of fila) {
      let motivo: string | null = null
      if (e.forzar) motivo = 'forzado'
      else if (primera && libre >= umbral) motivo = 'aire'
      else if (primera && !salen.length && t - e.creado >= ESPERA_MAX_MS() && t - this.ultimaSalida() >= ESPERA_MAX_MS()) motivo = 'espera_larga'
      if (!motivo) { primera = false; continue }
      this.poner(e.id, { estado: 'admitido', admitido_en: t, motivo })
      salen.push({ ...e, estado: 'admitido', admitidoEn: t, motivo })
      libre -= COSTO_BYTES
    }
    return salen
  }

  /**
   * Antes de lanzar: ¿sale ya o se forma? Registra el encargo si no estaba. Si sale, queda «lanzado» (reserva su memoria
   * durante el asentamiento); quien lo lanza no tiene que avisar nada más.
   */
  async pedir(p: PedidoCola): Promise<Turno> {
    if (!this.activa) return { lanzar: true, id: null, motivo: 'apagada' }
    const t = this.ahora()
    let e = this.viva(p.tipo, p.ref)
    if (e?.estado === 'admitido') {
      this.poner(e.id, { estado: 'lanzado', lanzado_en: t })
      return { lanzar: true, id: e.id, motivo: 'admitido' }
    }
    if (!e) {
      // Con la cola vacía y aire, sale sin dejar más rastro que su reserva de asentamiento.
      const max = this.db.prepare(`SELECT MAX(orden) AS o FROM cola_memoria WHERE estado = 'esperando'`).get() as { o: number | null }
      const id = `cm_${randomBytes(6).toString('hex')}`
      this.db.prepare(`INSERT INTO cola_memoria (id, tipo, ref, titulo, conversacion, estado, orden, creado, forzar, derivacion, actualizado)
        VALUES (?, ?, ?, ?, ?, 'esperando', ?, ?, 0, 0, ?)`).run(id, p.tipo, p.ref, p.titulo.slice(0, 200) || (p.tipo === 'rutina' ? 'Rutina' : 'Subagente'), p.conversacion ? JSON.stringify(p.conversacion) : null, (max.o ?? 0) + 1, t, t)
      e = this.obtener(id)!
    } else if (p.conversacion && !e.conversacion) this.poner(e.id, { conversacion: JSON.stringify(p.conversacion) })
    const salen = await this.revisar()
    if (salen.some(s => s.id === e!.id)) {
      const motivo = salen.find(s => s.id === e!.id)!.motivo as 'aire' | 'forzado' | 'espera_larga'
      this.poner(e.id, { estado: 'lanzado', lanzado_en: this.ahora() })
      return { lanzar: true, id: e.id, motivo }
    }
    const fila = this.esperando()
    const m = await this.medida()
    return { lanzar: false, id: e.id, posicion: Math.max(fila.findIndex(x => x.id === e!.id) + 1, 1), total: Math.max(fila.length, 1), libreBytes: m.libreBytes, umbralBytes: umbralBytes(m.totalBytes, this.env) }
  }

  /** El encargo ya no hace falta (la rutina se pausó o se borró, otra corrida la reclamó). */
  soltar(id: string, motivo = 'ya no hace falta'): void {
    this.poner(id, { estado: 'soltado', motivo })
  }

  /** La otra máquina del espejo lo aceptó: aquí no corre. */
  derivado(id: string, a: string): void {
    this.poner(id, { estado: 'derivado', derivado_a: a.slice(0, 80), motivo: 'derivado', lanzado_en: this.ahora() })
  }

  marcarDerivacionIntentada(id: string): void { this.poner(id, { derivacion: 1 }) }

  /**
   * El gancho dejó de esperar y le devolvió el subagente al agente («quedó en la cola»). Desde aquí, cuando salga, hay
   * que escribirle a su conversación. Mientras el gancho espera, no: lo lanza él mismo y un aviso lo duplicaría.
   */
  devolver(id: string): void { this.poner(id, { devuelto: 1 }) }

  /** Admitidos que alguien tiene que mover: rutinas (que el scheduler haga un pase) y subagentes ya devueltos. */
  porAvisar(): EncargoCola[] {
    return (this.db.prepare(`SELECT * FROM cola_memoria WHERE estado = 'admitido' AND avisado = 0 AND (tipo = 'rutina' OR devuelto = 1) ORDER BY admitido_en`).all() as Fila[]).map(deFila)
  }

  avisado(id: string): void { this.poner(id, { avisado: 1 }) }

  /** «Lanzar ya» desde el Taller: sale en la siguiente revisión aunque no haya aire. */
  forzar(id: string): boolean {
    const e = this.obtener(id)
    if (!e || e.estado !== 'esperando') return false
    this.poner(id, { forzar: 1 })
    return true
  }

  /** Reordenar: el encargo queda en `posicion` (0 = primero) dentro de lo que espera. */
  mover(id: string, posicion: number): boolean {
    const fila = this.esperando()
    const i = fila.findIndex(e => e.id === id)
    if (i < 0) return false
    const [e] = fila.splice(i, 1)
    fila.splice(Math.min(Math.max(Math.floor(posicion), 0), fila.length), 0, e)
    const tx = this.db.transaction(() => fila.forEach((x, k) => this.poner(x.id, { orden: k + 1 })))
    tx()
    return true
  }

  /** Limpieza: admitidos que nadie relanzó y subagentes que ya no tienen turno que los pida; historia de más de un día. */
  limpiar(): void {
    const t = this.ahora()
    this.db.prepare(`UPDATE cola_memoria SET estado = 'soltado', motivo = 'nadie lo relanzó', actualizado = ? WHERE estado = 'admitido' AND admitido_en < ?`).run(t, t - VIDA_ADMITIDO_MS)
    this.db.prepare(`UPDATE cola_memoria SET estado = 'soltado', motivo = 'su conversación ya no lo pidió', actualizado = ? WHERE estado = 'esperando' AND tipo = 'subagente' AND creado < ?`).run(t, t - VIDA_ESPERA_SUBAGENTE_MS)
    this.db.prepare(`DELETE FROM cola_memoria WHERE estado IN ('lanzado','derivado','soltado') AND actualizado < ?`).run(t - 24 * 3600_000)
  }

  async vista(): Promise<VistaCola> {
    if (!this.activa) return { activa: false, libreBytes: null, totalBytes: null, umbralBytes: null, esperando: [], recientes: [] }
    const m = await this.medida()
    const vivas = (this.db.prepare(`SELECT * FROM cola_memoria WHERE estado IN ('esperando','admitido') ORDER BY CASE estado WHEN 'admitido' THEN 0 ELSE 1 END, orden, creado`).all() as Fila[]).map(deFila)
    let n = 0
    const recientes = (this.db.prepare(`SELECT * FROM cola_memoria WHERE estado IN ('lanzado','derivado') AND creado < COALESCE(lanzado_en, 0) - 1000 AND actualizado > ? ORDER BY actualizado DESC LIMIT 5`).all(this.ahora() - 3600_000) as Fila[]).map(deFila)
    return {
      activa: true, libreBytes: m.libreBytes, totalBytes: m.totalBytes, umbralBytes: umbralBytes(m.totalBytes, this.env),
      esperando: vivas.map(e => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, creado: e.creado, forzar: e.forzar, posicion: e.estado === 'esperando' ? ++n : 0, conversacion: e.conversacion?.conversationId ?? null, estado: e.estado as 'esperando' | 'admitido' })),
      recientes: recientes.map(e => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, estado: e.estado, motivo: e.motivo, derivadoA: e.derivadoA, cuando: e.lanzadoEn ?? e.creado })),
    }
  }
}

// ── El del daemon ────────────────────────────────────────────────────────────────────────────────────────────────

let delDaemon: ColaMemoria | null = null
/** La cola de este proceso sobre la base del daemon (agent-server o corredor: la tabla es la misma). */
export function colaDelDaemon(db?: Database.Database): ColaMemoria | null {
  if (delDaemon) return delDaemon
  if (!db) return null
  delDaemon = new ColaMemoria(db)
  return delDaemon
}
/** Solo pruebas. */
export function _colaParaPruebas(c: ColaMemoria | null): void { delDaemon = c }

export interface DepsReloj {
  /** Un subagente ya tiene aire: escribirle al agente en su conversación. */
  avisar: (scope: ConversacionCola, texto: string) => void
  /** Una rutina ya tiene aire: que el scheduler haga un pase. */
  correrRutinas: () => void
  /** Algo espera por memoria: cerrar lo ocioso (procesos de chat sin turno). */
  liberar?: () => void
  registrar?: (e: Record<string, unknown>) => void
}

/**
 * El pulso de la cola (solo en el proceso que corre el scheduler y los despertadores): cada pocos segundos revisa, avisa
 * a la conversación de cada subagente admitido y despierta al scheduler si salió una rutina.
 */
export function iniciarRelojCola(cola: ColaMemoria, deps: DepsReloj, cadaMs = 5000): () => void {
  let corriendo = false, ultimaLiberacion = 0, ultimaLimpieza = 0
  const pulso = async () => {
    if (corriendo || !cola.activa) return
    corriendo = true
    try {
      const t = Date.now()
      if (t - ultimaLimpieza > 10 * 60_000) { ultimaLimpieza = t; cola.limpiar() }
      if (cola.hayEspera()) for (const e of await cola.revisar()) deps.registrar?.({ evento: 'cola_memoria_sale', id: e.id, tipo: e.tipo, motivo: e.motivo })
      // Lo admitido aquí o por otro proceso (el scheduler o el gancho de un corredor también revisan al pedir).
      const mover = cola.porAvisar()
      for (const e of mover) {
        cola.avisado(e.id)
        if (e.tipo !== 'subagente') continue
        if (!e.conversacion) { cola.soltar(e.id, 'sin conversación que lo retome'); continue }
        try { deps.avisar(e.conversacion, mensajeAdmitido(e)) } catch (err) { deps.registrar?.({ evento: 'cola_memoria_sin_aviso', id: e.id, error: err instanceof Error ? err.message : String(err) }) }
      }
      if (mover.some(e => e.tipo === 'rutina')) deps.correrRutinas()
      if (cola.hayEspera() && deps.liberar && t - ultimaLiberacion > 30_000) { ultimaLiberacion = t; deps.liberar() }
    } catch (err) {
      deps.registrar?.({ evento: 'cola_memoria_fallo', error: err instanceof Error ? err.message : String(err) })
    } finally { corriendo = false }
  }
  const reloj = setInterval(() => { void pulso() }, cadaMs)
  reloj.unref?.()
  return () => clearInterval(reloj)
}

// ── Rutas del daemon (Taller › Agentes) ─────────────────────────────────────────────────────────────────────────

export async function atenderColaMemoria(metodo: string | undefined, ruta: string, cuerpo: unknown, cola: ColaMemoria | null): Promise<{ status: number; cuerpo: unknown } | null> {
  if (!cola) return { status: 503, cuerpo: { error: 'La cola por memoria no está lista.' } }
  if (metodo === 'GET' && ruta === '/cola-memoria') return { status: 200, cuerpo: await cola.vista() }
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const id = typeof c.id === 'string' && /^cm_[0-9a-f]{12}$/.test(c.id) ? c.id : null
  if (metodo === 'POST' && ruta === '/cola-memoria/mover') {
    if (!id || !Number.isFinite(Number(c.posicion))) return { status: 400, cuerpo: { error: 'Falta id o posición.' } }
    return cola.mover(id, Number(c.posicion)) ? { status: 200, cuerpo: await cola.vista() } : { status: 404, cuerpo: { error: 'Ese encargo ya no está en la cola.' } }
  }
  if (metodo === 'POST' && ruta === '/cola-memoria/forzar') {
    if (!id) return { status: 400, cuerpo: { error: 'Falta id.' } }
    if (!cola.forzar(id)) return { status: 404, cuerpo: { error: 'Ese encargo ya no está en la cola.' } }
    return { status: 200, cuerpo: await cola.vista() }
  }
  return null
}

// ── El subagente del SDK (gancho PreToolUse de la guardia) ──────────────────────────────────────────────────────

/** Cuánto espera el gancho a que haya aire antes de devolver el subagente al agente («quedó en la cola»). */
export const ESPERA_SUBAGENTE_MS = () => Math.min(Math.max(numeroEnv(process.env.ARBRAIN_COLA_MEMORIA_ESPERA_S, 60), 0), 600) * 1000

/**
 * Antes de que corra una llamada a `Agent`/`Task`: null = sale ya; texto = no se lanza y el agente recibe ese motivo.
 * Espera un rato en el gancho (lo normal es que el aire llegue pronto); si no llega, el encargo se queda en la cola con
 * su conversación y Arbrain le escribe al agente cuando salga. En una rutina no hay quién lo retome: se suelta y el
 * agente hace el trabajo él mismo, sin subagente.
 */
export async function turnoSubagente(cola: ColaMemoria | null, input: unknown, conversacion: ConversacionCola | null | undefined, op: { esperaMs?: number; pasoMs?: number; signal?: AbortSignal } = {}): Promise<string | null> {
  if (!cola?.activa) return null
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const titulo = String(i.description ?? i.prompt ?? 'Subagente').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Subagente'
  const pedido = { tipo: 'subagente' as const, ref: huellaSubagente(input), titulo, conversacion: conversacion ?? null }
  const fin = Date.now() + (op.esperaMs ?? ESPERA_SUBAGENTE_MS())
  for (;;) {
    const t = await cola.pedir(pedido)
    if (t.lanzar) return null
    if (Date.now() >= fin || op.signal?.aborted) {
      if (conversacion) cola.devolver(t.id)
      else cola.soltar(t.id, 'rutina: lo hizo el agente sin subagente')
      return mensajeEncolado(t, !!conversacion)
    }
    await new Promise(r => setTimeout(r, Math.min(op.pasoMs ?? 2000, Math.max(fin - Date.now(), 0))))
  }
}
