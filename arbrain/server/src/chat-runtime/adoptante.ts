import { DUENO, DUENO_M } from '../dueno.js'
import { randomUUID } from 'node:crypto'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { reencolarAviso } from './journal.js'
import { setSpontaneousAdopter, takeSpontaneous, type SpontaneousOffer } from './spontaneous.js'
import type { ChatSupervisor } from './supervisor.js'
import type { ChatJobInput } from './chat-job.js'

/** Cuánto espera una respuesta espontánea a que se cierre el turno anterior de su conversación. */
const ESPERA_MAX_MS = 10 * 60_000

type Aviso = { taskId?: string; status?: string; summary?: string }
type Log = { warn: (o: object, m: string) => void; info: (o: object, m: string) => void }

/** Por qué despertó Levy, en una línea legible (se ve encima de su respuesta). */
export function etiquetaDespertar(prelude: SDKMessage[]): { label: string; avisos: Aviso[] } {
  const avisos: Aviso[] = prelude.flatMap(message => {
    const m = message as { type?: string; subtype?: string; task_id?: string; status?: string; summary?: string }
    return m.type === 'system' && m.subtype === 'task_notification'
      ? [{ taskId: m.task_id, status: m.status, summary: typeof m.summary === 'string' ? m.summary.slice(0, 300) : undefined }]
      : []
  })
  if (!avisos.length) return { label: 'Levy retomó por su cuenta', avisos }
  const verbo = (s?: string) => s === 'failed' ? 'falló' : s === 'stopped' ? 'se detuvo' : 'terminó'
  const ultimo = avisos[avisos.length - 1]
  const que = ultimo.summary ? `«${ultimo.summary.length > 90 ? ultimo.summary.slice(0, 89) + '…' : ultimo.summary}»` : 'una tarea en segundo plano'
  const label = `Aviso: ${que} ${verbo(ultimo.status)}` + (avisos.length > 1 ? ` (+${avisos.length - 1})` : '')
  return { label, avisos }
}

/**
 * Instala en ESTE proceso (corredor, o agent-server sin corredor) el adoptante de respuestas
 * espontáneas: cada una se vuelve un turno del journal reclamado por este worker y corre por el
 * camino normal (eventos → SSE → punto → entrega a Mission Control). Si la conversación aún cierra
 * su turno anterior, reintenta hasta 10 min; el buzón de la respuesta guarda lo que llegue mientras.
 */
export function instalarAdoptante(supervisor: ChatSupervisor, log: Log): void {
  setSpontaneousAdopter((offer: SpontaneousOffer) => {
    const { journal } = supervisor
    const scope = { owner: offer.owner, account: offer.account, conversationId: offer.conversationId }
    const id = { ...scope, turnId: offer.reply.id }
    const previous = journal.latest(offer.owner, offer.account, offer.conversationId)?.input as ChatJobInput | undefined
    const { label, avisos } = etiquetaDespertar(offer.reply.prelude)
    const input: ChatJobInput = {
      message: label, source: previous?.source ?? 'desktop',
      overrides: previous?.overrides ?? { model: null, effort: null, fast: false, ultracode: false },
      ...(previous?.claudeSelection ? { claudeSelection: previous.claudeSelection } : {}),
      spontaneous: { kind: 'aviso', label, avisos },
    }
    const intentar = (): boolean => {
      const turn = journal.adopt(id, input, supervisor.workerId, offer.reply.startedAt)
      if (!turn) return false
      supervisor.runAdopted(turn)
      log.info({ turnId: id.turnId, conversationId: id.conversationId, label }, 'chat vivo: respuesta espontánea adoptada como turno')
      return true
    }
    if (intentar()) return true
    const desde = Date.now()
    // Nadie la pudo mostrar: se drena a las observaciones para no trabar el proceso de la conversación.
    const drenar = () => {
      const huerfana = takeSpontaneous(id.turnId)
      if (huerfana) void (async () => { for await (const message of huerfana.reply.events) journal.observeProvider(scope, { type: 'message', message }) })().catch(() => {})
    }
    const timer = setInterval(() => {
      try {
        if (intentar()) { clearInterval(timer); return }
        // Daniel escribió y su mensaje espera detrás de esta respuesta (5 oct): el aviso cede. Se corta en
        // el CLI (solo si sigue siendo la respuesta activa) y vuelve a la fila como turno sintético detrás de él.
        if (journal.humanoEsperando(scope, true)) {
          clearInterval(timer)
          void offer.reply.interrupt().catch(() => {})
          const turnId = randomUUID()
          journal.accept({ ...scope, turnId }, reencolarAviso({ turnId: id.turnId, input, createdAt: offer.reply.startedAt }))
          drenar()
          log.info({ turnId: id.turnId, reencolado: turnId, conversationId: id.conversationId, label }, `chat vivo: aviso cedió su lugar a ${DUENO} y volvió a la fila`)
          return
        }
      } catch (error) { log.warn({ err: error }, 'chat vivo: no se pudo adoptar la respuesta espontánea') }
      if (Date.now() - desde < ESPERA_MAX_MS) return
      clearInterval(timer)
      log.warn({ turnId: id.turnId, conversationId: id.conversationId }, 'chat vivo: respuesta espontánea sin turno; queda en observaciones')
      drenar()
    }, 250)
    timer.unref?.()
    return true
  })
}
