'use client'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact, type PointerEvent as PunteroReact } from 'react'
import { CalendarRange, Eye, EyeOff, Flame, Pencil, Trophy } from 'lucide-react'
import { mov, escalon } from '@/shared/movimiento'
import { instalacion } from '@/config'
import { shiftDay } from '@/features/sistema/calendar-days'
import { isHabitTypingTarget } from '@/features/sistema/habit-shortcuts'
import type { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { useAtomicos } from '@/features/sistema/useAtomicos'
import { useModoPresentacion } from '@/shared/stores/presentacion-store'
import { NOMBRE_PRIVADO, nombreEnPantalla, type PrincipioHabito } from '@/lib/sistema/atomicos'
import { NombreHabito } from '@/features/sistema/NombreHabito'
import { siguienteMarca, type Marca } from './habitos-dia'
import { casillaDeTecla, cuentaRegresiva, diasTira, estadoCelda, noSeRompe, porcentajeSemana, rachaActual, semanaDeHoy, semanasTemporada, textoRacha } from './habitos-hoy'
import { EVENTO_HABITOS, tomarPedidoHabitos } from './habitos-pedido'
import { temporadaDeHabitos, type TemporadaHabitos } from './periodo-premio'
import { useTemporada } from './useTemporada'
import s from './habitos-hoy.module.css'

/**
 * «Hábitos de hoy» (22 oct 2026, Daniel, entrando al monk mode hasta Monterrey: «hasta abajo del calendario, llenar 3 casillas…
 * quiero ver estos hábitos a través del tiempo, verlo todos los días»). Al pie del Día (panel y sección) y en /telefono/habitos.
 *
 * - Tres casillas grandes de un toque (tocar otra vez desmarca), con racha y «nunca falles dos veces».
 * - Atomic Habits sin texto de más: la identidad en una línea editable, la señal (hora) y la versión de 2 minutos de cada uno.
 * - Historia: la tira de 30 días por hábito y, a un toque, la cuadrícula de la temporada (`useTemporada`: nombre y arranque, con cierre y premio de `periodo`) con la
 *   cuenta regresiva y el porcentaje de cada semana. Antes del `arranque` no hay historia: no se rellena nada.
 * - Privados (25 oct 2026, 08:54, Daniel: «son 3… 0/3 debería ver al abrir el tercer hábito»): en su app todos se ven con su nombre y
 *   cuentan en el x/3; un privado se ve como «Hábito 3» (sin candado desde el 28 oct, 07:59: «despierta curiosidad»), sigue
 *   contando y su nombre real asoma solo al dejar el cursor encima del nombre o con un toque largo (el toque corto marca).
 * - Teclado: Ctrl+H (en toda la app) o H (en el calendario) traen el foco aquí; 1, 2, 3 marcan la casilla de ese lugar.
 *
 * - Mínimo (25 oct 2026, Daniel: «los hábitos aún más minimalista»): en el desplegable del Día, una línea por hábito con casilla y
 *   racha; sin identidad, principios ni tira. La historia vive en la vista H (HabitosTiempo), que también se queda con Ctrl+H y H.
 *
 * Misma pluma de siempre (useHabitRecords → /api/sistema). `especial` deja que la hoja del día conecte una casilla con otro dato
 * (el objetivo del día: tarea, ✓ en Google y hábito a la vez).
 */
export function HabitosHoy({ dia, today, habits, donde, especial = {}, i = 6, temporadaArriba = false, minimo = false }: {
  dia: string; today: string; habits: ReturnType<typeof useHabitRecords>
  /** 'panel' | 'seccion' | 'telefono': quién atiende el teclado. */
  donde: string
  especial?: Record<string, { hecho: boolean; onToggle?: () => void }>
  i?: number
  /** La franja de la temporada ya está arriba (el Día del calendario, 24 oct 2026): sin segunda línea «Día N de 29 · faltan…». */
  temporadaArriba?: boolean
  /** Una línea por hábito (casilla, nombre, racha), sin el resto. No atiende Ctrl+H ni H: son de la vista Hábitos. */
  minimo?: boolean
}) {
  const vigente = useTemporada()
  const temporada = temporadaDeHabitos(vigente?.temporadaHabitos, vigente?.periodo), inicio = temporada?.arranque ?? null
  const propuesta = instalacion().habitosAtomicos
  const atomicos = useAtomicos()
  const presentacion = useModoPresentacion()
  const raiz = useRef<HTMLElement>(null)
  const [ajustar, setAjustar] = useState(false)
  const [verTemporada, setVerTemporada] = useState(false)
  const [revelado, setRevelado] = useState<string | null>(null)
  const [recien, setRecien] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<{ nombre: string; hecho: boolean | null } | null>(null)
  useEffect(() => { if (!recien) return; const t = setTimeout(() => setRecien(null), 900); return () => clearTimeout(t) }, [recien])
  useEffect(() => { if (!ultimo) return; const t = setTimeout(() => setUltimo(null), 6000); return () => clearTimeout(t) }, [ultimo])
  // Un toque largo deja el nombre real 4 s (fijo aunque el cursor salga); dejar el cursor encima lo muestra mientras está ahí.
  // Pasar de largo no lo destapa (450 ms de intención, como `NombreHabito`); el toque corto sigue marcando la casilla.
  const fijo = useRef<string | null>(null), espera = useRef<ReturnType<typeof setTimeout> | null>(null), largo = useRef(false)
  useEffect(() => { if (!revelado) return; const t = setTimeout(() => { fijo.current = null; setRevelado(null) }, 4000); return () => clearTimeout(t) }, [revelado])
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current) }, [])
  const soltar = () => { if (espera.current) clearTimeout(espera.current); espera.current = null }
  const revelar = (x: Fila) => ({
    onPointerEnter: (e: PunteroReact) => { if (e.pointerType !== 'mouse' || presentacion.activo) return; soltar(); espera.current = setTimeout(() => setRevelado(x.clave), 450) },
    onPointerLeave: (e: PunteroReact) => { soltar(); if (e.pointerType === 'mouse' && fijo.current !== x.clave) setRevelado(v => v === x.clave ? null : v) },
    onPointerDown: (e: PunteroReact) => { if (e.pointerType === 'mouse') return; soltar(); largo.current = false
      espera.current = setTimeout(() => { largo.current = true; fijo.current = x.clave; setRevelado(x.clave) }, 500) },
    onPointerUp: soltar, onPointerCancel: soltar,
  })

  // Lo que se lee del principio de cada hábito: lo guardado o, mientras llega (o si falla), la propuesta de la instalación.
  // Así un privado nunca asoma su nombre real en el primer pintado.
  const principio = (clave: string): PrincipioHabito | undefined => atomicos.data?.habitos[clave] ?? propuesta?.habitos[clave]
  const lista = (habits.data?.habitos ?? []).map((x, n) => ({ ...x, posicion: n + 1, p: principio(x.clave) }))
  const nombre = (x: Fila) => revelado === x.clave ? x.nombre : nombreEnPantalla(x.nombre, x.p)

  const leido = useMemo(() => new Map((habits.data?.records ?? []).map(r => [`${r.fecha}|${r.habito_clave}`, r.hecho])), [habits.data])
  const marca = (fecha: string, clave: string): Marca => {
    if (fecha === dia && especial[clave]) return especial[clave].hecho
    return fecha === dia ? habits.record(fecha, clave)?.hecho : leido.get(`${fecha}|${clave}`)
  }

  const enfocar = () => {
    raiz.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const botones = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('button[data-casilla]') ?? [])]
    ;(botones.find(b => b.dataset.estado !== 'hecho') ?? botones[0] ?? raiz.current)?.focus({ preventScroll: true })
  }
  // Ctrl+H: el pedido llega antes o después de que esta fila exista (el Calendario del panel puede estar montándose).
  useEffect(() => {
    if (minimo || (donde !== 'panel' && donde !== 'telefono')) return
    const oir = () => { if (tomarPedidoHabitos()) requestAnimationFrame(enfocar) }
    if (habits.data) oir()
    window.addEventListener(EVENTO_HABITOS, oir)
    return () => window.removeEventListener(EVENTO_HABITOS, oir)
  }, [donde, minimo, !!habits.data]) // eslint-disable-line react-hooks/exhaustive-deps
  // `H` dentro del calendario (sección o panel, cada uno con su foco) y, en el teléfono, 1·2·3 en toda la pantalla.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (minimo || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || isHabitTypingTarget(e.target)) return
      const target = e.target instanceof Element ? e.target : null
      if (donde === 'telefono') {
        if (raiz.current?.contains(target)) return
        const n = casillaDeTecla(e, lista.length)
        if (n != null) { e.preventDefault(); alternar(lista[n]) }
        return
      }
      if (e.key.toLowerCase() !== 'h' || e.shiftKey) return
      const calendario = raiz.current?.closest('[data-planning-calendar]')
      if (donde === 'panel' ? !calendario?.contains(target) : !!target?.closest('[data-panel-derecho]')) return
      e.preventDefault(); enfocar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  if (dia > today) return null
  const esHoy = dia === today
  const visibles = lista.map(x => x.clave)
  const hechos = lista.filter(x => marca(dia, x.clave) === true).length

  function alternar(x: (typeof lista)[number]) {
    const antes = marca(dia, x.clave) === true
    if (especial[x.clave]?.onToggle) especial[x.clave].onToggle!()
    else habits.toggle(dia, x.clave, 'manual')
    if (!antes) setRecien(x.clave)
    setUltimo({ nombre: nombre(x), hecho: antes ? null : true })
  }
  const teclaFila = (e: TeclaReact<HTMLElement>) => {
    if (isHabitTypingTarget(e.target)) return
    if (e.key === 'Escape') { (e.target as HTMLElement).blur(); return }
    const n = casillaDeTecla(e.nativeEvent, lista.length)
    if (n != null) { e.preventDefault(); e.stopPropagation(); alternar(lista[n]); return }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const botones = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('button[data-casilla]') ?? [])]
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
    if (actual < 0) return
    e.preventDefault(); e.stopPropagation()
    const paso = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
    botones[Math.max(0, Math.min(botones.length - 1, actual + paso))]?.focus()
  }

  const cuenta = temporada ? cuentaRegresiva(today, temporada) : null
  const semanas = temporada ? semanasTemporada(temporada.desde, temporada.hasta) : []
  const semana = temporada ? semanaDeHoy(semanas, today) : null
  const pctSemana = semana ? porcentajeSemana(semana, visibles, marca, today, inicio) : null
  const tira = diasTira(dia)
  const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const estadoTexto = (m: Marca) => m === true ? 'cumplido' : m === false ? 'no cumplido' : 'sin registro'

  if (minimo) return <section ref={raiz} className={`${s.hoy} ${mov.entra}`} style={escalon(i)} aria-label={esHoy ? 'Hábitos de hoy' : 'Hábitos de ese día'}
    data-habitos data-minimo data-donde={donde} data-completo={(lista.length > 0 && hechos === lista.length) || undefined} tabIndex={-1} onKeyDown={teclaFila}>
    <header className={s.cabeza}>
      <h3>{esHoy ? 'Hábitos de hoy' : 'Hábitos de ese día'}</h3>
      {habits.data && <span className={s.cuenta}><b>{hechos}</b> de {lista.length}</span>}
    </header>
    {!habits.data ? <p className={s.vacio}>{habits.loading ? 'Leyendo tus hábitos…' : habits.error ?? 'No se pudieron leer los hábitos.'}</p>
      : !lista.length ? <p className={s.vacio}>Aún no tienes hábitos activos.</p>
      : <ul className={s.lineas} role="group" aria-label={`Hábitos: ${hechos} de ${lista.length} cumplidos`}>
        {lista.map((x, n) => {
          const m = marca(dia, x.clave), hecho = m === true, r = rachaActual(f => marca(f, x.clave), dia, inicio)
          const critico = esHoy && noSeRompe(f => marca(f, x.clave), dia, inicio), ver = nombre(x)
          return <li key={x.clave} className={s.linea} data-estado={hecho ? 'hecho' : m === false && !especial[x.clave] ? 'fallado' : 'vacio'} data-critico={critico || undefined}>
            <button className={s.tocarLinea} data-casilla={x.clave} data-estado={hecho ? 'hecho' : 'vacio'} aria-pressed={hecho} onClick={() => alternar(x)}
              aria-label={`${ver}: ${estadoTexto(m)}${r ? `, racha de ${textoRacha(r)}` : ''}. Tecla ${n + 1}`}>
              {/* La casilla del objetivo llega como cumplido sí/no: «no» ahí es «aún no», no un registro de fallo. */}
              <span className={s.marcaMini} aria-hidden>{hecho ? <svg viewBox="0 0 12 12" className={recien === x.clave ? mov.palomita : undefined}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : m === false && !especial[x.clave] ? '×' : null}</span>
              <NombreHabito clave={x.clave} nombre={x.nombre} p={x.p} tocable={false} className={s.nombreMini} />
            </button>
            <span className={s.puntosRacha} aria-hidden>{diasTira(dia, 7).map(f => <i key={f} data-estado={estadoCelda(marca(f, x.clave), f, today, inicio)} />)}</span>
            <span className={s.rachaMini}>{critico ? <span className={s.noSeRompe}>no se rompe</span> : r > 0 ? <><Flame size={11} aria-hidden />{r}</> : null}</span>
            <kbd className={s.tecla} aria-hidden>{n + 1}</kbd>
          </li>
        })}
      </ul>}
    {(habits.error && habits.data) || (habits.pending.length > 0 && !habits.saving) ? <p className={s.aviso} role="status">
      <span>{habits.error ?? 'Hay una marca sin confirmar.'}</span>
      {habits.pending.length > 0 && !habits.saving && <button onClick={() => void habits.retry()}>Reintentar</button>}
    </p> : ultimo && habits.canUndo ? <p className={s.deshacer} role="status">
        <span>{ultimo.hecho ? 'Marcado' : 'Sin marca'}: «{ultimo.nombre}»</span>
        <button onClick={() => { habits.undoLast(); setUltimo(null) }}>Deshacer</button>
      </p> : null}
  </section>

  return <section ref={raiz} className={`${s.hoy} ${mov.entra}`} style={escalon(i)} aria-label={esHoy ? 'Hábitos de hoy' : 'Hábitos de ese día'}
    data-habitos data-habitos-hoy data-donde={donde} data-completo={(lista.length > 0 && hechos === lista.length) || undefined} tabIndex={-1} onKeyDown={teclaFila}>
    <header className={s.cabeza}>
      <h3>{esHoy ? 'Hábitos de hoy' : 'Hábitos de ese día'}</h3>
      {habits.data && <span className={s.cuenta}><b>{hechos}</b> de {lista.length}</span>}
      <div className={s.acciones}>
        {temporada && <button className={s.accion} onClick={() => setVerTemporada(v => !v)} aria-pressed={verTemporada} title={`Toda la temporada: ${temporada.nombre}`}>
          <CalendarRange size={13} aria-hidden /><span>{temporada.nombre}</span></button>}
        <button className={s.accion} data-solo-icono onClick={() => presentacion.alternar()} aria-pressed={presentacion.activo}
          title={presentacion.activo ? 'Pantalla compartida: el cursor no destapa nombres, solo un toque largo. Toca para salir' : 'Pantalla compartida: que el cursor no destape nombres'}
          aria-label={presentacion.activo ? 'Salir del modo presentación' : 'Modo presentación'}>{presentacion.activo ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}</button>
        <button className={s.accion} data-solo-icono onClick={() => setAjustar(v => !v)} aria-pressed={ajustar} title="Ajustar señal, versión de 2 minutos y privacidad" aria-label="Ajustar los hábitos"><Pencil size={13} aria-hidden /></button>
      </div>
    </header>

    <Identidad texto={atomicos.data?.identidad ?? propuesta?.identidad ?? ''} guardar={t => atomicos.guardar({ identidad: t })} />
    {cuenta && !temporadaArriba && <p className={s.temporada}><Trophy size={12} aria-hidden /><span>{temporada!.nombre} · {cuenta.texto}</span>
      {pctSemana && <span className={s.pct} title={`${pctSemana.hechos} de ${pctSemana.posibles} casillas esta semana`}>Semana {pctSemana.pct}%</span>}</p>}

    {!habits.data ? <p className={s.vacio}>{habits.loading ? 'Leyendo tus hábitos…' : habits.error ?? 'No se pudieron leer los hábitos.'}</p>
      : !lista.length ? <p className={s.vacio}>Aún no tienes hábitos activos.</p>
      : <>
        <div className={s.casillas} role="group" aria-label={`Hábitos: ${hechos} de ${lista.length} cumplidos`}>
          {lista.map((x, n) => {
            const m = marca(dia, x.clave), hecho = m === true, r = rachaActual(f => marca(f, x.clave), dia, inicio)
            const critico = esHoy && noSeRompe(f => marca(f, x.clave), dia, inicio)
            const ver = nombre(x), privado = !!x.p?.privado
            return <div key={x.clave} className={s.casilla} data-estado={hecho ? 'hecho' : m === false ? 'fallado' : 'vacio'} data-critico={critico || undefined} data-privado={privado || undefined}>
              <button className={s.tocar} data-casilla={x.clave} data-estado={hecho ? 'hecho' : 'vacio'} aria-pressed={hecho}
                onClick={() => { if (largo.current) { largo.current = false; return } alternar(x) }} {...(privado ? revelar(x) : {})}
                onContextMenu={privado ? e => e.preventDefault() : undefined}
                aria-label={`${ver}: ${estadoTexto(m)}${r ? `, racha de ${textoRacha(r)}` : ''}. Tecla ${n + 1}`}>
                <span className={s.marca} aria-hidden>{hecho ? <svg viewBox="0 0 12 12" className={recien === x.clave ? mov.palomita : undefined}><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> : m === false ? '×' : null}</span>
                <span className={s.nombre}>{ver}</span>
              </button>
              {ajustar ? <AjustesHabito clave={x.clave} p={x.p} posicion={x.posicion} guardar={atomicos.guardar} />
                : (!privado || revelado === x.clave) && (x.p?.senal || x.p?.dosMinutos) ? <p className={s.principios}>
                  {x.p?.senal && <span className={s.senal}>{x.p.senal}</span>}
                  {x.p?.dosMinutos && <span className={s.dos}><b>2 min</b> {x.p.dosMinutos}</span>}
                </p> : null}
              <p className={s.pie}>
                {critico ? <span className={s.noSeRompe}>Hoy es el día que no se rompe</span>
                  : r > 0 ? <span className={s.racha}><Flame size={12} aria-hidden />{textoRacha(r)}</span>
                  : <span className={s.sinRacha}>{inicio && dia < inicio ? 'Empieza mañana' : 'Sin racha aún'}</span>}
                <kbd className={s.tecla} aria-hidden>{n + 1}</kbd>
              </p>
            </div>
          })}
        </div>

        {/* La tira: los últimos 30 días de cada hábito, hoy a la derecha. Tocar un día ya vivido corrige su registro. */}
        <div className={s.tira} role="table" aria-label="Los últimos 30 días">
          {lista.map(x => <div key={x.clave} className={s.tiraFila} role="row">
            <span className={s.tiraNombre} role="rowheader"><NombreHabito clave={x.clave} nombre={x.nombre} p={x.p} /></span>
            <span className={s.tiraDias}>{tira.map(f => {
              const e = estadoCelda(marca(f, x.clave), f, today, inicio)
              return <button key={f} role="cell" className={s.celda} data-estado={e} data-hoy={f === today || undefined} disabled={e === 'fuera' || e === 'futuro'}
                aria-label={`${nombre(x)}, ${fechaLarga(f)}: ${e === 'fuera' ? 'antes de empezar' : estadoTexto(marca(f, x.clave))}`}
                onClick={() => f === dia ? alternar(x) : habits.mark(f, x.clave, siguienteMarca(marca(f, x.clave)))} />
            })}</span>
          </div>)}
        </div>

        {temporada && verTemporada && <Temporada temporada={temporada} semanas={semanas} lista={lista} nombre={nombre} marca={marca} today={today} inicio={inicio} />}
      </>}

    {(habits.error && habits.data) || (habits.pending.length > 0 && !habits.saving) ? <p className={s.aviso} role="status">
      <span>{habits.error ?? 'Hay una marca sin confirmar.'}</span>
      {habits.pending.length > 0 && !habits.saving && <button onClick={() => void habits.retry()}>Reintentar</button>}
    </p> : atomicos.error ? <p className={s.aviso} role="status"><span>{atomicos.error}</span></p>
      : ultimo && habits.canUndo ? <p className={s.deshacer} role="status">
        <span>{ultimo.hecho ? 'Marcado' : 'Sin marca'}: «{ultimo.nombre}»</span>
        <button onClick={() => { habits.undoLast(); setUltimo(null) }}>Deshacer</button>
      </p> : null}
  </section>
}

