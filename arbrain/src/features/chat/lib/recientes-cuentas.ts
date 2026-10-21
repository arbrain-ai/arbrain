import { NON_DEFAULT_ACCOUNTS, toChatAccount, type ChatAccount, type NonDefaultAccount } from '../stores/account-store'
import type { ChatSession } from '../hooks/useChatHistory'

/**
 * Cuentas de las conversaciones en «Recientes» de la barra lateral (1 oct 2026). Se ven todas
 * juntas, sin filtro (Daniel: «por ahora no ocupamos un filtro»); las que no son de su Claude
 * llevan un rótulo corto. Abrir una ajena resincroniza la cuenta activa del chat (ChatPanel,
 * `openSessionById`). Colores de ChatAccountTabs: bro = brand, codex = emerald, yt = cyan.
 */
export interface CuentaReciente {
  id: ChatAccount
  etiqueta: string
  /** Rótulo corto en la fila cuando hay varias cuentas marcadas. La de Daniel no lleva: es la
   *  normal, y un segundo puntito junto al semáforo se confundía con él (1 oct, revisión visual). */
  corta: string
  texto: string
}

export const CUENTAS_RECIENTES: readonly CuentaReciente[] = [
  { id: 'default', etiqueta: 'Claude g00', corta: '', texto: '' },
  { id: 'bro', etiqueta: 'Claude bro', corta: 'bro', texto: 'text-brand-ink' },
  { id: 'codex', etiqueta: 'ChatGPT g00', corta: 'GPT', texto: 'text-emerald-300' },
  { id: 'yt', etiqueta: 'ChatGPT yt', corta: 'GPT yt', texto: 'text-cyan-300' },
  { id: 'deepseek', etiqueta: 'DeepSeek', corta: 'DeepSeek', texto: 'text-sky-300' },
  // Catálogo de modelos (2 oct 2026): un espacio por modelo de OpenRouter.
  { id: 'gpt-luna', etiqueta: 'GPT-6 Luna', corta: 'Luna', texto: 'text-emerald-300' },
  { id: 'gpt-astra', etiqueta: 'GPT-6 Astra', corta: 'Astra', texto: 'text-emerald-300' },
  { id: 'gpt-sol', etiqueta: 'GPT-6.1 Sol', corta: 'Sol', texto: 'text-emerald-300' },
  { id: 'gemini', etiqueta: 'Gemini 4 Argon', corta: 'Gemini', texto: 'text-sky-300' },
  { id: 'muse', etiqueta: 'Muse Spark 1.3', corta: 'Muse', texto: 'text-sky-300' },
  { id: 'grok', etiqueta: 'Grok 4.7', corta: 'Grok', texto: 'text-sky-300' },
  { id: 'mimo', etiqueta: 'MiMo-V2.6-Pro', corta: 'MiMo', texto: 'text-sky-300' },
  { id: 'glm', etiqueta: 'GLM-5.3', corta: 'GLM', texto: 'text-sky-300' },
]

/** Cuenta de una conversación: NULL/ausente = Claude g00. */
export function cuentaDe(s: Pick<ChatSession, 'account'>): ChatAccount {
  return toChatAccount(s.account)
}

export function cuentaReciente(id: ChatAccount): CuentaReciente {
  return CUENTAS_RECIENTES.find((c) => c.id === id) ?? CUENTAS_RECIENTES[0]
}

export interface FiltroCuentas {
  /** Una sola cuenta distinta de la de Daniel: `account = valor` (como antes). */
  eq?: NonDefaultAccount
  /** Solo la de Daniel: `account IS NULL` (como antes). */
  isNull?: boolean
  /** Varias: valor para `.or()` de PostgREST. */
  or?: string
}

/**
 * Parámetro `account` de GET /api/chat/sessions?source=mc → filtro. Acepta una cuenta o varias
 * separadas por coma («default,bro,codex»); lo inválido se ignora. Sin nada válido devuelve null
 * (sin filtro), igual que la llamada sin `account`. 1 oct 2026.
 */
export function filtroCuentas(raw: string | null): FiltroCuentas | null {
  const ids = (raw ?? '').split(',').map((s) => s.trim())
  const incluyeDefault = ids.includes('default')
  const otras = NON_DEFAULT_ACCOUNTS.filter((id) => ids.includes(id))
  if (otras.length === 0) return incluyeDefault ? { isNull: true } : null
  if (!incluyeDefault && otras.length === 1) return { eq: otras[0] }
  const partes = [...(incluyeDefault ? ['account.is.null'] : []), `account.in.(${otras.join(',')})`]
  return { or: partes.join(',') }
}
