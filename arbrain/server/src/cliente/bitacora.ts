/**
 * «Lo que hizo Levy» (seguridad del alumno, 12 oct 2026; AUDITORIA punto 4): bitácora local de las acciones con efecto
 * de los agentes en la edición cliente: cuándo, qué herramienta, el comando o la ruta, y si la persona la confirmó, la
 * rechazó, venció o la guardia la negó. También lo que corrió sin preguntar (escribir dentro del cerebro, crear
 * carpetas, abrir una página de un dominio ya aprobado, despertadores).
 *
 * Local y sin secretos: vive en la base del daemon (archivo 0600 en la carpeta de datos de la app, fuera del alcance
 * de los agentes); nunca sale de la máquina; el texto pasa por `redactar` (llaves, tokens, contraseñas, JWT, llaves
 * privadas) antes de guardarse; del contenido de un archivo escrito solo queda el tamaño. Se queda con lo último
 * (`MAX_FILAS`) y lo de los últimos `DIAS_RETENCION` días.
 */
import type Database from 'better-sqlite3'

export type DecisionBitacora = 'hecho' | 'confirmado' | 'rechazado' | 'vencido' | 'sin_respuesta' | 'negado' | 'pausado'

export interface EntradaBitacora {
  id: number
  ts: number
  origen: 'agente' | 'cron'
  herramienta: string
  que: string
  decision: DecisionBitacora
  motivo?: string
  confirmacion?: string
}

export const MAX_FILAS = 5000
export const DIAS_RETENCION = 90
const MAX_TEXTO = 600

/**
 * Quita lo que parece secreto de un texto (pura). Mejor tapar de más que guardar una llave: formas de llaves conocidas,
 * `Authorization: Bearer …`, `clave=valor` con nombres de secreto, JWT, llaves privadas PEM, usuario:contraseña en URLs
 * y cadenas largas de alta entropía.
 */
export function redactar(texto: string): string {
  return texto
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[llave privada]')
    .replace(/\b(sk-ant-[A-Za-z0-9_-]{8,}|sk-or-v1-[A-Za-z0-9]{8,}|sk-or-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{8,}|rk_(live|test)_[A-Za-z0-9]{8,}|pk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,})/g, '[llave]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/g, '[llave]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token]')
    .replace(/(authorization|x-api-key|api-key|x-arbrain-confirmar)(\s*[:=]\s*)(bearer\s+|basic\s+)?[^\s'"]+/gi, '$1$2[oculto]')
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [oculto]')
    .replace(/([A-Za-z0-9_]*(?:token|secret|secreto|password|passwd|contrase(?:ñ|n)a|api_?key|apikey|llave|clave|private_?key|access_?key|auth)[A-Za-z0-9_]*)(\s*[=:]\s*|"\s*:\s*")("?)[^\s'"&,}]+/gi, '$1$2$3[oculto]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[oculto]@')
    .replace(/(?<![\w./-])[A-Za-z0-9+_-]{40,}={0,2}/g, m => (/\d/.test(m) && /[A-Za-z]/.test(m) ? '[dato largo oculto]' : m))
}

const recortar = (s: string) => (s.length > MAX_TEXTO ? `${s.slice(0, MAX_TEXTO)}…` : s)

/** El «qué» de una acción, sin contenido de archivos y redactado (pura). */
export function queDe(herramienta: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const ruta = ['file_path', 'path', 'notebook_path'].map(c => i[c]).find(x => typeof x === 'string' && x) as string | undefined
  let que: string
  if (typeof i.command === 'string') que = i.command
  else if (typeof i.url === 'string') que = i.url
  else if (ruta) {
    const tam = typeof i.content === 'string' ? ` (${i.content.length} caracteres)` : typeof i.new_string === 'string' ? ' (edición)' : ''
    que = `${ruta}${tam}`
  } else {
    const { content: _c, ...resto } = i
    que = JSON.stringify(resto)
  }
  return recortar(redactar(que.replace(/\s+/g, ' ').trim()))
}

export class Bitacora {
  private inserciones = 0
  constructor(private readonly db: Database.Database, private readonly ahora: () => number = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS bitacora_acciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, origen TEXT NOT NULL, herramienta TEXT NOT NULL,
      que TEXT NOT NULL, decision TEXT NOT NULL, motivo TEXT, confirmacion TEXT
    ); CREATE INDEX IF NOT EXISTS bitacora_acciones_ts ON bitacora_acciones(ts);`)
  }

  anotar(e: { origen?: 'agente' | 'cron'; herramienta: string; input?: unknown; que?: string; decision: DecisionBitacora; motivo?: string; confirmacion?: string }): void {
    const que = e.que !== undefined ? recortar(redactar(e.que)) : queDe(e.herramienta, e.input)
    this.db.prepare(`INSERT INTO bitacora_acciones (ts, origen, herramienta, que, decision, motivo, confirmacion) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(this.ahora(), e.origen === 'cron' ? 'cron' : 'agente', String(e.herramienta).slice(0, 120), que, e.decision,
        e.motivo ? recortar(redactar(e.motivo)) : null, e.confirmacion ? String(e.confirmacion).slice(0, 40) : null)
    if (++this.inserciones % 100 === 1) this.podar()
  }

  podar(): void {
    this.db.prepare(`DELETE FROM bitacora_acciones WHERE ts < ?`).run(this.ahora() - DIAS_RETENCION * 86_400_000)
    this.db.prepare(`DELETE FROM bitacora_acciones WHERE id <= (SELECT id FROM bitacora_acciones ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(MAX_FILAS)
  }

  ultimas(limite = 200): EntradaBitacora[] {
    const n = Math.max(1, Math.min(1000, Math.floor(limite) || 200))
    const filas = this.db.prepare(`SELECT * FROM bitacora_acciones ORDER BY id DESC LIMIT ?`).all(n) as Array<Record<string, unknown>>
    return filas.map(f => ({
      id: Number(f.id), ts: Number(f.ts), origen: f.origen === 'cron' ? 'cron' : 'agente', herramienta: String(f.herramienta), que: String(f.que),
      decision: f.decision as DecisionBitacora, ...(f.motivo ? { motivo: String(f.motivo) } : {}), ...(f.confirmacion ? { confirmacion: String(f.confirmacion) } : {}),
    }))
  }
}

let instancia: Bitacora | null = null
export function iniciarBitacora(db: Database.Database): Bitacora { instancia = new Bitacora(db); return instancia }
export const bitacoraDelDaemon = (): Bitacora | null => instancia
/** Solo pruebas. */
export function _bitacoraParaPruebas(b: Bitacora | null): void { instancia = b }
