import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { readEnvFile } from './env.js'
import { esEdicionCliente } from './edicion.js'
import { dirClaudeAlterna } from './cuentas-alternas.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// SDK cwd points to business-os/ root so sessions are shared with Claude Code CLI.
// Same cwd = same session pool = cross-platform resume.
// Edición cliente (empaquetado, 11 oct 2026): la raíz es el workspace del alumno que pasa la app (ARBRAIN_HOME); el
// daemon viaja dentro del paquete y no hay repo alrededor. Daniel: la del repo, como siempre.
export const PROJECT_ROOT = esEdicionCliente() && process.env.ARBRAIN_HOME ? process.env.ARBRAIN_HOME : join(__dirname, '..', '..', '..')

// Storage stays in arbrain/server/ (SQLite DB, uploads) — not the repo root.
const CLAUDECLAW_DIR = join(__dirname, '..')
// CLAUDECLAW_STORE_DIR: solo para un servidor de PRUEBA con su propia copia de la base (chat vivo, 3 oct 2026).
export const STORE_DIR = process.env.CLAUDECLAW_STORE_DIR || join(CLAUDECLAW_DIR, 'store')
// Edición cliente: adjuntos en la carpeta de datos de la app (el paquete puede ser de solo lectura).
export const UPLOADS_DIR = (esEdicionCliente() && process.env.ARBRAIN_UPLOADS_DIR) || join(CLAUDECLAW_DIR, 'workspace', 'uploads')

const env = readEnvFile()

// === ROL DE LA MÁQUINA (22 sep 2026) ===
// 'full' (default, el servidor): chat + scheduler.
// 'chat' (respaldo): solo el servidor HTTP del chat. Los crons viven en UN solo host;
// dos schedulers duplicarían cada cron.
export const CLAUDECLAW_ROLE: 'full' | 'chat' = env['CLAUDECLAW_ROLE'] === 'chat' ? 'chat' : 'full'

// Cuenta Claude del espacio 'default'. En el Mini default y bro ya son la misma
// cuenta (decisión 16 sep). En la MacBook el ~/.claude del CLI no tiene sesión:
// CLAUDECLAW_DEFAULT_ACCOUNT=bro hace que 'default' use la carpeta de la cuenta alterna.
// Edición cliente: el CLI del alumno usa su carpeta aislada (ARBRAIN_DATA_DIR/claude, la fija cliente/arranque.ts).
export const DEFAULT_ACCOUNT_CONFIG_DIR: string | undefined =
  esEdicionCliente() ? (process.env.CLAUDE_CONFIG_DIR || undefined)
    : env['CLAUDECLAW_DEFAULT_ACCOUNT'] === 'bro' ? (dirClaudeAlterna() ?? undefined) : undefined

// === DUEÑO ===
// Identificador del dueño en scheduled_tasks.chat_id (clave interna de las rutinas).
export const ALLOWED_CHAT_ID = env['ALLOWED_CHAT_ID'] ?? ''

// === VOICE ===
export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? ''
export const LEMONFOX_API_KEY = env['LEMONFOX_API_KEY'] ?? ''
// TTS local con Kokoro (open source) — reemplaza a LemonFox. Server en el Mac.
export const KOKORO_TTS_URL = env['KOKORO_TTS_URL'] ?? 'http://127.0.0.1:8880'

// === SAAS FACTORY ANALYTICS ===
export const SF_SUPABASE_URL = env['SF_SUPABASE_URL'] ?? ''
export const SF_SUPABASE_KEY = env['SF_SUPABASE_KEY'] ?? ''

// === MISC ===
export const AGENT_TIMEOUT_MS = 1_800_000  // 30 minutos máximo por query de CRON (runAgent)
// Chat: el corte lo decide el vigilante de server.ts: 30 min SIN eventos = colgado. Sin techo de tiempo total
// (11 oct 2026, Daniel: «no debió haber tenido un límite de dos horas… ni siquiera límites si Anthropic no lo tiene»):
// un turno que sigue emitiendo eventos vive lo que necesite. 0 = sin techo; ARBRAIN_TECHO_TURNO_MS lo reactiva.
// El turno vivo de deep work NO tiene tope de 30 min: el 30 sep un rediseño de 163
// herramientas murió a los 30:00 exactos por usar AGENT_TIMEOUT_MS aquí.
export const CHAT_IDLE_LIMIT_MS = 1_800_000
export const CHAT_ABSOLUTE_LIMIT_MS = Math.max(0, Number(process.env.ARBRAIN_TECHO_TURNO_MS ?? 0) || 0)
// Red de agent.ts: solo por si el vigilante no corriera (otro llamador); va DESPUÉS de él.
export const CHAT_STREAM_HARD_CAP_MS = CHAT_ABSOLUTE_LIMIT_MS > 0 ? CHAT_ABSOLUTE_LIMIT_MS + 300_000 : 0
