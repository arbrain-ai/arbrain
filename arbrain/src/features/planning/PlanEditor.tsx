'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { addMonths, format, isSameDay, isSameMonth, parseISO, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock, CornerDownLeft, ExternalLink, FileText, Flag, Folder,
  Github, Hash, Link2, Loader2, MapPin, MessageCircle, MoreHorizontal, Plus, Repeat2, Trash2, Undo2, Users, Video, X } from 'lucide-react'
import { mutationFor } from './model'
import type { Autoguardado } from './autoguardado'
import { borradorConversacion, borradorDe, cambios, datosDe, datosDeCambio, DURACIONES, enlaces, etiquetaDuracion, etiquetaFecha, fechasRapidas, HORAS,
  leerHora, proximaMediaHora, semanasDelMes, type Borrador, type Enlace } from './detalle'
import type { MutationResult, PlanEvent, PlanItem, PlanMutation, PlanTask, PlanningSnapshot } from './types'
import styles from './detalle.module.css'

export interface EditorSelection { item?: PlanItem; start?: Date; end?: Date; allDay?: boolean; kind?: 'event' | 'task'; freshRange?: boolean; confirmDelete?: boolean
  titulo?: string; prioridad?: number; etiquetas?: string[] }

type Pop = 'fecha' | 'prioridad' | 'proyecto' | 'calendario' | 'repetir' | 'mas' | null
type Confirmar = 'borrar' | 'aEvento' | 'aTarea' | null
const PRIORIDADES = [{ p: 1, label: 'Prioridad 1', corta: 'P1' }, { p: 2, label: 'Prioridad 2', corta: 'P2' }, { p: 3, label: 'Prioridad 3', corta: 'P3' }, { p: 4, label: 'Sin prioridad', corta: 'P4' }]
const REPETIR = [{ v: '', label: 'No se repite' }, { v: 'RRULE:FREQ=DAILY', label: 'Cada día' }, { v: 'RRULE:FREQ=WEEKLY', label: 'Cada semana' }, { v: 'RRULE:FREQ=MONTHLY', label: 'Cada mes' }]
const ZONA = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const escribiendo = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')

/**
 * La hoja de detalle del calendario (5 oct 2026, «le doy clic a una tarea… dame lo mejor que te imagines»).
 * Referentes: Things 3, Linear, Todoist y Notion Calendar. Hoja lateral sin oscurecer el fondo (en angosto, hoja inferior),
 * título que envuelve, propiedades como chips con selectores rápidos, contexto en markdown, subtareas, enlaces detectados,
 * «Conversar con Levy», completar con animación, atajos y AUTOGUARDADO con deshacer (sin botón «Guardar cambios»).
 * Escribe siempre por la misma pluma (`onSave` = commit del calendario → /api/planning → mc-event.py planning). Las ediciones
 * no las guarda la hoja: las declara al guardián (`auto`, autoguardado.ts), que las pinta al instante y las escribe aunque la hoja se cierre.
 */