type Fila = { clave: string; nombre: string; posicion: number; p?: PrincipioHabito }

/** «Soy alguien que…»: una línea; un toque la edita, Enter o salir guarda, Esc deja como estaba. */
function Identidad({ texto, guardar }: { texto: string; guardar: (t: string) => void }) {
  const [editando, setEditando] = useState(false), [borrador, setBorrador] = useState(texto)
  useEffect(() => { if (!editando) setBorrador(texto) }, [texto, editando])
  const cerrar = (guarda: boolean) => { setEditando(false); if (guarda && borrador.trim() !== texto) guardar(borrador.trim()) }
  return editando
    ? <input className={s.identidadCampo} value={borrador} autoFocus maxLength={140} placeholder="Soy alguien que…" aria-label="Tu identidad: soy alguien que…"
      onChange={e => setBorrador(e.target.value)} onBlur={() => cerrar(true)}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') cerrar(true); if (e.key === 'Escape') { setBorrador(texto); setEditando(false) } }} />
    : <button className={s.identidad} onClick={() => setEditando(true)} title="Toca para editar tu identidad">{texto || 'Soy alguien que…'}</button>
}

function AjustesHabito({ clave, p, posicion, guardar }: { clave: string; p?: PrincipioHabito; posicion: number; guardar: (c: { clave: string } & Partial<PrincipioHabito>) => void }) {
  const campo = (k: 'senal' | 'dosMinutos' | 'alias', etiqueta: string, ph: string) => <label className={s.ajuste}><span>{etiqueta}</span>
    <input defaultValue={p?.[k] ?? ''} placeholder={ph} maxLength={140} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onBlur={e => { const v = e.target.value.trim(); if (v !== (p?.[k] ?? '')) guardar({ clave, [k]: v }) }} /></label>
  return <div className={s.ajustes}>
    {campo('senal', 'Señal', 'Hora y momento')}
    {campo('dosMinutos', '2 min', 'La versión mínima')}
    <label className={s.ajusteCheck}><input type="checkbox" checked={!!p?.privado} onChange={e => guardar({ clave, privado: e.target.checked })} /><span>Privado</span></label>
    {p?.privado && campo('alias', 'Se ve como', NOMBRE_PRIVADO)}
  </div>
}

