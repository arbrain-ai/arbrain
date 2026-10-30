'use client'
import { Loader2, Check, Circle } from 'lucide-react'
import type { TodoItem } from '../hooks/useChat'

// Mirrors the Claude Code CLI TODO panel: visible plan-by-phases checklist that
// updates live as Levy calls the TodoWrite tool. Pending = empty circle, in_progress
// = spinning loader, completed = check + strikethrough. We render the activeForm
// (e.g. "Reading files") while running and the content (e.g. "Read files") otherwise.
export function TodoListWidget({ todos }: { todos: TodoItem[] }) {
  if (!todos.length) return null

  const total = todos.length
  const done = todos.filter((t) => t.status === 'completed').length
  const running = todos.find((t) => t.status === 'in_progress')

  return (
    // aria-hidden: chrome del turno — iOS Speak Screen solo debe leer la respuesta
    <div aria-hidden className="my-2 rounded-xl border border-border-subtle bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle bg-card/40">
        <div className="w-1 h-1 rounded-full bg-brand animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted/80">
          Plan
        </span>
        <span className="text-[10px] text-muted/60 ml-auto font-mono">
          {done}/{total}
          {running && <span className="ml-2 text-muted">· {running.activeForm ?? running.content}</span>}
        </span>
      </div>
      <ul className="py-1">
        {todos.map((todo, i) => {
          const label = todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content
          return (
            <li
              key={`${i}-${todo.content.slice(0, 16)}`}
              className="flex items-start gap-2.5 px-3 py-1"
            >
              <span className="shrink-0 mt-0.5 w-3.5 h-3.5 flex items-center justify-center">
                {todo.status === 'completed' && (
                  <Check size={12} className="text-gold-dark dark:text-gold-bright" strokeWidth={2.5} />
                )}
                {todo.status === 'in_progress' && (
                  <Loader2 size={12} className="text-brand-ink animate-spin" />
                )}
                {todo.status === 'pending' && (
                  <Circle size={11} className="text-muted/40" strokeWidth={1.75} />
                )}
              </span>
              <span
                className={`text-[12px] leading-snug ${
                  todo.status === 'completed'
                    ? 'text-muted/50 line-through'
                    : todo.status === 'in_progress'
                      ? 'text-foreground/90 font-medium'
                      : 'text-foreground/70'
                }`}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