export function PlanEditor({ selection, snapshot, saving, unresolved, auto, onClose, onSave, onRetry, onUndo, onAbrir, onConversar, onAviso, drip, acento }: {
  selection: EditorSelection; snapshot: PlanningSnapshot; saving: boolean; unresolved: boolean
  /** El guardián del autoguardado: vive en la pantalla, no en la hoja, y sobrevive a que la hoja se cierre o se desmonte. */
  auto: Autoguardado
  onClose: () => void; onSave: (mutation: PlanMutation) => Promise<MutationResult>; onRetry: () => Promise<unknown>
  onUndo?: () => Promise<unknown> | void; onAbrir?: (selection: EditorSelection) => void
  onConversar?: (borrador: string) => void; onAviso?: (texto: string, deshacer?: boolean) => void
  /** DRIP del evento (24 oct 2026, HojaDrip): su cuadrante con un toque para corregirlo, «Delegar a Levy» y proteger. Lo pone el calendario. */
  drip?: ReactNode
  /**
   * El color del evento en el calendario (25 oct 2026, Daniel: «el color del bloque, del riel, de la barra lateral del detalle y del
   * cuadrante marcado es SIEMPRE el de su DRIP»): lo pone el calendario (`colorEvento`). El calendario de origen ya no colorea la hoja.
   */
  acento?: string | null
}) {
  const inicial = selection.item
  // El elemento VIVO (con la capa optimista del guardián): tras cada guardado trae su etag nuevo; deshacer lo cambia por fuera.
  const item: PlanItem | undefined = useMemo(() => inicial && ([...snapshot.events, ...snapshot.tasks].find(i => i.id === inicial.id) ?? inicial), [inicial, snapshot.events, snapshot.tasks])
  const key = `arbrain:planning:draft:${snapshot.ownerId}:${inicial?.id ?? 'new'}`
  const [draft, setDraft] = useState<Borrador>(() => borradorDe(selection, snapshot))
  // Cómo estaba al abrir: «Deshacer» de la hoja vuelve aquí (y lo escribe de vuelta).
  const [base, setBase] = useState<Borrador>(() => borradorDe(selection, snapshot))
  const tocadas = useRef(new Set<string>())
  const enviado = useRef(JSON.stringify(base))
  const [error, setError] = useState<string | null>(null)
  const [pop, setPop] = useState<Pop>(null)
  const [confirmar, setConfirmar] = useState<Confirmar>(() => selection.confirmDelete && inicial?.kind === 'event' && inicial.editable ? 'borrar' : null)
  const [editandoNotas, setEditandoNotas] = useState(false)
  const [completando, setCompletando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [restored, setRestored] = useState(false)
  const panel = useRef<HTMLElement>(null), titulo = useRef<HTMLTextAreaElement>(null)
  const opener = useRef<Element | null>(null)
  const autoRef = useRef(auto); autoRef.current = auto
  const patch = useCallback((values: Partial<Borrador>) => { setDraft(d => ({ ...d, ...values })); setError(null) }, [])

  const isNew = !inicial
  const readOnly = item?.kind === 'event' && !item.editable
  const recurring = item?.kind === 'event' ? Boolean(item.recurringEventId) : item?.kind === 'task' ? item.recurring : false
  const bloqueado = unresolved || readOnly || completando
  const source = snapshot.sources.find(s => s.id === draft.sourceId)
  const proyecto = snapshot.projects.find(p => p.id === draft.projectId)
  const guardado = item && !isNew ? auto.estado(item.id) : { fase: 'quieto' as const, error: undefined }
  const firmaDraft = JSON.stringify(draft)
  const firmaBase = JSON.stringify(base)

  // Cada cambio se declara al guardián: lo pinta ya en la agenda, el riel y las escalas, y lo escribe tras una pausa corta.
  useEffect(() => {
    if (isNew || readOnly || !item || unresolved || firmaDraft === enviado.current) return
    if (!draft.title.trim()) { setError('Dale un nombre: un título vacío no se guarda.'); return }
    for (const k of cambios(draft, base)) tocadas.current.add(k)
    let data: Record<string, unknown>
    try { data = datosDeCambio(draft, base, ZONA(), tocadas.current) } catch (err) { setError(err instanceof Error ? err.message : 'Revisa los datos.'); return }
    const soloProyecto = item.kind === 'task' && tocadas.current.size > 0 && [...tocadas.current].every(k => k === 'projectId')
    const mover = item.kind === 'task' && tocadas.current.has('projectId') ? draft.projectId || null : null
    enviado.current = firmaDraft
    auto.editar({ item, data: soloProyecto ? null : data, mover })
  }, [firmaDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rebase: si nadie escribe encima y no hay nada en vuelo, el borrador sigue a la lectura viva (⌘Z, otra pantalla).
  const vivo = useMemo(() => item ? JSON.stringify(borradorDe({ item }, snapshot)) : '', [item, snapshot])
  useEffect(() => {
    if (!vivo || (guardado.fase !== 'quieto' && guardado.fase !== 'guardado') || firmaDraft !== enviado.current || vivo === firmaDraft) return
    const next: Borrador = JSON.parse(vivo)
    enviado.current = vivo; setDraft(next)
    if (guardado.fase === 'quieto') { setBase(next); tocadas.current.clear() }
  }, [vivo, guardado.fase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    opener.current = document.activeElement
    if (isNew) try {
      const value = sessionStorage.getItem(key)
      if (value && !selection.freshRange) { const saved = JSON.parse(value); if (saved?.day !== undefined && (saved.title?.trim() || saved.description?.trim())) { setDraft(saved); setRestored(true) } }
    } catch { /* el borrador local es opcional */ }
    const timer = window.setTimeout(() => { if (selection.confirmDelete) return; if (isNew) titulo.current?.focus(); else panel.current?.focus({ preventScroll: true }) }, 40)
    return () => {
      clearTimeout(timer)
      // Desmontarse (cerrar, otra hoja, la pantalla que se repinta) nunca tira lo escrito: el guardián lo escribe ya.
      if (inicial) void autoRef.current.vaciar(inicial.id)
      // Devolver el foco a quien abrió; si ya no existe (la lista se volvió a pintar), al calendario, nunca a un nodo desmontado.
      const quien = opener.current as HTMLElement | null
      if (quien?.isConnected) quien.focus?.(); else (panel.current?.closest('[data-planning-calendar]') as HTMLElement | null)?.focus?.()
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isNew) try { sessionStorage.setItem(key, JSON.stringify(draft)) } catch { /* noop */ } }, [draft, key, isNew])
  // Título que envuelve: el textarea crece con su texto.
  useLayoutEffect(() => { const t = titulo.current; if (t) { t.style.height = '0px'; t.style.height = t.scrollHeight + 'px' } }, [draft.title])

  // Cerrar es inmediato: lo pendiente ya se ve en la agenda y el guardián lo escribe; si Google no lo confirma, avisa y lo revierte.
  const cerrar = useCallback(() => {
    if (item && !isNew) {
      if (!draft.title.trim() && firmaDraft !== firmaBase) onAviso?.('El título quedó vacío: no se guardó ese cambio.')
      void autoRef.current.vaciar(item.id)
    }
    onClose()
  }, [item, isNew, draft.title, firmaDraft, firmaBase, onAviso, onClose])
  const deshacer = () => { setDraft(base); setError(null) }

  async function correr(fn: () => Promise<void>) {
    if (ocupado || saving) return
    setOcupado(true); setError(null)
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar la acción.') } finally { setOcupado(false) }
  }

  const crear = () => correr(async () => {
    const data = datosDe(draft, ZONA())
    if (draft.kind === 'event' && !source) throw new Error('Elige un calendario disponible.')
    await onSave({ ownerId: snapshot.ownerId, requestId: crypto.randomUUID(), kind: draft.kind, action: 'create', account: source?.account, calendarId: source?.calendarId, data })
    try { sessionStorage.removeItem(key) } catch { /* noop */ }
    onAviso?.(draft.kind === 'task' ? `Tarea creada: «${draft.title.trim()}».` : `Evento creado: «${draft.title.trim()}».`)
    onClose()
  })

  const completar = () => {
    if (item?.kind !== 'task' || completando || saving || ocupado) return
    setCompletando(true)
    void (async () => {
      await new Promise(r => setTimeout(r, 520))
      try {
        await auto.vaciar(item.id)
        await onSave(mutationFor(item, snapshot.ownerId, {}, 'complete'))
        onAviso?.(item.recurring ? `Hecha: «${item.title}». Vuelve en su próxima fecha.` : `Completada: «${item.title}».`, !item.recurring)
        onClose()
      } catch (err) { setCompletando(false); setError(err instanceof Error ? err.message : 'No se pudo completar.') }
    })()
  }

  const borrar = () => item?.kind === 'event' && correr(async () => {
    await auto.vaciar(item.id)
    await onSave(mutationFor(item, snapshot.ownerId, {}, 'delete'))
    onAviso?.(`Borrado: «${item.title}».`, !recurring)
    onClose()
  })

  // Convertir: crea el otro tipo por su pluma y cierra el original (la tarea se completa; el evento se borra). Ambos pasos quedan en ⌘Z.
  const convertir = () => item && correr(async () => {
    await auto.vaciar(item.id)
    if (item.kind === 'task') {
      const destino = snapshot.sources.find(s => s.editable && !s.objective)
      if (!destino) throw new Error('No hay un calendario editable para crear el evento.')
      const hoy = new Date(), inicio = draft.time ? null : proximaMediaHora(hoy)
      const ev: Borrador = { ...draft, kind: 'event', sourceId: destino.id, day: draft.day || format(hoy, 'yyyy-MM-dd'),
        time: draft.time || (draft.day && draft.day !== format(hoy, 'yyyy-MM-dd') ? '09:00' : format(inicio!, 'HH:mm')), minutes: draft.minutes || 30, endDay: '', location: '' }
      const r = await onSave({ ownerId: snapshot.ownerId, requestId: crypto.randomUUID(), kind: 'event', action: 'create', account: destino.account, calendarId: destino.calendarId, data: datosDe(ev, ZONA()) })
      await onSave(mutationFor(item, snapshot.ownerId, {}, 'complete'))
      onAviso?.(`«${item.title}» ahora es un evento en ${destino.title}.`)
      if (r.event) onAbrir?.({ item: r.event }); else onClose()
    } else {
      const tarea: Borrador = { ...draft, kind: 'task', projectId: '', priority: 4 }
      const r = await onSave({ ownerId: snapshot.ownerId, requestId: crypto.randomUUID(), kind: 'task', action: 'create', data: datosDe(tarea, ZONA()) })
      await onSave(mutationFor(item, snapshot.ownerId, {}, 'delete'))
      onAviso?.(`«${item.title}» ahora es una tarea en Todoist.`)
      if (r.task) onAbrir?.({ item: r.task }); else onClose()
    }
  })

  const conversar = onConversar && item ? () => { onConversar(borradorConversacion(item, proyecto?.title, source?.title)); cerrar() } : undefined

  function teclas(e: React.KeyboardEvent) {
    const enCampo = escribiendo(e.target)
    if (e.key === 'Escape') {
      e.stopPropagation(); e.preventDefault()
      if (pop) { setPop(null); return }
      if (confirmar) { setConfirmar(null); return }
      if (editandoNotas) { setEditandoNotas(false); return }
      cerrar(); return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (isNew) void crear(); else if (item?.kind === 'task' && !readOnly) completar(); else cerrar()
      return
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])
      const first = focusables[0], last = focusables.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      return
    }
    if (enCampo || e.altKey || bloqueado) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && onUndo) { e.preventDefault(); void onUndo(); return }
    if (e.metaKey || e.ctrlKey) return
    const k = e.key.toLowerCase()
    if (k === 'e') { e.preventDefault(); const t = titulo.current; t?.focus(); t?.setSelectionRange(t.value.length, t.value.length) }
    else if (k === 'd') { e.preventDefault(); setPop('fecha') }
    else if (k === 'p' && draft.kind === 'task') { e.preventDefault(); setPop('prioridad') }
    else if (k === 'n') { e.preventDefault(); setEditandoNotas(true) }
    else if ((k === 'delete' || k === 'backspace') && item?.kind === 'event' && item.editable) { e.preventDefault(); setConfirmar('borrar') }
  }

  // Un toque fuera de la hoja la cierra (guardando antes) y deja pasar el toque: abrir otro evento cambia de hoja de un golpe.
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || panel.current?.contains(t) || t.closest('[data-hoja-ignora]')) return
      cerrar()
    }
    document.addEventListener('pointerdown', fuera, true)
    return () => document.removeEventListener('pointerdown', fuera, true)
  }, [cerrar])

  const fecha = etiquetaFecha(draft)
  const links = useMemo(() => enlaces([draft.title, draft.description, draft.location]).filter(l => l.url !== (item?.kind === 'event' ? item.meetUrl : null)), [draft.title, draft.description, draft.location, item])
  const hijas = useMemo(() => item?.kind === 'task' ? [...snapshot.tasks.filter(t => t.parentId === item.externalId), ...(snapshot.completedTasks ?? []).filter(t => t.parentId === item.externalId)] : [], [item, snapshot.tasks, snapshot.completedTasks])
  const padre = item?.kind === 'task' && item.parentId ? snapshot.tasks.find(t => t.externalId === item.parentId) : undefined
  const tipoLabel = draft.kind === 'task' ? 'Tarea' : 'Evento'
  const origen = draft.kind === 'task' ? (proyecto?.title ?? 'Bandeja de entrada') : (source?.title ?? 'Calendario')
  const colorEvento = draft.kind === 'event' && acento && /^#[0-9a-f]{6}$/i.test(acento) ? acento : undefined

  return <div className={styles.capa}><section ref={panel} className={styles.hoja} role="dialog" aria-modal="false" aria-labelledby="plan-editor-heading" tabIndex={-1} data-kind={draft.kind} data-completando={completando || undefined}
    style={colorEvento ? { ['--hoja-acento' as string]: colorEvento } : undefined} onKeyDown={teclas}>
    <div className={styles.asa} aria-hidden />
    <header className={styles.barra}>
      {isNew ? <div className={styles.tipo} role="group" aria-label="Tipo">
        <button type="button" aria-pressed={draft.kind === 'event'} onClick={() => patch({ kind: 'event', time: draft.time || format(proximaMediaHora(new Date()), 'HH:mm'), day: draft.day || format(new Date(), 'yyyy-MM-dd'), minutes: 60 })}><CalendarDays size={14} aria-hidden /> Evento</button>
        <button type="button" aria-pressed={draft.kind === 'task'} onClick={() => patch({ kind: 'task', minutes: 30 })}><Circle size={14} aria-hidden /> Tarea</button>
      </div> : <span className={styles.ruta}>
        <i className={styles.punto} aria-hidden />{tipoLabel}<span aria-hidden>·</span>{draft.kind === 'event' ? <span className={styles.origenNeutro}>{origen}</span> : <b>{origen}</b>}
      </span>}
      <span className={styles.estado} role="status" aria-live="polite" data-fase={guardado.fase}>
        {guardado.fase === 'pendiente' || guardado.fase === 'guardando' ? <><Loader2 size={12} className={styles.gira} aria-hidden /> Guardando…</>
          : guardado.fase === 'guardado' ? <><Check size={12} aria-hidden /> Guardado{firmaDraft !== firmaBase && <button type="button" className={styles.deshacer} onClick={deshacer} title="Volver a como estaba al abrir"><Undo2 size={12} aria-hidden /> Deshacer</button>}</>
          : guardado.fase === 'error' && item ? <>No se guardó<button type="button" className={styles.deshacer} onClick={() => auto.reintentar(item.id)}>Reintentar</button></> : null}
      </span>
      {conversar && <button type="button" className={styles.icono} onClick={conversar} aria-label="Conversar con Levy sobre esto" title="Conversar con Levy sobre esto"><MessageCircle size={16} aria-hidden /></button>}
      {item?.url && <a className={styles.icono} href={item.url} target="_blank" rel="noreferrer" aria-label={item.kind === 'task' ? 'Abrir en Todoist' : 'Abrir en Google Calendar'} title={item.kind === 'task' ? 'Abrir en Todoist' : 'Abrir en Google Calendar'}><ExternalLink size={15} aria-hidden /></a>}
      {item && !readOnly && <span className={styles.ancla}>
        <button type="button" className={styles.icono} aria-label="Más acciones" aria-expanded={pop === 'mas'} onClick={() => setPop(pop === 'mas' ? null : 'mas')}><MoreHorizontal size={17} aria-hidden /></button>
        {pop === 'mas' && <div className={`${styles.pop} ${styles.popDerecha}`} role="menu">
          {!(item.kind === 'event' && recurring) && <button role="menuitem" type="button" onClick={() => { setPop(null); setConfirmar(item.kind === 'task' ? 'aEvento' : 'aTarea') }}><ArrowLeftRight size={14} aria-hidden />{item.kind === 'task' ? 'Convertir en evento' : 'Convertir en tarea'}</button>}
          {item.kind === 'task' && <button role="menuitem" type="button" onClick={() => { setPop(null); completar() }}><Check size={14} aria-hidden />Completar<kbd aria-hidden>⌘↵</kbd></button>}
          {item.kind === 'event' && <button role="menuitem" type="button" className={styles.peligro} onClick={() => { setPop(null); setConfirmar('borrar') }}><Trash2 size={14} aria-hidden />{recurring ? 'Borrar esta ocurrencia' : 'Borrar evento'}<kbd aria-hidden>Supr</kbd></button>}
        </div>}
      </span>}
      <button type="button" className={styles.icono} onClick={cerrar} aria-label="Cerrar detalle" title="Cerrar (Esc)"><X size={17} aria-hidden /></button>
    </header>

    <div className={styles.cuerpo}>
      {padre && <button type="button" className={styles.padre} onClick={() => onAbrir?.({ item: padre })}><CornerDownLeft size={12} aria-hidden /> Subtarea de <b>{padre.title}</b></button>}
      <div className={styles.cabeza}>
        {draft.kind === 'task' ? <button type="button" className={styles.check} data-p={draft.priority} aria-label={isNew ? 'Tarea nueva' : `Completar ${draft.title}`} disabled={isNew || bloqueado} onClick={completar}>
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
        </button> : <i className={styles.barraColor} aria-hidden />}
        <h2 id="plan-editor-heading" className={styles.srOnly}>{draft.title || (isNew ? `${tipoLabel} nueva` : tipoLabel)}</h2>
        <textarea ref={titulo} className={styles.titulo} name="title" aria-label="Título" rows={1} value={draft.title} maxLength={1000} disabled={bloqueado}
          placeholder={draft.kind === 'task' ? '¿Qué vas a hacer?' : 'Nombre del evento'}
          onChange={e => patch({ title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={e => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (isNew) void crear(); else (e.target as HTMLTextAreaElement).blur() } }} />
      </div>
      {restored && <p className={styles.nota}>Borrador recuperado.</p>}
      {readOnly && <p className={styles.nota}>Este calendario es de solo lectura.</p>}

      <div className={styles.chips}>
        <span className={styles.ancla}>
          <button type="button" className={styles.chip} data-tono={fecha.tono} data-dia={draft.day || undefined} aria-label={`Fecha: ${fecha.texto}`} aria-expanded={pop === 'fecha'} disabled={bloqueado} onClick={() => setPop(pop === 'fecha' ? null : 'fecha')}>
            {draft.kind === 'task' ? <CalendarDays size={14} aria-hidden /> : <Clock size={14} aria-hidden />}<span>{draft.kind === 'event' && !draft.time ? `${fecha.texto} · todo el día` : fecha.texto}</span>
          </button>
          {pop === 'fecha' && <SelectorFecha draft={draft} patch={patch} recurring={Boolean(recurring)} onListo={() => setPop(null)} />}
        </span>
        {draft.kind === 'task' ? <>
          <span className={styles.ancla}>
            <button type="button" className={styles.chip} data-p={draft.priority} aria-label={`Prioridad: P${draft.priority}`} aria-expanded={pop === 'prioridad'} disabled={bloqueado} onClick={() => setPop(pop === 'prioridad' ? null : 'prioridad')}>
              <Flag size={14} aria-hidden /><span>{draft.priority === 4 ? 'Prioridad' : `P${draft.priority}`}</span></button>
            {pop === 'prioridad' && <div className={styles.pop} role="menu">{PRIORIDADES.map(o => <button key={o.p} role="menuitemradio" aria-checked={draft.priority === o.p} type="button" data-p={o.p} onClick={() => { patch({ priority: o.p }); setPop(null) }}>
              <Flag size={14} aria-hidden />{o.label}<kbd aria-hidden>{o.corta}</kbd></button>)}</div>}
          </span>
          <span className={styles.ancla}>
            <button type="button" className={styles.chip} aria-label={`Proyecto: ${proyecto?.title ?? 'Bandeja de entrada'}`} aria-expanded={pop === 'proyecto'} disabled={bloqueado || Boolean(item?.kind === 'task' && item.parentId)} onClick={() => setPop(pop === 'proyecto' ? null : 'proyecto')}>
              <Hash size={14} aria-hidden /><span>{proyecto?.title ?? 'Bandeja de entrada'}</span></button>
            {pop === 'proyecto' && <SelectorLista opciones={[...(isNew ? [{ id: '', titulo: 'Bandeja de entrada' }] : []), ...snapshot.projects.map(p => ({ id: p.id, titulo: p.title }))]} actual={draft.projectId} icono={<Folder size={14} aria-hidden />}
              onPick={id => { patch({ projectId: id }); setPop(null) }} buscar="Buscar proyecto" />}
          </span>
          {recurring && <span className={`${styles.chip} ${styles.chipFijo}`} title="La regla de repetición se edita en Todoist"><Repeat2 size={14} aria-hidden /><span>{item?.kind === 'task' ? item.recurrenceText ?? 'Se repite' : 'Se repite'}</span></span>}
        </> : <>
          {/* El calendario de origen es texto neutro, sin color propio: el color del evento es su DRIP. Solo al crear se elige. */}
          {isNew ? <span className={styles.ancla}>
            <button type="button" className={styles.chip} aria-label={`Calendario: ${source?.title ?? 'sin elegir'}`} aria-expanded={pop === 'calendario'} disabled={bloqueado} onClick={() => setPop(pop === 'calendario' ? null : 'calendario')}>
              <CalendarDays size={14} aria-hidden /><span>{source?.title ?? 'Calendario'}</span></button>
            {pop === 'calendario' && <SelectorLista opciones={snapshot.sources.filter(s => s.editable && !s.objective).map(s => ({ id: s.id, titulo: s.title, detalle: s.account }))} actual={draft.sourceId}
              icono={<CalendarDays size={14} aria-hidden />} onPick={id => { patch({ sourceId: id }); setPop(null) }} />}
          </span> : <span className={styles.calendarioOrigen} title="Calendario de origen">{source?.title ?? 'Calendario'}</span>}
          {isNew ? <span className={styles.ancla}>
            <button type="button" className={styles.chip} aria-expanded={pop === 'repetir'} onClick={() => setPop(pop === 'repetir' ? null : 'repetir')}><Repeat2 size={14} aria-hidden /><span>{REPETIR.find(r => r.v === draft.repeat)?.label}</span></button>
            {pop === 'repetir' && <div className={styles.pop} role="menu">{REPETIR.map(r => <button key={r.v} type="button" role="menuitemradio" aria-checked={draft.repeat === r.v} onClick={() => { patch({ repeat: r.v }); setPop(null) }}>{r.label}</button>)}</div>}
          </span> : recurring && <span className={`${styles.chip} ${styles.chipFijo}`} title="Los cambios aplican solo a esta ocurrencia"><Repeat2 size={14} aria-hidden /><span>Solo esta ocurrencia</span></span>}
        </>}
      </div>

      {!isNew && draft.kind === 'event' && drip}

      {draft.kind === 'event' && <div className={styles.filas}>
        {item?.kind === 'event' && item.meetUrl && <a className={styles.meet} href={item.meetUrl} target="_blank" rel="noreferrer"><Video size={16} aria-hidden /><span><b>Unirse con Google Meet</b><small>{item.meetUrl.replace(/^https?:\/\//, '')}</small></span></a>}
        <label className={styles.fila}><MapPin size={15} aria-hidden /><input aria-label="Lugar" value={draft.location} placeholder="Añadir lugar" disabled={bloqueado} onChange={e => patch({ location: e.target.value })} /></label>
        {item?.kind === 'event' && item.attendees && item.attendees.length > 0 && <Invitados lista={item.attendees} />}
      </div>}

      <Notas valor={draft.description} editando={editandoNotas && !bloqueado} setEditando={setEditandoNotas} onCambio={v => patch({ description: v })} bloqueado={bloqueado}
        placeholder={draft.kind === 'task' ? 'Añade contexto, pasos o enlaces… (markdown)' : 'Añade una descripción… (markdown)'} />

      {links.length > 0 && <section className={styles.seccion} aria-label="Enlaces">
        <h3>Enlaces</h3>
        <ul className={styles.enlaces}>{links.map(l => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer" title={l.url}><IconoEnlace tipo={l.tipo} /><span><b>{l.etiqueta}</b><small>{l.host}</small></span><ExternalLink size={13} aria-hidden /></a></li>)}</ul>
      </section>}

      {item?.kind === 'task' && <Subtareas hijas={hijas} padre={item} snapshot={snapshot} ocupado={ocupado || saving || unresolved} onSave={onSave} onAbrir={onAbrir} />}

      {(error || guardado.fase === 'error') && <p className={styles.error} role="alert">{error ?? `Google no confirmó el cambio: ${guardado.error?.replace(/\.$/, '')}. Lo que escribiste sigue aquí; la agenda muestra lo que Google tiene.`}</p>}
      {unresolved && <div className={styles.error}>Hay un envío pendiente de confirmar. El borrador se conserva.
        <button type="button" className={styles.boton} onClick={() => { void onRetry().then(() => { try { sessionStorage.removeItem(key) } catch { /* noop */ } }).catch(err => setError(err.message)) }}>Reintentar envío</button></div>}
    </div>

    {confirmar && item ? <div className={styles.confirmar} role="alertdialog" aria-label="Confirmar">
      <p>{confirmar === 'borrar' ? <>¿Borrar «{item.title}»?{recurring ? ' Solo esta ocurrencia; el resto de la serie no cambia.' : ' Se puede deshacer con ⌘Z.'}</>
        : confirmar === 'aEvento' ? <>Se crea un evento en <b>{snapshot.sources.find(s => s.editable && !s.objective)?.title}</b> {draft.time ? 'a la misma hora' : 'con hora'} y la tarea se marca como hecha en Todoist.</>
        : <>Se crea la tarea en Todoist con esta fecha y hora, y el evento se borra del calendario.</>}</p>
      <div><button type="button" className={styles.boton} onClick={() => setConfirmar(null)}>Cancelar</button>
        <button type="button" className={confirmar === 'borrar' ? styles.botonPeligro : styles.botonPrincipal} autoFocus disabled={ocupado || saving}
          onClick={() => { const c = confirmar; setConfirmar(null); if (c === 'borrar') void borrar(); else void convertir() }}>
          {ocupado ? <Loader2 size={14} className={styles.gira} aria-hidden /> : confirmar === 'borrar' ? <Trash2 size={14} aria-hidden /> : <ArrowLeftRight size={14} aria-hidden />}
          {confirmar === 'borrar' ? (recurring ? 'Borrar esta ocurrencia' : 'Borrar') : confirmar === 'aEvento' ? 'Convertir en evento' : 'Convertir en tarea'}</button></div>
    </div> : <footer className={styles.pie}>
      <span className={styles.atajos} aria-hidden><kbd>Esc</kbd> cerrar{!isNew && !readOnly && <> · <kbd>E</kbd> título · <kbd>D</kbd> fecha</>}</span>
      {isNew ? <button type="button" className={styles.botonPrincipal} disabled={ocupado || saving || unresolved || !draft.title.trim()} onClick={() => void crear()}>
        {ocupado ? <Loader2 size={14} className={styles.gira} aria-hidden /> : <Plus size={14} aria-hidden />}Crear {draft.kind === 'event' ? 'evento' : 'tarea'}<kbd aria-hidden>⌘↵</kbd></button>
        : item?.kind === 'task' ? <button type="button" className={styles.botonCompletar} disabled={bloqueado || saving || ocupado} onClick={completar}><Check size={14} aria-hidden />Completar<kbd aria-hidden>⌘↵</kbd></button>
        : <button type="button" className={styles.boton} onClick={cerrar}>Listo<kbd aria-hidden>⌘↵</kbd></button>}
    </footer>}
  </section></div>
}

function SelectorFecha({ draft, patch, recurring, onListo }: { draft: Borrador; patch: (v: Partial<Borrador>) => void; recurring: boolean; onListo: () => void }) {
  const hoy = new Date()
  const [mes, setMes] = useState(() => draft.day ? parseISO(draft.day) : hoy)
  const [objetivo, setObjetivo] = useState<'inicio' | 'fin'>('inicio')
  const elegido = objetivo === 'fin' ? draft.endDay : draft.day
  const pick = (day: string) => {
    if (objetivo === 'fin') { patch({ endDay: day < draft.day ? draft.day : day }); return }
    patch({ day, endDay: draft.endDay && draft.endDay > day && !draft.time ? draft.endDay : day })
  }
  const fin = draft.time && draft.day ? format(new Date(parseISO(`${draft.day}T${draft.time}`).getTime() + draft.minutes * 60_000), 'HH:mm') : ''
  return <div className={`${styles.pop} ${styles.popFecha}`} role="dialog" aria-label="Elegir fecha">
    <div className={styles.rapidas}>{fechasRapidas(hoy).map(f => <button key={f.id} type="button" aria-pressed={draft.day === f.day && objetivo === 'inicio'} onClick={() => { setObjetivo('inicio'); pick(f.day); setMes(parseISO(f.day)) }}>
      <span>{f.label}</span><small>{f.hint}</small></button>)}
      {draft.kind === 'task' && draft.day && !recurring && <button type="button" onClick={() => { patch({ day: '', time: '' }); onListo() }}><span>Sin fecha</span><small><X size={12} aria-hidden /></small></button>}
    </div>
    {draft.kind === 'event' && !draft.time && <div className={styles.segmento} role="group" aria-label="Qué día eliges">
      <button type="button" aria-pressed={objetivo === 'inicio'} onClick={() => setObjetivo('inicio')}>Empieza · {draft.day ? format(parseISO(draft.day), 'd MMM', { locale: es }) : '—'}</button>
      <button type="button" aria-pressed={objetivo === 'fin'} onClick={() => setObjetivo('fin')}>Termina · {draft.endDay ? format(parseISO(draft.endDay), 'd MMM', { locale: es }) : '—'}</button>
    </div>}
    <div className={styles.mes}>
      <header><b>{format(mes, "LLLL yyyy", { locale: es })}</b>
        <button type="button" aria-label="Mes anterior" onClick={() => setMes(m => subMonths(m, 1))}><ChevronLeft size={15} aria-hidden /></button>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMes(m => addMonths(m, 1))}><ChevronRight size={15} aria-hidden /></button></header>
      <div className={styles.semana} aria-hidden>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
      {semanasDelMes(mes).map((sem, i) => <div key={i} className={styles.semana}>{sem.map(d => {
        const k = format(d, 'yyyy-MM-dd')
        const enRango = draft.kind === 'event' && !draft.time && draft.endDay > draft.day && k > draft.day && k <= draft.endDay
        return <button key={k} type="button" aria-label={format(d, "EEEE d 'de' MMMM", { locale: es })} aria-pressed={k === elegido} data-fuera={!isSameMonth(d, mes) || undefined} data-hoy={isSameDay(d, hoy) || undefined} data-rango={enRango || undefined} onClick={() => pick(k)}>{d.getDate()}</button>
      })}</div>)}
    </div>
    {draft.day && <div className={styles.horaFila}>
      <Clock size={14} aria-hidden />
      <CampoHora valor={draft.time} vacio={draft.kind === 'task' ? 'Sin hora' : 'Todo el día'} onCambio={time => patch({ time, endDay: draft.day })} />
      {draft.time && <span className={styles.finHora}>→ {fin}</span>}
      {draft.time && <button type="button" className={styles.quitar} onClick={() => patch({ time: '' })}>{draft.kind === 'task' ? 'Sin hora' : 'Todo el día'}</button>}
    </div>}
    {draft.day && draft.time && <div className={styles.duraciones} role="group" aria-label="Duración">
      {DURACIONES.map(m => <button key={m} type="button" aria-pressed={draft.minutes === m} onClick={() => patch({ minutes: m })}>{etiquetaDuracion(m)}</button>)}
      {!DURACIONES.includes(draft.minutes) && <button type="button" aria-pressed>{etiquetaDuracion(draft.minutes)}</button>}
    </div>}
    <footer><span>{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')}</span><button type="button" className={styles.botonPrincipal} onClick={onListo}>Listo</button></footer>
  </div>
}

function CampoHora({ valor, vacio, onCambio }: { valor: string; vacio: string; onCambio: (v: string) => void }) {
  const [texto, setTexto] = useState(valor)
  const [abierto, setAbierto] = useState(false)
  const lista = useRef<HTMLDivElement>(null)
  useEffect(() => setTexto(valor), [valor])
  useEffect(() => {
    if (!abierto) return
    const objetivo = valor || format(proximaMediaHora(new Date()), 'HH:mm')
    const caja = lista.current, fila = caja?.querySelector<HTMLElement>(`[data-hora="${objetivo}"]`)
    if (caja && fila) caja.scrollTop = fila.offsetTop - caja.clientHeight / 2 + fila.offsetHeight / 2
  }, [abierto, valor])
  const confirmar = () => { const v = leerHora(texto); if (v) onCambio(v); else setTexto(valor) }
  const filtro = texto && texto !== valor ? HORAS.filter(h => h.startsWith(texto.padStart(texto.includes(':') ? 5 : 2, '0').slice(0, texto.length))) : HORAS
  return <span className={styles.campoHora}>
    <input aria-label="Hora" value={texto} placeholder={vacio} inputMode="numeric" onFocus={e => { setAbierto(true); e.target.select() }}
      onChange={e => setTexto(e.target.value)} onBlur={() => { setTimeout(() => setAbierto(false), 120); confirmar() }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmar(); (e.target as HTMLInputElement).blur() } }} />
    {abierto && <div ref={lista} className={styles.horas} role="listbox" aria-label="Horas">{(filtro.length ? filtro : HORAS).map(h => <button key={h} type="button" role="option" aria-selected={h === valor} data-hora={h}
      onPointerDown={e => { e.preventDefault(); onCambio(h); setTexto(h); setAbierto(false) }}>{h}</button>)}</div>}
  </span>
}

function SelectorLista({ opciones, actual, onPick, icono, buscar }: { opciones: { id: string; titulo: string; detalle?: string; color?: string | null }[]; actual: string; onPick: (id: string) => void; icono?: ReactNode; buscar?: string }) {
  const [q, setQ] = useState('')
  const vis = opciones.filter(o => o.titulo.toLowerCase().includes(q.toLowerCase()))
  return <div className={styles.pop} role="menu">
    {buscar && opciones.length > 6 && <input className={styles.buscar} autoFocus placeholder={buscar} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && vis[0]) { e.preventDefault(); onPick(vis[0].id) } }} />}
    <div className={styles.popLista}>{vis.map(o => <button key={o.id || 'inbox'} type="button" role="menuitemradio" aria-checked={o.id === actual} onClick={() => onPick(o.id)}>
      {o.color !== undefined ? <i className={styles.puntoFuente} style={o.color ? { background: o.color } : undefined} aria-hidden /> : icono}
      <span>{o.titulo}{o.detalle && <small>{o.detalle}</small>}</span>{o.id === actual && <Check size={14} aria-hidden />}</button>)}
      {!vis.length && <p className={styles.nota}>Nada coincide.</p>}</div>
  </div>
}

