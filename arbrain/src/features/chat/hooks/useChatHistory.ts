'use client'
import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { cacheSnapshot, getCachedSnapshot, isOnline } from '@/lib/local-first'
import { alVolver, tocaLeerAhora } from '@/shared/lib/reposo'
import type { MessageMetadata } from './useChat'
import { toChatAccount, type ChatAccount } from '../stores/account-store'
import { useRecientesStore } from '../stores/recientes-store'
import { detectEndsQuestion } from '../lib/session-status'
import { esDeArbrain } from '../lib/recientes-lista'
import { aplicarCambioALista, EVENTO_CAMBIO_SESION, type CambioSesion } from '../lib/cambios-sesion'
import { fijarHijosVivos, fijarTurnosActivos, suscribirTurnosActivos, versionTurnosActivos, type TurnoActivoDto, type HijoDto } from '../lib/turnos-activos'
import { sonda } from '../lib/tts-probe'
import type { Terminal } from '@/features/cabina/trabajos-modelo'
import { fuenteFresca } from '@/features/cabina/datos'
import { urlPanel } from '@/features/cabina/panel/datos'

export interface ChatSession {
  id: string
  title: string
  /** FIJADA: va en la sección Fijadas (nombre histórico de la columna). */
  is_favorite: boolean
  /** FAVORITA (4 oct 2026): estrella dorada, además de fijada. Daniel marca 1 o 2. */
  is_starred?: boolean
  /** Lugar en la sección Fijadas cuando Daniel las acomodó arrastrando (4 oct 2026); null = sin acomodar. */
  pinned_position?: number | null
  profile_id: string | null
  created_at: string
  updated_at: string
  /** SDK-only sessions have their sessionId here for resume */
  sdkSessionId?: string
  /**
   * Sesión de transcript sin fila en Mission Control. Solo entra a la lista de conversaciones si
   * además tiene `conTurnosArbrain` (1 oct 2026: «Arbrain solo muestra las conversaciones de
   * Arbrain»); si no, solo existe para la pestaña Crons y para abrir por id un enlace viejo (`sdk:<id>`).
   */
  isSDKOnly?: boolean
  /**
   * Sesión solo-SDK que Arbrain SÍ conduce: el journal del daemon tiene turnos enviados desde aquí
   * (1 oct 2026). Es el criterio para listarla; las demás `sdk:` (Claude Desktop, Claude Code, crons)
   * siguen fuera. Ver lib/sesiones-sdk.ts.
   */
  conTurnosArbrain?: boolean
  pendingCreation?: boolean
  /** TEMPORAL (2026-07-08): cuenta que corre la conversación. null = cuenta principal, 'bro' = segunda cuenta. */
  account?: ChatAccount | null
  // ── Semáforo del sidebar (20 jul 2026) — mantenido por trigger en la BD ──
  /** Rol del último mensaje persistido ('user' = Levy trabajando). */
  last_role?: 'user' | 'assistant' | null
  last_message_at?: string | null
  /** Última vez que Daniel abrió la conversación (markRead). */
  last_read_at?: string | null
  /** El último assistant terminó preguntando algo (necesita respuesta). */
  ends_question?: boolean | null
  /** Archivada (1 oct 2026): sale de todas las listas y solo se ve en «Archivadas» de «Ver todas». */
  archived_at?: string | null
}

export interface PersistedMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  audio_url?: string | null
  image_url?: string | null
  metadata?: MessageMetadata | null
}

function sessionSort(a: ChatSession, b: ChatSession): number {
  const aIsAuto = a.title === 'Automatizaciones'
  const bIsAuto = b.title === 'Automatizaciones'
  if (aIsAuto !== bIsAuto) return aIsAuto ? -1 : 1
  if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
  return b.updated_at.localeCompare(a.updated_at)
}

// Cadencia del poll de turnos en curso (solo con la pestaña visible). Un request barato a la vez.
const TURNOS_POLL_MS = 6_000

/** Causa legible de una respuesta fallida: el `error` del servidor (ya en español) o el código. */
export async function motivoDeFalla(res: Response): Promise<string> {
  const json = await res.json().catch(() => null) as { error?: unknown } | null
  return typeof json?.error === 'string' && json.error.trim() ? json.error : `el servidor respondió ${res.status}`
}

/** Vista del sidebar: conversaciones reales o sesiones de crons/fondo. */
export type ChatHistoryView = 'chats' | 'crons'

