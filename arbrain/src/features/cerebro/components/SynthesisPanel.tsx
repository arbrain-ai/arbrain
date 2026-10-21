'use client'
// Segundo Cerebro — modo síntesis: un slice del grafo (o una pregunta) se
// convierte en un artefacto accionable en un solo tiro. El grafo es el mapa;
// esto es el destino. Streaming SSE desde /api/cerebro/synthesize.
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  Copy,
  Download,
  History,
  Loader2,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import type { CerebroNode, SynthesisMode } from '../types'
import { SYNTHESIS_MODES, TYPE_META } from '../types'

interface ArtifactRecord {
  ts: number
  mode: SynthesisMode
  question: string
  nodeIds: string[]
  text: string
}

interface SynthesisPanelProps {
  nodesById: Map<string, CerebroNode>
  slice: string[]
  onRemoveFromSlice: (id: string) => void
  onClearSlice: () => void
  onClose: () => void
}

const HISTORY_KEY = 'cerebro-artifacts-v1' // gitleaks:allow (localStorage key, no secreto)

export function SynthesisPanel({
  nodesById,
  slice,
  onRemoveFromSlice,
  onClearSlice,
  onClose,
}: SynthesisPanelProps) {
  const [mode, setMode] = useState<SynthesisMode>('brief')
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [artifact, setArtifact] = useState('')
  const [usedNodes, setUsedNodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<ArtifactRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  // Cada run() incrementa este id; los callbacks del stream comprueban que
  // siguen siendo el run activo antes de escribir estado. Así, cargar un
  // artefacto del historial (o arrancar otro run) no queda pisado por los deltas
  // de un stream anterior que aún no terminó.
  const runIdRef = useRef(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch {
      /* */
    }
    return () => abortRef.current?.abort()
  }, [])

  const saveToHistory = (record: ArtifactRecord) => {
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, 10)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* quota */
      }
      return next
    })
  }

  const run = async () => {
    if (running) return
    if (slice.length === 0 && !question.trim()) {
      setError('Selecciona nodos en el grafo (shift+click) o escribe una pregunta.')
      return
    }
    setError(null)
    setArtifact('')
    setStatus('Armando el slice…')
    setRunning(true)
    const myRun = ++runIdRef.current
    const isStale = () => myRun !== runIdRef.current
    const ac = new AbortController()
    abortRef.current = ac
    let acc = ''
    // Nodos REALMENTE usados: cuando el slice va vacío el servidor auto-selecciona
    // y los devuelve en el evento 'meta'; el historial debe guardar esos, no slice.
    let effectiveNodeIds = slice
    try {
      const res = await fetch('/api/cerebro/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, nodeIds: slice, mode }),
        signal: ac.signal,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? `HTTP ${res.status}`)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          let evt: { type: string; text?: string; status?: string; message?: string; nodeIds?: string[] }
          try {
            evt = JSON.parse(payload)
          } catch {
            continue
          }
          if (isStale()) return // otro run/historial tomó el control: no pisar
          if (evt.type === 'meta' && evt.nodeIds) {
            effectiveNodeIds = evt.nodeIds
            setUsedNodes(evt.nodeIds)
            setStatus(`Sintetizando ${evt.nodeIds.length} nodos…`)
          } else if (evt.type === 'status' && evt.status) {
            setStatus(evt.status)
          } else if (evt.type === 'text_delta' && evt.text) {
            acc += evt.text
            setArtifact(acc)
            setStatus(null)
          } else if (evt.type === 'result' && evt.text) {
            acc = evt.text
            setArtifact(acc)
          } else if (evt.type === 'error') {
            throw new Error(evt.message ?? 'Error de síntesis')
          }
        }
      }
      if (isStale()) return
      if (acc.trim()) {
        saveToHistory({ ts: Date.now(), mode, question, nodeIds: effectiveNodeIds, text: acc })
      } else if (!ac.signal.aborted) {
        setError('La síntesis terminó sin texto. Reintenta.')
      }
    } catch (e) {
      if (!isStale() && !ac.signal.aborted) setError(String(e instanceof Error ? e.message : e))
    } finally {
      if (!isStale()) {
        setRunning(false)
        setStatus(null)
      }
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
    setStatus(null)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(artifact)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const isHtml = looksLikeHtml(artifact)
    const blob = new Blob([artifact], { type: isHtml ? 'text/html' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sintesis-${mode}-${new Date().toISOString().slice(0, 10)}.${isHtml ? 'html' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isHtmlArtifact = looksLikeHtml(artifact)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Sparkles className="size-4 text-gold" />
        <h2 className="flex-1 text-sm font-bold text-foreground">Síntesis</h2>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className={`icon-btn size-7 ${showHistory ? 'text-accent-purple' : ''}`}
          title="Historial de artefactos"
        >
          <History className="size-4" />
        </button>
        <button onClick={onClose} className="icon-btn size-7" title="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showHistory ? (
          <div className="px-4 py-3 space-y-1.5">
            {history.length === 0 && (
              <div className="py-6 text-center text-xs text-muted">Sin artefactos todavía.</div>
            )}
            {history.map((h) => (
              <button
                key={h.ts}
                onClick={() => {
                  // Invalidar y cortar cualquier run en vuelo antes de cargar el
                  // histórico, para que sus deltas no pisen el artefacto cargado.
                  runIdRef.current++
                  abortRef.current?.abort()
                  setRunning(false)
                  setStatus(null)
                  setArtifact(h.text)
                  setMode(h.mode)
                  setQuestion(h.question)
                  setUsedNodes(h.nodeIds)
                  setShowHistory(false)
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-left hover:border-primary/40 transition-colors"
              >
                <div className="text-[11px] font-semibold text-foreground">
                  {SYNTHESIS_MODES[h.mode].label}
                  <span className="ml-2 font-normal text-muted">
                    {new Date(h.ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted">
                  {h.question || `${h.nodeIds.length} nodos`}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-full flex-col px-4 py-3">
            {/* Modos */}
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(SYNTHESIS_MODES) as SynthesisMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={SYNTHESIS_MODES[m].hint}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    mode === m
                      ? 'border-gold/70 bg-gold/10 text-gold'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {SYNTHESIS_MODES[m].label}
                </button>
              ))}
            </div>

            {/* Pregunta */}
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Pregunta u objetivo (opcional si ya elegiste nodos): ej. «¿cómo relanzo la comunidad al volver a México?»"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:border-primary/50 focus:outline-none"
            />

            {/* Slice */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Slice · {slice.length} nodos {slice.length === 0 && '(auto por pregunta)'}
                </span>
                {slice.length > 0 && (
                  <button onClick={onClearSlice} className="text-[10px] text-muted hover:text-error">
                    limpiar
                  </button>
                )}
              </div>
              {slice.length > 0 && (
                <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {slice.map((id) => {
                    const n = nodesById.get(id)
                    const color = n ? TYPE_META[n.type].color : '#888'
                    return (
                      <span
                        key={id}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-foreground/85"
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="truncate">{n?.title ?? id}</span>
                        <button onClick={() => onRemoveFromSlice(id)} className="text-muted hover:text-error">
                          <X className="size-2.5" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Acción */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={running ? stop : run}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  running
                    ? 'bg-error/15 text-error hover:bg-error/25'
                    : 'bg-gold text-black hover:bg-gold-bright'
                }`}
              >
                {running ? (
                  <>
                    <Square className="size-3.5" /> Detener
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" /> Generar artefacto
                  </>
                )}
              </button>
            </div>

            {status && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                <Loader2 className="size-3.5 animate-spin text-gold" />
                {status}
              </div>
            )}
            {error && <div className="mt-2 text-[11px] text-error">{error}</div>}
            {usedNodes.length > 0 && !showHistory && (
              <div className="mt-2 text-[10px] text-muted">
                Fuentes: {usedNodes.map((id) => id.split('/').pop()?.replace('.md', '')).join(' · ')}
              </div>
            )}

            {/* Artefacto */}
            {artifact && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                    Artefacto
                  </span>
                  <div className="flex gap-1">
                    <button onClick={copy} className="icon-btn size-6" title="Copiar">
                      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                    </button>
                    <button onClick={download} className="icon-btn size-6" title="Descargar">
                      <Download className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div ref={outputRef} className="pt-2">
                  {isHtmlArtifact ? (
                    <iframe
                      sandbox=""
                      srcDoc={artifact}
                      className="h-[60vh] w-full rounded-lg border border-border bg-background"
                      title="Artefacto HTML"
                    />
                  ) : (
                    <div className="cerebro-md text-[12.5px] leading-relaxed text-foreground/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function looksLikeHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 200).toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}
