import { create } from 'zustand'
import { ESPACIOS_NO_DEFAULT, espacioDisponible, type EspacioChat } from '@/shared/lib/espacios-chat'
import { esEdicionCliente } from '@/lib/edicion'
import { instalacion } from '@/config'

// ─── Espacios de cuenta del chat (2026-07-08) ─────────────────────────────────
//
// Selector para correr Levy bajo otra suscripción o motor. El "espacio" es la fuente de verdad compartida: filtra el
// sidebar (¿de qué cuenta son estas conversaciones?), nace las nuevas atadas a esa cuenta, y viaja en cada mensaje
// (useChat) → daemon, que elige credenciales y motor por `account`. Se persiste en localStorage para sobrevivir
// recargas; al ABRIR una conversación se re-sincroniza a la cuenta de ESA conversación (ChatPanel), así el store
// siempre == cuenta activa.
//
// PARA QUITAR esto: borrar este archivo + AccountPicker + el param `account` de useChatHistory/useChat + el wiring en
// ChatPanel/ChatSessions.
//
// 'bro' es una segunda cuenta de Claude; 'codex' y 'yt', dos cuentas de OpenAI por el Codex CLI; 'deepseek', DeepSeek
// por OpenRouter servido por el mismo motor (llave por API). Catálogo de modelos: un espacio por cada modelo por
// OpenRouter, lista única en shared/lib/espacios-chat.ts. Cómo se describe cada cuenta en el selector es dato de la
// instalación (`config › etiquetasCuentasChat`), no del código (red team 3, A-7).
export type ChatAccount = EspacioChat

/** Espacios distintos de la cuenta principal: los que viajan por-request al
 *  daemon y filtran el sidebar. Fuente única de los checks (antes eran
 *  comparaciones literales repetidas en hooks y rutas API). */
export type NonDefaultAccount = (typeof ESPACIOS_NO_DEFAULT)[number]
// Edición cliente: sin las cuentas de la instalación original (ESPACIOS_SOLO_ORIGINAL); nunca viajan ni filtran nada.
export const NON_DEFAULT_ACCOUNTS: readonly NonDefaultAccount[] = ESPACIOS_NO_DEFAULT.filter(e => espacioDisponible(e, esEdicionCliente()))

/** ¿`value` es un espacio de cuenta explícito (no la cuenta principal)? */
export function isNonDefaultAccount(value: unknown): value is NonDefaultAccount {
  return NON_DEFAULT_ACCOUNTS.includes(value as NonDefaultAccount)
}

/** Normaliza lo que venga de la BD/URL a un ChatAccount válido. */
export function toChatAccount(value: unknown): ChatAccount {
  return isNonDefaultAccount(value) ? value : 'default'
}

export interface AccountOption {
  id: ChatAccount
  label: string
  sublabel: string
}

// Edición cliente: un solo espacio, Claude con la llave del alumno (las cuentas de abajo son de la instalación del autor).
const CLIENTE = esEdicionCliente()
const SOLO_CLIENTE: AccountOption[] = [{ id: 'default', label: 'Claude', sublabel: 'Con tu llave de Anthropic o tu sesión de Claude' }]

/** Subtítulo de un espacio: el de la instalación si lo declara; si no, una descripción neutra. */
const ETIQUETAS_NEUTRAS: Record<string, string> = {
  default: 'Tu suscripción',
  bro: 'Segunda cuenta de Claude',
  codex: 'OpenAI · Codex',
  yt: 'OpenAI · segunda cuenta',
  deepseek: 'DeepSeek V4.1 Flash · OpenRouter (por API)',
  crons: 'Sesiones de cron jobs y procesos de fondo',
}
const etiqueta = (id: string) => instalacion().etiquetasCuentasChat?.[id] ?? ETIQUETAS_NEUTRAS[id] ?? ''

/** Texto del banner «Corriendo en <espacio> · …» del chat. Clave `banner:<id>` en la configuración de la instalación. */
const BANNERS_NEUTROS: Record<string, string> = { bro: 'segunda cuenta de Claude', yt: 'OpenAI con la segunda cuenta' }
export const bannerCuenta = (id: 'bro' | 'yt') => instalacion().etiquetasCuentasChat?.[`banner:${id}`] ?? BANNERS_NEUTROS[id]

export const CHAT_ACCOUNTS: AccountOption[] = CLIENTE ? SOLO_CLIENTE : [
  { id: 'default', label: 'Tú', sublabel: etiqueta('default') },
  { id: 'bro', label: 'bro-claude', sublabel: etiqueta('bro') },
  { id: 'codex', label: 'codex', sublabel: etiqueta('codex') },
  { id: 'yt', label: 'yt', sublabel: etiqueta('yt') },
  { id: 'deepseek', label: 'DeepSeek', sublabel: etiqueta('deepseek') },
]

// ─── Pestañas del sidebar (13 jul 2026) ───────────────────────────────────────
// Tercera vista "Crons": las sesiones que generan los cron jobs y procesos de
// fondo del daemon. Viven en el mismo pool de transcripts pero NO son
// conversaciones de la persona — sin esta pestaña enterraban las reales.
export type ChatTab = ChatAccount | 'crons'

export interface TabOption {
  id: ChatTab
  label: string
  sublabel: string
}

export const CHAT_TABS: TabOption[] = CLIENTE ? SOLO_CLIENTE : [
  { id: 'default', label: 'Tú', sublabel: etiqueta('default') },
  { id: 'bro', label: 'bro-claude', sublabel: etiqueta('bro') },
  { id: 'codex', label: 'codex', sublabel: etiqueta('codex') },
  { id: 'yt', label: 'yt', sublabel: etiqueta('yt') },
  { id: 'crons', label: 'Crons', sublabel: etiqueta('crons') },
]

const STORAGE_KEY = 'chat:account'

function readInitial(): ChatAccount {
  if (typeof window === 'undefined') return 'default'
  try {
    const guardada = toChatAccount(window.localStorage.getItem(STORAGE_KEY))
    return guardada
  } catch {
    return 'default'
  }
}

interface AccountState {
  /** Espacio activo. 'default' = cuenta principal, 'bro' = segunda cuenta de Claude, 'codex' = OpenAI
   *  (cuenta principal), 'yt' = OpenAI (segunda cuenta). */
  account: ChatAccount
  setAccount: (account: ChatAccount) => void
}

export const useAccountStore = create<AccountState>((set) => ({
  account: readInitial(),
  setAccount: (account) => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, account) } catch { /* ignore */ }
    }
    set({ account })
  },
}))
