'use client'
/**
 * «Esperan tu toque · N» (3 nov 2026, 18:53, Daniel viendo la bandeja: «es una ux de mierda!! no debería aparecerme en el calendario
 * vistas de hoy como otra cosa que diga decisiones o algo así?»). Una línea por decisión con su título, la recomendación de Levy y
 * Sí / No ahí mismo. Al expandir una: «Qué sale exactamente» y Otro. Lo atado a una hora dice cuándo vence; al vencer sale de la lista
 * en ese momento y queda solo en el historial (Bandeja › «Decidiste hoy · N ya no aplica» y «Lo que hice solo»); nunca se ejecuta y no
 * ocupa renglón (4 nov 2026, 19:31: una vencida seguía ahí tachada). «Sí a todas» solo agrupa lo que no contacta personas ni paga.
 *
 * 4 nov 2026 (Daniel, 18:45: «estos botones lucen planos pueden estar dentro del toggle de hoy… al lado de las tareas… estando el
 * toggle cerrado debería poder ver en todo momento la vista de "hoy"»): en el Día ya no es un bloque aparte arriba. Vive DENTRO de la
 * tarjeta HOY, como una sección junto a las tareas (`SeccionDecisiones`); plegada, la tarjeta dice «N te esperan» en su línea
 * (`AvisoDecisiones`) y la línea del tiempo queda a la vista. Lo de la misma persona va junto (dos de Mengano = una tarjeta con dos
 * acciones). Sí y No son la tecla del compositor (`boton-enviar.module.css`): Sí encendida, No la tapa de titanio apagada.
 * 4 nov 2026, 19:31 (Daniel: «quita eso de 5 te esperan… debería solo aparecer en la vista de mi hoy»): un número, un solo lugar. Fuera
 * de la píldora del chat y fuera de la franja propia que el teléfono pintaba en /telefono: el teléfono usa esta misma tarjeta HOY. El push de
 * una decisión (/telefono/decisiones?id=…) abre el Día de hoy, la tarjeta y esa decisión (`pedirEnfocarDecisiones(id)`).
 * Sin nada que decidir no pinta nada.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, MessageSquare, X } from 'lucide-react'
import { useBandeja } from './useBandeja'
import { agruparPorPersona, enOrden, etiquetaCategoria, lineaRecomendacion, recomendadas, tituloEnGrupo, unaPorUna, urlVistaPrevia, type Tarjeta } from './lib/bandeja'
import tecla from '@/features/chat/components/boton-enviar.module.css'
import s from './franja-decisiones.module.css'

/** El aviso de la tarjeta o el push piden traer la sección a la vista (y el Día puede montarse después: se recuerda unos segundos).
 *  Con `id`, además abre esa decisión. Se guarda «hora|id». */
export const EVENTO_ENFOCAR_DECISIONES = 'arbrain:decisiones-enfocar'
const CLAVE_ENFOCAR = 'arbrain.decisiones.enfocar'
export function pedirEnfocarDecisiones(id?: string) {
  try { sessionStorage.setItem(CLAVE_ENFOCAR, `${Date.now()}|${id ?? ''}`) } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EVENTO_ENFOCAR_DECISIONES, { detail: { id } }))
}
/** ¿Alguien pidió enfocar hace nada? (la tarjeta HOY se abre sola al montar). */
export function enfoquePedido(dentroDeMs = 8_000): boolean {
  return leerPedido(dentroDeMs) !== null
}
/** El pedido vigente: '' sin decisión concreta, el id si la trae, null si no hay. */
function leerPedido(dentroDeMs = 8_000): string | null {
  try {
    const [t, id = ''] = (sessionStorage.getItem(CLAVE_ENFOCAR) ?? '').split('|')
    return Date.now() - (Number(t) || 0) < dentroDeMs ? id : null
  } catch { return null }
}

const horaCorta = (t: number) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
/** «12:00» si vence hoy; «jue 12:00» si es otro día. */
const cuandoVence = (t: number) => new Date(t).toDateString() === new Date().toDateString() ? horaCorta(t)
  : `${new Date(t).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')} ${horaCorta(t)}`

