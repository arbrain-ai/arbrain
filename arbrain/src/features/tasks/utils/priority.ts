import type { TaskPriority, TaskStatus } from '@/types/database'

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; icon: string; color: string; bgColor: string }> = {
  0: { label: 'Sin prioridad', icon: '—', color: 'text-muted/80', bgColor: 'bg-card' },
  1: { label: 'Urgente', icon: '🔴', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  2: { label: 'Alta', icon: '🟠', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  3: { label: 'Media', icon: '🟡', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  4: { label: 'Baja', icon: '🔵', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
}

export const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: string; color: string }> = {
  backlog: { label: 'Algún día', icon: '○', color: 'text-muted' },
  todo: { label: 'Por hacer', icon: '◐', color: 'text-blue-400' },
  in_progress: { label: 'En curso', icon: '◑', color: 'text-yellow-400' },
  done: { label: 'Hecho', icon: '●', color: 'text-emerald-400' },
  archived: { label: 'Archivado', icon: '◌', color: 'text-muted/60' },
}

export const ESTIMATE_OPTIONS = [
  { value: null, label: 'Sin estimación' },
  { value: 1, label: '1 punto' },
  { value: 2, label: '2 puntos' },
  { value: 3, label: '3 puntos' },
  { value: 5, label: '5 puntos' },
  { value: 8, label: '8 puntos' },
  { value: 13, label: '13 puntos' },
  { value: 21, label: '21 puntos' },
] as const

export function formatDueDate(dueAt: string | null): string | null {
  if (!dueAt) return null
  const date = new Date(dueAt)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return `Venció hace ${Math.abs(days)} d`
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  if (days <= 7) return `Vence en ${days} d`
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
}

export function getDueDateColor(dueAt: string | null): string {
  if (!dueAt) return 'text-muted/80'
  const date = new Date(dueAt)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return 'text-red-400'
  if (days === 0) return 'text-orange-400'
  if (days <= 2) return 'text-yellow-400'
  return 'text-muted'
}