/** La temporada entera (lunes a domingo), con su porcentaje por semana y el premio al final. */
function Temporada({ temporada, semanas, lista, nombre, marca, today, inicio }: {
  temporada: TemporadaHabitos; semanas: (string | null)[][]
  lista: Fila[]; nombre: (x: Fila) => string
  marca: (f: string, c: string) => Marca; today: string; inicio: string | null
}) {
  const claves = lista.map(x => x.clave)
  const total = Math.round((Date.parse(`${temporada.hasta}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  return <div className={s.cuadricula} aria-label={`${temporada.nombre}: del ${temporada.desde} al ${temporada.hasta}`}>
    <div className={s.cuadriculaCabeza}>
      <b>{total > 0 ? total : 0}</b><span>{total === 1 ? 'día' : 'días'} para {temporada.premio}</span>
      <span className={s.leyendaMini}>{lista.map((x, k) => <i key={x.clave} data-n={k}>{nombre(x)}</i>)}</span>
    </div>
    <div className={s.semanaFila} aria-hidden><span />{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, k) => <span key={k} className={s.dow}>{d}</span>)}<span className={s.dow}>%</span></div>
    {semanas.map((sem, k) => {
      const pct = porcentajeSemana(sem, claves, marca, today, inicio)
      return <div key={k} className={s.semanaFila}>
        <span className={s.semanaNum}>S{k + 1}</span>
        {sem.map((f, j) => f ? <span key={f} className={s.dia} data-hoy={f === today || undefined} data-futuro={f > today || undefined} data-fuera={(inicio && f < inicio) || undefined} data-premio={f === temporada.hasta || undefined}
          title={f === temporada.hasta ? temporada.premio : undefined}>
          <small>{Number(f.slice(-2))}</small>
          {f === temporada.hasta ? <Trophy size={11} aria-label={temporada.premio} />
            : <span className={s.barras}>{lista.map((x, n) => <i key={x.clave} data-n={n} data-estado={estadoCelda(marca(f, x.clave), f, today, inicio)} />)}</span>}
        </span> : <span key={`v${j}`} className={s.diaVacio} />)}
        <span className={s.semanaPct}>{pct ? `${pct.pct}%` : '—'}</span>
      </div>
    })}
    <p className={s.nota}>Cuenta desde el {Number(inicio?.slice(-2) ?? temporada.desde.slice(-2))} de {new Date(`${inicio ?? temporada.desde}T12:00:00`).toLocaleDateString('es-MX', { month: 'long' })}; lo de antes no se rellena. Cada barra es un hábito.</p>
  </div>
}

/** El día de hoy de la hoja: lo usa /telefono/habitos (fuera de la hoja del día) con el mismo rango que el calendario. */
export const rangoHabitosHoy = (hoy: string) => ({ date: hoy, from: shiftDay(hoy, -59), to: hoy })