/** Contexto en markdown: se lee renderizado; un clic (o N) lo edita; las casillas `- [ ]` se marcan sin entrar a editar. */
function Notas({ valor, editando, setEditando, onCambio, bloqueado, placeholder }: { valor: string; editando: boolean; setEditando: (v: boolean) => void; onCambio: (v: string) => void; bloqueado: boolean; placeholder: string }) {
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { const t = area.current; if (t) { t.style.height = '0px'; t.style.height = Math.max(96, t.scrollHeight) + 'px' } }, [valor, editando])
  useEffect(() => { if (editando) { const t = area.current; t?.focus(); t?.setSelectionRange(t.value.length, t.value.length) } }, [editando])
  if (editando) return <textarea ref={area} className={styles.notasEditor} aria-label="Contexto" value={valor} placeholder={placeholder} onChange={e => onCambio(e.target.value)} onBlur={() => setEditando(false)} />
  let n = 0
  const marcar = (indice: number) => {
    let i = -1
    onCambio(valor.replace(/^(\s*[-*+]\s+)\[( |x|X)\]/gm, (todo, pre: string, marca: string) => (++i === indice ? `${pre}[${marca === ' ' ? 'x' : ' '}]` : todo)))
  }
  return <div className={styles.notas} data-vacio={!valor.trim() || undefined} role="button" tabIndex={bloqueado ? -1 : 0} aria-label="Editar contexto"
    onClick={e => { if (!bloqueado && !(e.target as HTMLElement).closest('a,input')) setEditando(true) }}
    onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget && !bloqueado) { e.preventDefault(); setEditando(true) } }}>
    {valor.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      input: props => { if (props.type !== 'checkbox') return <input {...props} />; const idx = n++; return <input type="checkbox" checked={Boolean(props.checked)} disabled={bloqueado} onChange={() => marcar(idx)} /> },
    }}>{valor}</ReactMarkdown> : <span className={styles.placeholder}><FileText size={14} aria-hidden />{placeholder}</span>}
  </div>
}

