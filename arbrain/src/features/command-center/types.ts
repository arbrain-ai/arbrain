type DataSeverity = 'info' | 'warning' | 'critical'
export type ActionSeverity = 'critical' | 'high' | 'medium' | 'low'
type ActionSource = 'sales' | 'support' | 'funnel' | 'retention' | 'content' | 'system'

export interface CommandWarning {
  id: string
  severity: DataSeverity
  message: string
}

export interface CommandDataHealth {
  billingStatus: 'fresh' | 'stale' | 'error'
  billingSnapshotDate: string | null
  polarReconciledAt: string | null
  polarDriftStatus: 'green' | 'yellow' | 'red' | 'unknown'
  warnings: CommandWarning[]
}

export interface CommandOwnerState {
  mrrCents: number | null
  activeSubs: number | null
  cancelAtPeriodEnd: number | null
  bookedCents7d: number | null
  purchases7d: number | null
  bookedCents30d: number | null
  purchases30d: number | null
  funnelConversion30d: number | null
  active1d: number | null
  active7d: number | null
  active30d: number | null
  topVideoTitle30d: string | null
  topVideoRevenueCents30d: number | null
  topVideoPayments30d: number | null
  salesLeadsCritical: number | null
  salesLeadsHigh: number | null
  salesLeadsTotal: number | null
  flaggedInterventions48h: number | null
}

export interface CommandAction {
  id: string
  title: string
  detail: string
  severity: ActionSeverity
  source: ActionSource
  suggestedPrompt: string
}

export interface CommandFailingJob {
  id: string
  label: string
  age: string
  error: string
}

export interface CommandSystemState {
  cronActive: number
  cronPaused: number
  failingJobs: CommandFailingJob[]
  bridgeStatus: 'online' | 'offline' | 'degraded'
  tasksOpen: number
  tasksUrgent: number
  tasksHigh: number
  tasksDueSoon: number
  tasksOverdue: number
}

interface CommandBrief {
  headline: string
  status: string
  risk: string
  decision: string
  nextAction: string
}

export interface CommandSourceStatus {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface CommandCenterState {
  generatedAt: string
  partial: boolean
  dataHealth: CommandDataHealth
  owner: CommandOwnerState
  actions: CommandAction[]
  system: CommandSystemState
  brief: CommandBrief
  sources: Record<'ml' | 'polar' | 'cron' | 'tasks', CommandSourceStatus>
}

interface PendingCommandPrompt {
  id: string
  text: string
  autoSend?: boolean
}
