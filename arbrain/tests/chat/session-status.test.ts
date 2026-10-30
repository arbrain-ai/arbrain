import { test, beforeEach } from 'node:test'
import { strict as assert } from 'node:assert'
import { deriveSessionState, hayNoVisto, GRACIA_ENVIO_MS, WORKING_WINDOW_MS } from '../../src/features/chat/lib/session-status'
import type { Terminal } from '../../src/features/cabina/trabajos-modelo'
import { fijarHijosVivos, hijosVivos, hijosTerminaronEn, fijarTurnosActivos, reiniciarTurnosActivos, turnosActivos, versionTurnosActivos, TURNOS_CADUCAN_MS } from '../../src/features/chat/lib/turnos-activos'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const AHORA = Date.parse('2026-10-01T18:00:00.000Z')
const hace = (ms: number) => new Date(AHORA - ms).toISOString()
const MIN = 60_000

function ses(extra: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'c1', title: 'conversación', is_favorite: false, profile_id: null,
    created_at: hace(60 * MIN), updated_at: hace(60 * MIN), ...extra,
  }
}
const activos = (...pares: Array<[string, 'working' | 'waiting']>) => new Map(pares)

beforeEach(() => reiniciarTurnosActivos())

test('turno vivo en el journal: amarillo que pulsa aunque la fila diga otra cosa (el bug medido)', () => {
  // Turno largo: la fila de user aún no existe y el último mensaje es el assistant anterior, ya visto.
  const s = ses({ last_role: 'assistant', last_message_at: hace(40 * MIN), last_read_at: hace(39 * MIN) })
  assert.equal(deriveSessionState(s, AHORA, null), 'read', 'sin journal no hay forma de saberlo')
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'working'])), 'working')
})

test('turno vivo con user viejo (más de 15 min) sigue «trabajando»: ya no depende de la ventana', () => {
  const s = ses({ last_role: 'user', last_message_at: hace(WORKING_WINDOW_MS + 5 * MIN) })
  assert.equal(deriveSessionState(s, AHORA, null), 'read')
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'working'])), 'working')
})

test('el journal manda sobre «sin ver»: si aún trabaja no es morado', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(2 * MIN), last_read_at: hace(30 * MIN) })
  assert.equal(deriveSessionState(s, AHORA, null), 'unread')
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'working'])), 'working')
})

test('waiting (AskUserQuestion pendiente) = amarillo fijo, aunque la hayas visto', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(5 * MIN), last_read_at: hace(MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'waiting'])), 'needs_reply')
})

test('turno de OTRA conversación no mancha esta', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(5 * MIN), last_read_at: hace(MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(['otra', 'working'])), 'read')
})

test('terminó y no la has visto: morado, también si acaba en «?» (el azul es solo la pregunta pendiente real)', () => {
  const base = { last_role: 'assistant' as const, last_message_at: hace(3 * MIN), last_read_at: hace(10 * MIN) }
  assert.equal(deriveSessionState(ses(base), AHORA, activos()), 'unread')
  assert.equal(deriveSessionState(ses({ ...base, ends_question: true }), AHORA, activos()), 'unread')
})

test('ya la viste: gris (last_read_at posterior al último mensaje, o igual)', () => {
  const visto = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(MIN), ends_question: true })
  assert.equal(deriveSessionState(visto, AHORA, activos()), 'read')
  const igual = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(10 * MIN) })
  assert.equal(deriveSessionState(igual, AHORA, activos()), 'read')
})

test('nunca vista y sin lectura registrada: morado', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(MIN), last_read_at: null })
  assert.equal(deriveSessionState(s, AHORA, activos()), 'unread')
})

test('sin mensajes o sin last_role: gris', () => {
  assert.equal(deriveSessionState(ses(), AHORA, activos()), 'read')
  assert.equal(deriveSessionState(ses({ last_message_at: hace(MIN), last_role: null }), AHORA, activos()), 'read')
})

