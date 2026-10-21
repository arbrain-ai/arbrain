'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { useAuth } from '@/hooks/useAuth'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import { PRIORITY_CONFIG, STATUS_CONFIG, formatDueDate, getDueDateColor } from '../utils/priority'
import { formatDistanceToNow } from 'date-fns'
import {
  X,
  CheckCircle2,
  Archive,
  MessageSquare,
  MessageCircle,
  FileText,
  ChevronDown,
  Calendar,
  Gauge,
  Tag,
  Clock,
  Send,
  ListTree,
  Link2,
  Circle,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  ClipboardCheck,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import remarkGfm from 'remark-gfm'
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false })
import type {
  TaskStatus,
  Message,
  Agent,
  Document as DocType,
  Task,
  TaskRelation,
} from '@/types/database'

// AI-first (11 jul 2026): el panel es ESPEJO. Editar campos (título, descripción,
// status/priority/estimate/due, labels, assignees, crear subtareas) = hablar con
// Levy (botón "Pedir a Levy" con el contexto de la tarea prellenado). Quedan como
// acciones rápidas los cambios de status (Mark Done / Archive / toggle de subtarea
// / checkboxes de la descripción) y los COMENTARIOS (colaboración, no maquinaria).

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'backlog', label: 'Algún día', color: 'bg-card-active' },
  { value: 'todo', label: 'Por hacer', color: 'bg-blue-500/20' },
  { value: 'in_progress', label: 'En curso', color: 'bg-yellow-500/20' },
  { value: 'done', label: 'Hecho', color: 'bg-emerald-500/20' },
  { value: 'archived', label: 'Archivado', color: 'bg-card' },
]

interface MessageWithAgent extends Omit<Message, 'agent'> {
  agents: Agent | null
}

