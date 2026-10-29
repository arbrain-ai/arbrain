'use client'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { CalendarClock, Lock } from 'lucide-react'
import { carriles, duracion, tramoDia, type Bloque } from './dia-vivo'
import type { BloqueAgenda } from './agenda-llamadas'
import { esCompromiso } from './categorias'
import { esc, hora } from './vivo-piezas'
import type { PlanEvent, PlanItem, PlanTask } from './types'
import { encuadreDe } from './encuadre'
import { useGobierno } from './gobierno'
import { useEncuadre } from './useEncuadre'
import d from './dia-vivo.module.css'
import { esNoNegociable, SECCION, seccionDe } from './secciones'
import { franjasDelDia, rango, resumenCampo, tituloZona } from './campos-fondo'
import { DEF } from './categorias'
import { useZonas } from './useZonas'
// La línea de ahora es la de «Tu día» (cabina/luz.module.css): se aplican las dos clases, no se copia el estilo.
import luz from '@/features/cabina/luz.module.css'

/** Alto de una hora (10 oct 2026): el día entero de 05 a 22 mide ~510 px y va en el scroll del panel o de la página. */
const HORA_PX = 30
/** Con `llenar`, la hora nunca baja de esto aunque la pantalla sea corta (la etiqueta y un bloque de 30 min siguen legibles). */
const HORA_PX_MIN = 22
/**
 * La agenda mini (5 oct 2026, Daniel: «la mitad de la pantalla con el día en horas, como una agenda miniatura súper fluida,
 * y la otra mitad con las tareas»). Una columna de horas, ajustada a lo que tiene el día, con los bloques en su lugar, los
 * empalmes lado a lado y el ahora como una línea de oro (lo único que late). El objetivo, si tiene hora, entra como bloque
 * de oro con `data-objetivo`: al pasar el ratón se ilumina también en Tareas y en la línea de arriba (es lo mismo).
 * Desde el 10 oct 2026 («desde las cinco a las diez pm… el resto del día me gustaría tenerlo presente») muestra siempre el
 * día entero de 05:00 a 22:00 (más si algo cae fuera), lo vivido sombreado y la línea de ahora; al abrir hoy, baja al ahora.
 * Desde el 21 oct 2026 la agenda no tiene scroll propio (se tragaba la rueda) y la línea de ahora es la de «Tu día».
 * Desde el 22 oct 2026 abre con el ahora a un tercio de lo visible y otro día en su primer evento o a las 5:30 (useEncuadre.ts).
 */
