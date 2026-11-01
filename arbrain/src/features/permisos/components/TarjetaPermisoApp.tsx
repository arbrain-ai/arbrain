'use client'
/**
 * Tarjeta de permiso por app (1 nov 2026, opción 1 firmada por Daniel; patrón de Cloudroom). La primera vez que las
 * manos de Levy van a tocar una app en una conversación, la persona decide aquí: «Siempre / Solo esta conversación / No»,
 * con el para qué que declaró Levy. Mientras no decide, Levy espera y se lo dice en el chat (no cierra su turno).
 *
 *   Siempre                 la app entra a Ajustes › Computer use (ahí se quita).
 *   Solo esta conversación  ámbar: la acción principal y la más prudente que deja trabajar.
 *   No                      en esta conversación Levy no toca esa app ni vuelve a preguntar.
 *
 * Seguridad que no cambia respecto a la tarjeta de comandos: solo un clic real aprueba (ni el teclado ni un `click()`
 * sintético), los botones se arman tras un instante y Escape es «No» (`lib/permiso-app.ts › decisionPorTecla`).
 * Lo que puede hacer dentro de la app sigue frenado aparte: enviar, borrar, pagar o publicar piden su propio permiso.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppWindow, Check, Infinity as Siempre, Loader2, X } from 'lucide-react'
import { esClicHumano } from '../lib/confirmacion'
import { campoAjeno, cuerpoResolverApp, decisionPorTecla, frasePara, type DecisionApp, type PedidoApp } from '../lib/permiso-app'
import { olvidarApp } from '../lib/pendientes'
import s from '@/features/chat/components/tarjeta-comando.module.css'

const ARMADO_MS = 700

/** `escape`: esta tarjeta atiende Escape (solo la primera de la pila; si no, un Escape negaría todas). */
export function TarjetaPermisoApp({ p, escape = true }: { p: PedidoApp; escape?: boolean }) {
  const [armado, setArmado] = useState(false)
  const [ocupado, setOcupado] = useState<DecisionApp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const caja = useRef<HTMLElement>(null)
  useEffect(() => { const t = window.setTimeout(() => setArmado(true), ARMADO_MS); return () => window.clearTimeout(t) }, [])

  const decidir = useCallback(async (d: DecisionApp) => {
    setOcupado(d); setError(null)
    try {
      const r = await fetch('/api/manos/apps/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoResolverApp(p.id, d)) })
      const j = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok && r.status !== 404 && r.status !== 409) throw new Error(j.error ?? 'No pude enviar tu decisión.')
      olvidarApp(p.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude enviar tu decisión.'); setOcupado(null) }
  }, [p.id])

  // Escape = No (fuera de otro campo de texto). Una tecla suelta nunca aprueba: los botones del sí piden clic real.
  useEffect(() => {
    if (!escape) return
    const tecla = (e: KeyboardEvent) => {
      if (ocupado) return
      if (decisionPorTecla({ key: e.key, repetida: e.repeat, enCampoAjeno: campoAjeno(e.target, caja.current) }) !== 'no') return
      e.preventDefault(); e.stopPropagation()
      void decidir('no')
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [escape, ocupado, decidir])

  const alClic = (d: DecisionApp) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (d !== 'no' && !esClicHumano({ detail: e.detail, isTrusted: e.nativeEvent.isTrusted })) return
    void decidir(d)
  }
  const nombre = p.app.nombre || 'esta app'

  return (
    <section ref={caja} className={s.tarjeta} data-permiso-app={p.id} aria-labelledby={`pa-${p.id}`}>
      <header className={s.cabeza}>
        <span className={s.icono} aria-hidden><AppWindow size={16} /></span>
        <div className={s.titulos}>
          <h3 id={`pa-${p.id}`} className={s.titulo}>Levy quiere usar una app</h3>
          <p className={s.frase}>¿Dejas que Levy use {nombre}?</p>
        </div>
      </header>
      <p className={s.explica} data-para><strong>Para qué:</strong> {frasePara(p)}</p>
      <p className={s.explica}>Podrá ver lo que hay en {nombre}, hacer clic y escribir ahí, con su propio cursor. Enviar, borrar, pagar o publicar te lo sigue preguntando aparte.</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.botones}>
        <button type="button" className={s.principal} disabled={!armado || !!ocupado} onClick={alClic('conversacion')} title="Solo con un clic: el teclado no aprueba" data-decision="conversacion">
          {ocupado === 'conversacion' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />} Solo esta conversación
        </button>
        <button type="button" className={s.secundario} disabled={!armado || !!ocupado} onClick={alClic('siempre')} title={`Guarda ${nombre} en Ajustes › Computer use: ya no te pregunta`} data-decision="siempre">
          {ocupado === 'siempre' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Siempre size={15} aria-hidden />} Siempre
        </button>
        <button type="button" className={s.secundario} disabled={!!ocupado} onClick={alClic('no')} data-decision="no">
          {ocupado === 'no' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <X size={15} aria-hidden />} No
        </button>
      </div>
      <p className={s.pie}>«Siempre» guarda {nombre} en Ajustes › Computer use, donde la quitas cuando quieras.{escape ? ' Escape es «No».' : ''} Mientras decides, Levy espera.</p>
    </section>
  )
}
