'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as TeclaReact } from 'react'
import { ChevronDown } from 'lucide-react'
import { mov, escalon } from '@/shared/movimiento'
import { shiftDay } from '@/features/sistema/calendar-days'
import { habitDisplayName, habitSubtitle, realHabitName } from '@/features/sistema/habit-presentation'
import { NombreHabito } from '@/features/sistema/NombreHabito'
import { HABIT_SHORTCUTS, habitKey, isHabitTypingTarget } from '@/features/sistema/habit-shortcuts'
import type { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { avanceHabitos, diasTejido, moverFoco, racha, rotuloRacha, siguienteMarca, VENTANA_RACHA, type Marca } from './habitos-dia'
import h from './habitos-dia.module.css'
import { seMuestra } from './habitos-hoy'

/**
 * Los hábitos en la hoja del día (5 oct 2026). Antes solo se marcaban en /todotask/hoy; Daniel firmó «un solo lugar por
 * cosa» y viven aquí, junto al objetivo y la agenda. Misma pluma (useHabitRecords → /api/sistema, con cola persistente,
 * revisión y deshacer); mismo movimiento de la casa: la palomita se dibuja SOLO en el hábito que se acaba de marcar, el
 * medidor se llena, nada vuelve a animarse en una relectura. La racha se ve sin ruido: un número tenue, solo desde 2 días.
 *
 * Teclado: `H` entra a los hábitos (el calendario usa los dígitos para sus escalas); dentro, el número de cada hábito
 * lo marca, las flechas se mueven, espacio o Enter alterna, Esc sale. Los días futuros no tienen hábitos que marcar.
 */
export function HabitosDia({ dia, donde, i = 4, habits, today, ocultar = [], compacta = false, objetivo }: {
  dia: string; donde: string; i?: number
  /** La pluma la abre la hoja del día (la comparte con la estrella del objetivo). */
  habits: ReturnType<typeof useHabitRecords>; today: string
  /** Hábitos que la hoja ya muestra en otro lugar (`objetivo_dia` = la estrella del objetivo): un solo lugar por cosa. */
  ocultar?: string[]
  /** Filas pequeñitas, una por hábito (5 oct 2026, 17:48: «no son tan importantes y no deben ocupar mucho espacio»). */
  compacta?: boolean
  /** El objetivo del día como primera fila: el MISMO dato que la estrella (misma acción), para que el conteo sea de 3. */
  objetivo?: { cumplido: boolean; onToggle?: () => void } | null
}) {
  const desde = shiftDay(dia, -(VENTANA_RACHA - 1))
  const raiz = useRef<HTMLElement>(null), rejilla = useRef<HTMLDivElement>(null)
  const [abierto, setAbierto] = useState<boolean | null>(null)
  const [tejido, setTejido] = useState(false)
  const [recien, setRecien] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<{ nombre: string; hecho: boolean | null } | null>(null)
  const lista = useMemo(() => (habits.data?.habitos ?? []).filter(x => seMuestra(x.clave) && !ocultar.includes(x.clave)), [habits.data, ocultar.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAbierto(null); setTejido(false) }, [dia])
  useEffect(() => { if (!recien) return; const t = setTimeout(() => setRecien(null), 900); return () => clearTimeout(t) }, [recien])
  useEffect(() => { if (!ultimo) return; const t = setTimeout(() => setUltimo(null), 6000); return () => clearTimeout(t) }, [ultimo])

  // Índice de lo leído (fecha|clave → marca) para las rachas: 60 días × N hábitos sin recorrer arreglos en cada celda.
  const leido = useMemo(() => new Map((habits.data?.records ?? []).map(r => [`${r.fecha}|${r.habito_clave}`, r.hecho])), [habits.data])
  const marca = (fecha: string, clave: string): Marca => fecha === dia ? habits.record(fecha, clave)?.hecho : leido.get(`${fecha}|${clave}`)

  // `H` desde cualquier parte del calendario (sección o panel, cada uno con su foco) lleva al primer hábito sin marcar.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'h' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.isComposing || isHabitTypingTarget(e.target)) return
      const target = e.target instanceof Element ? e.target : null, calendario = raiz.current?.closest('[data-planning-calendar]')
      if (donde === 'panel' ? !calendario?.contains(target) : !!target?.closest('[data-panel-derecho]')) return
      const botones = [...(rejilla.current?.querySelectorAll<HTMLButtonElement>('button[data-clave]') ?? [])]
      e.preventDefault()
      if (!botones.length) { setAbierto(true); setTejido(false); requestAnimationFrame(() => rejilla.current?.querySelector<HTMLButtonElement>('button[data-clave]')?.focus()); return }
      ;(botones.find(b => b.dataset.estado !== 'hecho') ?? botones[0]).focus()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [donde])

  if (dia > today) return null
  const marcas = lista.map(x => marca(dia, x.clave))
  const avance = avanceHabitos(marcas)
  const desplegado = abierto ?? !avance.completo
  const esHoy = dia === today

  const alternar = (clave: string, nombre: string) => {
    const antes = habits.record(dia, clave)?.hecho
    habits.toggle(dia, clave, 'manual')
    const hecho = antes === true ? null : true
    if (hecho) setRecien(clave)
    setUltimo({ nombre, hecho })
  }
  const teclaRejilla = (e: TeclaReact<HTMLDivElement>) => {
    if (e.key === 'Escape') { (e.target as HTMLElement).blur(); return }
    const clave = habitKey(e.nativeEvent)
    if (clave && lista.some(x => x.clave === clave)) { e.preventDefault(); e.stopPropagation(); alternar(clave, habitDisplayName(lista.find(x => x.clave === clave)!, dia)); return }
    const botones = [...(rejilla.current?.querySelectorAll<HTMLButtonElement>('button[data-clave]') ?? [])]
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
    if (actual < 0) return
    let destino: number | null
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Las píldoras fluyen: arriba y abajo van a la fila vecina, a la píldora más cercana en horizontal.
      const caja = (b: HTMLElement) => b.getBoundingClientRect(), a = caja(botones[actual]), x = a.left + a.width / 2
      const filas = botones.map((b, i) => ({ i, r: caja(b) })).filter(({ r }) => e.key === 'ArrowDown' ? r.top > a.top + 4 : r.top < a.top - 4)
      const fila = e.key === 'ArrowDown' ? Math.min(...filas.map(f => f.r.top)) : Math.max(...filas.map(f => f.r.top))
      const vecinas = filas.filter(f => Math.abs(f.r.top - fila) < 4)
      destino = vecinas.length ? vecinas.reduce((m, f) => Math.abs(f.r.left + f.r.width / 2 - x) < Math.abs(m.r.left + m.r.width / 2 - x) ? f : m).i : actual
    } else destino = moverFoco(actual, botones.length, e.key, 1)
    if (destino != null) { e.preventDefault(); e.stopPropagation(); botones[destino]?.focus() }
  }

  if (compacta) {
    const conObj = objetivo != null, hechos = avance.hechos + (objetivo?.cumplido ? 1 : 0), total = avance.total + (conObj ? 1 : 0)
    return <section ref={raiz} className={`${h.compacta} ${mov.entra}`} style={escalon(i)} aria-label="Hábitos" data-habitos data-completo={(total > 0 && hechos === total) || undefined}>
      <header className={h.compactaCabeza}><h3>Hábitos</h3>{habits.data && <span className={h.cuenta}><b>{hechos}</b> de {total}</span>}
        {habits.data && <button className={h.verTejido} onClick={() => setTejido(v => !v)} aria-pressed={tejido} title="Las últimas cuatro semanas de cada hábito">{tejido ? 'Hoy' : '4 sem'}</button>}</header>
      {!habits.data ? <p className={h.vacio}>{habits.loading ? 'Leyendo tus hábitos…' : habits.error ?? 'No se pudieron leer los hábitos.'}</p>
        : tejido ? <Tejido dia={dia} lista={lista} marca={marca} onMarcar={(fecha, clave, valor) => habits.mark(fecha, clave, valor)} />
        : <div ref={rejilla} className={h.filas} role="group" aria-label={`Hábitos: ${hechos} de ${total} cumplidos`} onKeyDown={teclaRejilla}>
          {conObj && <button className={h.fila} data-objetivo data-estado={objetivo!.cumplido ? 'hecho' : 'vacio'} aria-pressed={objetivo!.cumplido} disabled={!objetivo!.onToggle}
            onClick={() => objetivo!.onToggle?.()} aria-label={`Objetivo del día: ${objetivo!.cumplido ? 'cumplido' : 'sin cumplir'} (es la estrella de arriba)`}>
            <span className={h.estrellaMini} aria-hidden><svg viewBox="0 0 24 24"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" /></svg></span>
            <span className={h.nombre}>Objetivo del día</span></button>}
          {lista.map((x, n) => {
            const m = marcas[n], nombre = habitDisplayName(x, dia), sub = habitSubtitle(x.clave), estado = m === true ? 'hecho' : m === false ? 'fallado' : 'vacio'
            const r = rotuloRacha(racha(f => marca(f, x.clave), dia, today, desde))
            return <button key={x.clave} className={h.fila} data-clave={x.clave} data-estado={estado} aria-pressed={m === true} onClick={() => alternar(x.clave, nombre)} title={sub ?? undefined}
              aria-label={`${nombre}: ${m === true ? 'cumplido' : m === false ? 'no cumplido' : 'sin registro'}${r ? `, racha de ${r.replace(' d', ' días')}` : ''}`}>
              <span className={h.marca} aria-hidden>{m === true ? <svg viewBox="0 0 12 12" className={recien === x.clave ? mov.palomita : undefined}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> : m === false ? '×' : null}</span>
              <span className={h.nombre}><NombreHabito clave={x.clave} nombre={realHabitName(x, dia)} tocable={false} />{sub && <small className={h.subLinea}> · {sub}</small>}</span>
              {r && <span className={h.racha}>{r}</span>}
            </button>
          })}
        </div>}
      {ultimo && habits.canUndo && !tejido && <p className={h.deshacer} role="status"><span>{ultimo.hecho ? 'Marcado' : 'Sin marca'}: «{ultimo.nombre}»</span>
        <button onClick={() => { habits.undoLast(); setUltimo(null) }}>Deshacer</button></p>}
    </section>
  }

  const titulo = esHoy ? 'Hábitos' : 'Hábitos de ese día'
  const pct = avance.total ? avance.hechos / avance.total * 100 : 0
  return <section ref={raiz} className={`${h.banda} ${mov.entra}`} style={escalon(i)} aria-label={titulo} data-habitos data-completo={avance.completo || undefined}>
    <header className={h.cabeza}>
      <button className={h.plegar} onClick={() => setAbierto(!desplegado)} aria-expanded={desplegado} title={desplegado ? 'Plegar los hábitos' : 'Ver los hábitos'}>
        <h3>{titulo}</h3>
        {habits.data && <span className={h.cuenta}>{avance.completo ? <>Completos<svg viewBox="0 0 12 12" aria-hidden className={h.sello}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></> : <><b>{avance.hechos}</b> de {avance.total}</>}</span>}
        <ChevronDown size={14} className={h.chevron} aria-hidden />
      </button>
      {habits.data && desplegado && <button className={h.verTejido} onClick={() => setTejido(v => !v)} aria-pressed={tejido} title="Las últimas cuatro semanas de cada hábito">{tejido ? 'Hoy' : '4 semanas'}</button>}
    </header>
    <div className={h.medidor} aria-hidden><i className={mov.llena} style={{ width: `${pct}%`, ...escalon(i + 1) }} /></div>

    <div className={mov.pliega} data-plegada={!desplegado || undefined}><div>
      {!habits.data ? <p className={h.vacio}>{habits.loading ? 'Leyendo tus hábitos…' : habits.error ?? 'No se pudieron leer los hábitos.'}</p>
        : !lista.length ? <p className={h.vacio}>Aún no tienes hábitos activos.</p>
        : tejido ? <Tejido dia={dia} lista={lista} marca={marca} onMarcar={(fecha, clave, valor) => habits.mark(fecha, clave, valor)} />
        : <div ref={rejilla} className={h.rejilla} role="group" aria-label={`${titulo}: ${avance.hechos} de ${avance.total} cumplidos`} onKeyDown={teclaRejilla}>
          {lista.map((x, n) => {
            const m = marcas[n], nombre = habitDisplayName(x, dia), estado = m === true ? 'hecho' : m === false ? 'fallado' : 'vacio'
            const r = rotuloRacha(racha(f => marca(f, x.clave), dia, today, desde)), tecla = HABIT_SHORTCUTS[x.clave]
            return <button key={x.clave} className={`${h.habito} ${mov.entra}`} style={{ ...escalon(i + 2 + n), ['--n' as string]: n } as CSSProperties} data-clave={x.clave} data-estado={estado}
              data-hecha={m === true || undefined} aria-pressed={m === true} onClick={() => alternar(x.clave, nombre)}
              aria-label={`${nombre}: ${m === true ? 'cumplido' : m === false ? 'no cumplido' : 'sin registro'}${r ? `, racha de ${r.replace(' d', ' días')}` : ''}${tecla ? `. Tecla ${tecla}` : ''}`}>
              <span className={h.marca} aria-hidden>{m === true ? <svg viewBox="0 0 12 12" className={recien === x.clave ? mov.palomita : undefined}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> : m === false ? '×' : null}</span>
              <span className={h.nombre}><NombreHabito clave={x.clave} nombre={realHabitName(x, dia)} tocable={false} />{habitSubtitle(x.clave) && <small className={h.sub}>{habitSubtitle(x.clave)}</small>}</span>
              {r && <span className={h.racha} title={`Racha de ${r.replace(' d', ' días')}`}>{r}</span>}
              {tecla && <kbd className={h.tecla} aria-hidden>{tecla}</kbd>}
            </button>
          })}
        </div>}
      {(habits.error && habits.data) || (habits.pending.length > 0 && !habits.saving) ? <p className={h.aviso} role="status">
        <span>{habits.error ?? 'Hay una marca sin confirmar.'}</span>
        {habits.pending.length > 0 && !habits.saving && <button onClick={() => void habits.retry()}>Reintentar</button>}
      </p> : ultimo && habits.canUndo ? <p className={h.deshacer} role="status">
        <span>{ultimo.hecho ? 'Marcado' : 'Sin marca'}: «{ultimo.nombre}»</span>
        <button onClick={() => { habits.undoLast(); setUltimo(null) }}>Deshacer</button>
      </p> : null}
    </div></div>
  </section>
}

