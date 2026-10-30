'use client'
import { useRef, useState, useId, useCallback, useEffect, memo, isValidElement, createContext, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark-dimmed.css'
import './hljs-override.css'
import { Copy, Check, ZoomIn, WrapText, ChevronDown } from 'lucide-react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { MermaidDiagram } from './MermaidDiagram'
import { HtmlPreview } from './HtmlPreview'
// Lightbox extraído a shared (13 jul 2026) para reutilizarlo desde draw3.
// Se re-exporta para no romper a los consumidores existentes (ChatPanel).
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { localImagePath, localImageUrl } from '@/lib/local-image-path'
import { urlPublicaDeStorage } from '../lib/adjuntos'
import { ImagenRapida, useMetaImagen } from '@/shared/components/ImagenRapida'
import { esStorageOptimizable } from '@/lib/imagenes/variantes'
import { esEdicionCliente } from '@/lib/edicion'
import { imagenRemotaBloqueada } from '../lib/imagen-remota'
import { useEsperaExplicada } from '../lib/espera-explicada'
export { ImageLightbox }

// ─── Contexto: ¿este mensaje sigue streameando? ──────────────────────────────
// Los bloques especiales (```html) lo leen para NO montar el iframe con
// contenido parcial: cada update de srcdoc REMONTA el iframe → flash blanco →
// "renderizando" en bucle durante todo el turno (bug 20 jul 2026). Contexto en
// vez de prop en `components` porque un componente inline nuevo por render
// haría que react-markdown desmonte/remonte TODOS los code blocks.
const MsgStreamingContext = createContext(false)
// true solo en el cuerpo de una respuesta del chat: ahí tablas, código, diagramas
// y HTML vivo salen de la prosa al carril ancho (globals.css · .chat-wide). Dentro
// de tarjetas (vista reporte, tools, Consejo) se quedan en su caja.
const MsgAnchoContext = createContext(false)

function Carril({ children }: { children: ReactNode }) {
  return useContext(MsgAnchoContext) ? <div className="chat-wide">{children}</div> : <>{children}</>
}

function TablaMd({ children }: { children?: ReactNode }) {
  const ancho = useContext(MsgAnchoContext)
  const caja = (
    <div className={`overflow-x-auto rounded-xl border border-border ${ancho ? 'chat-fit' : 'my-3'}`}>
      <table className="min-w-full text-xs">{children}</table>
    </div>
  )
  return ancho ? <div className="chat-wide my-3">{caja}</div> : caja
}

// ─── Code block with copy button ─────────────────────────────────────────────

// Extrae el texto crudo del árbol de `children`. rehype-highlight tokeniza los
// lenguajes que reconoce (html, js, …) en un árbol de <span> de colores, así que
// `children` deja de ser un string y String(children) devuelve "[object Object],…".
// Para mermaid funcionaba de churro: highlight.js NO conoce "mermaid" y dejaba el
// texto plano. Esto camina el árbol y reconstruye el código real, tenga highlight
// o no. (bug render ```html → [object Object], 20 jul 2026)
function childrenToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childrenToText).join('')
  if (isValidElement(node)) {
    return childrenToText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function CodeBlock({ className, children }: ComponentPropsWithoutRef<'code'>) {
  const streaming = useContext(MsgStreamingContext)
  const ancho = useContext(MsgAnchoContext)
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  // Wrap por default (móvil-first: sin scroll horizontal anidado dentro del
  // scroll del chat). Toggle a scroll para código donde la indentación importa.
  const [wrap, setWrap] = useState(true)

  // Detección robusta de bloque vs inline. rehype-highlight NO siempre agrega
  // clase (fence sin lenguaje o sin auto-detect) — sin esto, un ``` pegado como
  // el bloque /goal caía al render inline SIN header/copiar/scroll (bug 7 jul).
  // Un salto de línea en el contenido = es un bloque, tenga clase o no.
  const raw = childrenToText(children)
  const isBlock = /language-|hljs/.test(className ?? '') || raw.includes('\n')

  if (!isBlock) {
    return (
      <code className="bg-card-active border border-border px-1.5 py-0.5 rounded text-[0.8em] font-mono text-foreground/85 break-all">
        {children}
      </code>
    )
  }

  if (/language-mermaid/.test(className ?? '')) {
    const code = childrenToText(children).replace(/\n$/, '')
    return <Carril><MermaidDiagram code={code} /></Carril>
  }

  // ```html → render EN VIVO (iframe sandbox) con toggle a código. Así Levy
  // muestra mecanismos interactivos dentro de la conversación (móvil incluido)
  // en vez de pegar código muerto. Hermano de MermaidDiagram.
  // Durante el STREAMING cae al code block normal (se ve el código creciendo,
  // patrón Claude web) y el iframe se monta UNA vez al completar el turno.
  if (!streaming && /language-html\b/.test(className ?? '')) {
    const code = childrenToText(children).replace(/\n$/, '')
    return <Carril><HtmlPreview code={code} /></Carril>
  }

  const language = (className ?? '').replace(/language-|hljs/g, '').trim()

  const handleCopy = () => {
    const text = preRef.current?.innerText ?? ''
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bloque = (
    <div className={`rounded-xl overflow-hidden border border-border bg-card ${ancho ? 'chat-fit' : 'my-3'}`}>
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border-subtle">
        <span className="text-[10px] font-mono text-muted/80 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWrap((w) => !w)}
            className={`flex items-center gap-1 text-[10px] transition-colors ${wrap ? 'text-muted/80 hover:text-foreground/75' : 'text-brand-ink'}`}
            aria-pressed={!wrap}
            title={wrap ? 'Desactivar ajuste de línea' : 'Ajustar líneas'}
          >
            <WrapText size={11} />
            <span>{wrap ? 'Wrap' : 'Scroll'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted/80 hover:text-foreground/75 transition-colors"
          >
            {copied ? (
              <>
                <Check size={11} className="text-gold-dark dark:text-gold-bright" />
                <span className="text-gold-dark dark:text-gold-bright">Copiado</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre ref={preRef} className={`px-4 py-3 text-xs leading-relaxed ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
  return ancho ? <div className="chat-wide my-3">{bloque}</div> : bloque
}

// ─── Inline image with lightbox ──────────────────────────────────────────────

const EDICION_CLIENTE = esEdicionCliente()

/**
 * Imagen remota en la edición cliente (red team 3, A-5): no se pide sola. Se muestra de dónde viene y un enlace que
 * solo se abre con tu clic, como cualquier otro enlace del chat. La CSP del cliente la bloquearía de todos modos.
 */
function ImagenRemotaBloqueada({ src, dominio, alt }: { src: string; dominio: string; alt?: string }) {
  return (
    <span className="my-2 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-border-subtle bg-card/60 px-3 py-2 text-xs text-muted">
      <ZoomIn size={12} aria-hidden />
      <span>{alt ? `«${alt}»: imagen` : 'Imagen'} de <strong className="font-medium text-foreground/80">{dominio}</strong> sin cargar. Arbrain no carga imágenes de internet por su cuenta.</span>
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-brand-ink underline underline-offset-2 hover:opacity-80">Abrir en el navegador</a>
    </span>
  )
}

const ChatImage = memo(function ChatImage({ src, alt }: { src?: string; alt?: string }) {
  const dominio = imagenRemotaBloqueada(src, EDICION_CLIENTE)
  if (dominio && src) return <ImagenRemotaBloqueada src={src.trim()} dominio={dominio} alt={alt} />
  return <ChatImageCargada src={src} alt={alt} />
}, (prev, next) => prev.src === next.src && prev.alt === next.alt)

function ChatImageCargada({ src: srcCrudo, alt }: { src?: string; alt?: string }) {
  const srcOriginal = urlPublicaDeStorage(srcCrudo)
  // Ruta de disco en el markdown (Levy genera archivos locales) → endpoint same-origin autenticado por cookie.
  // En línea se pide la versión reducida; el lightbox pide el original.
  const rutaLocal = localImagePath(srcOriginal)
  const src = rutaLocal ? localImageUrl(rutaLocal) : srcOriginal
  const srcAmpliada = rutaLocal ? localImageUrl(rutaLocal, true) : srcOriginal
  // Imágenes rápidas (5 oct 2026): disco o Storage se piden a su ancho en AVIF, con placeholder al instante.
  // Si no hay ficha (GIF, SVG, otra web) se pinta como antes.
  const { meta, listo } = useMetaImagen(rutaLocal ? { ruta: rutaLocal } : esStorageOptimizable(srcOriginal) ? { url: srcOriginal } : null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!src || error) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card/60 border border-border-subtle text-muted/70 text-xs">
        <ZoomIn size={12} />
        {error ? 'Imagen no disponible' : 'Sin imagen'}
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group block my-2.5 rounded-2xl overflow-hidden border border-border hover:border-brand/30 transition-all duration-300 cursor-zoom-in relative shadow-lg shadow-black/20"
      >
        {meta ? <ImagenRapida meta={meta} alt={alt ?? 'image'} altoMax="300px" lazy /> : <>
        {/* Loading skeleton */}
        {(!loaded || !listo) && (
          <div className="w-full h-40 bg-card animate-pulse rounded-2xl" />
        )}
        {listo && <img
          src={src}
          alt={alt ?? 'image'}
          className={`max-w-full h-auto max-h-[300px] object-contain transition-all duration-300 group-hover:scale-[1.02] ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />}
        </>}
        {/* Hover overlay with zoom icon */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-2.5">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 text-foreground/85 text-[10px]">
            <ZoomIn size={10} />
            Ampliar
          </span>
        </div>
      </button>

      {open && <ImageLightbox src={srcAmpliada ?? src} alt={alt ?? 'image'} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Thinking toggle (collapsed by default) ─────────────────────────────────

export function ThinkingBlock({ text, label, streaming = false, waiting = false, detail, tiempo }: {
  text: string
  label?: string
  /** Reloj vivo o duración del turno, al lado de la etiqueta (8 oct 2026). */
  tiempo?: ReactNode
  streaming?: boolean
  /** Detiene el giro: hay espera (pregunta abierta, fila, sin conexión), no trabajo visible. */
  waiting?: boolean
  /** Qué se espera, en claro, cuando aún no hay razonamiento que mostrar. */
  detail?: string
}) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const shownLabel = label ?? (streaming ? (text ? 'Razonando' : 'Preparando respuesta') : 'Resumen de razonamiento')
  // «Preparando respuesta» sin señales más de 25 s: se dice qué pasa (resiliencia, 12 oct 2026).
  const espera = useEsperaExplicada(streaming && !waiting && !text && !label)
  return <div data-chat-activity data-tts-exclude className="mb-2 font-sans">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={detailsId}
      className="group/activity min-h-11 min-w-11 flex max-w-full items-center gap-2.5 rounded-xl px-2 -ml-2 text-[13px] text-muted hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 transition-colors motion-reduce:transition-none">
      <span aria-hidden className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {streaming && !waiting ? <><span className="absolute inset-0 rounded-full border-2 border-brand/20" />
          <span data-activity-motion className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand motion-safe:animate-spin" /></>
          : <span className="h-2 w-2 rounded-full bg-muted/50" />}
      </span>
      <span className="font-medium text-left">{shownLabel}</span>
      {tiempo}
      <ChevronDown aria-hidden size={15} className={`shrink-0 text-muted/60 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </button>
    {espera && <p role="status" data-espera-explicada className="-mt-1 mb-2 text-[12px] text-muted">{espera}</p>}
    {open && <div id={detailsId} role="region" aria-label="Detalle de actividad" aria-live="off"
      className="mt-1 mb-3 ml-2 border-l border-border pl-4 pr-2 text-[13px] text-muted leading-relaxed whitespace-pre-wrap break-words">
      {text || detail || (streaming ? 'Todavía no hay un resumen de razonamiento disponible.' : 'No se recibió un resumen de razonamiento para este turno.')}
    </div>}
  </div>
}

/**
 * Devuelve SOLO el texto de la respuesta: quita los bloques de pensamiento
 * (<!--thinking-->…<!--/thinking-->) y otros marcadores internos (<details>),
 * colapsando saltos de línea sobrantes. Se usa para COPIAR / TTS / LECTOR —
 * donde el pensamiento NUNCA debe ir.
 *
 * En sesiones nativas de Arbrain el `content` ya viene limpio (thinking vive en
 * `msg.thinking` aparte) → no-op. En sesiones CLI (`sdk:`) recargadas desde
 * historial, useChatHistory funde el thinking en `content` con esos marcadores
 * (por eso CopyBtn/AudioButton lo arrastraban): esto lo separa igual
 * que el render visual de MarkdownMessage.
 */
export function stripThinking(content: string): string {
  return content
    .replace(/<!--thinking-->[\s\S]*?<!--\/thinking-->/g, '')
    .replace(/<details>[\s\S]*?<\/details>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  streaming = false,
  ancho = false,
}: {
  content: string
  /** true mientras el turno sigue llegando — los bloques ```html esperan al final */
  streaming?: boolean
  /** true en el cuerpo de una respuesta del chat: bloques no-prosa al carril ancho */
  ancho?: boolean
}) {
  // Extract thinking blocks into separate components, render rest as markdown
  const thinkingRegex = /<!--thinking-->([\s\S]*?)<!--\/thinking-->/g
  const segments: Array<{ type: 'thinking' | 'text'; content: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = thinkingRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'thinking', content: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }

  // Clean text segments (strip other internal markers)
  const cleanedSegments = segments.map((s) => {
    if (s.type !== 'text') return s
    const cleaned = s.content
      .replace(/<details>[\s\S]*?<\/details>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { ...s, content: cleaned }
  }).filter((s) => s.content)

  if (cleanedSegments.length === 0) return null

  return (
    // Serif editorial del sistema (.chat-serif, 17px) sobre columna centrada
    // (48–52rem) = el feel de lectura de Claude iOS. Código/tools siguen en mono/sans.
    <MsgStreamingContext.Provider value={streaming}>
    <MsgAnchoContext.Provider value={ancho}>
    <div className="markdown-message chat-serif min-w-0">
      {cleanedSegments.map((seg, i) =>
        seg.type === 'thinking' ? (
          <ThinkingBlock key={i} text={seg.content} />
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
          code: CodeBlock,
          // CodeBlock ya emite su propio <pre> con header + copiar. Sin este
          // passthrough, react-markdown envuelve TODO en otro <pre> (doble caja
          // y layout roto). Aquí el <pre> del markdown solo deja pasar a su hijo.
          pre: ({ children }) => <>{children}</>,
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 whitespace-pre-wrap break-words">{children}</p>
          ),
          h1: ({ children }) => <h1 className="text-[22px] font-bold text-foreground mt-6 mb-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[19px] font-semibold text-foreground mt-5 mb-1.5 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[17px] font-semibold text-foreground/85 mt-4 mb-1 first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="chat-lista mb-3 last:mb-0 pl-6 space-y-1.5 list-disc list-outside">{children}</ul>,
          ol: ({ children }) => <ol className="chat-lista mb-3 last:mb-0 pl-6 space-y-1.5 list-decimal list-outside">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 border-l-2 border-border text-foreground/70 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-border" />,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="text-foreground/75 italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-ink hover:opacity-80 underline underline-offset-2 transition-opacity"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => <ChatImage src={typeof src === 'string' ? src : undefined} alt={typeof alt === 'string' ? alt : undefined} />,
          table: TablaMd,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground/70 border-b border-border bg-card">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border-subtle text-foreground/85">{children}</td>
          ),
        }}
      >
        {seg.content}
      </ReactMarkdown>
        )
      )}
    </div>
    </MsgAnchoContext.Provider>
    </MsgStreamingContext.Provider>
  )
})