export function useChatHistory(account: ChatAccount = 'default', view: ChatHistoryView = 'chats') {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  /** La última carga de la lista falló: se conserva lo pintado y se muestra esto (null = al día). */
  const [loadError, setLoadError] = useState<string | null>(null)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // TEMPORAL: cache namespaced por espacio de cuenta para que al cambiar de
  // "Tú" ↔ "bro-claude" ↔ "Crons" no parpadee la lista de la otra vista.
  const cacheKey = view === 'crons' ? 'chat:sessions:crons' : account === 'default' ? 'chat:sessions' : `chat:sessions:${account}`

  // Load session list on mount + al cambiar de espacio — stale-while-revalidate:
  // pinta el cache al instante, refresca en background.
  useEffect(() => {
    let active = true
    setSessions([])
    setLoading(true)
    getCachedSnapshot<ChatSession[]>(cacheKey)
      .then((cached) => {
        // Snapshots anteriores al 1 oct 2026 guardaron aquí filas SDK (de Claude Desktop/Code): fuera,
        // salvo las que el journal marca como conversaciones de Arbrain.
        const filas = view === 'chats' ? cached?.filter(esDeArbrain) : cached
        if (active && filas?.length) { setSessions(filas); setLoading(false) }
      })
      .catch(() => {})
      .finally(() => { if (active) loadSessions() })
    // Poll ligero para el semáforo del sidebar: los estados working/unread los
    // producen OTROS dispositivos y el daemon — sin refetch periódico este
    // navegador nunca se entera. silent = sin flash de skeleton.
    let leidoEn = Date.now()
    const iv = setInterval(() => {
      if (!tocaLeerAhora(30_000, leidoEn)) return
      leidoEn = Date.now()
      loadSessions({ silent: true })
    }, 30_000)
    return () => { active = false; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, view])

  // Mapea una sesión SDK del daemon a la forma del sidebar (solo la pestaña Crons).
  // La fecha viene de lastMessageAt (último turno REAL del transcript) — el mtime
  // del archivo miente: Claude Code CLI reescribe bookkeeping en transcripts
  // viejos y los hacía aparecer como "hace 17 minutos" siendo de ayer.
  type SdkSessionDto = {
    sessionId: string
    summary: string
    lastModified: number
    fileSize: number
    customTitle?: string
    firstPrompt?: string
    linkedChatSessionId: string | null
    kind?: 'cron' | 'background' | 'chat'
    lastMessageAt?: string | null
  }
  const mapSdkSession = (s: SdkSessionDto): ChatSession => {
    const updatedAt = s.lastMessageAt ?? new Date(s.lastModified).toISOString()
    return {
      id: `sdk:${s.sessionId}`,
      title: s.customTitle || s.summary || s.firstPrompt?.slice(0, 60) || 'Claude Code session',
      is_favorite: false,
      profile_id: null,
      created_at: updatedAt,
      updated_at: updatedAt,
      sdkSessionId: s.sessionId,
      isSDKOnly: true,
    }
  }

  const loadSessions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isOnline()) { setLoading(false); return }
    // Sospechoso: corre en poll cada 30s y termina en setSessions() -> re-render del
    // shell. Si el hilo se traba en cadencia fija, este es el primero a mirar.
    sonda.mark(opts?.silent ? 'poll-sesiones(30s)' : 'load-sesiones')
    if (!opts?.silent) setLoading(true)

    // Vista Crons: solo las sesiones de cron jobs / procesos de fondo del
    // daemon (kind=cron). Sin merge con MC — son transcripts, no chats.
    if (view === 'crons') {
      try {
        const res = await fetch('/api/chat/sessions?limit=40&kind=cron', { cache: 'no-store' })
        if (!res.ok) throw new Error(`sessions ${res.status}`)
        const { sessions: sdkSessions } = await res.json() as { sessions?: SdkSessionDto[] }
        const mapped = (sdkSessions ?? []).map(mapSdkSession)
        setSessions(mapped)
        cacheSnapshot('chat', cacheKey, mapped).catch(() => {})
      } catch (e) {
        // Un hipo del daemon NO debe borrar la lista pintada: se conserva y se dice.
        if (!opts?.silent) setLoadError(e instanceof Error ? e.message : 'no se pudo leer')
      } finally {
        setLoading(false)
      }
      return
    }

    // 1. Load MC sessions through the local/server auth layer — filtradas por espacio.
    const mcRes = await fetch(`/api/chat/sessions?source=mc&limit=30&account=${account}`, { cache: 'no-store' }).catch(() => null)
    if (!mcRes) { setLoading(false); setLoadError('sin conexión con el servidor'); return }
    const mcJson = await mcRes.json().catch(() => ({})) as { sessions?: ChatSession[]; error?: string }
    // Falla = conservar lo pintado y decirlo; nunca una lista vacía (12 oct 2026).
    if (!mcRes.ok) { setLoading(false); if (!opts?.silent) setLoadError(mcJson.error ?? `el servidor respondió ${mcRes.status}`); return }
    setLoadError(null)
    const mcSessions = (mcJson.sessions as ChatSession[]) ?? []

    // Solo conversaciones de Arbrain. 1 oct 2026: antes un 2º fetch mezclaba aquí los transcripts SDK
    // del daemon (`listSessions` sobre ~/.claude, el MISMO pool que usan Claude Desktop y Claude Code), y
    // la lista se llenaba de sesiones que Arbrain no creó. Además esa mezcla duplicaba las propias: el
    // daemon devuelve `linkedChatSessionId` como la llave compuesta de su SQLite
    // (`<dueño>:<conversación>::<cuenta>`), nunca igual al UUID de la fila MC, así que el filtro
    // `mcIds.has(...)` jamás descartaba nada. Ahora las sesiones solo-SDK entran por el criterio
    // del journal: el proxy `source=mc` agrega las que tienen turnos de Arbrain (`conTurnosArbrain`).
    const sortedMc = mcSessions.sort(sessionSort)
    setSessions((prev) => {
      const cloudIds = new Set(sortedMc.map(session => session.id))
      const pending = prev.filter(session => session.pendingCreation && !cloudIds.has(session.id))
      const next = [...sortedMc, ...pending].sort(sessionSort)
      cacheSnapshot('chat', cacheKey, next).catch(() => {})
      return next
    })
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, view, cacheKey])

  // ── Turnos en curso (journal del daemon) → semáforo (1 oct 2026) ──
  // Un solo request por poll para TODA la lista (no uno por conversación). El resultado vive en
  // turnos-activos.ts, que lee deriveSessionState; aquí solo se mantiene fresco y, cuando cambia
  // quién trabaja, se pide la lista de nuevo: al terminar un turno la fila (last_role/last_message_at)
  // acaba de cambiar en la BD y sin esto el punto esperaría al poll de 30 s para pasar a «sin ver».
  const loadSessionsRef = useRef(loadSessions)
  loadSessionsRef.current = loadSessions
  const turnosVersion = useSyncExternalStore(suscribirTurnosActivos, versionTurnosActivos, versionTurnosActivos)
  useEffect(() => {
    if (view !== 'chats') return
    let vivo = true
    let refrescar: ReturnType<typeof setTimeout> | undefined
    let traidoEn = 0
    const traer = async () => {
      // Oculta no consulta y sin foco va más lento (shared/lib/reposo); al volver, consulta enseguida.
      if (!tocaLeerAhora(TURNOS_POLL_MS, traidoEn) || !isOnline()) return
      traidoEn = Date.now()
      try {
        const res = await fetch('/api/chat/active', { cache: 'no-store' })
        if (!vivo) return
        const json = res.ok ? await res.json() as { available?: boolean; turns?: TurnoActivoDto[] } : null
        // available:false (daemon viejo o caído) = sin dato: lo anterior envejece y manda la heurística de la fila.
        let cambio = fijarTurnosActivos(json?.available ? (json.turns ?? []) : null)
        // Hijos del turno (subagentes y comandos en segundo plano): misma lectura que el Taller.
        try {
          // La misma lectura que el panel y el botón (datos.ts): si tiene menos de un pulso, no se pide otra.
          const jt = await fuenteFresca<{ internas?: HijoDto[]; terminales?: Terminal[]; error?: string }>(urlPanel(false), TURNOS_POLL_MS)
          if (!vivo) return
          if (jt && !jt.error && Array.isArray(jt.internas ?? [])) cambio = fijarHijosVivos(jt.internas ?? [], Date.now(), Array.isArray(jt.terminales) ? jt.terminales : []) || cambio
        } catch { /* sin lectura: caduca sola */ }
        if (cambio) {
          clearTimeout(refrescar)
          refrescar = setTimeout(() => { if (vivo) void loadSessionsRef.current({ silent: true }) }, 1_200)
        }
      } catch { /* sin red: el dato envejece solo */ }
    }
    void traer()
    const iv = setInterval(() => { void traer() }, TURNOS_POLL_MS)
    const baja = alVolver(() => void traer())
    return () => { vivo = false; clearInterval(iv); clearTimeout(refrescar); baja() }
  }, [view])
  // Nueva identidad de la lista cuando cambia quién trabaja: ChatPanel publica `sessions` a «Recientes»
  // y a la lista lateral, y ninguna de las dos se enteraría de que el punto debe cambiar si las filas
  // (que no cambian: el estado vive fuera de ellas) conservaran su referencia.
  const sessionsVista = useMemo(() => [...sessions], [sessions, turnosVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const createSession = useCallback(async (firstMessage: string): Promise<ChatSession> => {
    // Existing command controls still use their dedicated synchronous path
    // until they move to the durable control protocol.
    if (firstMessage.trimStart().startsWith('/') && isOnline()) {
      const response = await fetch('/api/chat/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: firstMessage.slice(0, 55), account }) })
      const body = await response.json()
      if (!response.ok || !body.session) throw new Error(body.error ?? 'No se pudo crear la conversación del comando.')
      setSessions(previous => [body.session, ...previous])
      return body.session
    }
    // Allocate locally on every path. The persisted turn envelope owns cloud
    // creation, including retries after a lost response. No network precedes it.
    const timestamp = new Date().toISOString()
    const title = firstMessage.slice(0, 55) + (firstMessage.length > 55 ? '…' : '')
    const session: ChatSession = { id: crypto.randomUUID(), title, account, profile_id: null, is_favorite: false, created_at: timestamp, updated_at: timestamp, pendingCreation: true }
    setSessions(previous => {
      const next = [session, ...previous]
      void cacheSnapshot('chat', cacheKey, next).catch(() => {})
      return next
    })
    return session
  }, [account, cacheKey])

  // Solo estado local: el POST de mensajes YA toca updated_at server-side.
  // El PATCH extra era un round-trip redundante en el critical path del envío.
  // Con `lastMessage` actualiza también el semáforo local (last_role/
  // ends_question) al instante — el trigger de la BD mantiene la verdad durable.
  const updateSessionTimestamp = useCallback(async (
    sessionId: string,
    lastMessage?: { role: 'user' | 'assistant'; content: string },
  ) => {
    const now = new Date().toISOString()
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? {
          ...s,
          updated_at: now,
          ...(lastMessage ? {
            last_role: lastMessage.role,
            last_message_at: now,
            ends_question: lastMessage.role === 'assistant'
              ? detectEndsQuestion(lastMessage.content)
              : false,
          } : {}),
        } : s))
        .sort(sessionSort),
    )
  }, [])

  // Marca la conversación como VISTA (semáforo → gris). Local optimista +
  // persistencia server-side para que el estado viaje entre dispositivos.
  const markRead = useCallback(async (sessionId: string) => {
    if (sessionId.startsWith('sdk:')) return // sin fila MC — no hay semáforo
    const now = new Date().toISOString()
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, last_read_at: now } : s)))
    fetch('/api/chat/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, markRead: true }),
    }).catch(() => { /* el siguiente open lo re-marca */ })
  }, [])

  const saveMessages = useCallback(
    async (
      sessionId: string,
      messages: Array<{ role: 'user' | 'assistant'; content: string; audioUrl?: string; imageUrl?: string; metadata?: Record<string, unknown> }>,
    ) => {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        console.error('[saveMessages] Insert error:', json.error)
        throw new Error(json.error ?? 'Failed to save messages')
      }
      await updateSessionTimestamp(sessionId, messages[messages.length - 1])
      // Este guardado rico solo corre con la sesión A LA VISTA (detached no
      // llega aquí): el turno recién completado ya fue visto → gris.
      void markRead(sessionId)
    },
    [updateSessionTimestamp, markRead],
  )

  // UN round-trip: sesion + ultima pagina de mensajes juntas. Para el cold open
  // por deep-link (?session= de un push), donde el UUID ya viene en la URL y
  // esperar la lista de sesiones solo para resolverlo era la cadena serial que
  // hacia lento abrir la notificacion. El SW ademas prefetchea esta MISMA URL
  // al recibir el push, asi que este fetch puede resolverse desde el device.
  const fetchSessionWithMessages = useCallback(async (
    sessionId: string,
    opts?: { limit?: number },
  ): Promise<{ session: ChatSession; messages: PersistedMessage[]; hasMore: boolean } | null> => {
    try {
      const limit = opts?.limit ?? 30
      const res = await fetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}?with=messages&limit=${limit}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return null
      const json = await res.json().catch(() => null) as
        | { session?: ChatSession; messages?: PersistedMessage[]; hasMore?: boolean }
        | null
      if (!json?.session) return null
      return { session: json.session, messages: json.messages ?? [], hasMore: json.hasMore ?? false }
    } catch {
      return null
    }
  }, [])

  const loadMessages = useCallback(async (
    sessionId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<{ messages: PersistedMessage[]; hasMore: boolean; error?: string }> => {
    // `error` = no se pudo leer (base, daemon o red caídos). Nunca es «conversación vacía» (12 oct 2026: con PostgREST
    // muerto, las conversaciones se pintaban vacías y se invitaba a borrarlas).
    // SDK-only sessions: load from ClaudeClaw endpoint
    if (sessionId.startsWith('sdk:')) {
      const sdkId = sessionId.slice(4)
      try {
        // TEMPORAL: leer el transcript del pool de su cuenta (bro → su carpeta de configuración). 1 oct 2026: una sesión
        // que Arbrain conduce en OTRA cuenta (la traen «Recientes» o «Ver todas») vive en SU pool, no en el
        // de la cuenta activa; si no se conoce, la activa como siempre.
        const conocida = sessionsRef.current.find((s) => s.id === sessionId)
          ?? useRecientesStore.getState().traidas.find((s) => s.id === sessionId)
        const cuenta = conocida?.conTurnosArbrain ? toChatAccount(conocida.account) : account
        const res = await fetch(`/api/chat/sessions/${sdkId}/messages${cuenta !== 'default' ? `?account=${cuenta}` : ''}`)
        if (!res.ok) return { messages: [], hasMore: false, error: await motivoDeFalla(res) }
        const { messages: rawMsgs } = await res.json() as {
          messages: Array<{
            type: string
            uuid?: string
            timestamp?: string
            message?: {
              role?: string
              // content llega como STRING (prompts del user, algunos assistant)
              // o como ARRAY de bloques (text/thinking/tool_use/tool_result).
              content?: string | Array<{ type: string; text?: string; thinking?: string }>
            }
          }>
        }

        // Limpieza de mensajes de USER: quita ruido inyectado que NO es
        // conversación real. Devuelve null si el mensaje era 100% ruido.
        //  · invocaciones de slash-command (/model, /effort) y sus outputs
        //  · bloques <system-reminder> que el harness anexa al prompt
        //  · el prefijo "[Context: ...]" que antepone el daemon
        const cleanUserText = (raw: string): string | null => {
          // Invocaciones de slash-command (/model, /effort) y sus outputs
          // locales: acciones de UI del CLI, no turnos de conversación.
          if (/^\s*<(command-name|command-message|local-command-stdout|local-command-stderr|local-command-caveat)>/.test(raw)) {
            return null
          }
          // Quita bloques que el harness INYECTA en el mensaje de user (no son
          // texto que Daniel escribió) + el prefijo de contexto del daemon.
          const cleaned = raw
            .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
            .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
            .replace(/^\[Context:[\s\S]*?\]\n\n/, '')
            // Notas que el CLI anexa al leer una imagen («[Image: original 2756x1200,
            // displayed at…]», «[Image #2]»): son del harness, no de Daniel.
            .replace(/^\s*\[Image(?::| #)[^\]\n]*\]\s*$/gm, '')
            .trim()
          return cleaned || null
        }

        // Reconstruye la conversación completa. thinking se antepone al SIGUIENTE
        // texto (no es burbuja aparte); tool_use/tool_result no aportan texto → se
        // omiten. BUG previo (7 jul): `if (!Array.isArray(content)) continue`
        // TIRABA todos los prompts del user (vienen como STRING) y colapsaba la
        // conversación a solo las respuestas con texto — se perdía casi todo el
        // contexto al abrir una conversación CLI desde la UI.
        const result: PersistedMessage[] = []
        let pendingThinking: string[] = []

        for (const m of rawMsgs) {
          const role = m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : null
          if (!role) continue

          const content = m.message?.content

          if (Array.isArray(content)) {
            for (const b of content) {
              if (b.type === 'thinking' && b.thinking) {
                pendingThinking.push(`<!--thinking-->${b.thinking}<!--/thinking-->`)
              }
            }
          }

          // Texto visible: string plano o los bloques `text` de un array.
          let text = ''
          if (typeof content === 'string') {
            text = content
          } else if (Array.isArray(content)) {
            text = content.filter((b) => b.type === 'text' && b.text).map((b) => b.text!).join('\n\n')
          }

          if (role === 'user') {
            const cleaned = cleanUserText(text)
            if (cleaned === null) continue // ruido de CLI / reminder puro
            text = cleaned
          }
          if (!text.trim()) continue // tool_result puro, thinking puro, etc.

          // El razonamiento es del ASISTENTE: solo se antepone a su siguiente texto.
          // Antes se pegaba a lo que viniera, y el thinking terminaba DENTRO de una
          // burbuja de Daniel (visto el 30 sep en la conversación del rediseño).
          const conThinking = role === 'assistant' && pendingThinking.length > 0
          const allParts = conThinking ? [...pendingThinking, text] : [text]
          if (conThinking) pendingThinking = []

          result.push({
            id: m.uuid ?? `sdk-${result.length}`,
            session_id: sessionId,
            role,
            content: allParts.join('\n\n'),
            created_at: m.timestamp ?? new Date().toISOString(),
            // El uuid del mensaje del user EN el transcript es el turnId del turno (verificado 1 oct 2026 en los
            // 8 turnos de sdk:18585294). Sin esta identidad, al reenganchar un turno vivo el par se insertaba
            // OTRA VEZ y el mensaje salía duplicado con «Razonando» en medio.
            ...(role === 'user' && m.uuid ? { metadata: { turnId: m.uuid } } : {}),
          })
        }

        // El endpoint entrega el transcript COMPLETO (sin cursor de paginación).
        // Recortamos a los últimos N para acotar el render inicial de una sesión
        // muy larga, pero N es GENEROSO (no el page-size chico de MC) para no
        // perder contexto: casi toda conversación CLI cabe entera. `before`/`limit`
        // no aplican aquí (no hay paginación por cursor en sesiones SDK).
        const SDK_RENDER_CAP = 200
        const sliced = result.length > SDK_RENDER_CAP ? result.slice(-SDK_RENDER_CAP) : result
        return { messages: sliced, hasMore: false }
      } catch { return { messages: [], hasMore: false, error: 'sin conexión con el servidor' } }
    }

    // MC sessions: load through the local/server auth layer (paginado por cursor).
    const params = new URLSearchParams({ source: 'mc' })
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.before) params.set('before', opts.before)
    // Sin red (teléfono en túnel, avión) el fetch rechaza: la vista actual se
    // conserva y no se propaga un rechazo sin manejar; el reconcile vuelve a
    // intentarlo al recuperar conexión.
    let res: Response
    try { res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?${params}`, { cache: 'no-store' }) } catch { return { messages: [], hasMore: false, error: 'sin conexión con el servidor' } }
    if (!res.ok) return { messages: [], hasMore: false, error: await motivoDeFalla(res) }
    const json = await res.json().catch(() => ({})) as { messages?: PersistedMessage[]; hasMore?: boolean }
    return { messages: (json.messages as PersistedMessage[]) ?? [], hasMore: json.hasMore ?? false }
  }, [account])

  // Fijar, renombrar, archivar, eliminar y bifurcar viven en el menú «⋯» (acciones-conversacion.ts): hacen su
  // PATCH/DELETE/POST y difunden el cambio; aquí solo se aplica a la lista de «Ver todas» (1 oct 2026).
  // Las sesiones `sdk:` no tienen fila en la base y el menú no se ofrece en ellas.
  useEffect(() => {
    if (view !== 'chats') return
    const alCambiar = (e: Event) => {
      const c = (e as CustomEvent<CambioSesion>).detail
      if (!c) return
      // Una conversación nueva (bifurcada, desarchivada) solo entra si es del espacio de cuenta que se está viendo.
      if (c.tipo === 'agregada' && toChatAccount(c.sesion.account) !== account) return
      setSessions((prev) => {
        const next = aplicarCambioALista(prev, c)
        return next === prev ? prev : [...next].sort(sessionSort)
      })
    }
    window.addEventListener(EVENTO_CAMBIO_SESION, alCambiar)
    return () => window.removeEventListener(EVENTO_CAMBIO_SESION, alCambiar)
  }, [view, account])

  return {
    sessions: sessionsVista,
    loading,
    loadError,
    loadSessions,
    createSession,
    saveMessages,
    loadMessages,
    fetchSessionWithMessages,
    markRead,
  }
}