export function AgendaMini({ bloques, bandas = [], todoElDia, fecha, ahora, esHoy, pasado, color, cargando, rejilla, onRejilla, onAbrir, objetivo, todoElDiaAbierto, onTodoElDia, central = true, llenar = false }: {
  bloques: BloqueAgenda[]
  /** Ventanas de disponibilidad (18 oct 2026): una banda de fondo detrás de las tarjetas, no una columna. */
  bandas?: Bloque[]
  todoElDia: PlanEvent[]; fecha: Date; ahora: number; esHoy: boolean; pasado: boolean
  color: (e: PlanEvent) => string | null; cargando: boolean
  rejilla: boolean
  /** El toque a la rejilla de FullCalendar. El Día ya no lo pasa (18 oct 2026: una sola rejilla, solo eventos). */
  onRejilla?: () => void
  onAbrir: (item: PlanItem) => void
  /** La tarea-objetivo con hora (inicio y fin en ms). */
  objetivo?: { tarea: PlanTask; inicio: number; fin: number; hecha: boolean } | null
  /** Lo de día completo plegado en una línea (la primera y «+N»); un toque lo abre. Sin `onTodoElDia`, siempre abierto. */
  todoElDiaAbierto?: boolean
  onTodoElDia?: () => void
  /** La hoja de en medio del carril: solo ella encuadra el scroll (las vecinas también se pintan). */
  central?: boolean
  /** Dos columnas (24 oct 2026): el día entero cabe en el alto que le dan, sin scroll; la hora mide lo que alcance. */
  llenar?: boolean
}) {
  // Zonas de mi vida (28 oct 2026): las encendidas de la persona (useZonas), detrás de todo.
  const zonas = useZonas()
  const base = new Date(fecha).setHours(0, 0, 0, 0)
  // Lo de día completo nace plegado en una línea (ronda 3, 10 oct 2026): el mismo estado que la franja de la Semana.
  const plegadas = Boolean(onTodoElDia) && !todoElDiaAbierto && todoElDia.length > 1
  const todos = [...bloques, ...bandas, ...(objetivo ? [{ inicio: objetivo.inicio, fin: objetivo.fin }] : [])]
  const { desde, hasta } = tramoDia(todos, fecha)
  const horasN = (hasta - desde) / 60
  // Llenar: el alto de la caja se mide y se reparte entre las horas del tramo (5:00 a 22:00 o lo que el día pida).
  const caja = useRef<HTMLDivElement>(null)
  const [altoCaja, setAltoCaja] = useState(0)
  useLayoutEffect(() => {
    const el = caja.current
    if (!llenar || !el) { setAltoCaja(0); return }
    const medir = () => setAltoCaja(el.clientHeight)
    medir()
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [llenar])
  // 14 px: el margen de la rejilla y medio renglón para que la etiqueta de la última hora no se corte.
  const px = llenar && altoCaja > 0 ? Math.max(HORA_PX_MIN, (altoCaja - 14) / horasN) : HORA_PX
  const y = (t: number) => ((t - base) / 60000 - desde) / 60 * px
  const alto = horasN * px
  // Al abrir, al llegar a otro día o con «Hoy»: hoy, el ahora a un tercio de lo visible; otro día, su primer evento o las 5:30.
  // Lo pegajoso de arriba es la barra del calendario (`--plan-pegado`). Después, el scroll es de Daniel.
  const mini = useRef<HTMLDivElement>(null)
  const dia = new Date(fecha).toDateString()
  useEncuadre({
    ancla: mini, origen: desde, pxPorMinuto: px / 60, clave: central ? dia : null, listo: !cargando,
    encuadre: () => encuadreDe(esHoy ? (ahora - base) / 60000 : null, bloques.map(b => (b.inicio - base) / 60000)),
    tapa: () => mini.current ? parseFloat(getComputedStyle(mini.current).getPropertyValue('--plan-pegado')) || 0 : 0,
  })
  const horas = Array.from({ length: horasN + 1 }, (_, i) => desde + i * 60)
  const lanes = carriles(objetivo ? [...bloques, { id: 'objetivo', titulo: '', inicio: objetivo.inicio, fin: objetivo.fin, color: null, evento: null as unknown as PlanEvent }] : bloques)
  const ahoraY = esHoy ? y(ahora) : null
  // Campos de fondo: detrás de todo; si una llamada pisa el trabajo profundo, la llamada gana y la etiqueta lo dice.
  const diaClave = `${new Date(base).getFullYear()}-${String(new Date(base).getMonth() + 1).padStart(2, '0')}-${String(new Date(base).getDate()).padStart(2, '0')}`
  const franjas = franjasDelDia(zonas.encendidas, diaClave)
  const llamadas = bloques.filter(b => esCompromiso(b.evento)).map(b => ({ desde: (b.inicio - base) / 60000, hasta: (b.fin - base) / 60000 }))
  const profundo = resumenCampo(franjas, 'profundo', llamadas)
  // DRIP (24 oct 2026): la etiqueta de lo delegable, de quién es y el candado de lo protegido.
  const gobierno = useGobierno()
  const vivo = (inicio: number, fin: number) => esHoy && inicio <= ahora && ahora < fin
  const lugar = (inicio: number, fin: number, id: string) => {
    const top = y(inicio), h = Math.max(12, y(fin) - top - 1), l = lanes.get(id) ?? { col: 0, cols: 1 }
    return { h, style: { top, height: h, left: `${l.col / l.cols * 100}%`, width: `calc(${100 / l.cols}% - 2px)` } }
  }

  return <section className={`${d.columna} ${d.areaAgenda}`} aria-label="Agenda">
    <header className={`${d.titulo} ${d.entra}`} style={esc(2)}><h3>Agenda</h3>{bloques.length > 0 && <small>{bloques.length}</small>}
      {/* El espejo del día (28 oct 2026): cuánto trabajo profundo deja libre la agenda y la ventana de comida, en una línea. */}
      {franjas.length > 0 && <span className={d.camposResumen} data-campos>{[profundo?.texto, ...franjas.filter(f => f.clave === 'comida').slice(0, 1).map(f => `Comida ${rango(f)}`)].filter(Boolean).join(' · ')}</span>}
      {onRejilla && <button className={`${d.accion} ${d.soloIcono} ${d.sutil}`} onClick={onRejilla} aria-pressed={rejilla} aria-label={rejilla ? 'Plegar la rejilla de horas' : 'Ver en horas'}
        title={rejilla ? 'Plegar la rejilla de horas' : 'Rejilla completa (arrastrar y crear)'}><CalendarClock size={13} aria-hidden /></button>}
    </header>
    {todoElDia.length > 0 && <div className={`${d.pastillas} ${d.entra}`} style={esc(3)} data-plegadas={plegadas || undefined}>
      {(plegadas ? todoElDia.slice(0, 1) : todoElDia).map(e => <button key={e.id} className={d.pastilla} onClick={() => onAbrir(e)} title={e.title}>
        <i aria-hidden style={{ background: color(e) ?? undefined }} /><span>{e.title}</span></button>)}
      {onTodoElDia && todoElDia.length > 1 && <button className={d.pastillaMas} onClick={onTodoElDia} aria-expanded={!plegadas}
        aria-label={plegadas ? `Ver las ${todoElDia.length} de día completo` : 'Plegar lo de día completo'}>{plegadas ? `+${todoElDia.length - 1}` : <svg viewBox="0 0 12 12" aria-hidden><path d="M3 7.5 6 4.5 9 7.5" /></svg>}</button>}
    </div>}
    {!todos.length && <p className={d.vacio}>{cargando ? 'Leyendo tu calendario…' : `Nada agendado ${esHoy ? 'hoy' : 'este día'}.`}</p>}
    <div ref={caja} className={`${d.miniCaja} ${d.entra}`} style={esc(3)} data-hoy={esHoy || undefined}>
      <div ref={mini} className={d.mini} style={{ height: alto } as CSSProperties} role="presentation">
        {esHoy && ahoraY != null && ahoraY > 0 && <i className={d.miniVivido} style={{ height: Math.min(ahoraY, alto) }} aria-hidden />}
        {horas.map(m => <span key={m} className={d.miniHora} style={{ top: (m - desde) / 60 * px }}>
          <time hidden={ahoraY != null && Math.abs((m - desde) / 60 * px - ahoraY) < 12}>{String(Math.floor(m / 60) % 24).padStart(2, '0')}</time></span>)}
        {/* Zonas de mi vida: tinte del color de su categoría, sin texto; su nombre y sus horas, al pasar el cursor. Fuera del tramo, nada. */}
        {franjas.filter(f => f.hasta > desde && f.desde < hasta).map((f, k) => { const top = y(base + Math.max(f.desde, desde) * 60000), h = y(base + Math.min(f.hasta, hasta) * 60000) - top
          return <div key={`campo${k}`} className={d.miniCampo} data-forma={f.forma} data-campo={f.clave} data-categoria={f.categoria}
            style={{ top, height: h, ['--c' as string]: DEF[f.categoria].color } as CSSProperties} aria-hidden title={tituloZona(f, profundo)} /> })}
        {bandas.map(b => { const top = y(b.inicio), h = Math.max(12, y(b.fin) - top)
          return <button key={b.id} className={d.miniBanda} style={{ top, height: h, ['--c' as string]: b.color ?? 'var(--primary)' } as CSSProperties} onClick={() => onAbrir(b.evento)}
            title={`${hora(b.inicio)} – ${hora(b.fin)} · ${b.titulo}`} aria-label={`Ventana de ${hora(b.inicio)} a ${hora(b.fin)}, ${b.titulo}`}><span>{b.titulo.replace(/^[^\p{L}\p{N}]+/u, '')}</span></button> })}
        <ol className={d.miniBloques}>
          {bloques.map(b => {
            const c = lugar(b.inicio, b.fin, b.id), yaPaso = pasado || (esHoy && b.fin <= ahora)
            const sec = seccionDe(b.evento)
            const l = gobierno?.lectura(b.evento), tag = l && (l.protegido || l.delegable) ? (l.protegido ? 'protegido' : l.delegadoA ? 'delegado' : 'delegable') : null
            return <li key={b.id} style={{ ...c.style, ['--c' as string]: b.color ?? 'var(--primary)' } as CSSProperties} data-seccion={sec ?? undefined} data-innegociable={esNoNegociable(b.evento) || undefined} data-drip={l?.cuadrante} data-letra={l?.cuadrante ? l.cuadrante[0].toUpperCase() : undefined} data-protegido={l?.protegido || undefined}>
              <button onClick={() => onAbrir(b.evento)} data-pasado={yaPaso || undefined} data-compromiso={esCompromiso(b.evento) || undefined} data-vivo={vivo(b.inicio, b.fin) || undefined} data-corto={c.h < 26 || undefined}
                title={`${hora(b.inicio)} – ${hora(b.fin)} · ${b.titulo}`} aria-label={`${hora(b.inicio)} a ${hora(b.fin)}, ${b.titulo}, ${duracion((b.fin - b.inicio) / 60000)}`} data-con-brief={b.brief ? '' : undefined} data-con-tag={tag ?? undefined}>
                {sec && <svg className={d.icoSeccion} viewBox="0 0 16 16" aria-hidden><path d={SECCION[sec].icono} /></svg>}<span>{b.corto ?? b.titulo}</span>{c.h >= 34 && <time>{hora(b.inicio)} – {hora(b.fin)}</time>}
                {tag && <em className={d.dripTag} data-tipo={tag} title={tag === 'protegido' ? 'Protegido: nada nuevo entra encima' : tag === 'delegado' ? `De ${l!.delegadoA}` : 'Delegable: tócalo y «Delegar a Levy»'}>
                  {tag === 'protegido' ? <Lock size={9} aria-label="protegido" /> : tag === 'delegado' ? `de ${l!.delegadoA}` : 'delegable'}</em>}
              </button>
              {b.brief && <button className={d.miniBrief} onClick={() => onAbrir(b.brief!.evento)} title={b.brief.titulo} aria-label={`Abrir ${b.brief.titulo}`}>📋</button>}
            </li>
          })}
          {objetivo && (() => {
            const c = lugar(objetivo.inicio, objetivo.fin, 'objetivo')
            return <li key="objetivo" style={{ ...c.style, ['--c' as string]: 'var(--gold)' } as CSSProperties}>
              <button onClick={() => onAbrir(objetivo.tarea)} data-objetivo data-hecha={objetivo.hecha || undefined} data-corto={c.h < 26 || undefined}
                title={`Objetivo · ${hora(objetivo.inicio)} · ${objetivo.tarea.title}`} aria-label={`Objetivo a las ${hora(objetivo.inicio)}: ${objetivo.tarea.title}`}>
                <span>{objetivo.tarea.title}</span>
              </button>
            </li>
          })()}
        </ol>
        {ahoraY != null && ahoraY >= 0 && ahoraY <= alto && <p className={`${luz.lineaAhora} ${d.miniAhora}`} style={{ top: ahoraY }} aria-hidden>{hora(ahora)}</p>}
      </div>
    </div>
  </section>
}
