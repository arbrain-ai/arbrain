'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Check, Loader2, RotateCcw, FileWarning, Plus, MessageCircle, Eye } from 'lucide-react'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { useAuth } from '@/hooks/useAuth'
import { useAskLevy } from '@/shared/hooks/useAskLevy'
import type { TaskStatus, TaskWithAssignees } from '@/types/database'

// Vista de Objetivos: render del markdown SSOT (.claude/plan/objetivos.md) con
// checkboxes interactivos + navegacion por mes. Mismo archivo que lee
// now-snapshot.py y que Levy edita desde time-os. Una sola fuente de verdad.
// AI-first: editar/crear = hablar con Levy; en web (espejo MC) es solo lectura.

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Source = 'file' | 'mirror' | null

const CHECK_RE = /^(\s*)-\s*\[( |x|X)\]\s*(.*)$/
const BULLET_RE = /^(\s*)\*\s+(.*)$/
const OBJ_RE = /^\*\*(Mes|Foco):\*\*\s*(.*)$/
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const POLL_MS = 6000

type MonthBlock = { label: string; start: number; end: number }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Referencia a una task del board dentro de un objetivo: "#MC-123".
const MC_REF_RE = /#MC-(\d+)/gi
const TASK_STATUS_STYLE: Record<TaskStatus, { dot: string; label: string }> = {
  backlog: { dot: 'bg-slate-500', label: 'backlog' },
  todo: { dot: 'bg-sky-400', label: 'todo' },
  in_progress: { dot: 'bg-amber-400', label: 'en curso' },
  done: { dot: 'bg-emerald-400', label: 'hecho' },
  archived: { dot: 'bg-slate-600', label: 'archivada' },
}

type TaskResolver = (seq: number) => TaskWithAssignees | undefined

