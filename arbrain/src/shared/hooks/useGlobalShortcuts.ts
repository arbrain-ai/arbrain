'use client'
import { useEffect, useCallback, useMemo } from 'react'
import { AREA_SHORTCUTS } from '@/shared/navigation/area-shortcuts'
import { useAuth } from '@/hooks/useAuth'
import { canAccessRoute } from '@/lib/permissions'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTasksStore } from '@/shared/stores/tasks-store'
import { vistaDeRuta } from '@/features/cabina/panel/pantalla-completa'
import { verEnPantallaCompleta } from '@/features/cabina/panel/PantallaCompleta'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useAlternarBarras } from '@/shared/hooks/useAlternarBarras'
import { alternarDesprendido, mostrarPanel } from '@/features/cabina/panel/ventanas'
import { clavesDe, usePanelFijadas } from '@/features/cabina/panel/fijadas'
import { todasFuera } from '@/features/cabina/panel/pestanas-fuera'
import { notifyTaskAssigned } from '@/lib/notifications'
import { useTerminalPanel } from '@/shared/stores/terminal-panel-store'
import { useAjustes } from '@/shared/stores/ajustes-store'
import type { TaskStatus, TaskPriority, TaskWithAssignees } from '@/types/database'

const STATUS_CYCLE: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done']

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}

interface UseGlobalShortcutsOptions {
  onCreateTask: () => void
  onShowHelp: () => void
}

