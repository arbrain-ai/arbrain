'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as TeclaReact } from 'react'
import { addDays } from 'date-fns'
import { ArrowDownUp, ArrowUpRight, Plus, Repeat2, RotateCcw, Search, Sun, Sunrise, X } from 'lucide-react'
import { usePlanning } from '@/features/planning/usePlanning'
import { mutationFor } from '@/features/planning/model'
import { PlanEditor, type EditorSelection } from '@/features/planning/PlanEditor'
import { useAutoguardado } from '@/features/planning/autoguardado'
import { AvisoHecha, useCompletar } from '@/features/planning/vivo-piezas'
import { etiquetaOrden, siguienteOrden, useOrdenTareas } from '@/features/planning/orden-tareas'
import type { PlanTask } from '@/features/planning/types'
import { civilMidnight, shiftDay } from '@/features/sistema/calendar-days'
import { useCivilClock } from '@/features/sistema/useHabitRecords'
import { isHabitTypingTarget } from '@/features/sistema/habit-shortcuts'
import { escalon, mov } from '@/shared/movimiento'
import { refrescarCabina } from '../datos'
import { agrupar, buscar, contar, DIAS_HECHAS, fechaMovida, rotuloFecha, SEGMENTOS, type Grupo, type Segmento } from './todoist-lista'
import t from './todoist.module.css'

/**
 * Todoist completo dentro de Tareas (5 oct 2026). Daniel firmó retirar /todotask: «un solo lugar por cosa», pensando en
 * su productividad y en la de sus clientes. Lo que espera decisión sigue arriba (Tareas); debajo vive TODO Todoist en
 * cuatro distancias (Hoy · Próximas · Sin fecha · Hechas), con búsqueda, filtro por proyecto y prioridad, y el detalle
 * nuevo (PlanEditor). Escribe por la pluma del calendario (usePlanning → /api/planning → mc-event.py planning).
 *
 * Teclado (con el foco en la lista): ↑↓ o J/K se mueven · X completa · T la pasa a hoy · M a mañana · Enter abre ·
 * N tarea nueva · / busca · 1–4 cambian de distancia · Esc limpia la búsqueda.
 */
type Planning = ReturnType<typeof usePlanning>

/** La lectura de Todoist que usa Tareas: todas las activas y las completadas de dos semanas. */
export function useTodoist() {
  const { today: hoy, timeZone: zona } = useCivilClock()
  const rango = useMemo(() => ({ from: civilMidnight(shiftDay(hoy, -DIAS_HECHAS), zona).toISOString(), to: civilMidnight(shiftDay(hoy, 1), zona).toISOString(), includeCompleted: 'true' }), [hoy, zona])
  const planning = usePlanning(rango)
  const activas = useMemo(() => planning.snapshot?.tasks.filter(x => !x.completed) ?? [], [planning.snapshot])
  const hechas = useMemo(() => planning.snapshot?.completedTasks ?? [], [planning.snapshot])
  const cuentas = useMemo(() => contar(activas, hechas, hoy, zona), [activas, hechas, hoy, zona])
  return { planning, activas, hechas, cuentas, hoy, zona }
}

/** La palomita: se dibuja solo al completar ahora (`dibujar`); en Hechas ya está puesta, sin volver a animarse. */
const Check = ({ dibujar }: { dibujar: boolean }) => <svg viewBox="0 0 12 12" aria-hidden className={dibujar ? mov.palomita : undefined}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
const FILA = 'button[data-tarea-boton]'

