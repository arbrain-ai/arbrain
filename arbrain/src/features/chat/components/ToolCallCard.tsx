'use client'
import { useState } from 'react'
import { Bot, Loader2, Check, Wrench, ChevronDown, ChevronUp, X, AlertTriangle, Clock } from 'lucide-react'
import type { ToolCall, ToolOutput } from '../hooks/useChat'
import { ETIQUETA_ESTADO, ubicarNotas, type NotaInyectada } from '../lib/inyecciones'

const TOOL_LABELS: Record<string, string> = {
  Read: 'Leyendo archivo',
  Write: 'Escribiendo archivo',
  Edit: 'Editando archivo',
  Bash: 'Ejecutando comando',
  Glob: 'Buscando archivos',
  Grep: 'Buscando en codigo',
  WebSearch: 'Buscando en web',
  WebFetch: 'Cargando pagina',
  Agent: 'Delegando a subagente',
  Skill: 'Ejecutando skill',
  TodoWrite: 'Actualizando TODOs',
}

/** Herramientas de la Cabina que mueven subagentes del motor: delegar, retomar, cerrar (y Agent nativo). */
const esDeAgente = (toolName: string) => /^mcp__cabina__(delegar|retomar|cerrar)$/.test(toolName) || toolName === 'Agent'

function getToolLabel(toolName: string): string {
  // Handle MCP tools like mcp__supabase__execute_sql
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join(' ')}` : toolName
  }
  return TOOL_LABELS[toolName] ?? toolName
}

// Parse partial JSON defensively. The model emits incremental JSON via input_json_delta
// so by the time we want to render a preview, the JSON is almost always incomplete
// (e.g. `{"command": "npm inst`). We try to extract the most useful field for each tool.
function previewToolInput(toolName: string, partial: string | undefined): string | null {
  if (!partial) return null
  // Try parse as-is first (sometimes the model emits closing braces fast enough)
  let obj: Record<string, unknown> | null = null
  try { obj = JSON.parse(partial) } catch { /* ignore */ }

  // Heuristic: extract first string-quoted value for the field we care about
  const extractField = (field: string): string | null => {
    // Match: "field": "value-so-far  (handles unclosed quote)
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]*)`, 's')
    const m = partial.match(re)
    return m?.[1] ?? null
  }

  const trim = (s: string, max: number) => s.length > max ? s.slice(0, max) + '…' : s

  if (toolName === 'Bash') {
    const cmd = (obj?.command as string | undefined) ?? extractField('command')
    return cmd ? trim(cmd, 80) : null
  }
  if (toolName === 'Read') {
    const fp = (obj?.file_path as string | undefined) ?? extractField('file_path')
    return fp ? fp.split('/').slice(-2).join('/') : null
  }
  if (toolName === 'Write' || toolName === 'Edit') {
    const fp = (obj?.file_path as string | undefined) ?? extractField('file_path')
    return fp ? fp.split('/').slice(-2).join('/') : null
  }
  if (toolName === 'Grep') {
    const pat = (obj?.pattern as string | undefined) ?? extractField('pattern')
    return pat ? trim(pat, 60) : null
  }
  if (toolName === 'Glob') {
    const pat = (obj?.pattern as string | undefined) ?? extractField('pattern')
    return pat ? trim(pat, 60) : null
  }
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    const q = (obj?.url as string | undefined) ?? (obj?.query as string | undefined)
      ?? extractField('url') ?? extractField('query')
    return q ? trim(q, 60) : null
  }
  if (toolName.startsWith('mcp__')) {
    // Generic: first string field we find
    const firstStringMatch = partial.match(/"([^"]+)"\s*:\s*"([^"]{1,80})/)
    return firstStringMatch ? trim(firstStringMatch[2], 60) : null
  }
  return null
}

// "850ms" · "3.2s" · "1m 12s"
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

// Clasificación del SDK cuando la tool NO se ejecutó (tool_result_meta 0.3.216+)
const KIND_LABELS: Record<string, string> = {
  denied: 'denegada',
  interrupted: 'interrumpida',
  cancelled: 'cancelada',
}

// Input parseado a campos legibles. El input llega como JSON (a veces parcial):
// si parsea, se muestra campo por campo (mucho más legible en móvil que un blob
// JSON); si no (delta incompleto), se enseña el texto crudo tal cual.
function parseInputFields(partial: string | undefined): Array<[string, string]> | null {
  if (!partial) return null
  try {
    const obj = JSON.parse(partial) as Record<string, unknown>
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    return Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? v : JSON.stringify(v, null, 2),
    ])
  } catch {
    return null
  }
}

interface Props {
  tools: ToolCall[]
  inputs?: Record<string, string>
  outputs?: Record<string, ToolOutput>
  /** Lo que Daniel escribió con el turno vivo (7 oct 2026): va entre las pills, tras la herramienta en curso. */
  notas?: NotaInyectada[]
}

/** Mensaje de Daniel dentro de la actividad del turno, con su estado: enviando… / entrando… / leído. */
function NotaInyectadaChip({ nota }: { nota: NotaInyectada }) {
  const leido = nota.estado === 'leido'
  return (
    // Ocupa su propia línea (w-full) dentro del flex-wrap de las pills: se lee como un mensaje, no como herramienta.
    <span className="w-full flex justify-end my-0.5" data-nota-inyectada={nota.id}>
      <span className="max-w-[85%] inline-flex flex-col items-end gap-0.5 px-2.5 py-1 rounded-xl rounded-br-sm bg-primary/10 border border-primary/25 text-[12px] text-foreground/90">
        <span className="whitespace-pre-wrap break-words text-left">{nota.texto}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] ${leido ? 'text-muted' : 'text-muted/80'}`}>
          {leido ? <Check size={10} className="shrink-0" /> : <Loader2 size={10} className="animate-spin shrink-0" />}
          {ETIQUETA_ESTADO[nota.estado]}
        </span>
      </span>
    </span>
  )
}