export function useGlobalShortcuts({ onCreateTask, onShowHelp }: UseGlobalShortcutsOptions) {
  const router = useRouter()
  const { role } = useAuth()
  const isMobile = useIsMobile()
  const pathname = usePathname()

  const tasks = useTasksStore((s) => s.tasks)
  const focusedTaskId = useTasksStore((s) => s.focusedTaskId)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const focusTask = useTasksStore((s) => s.focusTask)
  const focusNextTask = useTasksStore((s) => s.focusNextTask)
  const focusPrevTask = useTasksStore((s) => s.focusPrevTask)
  const updateTask = useTasksStore((s) => s.updateTask)
  const showArchived = useTasksStore((s) => s.showArchived)
  // ⌘⇧B, `[` y ⌘⌃H: en escritorio esconden/muestran las dos barras; en el teléfono, el cajón de secciones.
  const toggleLeftSidebar = useAlternarBarras()

  // Build flat list of visible task IDs (column by column, top to bottom)
  const visibleTaskIds = useMemo(() => {
    const statuses: TaskStatus[] = showArchived
      ? [...STATUS_CYCLE, 'archived']
      : STATUS_CYCLE
    const ids: string[] = []
    for (const status of statuses) {
      const columnTasks = tasks
        .filter((t) => t.status === status)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      for (const t of columnTasks) {
        ids.push(t.id)
      }
    }
    return ids
  }, [tasks, showArchived])

  const getFocusedTask = useCallback((): TaskWithAssignees | null => {
    if (!focusedTaskId) return null
    return tasks.find((t) => t.id === focusedTaskId) ?? null
  }, [focusedTaskId, tasks])

  const updateTaskInDb = useCallback(async (taskId: string, updates: Record<string, unknown>) => {
    const supabase = createClient()
    await supabase.from('tasks').update(updates).eq('id', taskId)
  }, [])

  // S — cycle status on focused task
  const cycleStatus = useCallback(() => {
    const task = getFocusedTask()
    if (!task) return
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    updateTask(task.id, { status: next })
    updateTaskInDb(task.id, { status: next })
  }, [getFocusedTask, updateTask, updateTaskInDb])

  // P — cycle priority on focused task (0→1→2→3→4→0)
  const cyclePriority = useCallback(() => {
    const task = getFocusedTask()
    if (!task) return
    const current = task.priority ?? 0
    const next = ((current + 1) % 5) as TaskPriority
    updateTask(task.id, { priority: next })
    updateTaskInDb(task.id, { priority: next })
  }, [getFocusedTask, updateTask, updateTaskInDb])

  // A — cycle assignee on focused task (rotate through team members)
  const cycleAssignee = useCallback(async () => {
    const task = getFocusedTask()
    if (!task) return
    const supabase = createClient()
    const { data: profiles } = await supabase.from('profiles').select('*').order('full_name')
    if (!profiles || profiles.length === 0) return

    const currentAssigneeId = task.assignees[0]?.id ?? null
    const currentIdx = currentAssigneeId ? profiles.findIndex((p) => p.id === currentAssigneeId) : -1
    const nextIdx = (currentIdx + 1) % profiles.length
    const nextProfile = profiles[nextIdx]

    // Remove old assignees and add new one
    await supabase.from('task_assignees').delete().eq('task_id', task.id)
    await supabase.from('task_assignees').insert({ task_id: task.id, profile_id: nextProfile.id })
    updateTask(task.id, { assignees: [nextProfile] })
    notifyTaskAssigned(nextProfile.id, task.title, task.id)
  }, [getFocusedTask, updateTask])

  // X — mark focused task as done
  const markDone = useCallback(() => {
    const task = getFocusedTask()
    if (!task) return
    const newStatus = task.status === 'done' ? 'backlog' : 'done'
    updateTask(task.id, { status: newStatus as TaskStatus })
    updateTaskInDb(task.id, { status: newStatus })
  }, [getFocusedTask, updateTask, updateTaskInDb])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) {
        const key = e.code.match(/^(?:Digit|Numpad)([1-7])$/)?.[1]
        const area = AREA_SHORTCUTS.find(a => a.key === key)
        if (area) {
          e.preventDefault()
          if (!e.repeat && canAccessRoute(area.href, role)) {
            selectTask(null)
            useAjustes.getState().cerrar()
            useLayoutStore.getState().closeLibrary()
            if (isMobile) useLayoutStore.getState().closeConversationsDrawer()
            // Escritorio (5 oct 2026): la sección a pantalla completa sobre el chat, que sigue montado (Esc vuelve,
            // ⌘J trae a Levy). El Chat y lo que no tiene pestaña siguen siendo rutas.
            const vista = isMobile ? null : vistaDeRuta(area.href)
            if (vista) verEnPantallaCompleta(vista)
            else { if (area.href === '/chat') useLayoutStore.getState().setEnfoquePanel(false); router.push(area.href) }
          }
          return
        }
      }

      // ⌘J (2 oct 2026, Daniel): abre y cierra la terminal inferior (a pantalla completa trae a Levy: PantallaCompleta lo atiende antes), como en SFTerm y VS Code. Solo con ⌘ (Ctrl+J
      // es el salto de línea de la terminal) y también con el foco dentro de la propia terminal.
      if (e.code === 'KeyJ' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !isMobile) {
        e.preventDefault()
        if (!e.repeat) useTerminalPanel.getState().alternar()
        return
      }
      // Diseño v2 del panel derecho (1 oct, Daniel): ⌘B abre y cierra el panel de
      // tareas; la barra izquierda pasa a ⌘⇧B. ⌘⌥B saca la pestaña activa a su propia ventana (segunda
      // pantalla) o, si ya no queda ninguna en la columna, las devuelve; con todas fuera, ⌘B trae sus ventanas al frente.
      if (e.code === 'KeyB' && e.metaKey && !e.ctrlKey && e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (!e.repeat) alternarDesprendido()
        return
      }
      if (e.code === 'KeyB' && e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (!e.repeat) {
          if (e.shiftKey) toggleLeftSidebar()
          else if (todasFuera(clavesDe(usePanelFijadas.getState()), Object.keys(usePanelFijadas.getState().enVentana))) mostrarPanel()
          else useLayoutStore.getState().togglePanelDerecho()
        }
        return
      }
      // ⌘, (6 oct 2026): abre y cierra Ajustes, la ventana flotante, desde cualquier lugar y también escribiendo (como en Claude y en macOS).
      if (e.code === 'Comma' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        if (!e.repeat && canAccessRoute('/settings', role)) useAjustes.getState().alternar()
        return
      }
      // Con Ajustes abierta las letras sueltas (J, K, C, X…) no son del Board que hay debajo.
      if (useAjustes.getState().abierto) return
      // Never intercept when a modal/detail panel has focus on inputs
      if (isInputFocused()) return
      // Personal task/habit surfaces own their keys. Old Board commands must
      // never mutate a previously focused team task from Hoy or Todotask.
      // El lienzo también: sus letras son herramientas (C no puede mandar al chat a media pizarra).
      if (pathname === '/lienzo') return
      // Tareas (Todoist) y los hábitos del Día tienen su propio teclado (J/K, X, T, M, números): el tablero viejo no los toca.
      if ((e.target as Element | null)?.closest?.('[data-todoist], [data-habitos]')) return
      // Don't intercept when any modal is open (TaskDetail, CreateTask)
      if (selectedTaskId) {
        // Only Escape works when detail panel is open
        if (e.key === 'Escape') {
          e.preventDefault()
          selectTask(null)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault()
          focusNextTask(visibleTaskIds)
          break
        case 'k':
          e.preventDefault()
          focusPrevTask(visibleTaskIds)
          break
        case 'enter':
          if (focusedTaskId) {
            e.preventDefault()
            selectTask(focusedTaskId)
          }
          break
        case 'escape':
          // Solo es suyo si había una tarea enfocada (5 oct 2026): marcar todo Esc como atendido dejaba sin Esc a
          // pantalla completa, que respeta lo que otro ya atendió.
          if (focusedTaskId) {
            e.preventDefault()
            focusTask(null)
          }
          break
        case 'c':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            onCreateTask()
          }
          break
        case 's':
          if (!e.metaKey && !e.ctrlKey && focusedTaskId) {
            e.preventDefault()
            cycleStatus()
          }
          break
        case 'p':
          if (!e.metaKey && !e.ctrlKey && focusedTaskId) {
            e.preventDefault()
            cyclePriority()
          }
          break
        case 'a':
          if (!e.metaKey && !e.ctrlKey && focusedTaskId) {
            e.preventDefault()
            cycleAssignee()
          }
          break
        case 'x':
          if (!e.metaKey && !e.ctrlKey && focusedTaskId) {
            e.preventDefault()
            markDone()
          }
          break
        case '[':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            toggleLeftSidebar()
          }
          break
        case 'h':
          // Cmd+Ctrl+H — hide/show sidebar (Miro-style global toggle)
          if (e.metaKey && e.ctrlKey) {
            e.preventDefault()
            toggleLeftSidebar()
          }
          break
        case '?':
          e.preventDefault()
          onShowHelp()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    visibleTaskIds, focusedTaskId, selectedTaskId, pathname, role, isMobile,
    focusNextTask, focusPrevTask, selectTask, focusTask,
    onCreateTask, onShowHelp, cycleStatus, cyclePriority,
    cycleAssignee, markDone, toggleLeftSidebar, router,
  ])
}
