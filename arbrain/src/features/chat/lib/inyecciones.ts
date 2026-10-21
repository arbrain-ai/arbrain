/**
 * Inyección a mitad de turno (7 oct 2026). Daniel le escribe a Levy mientras trabaja y el mensaje entra
 * al turno EN CURSO (como Claude Code), sin detenerlo ni esperar a que termine. Decisiones firmadas:
 *  1. Enter con Levy trabajando = inyectar. «Enviar ya» sigue siendo detener y mandar. La fila del
 *     dispositivo queda para sin red o cuando la inyección no aplica (Codex, imagen/audio, sin turno vivo).
 *  2. El mensaje se ve DENTRO de la actividad del turno, en el punto donde el motor lo tomó,
 *     con su estado «entrando… / leído».
 *  3. Stop con mensajes aún no leídos: vuelven a la fila en pausa. Nunca se descartan.
 *  4. Codex después.
 * Funciones puras: el hook y el panel las usan; las pruebas viven en tests/chat/inyecciones.test.ts.
 */
import type { ChatMessage } from '../hooks/useChat'

/** enviando = el cliente lo mandó; entrando = el host lo registró contra el turno; leido = el motor lo tomó;
 *  en_fila = el host lo dejó como turno normal (no había turno vivo que alcanzar). */
export type EstadoInyeccion = 'enviando' | 'entrando' | 'leido' | 'en_fila'
export interface NotaInyectada {
  id: string
  texto: string
  estado: EstadoInyeccion
  /** Última herramienta del turno cuando el motor lo tomó: la nota se pinta justo después de ella. */
  afterToolId?: string | null
  at: number
}

/** Lo que el host manda en `resume_meta.inyectados`, `user_injected` e `injections_settled`. */
export interface InyeccionHost { injectionId: string; message: string; status: 'pending' | 'sent' | 'requeued' | 'unread'; afterToolId: string | null; at: number }

const ORDEN: Record<EstadoInyeccion, number> = { enviando: 0, entrando: 1, en_fila: 1, leido: 2 }

/** Une notas por id sin retroceder de estado (un replay viejo no deshace «leído»). */
export function unirNotas(actuales: NotaInyectada[] | undefined, nuevas: NotaInyectada[]): NotaInyectada[] {
  const porId = new Map((actuales ?? []).map(n => [n.id, n]))
  for (const n of nuevas) {
    const previa = porId.get(n.id)
    if (!previa) { porId.set(n.id, n); continue }
    const gana = ORDEN[n.estado] >= ORDEN[previa.estado] ? n : previa
    porId.set(n.id, { ...previa, ...gana, afterToolId: gana.afterToolId ?? previa.afterToolId ?? null })
  }
  return [...porId.values()].sort((a, b) => a.at - b.at)
}

/** Del host a nota: `unread` y `requeued` no se pintan dentro del turno (van a la fila o a su propio turno). */
export function notaDelHost(i: InyeccionHost): NotaInyectada | null {
  if (i.status === 'unread' || i.status === 'requeued') return null
  return { id: i.injectionId, texto: i.message, estado: i.status === 'sent' ? 'leido' : 'entrando', afterToolId: i.afterToolId, at: i.at }
}

/** Respuesta de POST /api/chat/stream con `inyectar: true`. */
export type DesenlaceEnvio = { tipo: 'inyectado'; into: string } | { tipo: 'en_fila_servidor'; turnId: string } | { tipo: 'rechazado'; motivo: string }
export function leerDesenlace(status: number, body: unknown): DesenlaceEnvio {
  const b = (body ?? {}) as { accepted?: unknown; injected?: unknown; into?: unknown; turnId?: unknown; error?: unknown }
  if (status === 202 && b.accepted === true && b.injected === true && typeof b.into === 'string') return { tipo: 'inyectado', into: b.into }
  if (status === 202 && b.accepted === true && typeof b.turnId === 'string') return { tipo: 'en_fila_servidor', turnId: b.turnId }
  return { tipo: 'rechazado', motivo: typeof b.error === 'string' ? b.error : `HTTP ${status}` }
}

/** ¿Este envío puede intentar entrar al turno en curso? Si no, va a la fila del dispositivo como antes. */
export function puedeInyectar(e: { enLinea: boolean; motorCodex: boolean; conAdjuntos: boolean; esComando: boolean; editando: boolean; turnoVivo: boolean; conversacion: string | null | undefined }): boolean {
  return e.enLinea && !e.motorCodex && !e.conAdjuntos && !e.esComando && !e.editando && e.turnoVivo && !!e.conversacion
}

