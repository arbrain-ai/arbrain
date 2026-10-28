'use client'
import { useState } from 'react'
import { Bot, Loader2, Check, Wrench, ChevronRight, X, AlertTriangle, Clock } from 'lucide-react'
import type { ToolCall, ToolOutput } from '../hooks/useChat'
import { ETIQUETA_ESTADO, type NotaInyectada } from '../lib/inyecciones'
import type { GrupoRastro, LlamadaRastro } from '../lib/rastro'
import { imagenLeida, localImageThumbUrl, localImageUrl } from '@/lib/local-image-path'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import h from './herramientas.module.css'
import { edicionDe } from '../lib/diff-edicion'
import { CuerpoDiff } from './DiffEdicion'

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

function getToolLabel(toolName: string): string {
  // Handle MCP tools like mcp__supabase__execute_sql
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join(' ')}` : toolName
  }
  return TOOL_LABELS[toolName] ?? toolName
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

/**
 * Imágenes que leyó Levy (26 oct 2026, «sutil, elegante, eficiente»). El resultado llega como «[imagen]» (el servidor
 * no manda base64 al chat): la imagen se pide por /api/local-image con la ruta del input. En la fila, una miniatura de
 * caja fija (no mueve el layout) y diferida; en el detalle, la imagen a ancho contenido con clic al visor. Si la imagen
 * ya no existe (un /tmp limpiado), la miniatura desaparece y el detalle vuelve al texto.
 */
const THUMB_ALTO = 28
function MiniaturaLeida({ ruta }: { ruta: string }) {
  const [falla, setFalla] = useState(false)
  if (falla) return null
  return (
    <img src={localImageThumbUrl(ruta, THUMB_ALTO * 3)} alt="" aria-hidden loading="lazy" decoding="async" draggable={false}
      width={THUMB_ALTO * 1.5} height={THUMB_ALTO} onError={() => setFalla(true)} className={h.miniatura} />
  )
}

/** Miniaturas de las llamadas de un renglón (máx. 3), solo de lecturas que no fallaron. */
function MiniaturasDe({ llamadas }: { llamadas: LlamadaRastro[] }) {
  const rutas = llamadas.filter(l => l.estado !== 'error').map(l => imagenLeida(l.tool.toolName, l.input)).filter((r): r is string => !!r)
  if (!rutas.length) return null
  return <span className={h.miniaturas}>{[...new Set(rutas)].slice(0, 3).map(r => <MiniaturaLeida key={r} ruta={r} />)}</span>
}

function ImagenLeida({ ruta, onFalla }: { ruta: string; onFalla: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const nombre = ruta.split('/').pop() ?? 'imagen'
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} title="Ver en grande" className={h.imagenLeida}>
        <img src={localImageUrl(ruta)} alt={nombre} loading="lazy" decoding="async" draggable={false} onError={onFalla} />
      </button>
      {abierta && <ImageLightbox src={localImageUrl(ruta, true)} alt={nombre} onClose={() => setAbierta(false)} />}
    </>
  )
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
  const [imagenFalla, setImagenFalla] = useState(false)
  const imagen = !failed && !imagenFalla && output?.content?.includes('[imagen]') ? imagenLeida(tool.toolName, input) : null
  const textoAparte = imagen ? output?.content?.replace(/\[imagen\]/g, '').trim() : null
  // Ver y deshacer (27 oct 2026): un Edit/Write/MultiEdit enseña qué cambió (diff legible); el input crudo queda a un clic.
  const edicion = edicionDe(tool, input, failed)
  const [crudo, setCrudo] = useState(false)

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 my-1 text-left animate-in fade-in duration-150">
      {/* Header: label amigable + nombre real + status + duración + cerrar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tool.status === 'running' ? (
          <Loader2 size={12} className="animate-spin shrink-0 text-foreground/70" />
        ) : failed ? (
          <AlertTriangle size={12} className="shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <Check size={12} className="shrink-0 text-gold-dark dark:text-gold-bright" />
        )}
        <span className="text-[12px] font-medium text-foreground/90">{getToolLabel(tool.toolName)}</span>
        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/[0.04] border border-black/10 text-slate-600 dark:bg-white/5 dark:border-border-subtle dark:text-muted break-all">
          {tool.toolName}
        </code>
        {kindLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-700 dark:text-amber-400/90">
            {kindLabel}
          </span>
        )}
        {output?.durationMs != null && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-muted/80">
            <Clock size={9} className="shrink-0" />
            {formatDuration(output.durationMs)}
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto shrink-0 p-1 rounded-md text-muted hover:text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {edicion && <div className="mt-2.5">
        <CuerpoDiff e={edicion} />
        {(fields || input) && <button type="button" onClick={() => setCrudo(c => !c)} aria-expanded={crudo}
          className="text-[11px] text-slate-500 dark:text-muted/70 hover:text-foreground/80 transition-colors">
          {crudo ? 'Ocultar el input crudo' : 'Ver el input crudo'}
        </button>}
      </div>}

      {/* Input */}
      {(fields || input) && (!edicion || crudo) && (
        <div className="mt-2.5">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-muted/60 mb-1">Input</p>
          {fields ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-lg bg-slate-50 border border-black/10 p-2 dark:bg-black/25 dark:border-border-subtle">
              {fields.map(([key, value]) => (
                <div key={key}>
                  <span className="text-[10px] font-mono text-primary dark:text-primary/80">{key}</span>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-slate-800 dark:text-foreground/80 leading-relaxed">{value}</pre>
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-slate-800 dark:text-foreground/80 leading-relaxed max-h-52 overflow-y-auto rounded-lg bg-slate-50 border border-black/10 p-2 dark:bg-black/25 dark:border-border-subtle">{input}</pre>
          )}
        </div>
      )}

      {/* Output */}
      <div className="mt-2.5">
        <p className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-muted/60 mb-1">
          Output{output?.isError ? ' · error' : ''}
        </p>
        {imagen ? (
          <>
            <ImagenLeida ruta={imagen} onFalla={() => setImagenFalla(true)} />
            {textoAparte && <pre className="mt-1.5 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto rounded-lg p-2 border bg-slate-50 border-black/10 text-slate-800 dark:bg-black/25 dark:border-border-subtle dark:text-foreground/80">{textoAparte}</pre>}
          </>
        ) : output?.content ? (
          <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto rounded-lg p-2 border ${
            output.isError
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-500/25 dark:text-red-300/90'
              : 'bg-slate-50 border-black/10 text-slate-800 dark:bg-black/25 dark:border-border-subtle dark:text-foreground/80'
          }`}>{output.content}</pre>
        ) : (
          <p className="text-[10px] text-slate-500 dark:text-muted/60 italic">
            {tool.status === 'running' ? 'Esperando output…' : 'Sin output capturado (turno previo a la actualización o tool sin salida).'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Herramientas del turno agrupadas por intención (25 oct 2026, «rastro plegado»): llamadas consecutivas del mismo
 * propósito son UN renglón en español («Revisó el calendario · 5 comandos ›») con el punto verde/gris/rojo y el
 * destello de siempre. Al abrir el grupo se listan sus llamadas; cada llamada abre su ToolDetailCard intacto.
 * Un grupo de una sola llamada abre el detalle directo. La lógica (agrupar, etiquetas) vive en lib/rastro.
 */
export function GruposHerramientas({ grupos, soloUno }: {
  grupos: GrupoRastro[]
  /** Rastro vivo plegado: solo el grupo en curso (o el último), sin el resto del muro. */
  soloUno?: boolean
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set())
  const [detalle, setDetalle] = useState<string | null>(null)
  if (!grupos.length) return null
  if (soloUno) {
    // Rastro vivo plegado: la línea viva ya dice la intención; aquí va la llamada en curso, concreta (su archivo o su
    // comando) con el destello. Entre herramientas (pensando), el último grupo en pasado da el contexto.
    const enCurso = grupos.find(g => g.estado === 'corriendo')
    const l = enCurso?.llamadas.find(x => x.estado === 'corriendo')
    if (!enCurso || !l) return <GruposHerramientas grupos={grupos.slice(-1)} />
    // Un agente en curso ya lo dicen la línea viva y la mención «N agentes trabajando ›»: sin renglón repetido.
    if (enCurso.agente) return null
    const abierta = detalle === l.tool.toolId
    return (
      <ul className={h.bandeja} data-herramientas>
        <li data-grupo={enCurso.clave}>
          <button type="button" onClick={() => setDetalle(abierta ? null : l.tool.toolId)} aria-expanded={abierta} data-estado="corriendo" className={h.paso}>
            {enCurso.agente ? <Bot className={h.icono} aria-label="Agente trabajando" /> : <span className={h.punto} aria-hidden />}
            <span className={h.accion}>{l.especifica ? l.etiqueta : l.unidad}</span>
            <MiniaturasDe llamadas={[l]} />
            {l.detalle && <span className={h.detalle}>{l.detalle}</span>}
          </button>
          {abierta && <ToolDetailCard tool={l.tool} input={l.input} output={l.output} onClose={() => setDetalle(null)} />}
        </li>
      </ul>
    )
  }
  const alternar = (id: string) => setAbiertos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <ul className={h.bandeja} data-herramientas>
      {grupos.map((g) => {
        const uno = g.llamadas.length === 1
        const abierto = uno ? detalle === g.llamadas[0].tool.toolId : abiertos.has(g.id)
        return (
          <li key={g.id} data-grupo={g.clave}>
            <button type="button" onClick={() => uno ? setDetalle(abierto ? null : g.llamadas[0].tool.toolId) : alternar(g.id)}
              aria-expanded={abierto} data-estado={g.estado} className={h.paso}>
              {g.agente
                ? <Bot className={h.icono} aria-label={g.estado === 'corriendo' ? 'Agente trabajando' : 'Agente'} />
                : <span className={h.punto} aria-hidden />}
              <span className={`${h.accion} ${h.accionLarga}`}>{g.etiqueta}</span>
              <MiniaturasDe llamadas={g.llamadas} />
              {g.cuenta
                ? <span className={h.cuenta}>· {g.cuenta}</span>
                : g.llamadas[0].detalle && <span className={h.detalle}>{g.llamadas[0].detalle}</span>}
              {g.estado === 'error' && <AlertTriangle className={h.icono} data-falla aria-label="Falló" />}
              {!uno && <ChevronRight aria-hidden className={`${h.icono} ${h.flecha}`} />}
            </button>
            {uno && abierto && <ToolDetailCard tool={g.llamadas[0].tool} input={g.llamadas[0].input} output={g.llamadas[0].output} onClose={() => setDetalle(null)} />}
            {!uno && abierto && (
              <ul className={h.llamadas}>
                {g.llamadas.map((l) => {
                  const abiertaLlamada = detalle === l.tool.toolId
                  return (
                    <li key={l.tool.toolId}>
                      <button type="button" onClick={() => setDetalle(abiertaLlamada ? null : l.tool.toolId)} aria-expanded={abiertaLlamada}
                        data-estado={l.estado} className={`${h.paso} ${h.pasoLlamada}`}>
                        <span className={h.punto} aria-hidden />
                        {/* Dentro del grupo la intención ya está dicha: cada llamada dice qué es o lo suyo propio. */}
                        <span className={h.accion}>{l.especifica ? l.etiqueta : l.unidad}</span>
                        <MiniaturasDe llamadas={[l]} />
                        {l.detalle && <span className={h.detalle}>{l.detalle}</span>}
                        {l.estado === 'error' && <AlertTriangle className={h.icono} data-falla aria-label="Falló" />}
                      </button>
                      {abiertaLlamada && <ToolDetailCard tool={l.tool} input={l.input} output={l.output} onClose={() => setDetalle(null)} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Lo que Daniel escribió con el turno vivo, en orden y fuera del rastro plegado: es conversación, no auditoría. */
export function NotasInyectadas({ notas }: { notas?: NotaInyectada[] }) {
  if (!notas?.length) return null
  return <div className="flex flex-col">{notas.map(nota => <NotaInyectadaChip key={nota.id} nota={nota} />)}</div>
}

export function StreamingIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted/60">
      <Wrench size={10} className="animate-pulse" />
      Procesando...
    </span>
  )
}