function Subtareas({ hijas, padre, snapshot, ocupado, onSave, onAbrir }: { hijas: PlanTask[]; padre: PlanTask; snapshot: PlanningSnapshot; ocupado: boolean; onSave: (m: PlanMutation) => Promise<MutationResult>; onAbrir?: (s: EditorSelection) => void }) {
  const [nueva, setNueva] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const listas = hijas.filter(h => h.completed || hechas.has(h.id)).length
  const agregar = async () => {
    const title = nueva.trim()
    if (!title || ocupado) return
    setError(null)
    try { await onSave({ ownerId: snapshot.ownerId, requestId: crypto.randomUUID(), kind: 'task', action: 'create', data: { title, parentId: padre.externalId, projectId: padre.projectId ?? undefined, priority: 4 } }); setNueva('') }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la subtarea.') }
  }
  const hecha = async (t: PlanTask) => {
    if (ocupado || t.completed) return
    setHechas(s => new Set(s).add(t.id))
    try { await new Promise(r => setTimeout(r, 380)); await onSave(mutationFor(t, snapshot.ownerId, {}, 'complete')) }
    catch (err) { setHechas(s => { const n = new Set(s); n.delete(t.id); return n }); setError(err instanceof Error ? err.message : 'No se pudo completar.') }
  }
  if (!hijas.length && !abierta) return <button type="button" className={styles.agregarSub} onClick={() => setAbierta(true)}><Plus size={14} aria-hidden /> Añadir subtarea</button>
  return <section className={styles.seccion} aria-label="Subtareas">
    <h3>Subtareas{hijas.length > 0 && <span className={styles.progreso}><span className={styles.barraProgreso}><i style={{ width: `${(listas / hijas.length) * 100}%` }} /></span>{listas}/{hijas.length}</span>}</h3>
    <ul className={styles.subtareas}>{hijas.map(t => { const lista = t.completed || hechas.has(t.id); return <li key={t.id} data-hecha={lista || undefined}>
      <button type="button" className={styles.checkChico} data-p={t.priority} aria-label={`Completar ${t.title}`} disabled={lista || ocupado} onClick={() => void hecha(t)}><svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg></button>
      <button type="button" className={styles.subTitulo} onClick={() => onAbrir?.({ item: t })} disabled={t.completed}>{t.title}</button>
    </li> })}</ul>
    <label className={styles.nuevaSub}><Plus size={14} aria-hidden /><input aria-label="Nueva subtarea" placeholder="Añadir subtarea y Enter" value={nueva} disabled={ocupado} autoFocus={abierta && !hijas.length}
      onChange={e => setNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void agregar() } }} /></label>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>
}