type Bandeja = ReturnType<typeof useBandeja>

/** Cuántas esperan, para la línea de la tarjeta HOY plegada. Un toque abre la tarjeta y lleva a la sección. */
export function AvisoDecisiones({ n }: { n: number }) {
  if (!n) return null
  return <button type="button" className={s.aviso} onClick={() => pedirEnfocarDecisiones()} data-aviso-decisiones
    title="Decisiones que esperan tu toque" aria-label={`${n} ${n === 1 ? 'decisión te espera' : 'decisiones te esperan'}`}>
    <i aria-hidden /><b>{n}</b> {n === 1 ? 'te espera' : 'te esperan'}
  </button>
}

/** La sección «Esperan tu toque», dentro de la tarjeta HOY del Día (escritorio y teléfono). */
export function SeccionDecisiones({ b }: { b: Bandeja }) {
  const caja = useRef<HTMLElement>(null)
  const [enfocada, setEnfocada] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)
  // Solo lo que espera: lo vencido ya no ocupa renglón (vive en el historial de la bandeja).
  const pendientes = enOrden(b.vista?.pendientes ?? [])
  const grupos = agruparPorPersona(pendientes)
  const lote = recomendadas(pendientes)
  const hay = pendientes.length > 0

  useEffect(() => {
    const enfocar = (id: string) => {
      const el = caja.current
      if (!el) return
      const fila = id ? el.querySelector<HTMLElement>(`[data-decision="${CSS.escape(id)}"]`) : null
      if (fila) setAbierta(id)
      ;(fila ?? el).scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setEnfocada(true); setTimeout(() => setEnfocada(false), 1600)
      try { sessionStorage.removeItem(CLAVE_ENFOCAR) } catch { /* sin almacenamiento */ }
    }
    const pedido = hay ? leerPedido() : null
    if (pedido !== null) requestAnimationFrame(() => enfocar(pedido))
    const alPedir = (e: Event) => { const id = (e as CustomEvent<{ id?: string }>).detail?.id ?? ''; requestAnimationFrame(() => enfocar(id)) }
    window.addEventListener(EVENTO_ENFOCAR_DECISIONES, alPedir)
    return () => window.removeEventListener(EVENTO_ENFOCAR_DECISIONES, alPedir)
  }, [hay])

  if (!hay) return null
  const fila = (t: Tarjeta, enGrupo: boolean) => <Fila key={t.id} t={t} enGrupo={enGrupo} abierta={abierta === t.id} onAbrir={() => setAbierta(abierta === t.id ? null : t.id)}
    ocupado={b.ocupado === t.id || b.ocupado === 'lote'} onResponder={(r, c) => b.resolver(t.id, r, c)} />
  return <section ref={caja} className={s.seccion} data-enfocada={enfocada || undefined} data-franja-decisiones
    aria-label={`Esperan tu toque: ${pendientes.length}`}>
    <header className={s.cabeza}>
      <span className={s.rotulo}>Esperan tu toque</span>{pendientes.length > 0 && <b className={s.n}>{pendientes.length}</b>}
      {lote.length > 1 && <button className={s.todas} disabled={!!b.ocupado} onClick={() => void b.lote(lote.map(t => t.id), 'si')}
        title="Las que recomiendo y no contactan personas ni pagan. Contactar y pagar van una por una.">Sí a todas · {lote.length}</button>}
    </header>
    <ul className={s.filas}>
      {grupos.map(g => g.tarjetas.length > 1 && g.persona
        ? <li key={g.clave} className={s.grupo} data-persona={g.persona}>
          <div className={s.persona}><span className={s.inicial} aria-hidden>{g.persona.slice(0, 1).toUpperCase()}</span><b>{g.persona}</b><span>{g.tarjetas.length} acciones</span></div>
          <ul className={s.acciones}>{g.tarjetas.map(t => fila(t, true))}</ul>
        </li>
        : fila(g.tarjetas[0], false))}
    </ul>
    {b.error && <p className={s.error} role="alert">{b.error}</p>}
  </section>
}

