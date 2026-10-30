/**
 * Confirmación humana nativa (AUDITORIA I8; contrato §6). En la edición cliente, lo que envía, paga, borra o publica
 * no se ejecuta con la palabra del modelo: crea una confirmación pendiente que solo resuelve un clic de la persona en
 * la app (`POST /confirmaciones/resolver` con el secreto que solo tiene la app, cliente/secreto.ts).
 *
 * El estado vive en la base del daemon (tabla `confirmaciones`): lo consultan la guardia de agentes (mismo proceso) y
 * el servidor MCP de manos (otro proceso, por HTTP). El modelo puede crear pendientes y leer su estado; nunca aprobar.
 *
 * Contrato v3 (red team C2, 11 oct 2026): nadie fuera del daemon escribe el texto que ve la persona. La guardia crea las
 * suyas con el comando LITERAL que interceptó; por HTTP (`/confirmaciones/pedir`, lo usa manos) solo se manda la acción
 * estructurada (`herramienta` + `partes`) y el daemon calcula el literal y la huella. Las huellas llevan el espacio de
 * su origen (`agente:`, `cron:`, `manos:`): una aprobación creada por un camino nunca la consume otro.
 */
import { createHash, randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { botonConsecuencia, frasePatron } from './frase-humana.js'

export type CategoriaConfirmacion = 'enviar' | 'pagar' | 'borrar' | 'publicar' | 'otra'
/**
 * `corriendo` y `corrida` son solo de «Córrelo tú» (tipo `manos`): la persona apretó el botón y el comando corre en su
 * terminal visible; al terminar queda `corrida` con su salida, que vuelve al agente.
 */
/**
 * `en_cola` (cola de aprobaciones, 27 oct 2026, ronda 2; Duet: «completes remaining tasks and requests approval
 * later»): nadie la está esperando. El turno ya siguió con lo demás; la persona la ve en su cola y, cuando decide, el
 * daemon se lo dice al agente en su conversación (`alRetomar`). Vencer NUNCA es «sí»: una pendiente sin respuesta pasa
 * a la cola, no se ejecuta.
 */
export type EstadoConfirmacion = 'pendiente' | 'en_cola' | 'permitida' | 'rechazada' | 'vencida' | 'usada' | 'corriendo' | 'corrida'
/**
 * Botón Play (27 oct 2026): `permiso` = la tarjeta de siempre (Una vez · Siempre este patrón · No); `manos` = «Córrelo
 * tú»: el agente no puede correrlo (sudo, iniciar sesión) y la persona lo corre ella misma en una terminal visible.
 */
export type TipoConfirmacion = 'permiso' | 'manos'
export type AlcanceConfirmacion = 'una' | 'siempre'
export type OrigenConfirmacion = 'agente' | 'manos' | 'cron'
/** Quién creó la pendiente: la guardia del daemon (acción interceptada) o una petición HTTP con el pase de agente. */
export type CreadaPor = 'guardia' | 'peticion'

export interface Confirmacion {
  id: string
  estado: EstadoConfirmacion
  categoria: CategoriaConfirmacion
  origen: OrigenConfirmacion
  resumen: string
  detalle?: string
  herramienta?: string
  /** Lo que de verdad se va a ejecutar, tal cual (comando, ruta y contenido, o la acción de manos en JSON). */
  literal?: string
  /** Señales para la persona («usa internet», «decodifica texto»…). */
  avisos?: string[]
  creadaPor: CreadaPor
  creada: number
  expira: number
  resuelta?: number
  /** Botón Play: qué tarjeta es (sin campo en bases viejas: `permiso`). */
  tipo: TipoConfirmacion
  /** Qué hará, en palabras para alguien que no es técnico (lo calcula el daemon del literal, `frase-humana.ts`). */
  frase?: string
  /** Patrón que se guardaría con «Siempre este patrón» (sin campo: no se ofrece). */
  patron?: string
  /** Lo que la persona escribió junto a su sí o su no; viaja al agente. */
  comentario?: string
  /** Cómo aprobó: una vez o «Siempre este patrón». */
  alcance?: AlcanceConfirmacion
  /** «Córrelo tú»: terminal del motor donde corre y, al terminar, su salida (recortada) y código. */
  terminal?: number
  salida?: string
  codigo?: number
  /** Sesión del CLI que la pidió (para pintarla en su hilo). */
  sesion?: string
  /** Conversación de la app que la pidió (id): su cola se pinta en ese hilo y ahí vuelve la decisión. */
  conversacion?: string
  /** Desde cuándo está en la cola (nadie la espera; al decidir, se le avisa al agente). */
  enColaDesde?: number
  /** «Siempre este patrón» dicho para la persona («Permitir siempre las pruebas de tus proyectos»). */
  patronFrase?: string
  /** En acciones del freno, el botón del sí dice la consecuencia («Borrar 14 archivos»). */
  botonSi?: string
}

/** Conversación de la app donde vive el turno (la misma forma que un despertador). */
export interface ConversacionConfirmacion { owner: string; account: string; conversationId: string }

export interface PedidoConfirmacion {
  origen: OrigenConfirmacion
  categoria: CategoriaConfirmacion
  resumen: string
  detalle?: string
  herramienta?: string
  literal?: string
  avisos?: string[]
  creadaPor?: CreadaPor
  /** Identifica la acción exacta: una aprobación solo vale para la misma acción, una vez. */
  huella: string
  tipo?: TipoConfirmacion
  frase?: string
  patron?: string
  sesion?: string
  conversacion?: ConversacionConfirmacion
}

/** Lo que acompaña una decisión de la app (tarjeta del hilo). */
export interface ExtrasDecision { comentario?: unknown; alcance?: unknown }

/** Lo más largo que viaja de un comentario de la persona y de la salida de «Córrelo tú». */
export const COMENTARIO_MAX = 500
export const SALIDA_MAX = 4000

/** Vida de una pendiente sin respuesta y de una aprobación sin usar. */
export const VIDA_PENDIENTE_MS = 10 * 60_000
export const VIDA_APROBACION_MS = 10 * 60_000
/** Lo más que se vigila una corrida de «Córrelo tú» (la persona escribe su contraseña o inicia sesión en el navegador). */
export const VIDA_CORRIDA_MS = 10 * 60_000
/** Cuánto vive una confirmación en la cola sin respuesta (después queda `vencida`: nunca se ejecuta). */
export const VIDA_COLA_MS = 7 * 24 * 60 * 60_000
/**
 * Una aprobación dada desde la cola: el agente la usa en el turno que el daemon abre al aprobar (chat) o en la siguiente
 * corrida de la rutina. Vale una vez, para la misma acción exacta.
 */
export const VIDA_APROBACION_COLA_MS = 30 * 60_000
export const VIDA_APROBACION_COLA_RUTINA_MS = 24 * 60 * 60_000
/**
 * Orígenes que pasan a la cola en vez de vencer. A3 (0.2.15): también las de manos de computer use; antes vencían a los
 * 90 s mientras la interfaz prometía 10 min, y un clic tardío ya no servía. Ahora el clic de la cola vale para el
 * reintento de la misma acción (huella estable, A4).
 */
const ORIGENES_COLA = `('agente','cron','manos')`

export const huellaDe = (...partes: unknown[]) => createHash('sha256').update(JSON.stringify(partes)).digest('hex').slice(0, 32)

/** Lo que no cambia qué hace una herramienta (la descripción que escribe el modelo) no entra en la huella. */
const sinDescripcion = (input: unknown): unknown => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const { description: _d, ...resto } = input as Record<string, unknown>
  return resto
}
/** Huella de una acción interceptada por la guardia (chat o rutina). */
export const huellaGuardia = (origen: 'agente' | 'cron', herramienta: string, input: unknown) => `${origen}:${huellaDe(herramienta, sinDescripcion(input))}`
/** Huella de una acción de manos pedida por HTTP. */
export const huellaManos = (herramienta: string, partes: unknown) => `manos:${huellaDe(herramienta, partes)}`

