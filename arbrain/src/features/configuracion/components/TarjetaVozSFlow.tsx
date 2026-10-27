'use client'
/**
 * «Voz con SFlow» en Ajustes › Voz. Encendida, al terminar cada respuesta SFlow dice en voz alta el bloque 🔊 (skill
 * `modo-voz`), con el mismo `voz.py` que el gancho de Claude Code. El servidor hace el trabajo
 * (server/src/cliente/voz-sflow.ts).
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Volume2, VolumeX } from 'lucide-react'

interface Estado { encendido: boolean; disponible: boolean }

export function TarjetaVozSFlow() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/voz-sflow', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((e: Estado | null) => { if (e) setEstado(e) }).catch(() => {})
  }, [])
  const fijar = useCallback(async (encendido: boolean) => {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/voz-sflow', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encendido }) })
      const j = await r.json().catch(() => ({})) as Estado & { error?: string }
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      setEstado(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.') }
    finally { setOcupado(false) }
  }, [])
  if (!estado) return null
  const Icono = estado.encendido ? Volume2 : VolumeX
  return (
    <section className="mt-4 rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <header className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
          <Icono className="size-4 text-brand-ink" aria-hidden /> Voz con SFlow
        </h3>
        <button type="button" role="switch" aria-checked={estado.encendido} disabled={ocupado} onClick={() => void fijar(!estado.encendido)}
          aria-label="Voz con SFlow"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${estado.encendido ? 'bg-brand' : 'bg-foreground/20'}`}>
          {ocupado
            ? <Loader2 className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" aria-hidden />
            : <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${estado.encendido ? 'left-[22px]' : 'left-0.5'}`} aria-hidden />}
        </button>
      </header>
      <p className="text-[12.5px] leading-relaxed text-muted">
        Cuando tu agente cierra una respuesta con una línea 🔊 (pídele «modo voz» o «léeme el resumen»), SFlow la dice en
        voz alta, igual que en Claude Code. SFlow tiene que estar abierta.
      </p>
      {!estado.disponible && (
        <p className="mt-2 text-[12.5px] text-amber-300">
          No encuentro SFlow en esta Mac. Instálalo desde{' '}
          <a className="underline" href="https://github.com/danielsantacolomavalencia-lang/sflow-voz" target="_blank" rel="noreferrer">sflow-voz</a>{' '}
          y corre <code>claude_hooks/instalar.py</code>.
        </p>
      )}
      {error && <p className="mt-2 text-[12.5px] text-red-300">{error}</p>}
    </section>
  )
}
