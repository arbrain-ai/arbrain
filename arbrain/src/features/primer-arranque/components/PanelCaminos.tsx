'use client'
/**
 * «¿Dónde vive tu Arbrain?» (primer arranque, 29 oct 2026). Los tres caminos de lib/caminos.ts: cuál es este, su paso a
 * paso y el prompt para pegar en Claude Code, con «Copiar». No guarda nada: cambiar de camino o sumar el servidor es
 * pegar ese prompt cuando la persona quiera.
 */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { CAMINOS, ORDEN_CAMINOS, type Camino } from '../lib/caminos'

export function PanelCaminos({ actual }: { actual: Camino }) {
  const [elegido, setElegido] = useState<Camino>(actual)
  const c = CAMINOS[elegido]
  return (
    <div>
      <div role="radiogroup" aria-label="Dónde vive tu Arbrain" className="grid gap-2">
        {ORDEN_CAMINOS.map(id => {
          const activa = id === elegido
          return (
            <button key={id} type="button" role="radio" aria-checked={activa} onClick={() => setElegido(id)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${activa ? 'border-brand/60 bg-brand/[0.07]' : 'border-border-subtle bg-surface/60 hover:bg-foreground/[0.03]'}`}>
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${activa ? 'border-brand bg-brand text-white' : 'border-foreground/25'}`} aria-hidden>{activa && <Check className="size-3" />}</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">{CAMINOS[id].titulo}
                  {id === actual && <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">Aquí estás</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{CAMINOS[id].resumen}</span>
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label={`Paso a paso: ${c.titulo}`} className="mt-4 rounded-2xl border border-border-subtle bg-surface/60 p-4">
        <ol className="grid list-decimal gap-1.5 pl-5 text-[13px] leading-snug text-foreground/90">
          {c.pasos.map(p => <li key={p}>{p}</li>)}
        </ol>
        <BloquePrompt etiqueta="Pega esto en Claude Code" texto={c.prompt} />
        {c.despues.map(d => <BloquePrompt key={d.prompt} etiqueta={d.para} texto={d.prompt} />)}
      </section>
    </div>
  )
}

function BloquePrompt({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = () => {
    void navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600) }).catch(() => {})
  }
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted">{etiqueta}</span>
        <button type="button" onClick={copiar} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-muted hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand">
          {copiado ? <><Check className="size-3.5" aria-hidden /> Copiado</> : <><Copy className="size-3.5" aria-hidden /> Copiar</>}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.05] px-3 py-2 font-mono text-[12px] leading-relaxed">{texto}</pre>
    </div>
  )
}