const CATEGORIAS = new Set<CategoriaConfirmacion>(['enviar', 'pagar', 'borrar', 'publicar', 'otra'])
const ORIGENES = new Set<OrigenConfirmacion>(['agente', 'manos', 'cron'])

interface Fila {
  id: string; estado: EstadoConfirmacion; categoria: CategoriaConfirmacion; origen: OrigenConfirmacion; resumen: string; detalle: string | null; herramienta: string | null; literal: string | null; avisos: string | null; creada_por: CreadaPor | null; huella: string; creada: number; expira: number; resuelta: number | null
  tipo: TipoConfirmacion | null; frase: string | null; patron: string | null; comentario: string | null; alcance: AlcanceConfirmacion | null; terminal: number | null; salida: string | null; codigo: number | null; sesion: string | null
  conversacion: string | null; cola: number | null
}
const COLUMNAS_PLAY = [['tipo', 'TEXT'], ['frase', 'TEXT'], ['patron', 'TEXT'], ['comentario', 'TEXT'], ['alcance', 'TEXT'], ['terminal', 'INTEGER'], ['salida', 'TEXT'], ['codigo', 'INTEGER'], ['sesion', 'TEXT'], ['conversacion', 'TEXT'], ['cola', 'INTEGER']] as const

const leerConversacion = (s: string | null): ConversacionConfirmacion | null => {
  try {
    const j = JSON.parse(s ?? 'null') as Partial<ConversacionConfirmacion> | null
    return j && typeof j.owner === 'string' && typeof j.account === 'string' && typeof j.conversationId === 'string' && j.conversationId ? { owner: j.owner, account: j.account, conversationId: j.conversationId } : null
  } catch { return null }
}

