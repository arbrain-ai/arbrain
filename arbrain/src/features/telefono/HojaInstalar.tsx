'use client'
/**
 * Hoja de instalación (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md): la primera vez que la persona entra
 * desde su teléfono (no en la computadora ni ya instalada), le dice en español cómo dejar su Levy en la pantalla de
 * inicio. En Android usa el aviso de instalación del navegador si existe. Se cierra con «Ahora no» y no vuelve en ese
 * teléfono. Desde iOS 17, Safari copia las cookies a la app al agregarla: la sesión entra con ella.
 */
import { useEffect, useState } from 'react'
import { Download, Share, Smartphone, X } from 'lucide-react'
import { esEdicionCliente } from '@/lib/edicion'
import { pasosInstalar, plataformaDe, type Plataforma } from './conectar-ui'

const CLAVE = 'arbrain:hoja-instalar:vista'
const CLIENTE = esEdicionCliente()

interface EventoInstalar extends Event { prompt: () => Promise<void> }

export function HojaInstalar() {
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null)
  const [aviso, setAviso] = useState<EventoInstalar | null>(null)

  useEffect(() => {
    if (!CLIENTE) return
    const local = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)
    const instalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    let vista = false
    try { vista = localStorage.getItem(CLAVE) === '1' } catch { /* modo privado */ }
    const p = plataformaDe(navigator.userAgent)
    if (local || instalada || vista || p === 'otro') return
    setPlataforma(p)
    const alAviso = (e: Event) => { e.preventDefault(); setAviso(e as EventoInstalar) }
    window.addEventListener('beforeinstallprompt', alAviso)
    return () => window.removeEventListener('beforeinstallprompt', alAviso)
  }, [])

  if (!plataforma) return null
  const cerrar = () => { try { localStorage.setItem(CLAVE, '1') } catch { /* */ } setPlataforma(null) }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="false" aria-labelledby="hoja-instalar-titulo" data-hoja-instalar={plataforma}>
      <div className="mx-auto max-w-md rounded-2xl border border-border-subtle bg-background/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand-ink"><Smartphone className="size-4.5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 id="hoja-instalar-titulo" className="text-[15px] font-semibold text-foreground">Ponlo en tu pantalla de inicio</h2>
            <p className="text-[13px] text-muted">Así abres a tu Levy con un toque, como cualquier app, sin volver a escanear.</p>
          </div>
          <button type="button" className="rounded-lg p-1 text-muted hover:text-foreground" aria-label="Cerrar" onClick={cerrar}><X className="size-4" aria-hidden /></button>
        </div>
        <ol className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-foreground/90">
          {pasosInstalar(plataforma).map((p, i) => (
            <li key={i} className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{i + 1}</span><span>{p}</span></li>
          ))}
        </ol>
        <div className="mt-3 flex items-center gap-2">
          {aviso ? (
            <button type="button" className="btn-primary !px-3 !py-1.5 text-[13px]" onClick={() => { void aviso.prompt().finally(cerrar) }}><Download className="size-3.5" aria-hidden /> Instalar</button>
          ) : plataforma === 'ios' ? (
            <span className="inline-flex items-center gap-1 text-[12.5px] text-muted"><Share className="size-3.5" aria-hidden /> Busca este icono abajo en Safari</span>
          ) : null}
          <button type="button" className="ml-auto text-[13px] text-muted hover:text-foreground" onClick={cerrar}>Ahora no</button>
        </div>
      </div>
    </div>
  )
}