test('user reciente con journal disponible: gracia corta de envío; después, gris (turno muerto no pulsa 15 min)', () => {
  const justoAhora = ses({ last_role: 'user', last_message_at: hace(GRACIA_ENVIO_MS - 1_000) })
  const hace5min = ses({ last_role: 'user', last_message_at: hace(5 * MIN) })
  assert.equal(deriveSessionState(justoAhora, AHORA, activos()), 'working')
  assert.equal(deriveSessionState(hace5min, AHORA, activos()), 'read')
})

test('sin journal (daemon viejo o caído): la heurística de antes, ventana de 15 min', () => {
  assert.equal(deriveSessionState(ses({ last_role: 'user', last_message_at: hace(5 * MIN) }), AHORA, null), 'working')
  assert.equal(deriveSessionState(ses({ last_role: 'user', last_message_at: hace(WORKING_WINDOW_MS + MIN) }), AHORA, null), 'read')
})

test('sesión SDK sin fila MC: siempre gris, ni con turno', () => {
  const sdk = ses({ id: 'sdk:abc', isSDKOnly: true, last_role: 'assistant', last_message_at: hace(MIN) })
  assert.equal(deriveSessionState(sdk, AHORA, activos(['sdk:abc', 'working'])), 'read')
  assert.equal(hayNoVisto(sdk), false)
})

test('sesión SDK que Arbrain conduce (journal): sigue el turno en curso; terminada, gris', () => {
  const propia = ses({ id: 'sdk:abc', isSDKOnly: true, conTurnosArbrain: true, last_role: null, last_message_at: hace(MIN) })
  assert.equal(deriveSessionState(propia, AHORA, activos(['sdk:abc', 'working'])), 'working')
  assert.equal(deriveSessionState(propia, AHORA, activos(['sdk:abc', 'waiting'])), 'needs_reply')
  assert.equal(deriveSessionState(propia, AHORA, activos()), 'read')
  assert.equal(hayNoVisto(propia), false)
})

test('hayNoVisto: solo si el último mensaje es de Levy y posterior a la última visita', () => {
  assert.equal(hayNoVisto(ses({ last_role: 'assistant', last_message_at: hace(MIN), last_read_at: hace(5 * MIN) })), true)
  assert.equal(hayNoVisto(ses({ last_role: 'assistant', last_message_at: hace(5 * MIN), last_read_at: hace(MIN) })), false)
  assert.equal(hayNoVisto(ses({ last_role: 'user', last_message_at: hace(MIN), last_read_at: null })), false)
})

// ── Almacén de turnos en curso ──
test('almacén: por defecto lee el último poll; caduca si el poll se detiene', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(40 * MIN), last_read_at: hace(39 * MIN) })
  assert.equal(turnosActivos(AHORA), null, 'nunca hubo dato')
  assert.equal(fijarTurnosActivos([{ conversationId: 'c1', status: 'running' }], AHORA), true)
  assert.equal(deriveSessionState(s, AHORA + 1_000), 'working')
  assert.equal(deriveSessionState(s, AHORA + TURNOS_CADUCAN_MS + 1_000), 'read', 'caducado: manda la fila')
})

test('almacén: waiting gana a working si la misma conversación aparece dos veces', () => {
  fijarTurnosActivos([{ conversationId: 'c1', status: 'waiting' }, { conversationId: 'c1', status: 'queued' }], AHORA)
  assert.equal(turnosActivos(AHORA)?.get('c1'), 'waiting')
})

test('almacén: la versión solo avanza cuando cambia quién trabaja', () => {
  fijarTurnosActivos([{ conversationId: 'c1', status: 'running' }], AHORA)
  const v = versionTurnosActivos()
  assert.equal(fijarTurnosActivos([{ conversationId: 'c1', status: 'dispatching' }], AHORA + 6_000), false, 'working → working no repinta')
  assert.equal(versionTurnosActivos(), v)
  assert.equal(fijarTurnosActivos([{ conversationId: 'c1', status: 'waiting' }], AHORA + 12_000), true)
  assert.equal(fijarTurnosActivos([], AHORA + 18_000), true, 'terminó: deja de estar en el mapa')
  assert.equal(turnosActivos(AHORA + 18_000)?.size, 0)
})

