import type { ChatMessage, ToolCall, ToolOutput, UsageMeta, QuestionPrompt, AgentTask, FileAttachmentMeta } from '../hooks/useChat'

export interface DurableSnapshot {
  text?: string; thinking?: string; status?: string; error?: string | null
  tools?: Record<string, { name?: string; input?: string; result?: string; error?: boolean; durationMs?: number; status?: string }>
  items?: Record<string, Record<string, unknown>>
  usage?: UsageMeta | null
  questions?: Record<string, Omit<QuestionPrompt, 'status'>>
  tasks?: Record<string, AgentTask>
  toolSummaries?: string[]; suggestions?: string[]; fileAttachments?: FileAttachmentMeta[]
  persistenceWarnings?: string[]; artifactErrors?: string[]
  branch?: { parentThreadId: string; beforeTurnId: string; threadId: string } | null
}

export function snapshotMessage(state: DurableSnapshot): Partial<ChatMessage> {
  const toolCalls: ToolCall[] = [], toolInputs: Record<string, string> = {}, toolOutputs: Record<string, ToolOutput> = {}
  for (const [toolId, tool] of Object.entries(state.tools ?? {})) {
    toolCalls.push({ toolId, toolName: tool.name ?? 'Herramienta', status: tool.status === 'completed' ? 'done' : 'running' })
    if (tool.input) toolInputs[toolId] = tool.input
    if (tool.result !== undefined) toolOutputs[toolId] = { content: tool.result, isError: tool.error, durationMs: tool.durationMs }
  }
  return {
    content: state.text ?? '', thinking: state.thinking || undefined,
    toolCalls, toolInputs, toolOutputs, usage: state.usage ?? undefined,
    tasks: Object.values(state.tasks ?? {}), toolSummaries: state.toolSummaries ?? [],
    questionPrompts: Object.values(state.questions ?? {}).map(question => ({ ...question, status: 'pending' })),
    // Uploaded URLs may already be in history while the terminal snapshot was
    // recorded before upload. Empty staging state must not erase those URLs.
    ...(state.fileAttachments?.length ? { fileAttachments: state.fileAttachments } : {}),
    error: state.status === 'failed', runtimeItems: state.items ?? {},
    terminalStatus: state.status, diagnostic: state.error ?? undefined,
    persistenceWarnings: state.persistenceWarnings,
    branch: state.branch ?? undefined,
  }
}

export interface ResumeMeta { turnId: string | null; userMessage: string; audioUrl?: string | null; imageUrl?: string | null; startedAt?: number; protocol?: string; origen?: { tipo: 'espontanea' | 'despertador'; etiqueta?: string; despertadorId?: string } }

/** Turn identity, never message text, identifies a recovered pair. This also
 * replaces a previously saved assistant in place without duplicating the user. */
export function restoreTurnPair(messages: ChatMessage[], meta: ResumeMeta, assistantId: string, userId: string): ChatMessage[] {
  // Mensaje del user de este turno que llegó SIN identidad (1 oct 2026): el transcript de una sesión solo-SDK
  // lo trae sin turnId y, al reenganchar, se insertaba el par OTRA VEZ (el mensaje duplicado con «Razonando» en
  // medio). Solo se adopta el ÚLTIMO mensaje del user, sin turnId, con el mismo texto y a menos de 2 min del
  // inicio del turno: dos «ok» seguidos no se confunden porque el anterior ya trae su turnId.
  const adoptado = !!meta.turnId && !messages.some(m => m.role === 'user' && m.metadata?.turnId === meta.turnId)
    ? [...messages].reverse().find(m => m.role === 'user')
    : undefined
  const adoptable = adoptado && !adoptado.metadata?.turnId && adoptado.content.trim() === meta.userMessage.trim()
    && (meta.startedAt === undefined || Math.abs(adoptado.timestamp.getTime() - meta.startedAt) < 2 * 60_000)
    ? adoptado : undefined
  const owns = (message: ChatMessage) => !!meta.turnId && (message.metadata?.turnId === meta.turnId || message === adoptable)
  const existingUser = messages.find(message => owns(message) && message.role === 'user')
  const existingAssistant = messages.find(message => owns(message) && message.role === 'assistant')
  const timestamp = new Date(meta.startedAt ?? Date.now())
  // startedAt (1 oct 2026): el orden del hilo es por inicio de turno, no por la hora de la fila (que puede ser la de su final).
  const inicio = meta.startedAt !== undefined ? { startedAt: meta.startedAt } : {}
  const user: ChatMessage = { ...existingUser, id: existingUser?.id ?? userId, role: 'user', content: meta.userMessage, timestamp: existingUser?.timestamp ?? timestamp, audioUrl: meta.audioUrl ?? undefined, imageUrl: meta.imageUrl ?? undefined, metadata: { ...existingUser?.metadata, turnId: meta.turnId ?? undefined, ...inicio } }
  // A reattached turn is live again: a stale connection diagnostic would lie.
  const assistant: ChatMessage = { ...existingAssistant, id: assistantId, role: 'assistant', content: existingAssistant?.content ?? '', timestamp: existingAssistant?.timestamp ?? timestamp, streaming: true, diagnostic: undefined, metadata: { ...existingAssistant?.metadata, turnId: meta.turnId ?? undefined, ...inicio } }
  const origen = meta.origen ? { origen: meta.origen } : {}
  if (meta.origen) { user.metadata = { ...user.metadata, ...origen }; assistant.metadata = { ...assistant.metadata, ...origen } }
  const first = messages.findIndex(owns)
  const remaining = messages.filter(message => !owns(message) && message.id !== assistantId && message.id !== userId)
  // Respuesta espontánea (chat vivo): Daniel no escribió nada; no se inventa su burbuja.
  remaining.splice(first < 0 ? remaining.length : first, 0, ...(meta.origen?.tipo === 'espontanea' ? [assistant] : [user, assistant]))
  return remaining
}
