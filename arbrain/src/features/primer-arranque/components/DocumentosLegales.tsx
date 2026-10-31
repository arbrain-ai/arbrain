'use client'
/** Los tres textos legales con su resumen y el texto completo plegable (primer arranque y Ajustes › Privacidad). */
import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { AVISO_VERSION, DOCUMENTOS_LEGALES, type DocumentoLegal } from '../textos/legales'

export function DocumentosLegales({ abierto: inicial = null }: { abierto?: DocumentoLegal['id'] | null }) {
  const [abierto, setAbierto] = useState<DocumentoLegal['id'] | null>(inicial)
  return (
    <div className="space-y-2">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-muted">{AVISO_VERSION}</p>
      {DOCUMENTOS_LEGALES.map(d => {
        const abiertoEste = abierto === d.id
        return (
          <section key={d.id} className="rounded-2xl border border-border-subtle bg-surface/70">
            <button type="button" onClick={() => setAbierto(abiertoEste ? null : d.id)} aria-expanded={abiertoEste} aria-controls={`legal-${d.id}`}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-brand">
              <FileText className="size-4 shrink-0 text-brand-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{d.titulo}</span>
                <span className="block text-[12.5px] leading-snug text-muted">{d.resumen}</span>
              </span>
              <span className="shrink-0 text-[12px] text-muted">{abiertoEste ? 'Cerrar' : 'Leer'}</span>
              <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${abiertoEste ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {abiertoEste && (
              <div id={`legal-${d.id}`} className="max-h-72 overflow-y-auto overscroll-contain border-t border-border-subtle px-4 py-3" tabIndex={0} aria-label={d.titulo}>
                <Texto cuerpo={d.cuerpo} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Párrafos, subtítulos («## ») y viñetas («- »). Sin HTML: el texto se pinta como texto. */
export function Texto({ cuerpo }: { cuerpo: string }) {
  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed text-foreground/85">
      {cuerpo.split(/\n\n+/).map((bloque, i) => {
        if (bloque.startsWith('## ')) {
          const [titulo, ...resto] = bloque.split('\n')
          return <div key={i}><h4 className="mt-1 text-[13px] font-semibold text-foreground">{titulo.slice(3)}</h4>{resto.length > 0 && <Texto cuerpo={resto.join('\n')} />}</div>
        }
        const lineas = bloque.split('\n')
        if (lineas.every(l => l.startsWith('- '))) return <ul key={i} className="list-disc space-y-1 pl-5">{lineas.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
        if (lineas.some(l => l.startsWith('- '))) {
          return <div key={i}>{lineas.map((l, j) => l.startsWith('- ') ? <p key={j} className="pl-3">• {l.slice(2)}</p> : <p key={j}>{l}</p>)}</div>
        }
        return <p key={i}>{bloque}</p>
      })}
    </div>
  )
}
