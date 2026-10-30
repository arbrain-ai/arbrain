'use client'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { escalon, mov } from '@/shared/movimiento'
import { estiloEvento } from '@/lib/calendar/contraste'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageCircle, Repeat2 } from 'lucide-react'
import { hasTime } from './model'
import { rotuloEstado, type ObjetivoPeriodo } from './periodo-vivo'
import type { PlanEvent, PlanTask, PlanningSnapshot } from './types'
import { avance, duracion, faltan, tituloCumplido, type Bloque } from './dia-vivo'
import type { PlanItem } from './types'
import d from './dia-vivo.module.css'

/**
 * Piezas compartidas de las escalas vivas (Día, 4 días, Semana, Mes · 5 oct 2026): el mismo objetivo, las mismas tarjetas y el mismo
 * completar animado en las cuatro, para que cambiar de escala sea cambiar de distancia, no de aplicación.
 */
/** El escalonado del lenguaje de movimiento común (shared/movimiento). */
export const esc = escalon
export const hora = (t: number) => format(t, 'HH:mm')
export const sinEmoji = (s: string) => s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')

export function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return ahora
}

export const CHECK = <svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>

/** La estrella del objetivo cumplido: se llena en morado de marca y suelta un destello de chispas, una sola vez (al tocarla). */
export function Estrella({ cumplido, onCumplir, titulo }: { cumplido: boolean; onCumplir: () => void; titulo: string }) {
  const [recien, setRecien] = useState(false)
  useEffect(() => { if (!recien) return; const t = setTimeout(() => setRecien(false), 1100); return () => clearTimeout(t) }, [recien])
  return <button className={d.estrella} data-cumplido={cumplido || undefined} data-recien={recien || undefined} aria-pressed={cumplido}
    aria-label={cumplido ? `Objetivo cumplido: ${titulo}. Tocar para desmarcar` : `Marcar como cumplido: ${titulo}`} title={cumplido ? 'Cumplido · tocar para desmarcar' : 'Marcar como cumplido'}
    onClick={() => { if (!cumplido) setRecien(true); onCumplir() }}>
    <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" /></svg>
    {recien && <span className={d.chispas} aria-hidden>{Array.from({ length: 8 }, (_, n) => <i key={n} style={{ ['--a' as string]: `${n * 45}deg` } as CSSProperties} />)}</span>}
  </button>
}

/**
 * Completar animado: la palomita se dibuja y la tarjeta se pliega; si Todoist rechaza, vuelve (el aviso del calendario dice por qué).
 * `hechas`: animándose (se retienen aunque la lectura nueva ya no las traiga); `fuera`: confirmadas y ya plegadas.
 */
export function useCompletar(tareas: PlanTask[], onCompletar: (t: PlanTask) => Promise<unknown>, onDeshacer: () => void, ocupado: boolean) {
  const [hechas, setHechas] = useState<Record<string, { t: PlanTask; i: number }>>({})
  const [fuera, setFuera] = useState<ReadonlySet<string>>(() => new Set())
  const [ultima, setUltima] = useState<PlanTask | null>(null)
  useEffect(() => { if (!ultima) return; const t = setTimeout(() => setUltima(null), 7000); return () => clearTimeout(t) }, [ultima])
  const soltar = (id: string) => setHechas(h => { const n = { ...h }; delete n[id]; return n })
  function completar(t: PlanTask, i: number) {
    if (hechas[t.id] || ocupado) return
    const t0 = Date.now()
    setHechas(h => ({ ...h, [t.id]: { t, i } }))
    onCompletar(t).then(() => {
      setUltima(t)
      setTimeout(() => { setFuera(f => new Set(f).add(t.id)); soltar(t.id) }, Math.max(0, 950 - (Date.now() - t0)))
    }, () => soltar(t.id))
  }
  const abiertas = useMemo(() => {
    const lista = tareas.filter(t => !t.completed && !fuera.has(t.id))
    for (const { t, i } of Object.values(hechas).sort((a, b) => a.i - b.i)) if (!lista.some(x => x.id === t.id)) lista.splice(Math.min(i, lista.length), 0, t)
    return lista
  }, [tareas, fuera, hechas])
  const deshacer = () => {
    if (!ultima) return
    const u = ultima
    setUltima(null); soltar(u.id); setFuera(f => { const n = new Set(f); n.delete(u.id); return n }); onDeshacer()
  }
  return { abiertas, animando: hechas, completar, ultima, deshacer, enVuelo: Object.keys(hechas).length }
}

