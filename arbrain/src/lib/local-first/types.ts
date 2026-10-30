export type RuntimeMode = 'cloud' | 'hybrid' | 'offline'

export type EntitySyncStatus = 'local' | 'queued' | 'syncing' | 'synced' | 'conflict' | 'failed'

export interface RuntimeServerStatus {
  url: string
  ready: boolean
  managed: boolean
  pid?: number | null
  mode: 'unknown' | 'external' | 'managed' | 'error' | string
  sourcePath?: string | null
  lastError?: string | null
}

export interface RuntimeStatus {
  desktop: boolean
  mode: RuntimeMode
  online: boolean
  syncing: boolean
  pendingCount: number
  failedCount: number
  conflictCount: number
  workspacePath?: string
  databasePath?: string
  server?: RuntimeServerStatus
  lastSyncedAt?: string | null
  lastPackPath?: string | null
  message?: string | null
}

export interface LocalTaskRecord {
  id: string
  cloudId?: string | null
  title: string
  description?: string | null
  status?: string | null
  priority?: number | null
  dueAt?: string | null
  assigneeId?: string | null
  updatedAt: string
  deletedAt?: string | null
  syncStatus?: EntitySyncStatus
}

export interface LocalEventRecord {
  id: string
  cloudId?: string | null
  accountEmail?: string | null
  calendarId?: string | null
  title: string
  description?: string | null
  startsAt: string
  endsAt?: string | null
  timezone?: string | null
  status?: EntitySyncStatus
  updatedAt: string
  deletedAt?: string | null
}

export interface LocalDrawingRecord {
  id: string
  cloudId?: string | null
  title: string
  dataJson: string
  thumbnailPath?: string | null
  updatedAt: string
  deletedAt?: string | null
  syncStatus?: EntitySyncStatus
}

export interface LocalFileRecord {
  id: string
  sourceUri?: string | null
  localPath: string
  contentType?: string | null
  sha256?: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncQueueItem {
  id: string
  entityType: string
  entityId: string
  operation: string
  payloadJson: string
  status: EntitySyncStatus | 'pending' | 'cancelled'
  attempts: number
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

export interface SyncResult {
  processed: number
  synced: number
  failed: number
  conflicts: number
}

export interface PullLocalMirrorResult {
  pulledAt: string
  tasks: number
  events: number
  drawings: number
  snapshots: number
  skippedLocalChanges: number
  errors: string[]
}

export interface SyncAndPullResult {
  sync: SyncResult
  pull: PullLocalMirrorResult
}

export interface MarkSyncQueueItemInput {
  id: string
  status: EntitySyncStatus | 'pending' | 'cancelled'
  lastError?: string | null
  cloudId?: string | null
  confirmedSelection?: { localOwner: string; intent: import('@/features/chat/lib/offline-envelope').ChatIntent }
}

export interface OfflinePackRequest {
  name?: string
  notes?: string
  snapshots?: unknown
}

export interface OfflinePackResult {
  packPath: string
  manifestPath: string
  generatedAt: string
  tasks: number
  events: number
  drawings: number
  files: number
}

export interface ChatPromptInput {
  prompt: string
  route?: string | null
  contextPackId?: string | null
  localContext?: unknown
}

export interface SearchHit {
  id: string
  module: string
  title: string
  subtitle?: string | null
  updatedAt?: string | null
}