function Invitados({ lista }: { lista: NonNullable<PlanEvent['attendees']> }) {
  const [abierto, setAbierto] = useState(false)
  const resp: Record<string, string> = { accepted: 'Va', declined: 'No va', tentative: 'Quizá', needsAction: 'Sin responder' }
  return <div className={styles.invitados}>
    <button type="button" className={styles.fila} aria-expanded={abierto} onClick={() => setAbierto(v => !v)}><Users size={15} aria-hidden />
      <span>{lista.length} {lista.length === 1 ? 'invitado' : 'invitados'} · {lista.filter(a => a.response === 'accepted').length} confirmados</span>
      <span className={styles.caras} aria-hidden>{lista.slice(0, 4).map(a => <i key={a.email}>{(a.name || a.email)[0]?.toUpperCase()}</i>)}</span></button>
    {abierto && <ul>{lista.map(a => <li key={a.email}><i aria-hidden>{(a.name || a.email)[0]?.toUpperCase()}</i><span><b>{a.name || a.email}{a.self ? ' (tú)' : ''}</b>{a.name && <small>{a.email}</small>}</span><em data-r={a.response}>{a.organizer ? 'Organiza' : resp[a.response] ?? ''}</em></li>)}</ul>}
  </div>
}

function IconoEnlace({ tipo }: { tipo: Enlace['tipo'] }) {
  if (tipo === 'meet' || tipo === 'video') return <Video size={15} aria-hidden />
  if (tipo === 'doc' || tipo === 'drive') return <FileText size={15} aria-hidden />
  if (tipo === 'codigo') return <Github size={15} aria-hidden />
  return <Link2 size={15} aria-hidden />
}