/** La tarea en una línea (hoja del día, 5 oct 2026, «tareas más compactas»): palomita, título, hora y P1. El objetivo, en oro. */
export function FilaTarea({ t, i, hecha, ocupado, proyecto, objetivo, vencida, onCompletar, onAbrir }: {
  t: PlanTask; i: number; hecha: boolean; ocupado: boolean; proyecto?: string; objetivo?: boolean
  /** Venció antes de hoy (18 oct 2026, orden por hora): sube arriba con una marca roja sutil y su fecha. */
  vencida?: boolean
  onCompletar: () => void; onAbrir: () => void
}) {
  const conHora = hasTime(t.due), inicio = t.due ? parseISO(t.due) : null
  return <div className={`${d.fila} ${d.entra}`} style={esc(i)} data-hecha={hecha || undefined} data-prio={t.priority < 3 ? t.priority : undefined} data-objetivo={objetivo || undefined} data-vencida={vencida || undefined}>
    <button className={d.check} onClick={onCompletar} disabled={hecha || ocupado} aria-label={`Completar ${t.title}`} title={objetivo ? 'Cumplir el objetivo (completa la tarea)' : 'Completar en Todoist'}>{CHECK}</button>
    <button className={d.filaCuerpo} onClick={onAbrir} title={proyecto ? `${t.title} · ${proyecto}` : t.title}>
      <span className={d.filaTitulo}>{t.title}</span>
      {vencida && inicio && <span className={d.vencio} title="Vencida">{format(inicio, 'd MMM', { locale: es })}</span>}
      {conHora && inicio && !vencida && <time className={d.horaTarea} dateTime={t.due!}>{format(inicio, 'HH:mm')}{t.durationMinutes ? <small> · {duracion(t.durationMinutes)}</small> : null}</time>}
      {t.priority === 1 && !objetivo && <span className={d.prio} data-prio={1}>P1</span>}
      {t.recurring && <Repeat2 size={11} aria-label="Se repite" />}
    </button>
  </div>
}

/** «Hecha: … · Deshacer» (7 s), el mismo en todas las escalas. */
export function AvisoHecha({ ultima, onDeshacer }: { ultima: PlanTask | null; onDeshacer: () => void }) {
  if (!ultima) return null
  return <p className={d.deshacer} role="status"><span>Hecha: «{ultima.title}»{ultima.recurring ? ' · su próxima repetición quedó programada' : ''}</span>
    {!ultima.recurring && <button onClick={onDeshacer}>Deshacer</button>}</p>
}

/** Los colores de un evento con contraste medido (el mismo cálculo de la rejilla), para claro y oscuro. Va con la clase global `ev-color`. */
const tintes = new Map<string, CSSProperties>()
export function tinte(color: string | null): CSSProperties {
  const k = color ?? ''
  let t = tintes.get(k)
  if (!t) { t = estiloEvento(color) as CSSProperties; tintes.set(k, t) }
  return t
}

export const proyectosDe = (snapshot: PlanningSnapshot | null) => new Map(snapshot?.projects.map(p => [p.id, p.title]) ?? [])

/**
 * «Lo justo que debería estar haciendo» (6 oct 2026): el bloque en curso con su rango, su barra y «quedan X · luego Y a las HH:MM».
 * Sin bloque en curso muestra el siguiente («Luego»), sin barra. La usan el Día (arriba) y el Mes (lista del día elegido).
 */
export function TarjetaAhora({ actual, sigue, ahora, onAbrir, className }: {
  actual?: Bloque; sigue?: Bloque; ahora: number; onAbrir: (item: PlanItem) => void; className?: string
}) {
  const b = actual ?? sigue
  if (!b) return null
  return <button className={`${d.enCurso} ${className ?? ''}`} data-proximo={actual ? undefined : true} style={{ ['--c' as string]: b.color ?? 'var(--gold)' }} onClick={() => onAbrir(b.evento)}>
    <span className={d.enCursoCeja}><b>{actual ? 'Ahora' : 'Luego'}</b> · {hora(b.inicio)} – {hora(b.fin)}</span>
    <strong>{b.titulo}</strong>
    {actual && <span className={d.barra} aria-hidden><i style={{ width: `${Math.round(avance(actual, ahora) * 100)}%` }} /></span>}
    <small>{actual
      ? <>Quedan {duracion((actual.fin - ahora) / 60000)}{sigue ? <> · luego <em>{sinEmoji(sigue.titulo)}</em> a las {hora(sigue.inicio)}</> : ''}</>
      : <>Empieza {faltan((b.inicio - ahora) / 60000)} · dura {duracion((b.fin - b.inicio) / 60000)}</>}</small>
  </button>
}
