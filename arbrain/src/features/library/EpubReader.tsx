'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

// epubjs + jszip se cargan desde CDN en runtime (no engordan el bundle del PWA).
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No cargó ' + src))
    document.head.appendChild(s)
  })
}

export function EpubReader({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendition = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')
        await loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js')
        const ePub = (window as any).ePub
        if (!alive || !hostRef.current || !ePub) throw new Error('epubjs')
        const book = ePub(url)
        const rend = book.renderTo(hostRef.current, {
          width: '100%',
          height: '100%',
          flow: 'scrolled-doc',
          spread: 'none',
          allowScriptedContent: false,
        })
        rendition.current = rend
        rend.themes.default({
          body: {
            background: '#14111a',
            color: '#d8d4e0',
            padding: '4vh 6vw',
            'font-family': 'Georgia, "Times New Roman", serif',
            'font-size': '1.05rem',
            'line-height': '1.75',
          },
          a: { color: '#ffb64d' },
          h1: { color: '#a95cf5' },
          h2: { color: '#b57bf7' },
        })
        await rend.display()
        if (alive) setLoading(false)
      } catch {
        if (alive) {
          setErr('No se pudo abrir el EPUB. Ábrelo como PDF o descárgalo.')
          setLoading(false)
        }
      }
    })()
    return () => {
      alive = false
      try {
        rendition.current?.destroy()
      } catch {
        /* noop */
      }
    }
  }, [url])

  return (
    <div className="absolute inset-0 bg-[#14111a]">
      <div ref={hostRef} className="w-full h-full" />
      {loading && !err && (
        <div className="absolute inset-0 grid place-items-center text-muted">
          <Loader2 className="animate-spin" size={22} />
        </div>
      )}
      {err && (
        <div className="absolute inset-0 grid place-items-center px-8">
          <p className="text-sm text-muted text-center max-w-xs">{err}</p>
        </div>
      )}
      {!loading && !err && (
        <>
          <button
            onClick={() => rendition.current?.prev()}
            className="absolute left-2 top-1/2 -translate-y-1/2 icon-btn size-10 bg-black/30 backdrop-blur-sm rounded-full"
            aria-label="Anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => rendition.current?.next()}
            className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn size-10 bg-black/30 backdrop-blur-sm rounded-full"
            aria-label="Siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </div>
  )
}
