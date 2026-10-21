'use client'
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow, Code2, Eye, Copy, Check, Maximize2, Minimize2,
} from 'lucide-react'
import { ESTUDIO_INLINE } from '../lib/estudio-inline'
import { sonda } from '../lib/tts-probe'

// ─── HTML en vivo dentro del chat ────────────────────────────────────────────
//
// Contraparte de MermaidDiagram para bloques ```html: en vez de mostrar código
// muerto, lo renderiza en un iframe sandboxeado (allow-scripts SIN
// allow-same-origin = origen opaco: el contenido no puede tocar la app, ni
// cookies, ni localStorage). Así Levy puede MOSTRAR mecanismos/diagramas
// interactivos en la conversación, estilo pergamino, sin salir del chat.
//
// El srcdoc se debouncea (mismo patrón que useMermaidRender) para que el
// streaming token-a-token no re-monte el iframe en cada frame.

const FRAGMENT_WRAP_HEAD = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;padding:16px;background:#0d0d12;color:#e7e7ea;
    font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;
    font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:#a78bfa}
  img,svg,canvas,video{max-width:100%;height:auto}
</style></head><body>`

// Barra de estudio DEFAULT (decisión Daniel 20 jul 2026): todo HTML renderizado
// recibe el estándar de libro-os (play/velocidad/A±/voz/secciones/tap-en-párrafo)
// sin que Levy lo incluya en cada generación. La barra decide en runtime si
// aplica (suficiente texto legible, viewport alto). Skips:
// · el doc ya trae su propia barra (#estudio-bar) — pergaminos completos.
// · opt-out explícito: incluir "sin-estudio" en el HTML.
function injectEstudio(code: string): string {
  if (/id=["']estudio-bar["']/.test(code) || /sin-estudio/.test(code)) return code
  const cierre = code.search(/<\/body>/i)
  if (cierre >= 0) return code.slice(0, cierre) + ESTUDIO_INLINE + code.slice(cierre)
  return code + ESTUDIO_INLINE
}

function buildSrcDoc(code: string): string {
  // Documento completo → tal cual. Fragmento → wrap con base oscura de la app
  // para que un snippet suelto no salga blanco-sobre-blanco.
  if (/<html[\s>]|<!doctype/i.test(code)) return injectEstudio(code)
  return `${FRAGMENT_WRAP_HEAD}${injectEstudio(code)}</body></html>`
}

function useDebouncedSrcDoc(code: string) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null)
  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed) return
    const timer = setTimeout(() => setSrcDoc(buildSrcDoc(trimmed)), 400)
    return () => clearTimeout(timer)
  }, [code])
  return srcDoc
}

function CopyBtn({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="hidden sm:flex items-center gap-1 text-[10px] text-muted/70 hover:text-foreground/70 transition-colors"
    >
      {copied
        ? <><Check size={11} className="text-gold-dark dark:text-gold-bright" /><span className="text-gold-dark dark:text-gold-bright">Copiado</span></>
        : <><Copy size={11} /><span>Copiar</span></>
      }
    </button>
  )
}

function FullscreenHtml({ srcDoc, onClose }: { srcDoc: string; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', h)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col">
      <div
        className="shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border bg-black/40"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 text-muted">
          <AppWindow size={14} className="text-violet-400" />
          <span className="text-xs font-medium">Vista HTML</span>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 sm:p-1.5 rounded-lg bg-card-active hover:bg-card-active text-foreground/70 hover:text-foreground transition-colors active:scale-90"
        >
          <Minimize2 size={16} />
        </button>
      </div>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        title="Vista HTML"
        className="flex-1 w-full border-0 bg-[#0d0d12]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      />
    </div>,
    document.body,
  )
}

export const HtmlPreview = memo(function HtmlPreview({ code }: { code: string }) {
  const srcDoc = useDebouncedSrcDoc(code)
  const [view, setView] = useState<'vista' | 'codigo'>('vista')
  const [fullscreen, setFullscreen] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  // Virtualización del iframe (20 jul 2026): un iframe vivo es CARO en móvil
  // (su propio hilo de layout/JS + capa de compositor). Con varios explicables
  // en una conversación, los que quedan fuera de pantalla robaban CPU al hilo
  // principal → el TTS del dispositivo perdía sus eventos `boundary` a tiempo y
  // el scroll suave se entrecortaba (síntoma: "se pausa, se salta, no smooth").
  // Solo montamos el iframe cuando la tarjeta está cerca del viewport; fuera de
  // ~700px se desmonta y queda un póster del MISMO alto (cero salto de scroll).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const cerca = entries.some((e) => e.isIntersecting)
        // Sospechoso: montar/desmontar un iframe es de lo más caro que hay en móvil.
        sonda.mark(cerca ? 'iframe-mount' : 'iframe-unmount')
        setNear(cerca)
      },
      { rootMargin: '700px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const IFRAME_H = 'h-[280px] sm:h-[340px] md:h-[400px]'

  return (
    <div ref={wrapRef} className="my-3 rounded-xl overflow-hidden border border-border bg-card/60">
      {/* Header — mismo lenguaje visual que MermaidDiagram */}
      <div className="flex items-center justify-between px-3 sm:px-3.5 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-muted">
          <AppWindow size={12} className="text-violet-400/70" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted/80">HTML</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={() => setView((v) => (v === 'vista' ? 'codigo' : 'vista'))}
            className="flex items-center gap-1 p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors active:scale-90"
            title={view === 'vista' ? 'Ver código' : 'Ver render'}
          >
            {view === 'vista' ? <Code2 size={13} /> : <Eye size={13} />}
            <span className="text-[10px] hidden sm:inline">{view === 'vista' ? 'Código' : 'Vista'}</span>
          </button>
          <div className="w-px h-3 bg-card-active mx-0.5 sm:mx-1 hidden sm:block" />
          <CopyBtn code={code} />
          <div className="w-px h-3 bg-card-active mx-0.5 sm:mx-1 hidden sm:block" />
          <button
            onClick={() => setFullscreen(true)}
            disabled={!srcDoc}
            className="p-2.5 sm:p-1 rounded-lg hover:bg-card-active text-muted/70 hover:text-foreground/70 transition-colors active:scale-90 disabled:opacity-30"
            title="Pantalla completa"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {view === 'vista' ? (
        srcDoc ? (
          near ? (
            <iframe
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              title="Vista HTML"
              className={`w-full ${IFRAME_H} border-0 bg-[#0d0d12]`}
            />
          ) : (
            // Póster fuera de pantalla: mismo alto (sin salto) + hint de "vista en
            // pausa". Al acercarte por scroll, la IO monta el iframe de nuevo.
            <button
              onClick={() => setNear(true)}
              className={`w-full ${IFRAME_H} bg-[#0d0d12] flex flex-col items-center justify-center gap-2 text-muted/60 hover:text-muted/80 transition-colors`}
            >
              <AppWindow size={20} className="text-violet-400/40" />
              <span className="text-[11px]">Vista en pausa · toca o acércate para verla</span>
            </button>
          )
        ) : (
          <div className="h-[120px] flex items-center justify-center text-xs text-muted/70">
            Preparando vista…
          </div>
        )
      ) : (
        <pre
          ref={preRef}
          className="px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto"
        >
          <code>{code}</code>
        </pre>
      )}

      {fullscreen && srcDoc && (
        <FullscreenHtml srcDoc={srcDoc} onClose={() => setFullscreen(false)} />
      )}
    </div>
  )
})
