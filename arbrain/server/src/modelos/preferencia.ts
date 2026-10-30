/**
 * Modelo de las conversaciones nuevas (sección «Modelo» de Configuración, 2 oct 2026).
 *
 * Una sola preferencia para todos los dispositivos: en qué motor nacen las conversaciones nuevas
 * (Claude, GPT o DeepSeek), con qué modelo y con qué esfuerzo. Vive en el daemon (SQLite) para que
 * web, escritorio y teléfono vean lo mismo. Vacía = todo sigue como estaba: nada se aplica.
 *
 * Se aplica en dos lugares de `chat_controls_v2`: la fila `''` del motor elegido (el «chat nuevo», de
 * donde sale la intención del primer turno) y cada conversación nueva de ese motor al crear su fila.
 * Una conversación existente nunca cambia: su modelo y esfuerzo se eligen en la barra del chat.
 */
import type Database from 'better-sqlite3'
import { esCuentaChat } from './registro.js'

export interface PreferenciaMotor {
  /** Espacio donde nacen las conversaciones nuevas (`default`, `codex`, `deepseek`...); null = como estaba. */
  motor: string | null
  /** Modelo para ese motor; null = el de la cuenta. */
  modelo: string | null
  /** Esfuerzo para ese motor; null = el de la cuenta. */
  esfuerzo: string | null
}

export const preferenciaVacia = (): PreferenciaMotor => ({ motor: null, modelo: null, esfuerzo: null })
const CLAVE = 'motor-conversaciones-nuevas'

function tabla(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS preferencia_motor (clave TEXT PRIMARY KEY, valor_json TEXT NOT NULL, updated_at INTEGER NOT NULL)')
}

const texto = (v: unknown): string | null => typeof v === 'string' && v.trim() && v.length <= 200 && v !== 'default' ? v.trim() : null

/** Normaliza lo guardado: un JSON dañado o editado a mano nunca rompe el chat. */
export function normalizar(crudo: unknown): PreferenciaMotor {
  if (!crudo || typeof crudo !== 'object') return preferenciaVacia()
  const v = crudo as Record<string, unknown>
  const motor = typeof v.motor === 'string' ? v.motor : null
  if (!motor || !esCuentaChat(motor)) return preferenciaVacia()
  return { motor, modelo: texto(v.modelo), esfuerzo: texto(v.esfuerzo) }
}

/** Solo lee; sin tabla devuelve vacía sin crear nada (se llama dentro de la transacción que crea filas de controles). */
export function leerPreferencia(db: Database.Database): PreferenciaMotor {
  try {
    const fila = db.prepare('SELECT valor_json FROM preferencia_motor WHERE clave=?').get(CLAVE) as { valor_json: string } | undefined
    return fila ? normalizar(JSON.parse(fila.valor_json)) : preferenciaVacia()
  } catch { return preferenciaVacia() }
}

/** Controles con que nace una conversación nueva de `cuenta`: los de la preferencia si es su motor. */
export function controlesIniciales(db: Database.Database, cuenta: string): { model: string | null; effort: string | null } | null {
  const p = leerPreferencia(db)
  return p.motor === cuenta && (p.modelo || p.esfuerzo) ? { model: p.modelo, effort: p.esfuerzo } : null
}

/**
 * Guarda la preferencia ya validada por quien llama (modelo y esfuerzo contra el catálogo vivo del motor).
 * Actualiza la fila de «chat nuevo» del motor elegido solo si seguía la preferencia anterior: una elección
 * manual pendiente en un chat nuevo se respeta.
 */
export function guardarPreferencia(db: Database.Database, nueva: PreferenciaMotor): PreferenciaMotor {
  const limpia = normalizar(nueva)
  tabla(db)
  const anterior = leerPreferencia(db)
  db.transaction(() => {
    db.prepare('INSERT INTO preferencia_motor (clave, valor_json, updated_at) VALUES (?,?,?) ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json, updated_at=excluded.updated_at')
      .run(CLAVE, JSON.stringify(limpia), Date.now())
    const existe = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_controls_v2'").get()
    if (!existe) return
    const sincronizar = (cuenta: string, antes: PreferenciaMotor | null, despues: PreferenciaMotor | null) => {
      const aModelo = antes?.modelo ?? null, aEsfuerzo = antes?.esfuerzo ?? null
      db.prepare("UPDATE chat_controls_v2 SET model=?, effort=?, revision=revision+1, updated_at=? WHERE account=? AND conversation_id='' AND model IS ? AND effort IS ?")
        .run(despues?.modelo ?? null, despues?.esfuerzo ?? null, Date.now(), cuenta, aModelo, aEsfuerzo)
    }
    // El motor que deja de ser el elegido vuelve a lo de su cuenta; el nuevo toma la preferencia.
    if (anterior.motor && anterior.motor !== limpia.motor) sincronizar(anterior.motor, anterior, null)
    if (limpia.motor) sincronizar(limpia.motor, anterior.motor === limpia.motor ? anterior : null, limpia)
  }).immediate()
  return limpia
}
