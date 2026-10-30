'use client'
/**
 * La semana en el hilo (Cabina v2). Desde el 9 oct 2026 abre en horas, la misma rejilla del calendario (SemanaHoras.tsx):
 * de 05:00 a 22:00, arrastrar mueve en Google, tocar un hueco abre la hoja para crear, tocar un bloque abre su detalle.
 * Escribe por la misma pluma que el calendario (/api/planning → mc-event.py) con el mismo guardián del autoguardado: si
 * Google no confirma, el bloque vuelve a su hora y el aviso lo dice. «Agenda» conserva la vista de antes: la rutina se
 * nombra UNA vez arriba y cada día muestra solo lo que cambia, con sus tareas como post-its.
 */
import { useCallback, useMemo, useState } from 'react'
import type { MutationResult, PlanEvent, PlanItem, PlanMutation, PlanningSnapshot } from '@/features/planning/types'
import { useAutoguardado } from '@/features/planning/autoguardado'
import { PlanEditor, type EditorSelection } from '@/features/planning/PlanEditor'
import { SemanaHoras } from '@/features/planning/SemanaHoras'
import { SelectorVista, bloquesDeSemana, todoElDiaDeSemana, useVistaSemana } from '@/features/planning/SemanaClara'
import { datosDeMovimiento, medianoche, type Bloque } from '@/features/planning/semana-horas'
import { categoriaDe, DEF } from '@/features/planning/categorias'
import { Leyenda, useOcultas, type ControlLeyenda } from '@/features/planning/Leyenda'
import { tituloCumplido } from '@/features/planning/dia-vivo'
import { useAhora } from '@/features/planning/vivo-piezas'
import { refrescarCabina } from '../datos'
import { etiquetaDia, hoyCivil, rangoCalendario, sumarDias } from '../model'
import { escalon } from '../movimiento'
import { porDia, bandaDe, rutinaDe, sinEmoji } from './agenda'
import { VistaDia } from './Dia'
import l from '../luz.module.css'

const semanaIso = (d: string) => {
  const t = new Date(d + 'T12:00:00Z'); const dia = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dia + 3); const primero = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((t.getTime() - primero.getTime()) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7)
}

