'use client'
import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { ATAJOS_SHELL, atajosCanvas, filtrarAtajos } from '@/shared/navigation/atajos'

/**
 * Configuración → Atajos (2 oct 2026). Antes la tabla del Canvas vivía abierta al final de Ajustes y ocupaba media
 * página. Ahora es su propia vista: cada grupo nace cerrado y el buscador abre solo los que coinciden.
 */
export function SeccionAtajos() {
  const [consulta, setConsulta] = useState('')
  const grupos = useMemo(() => filtrarAtajos([...ATAJOS_SHELL, ...atajosCanvas()], consulta), [consulta])
  const buscando = consulta.trim().length > 0

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Buscar un atajo</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar: «tema», «⌘B», «flecha»…"
          className="input-field min-h-11 w-full pl-9 pr-3 text-sm"
        />
      </label>

      {grupos.length === 0 && <p className="py-6 text-center text-xs text-muted">Ningún atajo coincide con «{consulta}».</p>}

      <div className="space-y-2">
        {grupos.map((g) => (
          // `key` cambia al buscar: los grupos se reabren con la búsqueda y vuelven cerrados al limpiarla.
          <details key={`${g.id}:${buscando}`} open={buscando} className="group solid-card overflow-hidden" data-grupo-atajos={g.id}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-card-hover sm:px-5 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground/90">{g.titulo}</span>
                <span className="block text-[11px] text-muted">{g.donde}</span>
              </span>
              <span className="rounded-full bg-card-hover px-1.5 py-0.5 text-[10px] text-muted/80">{g.atajos.length}</span>
            </summary>
            <ul className="space-y-1 border-t border-border-subtle px-4 py-3 sm:px-5">
              {g.atajos.map((a) => (
                <li key={`${a.accion}-${a.teclas.join('+')}`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1">
                  <span className="text-xs text-foreground/75">{a.accion}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {a.teclas.map((t) => (
                      <kbd key={t} className="min-w-6 rounded border border-border bg-card-hover px-1.5 py-0.5 text-center font-mono text-[10px] text-foreground/85">{t}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