export function TaskDetailPanel() {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const tasks = useTasksStore((s) => s.tasks)
  const selectTask = useTasksStore((s) => s.selectTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const { isOwner } = useAuth()
  const askLevy = useAskLevy()

  const [messages, setMessages] = useState<MessageWithAgent[]>([])
  const [documents, setDocuments] = useState<DocType[]>([])
  const [descPreview, setDescPreview] = useState(true)
  const [descCopied, setDescCopied] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentAgent, setCommentAgent] = useState('')
  const [allAgents, setAllAgents] = useState<Agent[]>([])
  const [sendingComment, setSendingComment] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [previewDocId, setPreviewDocId] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [relations, setRelations] = useState<(TaskRelation & { task: Task })[]>([])

  const task = tasks.find((t) => t.id === selectedTaskId)

  const fetchMessages = useCallback(async (taskId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*, agents(*)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (data) {
      setMessages(data as unknown as MessageWithAgent[])
    }
  }, [])

  const fetchDocuments = useCallback(async (taskId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })

    if (data) {
      setDocuments(data as DocType[])
    }
  }, [])

  const fetchAgents = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('agents').select('*').order('name')
    if (data) {
      setAllAgents(data as Agent[])
      if (!commentAgent && data.length > 0) setCommentAgent(data[0].id)
    }
  }, [commentAgent])

  const fetchSubtasks = useCallback(async (taskId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('parent_task_id', taskId)
      .order('position')
    if (data) setSubtasks(data as Task[])
  }, [])

  const fetchRelations = useCallback(async (taskId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('task_relations')
      .select('*, tasks!task_relations_target_task_id_fkey(*)')
      .eq('source_task_id', taskId)
    if (data) {
      setRelations(
        (data as unknown as (TaskRelation & { tasks: Task })[]).map((r) => ({
          ...r,
          task: r.tasks,
        }))
      )
    }
  }, [])

  useEffect(() => {
    if (!selectedTaskId) return

    fetchMessages(selectedTaskId)
    fetchDocuments(selectedTaskId)
    fetchAgents()
    fetchSubtasks(selectedTaskId)
    fetchRelations(selectedTaskId)

    const supabase = createClient()
    const channel = supabase
      .channel(`messages-${selectedTaskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `task_id=eq.${selectedTaskId}`,
        },
        () => {
          fetchMessages(selectedTaskId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedTaskId, fetchMessages, fetchDocuments, fetchAgents, fetchSubtasks, fetchRelations])

  if (!task) return null

  const handleStatusChange = async (newStatus: TaskStatus) => {
    updateTask(task.id, { status: newStatus })
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
  }

  // Toggle markdown checkboxes (- [ ] ↔ - [x]) directly in description
  const handleCheckboxToggle = async (checkboxIndex: number) => {
    if (!task.description) return
    const lines = task.description.split('\n')
    let count = 0
    for (let i = 0; i < lines.length; i++) {
      const unchecked = /^(\s*-\s*)\[ \](.*)$/
      const checked = /^(\s*-\s*)\[x\](.*)$/i
      if (unchecked.test(lines[i]) || checked.test(lines[i])) {
        if (count === checkboxIndex) {
          if (unchecked.test(lines[i])) {
            lines[i] = lines[i].replace(unchecked, '$1[x]$2')
          } else {
            lines[i] = lines[i].replace(checked, '$1[ ]$2')
          }
          break
        }
        count++
      }
    }
    const updated = lines.join('\n')
    updateTask(task.id, { description: updated })
    const supabase = createClient()
    await supabase.from('tasks').update({ description: updated }).eq('id', task.id)
  }

  const handlePostComment = async () => {
    if (!commentText.trim() || !commentAgent || sendingComment) return
    setSendingComment(true)
    const supabase = createClient()
    await supabase.from('messages').insert({
      task_id: task.id,
      from_agent_id: commentAgent,
      content: commentText.trim(),
    })
    setCommentText('')
    setSendingComment(false)
  }

  const handleToggleSubtask = async (subtask: Task) => {
    const newStatus: TaskStatus = subtask.status === 'done' ? 'backlog' : 'done'
    setSubtasks((prev) => prev.map((s) => s.id === subtask.id ? { ...s, status: newStatus } : s))
    const supabase = createClient()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', subtask.id)
  }

  const handleMarkDone = () => handleStatusChange('done')
  const handleArchive = () => handleStatusChange('archived')

  const priorityConfig = PRIORITY_CONFIG[task.priority ?? 0]
  const statusConfig = STATUS_CONFIG[task.status]
  const statusOption = STATUS_OPTIONS.find((o) => o.value === task.status)
  const dueDateStr = formatDueDate(task.due_at)
  const dueDateColor = getDueDateColor(task.due_at)
  const taskId = `MC-${task.sequence_number}`

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(taskId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 1500)
  }

  return (
    <>
      {/* Backdrop — click outside closes */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={() => selectTask(null)}
      />

      {/* Centered modal panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <aside
          className="pointer-events-auto w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-2xl shadow-elevation-lg flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Specular rim */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-2xl" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className={`text-sm leading-none ${statusConfig.color}`}>{statusConfig.icon}</span>
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1 text-xs font-mono text-muted hover:text-foreground/85 transition-colors"
              title="Copiar ID de la tarea"
            >
              {taskId}
              <Copy size={10} className={copiedId ? 'text-emerald-400' : 'text-muted/80'} />
            </button>
            <span className="text-foreground/10">|</span>
            <span className={`text-sm ${priorityConfig.color}`}>{priorityConfig.icon}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isOwner && (
              <button
                onClick={() => askLevy(`Sobre la tarea #${taskId} "${task.title}": `)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary border border-primary/25 hover:bg-primary/15 transition-colors"
                title="Editar esta tarea = pedírselo a Levy (abre el chat con el contexto listo)"
              >
                <MessageCircle size={12} />
                Pedir a Levy
              </button>
            )}
            <button
              onClick={() => selectTask(null)}
              className="p-1.5 rounded-lg hover:bg-card-active text-muted hover:text-foreground/85 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="p-4 space-y-4">
            {/* Title */}
            <h3 className="text-base font-semibold text-foreground px-1 py-0.5 -mx-1">
              {task.title}
            </h3>

            {/* Properties Grid (read-only mirror) */}
            <div className="space-y-2">
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-widest text-muted w-20 flex-shrink-0">Estado</span>
                <span className="flex items-center gap-1.5 text-xs text-foreground/85 px-2.5 py-1.5">
                  <span className={`w-2 h-2 rounded-full ${statusOption?.color}`} />
                  {statusOption?.label}
                </span>
              </div>

              {/* Priority */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-widest text-muted w-20 flex-shrink-0 flex items-center gap-1">
                  <Gauge size={10} />
                  Priority
                </span>
                <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 ${priorityConfig.color}`}>
                  <span>{priorityConfig.icon}</span>
                  {priorityConfig.label}
                </span>
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-widest text-muted w-20 flex-shrink-0 flex items-center gap-1">
                  <Calendar size={10} />
                  Due
                </span>
                <span className={`text-xs px-2.5 py-1.5 ${dueDateStr ? dueDateColor : 'text-muted/60'}`}>
                  {dueDateStr || 'Sin fecha'}
                </span>
              </div>

              {/* Estimate */}
              {task.estimate != null && (
                <div className="flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-widest text-muted w-20 flex-shrink-0 flex items-center gap-1">
                    <Clock size={10} />
                    Estimate
                  </span>
                  <span className="text-xs text-foreground/85 px-2.5 py-1.5">{task.estimate} pts</span>
                </div>
              )}
            </div>

            {/* Labels */}
            {(task.labels ?? []).length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1">
                  <Tag size={10} />
                  Labels
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(task.labels ?? []).map((label) => (
                    <span
                      key={label.id}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border flex items-center gap-1"
                      style={{ backgroundColor: `${label.color}20`, color: label.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-tasks */}
            {subtasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-1">
                    <ListTree size={10} />
                    Sub-tasks
                  </label>
                  <span className="text-[10px] text-muted/80">
                    {subtasks.filter((s) => s.status === 'done').length}/{subtasks.length}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-card-hover rounded-full mb-2 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all"
                    style={{ width: `${(subtasks.filter((s) => s.status === 'done').length / subtasks.length) * 100}%` }}
                  />
                </div>

                {/* Subtask list (toggle done = acción rápida) */}
                <div className="space-y-0.5">
                  {subtasks.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => handleToggleSubtask(sub)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card transition-colors text-left group"
                    >
                      {sub.status === 'done' ? (
                        <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Circle size={14} className="text-muted/60 group-hover:text-muted flex-shrink-0" />
                      )}
                      <span className={`text-xs truncate ${sub.status === 'done' ? 'text-muted/80 line-through' : 'text-foreground/75'}`}>
                        {sub.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {relations.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1">
                  <Link2 size={10} />
                  Relations
                </label>
                <div className="space-y-1">
                  {relations.map((rel) => (
                    <button
                      key={rel.id}
                      onClick={() => selectTask(rel.target_task_id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-border-subtle hover:bg-card-hover transition-colors text-left"
                    >
                      <span className="text-[10px] text-muted/80 uppercase w-16 flex-shrink-0">
                        {rel.relation_type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-foreground/70 truncate">{rel.task.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] uppercase tracking-widest text-muted">
                  Description
                </label>
                {task.description && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDescPreview(!descPreview)}
                      className={`p-1 rounded transition-colors ${descPreview ? 'text-muted hover:text-foreground/75' : 'text-muted/70 hover:text-muted'}`}
                      title={descPreview ? 'Ver markdown' : 'Ver vista previa'}
                    >
                      {descPreview ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(task.description || '')
                        setDescCopied(true)
                        setTimeout(() => setDescCopied(false), 2000)
                      }}
                      className="p-1 rounded text-muted/70 hover:text-muted transition-colors"
                      title="Copiar como markdown"
                    >
                      {descCopied ? <ClipboardCheck size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
              {descPreview && task.description ? (
                <div
                  className="text-sm text-foreground/70 rounded-lg px-2 py-1.5 -mx-1 min-h-[3rem] md-preview overflow-hidden [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_table]:w-full [&_table]:table-fixed [&_td]:break-words [&_th]:break-words [&_code]:break-all"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      input: (() => {
                        let checkboxCount = 0
                        return (props: React.InputHTMLAttributes<HTMLInputElement>) => {
                          if (props.type !== 'checkbox') return <input {...props} />
                          const idx = checkboxCount++
                          return (
                            <input
                              type="checkbox"
                              checked={props.checked}
                              onChange={() => handleCheckboxToggle(idx)}
                              className="mr-1.5 accent-emerald-500 cursor-pointer"
                            />
                          )
                        }
                      })(),
                    }}
                  >
                    {task.description}
                  </ReactMarkdown>
                </div>
              ) : task.description ? (
                <p className="text-sm text-foreground/70 rounded-lg px-2 py-1.5 -mx-1 min-h-[3rem] whitespace-pre-wrap">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm text-muted/60 italic rounded-lg px-2 py-1.5 -mx-1 min-h-[3rem]">
                  Sin descripción. Pídesela a Levy.
                </p>
              )}
            </div>

            {/* Assignees */}
            {task.assignees.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted mb-1.5 block">
                  Assignees
                </label>
                <div className="space-y-1.5">
                  {task.assignees.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card"
                    >
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-card-active flex items-center justify-center text-sm text-foreground/70">
                          {(profile.full_name ?? '?')[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm text-foreground truncate block">{profile.full_name ?? 'User'}</span>
                        <span className="text-[11px] text-muted">{profile.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted mb-1.5 block">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 rounded-md bg-card-hover text-foreground/70 border border-border-subtle"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions (cambios de status: la clase de acción rápida que se queda) */}
            <div className="flex gap-2">
              <button
                onClick={handleMarkDone}
                disabled={task.status === 'done'}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                  hover:bg-emerald-500/15 transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={14} />
                Mark Done
              </button>
              <button
                onClick={handleArchive}
                disabled={task.status === 'archived'}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  bg-card-hover text-muted border border-border-subtle
                  hover:bg-card-active transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Archive size={14} />
                Archive
              </button>
            </div>

            {/* Messages Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-muted" />
                <label className="text-[11px] uppercase tracking-widest text-muted">
                  Messages
                </label>
                <span className="text-[10px] text-muted/80 bg-card-hover px-1.5 py-0.5 rounded-full">
                  {messages.length}
                </span>
              </div>
              {messages.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="bg-card rounded-lg p-2.5 border border-border-subtle"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {msg.agents && (
                          <>
                            <span className="text-sm">{msg.agents.avatar}</span>
                            <span className="text-[11px] font-medium text-foreground/75">{msg.agents.name}</span>
                          </>
                        )}
                        {msg.created_at && (
                          <span className="text-[10px] text-muted/80 ml-auto">
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <div className="prose prose-invert prose-xs max-w-none text-foreground/70 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:my-0.5 [&_code]:text-[10px] [&_code]:bg-card-hover [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-card [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:text-[10px] [&_a]:text-blue-400 [&_ul]:text-xs [&_ol]:text-xs [&_li]:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted/60 italic px-1">Aún sin mensajes</p>
              )}

              {/* Comment input with @mention */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={commentAgent}
                    onChange={(e) => setCommentAgent(e.target.value)}
                    className="bg-card-hover border border-border rounded-lg px-2 py-1 text-[10px] text-foreground/70 outline-none"
                  >
                    {allAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted/60">Escribe @ para mencionar</span>
                </div>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <textarea
                      value={commentText}
                      onChange={(e) => {
                        const val = e.target.value
                        setCommentText(val)
                        // Detect @mention
                        const cursor = e.target.selectionStart
                        const textBefore = val.slice(0, cursor)
                        const mentionMatch = textBefore.match(/@(\w*)$/)
                        if (mentionMatch) {
                          setMentionQuery(mentionMatch[1].toLowerCase())
                          setMentionIndex(0)
                        } else {
                          setMentionQuery(null)
                        }
                      }}
                      placeholder="Escribe un comentario… (Markdown y @menciones)"
                      rows={2}
                      onKeyDown={(e) => {
                        if (mentionQuery !== null) {
                          const filtered = allAgents.filter((a) =>
                            a.name.toLowerCase().includes(mentionQuery)
                          )
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setMentionIndex((i) => Math.min(i + 1, filtered.length - 1))
                            return
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setMentionIndex((i) => Math.max(i - 1, 0))
                            return
                          }
                          if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) {
                            e.preventDefault()
                            const agent = filtered[mentionIndex]
                            const cursor = e.currentTarget.selectionStart
                            const textBefore = commentText.slice(0, cursor)
                            const textAfter = commentText.slice(cursor)
                            const mentionStart = textBefore.lastIndexOf('@')
                            setCommentText(
                              textBefore.slice(0, mentionStart) + `@${agent.name} ` + textAfter
                            )
                            setMentionQuery(null)
                            return
                          }
                          if (e.key === 'Escape') {
                            setMentionQuery(null)
                            return
                          }
                        }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          handlePostComment()
                        }
                      }}
                      className="w-full bg-card-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground/85 placeholder:text-muted/60 outline-none focus:border-border-accent resize-none"
                    />

                    {/* @Mention dropdown */}
                    {mentionQuery !== null && (() => {
                      const filtered = allAgents.filter((a) =>
                        a.name.toLowerCase().includes(mentionQuery)
                      )
                      if (filtered.length === 0) return null
                      return (
                        <div className="absolute bottom-full left-0 right-0 mb-1 glass-panel-strong border border-border rounded-lg overflow-hidden z-20 shadow-elevation-md max-h-32 overflow-y-auto">
                          {filtered.map((agent, i) => (
                            <button
                              key={agent.id}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                const textarea = e.currentTarget.closest('.relative')?.querySelector('textarea')
                                if (!textarea) return
                                const cursor = textarea.selectionStart
                                const textBefore = commentText.slice(0, cursor)
                                const textAfter = commentText.slice(cursor)
                                const mentionStart = textBefore.lastIndexOf('@')
                                setCommentText(
                                  textBefore.slice(0, mentionStart) + `@${agent.name} ` + textAfter
                                )
                                setMentionQuery(null)
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
                                ${i === mentionIndex ? 'bg-card-active text-foreground' : 'text-foreground/70 hover:bg-card-hover'}
                              `}
                            >
                              <span className="text-sm">{agent.avatar}</span>
                              <span>{agent.name}</span>
                              <span className="text-[10px] text-muted/80 ml-auto">{agent.role}</span>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <button
                    onClick={handlePostComment}
                    disabled={!commentText.trim() || sendingComment}
                    className="self-end p-2 rounded-lg bg-card-active text-muted hover:bg-card-active hover:text-foreground/85 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Documents Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-muted" />
                <label className="text-[11px] uppercase tracking-widest text-muted">
                  Documents
                </label>
                <span className="text-[10px] text-muted/80 bg-card-hover px-1.5 py-0.5 rounded-full">
                  {documents.length}
                </span>
              </div>
              {documents.length > 0 ? (
                <div className="space-y-1.5">
                  {documents.map((doc) => (
                    <div key={doc.id}>
                      <button
                        onClick={() => setPreviewDocId(previewDocId === doc.id ? null : doc.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors text-left
                          ${previewDocId === doc.id ? 'bg-card-hover border-border' : 'bg-card border-border-subtle hover:bg-card-hover'}
                        `}
                      >
                        <FileText size={14} className="text-muted/80 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs text-foreground/75 truncate block">{doc.title}</span>
                          <span className="text-[10px] text-muted/80">
                            {doc.type}{doc.path ? ` - ${doc.path}` : ''}
                          </span>
                        </div>
                        <ChevronDown size={10} className={`text-muted/80 transition-transform ${previewDocId === doc.id ? 'rotate-180' : ''}`} />
                      </button>
                      {previewDocId === doc.id && (
                        <div className="mt-1 px-3 py-2.5 bg-card/40 border border-border-subtle rounded-lg">
                          {doc.type === 'code' ? (
                            <pre className="text-[10px] text-foreground/70 font-mono overflow-x-auto whitespace-pre-wrap">{doc.content}</pre>
                          ) : (
                            <div className="prose prose-invert prose-xs max-w-none text-foreground/70 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:my-0.5 [&_code]:text-[10px] [&_code]:bg-card-hover [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-card [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:text-[10px] [&_a]:text-blue-400">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {doc.content}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted/60 italic px-1">Sin documentos</p>
              )}
            </div>

            {/* Metadata */}
            <div className="border-t border-border-subtle pt-3 space-y-1">
              {task.created_at && (
                <div className="flex items-center justify-between text-[10px] text-muted/70">
                  <span>Creada</span>
                  <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
                </div>
              )}
              {task.updated_at && (
                <div className="flex items-center justify-between text-[10px] text-muted/70">
                  <span>Actualizada</span>
                  <span>{formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}</span>
                </div>
              )}
              {task.session_key && (
                <div className="flex items-center justify-between text-[10px] text-muted/70">
                  <span>Sesión</span>
                  <span className="font-mono">{task.session_key}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        </aside>
      </div>
    </>
  )
}
