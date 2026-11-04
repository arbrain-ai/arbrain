'use client'
/**
 * «Esperan tu toque · N» en el Día de hoy (3 nov 2026, 18:53, Daniel viendo la bandeja: «es una ux de mierda!! no debería aparecerme en
 * el calendario vistas de hoy como otra cosa que diga decisiones o algo así?»). La primera franja arriba del objetivo, del mismo
 * esqueleto que la franja del plan: una línea por decisión con su título corto, la recomendación de Levy en una línea y Sí / No ahí
 * mismo. Al expandir una: «Qué sale exactamente» y Otro. Lo atado a una hora dice cuándo vence; al vencer se queda un rato tachado con
 * «ya no aplica» y se va al historial (nunca se ejecuta). «Sí a todas» solo agrupa lo que no contacta personas ni paga.
 * Sin nada que decidir no pinta nada. La misma pieza, compacta, arriba de /telefono. La píldora «te espera» del chat cuenta lo mismo.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MessageSquare, X } from 'lucide-react'
import { useBandeja } from './useBandeja'
import { enOrden, etiquetaCategoria, lineaRecomendacion, recomendadas, unaPorUna, vencidasRecientes, type Tarjeta } from './lib/bandeja'
import s from './franja-decisiones.module.css'

/** La píldora del chat pide traer la franja a la vista (y el panel puede montarla después: se recuerda unos segundos). */
export const EVENTO_ENFOCAR_DECISIONES = 'arbrain:decisiones-enfocar'
const CLAVE_ENFOCAR = 'arbrain.decisiones.enfocar'
export function pedirEnfocarDecisiones() {
  try { sessionStorage.setItem(CLAVE_ENFOCAR, String(Date.now())) } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EVENTO_ENFOCAR_DECISIONES))
}

const horaCorta = (t: number) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

export function FranjaDecisiones({ compacta = false }: { compacta?: boolean }) {
  const b = useBandeja()
  const caja = useRef<HTMLElement>(null)
  const [enfocada, setEnfocada] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  const pendientes = enOrden(b.vista?.pendientes ?? []), vencidas = vencidasRecientes(b.vista)
  const lote = recomendadas(pendientes)
  const hay = pendientes.length + vencidas.length > 0

  useEffect(() => {
    const enfocar = () => {
      const el = caja.current
      if (!el) return
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setEnfocada(true); setTimeout(() => setEnfocada(false), 1600)
      try { sessionStorage.removeItem(CLAVE_ENFOCAR) } catch { /* sin almacenamiento */ }
    }
    let pedido = 0
    try { pedido = Number(sessionStorage.getItem(CLAVE_ENFOCAR)) || 0 } catch { /* sin almacenamiento */ }
    if (hay && Date.now() - pedido < 8000) requestAnimationFrame(enfocar)
    window.addEventListener(EVENTO_ENFOCAR_DECISIONES, enfocar)
    return () => window.removeEventListener(EVENTO_ENFOCAR_DECISIONES, enfocar)
  }, [hay])

  if (!hay) return null
  return <section ref={caja} className={s.franja} data-compacta={compacta || undefined} data-enfocada={enfocada || undefined} data-franja-decisiones aria-label={`Esperan tu toque: ${pendientes.length}`}>
    <header className={s.cabeza}>
      <span className={s.rotulo}>Esperan tu toque</span>{pendientes.length > 0 && <b className={s.n}>{pendientes.length}</b>}
      {lote.length > 1 && <button className={s.todas} disabled={!!b.ocupado} onClick={() => void b.lote(lote.map(t => t.id), 'si')}
        title="Las que recomiendo y no contactan personas ni pagan. Contactar y pagar van una por una.">Sí a todas · {lote.length}</button>}
    </header>
    <ul className={s.filas}>
      {pendientes.map(t => <Fila key={t.id} t={t} abierta={abierta === t.id} onAbrir={() => setAbierta(abierta === t.id ? null : t.id)}
        ocupado={b.ocupado === t.id || b.ocupado === 'lote'} onResponder={(r, c) => b.resolver(t.id, r, c)} />)}
      {vencidas.map(t => <li key={t.id} className={s.fila} data-vencida>
        <div className={s.linea}><span className={s.titulo}>{t.titulo}</span><em className={s.yaNo}>ya no aplica</em></div>
      </li>)}
    </ul>
    {b.error && <p className={s.error} role="alert">{b.error}</p>}
  </section>
}

function Fila({ t, abierta, ocupado, onAbrir, onResponder }: {
  t: Tarjeta; abierta: boolean; ocupado: boolean; onAbrir: () => void
  onResponder: (r: 'si' | 'no' | 'otro', comentario?: string) => Promise<boolean>
}) {
  const [otro, setOtro] = useState(false), [texto, setTexto] = useState('')
  const rec = lineaRecomendacion(t), exacto = t.detalle ?? t.literal, manos = t.tipo === 'manos'
  return <li className={s.fila} data-abierta={abierta || undefined} data-recomienda={t.recomienda ?? undefined} data-decision={t.id}>
    <div className={s.linea}>
      <button className={s.cuerpo} onClick={onAbrir} aria-expanded={abierta} title={abierta ? 'Plegar' : 'Qué sale exactamente y Otro'}>
        <span className={s.categoria} data-categoria={t.categoria}>{etiquetaCategoria(t.categoria)}</span>
        <span className={s.texto}>
          <span className={s.titulo}>{t.titulo}</span>
          {rec && <span className={s.rec} data-tono={t.recomienda === 'no' ? 'no' : 'si'}><b>Levy</b> {rec}</span>}
        </span>
        {t.vence && <time className={s.vence} title="A esta hora ya no aplica y vence sola">vence {horaCorta(t.vence)}</time>}
        <ChevronDown className={s.chevron} size={14} aria-hidden />
      </button>
      {!manos && <button className={s.si} disabled={ocupado} onClick={() => void onResponder('si')} aria-label={`Sí: ${t.titulo}`} data-respuesta="si"
        title={unaPorUna(t) ? 'Esta va sola: contacta a alguien o paga' : undefined}><Check size={13} aria-hidden />{t.botonSi ?? 'Sí'}</button>}
      <button className={s.no} disabled={ocupado} onClick={() => void onResponder('no')} aria-label={`No: ${t.titulo}`} data-respuesta="no"><X size={13} aria-hidden />No</button>
    </div>
    {abierta && <div className={s.detalle}>
      {exacto && <><h4>Qué sale exactamente</h4><pre>{exacto}</pre></>}
      {manos && <p className={s.nota}>Esto lo corres tú desde su tarjeta en el chat.</p>}
      {!manos && (otro
        ? <form className={s.otro} onSubmit={e => { e.preventDefault(); if (texto.trim()) void onResponder('otro', texto.trim()).then(ok => { if (ok) { setOtro(false); setTexto('') } }) }}>
          <textarea autoFocus rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="¿Qué quieres en su lugar?" aria-label="Qué quieres en su lugar" />
          <div><button type="button" className={s.sutil} onClick={() => setOtro(false)}>Cancelar</button>
            <button type="submit" className={s.si} disabled={!texto.trim() || ocupado}>Mandar a Levy</button></div>
        </form>
        : <button className={s.sutil} onClick={() => setOtro(true)} data-respuesta="otro"><MessageSquare size={13} aria-hidden />Otro</button>)}
    </div>}
  </li>
}