test('almacén: null (daemon sin dato) no borra lo anterior, lo deja envejecer', () => {
  fijarTurnosActivos([{ conversationId: 'c1', status: 'running' }], AHORA)
  assert.equal(fijarTurnosActivos(null, AHORA + 6_000), false)
  assert.equal(turnosActivos(AHORA + 6_000)?.get('c1'), 'working')
  assert.equal(turnosActivos(AHORA + TURNOS_CADUCAN_MS + 1), null)
})

test('almacén: ignora entradas mal formadas', () => {
  fijarTurnosActivos([{ conversationId: 'c1', status: 'running' }, { conversationId: 5, status: 'x' } as never, null as never], AHORA)
  assert.deepEqual([...turnosActivos(AHORA)!.keys()], ['c1'])
})

// ─── Regla única del punto con hijos vivos (3 oct 2026) ───
const sinTerminar = () => 0
const hijosVivos1 = new Map([['c1', 2]])

test('turno terminado con subagentes vivos: NO amarillo, te toca a ti (5 oct)', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(), new Map(), sinTerminar), 'read')
  assert.equal(deriveSessionState(s, AHORA, activos(), hijosVivos1, sinTerminar), 'read')
})

test('con hijos vivos y respuesta sin ver: morado; la pregunta pendiente sigue azul', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(2 * MIN), last_read_at: hace(30 * MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(), hijosVivos1, sinTerminar), 'unread')
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'waiting']), hijosVivos1, sinTerminar), 'needs_reply')
})

test('hijos de otra conversación no manchan esta', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(), new Map([['otra', 3]]), sinTerminar), 'read')
})

test('el último hijo termina: morado si no la has visto, gris si la viste después', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(5 * MIN) })
  assert.equal(deriveSessionState(s, AHORA, activos(), hijosVivos1, sinTerminar), 'read')
  assert.equal(deriveSessionState(s, AHORA, activos(), new Map(), () => AHORA - MIN), 'unread')
  const vista = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(30_000) })
  assert.equal(deriveSessionState(vista, AHORA, activos(), new Map(), () => AHORA - MIN), 'read')
})

test('almacén: fijarHijosVivos cuenta solo «trabajando» y registra cuándo se apagó el último', () => {
  fijarHijosVivos([{ conversacion: 'c1', estado: 'trabajando' }, { conversacion: 'c1', estado: 'trabajando' }, { conversacion: 'c1', estado: 'completada' }], AHORA)
  assert.equal(hijosVivos(AHORA)?.get('c1'), 2)
  assert.equal(hijosTerminaronEn('c1'), 0)
  assert.equal(fijarHijosVivos([{ conversacion: 'c1', estado: 'completada' }], AHORA + 6_000), true)
  assert.equal(hijosVivos(AHORA + 6_000)?.get('c1'), undefined)
  assert.equal(hijosTerminaronEn('c1'), AHORA + 6_000)
  assert.equal(fijarHijosVivos(null), false)
})

test('envío local: amarillo en el mismo clic, antes del journal y del primer token (Daniel, 3 oct)', () => {
  const s = ses({ last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(9 * MIN) })
  const vacio = activos()
  assert.equal(deriveSessionState(s, AHORA, vacio, null, () => 0, () => 0), 'read', 'sin envío, gris')
  assert.equal(deriveSessionState(s, AHORA, vacio, null, () => 0, () => AHORA - 500), 'working', 'recién enviado: amarillo')
  // Llega la respuesta de Levy después del envío: la marca local ya no sostiene el amarillo.
  const respondida = ses({ last_role: 'assistant', last_message_at: new Date(AHORA).toISOString(), last_read_at: hace(9 * MIN) })
  assert.equal(deriveSessionState(respondida, AHORA, vacio, null, () => 0, () => AHORA - 500), 'unread')
  // Una pregunta pendiente sigue ganando.
  assert.equal(deriveSessionState(s, AHORA, activos(['c1', 'waiting']), null, () => 0, () => AHORA - 500), 'needs_reply')
})