// Detalle expandido de UNA tool: nombre real + input completo + output real.
// Nace del dolor de móvil: "no alcanzo a leer ni madres de lo que ejecuto".
function ToolDetailCard({ tool, input, output, onClose }: {
  tool: ToolCall
  input?: string
  output?: ToolOutput
  onClose: () => void
}) {
  const fields = parseInputFields(input)
  const kindLabel = output?.kind ? (KIND_LABELS[output.kind] ?? output.kind) : null
  const failed = output?.isError || !!kindLabel

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 my-1 text-left animate-in fade-in duration-150">
      {/* Header: label amigable + nombre real + status + duración + cerrar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tool.status === 'running' ? (
          <Loader2 size={12} className="animate-spin shrink-0 text-foreground/70" />
        ) : failed ? (
          <AlertTriangle size={12} className="shrink-0 text-red-400" />
        ) : (
          <Check size={12} className="shrink-0 text-gold-dark dark:text-gold-bright" />
        )}
        <span className="text-[12px] font-medium text-foreground/90">{getToolLabel(tool.toolName)}</span>
        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle text-muted break-all">
          {tool.toolName}
        </code>
        {kindLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400/90">
            {kindLabel}
          </span>
        )}
        {output?.durationMs != null && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted/80">
            <Clock size={9} className="shrink-0" />
            {formatDuration(output.durationMs)}
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto shrink-0 p-1 rounded-md text-muted hover:text-foreground/80 hover:bg-white/5 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Input */}
      {(fields || input) && (
        <div className="mt-2.5">
          <p className="text-[9px] uppercase tracking-wider text-muted/60 mb-1">Input</p>
          {fields ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-lg bg-black/25 border border-border-subtle p-2">
              {fields.map(([key, value]) => (
                <div key={key}>
                  <span className="text-[10px] font-mono text-primary/80">{key}</span>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-foreground/80 leading-relaxed">{value}</pre>
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-foreground/80 leading-relaxed max-h-52 overflow-y-auto rounded-lg bg-black/25 border border-border-subtle p-2">{input}</pre>
          )}
        </div>
      )}

      {/* Output */}
      <div className="mt-2.5">
        <p className="text-[9px] uppercase tracking-wider text-muted/60 mb-1">
          Output{output?.isError ? ' · error' : ''}
        </p>
        {output?.content ? (
          <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto rounded-lg p-2 border ${
            output.isError
              ? 'bg-red-950/20 border-red-500/25 text-red-300/90'
              : 'bg-black/25 border-border-subtle text-foreground/80'
          }`}>{output.content}</pre>
        ) : (
          <p className="text-[10px] text-muted/60 italic">
            {tool.status === 'running' ? 'Esperando output…' : 'Sin output capturado (turno previo a la actualización o tool sin salida).'}
          </p>
        )}
      </div>
    </div>
  )
}

// Turnos pesados (research con 8-10 tools) colapsan las pills terminadas en un
// chip "N herramientas" expandible — las que CORREN siguen visibles (feedback
// vivo), y la respuesta no queda empujada por un muro de pills.
const COLLAPSE_AT = 6

export function ToolCallCards({ tools, inputs, outputs, notas }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Detalle abierto (una tool a la vez). Tocar la pill lo abre/cierra.
  const [openToolId, setOpenToolId] = useState<string | null>(null)
  if (!tools.length && !notas?.length) return null

  const shouldCollapse = tools.length > COLLAPSE_AT && !expanded
  const visible = shouldCollapse ? tools.filter((t) => t.status === 'running') : tools
  const hiddenCount = tools.length - visible.length
  const { tras, alFinal } = ubicarNotas(notas, visible.map(t => t.toolId))

  return (
    // aria-hidden: chrome del turno — iOS Speak Screen solo debe leer la respuesta
    <div aria-hidden className="flex flex-wrap gap-1.5 my-1.5">
      {shouldCollapse && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-card border border-border-subtle text-muted hover:text-foreground/75 hover:border-border transition-colors"
          aria-expanded={false}
        >
          <Check size={10} className="shrink-0" />
          {hiddenCount} herramientas
          <ChevronDown size={10} className="shrink-0" />
        </button>
      )}
      {visible.map((tool) => {
        const preview = previewToolInput(tool.toolName, inputs?.[tool.toolId])
        const isOpen = openToolId === tool.toolId
        const failed = outputs?.[tool.toolId]?.isError
        return (
          // Fragment con key: la card de detalle (w-full) rompe a su propia línea
          // justo debajo de la pill tocada — el flex-wrap hace el resto.
          <span key={tool.toolId} className="contents">
            <button
              onClick={() => setOpenToolId(isOpen ? null : tool.toolId)}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-300 max-w-full cursor-pointer active:scale-[0.97]
                ${isOpen
                  ? 'bg-card border border-primary/50 text-foreground/90'
                  : tool.status === 'running'
                    ? 'bg-card border border-border text-foreground/75'
                    : 'bg-card border border-border-subtle text-muted hover:text-foreground/75 hover:border-border'
                }`}
            >
              {tool.status === 'running' && esDeAgente(tool.toolName) ? (
                <Bot size={11} className="animate-pulse shrink-0" aria-label="Agente trabajando" />
              ) : tool.status === 'running' ? (
                <Loader2 size={10} className="animate-spin shrink-0" />
              ) : failed ? (
                <AlertTriangle size={10} className="shrink-0 text-red-400/90" />
              ) : esDeAgente(tool.toolName) ? (
                <Bot size={11} className="shrink-0" aria-label="Agente" />
              ) : (
                <Check size={10} className="shrink-0" />
              )}
              <span className="truncate">
                {getToolLabel(tool.toolName)}
                {preview && <span className="text-muted/80 font-mono ml-1.5">{preview}</span>}
              </span>
            </button>
            {isOpen && (
              <ToolDetailCard
                tool={tool}
                input={inputs?.[tool.toolId]}
                output={outputs?.[tool.toolId]}
                onClose={() => setOpenToolId(null)}
              />
            )}
            {tras.get(tool.toolId)?.map(nota => <NotaInyectadaChip key={nota.id} nota={nota} />)}
          </span>
        )
      })}
      {alFinal.map(nota => <NotaInyectadaChip key={nota.id} nota={nota} />)}
      {expanded && tools.length > COLLAPSE_AT && (
        <button
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-muted/70 hover:text-muted transition-colors"
          aria-expanded={true}
        >
          <ChevronUp size={10} className="shrink-0" />
          ocultar
        </button>
      )}
    </div>
  )
}

export function StreamingIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted/60">
      <Wrench size={10} className="animate-pulse" />
      Procesando...
    </span>
  )
}
