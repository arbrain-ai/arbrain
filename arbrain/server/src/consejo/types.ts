export type Provider = 'claude' | 'openai'
export type Stage = Provider | 'synthesis'
export type State = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'
export interface Identity { provider: Provider; account: string; model: string; billing: 'subscription' }
export interface ModelChoice { model: string; effort?: string }
export type ModelSettings = Record<Provider, ModelChoice> & { synthesis?: ModelChoice & { provider: Provider } }
export interface CatalogModel { model: string; label: string; efforts: string[]; defaultEffort?: string }
export type ModelCatalog = Record<Provider, { account: string; models: CatalogModel[] }> & { synthesisSupported?: true }
export interface Attachment { name: string; type: 'text' | 'image'; content: string }
export interface ResponseRef { turnId: string; source: Stage; clarificationId?: string }
export interface ResponseSource extends ResponseRef { text: string; identity?: Identity }
export interface ToolTrace { id: string; name: string; input: Record<string, unknown>; state: State; text?: string; error?: string; identity?: Identity; usage?: Record<string, unknown>; startedAt: number; endedAt?: number; cached?: boolean }
export interface Evidence { text: string; observedAt: number }
export interface InferenceTools {
  history: ResponseSource[]; cache: Record<string, Evidence>; traces: ToolTrace[]
  update(trace: ToolTrace): void
}
export interface PublicMessage { turnId: string; role: 'user' | 'assistant'; content: string; attachments?: Attachment[]; author?: string; identity?: Identity }
export interface SharedSummary {
  version: number; throughTurnId: string; sourceHash: string; sourceTurnIds: string[]
  text: string; userMessages: Array<{ turnId: string; content: string }>
}
export interface SummaryInput { previous?: SharedSummary; messages: PublicMessage[] }
export interface Packet {
  version: 1; hash: string; instructions: string; messages: PublicMessage[]
  references: Array<{ turnId: string; provider: Provider | 'synthesis'; text: string; identity?: Identity }>
  responseIndex?: Array<ResponseRef & { identity?: Identity }>
  target?: 'both' | Provider
  settings?: ModelSettings
  summary?: SharedSummary
  identities: Record<Provider, Identity>
}
export interface Proposal {
  tools?: ToolTrace[]
  state: State; text?: string; identity?: Identity; error?: string
  startedAt?: number; endedAt?: number; usage?: Record<string, unknown>
}
export interface ExecutionQuestion { requestId:string; questions:Array<{question:string;header?:string;options:Array<{label:string;description?:string}>;multiSelect?:boolean}>;status:'pending'|'answered'|'skipped'|'timeout' }
export interface ExecutionProgress { status:string;questions:ExecutionQuestion[] }
export interface Executor {
  execute(turn:Turn,signal:AbortSignal,update:(progress:ExecutionProgress)=>void):Promise<{text:string;identity:Identity;usage?:Record<string,unknown>}>
  answer(id:string,answers:Record<string,string>|null):boolean
}
export interface Turn {
  evidence?: Record<string, Evidence>
  id: string; conversationId: string; owner: string; branchId: string; parentId: string | null
  mode?: 'deliberation'|'execution'; execution?: Proposal & {progress?:ExecutionProgress}
  contextPreparation?: Proposal; sourcePacket?: Packet
  requestHash: string; packet: Packet; message: string; attachments: Attachment[]; state: State
  proposals: Record<Stage, Proposal>; final?: string; delivery?: 'integrated' | 'execution' | Provider
  createdAt: number; revision: number; retryIds?: string[]
}
export interface Conversation { id: string; owner: string; title: string; rootBranchId: string; createdAt: number }
export interface Submission {
  target?: 'both' | Provider; references?: ResponseRef[]
  conversationId: string; turnId: string; branchId: string; parentId: string | null
  message: string; attachments?: Attachment[]; editTurnId?: string; settings?: ModelSettings
}
export interface Runtime {
  identities(signal: AbortSignal, settings?: ModelSettings): Promise<Record<Provider, Identity>>
  summarize?(input: SummaryInput, signal: AbortSignal): Promise<{ text: string; identity: Identity; usage?: Record<string, unknown> }>
  infer(stage: Stage, packet: Packet, proposals: Record<Stage, Proposal>, signal: AbortSignal, tools?: InferenceTools): Promise<{ text: string; identity: Identity; usage?: Record<string, unknown> }>
}
export class ConsejoError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}
