'use client'
import { useState } from 'react'
import { Check, CircleHelp, Loader2, PenLine } from 'lucide-react'
import type { QuestionPrompt, UserQuestion } from '../hooks/useChat'

// AskUserQuestion interactivo (paridad Claude Code, adaptado a chat táctil):
// Levy pregunta con opciones → Daniel TOCA en vez de teclear. Una sola pregunta
// single-select responde al primer tap; multiSelect o varias preguntas
// acumulan selección y confirman con un botón. "Otra respuesta" abre input
// inline (el composer está bloqueado durante streaming — el card es el canal).

interface Props {
  prompt: QuestionPrompt
  onAnswer: (requestId: string, answers: Record<string, string> | null) => Promise<boolean>
}

function SelectedChips({ q, answer }: { q: UserQuestion; answer?: string }) {
  if (!answer) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {answer.split(', ').map((a) => (
        <span
          key={a}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-gold/10 border border-gold/25 text-gold-dark dark:text-gold-bright"
        >
          <Check size={10} className="shrink-0" />
          {a}
        </span>
      ))}
    </div>
  )
}

export function QuestionCard({ prompt, onAnswer }: Props) {
  const { requestId, questions, status } = prompt
  // Selección por pregunta (index → labels elegidas) + texto libre "Otro"
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({})
  const [otherText, setOtherText] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const pending = status === 'pending'
  const isSingle = questions.length === 1 && !questions[0]?.multiSelect

  const buildAnswers = (sel: Record<number, string[]>): Record<string, string> => {
    const answers: Record<string, string> = {}
    questions.forEach((q, i) => {
      const labels = sel[i] ?? []
      const other = otherText[i]?.trim()
      const all = other ? [...labels, other] : labels
      if (all.length > 0) answers[q.question] = all.join(', ')
    })
    return answers
  }

  const submit = async (sel: Record<number, string[]>) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const answers = buildAnswers(sel)
      await onAnswer(requestId, Object.keys(answers).length > 0 ? answers : null)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleOption = (qIdx: number, label: string, multi: boolean) => {
    if (!pending || submitting) return
    if (isSingle) {
      // Un tap = respuesta enviada (el caso común, cero fricción)
      void submit({ [qIdx]: [label] })
      return
    }
    setSelected((prev) => {
      const curr = prev[qIdx] ?? []
      const next = multi
        ? curr.includes(label) ? curr.filter((l) => l !== label) : [...curr, label]
        : [label]
      return { ...prev, [qIdx]: next }
    })
  }

  // Todas las preguntas tienen al menos una selección (u "otro" con texto)
  const allAnswered = questions.every((_, i) => (selected[i]?.length ?? 0) > 0 || !!otherText[i]?.trim())

  return (
    <div
      className={`my-2 rounded-xl border transition-colors duration-300 ${
        pending
          ? 'border-brand/30 bg-brand/[0.06]'
          : status === 'answered'
            ? 'border-gold/20 bg-gold/[0.04]'
            : 'border-border-subtle bg-card/50'
      }`}
    >
      {questions.map((q, qIdx) => {
        const answer = prompt.answers?.[q.question]
        return (
          <div key={qIdx} className={`px-3.5 py-3 ${qIdx > 0 ? 'border-t border-border-subtle' : ''}`}>
            <div className="flex items-start gap-2">
              <CircleHelp size={14} className={`mt-0.5 shrink-0 ${pending ? 'text-brand-ink' : 'text-muted/70'}`} />
              <div className="min-w-0 flex-1">
                {q.header && (
                  <span className="inline-block mb-1 px-2 py-px rounded-full bg-brand/15 border border-brand/25 text-[9px] font-semibold uppercase tracking-wider text-brand-ink">
                    {q.header}
                  </span>
                )}
                <p className="text-[13px] font-medium text-foreground leading-snug">{q.question}</p>
              </div>
            </div>

            {/* Opciones tocables — solo mientras está pendiente */}
            {pending && (
              <div className="mt-2.5 flex flex-col gap-1.5 pl-6">
                {q.options.map((opt) => {
                  const isSelected = (selected[qIdx] ?? []).includes(opt.label)
                  return (
                    <button
                      key={opt.label}
                      onClick={() => toggleOption(qIdx, opt.label, !!q.multiSelect)}
                      disabled={submitting}
                      className={`text-left px-3 py-2 rounded-lg border transition-all duration-150 active:scale-[0.99] disabled:opacity-50 ${
                        isSelected
                          ? 'border-brand/60 bg-brand/20'
                          : 'border-border bg-card hover:border-brand/40 hover:bg-brand/10'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {q.multiSelect && (
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand border-brand' : 'border-border-accent'}`}>
                            {isSelected && <Check size={9} className="text-white" />}
                          </span>
                        )}
                        <span className="text-[13px] text-foreground">{etiquetaVisible(opt.label)}</span>
                        {esRecomendada(opt.label) && (
                          <span data-testid="opcion-recomendada" className="ml-auto shrink-0 px-1.5 py-px rounded-full bg-brand/15 border border-brand/30 text-[9px] font-semibold uppercase tracking-wider text-brand-ink">Recomendada</span>
                        )}
                      </span>
                      {opt.description && (
                        <span className="block mt-0.5 text-[11px] text-muted/80 leading-snug">{opt.description}</span>
                      )}
                    </button>
                  )
                })}

                {/* "Otra respuesta" — input inline (el composer está ocupado por el stream) */}
                {!otherOpen[qIdx] ? (
                  <button
                    onClick={() => setOtherOpen((p) => ({ ...p, [qIdx]: true }))}
                    disabled={submitting}
                    className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-muted/80 hover:text-foreground border border-dashed border-border-accent hover:border-brand/40 transition-colors"
                  >
                    <PenLine size={11} />
                    Otra respuesta
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={otherText[qIdx] ?? ''}
                      onChange={(e) => setOtherText((p) => ({ ...p, [qIdx]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && isSingle && otherText[qIdx]?.trim()) void submit(selected)
                      }}
                      placeholder="Escribe tu respuesta…"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-card border border-border text-[13px] text-foreground placeholder:text-muted/50 outline-none focus:border-brand/40"
                    />
                    {isSingle && (
                      <button
                        onClick={() => otherText[qIdx]?.trim() && void submit(selected)}
                        disabled={submitting || !otherText[qIdx]?.trim()}
                        className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-medium bg-brand/20 border border-brand/40 text-brand-ink disabled:opacity-40 transition-colors"
                      >
                        Enviar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Respuesta elegida (estado final) */}
            {status === 'answered' && <div className="pl-6"><SelectedChips q={q} answer={answer} /></div>}
          </div>
        )
      })}

      {/* Footer: confirmar (multi) + saltar, o estado final */}
      {pending ? (
        <div className="flex items-center justify-between gap-2 px-3.5 pb-2.5 pl-9">
          <button
            onClick={() => void onAnswer(requestId, null)}
            disabled={submitting}
            className="text-[11px] text-muted/70 hover:text-muted transition-colors"
          >
            Saltar
          </button>
          {!isSingle && (
            <button
              onClick={() => void submit(selected)}
              disabled={submitting || !allAnswered}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold bg-brand/25 border border-brand/50 text-foreground hover:bg-brand/35 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Responder
            </button>
          )}
        </div>
      ) : status !== 'answered' ? (
        <p className="px-3.5 pb-2.5 pl-9 text-[10px] text-muted/60 italic">
          {status === 'skipped' ? 'Saltada — Levy continuó con su criterio.' : 'Expiró sin respuesta — Levy continuó con su criterio.'}
        </p>
      ) : null}
    </div>
  )
}

export function QuestionCards({ prompts, onAnswer }: { prompts: QuestionPrompt[]; onAnswer: Props['onAnswer'] }) {
  if (!prompts.length) return null
  return (
    <div className="flex flex-col">
      {prompts.map((p) => (
        <QuestionCard key={p.requestId} prompt={p} onAnswer={onAnswer} />
      ))}
    </div>
  )
}

// La opción recomendada llega como en Claude Code: «… (Recommended)» al final de la etiqueta. Se
// pinta como insignia; la etiqueta original viaja intacta en la respuesta para que el modelo la reconozca.
const RECOMENDADA = /\s*\((recommended|recomendad[ao])\)\s*$/i
export function esRecomendada(label: string): boolean { return RECOMENDADA.test(label) }
export function etiquetaVisible(label: string): string { return label.replace(RECOMENDADA, '') }