function Fila({ t, enGrupo, abierta, ocupado, onAbrir, onResponder }: {
  t: Tarjeta; enGrupo: boolean; abierta: boolean; ocupado: boolean; onAbrir: () => void
  onResponder: (r: 'si' | 'no' | 'otro', comentario?: string) => Promise<boolean>
}) {
  const [otro, setOtro] = useState(false), [texto, setTexto] = useState('')
  const rec = lineaRecomendacion(t), exacto = t.detalle ?? t.literal, manos = t.tipo === 'manos', vista = urlVistaPrevia(t)
  const titulo = enGrupo ? tituloEnGrupo(t) : t.titulo
  // La tecla encendida es la que Levy recomienda; la otra, la tapa apagada.
  const prende = t.recomienda === 'no' ? 'no' : 'si'
  return <li className={s.fila} data-abierta={abierta || undefined} data-recomienda={t.recomienda ?? undefined} data-decision={t.id}>
    <div className={s.linea}>
      <button className={s.cuerpo} onClick={onAbrir} aria-expanded={abierta} title={abierta ? 'Plegar' : 'Qué sale exactamente y Otro'}>
        <span className={s.texto}>
          <span className={s.titulo} title={t.titulo}>{titulo}</span>
          <span className={s.meta}>
            <span className={s.categoria} data-categoria={t.categoria}>{etiquetaCategoria(t.categoria)}</span>
            {t.vence && <time className={s.vence} title="A esta hora ya no aplica y vence sola">vence {cuandoVence(t.vence)}</time>}
            {rec && <span className={s.rec} data-tono={t.recomienda === 'no' ? 'no' : 'si'}><b>Levy</b> {rec}</span>}
          </span>
        </span>
        <ChevronDown className={s.chevron} size={14} aria-hidden />
      </button>
      <span className={s.botones}>
        {!manos && <button className={`${tecla.enviar} ${s.tecla}`} data-apagada={prende !== 'si' || undefined} disabled={ocupado} onClick={() => void onResponder('si')}
          aria-label={`Sí: ${t.titulo}`} data-respuesta="si" title={unaPorUna(t) ? 'Esta va sola: contacta a alguien o paga' : undefined}>
          <Check size={13} strokeWidth={2.5} aria-hidden />{t.botonSi ?? 'Sí'}</button>}
        <button className={`${tecla.enviar} ${s.tecla}`} data-apagada={prende !== 'no' || undefined} disabled={ocupado} onClick={() => void onResponder('no')}
          aria-label={`No: ${t.titulo}`} data-respuesta="no"><X size={13} strokeWidth={2.5} aria-hidden />No</button>
      </span>
    </div>
    {abierta && <div className={s.detalle}>
      {vista && <img className={s.vista} src={vista} alt="Vista previa de lo que se publica" loading="lazy" />}
      {exacto && <><h4>Qué sale exactamente</h4><pre>{exacto}</pre></>}
      {manos && <p className={s.nota}>Esto lo corres tú desde su tarjeta en el chat.</p>}
      {!manos && (otro
        ? <form className={s.otro} onSubmit={e => { e.preventDefault(); if (texto.trim()) void onResponder('otro', texto.trim()).then(ok => { if (ok) { setOtro(false); setTexto('') } }) }}>
          <textarea autoFocus rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="¿Qué quieres en su lugar?" aria-label="Qué quieres en su lugar" />
          <div><button type="button" className={s.sutil} onClick={() => setOtro(false)}>Cancelar</button>
            <button type="submit" className={`${tecla.enviar} ${s.tecla}`} disabled={!texto.trim() || ocupado}>Mandar a Levy</button></div>
        </form>
        : <button className={s.sutil} onClick={() => setOtro(true)} data-respuesta="otro"><MessageSquare size={13} aria-hidden />Otro</button>)}
    </div>}
  </li>
}