// Convierte texto con "#MC-123" en nodos: el resto como texto, las refs como badges
// que muestran el estado real de la task y abren su detalle en el board al click.
function renderInline(text: string, resolve: TaskResolver, openTask: (id: string) => void): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  MC_REF_RE.lastIndex = 0
  let k = 0
  while ((m = MC_REF_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const seq = Number(m[1])
    const task = resolve(seq)
    const style = task ? TASK_STATUS_STYLE[task.status] : null
    nodes.push(
      <button
        key={`mc-${k++}-${seq}`}
        onClick={(e) => { e.stopPropagation(); if (task) openTask(task.id) }}
        title={task ? `${task.title} · ${style?.label}` : `MC-${seq} (no encontrada)`}
        className={`mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-[11px] font-medium ${task ? 'border-border-subtle bg-card-hover text-foreground hover:border-border-accent' : 'border-red-500/30 text-red-300/80'}`}
      >
        {style && <span className={`size-1.5 rounded-full ${style.dot}`} />}
        MC-{seq}
      </button>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

// Detecta bloques de mes: "## <Mes> <Anio>". Devuelve rangos de lineas [start, end).
function findMonths(lines: string[]): MonthBlock[] {
  const heads: { i: number; label: string }[] = []
  lines.forEach((ln, i) => {
    if (ln.startsWith('## ')) {
      const label = ln.slice(3).trim()
      if (MONTHS_ES.some((m) => label.toLowerCase().includes(m))) heads.push({ i, label })
    }
  })
  return heads.map((h, idx) => ({
    label: h.label,
    start: h.i,
    end: idx + 1 < heads.length ? heads[idx + 1].i : lines.length,
  }))
}

export function ObjectivesView() {
  const [content, setContent] = useState('')
  const [available, setAvailable] = useState(true)
  const [source, setSource] = useState<Source>(null)
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState<SaveState>('idle')
  // Mes que se mira ahora (year + month 0-11). Default al mes real; navega libre.
  const [view, setView] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const savingRef = useRef(false)

  const { isOwner } = useAuth()
  const askLevy = useAskLevy()

  // El markdown solo se puede escribir donde hay filesystem (desktop). En web
  // el contenido viene del espejo MC (system_docs) y es solo lectura.
  const readOnly = source !== 'file'

  // Tasks del board para resolver referencias #MC-<n> a estado en vivo.
  // NO montar useTasks() aquí: board/page.tsx ya lo monta (doble suscripción
  // al canal realtime crasheaba el tab — supabase dedupe por topic).
  const router = useRouter()
  const tasks = useTasksStore((s) => s.tasks)
  const taskBySeq = useMemo(() => {
    const map = new Map<number, TaskWithAssignees>()
    for (const t of tasks) if (typeof t.sequence_number === 'number') map.set(t.sequence_number, t)
    return map
  }, [tasks])
  const resolveTask = useCallback((seq: number) => taskBySeq.get(seq), [taskBySeq])
  const openTask = useCallback((id: string) => router.push(`/board?task=${id}`), [router])

  const lines = useMemo(() => content.split('\n'), [content])
  const months = useMemo(() => findMonths(lines), [lines])

  // Carga + refetch (reactividad: refleja edits de Levy sin recargar).
  const load = useCallback((initial = false) => {
    if (savingRef.current) return
    fetch('/api/objectives')
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.ok)
        setSource(d.ok ? (d.source === 'mirror' ? 'mirror' : 'file') : null)
        setContent((prev) => (prev === d.content ? prev : d.content ?? ''))
        if (initial) setLoading(false)
      })
      .catch(() => { setAvailable(false); setSource(null); if (initial) setLoading(false) })
  }, [])

  useEffect(() => {
    load(true)
    const iv = setInterval(() => load(false), POLL_MS)
    const onFocus = () => load(false)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [load])

  const persist = useCallback(async (next: string) => {
    savingRef.current = true
    setSave('saving')
    try {
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: next }),
      })
      const d = await res.json()
      setSave(d.ok ? 'saved' : 'error')
      if (d.ok) setTimeout(() => setSave('idle'), 1500)
    } catch {
      setSave('error')
    } finally {
      savingRef.current = false
    }
  }, [])

  const toggleLine = useCallback(
    (lineIdx: number) => {
      if (readOnly) return
      const ls = content.split('\n')
      const m = ls[lineIdx]?.match(CHECK_RE)
      if (!m) return
      const checked = m[2].toLowerCase() === 'x'
      ls[lineIdx] = `${m[1]}- [${checked ? ' ' : 'x'}] ${m[3]}`
      const next = ls.join('\n')
      setContent(next)
      persist(next)
    },
    [content, persist, readOnly],
  )

  const shiftMonth = useCallback((delta: number) => setView((v) => {
    const d = new Date(v.y, v.m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  }), [])

  // Atajos de teclado (sin UI, mismo lenguaje d/w/m que calendario y board):
  //   ← / →  cambia de mes · d/w/m salta a la seccion dia/semana/mes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); shiftMonth(-1); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); shiftMonth(1); return }
      const k = e.key.toLowerCase()
      const anchor = k === 'm' ? 'obj-anchor-month' : k === 'w' ? 'obj-anchor-week' : k === 'd' ? 'obj-anchor-day' : null
      if (anchor) {
        e.preventDefault()
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shiftMonth])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted"><Loader2 className="animate-spin" size={18} /></div>
  }

  if (!available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-muted">
        <FileWarning size={28} className="text-yellow-400/80" />
        <p className="max-w-sm text-sm">
          Los objetivos viven en <code className="text-foreground">.claude/plan/objetivos.md</code> en tu Mac
          y su espejo aún no existe. Pídele a Levy que corra <code className="text-foreground">now-snapshot.py</code>.
        </p>
      </div>
    )
  }

  const monthLabel = `${cap(MONTHS_ES[view.m])} ${view.y}`
  const cur = months.find((m) => m.label.toLowerCase().includes(MONTHS_ES[view.m]) && m.label.includes(String(view.y)))
  const _now = new Date()
  const isCurrentMonth = _now.getMonth() === view.m && _now.getFullYear() === view.y
  const todayDay = _now.getDate()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="icon-btn size-8 text-primary"><Target size={16} /></div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Objetivos</h1>
            <p className="text-[11px] text-muted">Plano de vuelo · mes → semana → día · markdown vivo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveBadge state={save} />
          {source === 'mirror' && (
            <span className="flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wide text-muted" title="En web ves el espejo de tu Mac; para editar, pídeselo a Levy.">
              <Eye size={11} /> espejo · solo lectura
            </span>
          )}
          {isOwner && (
            <button
              onClick={() => askLevy('Actualiza mis objetivos: ')}
              className="btn-secondary px-3 py-1.5 text-xs"
              title="Abre el chat con el draft listo; tú lo completas y lo mandas."
            >
              <MessageCircle size={13} /> Pedir a Levy
            </button>
          )}
        </div>
      </div>

      {/* Mes actual + hint de atajos (sin botones: navegacion solo por teclado) */}
      <div className="flex items-center justify-center gap-3 border-b border-border-subtle px-5 py-2.5">
        <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted/40">← → mes · d w m saltar</span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-3xl">
          {cur ? (
            <RenderedDoc lines={lines} start={cur.start} end={cur.end} onToggle={toggleLine} readOnly={readOnly} resolve={resolveTask} openTask={openTask} isCurrentMonth={isCurrentMonth} todayDay={todayDay} />
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-sm text-muted">Aún no hay objetivos para <strong className="text-foreground">{monthLabel}</strong>.</p>
              {isOwner && (
                <button onClick={() => askLevy(`Crea el bloque del mes ${monthLabel} en mis objetivos: `)} className="btn-primary px-4 py-2 text-xs">
                  <Plus size={14} /> Pedir a Levy los objetivos de {monthLabel}
                </button>
              )}
              <p className="max-w-xs text-[11px] text-muted/70">Dile: “pon como objetivo de {monthLabel.toLowerCase()} …”</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const map = {
    saving: { icon: <Loader2 size={12} className="animate-spin" />, text: 'Guardando', cls: 'text-muted' },
    saved: { icon: <Check size={12} />, text: 'Guardado', cls: 'text-emerald-400' },
    error: { icon: <RotateCcw size={12} />, text: 'Error al guardar', cls: 'text-red-400' },
  } as const
  const m = map[state]
  return <span className={`flex items-center gap-1 text-[11px] ${m.cls}`}>{m.icon} {m.text}</span>
}

// Renderiza solo las lineas [start, end) preservando el indice GLOBAL para el toggle.
function RenderedDoc({ lines, start, end, onToggle, readOnly, resolve, openTask, isCurrentMonth, todayDay }: { lines: string[]; start: number; end: number; onToggle: (i: number) => void; readOnly: boolean; resolve: TaskResolver; openTask: (id: string) => void; isCurrentMonth: boolean; todayDay: number }) {
  const out: ReactNode[] = []
  let inComment = false
  let seenWeek = false  // para dibujar divisor antes de cada semana menos la primera
  const ri = (text: string) => renderInline(text, resolve, openTask)

  for (let i = start; i < end; i++) {
    const line = lines[i].trimEnd()
    if (line.includes('<!--')) inComment = true
    if (inComment) { if (line.includes('-->')) inComment = false; continue }
    if (!line.trim()) { out.push(<div key={i} className="h-2" />); continue }

    if (line.startsWith('#### ')) {
      // Anchor del dia de hoy (para el atajo 'd').
      const dm = line.slice(5).match(/(\d{1,2})\b/)
      const isToday = isCurrentMonth && dm && Number(dm[1]) === todayDay
      out.push(
        <h4 key={i} id={isToday ? 'obj-anchor-day' : undefined}
          className={`mt-4 mb-1.5 text-[13px] font-semibold uppercase tracking-wide ${isToday ? 'text-amber-400' : 'text-muted'}`}>
          {line.slice(5)}{isToday && <span className="ml-2 normal-case text-[10px] text-amber-400/70">hoy</span>}
        </h4>,
      )
      continue
    }
    if (line.startsWith('### ')) {
      // Divisor automatico entre semanas (menos antes de la primera).
      if (seenWeek) out.push(<hr key={`hr-${i}`} className="my-5 border-border-subtle/60" />)
      seenWeek = true
      // Anchor de la semana actual (para el atajo 'w').
      const wm = line.slice(4).match(/(\d{1,2})\s*-\s*(\d{1,2})/)
      const isThisWeek = isCurrentMonth && wm && Number(wm[1]) <= todayDay && todayDay <= Number(wm[2])
      out.push(
        <h3 key={i} id={isThisWeek ? 'obj-anchor-week' : undefined}
          className="mt-2 mb-2 border-l-2 border-primary/60 pl-2.5 text-sm font-semibold text-foreground">
          {line.slice(4)}
        </h3>,
      )
      continue
    }
    if (line.startsWith('## ')) {
      out.push(<h2 key={i} id="obj-anchor-month" className="mt-1 mb-2 text-lg font-bold text-foreground">{line.slice(3)}</h2>)
      continue
    }
    if (line.startsWith('# ')) continue

    const obj = line.match(OBJ_RE)
    if (obj) {
      // Mes = ambar (la brujula del mes), Semana/Foco = morado. Mismo lenguaje de color
      // que el calendario: distinto nivel, distinto tono.
      const isMonth = obj[1].toLowerCase() === 'mes'
      const box = isMonth
        ? 'border-amber-500/30 bg-amber-500/10'
        : 'border-primary/25 bg-primary/10'
      const label = isMonth ? 'text-amber-400' : 'text-primary'
      out.push(
        <div key={i} className={`my-1.5 rounded-lg border px-3 py-2 ${box}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${label}`}>{obj[1]}</span>
          <p className="text-sm text-foreground">{ri(obj[2])}</p>
        </div>,
      )
      continue
    }

    const chk = line.match(CHECK_RE)
    if (chk) {
      const checked = chk[2].toLowerCase() === 'x'
      out.push(
        <button
          key={i}
          onClick={() => onToggle(i)}
          disabled={readOnly}
          title={readOnly ? 'En web es espejo: pídemelo por chat' : undefined}
          className={`group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left ${readOnly ? 'cursor-default' : 'hover:bg-card-hover'}`}
        >
          <span className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-400' : `border-border-subtle ${readOnly ? '' : 'group-hover:border-border-accent'}`}`}>
            {checked && <Check size={11} strokeWidth={3} />}
          </span>
          <span className={`text-sm ${checked ? 'text-muted line-through' : 'text-foreground'}`}>{ri(chk[3])}</span>
        </button>,
      )
      continue
    }

    const bul = line.match(BULLET_RE)
    if (bul) {
      out.push(
        <div key={i} className="flex items-start gap-2 px-2 py-1 text-sm text-muted">
          <span className="mt-1.5 size-1 flex-shrink-0 rounded-full bg-muted/60" />
          <span>{ri(bul[2])}</span>
        </div>,
      )
      continue
    }

    out.push(<p key={i} className="px-2 py-0.5 text-sm text-foreground/90">{ri(line)}</p>)
  }

  return <div>{out}</div>
}
