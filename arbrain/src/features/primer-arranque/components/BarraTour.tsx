'use client'
/**
 * El tour de bienvenida bajo el chat (1 nov 2026). Levy da el recorrido en mensajes suyos, uno por capítulo; esta barra
 * lleva los mandos: Siguiente, Muéstramelo (abre el panel del capítulo), Pausar y Saltar. Pausado, queda un solo botón
 * para retomarlo. Sin recorrido abierto, ofrece empezarlo (quien instaló antes de que existiera) o ver las Novedades de
 * una versión, una vez. Saltar cuenta como visto. Lógica y estado: lib/tour*.ts y /api/primer-arranque/tour.
 */
import { useCallback, useEffect, useState } from 'react'
import type { PlanTour } from '../lib/tour'
import { mostrarDestino } from '../lib/tour-mostrar'

export interface MensajeTour { id: string; role: 'assistant'; content: string; created_at: string; metadata: { source: string; capitulo: string; mostrar: string | null } }

const BOTON = 'min-h-9 max-w-full rounded-full border px-3.5 py-1.5 text-left text-[13px] transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50'
const PRINCIPAL = `${BOTON} border-brand/45 bg-brand/15 text-brand-ink hover:bg-brand/25`
const SECUNDARIO = `${BOTON} border-brand/20 bg-brand/[0.06] text-brand-ink/90 hover:border-brand/40 hover:bg-brand/12`
const DISCRETO = `${BOTON} border-transparent text-muted hover:text-foreground`

export function BarraTour({ sesionId, onMensaje, onEnCurso }: {
  sesionId: string | null
  /** El capítulo recién entregado, para pintarlo sin recargar la conversación. */
  onMensaje: (m: MensajeTour) => void
  /** Avisa si el recorrido está abierto (el chat esconde los pedidos de bienvenida mientras tanto). */
  onEnCurso?: (enCurso: boolean) => void
}) {
  const [plan, setPlan] = useState<PlanTour | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/primer-arranque/tour', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((j: { plan?: PlanTour | null } | null) => { if (vivo) setPlan(j?.plan ?? null) }).catch(() => {})
    return () => { vivo = false }
  }, [sesionId])

  useEffect(() => { onEnCurso?.(!!plan?.enCurso && !plan.pausado) }, [plan, onEnCurso])

  const pedir = useCallback(async (accion: 'siguiente' | 'pausar' | 'saltar') => {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/primer-arranque/tour', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, sesion: sesionId }) })
      const j = await r.json().catch(() => ({})) as { plan?: PlanTour | null; sesion?: string; mensaje?: MensajeTour | null; error?: string }
      if (!r.ok) throw new Error(j.error ?? 'No pude seguir con el recorrido.')
      setPlan(j.plan ?? null)
      if (j.mensaje) {
        // Sin conversación abierta, el capítulo nació en una nueva: se abre ahí.
        if (j.sesion && j.sesion !== sesionId) { window.location.replace(`/chat?session=${encodeURIComponent(j.sesion)}`); return }
        onMensaje(j.mensaje)
        mostrarDestino(j.mensaje.metadata.mostrar)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude seguir con el recorrido.') } finally { setOcupado(false) }
  }, [sesionId, onMensaje])

  if (!plan) return null
  const n = `${Math.min(plan.hechos + 1, plan.total)} de ${plan.total}`

  return (
    <div role="group" aria-label="Recorrido de bienvenida" aria-live="polite" className="pt-3" data-tour-bienvenida={plan.enCurso ? (plan.pausado ? 'pausado' : 'en-curso') : 'oferta'}>
      {!plan.enCurso && (
        <p className="pb-2 text-[13px] text-muted">
          {plan.modo === 'novedades'
            ? <>Novedades en tu Arbrain: <b className="font-medium text-foreground">{plan.pendientes.join(', ')}</b>. Te las enseño en un minuto, una sola vez.</>
            : <>Levy te enseña la app en unos tres minutos, por capítulos. Se ve una sola vez.</>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!plan.enCurso && <>
          <button type="button" className={PRINCIPAL} disabled={ocupado} onClick={() => void pedir('siguiente')}>{plan.modo === 'novedades' ? 'Ver las novedades' : 'Empezar el recorrido'}</button>
          <button type="button" className={DISCRETO} disabled={ocupado} onClick={() => void pedir('saltar')}>Ahora no (no vuelve)</button>
        </>}
        {plan.enCurso && plan.pausado && <>
          <button type="button" className={PRINCIPAL} disabled={ocupado} onClick={() => void pedir('siguiente')}>Retomar el recorrido · {n}</button>
          <button type="button" className={DISCRETO} disabled={ocupado} onClick={() => void pedir('saltar')}>Saltar el resto</button>
        </>}
        {plan.enCurso && !plan.pausado && <>
          {plan.siguiente && <button type="button" className={PRINCIPAL} disabled={ocupado} onClick={() => void pedir('siguiente')}>Siguiente: {plan.siguiente.titulo} <span className="text-brand-ink/60">· {n}</span></button>}
          {plan.ultimo?.mostrar && <button type="button" className={SECUNDARIO} onClick={() => mostrarDestino(plan.ultimo?.mostrar)}>Muéstramelo</button>}
          <button type="button" className={DISCRETO} disabled={ocupado} onClick={() => void pedir('pausar')}>Pausar</button>
          <button type="button" className={DISCRETO} disabled={ocupado} onClick={() => void pedir('saltar')}>Saltar el recorrido</button>
        </>}
      </div>
      {error && <p role="alert" className="pt-2 text-[12.5px] text-amber-600 dark:text-amber-400">{error}</p>}
    </div>
  )
}