/** La pluma del calendario desde el hilo: misma ruta, mismo contrato; al confirmar, la Cabina relee. */
async function escribir(op: PlanMutation): Promise<MutationResult> {
  const r = await fetch('/api/planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op), signal: AbortSignal.timeout(100_000) })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(b?.error ?? 'Google no confirmó el cambio.')
  refrescarCabina(1200)
  return b as MutationResult
}

export function VistaSemana({ data, ancla, grande }: { data: PlanningSnapshot; ancla: string; grande?: boolean }) {
  const hoy = hoyCivil(), ahora = useAhora()
  const { desde, hasta } = rangoCalendario('semana', ancla)
  const dias = useMemo(() => { const l: string[] = []; for (let d = desde; d < hasta; d = sumarDias(d, 1)) l.push(d); return l }, [desde, hasta])
  const [vista, setVista] = useVistaSemana('chat')
  const [aviso, setAviso] = useState<{ texto: string; reintentar?: () => void } | null>(null)
  const [hoja, setHoja] = useState<EditorSelection | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)
  const alternarDia = (d: string) => setElegido(e => e === d ? null : d)
  const auto = useAutoguardado({ ownerId: data.ownerId, escribir,
    onFallo: (titulo, mensaje, reintentar) => setAviso({ texto: `No se guardó «${titulo}»: ${mensaje} Volvió a como está en Google.`, reintentar }) })
  const vivo = useMemo(() => auto.aplicar(data), [auto, data])
  const { bandas } = useMemo(() => porDia(vivo), [vivo])
  const meta = bandaDe(bandas, desde)
  const fin = sumarDias(hasta, -1)

  const fuentes = useMemo(() => new Map(vivo.sources.map(f => [f.id, f])), [vivo.sources])
  // Colores por tipo de trabajo (10 oct 2026): los mismos del calendario, con las mismas categorías ocultas.
  const [ocultas, alternar] = useOcultas()
  const categoria = useCallback((e: PlanEvent) => categoriaDe(e, fuentes.get(e.sourceId)?.title ?? e.calendarId).categoria, [fuentes])
  const porCalendario = useCallback((e: PlanEvent) => fuentes.get(e.sourceId)?.selected !== false && !fuentes.get(e.sourceId)?.objective, [fuentes])
  const visible = useCallback((e: PlanEvent) => porCalendario(e) && !ocultas.has(categoria(e)), [porCalendario, ocultas, categoria])
  const color = useCallback((e: PlanEvent) => DEF[categoria(e)].color, [categoria])
  const leyenda = useMemo<ControlLeyenda>(() => ({ categoria, ocultas, alternar, porCalendario }), [categoria, ocultas, alternar, porCalendario])
  const porId = useMemo(() => new Map<string, PlanItem>([...vivo.events, ...vivo.tasks].map(i => [i.id, i])), [vivo])
  const bloques = useMemo(() => bloquesDeSemana(vivo.events, vivo.tasks, visible, color), [vivo, visible, color])
  const todoElDia = useMemo(() => todoElDiaDeSemana(dias, vivo.events, visible, color, e => setHoja({ item: e })), [dias, vivo.events, visible, color])
  // La ⭐ del día en el hilo: el evento del calendario de objetivos de ese día (un ✓ al inicio lo da por cumplido).
  const estrellas = useMemo(() => new Map(dias.map(d => {
    const e = vivo.events.find(x => fuentes.get(x.sourceId)?.objective && x.allDay && x.start.slice(0, 10) === d && sumarDias(d, 1) === x.end.slice(0, 10))
    return [d, e ? { titulo: sinEmoji(e.title.replace(/^\s*✓\s*/, '')), cumplido: tituloCumplido(e.title) } : null]
  })), [dias, vivo.events, fuentes])

  const mover = async (b: Bloque, inicio: Date, fin: Date) => {
    const item = porId.get(b.id)
    if (!item || (item.kind === 'event' && !item.editable)) return
    setAviso(null)
    auto.editar({ item, data: datosDeMovimiento(item, inicio, fin) })
    await auto.vaciar(item.id)
  }

  return <div>
    <div className={`${l.cabMeta} ${l.entra}`} style={{ ...escalon(0), display: 'flex', alignItems: 'center', gap: 10 }}>
      <p className={l.ceja} style={{ flex: '1 1 auto', margin: 0 }}>Semana {semanaIso(desde)} · {etiquetaDia(desde, { day: 'numeric', month: 'short' })} – {etiquetaDia(fin, { day: 'numeric', month: 'short' })}</p>
      <SelectorVista vista={vista} onVista={setVista} />
    </div>
    {meta && <div className={`${l.todoElDia} ${l.entra}`} style={escalon(1)}><span className={l.pastilla} title={meta.titulo}><i aria-hidden /><span>{meta.titulo}</span></span></div>}
    {aviso && <p className={l.entra} role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--l-tinta-rojo, var(--danger, #d14343))' }}>{aviso.texto}
      {aviso.reintentar && <> <button type="button" onClick={() => { const r = aviso.reintentar!; setAviso(null); r() }} style={{ border: 0, background: 'none', color: 'inherit', font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Reintentar</button></>}</p>}
    {vista === 'horas'
      ? <div className={l.entra} style={{ ...escalon(2), marginTop: 10 }}>
          <SemanaHoras dias={dias} hoy={hoy} ahora={ahora} bloques={bloques} todoElDia={todoElDia} estrellas={estrellas} donde="chat"
            barra={<Leyenda ctl={leyenda} eventos={vivo.events} desde={medianoche(desde)} hasta={medianoche(hasta)} periodo="semana" />}
            onAbrir={b => { const item = porId.get(b.id); if (item) setHoja({ item }) }}
            onMover={(b, inicio, fin) => void mover(b, inicio, fin)}
            onEstirar={(b, fin) => void mover(b, new Date(b.inicio), fin)}
            onCrear={(inicio, fin) => setHoja({ start: inicio, end: fin, allDay: false, freshRange: true })}
            onDia={alternarDia} />
        </div>
      : <AgendaSemana data={vivo} dias={dias} hoy={hoy} grande={grande} elegido={elegido} onDia={alternarDia} />}
    {elegido && <div className={l.detalleDia}><VistaDia data={vivo} dia={elegido} /></div>}
    {/* La hoja de detalle del calendario, sobre toda la ventana: la misma que en la sección y en el panel. */}
    {hoja && <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none' }}>
      <PlanEditor key={hoja.item?.id ?? `nuevo:${hoja.start?.getTime() ?? ''}`} selection={hoja} snapshot={vivo} saving={false} unresolved={false} auto={auto}
        onSave={escribir} onRetry={() => Promise.resolve()} onAbrir={setHoja} onAviso={texto => setAviso({ texto })}
        onClose={() => setHoja(s => s === hoja ? null : s)} />
    </div>}
  </div>
}

/** La vista de antes (Agenda): la rutina nombrada una vez y cada día con lo distinto y sus tareas. Tocar un día lo abre debajo (en las dos vistas). */
function AgendaSemana({ data, dias, hoy, grande, elegido, onDia }: { data: PlanningSnapshot; dias: string[]; hoy: string; grande?: boolean; elegido: string | null; onDia: (d: string) => void }) {
  const { mapa } = useMemo(() => porDia(data), [data])
  const rutina = useMemo(() => rutinaDe(mapa, dias), [mapa, dias])
  const max = grande ? 8 : 4
  return <>
    {rutina.lista.length > 0 && <p className={`${l.rutina} ${l.entra}`} style={escalon(2)}><b>Cada día</b>{' '}
      {rutina.lista.map(r => <span key={r.hora + r.titulo}>{r.hora} {sinEmoji(r.titulo).replace(/\s+[—-].*$/, '')}</span>)}</p>}
    <div className={l.semana}>
      {dias.map((d, i) => {
        const items = mapa.get(d) ?? []
        const objetivos = items.filter(it => it.objetivo && !it.tarea)
        const distinto = items.filter(it => !it.tarea && !it.objetivo && !rutina.esRutina(it))
        const tareas = items.filter(it => it.tarea).sort((a, b) => (a.tarea!.priority || 4) - (b.tarea!.priority || 4))
        return <button key={d} className={`${l.dia} ${l.entra}`} style={escalon(3 + i)} onClick={() => onDia(d)}
          aria-pressed={elegido === d} data-hoy={d === hoy || undefined} data-pasado={d < hoy || undefined}
          aria-label={`${etiquetaDia(d, { weekday: 'long', day: 'numeric' })}: ${distinto.length} fuera de rutina, ${tareas.length} tareas`}>
          <span className={l.diaCab}><span>{etiquetaDia(d, { weekday: 'short' }).replace('.', '')}</span><strong>{etiquetaDia(d, { day: 'numeric' })}</strong></span>
          {objetivos.map(it => <span key={it.id} className={l.objDia} title={it.titulo}>{it.titulo}</span>)}
          {distinto.slice(0, max).map(it => <span key={it.id} className={l.evento} style={{ ['--c' as string]: it.color }}>
            {it.hora && <b>{it.hora}</b>}<span>{it.titulo}</span></span>)}
          {distinto.length > max && <span className={l.mas}>+{distinto.length - max} más</span>}
          {tareas.length > 0 && <span className={l.pila}>
            {tareas.slice(0, 3).map(t => <span key={t.id} className={l.mini} data-prio={t.tarea!.priority === 1 ? 1 : undefined}><i aria-hidden /><span>{sinEmoji(t.titulo)}</span></span>)}
            {tareas.length > 3 && <span className={l.mas}>+{tareas.length - 3} tareas</span>}
          </span>}
        </button>
      })}
    </div>
  </>
}
