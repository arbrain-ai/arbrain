'use client'
import { useEffect, useState } from 'react'
import { FileText, BookText, Loader2, Sparkles } from 'lucide-react'
import type { LibFolder, LibFile } from './server'

function fmtSize(n: number): string {
  if (!n) return ''
  const mb = n / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * Navegador de la biblioteca personal (PDFs/EPUB de personal/libros). Carga la lista
 * server-side. Si la carpeta no existe (Vercel/iPhone), muestra un aviso claro en vez de
 * fallar. Los fundamentales (Cibernética) van primero.
 */
export function DocsBrowser({ onOpen }: { onOpen: (f: LibFile) => void }) {
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [folders, setFolders] = useState<LibFolder[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/biblioteca')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setAvailable(!!d.available)
        setFolders(Array.isArray(d.folders) ? d.folders : [])
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setAvailable(false)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    )
  }

  if (!available) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-sm text-center">
          <BookText size={30} className="mx-auto text-muted/60 mb-3" />
          <p className="text-sm text-foreground font-medium">Biblioteca personal no disponible aquí</p>
          <p className="text-[13px] text-muted mt-2 leading-relaxed">
            Tus PDFs y EPUB viven en tu Mac (<code className="text-gold/90">personal/libros</code>). Se abren
            desde la app de escritorio. Dime si quieres que los suba a un espacio privado para leerlos también
            desde el iPhone.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
      {folders.map((folder) => (
        <section key={folder.key} className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            {folder.core && <Sparkles size={13} className="text-gold shrink-0" />}
            <h3 className="text-[11px] font-semibold tracking-[0.14em] uppercase text-foreground/80">
              {folder.label}
            </h3>
            <span className="text-[10px] text-muted">{folder.files.length}</span>
            <div className="flex-1 h-px bg-border-subtle/60 ml-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {folder.files.map((f) => (
              <button
                key={f.rel}
                onClick={() => onOpen(f)}
                className="group flex items-center gap-3 text-left rounded-xl px-3 py-2.5 titanium-panel border border-border-subtle transition-colors hover:border-primary/50 active:scale-[0.98]"
              >
                <span
                  className={`shrink-0 grid place-items-center size-9 rounded-lg ${
                    f.ext === 'epub' ? 'bg-primary/15 text-primary' : 'bg-gold/15 text-gold'
                  }`}
                >
                  {f.ext === 'epub' ? <BookText size={16} /> : <FileText size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground leading-tight truncate">
                    {f.author}
                  </span>
                  <span className="block text-[11px] text-muted leading-tight truncate">{f.title}</span>
                </span>
                <span className="shrink-0 text-[9px] font-mono uppercase text-muted/70 tabular-nums">
                  {f.ext} · {fmtSize(f.size)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
