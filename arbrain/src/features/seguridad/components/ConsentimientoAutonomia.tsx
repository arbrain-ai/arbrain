'use client'
/**
 * El consentimiento del modo Autónomo (0.2.15, 29 oct 2026; SPEC §4 y §5). Un solo componente para la bienvenida, Ajustes
 * › Permisos y seguridad y la tarjeta de migración: la nota de versión, el texto completo plegable («Leer qué
 * significa») y las dos casillas, que nacen vacías (clickwrap). El texto, su versión y su huella vienen del daemon
 * (`GET /api/seguridad/permisos` › `texto`): la app los muestra tal cual y los devuelve al aceptar; nunca los inventa.
 */
import { useState } from 'react'
import { ChevronDown, ScrollText } from 'lucide-react'
import { Texto } from '@/features/primer-arranque/components/DocumentosLegales'
import type { TextoAutonomia } from '../lib/seguridad'

export type Casillas = [boolean, boolean]
export const CASILLAS_VACIAS: Casillas = [false, false]
/** Sin las dos casillas no se acepta. */
export const listoParaAceptar = (m: Casillas): boolean => m[0] && m[1]

export function ConsentimientoAutonomia({ texto, marcadas, onMarcadas, abiertoInicial = false, deshabilitado = false }: {
  texto: TextoAutonomia
  marcadas: Casillas
  onMarcadas: (m: Casillas) => void
  abiertoInicial?: boolean
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  return (
    <div className="space-y-3" data-consentimiento-autonomia={texto.version}>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-muted">{texto.aviso}</p>
      <section className="rounded-2xl border border-border-subtle bg-surface/70">
        <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls="texto-autonomia"
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-brand">
          <ScrollText className="size-4 shrink-0 text-brand-ink" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{texto.titulo}</span>
            <span className="block text-[12.5px] leading-snug text-muted">Versión del texto: {texto.version}</span>
          </span>
          <span className="shrink-0 text-[12px] text-muted">{abierto ? 'Cerrar' : 'Leer qué significa'}</span>
          <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {abierto && (
          <div id="texto-autonomia" className="max-h-72 overflow-y-auto overscroll-contain border-t border-border-subtle px-4 py-3" tabIndex={0} aria-label={texto.titulo}>
            <Texto cuerpo={texto.cuerpo} />
          </div>
        )}
      </section>
      <div className="space-y-2" role="group" aria-label="Para aceptar el modo autónomo">
        {texto.casillas.map((c, i) => (
          <label key={i} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border-subtle bg-surface/70 p-3">
            <input type="checkbox" checked={marcadas[i]} disabled={deshabilitado} onChange={e => { const m: Casillas = [marcadas[0], marcadas[1]]; m[i] = e.target.checked; onMarcadas(m) }} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
            <span className="text-[13px] leading-relaxed text-foreground/90">{c}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
