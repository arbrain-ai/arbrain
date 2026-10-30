/**
 * Espacios del chat: fuente única en la web (2 oct 2026). Espejo de `cuentasChat()` del daemon
 * (arbrain/server/src/modelos/registro.ts): las suscripciones de siempre más un espacio por cada ruta por API.
 * Cada modelo por OpenRouter vive en el suyo (`~/.codex-<espacio>`): su hilo no se mezcla con otro modelo.
 * Módulo puro: lo usan las rutas del servidor (acceso, borradores sin conexión) y el store del cliente.
 */
export const ESPACIOS_API = ['deepseek', 'gpt-luna', 'gpt-astra', 'gpt-sol', 'gemini', 'muse', 'grok', 'mimo', 'glm', 'kimi'] as const
export const ESPACIOS_NO_DEFAULT = ['bro', 'codex', 'yt', ...ESPACIOS_API] as const
export const ESPACIOS_CHAT = ['default', ...ESPACIOS_NO_DEFAULT] as const

export type EspacioApi = (typeof ESPACIOS_API)[number]
export type EspacioChat = (typeof ESPACIOS_CHAT)[number]

export const esEspacioChat = (v: unknown): v is EspacioChat => ESPACIOS_CHAT.includes(v as EspacioChat)
/**
 * Espacios que solo existen en la instalación original: las suscripciones de su dueño (segunda cuenta de Claude y las
 * dos cuentas de OpenAI por el Codex CLI). En la edición cliente no existen: ni selector, ni ruta, ni carpeta.
 */
export const ESPACIOS_SOLO_ORIGINAL = ['bro', 'codex', 'yt'] as const
export const espacioDisponible = (v: unknown, cliente: boolean): boolean =>
  esEspacioChat(v) && !(cliente && (ESPACIOS_SOLO_ORIGINAL as readonly string[]).includes(v as string))
export const esEspacioApi = (v: unknown): v is EspacioApi => ESPACIOS_API.includes(v as EspacioApi)
/** Espacios que corre el Claude SDK (suscripción). */
export const esEspacioClaude = (v: unknown): boolean => v === 'default' || v === 'bro'
