/**
 * Monitoreo de cohorte, «Levy por fundador» (AUDITORIA §4 y §5; contrato §7). Apagado por defecto.
 *
 * - Solo cifras agregadas por día: conversaciones con actividad, acciones de venta, cierres y facturación por moneda.
 *   Nunca texto de conversaciones, nombres, correos ni datos de terceros.
 * - Las sesiones se cuentan de la base local que ya existe (chat_runtime_turns); las ventas, de lo que el propio
 *   alumno registra (`POST /cohorte/venta`), sin a quién.
 * - Solo sale algo con las tres condiciones: edición cliente, consentimiento guardado (archivo 0600 en su carpeta de
 *   datos, dado con el secreto de la app, no por el modelo) y `ARBRAIN_COHORTE_URL` no vacío. Por defecto está vacío.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { esEdicionCliente } from '../edicion.js'

export const VERSION_CONSENTIMIENTO = 1
const MAX_DIAS = 30

export interface Consentimiento { acepto: true; fecha: string; version: number }
export interface DiaCohorte { dia: string; sesiones: number; acciones_venta: number; cierres: number; facturacion: Record<string, number> }
export interface Paquete { version: 1; instalacion: string; generado: string; dias: DiaCohorte[] }

const dirCohorte = () => join(process.env.ARBRAIN_DATA_DIR || join(process.env.ARBRAIN_CONFIG_DIR || '.', '..'), 'cohorte')
export const urlCohorte = () => (process.env.ARBRAIN_COHORTE_URL ?? '').trim()

function escribirPrivado(ruta: string, datos: unknown): void {
  mkdirSync(join(ruta, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(`${ruta}.tmp`, JSON.stringify(datos, null, 1), { mode: 0o600 })
  renameSync(`${ruta}.tmp`, ruta)
}
function leerJson<T>(ruta: string): T | null { try { return JSON.parse(readFileSync(ruta, 'utf8')) as T } catch { return null } }

/** Día local AAAA-MM-DD. */
export const diaLocal = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export class Cohorte {
  constructor(private readonly db: Database.Database, private readonly dir: string = dirCohorte(), private readonly ahora: () => number = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS cohorte_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dia TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('accion','cierre')),
      monto REAL, moneda TEXT, creado INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS cohorte_eventos_dia ON cohorte_eventos(dia);`)
  }

  private get rutaConsentimiento() { return join(this.dir, 'consentimiento.json') }
  private get rutaEstado() { return join(this.dir, 'estado.json') }

  consentimiento(): Consentimiento | null {
    const c = leerJson<Consentimiento>(this.rutaConsentimiento)
    return c && c.acepto === true && c.version === VERSION_CONSENTIMIENTO ? c : null
  }

  fijarConsentimiento(acepto: boolean): void {
    if (acepto) escribirPrivado(this.rutaConsentimiento, { acepto: true, fecha: new Date(this.ahora()).toISOString(), version: VERSION_CONSENTIMIENTO })
    else if (existsSync(this.rutaConsentimiento)) rmSync(this.rutaConsentimiento)
  }

  private estado(): { instalacion: string; enviadoHasta?: string; ultimoEnvio?: number } {
    const e = leerJson<{ instalacion: string; enviadoHasta?: string; ultimoEnvio?: number }>(this.rutaEstado)
    if (e?.instalacion) return e
    const nuevo = { instalacion: randomUUID() }
    escribirPrivado(this.rutaEstado, nuevo)
    return nuevo
  }

  registrarVenta(tipo: unknown, monto?: unknown, moneda?: unknown): { ok: true } | { ok: false; error: string } {
    if (tipo !== 'accion' && tipo !== 'cierre') return { ok: false, error: 'tipo debe ser «accion» o «cierre».' }
    const m = monto === undefined || monto === null ? null : Number(monto)
    if (m !== null && (!Number.isFinite(m) || m < 0 || m > 1e10)) return { ok: false, error: 'monto inválido.' }
    const mon = typeof moneda === 'string' && /^[A-Za-z]{3}$/.test(moneda) ? moneda.toUpperCase() : (m !== null ? 'MXN' : null)
    this.db.prepare('INSERT INTO cohorte_eventos (dia, tipo, monto, moneda, creado) VALUES (?, ?, ?, ?, ?)').run(diaLocal(this.ahora()), tipo, m, mon, this.ahora())
    return { ok: true }
  }

  /** Agregados por día desde `desde` (exclusivo) hasta hoy. Solo números. */
  agregados(desde?: string): DiaCohorte[] {
    const hoy = diaLocal(this.ahora())
    const limite = diaLocal(this.ahora() - MAX_DIAS * 86_400_000)
    const inicio = desde && desde > limite ? desde : limite
    const dias = new Map<string, DiaCohorte>()
    const dia = (d: string) => { let x = dias.get(d); if (!x) { x = { dia: d, sesiones: 0, acciones_venta: 0, cierres: 0, facturacion: {} }; dias.set(d, x) } return x }
    let turnos: Array<{ conversation_id: string; created_at: number }> = []
    try { turnos = this.db.prepare('SELECT conversation_id, created_at FROM chat_runtime_turns WHERE created_at >= ?').all(this.ahora() - (MAX_DIAS + 1) * 86_400_000) as typeof turnos } catch { /* sin journal todavía */ }
    const vistas = new Set<string>()
    for (const t of turnos) {
      const d = diaLocal(t.created_at)
      if (d <= inicio || d > hoy) continue
      const k = `${d}|${t.conversation_id}`
      if (vistas.has(k)) continue
      vistas.add(k); dia(d).sesiones++
    }
    const ventas = this.db.prepare('SELECT dia, tipo, monto, moneda FROM cohorte_eventos WHERE dia > ? AND dia <= ?').all(inicio, hoy) as Array<{ dia: string; tipo: string; monto: number | null; moneda: string | null }>
    for (const v of ventas) {
      const x = dia(v.dia)
      if (v.tipo === 'accion') x.acciones_venta++
      else x.cierres++
      if (v.monto !== null && v.moneda) x.facturacion[v.moneda] = Math.round(((x.facturacion[v.moneda] ?? 0) + v.monto) * 100) / 100
    }
    return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia))
  }

  /** «Qué se enviaría»: el paquete exacto del próximo envío. */
  vistaPrevia(): Paquete {
    const e = this.estado()
    return { version: 1, instalacion: e.instalacion, generado: new Date(this.ahora()).toISOString(), dias: this.agregados(e.enviadoHasta) }
  }

  resumen() {
    return { consentimiento: this.consentimiento(), endpoint_configurado: urlCohorte().length > 0, ultimo_envio: this.estado().ultimoEnvio ?? null, vista_previa: this.vistaPrevia() }
  }

  /** Envía si y solo si: edición cliente + consentimiento + URL. Devuelve qué pasó. Nunca lanza. */
  async enviar(fetcher: typeof fetch = fetch): Promise<'sin_consentimiento' | 'sin_url' | 'no_cliente' | 'nada' | 'enviado' | 'fallo'> {
    if (!esEdicionCliente()) return 'no_cliente'
    if (!this.consentimiento()) return 'sin_consentimiento'
    const url = urlCohorte()
    if (!url) return 'sin_url'
    const paquete = this.vistaPrevia()
    // El día de hoy sigue abierto: se manda solo hasta ayer.
    const hoy = diaLocal(this.ahora())
    paquete.dias = paquete.dias.filter(d => d.dia < hoy)
    if (!paquete.dias.length) return 'nada'
    try {
      const r = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paquete), signal: AbortSignal.timeout(15_000) })
      await r.body?.cancel().catch(() => {})
      if (!r.ok) return 'fallo'
      escribirPrivado(this.rutaEstado, { ...this.estado(), enviadoHasta: paquete.dias.at(-1)!.dia, ultimoEnvio: this.ahora() })
      return 'enviado'
    } catch { return 'fallo' }
  }
}

let instancia: Cohorte | null = null
export function iniciarCohorte(db: Database.Database): Cohorte { instancia = new Cohorte(db); return instancia }
export const cohorteDelDaemon = () => instancia