/** Comentario de la persona: una línea limpia, sin controles, recortado. */
export const limpiarComentario = (v: unknown): string => typeof v === 'string'
  // eslint-disable-next-line no-control-regex
  ? v.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, COMENTARIO_MAX)
  : ''

const leerAvisos = (s: string | null): string[] => { try { const a = JSON.parse(s ?? '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] } }

const publica = (f: Fila): Confirmacion => ({
  id: f.id, estado: f.estado, categoria: f.categoria, origen: f.origen, resumen: f.resumen,
  ...(f.detalle ? { detalle: f.detalle } : {}), ...(f.herramienta ? { herramienta: f.herramienta } : {}),
  ...(f.literal ? { literal: f.literal } : {}), ...(f.avisos && leerAvisos(f.avisos).length ? { avisos: leerAvisos(f.avisos) } : {}),
  creadaPor: f.creada_por ?? 'guardia',
  creada: f.creada, expira: f.expira, ...(f.resuelta ? { resuelta: f.resuelta } : {}),
  tipo: f.tipo === 'manos' ? 'manos' : 'permiso',
  ...(f.frase ? { frase: f.frase } : {}), ...(f.patron ? { patron: f.patron } : {}), ...(f.comentario ? { comentario: f.comentario } : {}),
  ...(f.alcance ? { alcance: f.alcance } : {}), ...(f.terminal != null ? { terminal: f.terminal } : {}),
  ...(f.salida != null ? { salida: f.salida } : {}), ...(f.codigo != null ? { codigo: f.codigo } : {}), ...(f.sesion ? { sesion: f.sesion } : {}),
  ...(leerConversacion(f.conversacion) ? { conversacion: leerConversacion(f.conversacion)!.conversationId } : {}),
  ...((f.estado === 'en_cola' || f.estado === 'corriendo' || f.estado === 'corrida') && f.cola ? { enColaDesde: f.cola } : {}),
  ...(f.patron ? { patronFrase: frasePatron(f.patron) } : {}),
  ...(f.categoria !== 'otra' ? { botonSi: botonConsecuencia(f.categoria, f.herramienta ?? undefined, f.literal ?? undefined) } : {}),
})

/** Lo que hace el daemon cuando la persona decide algo que ya nadie esperaba (cola): se lo dice al agente. */
export type Retomar = (c: Confirmacion, scope: ConversacionConfirmacion | null) => void

export class Confirmaciones {
  private retomar: Retomar = () => {}
  /** Cola de aprobaciones: quién le avisa al agente cuando la persona decide algo que ya nadie esperaba. */
  alRetomar(fn: Retomar): this { this.retomar = fn; return this }

  constructor(private readonly db: Database.Database, private readonly ahora: () => number = Date.now, private readonly avisar: (tipo: 'pendiente' | 'resuelta' | 'cola', c: Confirmacion) => void = () => {}) {
    db.exec(`CREATE TABLE IF NOT EXISTS confirmaciones (
      id TEXT PRIMARY KEY, estado TEXT NOT NULL, categoria TEXT NOT NULL, origen TEXT NOT NULL, resumen TEXT NOT NULL,
      detalle TEXT, herramienta TEXT, huella TEXT NOT NULL, creada INTEGER NOT NULL, expira INTEGER NOT NULL, resuelta INTEGER
    ); CREATE INDEX IF NOT EXISTS confirmaciones_huella ON confirmaciones(huella, estado);`)
    // Contrato v3: columnas nuevas en bases que ya existían.
    const cols = new Set((db.prepare(`PRAGMA table_info(confirmaciones)`).all() as { name: string }[]).map(c => c.name))
    for (const [c, tipo] of [['literal', 'TEXT'], ['avisos', 'TEXT'], ['creada_por', 'TEXT'], ...COLUMNAS_PLAY] as const) if (!cols.has(c)) db.exec(`ALTER TABLE confirmaciones ADD COLUMN ${c} ${tipo}`)
  }

  /**
   * Plazos. Una pendiente del chat o de una rutina que nadie contestó pasa a la COLA (no vence, no se ejecuta); las de
   * manos de computer use, las aprobaciones sin usar, las corridas y lo que lleva una semana en la cola quedan vencidas.
   */
  private vencer(): void {
    const ahora = this.ahora()
    const filas = this.db.prepare(`SELECT id FROM confirmaciones WHERE estado = 'pendiente' AND origen IN ${ORIGENES_COLA} AND expira <= ?`).all(ahora) as { id: string }[]
    for (const { id } of filas) this.aLaCola(id)
    this.db.prepare(`UPDATE confirmaciones SET estado='vencida', resuelta=COALESCE(resuelta, ?) WHERE estado IN ('pendiente','en_cola','permitida','corriendo') AND expira <= ?`).run(ahora, ahora)
  }

  private aLaCola(id: string): Confirmacion | null {
    const ahora = this.ahora()
    const ok = this.db.prepare(`UPDATE confirmaciones SET estado = 'en_cola', cola = ?, expira = ? WHERE id = ? AND estado = 'pendiente' AND origen IN ${ORIGENES_COLA}`).run(ahora, ahora + VIDA_COLA_MS, id).changes === 1
    if (!ok) return null
    const f = this.db.prepare('SELECT * FROM confirmaciones WHERE id = ?').get(id) as Fila
    const c = publica(f)
    this.avisar('cola', c)
    return c
  }

  /**
   * Cola de aprobaciones: el turno dejó de esperar (su espera terminó o se interrumpió). La pendiente pasa a la cola de
   * la persona; el agente sigue con lo demás. Devuelve la confirmación como quedó.
   */
  encolar(id: string): Confirmacion | null {
    return this.aLaCola(id) ?? this.get(id)
  }

  /** «Córrelo tú» que sigue corriendo cuando el turno se cansó de esperar: al terminar, su salida va al agente. */
  sinEspera(id: string): void {
    this.db.prepare(`UPDATE confirmaciones SET cola = ? WHERE id = ? AND estado = 'corriendo'`).run(this.ahora(), id)
  }

  private conversacionDe(id: string): ConversacionConfirmacion | null {
    const f = this.db.prepare('SELECT conversacion FROM confirmaciones WHERE id = ?').get(id) as { conversacion: string | null } | undefined
    return leerConversacion(f?.conversacion ?? null)
  }

  get(id: string): Confirmacion | null {
    this.vencer()
    const f = this.db.prepare('SELECT * FROM confirmaciones WHERE id = ?').get(id) as Fila | undefined
    return f ? publica(f) : null
  }

  /** Las que esperan a la persona (en el momento o en su cola); también las de «Córrelo tú» que están corriendo. */
  pendientes(): Confirmacion[] {
    this.vencer()
    return (this.db.prepare(`SELECT * FROM confirmaciones WHERE estado IN ('pendiente','en_cola','corriendo') ORDER BY creada DESC LIMIT 50`).all() as Fila[]).map(publica)
  }

  /**
   * «Córrelo tú» que terminó hace poco (ronda 3): su tarjeta queda en «Listo» con lo que pasó, en vez de esfumarse.
   * `corrida` guarda `expira` = fin + VIDA_APROBACION_MS, así que esto es «lo que terminó en los últimos 10 minutos».
   */
  terminadas(): Confirmacion[] {
    return (this.db.prepare(`SELECT * FROM confirmaciones WHERE estado = 'corrida' AND expira > ? ORDER BY creada DESC LIMIT 10`).all(this.ahora()) as Fila[]).map(publica)
  }

  /** Crea (o reutiliza, si la misma acción ya espera) una confirmación pendiente. */
  pedir(p: PedidoConfirmacion): Confirmacion {
    // Nunca se guarda un literal recortado: se aprobaría sobre texto incompleto (la política ya niega lo que no cabe).
    if (p.literal && String(p.literal).length > 4000) throw new Error('Literal demasiado largo para que la persona lo revise completo.')
    this.vencer()
    const categoria = CATEGORIAS.has(p.categoria) ? p.categoria : 'otra'
    const origen = ORIGENES.has(p.origen) ? p.origen : 'agente'
    const viva = this.db.prepare(`SELECT * FROM confirmaciones WHERE huella = ? AND estado IN ('pendiente','en_cola','permitida','corriendo') ORDER BY creada DESC LIMIT 1`).get(p.huella) as Fila | undefined
    const ahora = this.ahora()
    // La misma acción ya estaba en la cola y el agente la vuelve a pedir: vuelve a ser una pendiente que un turno espera
    // (la persona puede estar delante); si tampoco contesta, regresa a la cola.
    if (viva?.estado === 'en_cola') {
      this.db.prepare(`UPDATE confirmaciones SET estado = 'pendiente', cola = NULL, expira = ? WHERE id = ? AND estado = 'en_cola'`).run(ahora + VIDA_PENDIENTE_MS, viva.id)
      return this.get(viva.id)!
    }
    if (viva) return publica(viva)
    const f: Fila = {
      id: `cf_${randomBytes(6).toString('hex')}`, estado: 'pendiente', categoria, origen,
      resumen: String(p.resumen ?? '').slice(0, 300) || 'Acción irreversible', detalle: p.detalle ? String(p.detalle).slice(0, 2000) : null,
      herramienta: p.herramienta ? String(p.herramienta).slice(0, 120) : null,
      literal: p.literal ? String(p.literal) : null, avisos: p.avisos?.length ? JSON.stringify(p.avisos.map(String).slice(0, 8)) : null,
      creada_por: p.creadaPor === 'peticion' ? 'peticion' : 'guardia', huella: String(p.huella).slice(0, 160),
      creada: ahora, expira: ahora + VIDA_PENDIENTE_MS, resuelta: null,
      tipo: p.tipo === 'manos' ? 'manos' : 'permiso', frase: p.frase ? String(p.frase).slice(0, 300) : null,
      // El freno nunca se guarda como regla: ni se ofrece.
      patron: p.patron && categoria === 'otra' && p.tipo !== 'manos' ? String(p.patron).slice(0, 200) : null,
      comentario: null, alcance: null, terminal: null, salida: null, codigo: null, sesion: p.sesion ? String(p.sesion).slice(0, 120) : null,
      conversacion: p.conversacion && leerConversacion(JSON.stringify(p.conversacion)) ? JSON.stringify(leerConversacion(JSON.stringify(p.conversacion))).slice(0, 600) : null, cola: null,
    }
    this.db.prepare(`INSERT INTO confirmaciones (id, estado, categoria, origen, resumen, detalle, herramienta, literal, avisos, creada_por, huella, creada, expira, resuelta, tipo, frase, patron, comentario, alcance, terminal, salida, codigo, sesion, conversacion, cola)
      VALUES (@id, @estado, @categoria, @origen, @resumen, @detalle, @herramienta, @literal, @avisos, @creada_por, @huella, @creada, @expira, @resuelta, @tipo, @frase, @patron, @comentario, @alcance, @terminal, @salida, @codigo, @sesion, @conversacion, @cola)`).run(f)
    const c = publica(f)
    this.avisar('pendiente', c)
    return c
  }

  /**
   * Decisión humana. Quien llama ya verificó el secreto de la app. `extras` (tarjeta del hilo): el comentario que viaja
   * al agente y el alcance («siempre» solo si la confirmación ofreció patrón; guardar la regla es de quien llama).
   * «Córrelo tú» (tipo `manos`) no se «permite»: se corre (`empezarCorrida`) o se rechaza.
   */
  resolver(id: string, decision: unknown, extras: ExtrasDecision = {}): { ok: true; confirmacion: Confirmacion } | { ok: false; status: number; error: string } {
    if (decision !== 'permitir' && decision !== 'rechazar') return { ok: false, status: 400, error: 'decision debe ser «permitir» o «rechazar».' }
    const actual = this.get(id)
    if (!actual) return { ok: false, status: 404, error: 'No existe esa confirmación.' }
    if (actual.estado !== 'pendiente' && actual.estado !== 'en_cola') return { ok: false, status: 409, error: `La confirmación ya está ${actual.estado}.` }
    if (decision === 'permitir' && actual.tipo === 'manos') return { ok: false, status: 409, error: 'Esto no lo corre el agente: córrelo tú desde la tarjeta o recházalo.' }
    const alcance: AlcanceConfirmacion = extras.alcance === 'siempre' ? 'siempre' : 'una'
    if (decision === 'permitir' && alcance === 'siempre' && !actual.patron) return { ok: false, status: 409, error: 'Esta acción no se puede aprobar para siempre: solo una vez.' }
    const comentario = limpiarComentario(extras.comentario) || null
    const ahora = this.ahora()
    const estado: EstadoConfirmacion = decision === 'permitir' ? 'permitida' : 'rechazada'
    // Desde la cola nadie espera: la aprobación tiene que durar lo que tarda el agente en retomarla.
    const desdeCola = actual.estado === 'en_cola'
    const vida = !desdeCola ? VIDA_APROBACION_MS : actual.origen === 'cron' ? VIDA_APROBACION_COLA_RUTINA_MS : VIDA_APROBACION_COLA_MS
    const cambio = this.db.prepare(`UPDATE confirmaciones SET estado = ?, resuelta = ?, expira = ?, comentario = ?, alcance = ? WHERE id = ? AND estado = ?`)
      .run(estado, ahora, estado === 'permitida' ? ahora + vida : actual.expira, comentario, decision === 'permitir' ? alcance : null, id, actual.estado).changes
    if (cambio !== 1) return { ok: false, status: 409, error: 'La confirmación cambió mientras tanto.' }
    const c = this.get(id)!
    this.avisar('resuelta', c)
    if (desdeCola) this.retomar(c, this.conversacionDe(id))
    return { ok: true, confirmacion: c }
  }

  /** «Córrelo tú»: la persona apretó el botón. Pasa a `corriendo` (con su terminal) si seguía pendiente. */
  empezarCorrida(id: string, terminal: number, extras: ExtrasDecision = {}, vidaMs = VIDA_CORRIDA_MS): { ok: true; confirmacion: Confirmacion } | { ok: false; status: number; error: string } {
    const actual = this.get(id)
    if (!actual) return { ok: false, status: 404, error: 'No existe esa confirmación.' }
    if (actual.tipo !== 'manos') return { ok: false, status: 409, error: 'Esta confirmación no es para correrla tú.' }
    if (actual.estado !== 'pendiente' && actual.estado !== 'en_cola') return { ok: false, status: 409, error: `La confirmación ya está ${actual.estado}.` }
    const ahora = this.ahora()
    // Desde la cola, `cola` queda marcada: al terminar, la salida va al agente por su conversación (nadie la espera).
    const ok = this.db.prepare(`UPDATE confirmaciones SET estado = 'corriendo', resuelta = ?, expira = ?, terminal = ?, comentario = ? WHERE id = ? AND estado IN ('pendiente','en_cola')`)
      .run(ahora, ahora + vidaMs, terminal, limpiarComentario(extras.comentario) || null, id).changes === 1
    if (!ok) return { ok: false, status: 409, error: 'La confirmación cambió mientras tanto.' }
    const c = this.get(id)!
    this.avisar('resuelta', c)
    return { ok: true, confirmacion: c }
  }

  /** «Córrelo tú»: terminó (o se dejó de vigilar). Guarda la salida recortada y el código. */
  terminarCorrida(id: string, salida: string, codigo: number | null): Confirmacion | null {
    const s = salida.length > SALIDA_MAX ? `[…]\n${salida.slice(-SALIDA_MAX)}` : salida
    const antes = this.db.prepare(`SELECT cola FROM confirmaciones WHERE id = ? AND estado = 'corriendo'`).get(id) as { cola: number | null } | undefined
    const cambio = this.db.prepare(`UPDATE confirmaciones SET estado = 'corrida', salida = ?, codigo = ?, expira = ? WHERE id = ? AND estado = 'corriendo'`).run(s, codigo, this.ahora() + VIDA_APROBACION_MS, id).changes
    const c = this.get(id)
    if (c) this.avisar('resuelta', c)
    if (c && cambio === 1 && antes?.cola) this.retomar(c, this.conversacionDe(id))
    return c
  }


  /** Usa (una sola vez) una aprobación vigente de esta acción. */
  consumir(huella: string): boolean {
    this.vencer()
    const f = this.db.prepare(`SELECT id FROM confirmaciones WHERE huella = ? AND estado = 'permitida' ORDER BY resuelta DESC LIMIT 1`).get(huella) as { id: string } | undefined
    if (!f) return false
    return this.db.prepare(`UPDATE confirmaciones SET estado = 'usada' WHERE id = ? AND estado = 'permitida'`).run(f.id).changes === 1
  }

  /** Espera la decisión humana hasta `ms`. Devuelve el estado final (o 'pendiente' si se acabó la espera). */
  async esperar(id: string, ms: number, cadaMs = 500, signal?: AbortSignal, corridaMs = 0): Promise<EstadoConfirmacion> {
    let fin = Date.now() + ms
    let extendida = false
    for (;;) {
      const c = this.get(id)
      if (!c) return 'vencida'
      // «Córrelo tú»: con el clic, la espera se alarga lo que dura una corrida (la persona escribe su contraseña).
      if (c.estado === 'corriendo') { if (!extendida) { extendida = true; fin = Date.now() + corridaMs } if (Date.now() >= fin || signal?.aborted) return 'corriendo'; await new Promise(r => setTimeout(r, cadaMs)); continue }
      if (c.estado === 'en_cola') return 'pendiente'
      if (c.estado !== 'pendiente') return c.estado
      if (Date.now() >= fin || signal?.aborted) return 'pendiente'
      await new Promise(r => setTimeout(r, cadaMs))
    }
  }
}

/**
 * Pedido de confirmación de manos (contrato v3 §6): `{ herramienta, partes, categoria?, motivo? }`. El literal y la
 * huella los calcula el daemon de la acción estructurada; `motivo` se muestra marcado como «declarado, sin verificar».
 */
export function pedidoManos(cuerpo: Record<string, unknown>): { error: string; status: number } | { herramienta: string; huella: string; literal: string; resumen: string; detalle?: string; categoria: CategoriaConfirmacion } {
  if ('huella' in cuerpo || 'resumen' in cuerpo) return { status: 400, error: 'Contrato v3: manda { herramienta, partes }; el daemon calcula el resumen y la huella.' }
  const herramienta = typeof cuerpo.herramienta === 'string' ? cuerpo.herramienta.trim() : ''
  if (!/^(manos|web|lienzo):[\w.-]{1,60}$/.test(herramienta) || !Array.isArray(cuerpo.partes)) return { status: 400, error: 'herramienta (manos:|web:|lienzo:<acción>) y partes (lista) requeridas.' }
  const literal = `${herramienta} ${JSON.stringify(cuerpo.partes)}`
  if (literal.length > 4000) return { status: 413, error: 'La acción es demasiado grande para que la persona la revise.' }
  const categorias = ['enviar', 'pagar', 'borrar', 'publicar', 'otra'] as const
  const categoria = categorias.includes(cuerpo.categoria as never) ? cuerpo.categoria as CategoriaConfirmacion : 'otra'
  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  return {
    herramienta, literal, categoria, huella: huellaManos(herramienta, cuerpo.partes),
    resumen: `Levy usando tu computadora: ${literal.slice(0, 160)}`,
    ...(motivo ? { detalle: `Motivo que declaró quien la pidió (sin verificar): ${motivo}` } : {}),
  }
}

// ---------- Qué es irreversible (pura) ----------

export interface AccionIrreversible { categoria: CategoriaConfirmacion; resumen: string; detalle?: string }

const BASH_IRREVERSIBLE: Array<{ re: RegExp; categoria: CategoriaConfirmacion; que: string }> = [
  { re: /\bgit\s+push\b/, categoria: 'publicar', que: 'Subir cambios (git push)' },
  { re: /\b(?:npm|pnpm|yarn|bun)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b/, categoria: 'publicar', que: 'Publicar un paquete' },
  { re: /\bgh\s+(?:release\s+create|pr\s+(?:create|merge)|repo\s+(?:create|delete)|issue\s+create|gist\s+create)\b/, categoria: 'publicar', que: 'Publicar en GitHub' },
  { re: /\b(?:vercel|netlify|firebase|fly|flyctl|wrangler|railway)\b[^|;&]*\b(?:deploy|publish|--prod)\b|\bdocker\s+push\b/, categoria: 'publicar', que: 'Desplegar o publicar' },
  { re: /(?:^|[;&|(]\s*|\s)(?:rm|rmdir|unlink|shred|trash)\s+\S/, categoria: 'borrar', que: 'Borrar archivos' },
  { re: /\bfind\b[^|;&]*\s-delete\b|\bgit\s+branch\s+-D\b|\bRemove-Item\b|(?:^|[;&|]\s*)(?:del|rd)\s+\S/i, categoria: 'borrar', que: 'Borrar archivos o ramas' },
  { re: /\b(?:sendmail|mailx?|mutt)\b|\bgog\s+gmail\s+send\b/, categoria: 'enviar', que: 'Enviar un correo' },
  { re: /\bcurl\b[^|;&]*(?:\s-X\s*(?:POST|PUT|PATCH|DELETE)\b|\s--request\s+(?:POST|PUT|PATCH|DELETE)\b|\s(?:-d|--data(?:-\w+)?|-F|--form|--json)\s)|\bwget\b[^|;&]*--post-(?:data|file)\b|\bInvoke-(?:WebRequest|RestMethod)\b[^|;&]*-Method\s+(?:Post|Put|Patch|Delete)\b/i, categoria: 'enviar', que: 'Enviar datos a internet' },
  { re: /\bstripe\b[^|;&]*\b(?:create|pay|confirm|capture|refund|refunds|payouts|transfers|charges|payment_intents)\b/, categoria: 'pagar', que: 'Cobrar o pagar' },
]

const MCP_IRREVERSIBLE: Array<{ re: RegExp; categoria: CategoriaConfirmacion; que: string }> = [
  { re: /(?:^|_)(?:pay|payment|pagar|pago|charge|cobrar|cobro|purchase|comprar|checkout|transfer|transferir|refund)(?:_|$)/i, categoria: 'pagar', que: 'Pagar o cobrar' },
  { re: /(?:^|_)(?:publish|publicar|post|tweet|deploy|release|share|compartir)(?:_|$)/i, categoria: 'publicar', que: 'Publicar' },
  { re: /(?:^|_)(?:send|enviar|reply|responder|forward|reenviar|invite|invitar)(?:_|$)/i, categoria: 'enviar', que: 'Enviar' },
  { re: /(?:^|_)(?:delete|borrar|eliminar|remove|trash|destroy|drop|purge)(?:_|$)/i, categoria: 'borrar', que: 'Borrar' },
]

/** ¿Esta herramienta, con este input, envía, paga, borra o publica? Pura. */
export function accionIrreversible(herramienta: string, input: unknown): AccionIrreversible | null {
  const i = (input ?? {}) as Record<string, unknown>
  if (herramienta === 'Bash' || /(^|__)(bash|shell|exec)$/i.test(herramienta)) {
    const cmd = typeof i.command === 'string' ? i.command : typeof i.cmd === 'string' ? i.cmd : ''
    for (const p of BASH_IRREVERSIBLE) if (p.re.test(cmd)) return { categoria: p.categoria, resumen: `${p.que}: ${cmd.replace(/\s+/g, ' ').trim().slice(0, 160)}`, detalle: cmd.slice(0, 2000) }
    return null
  }
  if (herramienta.startsWith('mcp__')) {
    const accion = herramienta.split('__').slice(2).join('__')
    // Las herramientas propias de Arbrain (cabina, manos) tienen su propio freno.
    if (/^mcp__(?:cabina|manos|live)__/.test(herramienta)) return null
    for (const p of MCP_IRREVERSIBLE) if (p.re.test(accion)) return { categoria: p.categoria, resumen: `${p.que}: ${herramienta}`, detalle: JSON.stringify(input ?? {}).slice(0, 2000) }
  }
  return null
}

// ---------- Instancia del daemon ----------

let instancia: Confirmaciones | null = null
export function iniciarConfirmaciones(db: Database.Database, avisar?: (tipo: 'pendiente' | 'resuelta' | 'cola', c: Confirmacion) => void): Confirmaciones {
  instancia = new Confirmaciones(db, Date.now, avisar)
  return instancia
}
export const confirmacionesDelDaemon = (): Confirmaciones | null => instancia
