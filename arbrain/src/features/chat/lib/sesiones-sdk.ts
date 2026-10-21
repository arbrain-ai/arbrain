import type { ChatSession } from '../hooks/useChatHistory'
import { filtroCuentas } from './recientes-cuentas'

/**
 * Conversaciones solo-SDK que Arbrain SÍ conduce (1 oct 2026).
 *
 * El commit 98d1a061 sacó de las listas toda sesión `sdk:<uuid>` (sin fila en Mission Control)
 * para que dejaran de colarse las de Claude Desktop, Claude Code y los crons, que viven en el mismo
 * pool de transcripts. Pero Daniel también conversa en Arbrain sobre sesiones así, y esas
 * desaparecieron. El criterio que las distingue es el journal del daemon (`chat_runtime_turns`): si
 * tiene turnos enviados desde Arbrain, es una conversación de Arbrain. El daemon las expone en
 * `POST /chat/sdk-sessions`; aquí se mezclan con las filas de la base.
 */
export interface SdkConversacionDto {
  account: string
  conversationId: string
  firstPrompt: string | null
  turns: number
  firstTurnAt: number
  lastActivityAt: number
}

const TITULO_MAX = 55

/** Fila con la forma de `chat_sessions` para que el resto del cliente no distinga de dónde viene. */
export function sesionDeSdk(c: SdkConversacionDto): ChatSession {
  const texto = (c.firstPrompt ?? '').replace(/\s+/g, ' ').trim()
  const iso = (ms: number) => new Date(ms).toISOString()
  return {
    id: c.conversationId,
    title: texto ? texto.slice(0, TITULO_MAX) + (texto.length > TITULO_MAX ? '…' : '') : 'Conversación',
    is_favorite: false,
    profile_id: null,
    created_at: iso(c.firstTurnAt),
    updated_at: iso(c.lastActivityAt),
    last_message_at: iso(c.lastActivityAt),
    account: c.account === 'default' ? null : (c.account as ChatSession['account']),
    last_role: null,
    last_read_at: null,
    ends_question: null,
    sdkSessionId: c.conversationId.slice(4),
    isSDKOnly: true,
    conTurnosArbrain: true,
  }
}

/** ¿La cuenta cae en el parámetro `account` de la lista (una o varias separadas por coma)? Sin filtro válido, sí. */
export function aceptaCuenta(raw: string | null, cuenta: string): boolean {
  if (!filtroCuentas(raw)) return true
  return (raw ?? '').split(',').map((s) => s.trim()).includes(cuenta)
}

/**
 * Mezcla las filas de la base con las sesiones SDK del journal, de la más reciente a la más vieja, y
 * recorta a `limite`. Sin sesiones SDK devuelve las filas tal cual (mismo orden que dio la base).
 */
export function mezclarSesionesSdk<T extends Pick<ChatSession, 'updated_at' | 'last_message_at'>>(
  filas: T[],
  sdk: SdkConversacionDto[],
  { cuentas, porUltimoMensaje, limite }: { cuentas: string | null; porUltimoMensaje: boolean; limite: number },
): Array<T | ChatSession> {
  const momento = (s: Pick<ChatSession, 'updated_at' | 'last_message_at'>) =>
    Date.parse((porUltimoMensaje ? s.last_message_at : null) ?? s.updated_at) || 0
  // El journal agrupa por (cuenta, conversación): el mismo `sdk:<uuid>` puede aparecer en dos cuentas (medido
  // 1 oct 2026 con sdk:a1e09105). La lista necesita un id por fila: gana el de la actividad más reciente.
  const porId = new Map<string, ChatSession>()
  for (const c of sdk) {
    if (!c.conversationId.startsWith('sdk:') || !aceptaCuenta(cuentas, c.account)) continue
    const s = sesionDeSdk(c)
    const previa = porId.get(s.id)
    if (!previa || momento(s) > momento(previa)) porId.set(s.id, s)
  }
  const propias = [...porId.values()]
  if (propias.length === 0) return filas
  return [...filas, ...propias].sort((a, b) => momento(b) - momento(a)).slice(0, limite)
}
