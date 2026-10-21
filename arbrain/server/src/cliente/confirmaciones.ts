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

export type CategoriaConfirmacion = 'enviar' | 'pagar' | 'borrar' | 'publicar' | 'otra'
export type EstadoConfirmacion = 'pendiente' | 'permitida' | 'rechazada' | 'vencida' | 'usada'
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
}

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
}

/** Vida de una pendiente sin respuesta y de una aprobación sin usar. */
export const VIDA_PENDIENTE_MS = 10 * 60_000
export const VIDA_APROBACION_MS = 10 * 60_000

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

interface Fila { id: string; estado: EstadoConfirmacion; categoria: CategoriaConfirmacion; origen: OrigenConfirmacion; resumen: string; detalle: string | null; herramienta: string | null; literal: string | null; avisos: string | null; creada_por: CreadaPor | null; huella: string; creada: number; expira: number; resuelta: number | null }

const leerAvisos = (s: string | null): string[] => { try { const a = JSON.parse(s ?? '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] } }

const publica = (f: Fila): Confirmacion => ({
  id: f.id, estado: f.estado, categoria: f.categoria, origen: f.origen, resumen: f.resumen,
  ...(f.detalle ? { detalle: f.detalle } : {}), ...(f.herramienta ? { herramienta: f.herramienta } : {}),
  ...(f.literal ? { literal: f.literal } : {}), ...(f.avisos && leerAvisos(f.avisos).length ? { avisos: leerAvisos(f.avisos) } : {}),
  creadaPor: f.creada_por ?? 'guardia',
  creada: f.creada, expira: f.expira, ...(f.resuelta ? { resuelta: f.resuelta } : {}),
})

export class Confirmaciones {
  constructor(private readonly db: Database.Database, private readonly ahora: () => number = Date.now, private readonly avisar: (tipo: 'pendiente' | 'resuelta', c: Confirmacion) => void = () => {}) {
    db.exec(`CREATE TABLE IF NOT EXISTS confirmaciones (
      id TEXT PRIMARY KEY, estado TEXT NOT NULL, categoria TEXT NOT NULL, origen TEXT NOT NULL, resumen TEXT NOT NULL,
      detalle TEXT, herramienta TEXT, huella TEXT NOT NULL, creada INTEGER NOT NULL, expira INTEGER NOT NULL, resuelta INTEGER
    ); CREATE INDEX IF NOT EXISTS confirmaciones_huella ON confirmaciones(huella, estado);`)
    // Contrato v3: columnas nuevas en bases que ya existían.
    const cols = new Set((db.prepare(`PRAGMA table_info(confirmaciones)`).all() as { name: string }[]).map(c => c.name))
    for (const [c, tipo] of [['literal', 'TEXT'], ['avisos', 'TEXT'], ['creada_por', 'TEXT']] as const) if (!cols.has(c)) db.exec(`ALTER TABLE confirmaciones ADD COLUMN ${c} ${tipo}`)
  }

  /** Marca vencidas las pendientes y aprobaciones sin usar que pasaron su plazo. */
  private vencer(): void {
    this.db.prepare(`UPDATE confirmaciones SET estado='vencida', resuelta=COALESCE(resuelta, ?) WHERE estado IN ('pendiente','permitida') AND expira <= ?`).run(this.ahora(), this.ahora())
  }

  get(id: string): Confirmacion | null {
    this.vencer()
    const f = this.db.prepare('SELECT * FROM confirmaciones WHERE id = ?').get(id) as Fila | undefined
    return f ? publica(f) : null
  }

  pendientes(): Confirmacion[] {
    this.vencer()
    return (this.db.prepare(`SELECT * FROM confirmaciones WHERE estado='pendiente' ORDER BY creada DESC LIMIT 50`).all() as Fila[]).map(publica)
  }

  /** Crea (o reutiliza, si la misma acción ya espera) una confirmación pendiente. */
  pedir(p: PedidoConfirmacion): Confirmacion {
    // Nunca se guarda un literal recortado: se aprobaría sobre texto incompleto (la política ya niega lo que no cabe).
    if (p.literal && String(p.literal).length > 4000) throw new Error('Literal demasiado largo para que la persona lo revise completo.')
    this.vencer()
    const categoria = CATEGORIAS.has(p.categoria) ? p.categoria : 'otra'
    const origen = ORIGENES.has(p.origen) ? p.origen : 'agente'
    const viva = this.db.prepare(`SELECT * FROM confirmaciones WHERE huella = ? AND estado IN ('pendiente','permitida') ORDER BY creada DESC LIMIT 1`).get(p.huella) as Fila | undefined
    if (viva) return publica(viva)
    const ahora = this.ahora()
    const f: Fila = {
      id: `cf_${randomBytes(6).toString('hex')}`, estado: 'pendiente', categoria, origen,
      resumen: String(p.resumen ?? '').slice(0, 300) || 'Acción irreversible', detalle: p.detalle ? String(p.detalle).slice(0, 2000) : null,
      herramienta: p.herramienta ? String(p.herramienta).slice(0, 120) : null,
      literal: p.literal ? String(p.literal) : null, avisos: p.avisos?.length ? JSON.stringify(p.avisos.map(String).slice(0, 8)) : null,
      creada_por: p.creadaPor === 'peticion' ? 'peticion' : 'guardia', huella: String(p.huella).slice(0, 160),
      creada: ahora, expira: ahora + VIDA_PENDIENTE_MS, resuelta: null,
    }
    this.db.prepare(`INSERT INTO confirmaciones (id, estado, categoria, origen, resumen, detalle, herramienta, literal, avisos, creada_por, huella, creada, expira, resuelta)
      VALUES (@id, @estado, @categoria, @origen, @resumen, @detalle, @herramienta, @literal, @avisos, @creada_por, @huella, @creada, @expira, @resuelta)`).run(f)
    const c = publica(f)
    this.avisar('pendiente', c)
    return c
  }

  /** Decisión humana. Quien llama ya verificó el secreto de la app. */
  resolver(id: string, decision: unknown): { ok: true; confirmacion: Confirmacion } | { ok: false; status: number; error: string } {
    if (decision !== 'permitir' && decision !== 'rechazar') return { ok: false, status: 400, error: 'decision debe ser «permitir» o «rechazar».' }
    const actual = this.get(id)
    if (!actual) return { ok: false, status: 404, error: 'No existe esa confirmación.' }
    if (actual.estado !== 'pendiente') return { ok: false, status: 409, error: `La confirmación ya está ${actual.estado}.` }
    const ahora = this.ahora()
    const estado: EstadoConfirmacion = decision === 'permitir' ? 'permitida' : 'rechazada'
    this.db.prepare(`UPDATE confirmaciones SET estado = ?, resuelta = ?, expira = ? WHERE id = ? AND estado = 'pendiente'`)
      .run(estado, ahora, estado === 'permitida' ? ahora + VIDA_APROBACION_MS : actual.expira, id)
    const c = this.get(id)!
    this.avisar('resuelta', c)
    return { ok: true, confirmacion: c }
  }

  /** Usa (una sola vez) una aprobación vigente de esta acción. */
  consumir(huella: string): boolean {
    this.vencer()
    const f = this.db.prepare(`SELECT id FROM confirmaciones WHERE huella = ? AND estado = 'permitida' ORDER BY resuelta DESC LIMIT 1`).get(huella) as { id: string } | undefined
    if (!f) return false
    return this.db.prepare(`UPDATE confirmaciones SET estado = 'usada' WHERE id = ? AND estado = 'permitida'`).run(f.id).changes === 1
  }

  /** Espera la decisión humana hasta `ms`. Devuelve el estado final (o 'pendiente' si se acabó la espera). */
  async esperar(id: string, ms: number, cadaMs = 500, signal?: AbortSignal): Promise<EstadoConfirmacion> {
    const fin = Date.now() + ms
    for (;;) {
      const c = this.get(id)
      if (!c) return 'vencida'
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
export function iniciarConfirmaciones(db: Database.Database, avisar?: (tipo: 'pendiente' | 'resuelta', c: Confirmacion) => void): Confirmaciones {
  instancia = new Confirmaciones(db, Date.now, avisar)
  return instancia
}
export const confirmacionesDelDaemon = (): Confirmaciones | null => instancia