test('marcarEnvioLocal vence a los 30 s y avisa a los oyentes', async () => {
  const { marcarEnvioLocal, envioLocalEn, ENVIO_LOCAL_MS, suscribirTurnosActivos } = await import('../../src/features/chat/lib/turnos-activos')
  let avisos = 0
  const quitar = suscribirTurnosActivos(() => { avisos++ })
  const v = versionTurnosActivos()
  marcarEnvioLocal('c9', AHORA)
  assert.equal(avisos, 1)
  assert.ok(versionTurnosActivos() > v)
  assert.equal(envioLocalEn('c9', AHORA + 1_000), AHORA)
  assert.equal(envioLocalEn('c9', AHORA + ENVIO_LOCAL_MS), 0)
  quitar()
  reiniciarTurnosActivos()
})

// ─── Subagentes del MOTOR ligados a la conversación (3 oct 2026) ───
// El Taller cuenta «N en curso» con internas + terminales con `subagente.origen`; el punto, igual.
const agente = (id: number, origen: string | null, estado: Terminal['estado'] = 'trabajando'): Terminal => ({
  id, titulo: `agente ${id}`, cwd: '/', proc: 'claude', estado, actividad: null, ultimaAccion: null, ultimas: [],
  subagente: { id, nombre: `a${id}`, harness: 'claude', encargo: 'x', cwd: '/', creado: new Date(AHORA).toISOString(), origen },
})

test('subagente del motor trabajando en la conversación: el punto NO es amarillo (5 oct)', () => {
  reiniciarTurnosActivos()
  fijarHijosVivos([], AHORA, [agente(1, 'levy-chat')])
  const s = ses({ id: 'levy-chat', last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(5 * MIN) })
  assert.equal(hijosVivos(AHORA)?.get('levy-chat'), 1)
  assert.equal(deriveSessionState(s, AHORA, activos(), hijosVivos(AHORA), sinTerminar), 'read')
})

test('cuenta igual que el Taller: internas + agentes, sdk: sin prefijo, sin origen ni terminados no cuentan', () => {
  reiniciarTurnosActivos()
  fijarHijosVivos([{ conversacion: 'sdk:c9', estado: 'trabajando' }], AHORA, [
    agente(1, 'c9'), agente(2, 'sdk:c9'), agente(3, null), agente(4, 'otra', 'terminal'),
  ])
  assert.equal(hijosVivos(AHORA)?.get('c9'), 3, '1 interna + 2 agentes')
  assert.equal(hijosVivos(AHORA)?.has(''), false, 'sin conversación no pinta ningún punto')
  assert.equal(hijosVivos(AHORA)?.has('otra'), false, 'un agente terminado no cuenta')
  const sdk = ses({ id: 'sdk:c9', last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(5 * MIN) })
  assert.equal(deriveSessionState(sdk, AHORA, activos(), hijosVivos(AHORA), sinTerminar), 'read')
})

test('el agente del motor termina: morado si no la has visto, gris si ya; la pregunta (azul) gana', () => {
  reiniciarTurnosActivos()
  fijarHijosVivos([], AHORA, [agente(1, 'c5')])
  fijarHijosVivos([], AHORA + 6_000, [agente(1, 'c5', 'terminal')])
  assert.equal(hijosTerminaronEn('c5'), AHORA + 6_000)
  const sinVer = ses({ id: 'c5', last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: hace(5 * MIN) })
  assert.equal(deriveSessionState(sinVer, AHORA + 7_000, activos(), hijosVivos(AHORA + 7_000), hijosTerminaronEn), 'unread')
  const vista = ses({ id: 'c5', last_role: 'assistant', last_message_at: hace(10 * MIN), last_read_at: new Date(AHORA + 8_000).toISOString() })
  assert.equal(deriveSessionState(vista, AHORA + 9_000, activos(), hijosVivos(AHORA + 9_000), hijosTerminaronEn), 'read')
  fijarHijosVivos([], AHORA, [agente(2, 'c6')])
  const pregunta = ses({ id: 'c6', last_role: 'assistant', last_message_at: hace(MIN) })
  assert.equal(deriveSessionState(pregunta, AHORA, new Map([['c6', 'waiting']]), hijosVivos(AHORA), sinTerminar), 'needs_reply')
})
