'use client'
import { useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { enDias, piedrasPrecargadas, ROTULO_PIEDRA, type EventoPiedra, type Piedra } from './ano-precargado'
import a from './ano-precargado.module.css'

/** Horizonte del Año Precargado en el Mes: cuatro meses (dos lecturas de 60 días: el proveedor limita cada una a 65). */
const HORIZONTE_DIAS = 120
const cache = new Map<string, { en: number; eventos: EventoPiedra[] }>()

function useEventosHorizonte(hoy: string) {
  const [eventos, setEventos] = useState<EventoPiedra[] | null>(() => cache.get(hoy)?.eventos ?? null)
  useEffect(() => {
    const hit = cache.get(hoy)
    if (hit && Date.now() - hit.en < 60_000) { setEventos(hit.eventos); return }
    let vivo = true
    const base = parseISO(hoy)
    const ventanas = [0, 60].map(k => ({ from: addDays(base, k).toISOString(), to: addDays(base, k + 60).toISOString() }))
    Promise.all(ventanas.map(w => fetch(`/api/planning?${new URLSearchParams(w)}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
      .then(r => r.ok ? r.json() : Promise.reject()).then(b => (b.events ?? []) as EventoPiedra[])))
      .then(listas => { const todos = listas.flat(); cache.set(hoy, { en: Date.now(), eventos: todos }); if (vivo) setEventos(todos) })
      .catch(() => { if (vivo) setEventos(e => e ?? []) })
    return () => { vivo = false }
  }, [hoy])
  return eventos
}

const quita = (s: string) => s.replace(/\./g, '')
function cuando(p: Piedra) {
  const x = parseISO(p.desde), y = parseISO(p.hasta)
  if (p.desde === p.hasta) return quita(format(x, 'EEE d MMM', { locale: es }))
  return x.getMonth() === y.getMonth() ? `${format(x, 'd')}–${quita(format(y, 'd MMM', { locale: es }))}` : `${quita(format(x, 'd MMM', { locale: es }))} – ${quita(format(y, 'd MMM', { locale: es }))}`
}

/**
 * El Año Precargado en el Mes (25 oct 2026): lo que ya está puesto antes que el trabajo, con premio, viaje y lanzamiento primero.
 * Sin ninguno, una invitación discreta a precargarlo con Levy. Solo lectura: se escribe en Google por `mc-event.py`.
 */
export function AnoPrecargado({ hoy }: { hoy: string }) {
  const eventos = useEventosHorizonte(hoy)
  const horizonte = useMemo(() => format(addDays(parseISO(hoy), HORIZONTE_DIAS), 'yyyy-MM-dd'), [hoy])
  const piedras = useMemo(() => eventos ? piedrasPrecargadas(eventos, hoy, horizonte) : null, [eventos, hoy, horizonte])
  if (!piedras) return <section className={a.caja} aria-label="Año precargado"><h3 className={a.rotulo}>Año precargado</h3><p className={a.nota}>Leyendo lo que ya está puesto…</p></section>
  const primero = piedras.filter(p => p.tipo !== 'piedra').slice(0, 5)
  const resto = piedras.filter(p => p.tipo === 'piedra').slice(0, 4)
  return <section className={a.caja} aria-label="Año precargado: premios, viajes y lanzamientos primero">
    <h3 className={a.rotulo}>Año precargado<small>los próximos 4 meses</small></h3>
    {primero.length === 0 && <p className={a.nota}>Aún no hay premio, viaje ni lanzamiento puestos. Dile a Levy «precarguemos el año»: primero lo que te espera, luego el trabajo.</p>}
    {primero.length > 0 && <ul className={a.lista}>{primero.map(p => { const n = enDias(hoy, p.desde)
      return <li key={p.id} data-tipo={p.tipo}><span className={a.tipo}>{ROTULO_PIEDRA[p.tipo]}</span><b>{p.titulo}</b><small>{cuando(p)} · {n === 0 ? 'en curso' : n === 1 ? 'mañana' : `en ${n} días`}</small></li> })}</ul>}
    {resto.length > 0 && <ul className={a.piedras} aria-label="Otras piedras grandes">{resto.map(p => <li key={p.id}><span>{p.titulo}</span><small>{cuando(p)}</small></li>)}</ul>}
  </section>
}