export function TareasTodoist({ todoist, onConversar }: { todoist: ReturnType<typeof useTodoist>; onConversar?: (borrador: string) => void }) {
  const { planning, activas: leidas, hechas, hoy, zona } = todoist
  const ocupado = planning.saving || Boolean(planning.pending)
  const raiz = useRef<HTMLDivElement>(null), caja = useRef<HTMLInputElement>(null)
  const [seg, setSeg] = useState<Segmento>('hoy')
  const [q, setQ] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [urgentes, setUrgentes] = useState(false)
  const [seleccion, setSeleccion] = useState<EditorSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [movida, setMovida] = useState<string | null>(null)
  const [modo, ciclarModo] = useOrdenTareas()
  useEffect(() => { try { const v = localStorage.getItem('arbrain.tareas.segmento'); if (v && SEGMENTOS.some(x => x.id === v)) setSeg(v as Segmento) } catch { /* sin almacenamiento */ } }, [])
  useEffect(() => { if (!movida) return; const x = setTimeout(() => setMovida(null), 4000); return () => clearTimeout(x) }, [movida])
  const elegir = (s: Segmento) => { setSeg(s); try { localStorage.setItem('arbrain.tareas.segmento', s) } catch { /* sin almacenamiento */ } }

  const escribir = useCallback(async (op: Parameters<Planning['mutate']>[0]) => {
    setError(null)
    try { const r = await planning.mutate(op); refrescarCabina(1200); return r }
    catch (e) { setError(e instanceof Error ? e.message : 'Todoist no confirmó el cambio.'); throw e }
  }, [planning])
  // Autoguardado de la hoja (5 oct): lo editado se ve ya en la lista y se escribe por la misma pluma; un fallo se avisa aquí y se revierte.
  const auto = useAutoguardado({ ownerId: planning.snapshot?.ownerId, escribir,
    onFallo: (titulo, mensaje) => setError(`No se guardó «${titulo}»: ${mensaje} Volvió a como está en Todoist.`) })
  const snapshot = useMemo(() => planning.snapshot ? auto.aplicar(planning.snapshot) : planning.snapshot, [planning.snapshot, auto])
  const activas = useMemo(() => planning.snapshot ? auto.aplicar({ ...planning.snapshot, events: [], tasks: leidas }).tasks : leidas, [planning.snapshot, leidas, auto])

  const pasa = useCallback((x: PlanTask) => (!proyecto || x.projectId === proyecto) && (!urgentes || x.priority <= 2), [proyecto, urgentes])
  const proyectos = useMemo(() => snapshot?.projects ?? [], [snapshot])
  const nombreProyecto = useMemo(() => new Map(proyectos.map(p => [p.id, p.title])), [proyectos])
  const filtradas = useMemo(() => activas.filter(pasa).sort((a, b) => a.priority - b.priority || (a.due ?? '~').localeCompare(b.due ?? '~')), [activas, pasa])
  const hechasFiltradas = useMemo(() => hechas.filter(pasa), [hechas, pasa])

  const ultimaRef = useRef<PlanTask | null>(null)
  const reabrir = useCallback((x: PlanTask) => { if (snapshot) void escribir({ ...mutationFor(x, snapshot.ownerId, {}, 'reopen'), updatedAt: undefined }).catch(() => {}) }, [snapshot, escribir])
  const c = useCompletar(filtradas, x => snapshot ? escribir(mutationFor(x, snapshot.ownerId, {}, 'complete')) : Promise.reject(new Error('Sin lectura')),
    () => { if (ultimaRef.current) reabrir(ultimaRef.current) }, ocupado)
  useEffect(() => { if (c.ultima) ultimaRef.current = c.ultima }, [c.ultima])
  const indice = useMemo(() => new Map(c.abiertas.map((x, i) => [x.id, i])), [c.abiertas])

  const cuentas = useMemo(() => contar(filtradas, hechasFiltradas, hoy, zona), [filtradas, hechasFiltradas, hoy, zona])
  const grupos: Grupo[] = useMemo(() => q.trim() ? buscar(q, c.abiertas, hechasFiltradas, proyectos)
    : agrupar(seg, c.abiertas, hechasFiltradas, hoy, zona, proyectos, modo), [q, seg, c.abiertas, hechasFiltradas, hoy, zona, proyectos, modo])

  const mover = (x: PlanTask, cual: 'hoy' | 'manana') => {
    if (!snapshot || ocupado) return
    const dia = cual === 'hoy' ? hoy : shiftDay(hoy, 1)
    void escribir(mutationFor(x, snapshot.ownerId, { due: fechaMovida(x, dia, zona), ...(x.durationMinutes ? { durationMinutes: x.durationMinutes } : {}) }))
      .then(() => setMovida(`«${x.title}» pasó a ${cual === 'hoy' ? 'hoy' : 'mañana'}.`), () => {})
  }
  const nueva = () => {
    if (!snapshot) return
    setSeleccion(seg === 'sinFecha' ? { kind: 'task' } : { kind: 'task', allDay: true, start: seg === 'proximas' ? addDays(new Date(), 1) : new Date() })
  }

  // `/` desde cualquier lugar quieto de la página (no desde el chat ni otro campo) lleva al buscador.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isHabitTypingTarget(e.target)) return
      const target = e.target instanceof Element ? e.target : null
      if (target && target !== document.body && !raiz.current?.contains(target)) return
      e.preventDefault(); caja.current?.focus()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const filas = () => [...(raiz.current?.querySelectorAll<HTMLButtonElement>(FILA) ?? [])]
  const tareaDe = (b: Element | null) => { const id = b?.closest<HTMLElement>('[data-tarea-id]')?.dataset.tareaId; return id ? [...c.abiertas, ...hechas].find(x => x.id === id) : undefined }
  const tecla = (e: TeclaReact<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    if (target.closest('[role="dialog"]')) return
    if (target === caja.current) {
      if (e.key === 'Escape') { e.preventDefault(); if (q) setQ(''); else caja.current?.blur() }
      else if (e.key === 'ArrowDown' || e.key === 'Enter') { const f = filas()[0]; if (f) { e.preventDefault(); if (e.key === 'Enter') f.click(); else f.focus() } }
      return
    }
    if (isHabitTypingTarget(target)) return
    const k = e.key.toLowerCase(), lista = filas(), i = lista.indexOf(document.activeElement as HTMLButtonElement)
    const ir = (n: number) => { const f = lista[Math.max(0, Math.min(lista.length - 1, n))]; if (f) { e.preventDefault(); f.focus(); f.scrollIntoView({ block: 'nearest' }) } }
    if (k === 'arrowdown' || k === 'j') return ir(i + 1)
    if (k === 'arrowup' || k === 'k') { if (i <= 0) { e.preventDefault(); caja.current?.focus(); return } return ir(i - 1) }
    if (k === '/') { e.preventDefault(); caja.current?.focus(); return }
    if (k === 'n') { e.preventDefault(); nueva(); return }
    if (/^[1-4]$/.test(k)) { e.preventDefault(); setQ(''); elegir(SEGMENTOS[Number(k) - 1].id); return }
    if (k === 'escape' && q) { e.preventDefault(); setQ(''); return }
    const x = i >= 0 ? tareaDe(lista[i]) : undefined
    if (!x) return
    if (k === 'x') { e.preventDefault(); if (x.completed) reabrir(x); else { const n = indice.get(x.id); if (n != null) c.completar(x, n) } }
    else if ((k === 't' || k === 'm') && !x.completed) { e.preventDefault(); mover(x, k === 't' ? 'hoy' : 'manana') }
  }

  const buscando = q.trim().length > 0
  const total = grupos.reduce((n, g) => n + g.tareas.length, 0)
  let n = 0
  return <div ref={raiz} className={t.lista} data-todoist onKeyDown={tecla}>
    <div className={t.barra}>
      <label className={t.buscador}>
        <Search size={14} aria-hidden />
        <input ref={caja} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en todo Todoist" aria-label="Buscar tareas" enterKeyHint="search" />
        {q ? <button onClick={() => { setQ(''); caja.current?.focus() }} aria-label="Limpiar búsqueda"><X size={13} /></button> : <kbd aria-hidden>/</kbd>}
      </label>
      <button className={t.nueva} onClick={nueva} disabled={!snapshot || ocupado} aria-label="Tarea nueva (N)" title="Tarea nueva · N"><Plus size={16} aria-hidden /></button>
    </div>

    {!buscando && <div className={t.segmentos} role="tablist" aria-label="Distancia">
      {SEGMENTOS.map((x, i) => <button key={x.id} role="tab" aria-selected={seg === x.id} className={t.segmento} onClick={() => elegir(x.id)} title={`${x.etiqueta} · ${i + 1}`}>
        {x.etiqueta}{snapshot && <small data-oro={x.id === 'hoy' && cuentas.vencidas > 0 || undefined}>{x.id === 'hoy' ? cuentas.hoy : x.id === 'proximas' ? cuentas.proximas : x.id === 'sinFecha' ? cuentas.sinFecha : cuentas.hechas}</small>}
      </button>)}
    </div>}

    <div className={t.filtros}>
      <label className={t.filtro} data-activo={proyecto || undefined}>
        <select value={proyecto} onChange={e => setProyecto(e.target.value)} aria-label="Proyecto">
          <option value="">Todos los proyectos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>
      <button className={t.filtro} aria-pressed={urgentes} onClick={() => setUrgentes(v => !v)} title="Solo prioridad 1 y 2">P1–P2</button>
      {!buscando && (seg === 'hoy' || seg === 'proximas') && <button className={t.filtro} onClick={ciclarModo} data-orden
        aria-label={`Ordenar por ${etiquetaOrden(modo)}. Tocar para ordenar por ${etiquetaOrden(siguienteOrden(modo))}`} title={`Orden: ${etiquetaOrden(modo)} · toca para ${etiquetaOrden(siguienteOrden(modo))}`}>
        <ArrowDownUp size={12} aria-hidden />{etiquetaOrden(modo)}</button>}
      {buscando && <span className={t.resultados}>{total} {total === 1 ? 'resultado' : 'resultados'}</span>}
    </div>

    {error && <p className={t.aviso} role="status"><span>{error}</span>{planning.pending && !planning.saving && <button onClick={() => void planning.mutate(planning.pending!).catch(() => {})}>Reintentar</button>}</p>}
    {snapshot?.health.some(h => ['todoist', 'completed'].includes(h.id) && h.state !== 'fresh') && <p className={t.aviso}><span>Todoist no respondió del todo: la lista puede estar incompleta.</span><button onClick={() => void planning.refresh()}>Releer</button></p>}

    {!snapshot ? <p className={t.vacio}>{planning.loading ? 'Leyendo Todoist…' : planning.error ?? 'No se pudo leer Todoist.'}</p>
      : !grupos.length ? <p className={t.vacio}>{buscando ? `Nada coincide con «${q.trim()}».` : vacioDe(seg, Boolean(proyecto || urgentes))}</p>
      : grupos.map(g => <section key={g.id} className={t.grupo} data-tono={g.tono} aria-label={g.titulo}>
        <h4 className={t.grupoTitulo}>{g.titulo}<small>{g.tareas.length}</small></h4>
        <div className={t.filas}>{g.tareas.map(x => {
          const hecha = x.completed, animando = !!c.animando[x.id], fecha = !hecha ? rotuloFecha(x, hoy, zona) : null
          const p = x.projectId && !g.id.startsWith('proyecto:') ? nombreProyecto.get(x.projectId) : undefined
          return <div key={`${g.id}:${x.id}`} className={`${t.fila} ${mov.entra}`} style={{ ...escalon(Math.min(n++, 14)) } as CSSProperties} data-tarea-id={x.id}
            data-hecha={hecha || animando || undefined} data-cerrada={hecha || undefined} data-prio={x.priority < 4 ? x.priority : undefined}>
            <div className={t.filaDentro}>
              <button className={t.check} onClick={() => { if (hecha) reabrir(x); else { const i = indice.get(x.id); if (i != null) c.completar(x, i) } }} disabled={ocupado && !hecha || animando}
                aria-label={hecha ? `Reabrir «${x.title}»` : `Completar «${x.title}»`} title={hecha ? 'Reabrir en Todoist' : 'Completar en Todoist · X'}><Check dibujar={!hecha} /></button>
              <button className={t.cuerpo} data-tarea-boton onClick={() => setSeleccion({ item: x })} title={x.title}>
                <span className={t.titulo}>{x.title}</span>
                {(fecha || p || x.recurring || (hecha && x.completedAt)) && <span className={t.meta}>
                  {fecha && <span data-tono={fecha.tono}>{fecha.texto}</span>}
                  {hecha && x.completedAt && <span>{new Date(x.completedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona })}</span>}
                  {x.priority < 3 && <span className={t.prio} data-prio={x.priority}>P{x.priority}</span>}
                  {p && <span>{p}</span>}
                  {x.recurring && <Repeat2 size={11} aria-label="Se repite" />}
                </span>}
              </button>
              {hecha ? <button className={t.rapida} onClick={() => reabrir(x)} title="Reabrir"><RotateCcw size={13} aria-hidden /><span>Reabrir</span></button>
                : <span className={t.rapidas}>
                  {fecha?.texto.startsWith('Hoy') ? null : <button className={t.rapida} onClick={() => mover(x, 'hoy')} disabled={ocupado} title="Pasar a hoy · T" aria-label={`Pasar «${x.title}» a hoy`}><Sun size={13} aria-hidden /><span>Hoy</span></button>}
                  {fecha?.texto.startsWith('Mañana') ? null : <button className={t.rapida} onClick={() => mover(x, 'manana')} disabled={ocupado} title="Pasar a mañana · M" aria-label={`Pasar «${x.title}» a mañana`}><Sunrise size={13} aria-hidden /><span>Mañana</span></button>}
                </span>}
            </div>
          </div>
        })}</div>
      </section>)}

    {(c.ultima || movida) && <div className={t.avisos}>
      <AvisoHecha ultima={c.ultima} onDeshacer={c.deshacer} />
      {movida && <p className={t.movida} role="status">{movida}</p>}
    </div>}
    <p className={t.teclas} aria-hidden><span><kbd>↑</kbd><kbd>↓</kbd> moverte</span><span><kbd>X</kbd> completar</span><span><kbd>T</kbd> hoy</span><span><kbd>M</kbd> mañana</span><span><kbd>N</kbd> nueva</span><span><kbd>/</kbd> buscar</span></p>
    {snapshot && <a className={t.todoist} href="https://app.todoist.com/app/today" target="_blank" rel="noopener noreferrer">Abrir Todoist <ArrowUpRight size={12} aria-hidden /></a>}

    {seleccion && snapshot && <PlanEditor key={seleccion.item?.id ?? `nueva:${seleccion.start?.getTime() ?? 'sin'}`} selection={seleccion} snapshot={snapshot} saving={planning.saving}
      unresolved={Boolean(planning.pending) && !planning.saving && !(planning.pending?.action === 'update' && planning.pending.externalId === seleccion.item?.externalId)} auto={auto} onSave={escribir} onRetry={() => planning.pending ? planning.mutate(planning.pending) : Promise.resolve()}
      onAbrir={setSeleccion} onConversar={onConversar} onClose={() => { setSeleccion(null); requestAnimationFrame(() => raiz.current?.querySelector<HTMLButtonElement>(FILA)?.focus({ preventScroll: true })) }} />}
  </div>
}

function vacioDe(seg: Segmento, filtrado: boolean) {
  if (filtrado) return 'Nada con estos filtros.'
  return seg === 'hoy' ? 'Nada pendiente para hoy.' : seg === 'proximas' ? 'Nada programado para los próximos días.' : seg === 'sinFecha' ? 'Todo lo que tienes ya tiene fecha.' : `Sin tareas completadas en ${DIAS_HECHAS} días.`
}