/** Cuatro semanas por hábito: la continuidad que antes vivía en /todotask?view=habits, en el idioma del día. */
function Tejido({ dia, lista, marca, onMarcar }: {
  dia: string; lista: { clave: string; nombre: string }[]; marca: (fecha: string, clave: string) => Marca
  onMarcar: (fecha: string, clave: string, valor: boolean | null) => void
}) {
  const dias = diasTejido(dia)
  const corto = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return <div className={h.tejido} role="table" aria-label="Las últimas cuatro semanas">
    <div className={h.tejidoFila} role="row" aria-hidden>
      <span />
      {dias.map(f => <span key={f} className={h.tejidoDia} data-lunes={new Date(`${f}T12:00:00`).getDay() === 1 || undefined}>{new Date(`${f}T12:00:00`).getDay() === 1 ? Number(f.slice(-2)) : ''}</span>)}
    </div>
    {lista.map(x => <div key={x.clave} className={h.tejidoFila} role="row">
      <span className={h.tejidoNombre} role="rowheader" title={x.nombre}>{x.nombre}</span>
      {dias.map(f => {
        const m = marca(f, x.clave)
        return <button key={f} role="cell" className={h.punto} data-estado={m === true ? 'hecho' : m === false ? 'fallado' : 'vacio'} data-hoy={f === dia || undefined}
          aria-label={`${x.nombre}, ${corto(f)}: ${m === true ? 'cumplido' : m === false ? 'no cumplido' : 'sin registro'}. Tocar cambia el registro.`}
          onClick={() => onMarcar(f, x.clave, siguienteMarca(m))} />
      })}
    </div>)}
    <p className={h.leyenda}><span data-estado="hecho" />Cumplido<span data-estado="fallado" />No cumplido<span data-estado="vacio" />Sin registro · un hueco no es un fallo</p>
  </div>
}
