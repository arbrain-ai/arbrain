import type { ChatSession } from '../hooks/useChatHistory'
import { turnosActivos, hijosVivos, hijosTerminaronEn, envioLocalEn, type TurnoActivo } from './turnos-activos'

// ─── Semáforo de conversaciones (sidebar) ────────────────────────────────────
//
// Modelo (decidido por Daniel, 1 oct 2026), un punto a la izquierda del título:
//
//   amarillo pulsa   working      Levy está escribiendo / trabajando
//   azul             needs_reply  Levy te hizo una pregunta (AskUserQuestion) y su turno espera tu
//                                 respuesta: estado `waiting` real del journal (3 oct 2026). Ya no
//                                 sale de la heurística del «?» final: eso es solo «sin ver».
//   morado           unread       terminó y todavía no la has visto
//   gris             read         ya la viste
//
// Regla (Daniel, 5 oct 2026, corrige la del 3 oct): amarillo SOLO mientras Levy mismo escribe o
// trabaja su turno. Los subagentes, comandos en segundo plano y workflows NO lo pintan amarillo:
// si Levy ya respondió y delegó, el punto es morado (sin ver) o gris, porque te toca a ti y puedes
// darle más encargos mientras ellos corren («así trabajamos más rápido, en bucle»). Lo que trabaja
// en segundo plano se ve en el Taller y en «N agentes trabajando». Cuando un hijo termina después
// de tu última visita, la conversación vuelve a «sin ver» (morado). Una pregunta pendiente
// tiene su propio estado (azul, sin pulso) y gana sobre «trabajando».
//
// Dos fuentes, cada una para lo que mide bien:
//  · «Está trabajando / espera tu respuesta» sale del JOURNAL del daemon (turnos en curso,
//    ver turnos-activos.ts). La fila del usuario en chat_sessions llega al terminar el turno, así
//    que un turno largo no se veía y al acabar saltaba directo a «sin ver».
//  · «Terminó y no la has visto» sale de 4 columnas de chat_sessions que mantiene un TRIGGER en la
//    BD (trg_chat_session_bookkeeping) sobre CADA insert de chat_messages: last_role,
//    last_message_at, ends_question y last_read_at (markRead al abrirla o tenerla a la vista).
//
// Sin datos del journal (daemon viejo, caído, poll detenido) cae a la heurística de antes:
// último mensaje = user y reciente cuenta como «trabajando».

export type SessionDotState = 'working' | 'needs_reply' | 'unread' | 'read'

// Ventana de la heurística de respaldo (sin journal) en la que last_role='user' cuenta como
// «trabajando». Un turno que nunca recibió assistant (daemon muerto) degrada a gris al expirar.
export const WORKING_WINDOW_MS = 15 * 60_000

// Con el journal a la mano, el user reciente cubre el hueco entre enviar y el siguiente poll (≤6 s):
// sin esto el punto parpadearía gris justo después de enviar.
export const GRACIA_ENVIO_MS = 20_000

/** El último mensaje es de Levy, llegó después de tu última visita y todavía no lo ves. */
export function hayNoVisto(s: ChatSession): boolean {
  if (s.isSDKOnly || s.last_role !== 'assistant') return false
  const lastMsg = s.last_message_at ? Date.parse(s.last_message_at) : 0
  const lastRead = s.last_read_at ? Date.parse(s.last_read_at) : 0
  return lastMsg > lastRead
}

export function deriveSessionState(
  s: ChatSession,
  now = Date.now(),
  // Inyectable para pruebas; por defecto, el último poll del journal (null = sin dato vigente).
  activos: ReadonlyMap<string, TurnoActivo> | null = turnosActivos(now),
  // Hijos vivos por conversación (inyectable); null = sin lectura vigente.
  hijos: ReadonlyMap<string, number> | null = hijosVivos(now),
  // Cuándo terminó su último hijo (inyectable).
  hijosTerminaronEn_: (id: string) => number = hijosTerminaronEn,
  // Cuándo envió este cliente (inyectable); 0 = sin envío local vigente.
  envioLocalEn_: (id: string) => number = (id) => envioLocalEn(id, now),
): SessionDotState {
  // Sesión de transcript ajena a Arbrain (Claude Desktop, crons): sin semáforo. Las SDK que Arbrain conduce
  // (`conTurnosArbrain`) sí siguen el journal: su conversación es `sdk:<id>` y /chat/active la reporta igual.
  if (s.isSDKOnly && !s.conTurnosArbrain) return 'read'
  const turno = activos?.get(s.id)
  if (turno === 'waiting') return 'needs_reply'
  if (turno) return 'working'
  void hijos // los hijos vivos ya no pintan amarillo (5 oct); se conserva el parámetro por compatibilidad
  const lastMsg = s.last_message_at ? Date.parse(s.last_message_at) : 0
  // Recién enviado desde aquí: amarillo en el mismo clic, salvo que la respuesta ya haya llegado.
  const envio = envioLocalEn_(s.id)
  if (envio && !(s.last_role === 'assistant' && lastMsg >= envio)) return 'working'
  if (!lastMsg) return 'read'
  if (s.last_role === 'user') {
    return now - lastMsg < (activos ? GRACIA_ENVIO_MS : WORKING_WINDOW_MS) ? 'working' : 'read'
  }
  const hijosAcabaron = Math.max(hijosTerminaronEn_(s.id), hijosTerminaronEn_(s.id.replace(/^sdk:/, '')))
  const lastRead = s.last_read_at ? Date.parse(s.last_read_at) : 0
  if (hayNoVisto(s) || hijosAcabaron > lastRead) return 'unread'
  return 'read'
}

// Espejo cliente de la heurística del trigger, para pintar el estado local al
// instante cuando el turno completa sin esperar el refetch.
export function detectEndsQuestion(content: string): boolean {
  const stripped = content
    .replace(/<!--thinking-->[\s\S]*?<!--\/thinking-->/g, '')
    .replace(/[\s*_"'`)\]]+$/, '')
  return /[?？]$/.test(stripped)
}