/** Al terminar el turno, lo que quedó «entrando» o «en fila» lo convirtió el host en turno normal:
 *  sale del turno terminado (lo pinta su propio turno al reengancharse). Lo leído se queda. */
export function trasTerminar(notas: NotaInyectada[] | undefined): { quedan: NotaInyectada[]; aSuTurno: NotaInyectada[] } {
  const quedan: NotaInyectada[] = [], aSuTurno: NotaInyectada[] = []
  for (const n of notas ?? []) (n.estado === 'leido' ? quedan : aSuTurno).push(n)
  return { quedan, aSuTurno }
}

/**
 * Historial recargado (Supabase): las filas de Daniel con `metadata.injectedInto` se pintan como notas
 * dentro de la respuesta de ese turno, no como burbujas sueltas. Así la vista recargada coincide con la
 * vista en vivo y no hay duplicados (la nota en memoria y la fila guardada comparten el mismo id lógico:
 * el turnId de la inyección). Sin la respuesta del turno a la vista, la fila queda como burbuja normal.
 */
export function plegarInyectadas(mensajes: ChatMessage[]): ChatMessage[] {
  const respuestas = new Map<string, number>()
  mensajes.forEach((m, i) => { if (m.role === 'assistant' && m.metadata?.turnId) respuestas.set(m.metadata.turnId, i) })
  const notas = new Map<number, NotaInyectada[]>()
  const fuera = new Set<number>()
  mensajes.forEach((m, i) => {
    const into = (m.metadata as { injectedInto?: unknown } | null | undefined)?.injectedInto
    if (m.role !== 'user' || typeof into !== 'string') return
    const destino = respuestas.get(into)
    if (destino === undefined) return
    fuera.add(i)
    const lista = notas.get(destino) ?? []
    const afterToolId = (m.metadata as { afterToolId?: unknown }).afterToolId
    lista.push({ id: m.metadata?.turnId ?? m.id, texto: m.content, estado: 'leido', afterToolId: typeof afterToolId === 'string' ? afterToolId : null, at: m.timestamp.getTime() })
    notas.set(destino, lista)
  })
  if (!fuera.size) return mensajes
  const out: ChatMessage[] = []
  mensajes.forEach((m, i) => {
    if (fuera.has(i)) return
    const extra = notas.get(i)
    out.push(extra ? { ...m, inyectados: unirNotas(m.inyectados, extra) } : m)
  })
  return out
}

/** Dónde va cada nota entre las pills: tras su herramienta si está a la vista; si no, al final de la actividad. */
export function ubicarNotas(notas: NotaInyectada[] | undefined, herramientasVisibles: string[]): { tras: Map<string, NotaInyectada[]>; alFinal: NotaInyectada[] } {
  const visibles = new Set(herramientasVisibles)
  const tras = new Map<string, NotaInyectada[]>()
  const alFinal: NotaInyectada[] = []
  for (const n of notas ?? []) {
    if (n.afterToolId && visibles.has(n.afterToolId)) tras.set(n.afterToolId, [...(tras.get(n.afterToolId) ?? []), n])
    else alFinal.push(n)
  }
  return { tras, alFinal }
}

export const ETIQUETA_ESTADO: Record<EstadoInyeccion, string> = {
  enviando: 'enviando…',
  entrando: 'entrando…',
  leido: 'leído',
  en_fila: 'en fila · sale cuando Levy termine',
}

/** Filas `user` que el webhook de completion guarda por cada inyección leída, en orden de llegada al motor.
 *  Su created_at es ese instante: quedan entre el mensaje que abrió el turno y la respuesta. */
export function filasInyectadas(lista: unknown, sessionId: string, turnId: string, ahora = Date.now()) {
  if (!Array.isArray(lista)) return []
  return (lista as Array<{ turnId?: unknown; message?: unknown; sentAt?: unknown; afterToolId?: unknown }>)
    .filter(i => i && typeof i.turnId === 'string' && i.turnId && typeof i.message === 'string' && i.message.trim())
    .map(i => {
      const sentAt = typeof i.sentAt === 'number' && Number.isFinite(i.sentAt) && i.sentAt > 1_600_000_000_000 && i.sentAt <= ahora + 60_000 ? Math.floor(i.sentAt) : null
      return {
        session_id: sessionId, role: 'user' as const, content: i.message as string, audio_url: null, image_url: null,
        metadata: { turnId: i.turnId as string, injectedInto: turnId, ...(typeof i.afterToolId === 'string' ? { afterToolId: i.afterToolId } : {}), ...(sentAt ? { startedAt: sentAt } : {}) } as Record<string, unknown>,
        ...(sentAt ? { created_at: new Date(sentAt).toISOString() } : {}),
      }
    })
}
