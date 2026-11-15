'use client'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Lock } from 'lucide-react'
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
import { franjasDelDia, resumenCampo, tituloZona } from './campos-fondo'
import { DEF } from './categorias'
import { useZonas } from './useZonas'
import type { ItemDia } from './lista-dia'
import { horaDeMinuto, pistaDeMarca } from './ListaDia'
import { arrastrableEnDia, soltarEnDia } from './arrastre-dia'
import { esArrastre, hhmm } from './semana-horas'
// El fantasma de mover es el de la Semana en Horas (mismo oro punteado y la hora en vivo): se usa su clase, no se copia el estilo.
import h from './semana-horas.module.css'
// La línea de ahora es la de «Tu día» (cabina/luz.module.css): se aplican las dos clases, no se copia el estilo.
import luz from '@/features/cabina/luz.module.css'
import { tr } from '@/shared/i18n'

/** Alto de una hora (10 oct 2026): el día entero de 05 a 22 mide ~510 px y va en el scroll del panel o de la página. */
const HORA_PX = 30
/** Con `llenar`, la hora nunca baja de esto aunque la pantalla sea corta (la etiqueta y un bloque de 30 min siguen legibles). */
const HORA_PX_MIN = 22
/** Con el dedo, mover empieza tras mantener presionado esto (igual que la Semana); antes, el dedo desplaza la página. */
const MANTENER_MS = 320
/** Un arrastre en curso: el evento, cuántos minutos debajo de su inicio se tomó y el minuto de inicio bajo el puntero. */
interface Gesto { bloque: BloqueAgenda; agarre: number; minuto: number; x0: number; y0: number; activo: boolean; esDedo: boolean }
/**
 * La agenda mini (5 oct 2026, Daniel: «la mitad de la pantalla con el día en horas, como una agenda miniatura súper fluida,
 * y la otra mitad con las tareas»). Una columna de horas, ajustada a lo que tiene el día, con los bloques en su lugar, los
 * empalmes lado a lado y el ahora como una línea de oro (lo único que late). El objetivo, si tiene hora, entra como bloque
 * de oro con `data-objetivo`: al pasar el ratón se ilumina también en Tareas y en la línea de arriba (es lo mismo).
 * Desde el 10 oct 2026 («desde las cinco a las diez pm… el resto del día me gustaría tenerlo presente») muestra siempre el
 * día entero de 05:00 a 22:00 (más si algo cae fuera), lo vivido sombreado y la línea de ahora; al abrir hoy, baja al ahora.
 * Desde el 21 oct 2026 la agenda no tiene scroll propio (se tragaba la rueda) y la línea de ahora es la de «Tu día».
 * Desde el 22 oct 2026 abre con el ahora a un tercio de lo visible y otro día en su primer evento o a las 5:30 (useEncuadre.ts).
 * Desde el 30 oct 2026 va sin cabecera (Daniel: «casi que ni quiero ver nada de eso porque para eso ya tenemos bajado a tierra el
 * dia con la linea amarilla de la hora»): fuera el título «Agenda», el conteo, el resumen de trabajo profundo y comida y las
 * pastillas de día completo. Solo la línea de tiempo; lo de día completo sigue en la franja de la Semana.
 * Desde el 3 nov 2026 la lista del día se refleja aquí «de forma sutil y elegante» (Daniel): lo ligado a un evento va DENTRO de su tarjeta
 * como una sublínea discreta (círculo hueco y texto tenue); lo suelto con hora, como una marca en su hora, nunca como bloque. Se marcan
 * desde aquí con la misma pluma que la lista.
 * Desde el 11 nov 2026 (Daniel: «deberia poder agarrar eventos y reposicionarlos a otra hora») un evento con hora y editable se arrastra
 * a otra hora como en la Semana: fantasma con la hora en vivo, redondeo a 15 min, Esc cancela y al soltar va por `onMover` (la misma
 * pluma de la Semana, con ⌘Z y la guarda de invitados). Con el dedo, mantener presionado. Los de todo el día no viven aquí.
 */
export interface PendientesTimeline {
  dentro: Map<string, ItemDia[]>; sueltas: ItemDia[]
  alternar: (it: ItemDia) => void; puede: (it: ItemDia) => boolean
  resaltado?: string | null; onResaltar?: (id: string | null) => void
}
export function AgendaMini({ bloques, bandas = [], fecha, ahora, esHoy, pasado, cargando, onAbrir, objetivo, central = true, llenar = false, pendientes, onMover }: {
  bloques: BloqueAgenda[]
  /** Ventanas de disponibilidad (18 oct 2026): una banda de fondo detrás de las tarjetas, no una columna. */
  bandas?: Bloque[]
  fecha: Date; ahora: number; esHoy: boolean; pasado: boolean
  cargando: boolean
  onAbrir: (item: PlanItem) => void
  /** La tarea-objetivo con hora (inicio y fin en ms). */
  objetivo?: { tarea: PlanTask; inicio: number; fin: number; hecha: boolean } | null
  /** La hoja de en medio del carril: solo ella encuadra el scroll (las vecinas también se pintan). */
  central?: boolean
  /** Dos columnas (24 oct 2026): el día entero cabe en el alto que le dan, sin scroll; la hora mide lo que alcance. */
  llenar?: boolean
  /** La lista del día en el timeline: sublíneas dentro de su evento y marcas sueltas en su hora. */
  pendientes?: PendientesTimeline
  /** Arrastrar un evento a otra hora (la pluma de la Semana: `moverEnRejilla`). Sin esto, la agenda no arrastra. */
  onMover?: (evento: PlanEvent, inicio: Date, fin: Date) => void
}) {
  // Zonas de mi vida (28 oct 2026): las encendidas de la persona (useZonas), detrás de todo.
  const zonas = useZonas()
  const base = new Date(fecha).setHours(0, 0, 0, 0)
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
  // Las marcas sueltas: en su hora; dos que caen juntas se apilan sin encimarse. Sobre un evento, a la derecha y con velo (no tapan su título).
  const marcas = (() => { let ultimo = -Infinity
    return (pendientes?.sueltas ?? []).filter(it => it.minuto! >= desde && it.minuto! <= hasta).map(it => {
      const t = base + it.minuto! * 60000, top = Math.max(ultimo + 15, y(t)); ultimo = top
      return { it, top, encima: bloques.some(b => b.inicio <= t && t < b.fin) } }) })()
  const marcar = (it: ItemDia, conTexto: boolean, clase: string) => { const p = pendientes!, si = p.puede(it)
    return <button key={it.id} className={clase} data-hecho={it.hecho || undefined} data-origen={it.origen} data-p={it.tarea?.priority} data-resaltado={p.resaltado === it.id || undefined}
      role="checkbox" aria-checked={it.hecho} disabled={!si} onClick={() => p.alternar(it)} onMouseEnter={() => p.onResaltar?.(it.id)} onMouseLeave={() => p.onResaltar?.(null)}
      aria-label={it.hecho ? tr('Reabrir: {texto}', { texto: it.texto }) : tr('Marcar: {texto}', { texto: it.texto })} title={`${it.minuto != null ? `${horaDeMinuto(it.minuto)} · ` : ''}${it.texto}\n${pistaDeMarca(it, si)}`}>
      <i aria-hidden />{conTexto && <span>{it.texto}</span>}</button> }
  // Arrastrar a otra hora (11 nov 2026): el mismo gesto que la Semana en Horas, en una sola columna.
  const tramo = { desde, hasta }
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const gestoRef = useRef<Gesto | null>(null)
  const recienSoltado = useRef(0)
  const onMoverRef = useRef(onMover); onMoverRef.current = onMover
  /** El minuto del día bajo el puntero (puede salir del tramo; `soltar` lo acota). */
  const minutoBajo = (clientY: number) => { const r = mini.current?.getBoundingClientRect(); return r ? desde + (clientY - r.top) / px * 60 : desde }
  const minutoBajoRef = useRef(minutoBajo); minutoBajoRef.current = minutoBajo
  const tramoRef = useRef(tramo); tramoRef.current = tramo
  useEffect(() => {
    if (!gesto) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const poner = (g: Gesto | null) => { gestoRef.current = g; setGesto(g) }
    const activar = () => { const g = gestoRef.current; if (g && !g.activo) { poner({ ...g, activo: true }); navigator.vibrate?.(8) } }
    if (gesto.esDedo && !gesto.activo) timer = setTimeout(activar, MANTENER_MS)
    const terminar = (soltado: boolean) => {
      const g = gestoRef.current
      clearTimeout(timer); poner(null)
      if (!g?.activo) return
      recienSoltado.current = Date.now()
      if (!soltado) return
      const r = soltarEnDia(g.bloque.evento, diaClave, g.minuto, tramoRef.current)
      if (r) onMoverRef.current?.(g.bloque.evento, r.inicio, r.fin)
    }
    const mover = (e: PointerEvent) => {
      const g = gestoRef.current
      if (!g) return
      if (!g.activo) {
        if (g.esDedo) { if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 8) { clearTimeout(timer); poner(null) } return }
        if (!esArrastre(e.clientX - g.x0, e.clientY - g.y0)) return
      }
      poner({ ...g, activo: true, minuto: minutoBajoRef.current(e.clientY) - g.agarre })
    }
    const arriba = () => terminar(true)
    const cancelar = () => terminar(false)
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && gestoRef.current) { e.preventDefault(); e.stopPropagation(); cancelar() } }
    const quieto = (e: TouchEvent) => { if (gestoRef.current?.activo) e.preventDefault() }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', arriba); window.addEventListener('pointercancel', cancelar)
    window.addEventListener('keydown', tecla, true); window.addEventListener('touchmove', quieto, { passive: false })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', arriba); window.removeEventListener('pointercancel', cancelar)
      window.removeEventListener('keydown', tecla, true); window.removeEventListener('touchmove', quieto)
    }
  }, [gesto?.bloque.id, gesto?.esDedo, diaClave]) // eslint-disable-line react-hooks/exhaustive-deps -- un gesto, una suscripción
  const movible = (b: BloqueAgenda) => Boolean(onMover) && arrastrableEnDia(b.evento, diaClave)
  function tomar(e: ReactPointerEvent, b: BloqueAgenda) {
    if (e.button !== 0 || !movible(b) || gestoRef.current) return
    const g: Gesto = { bloque: b, agarre: minutoBajo(e.clientY) - (b.inicio - base) / 60000, minuto: (b.inicio - base) / 60000, x0: e.clientX, y0: e.clientY, activo: false, esDedo: e.pointerType === 'touch' }
    gestoRef.current = g; setGesto(g)
  }
  // El fantasma: dónde caería si se suelta ahora, con la hora en vivo; en su mismo lugar, solo el contorno (como la Semana).
  const fantasma = (() => {
    if (!gesto?.activo) return null
    const b = gesto.bloque, r = soltarEnDia(b.evento, diaClave, gesto.minuto, tramo)
    const ini = r ? r.inicio.getTime() : b.inicio, fin = r ? r.fin.getTime() : b.fin
    return { top: y(ini), alto: Math.max(12, y(fin) - y(ini) - 1), desde: (ini - base) / 60000, hasta: (fin - base) / 60000, igual: !r }
  })()
  const lugar = (inicio: number, fin: number, id: string) => {
    const top = y(inicio), h = Math.max(12, y(fin) - top - 1), l = lanes.get(id) ?? { col: 0, cols: 1 }
    return { h, style: { top, height: h, left: `${l.col / l.cols * 100}%`, width: `calc(${100 / l.cols}% - 2px)` } }
  }

  return <section className={`${d.columna} ${d.areaAgenda}`} aria-label={tr('Agenda')} data-arrastrando={gesto?.activo || undefined}>
    {!todos.length && <p className={d.vacio}>{cargando ? tr('Leyendo tu calendario…') : esHoy ? tr('Nada agendado hoy.') : tr('Nada agendado este día.')}</p>}
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
            title={`${hora(b.inicio)} – ${hora(b.fin)} · ${b.titulo}`} aria-label={tr('Ventana de {inicio} a {fin}, {titulo}', { inicio: hora(b.inicio), fin: hora(b.fin), titulo: b.titulo })}><span>{b.titulo.replace(/^[^\p{L}\p{N}]+/u, '')}</span></button> })}
        <ol className={d.miniBloques}>
          {bloques.map(b => {
            const c = lugar(b.inicio, b.fin, b.id), yaPaso = pasado || (esHoy && b.fin <= ahora)
            const sec = seccionDe(b.evento), subs = pendientes?.dentro.get(b.id)
            const l = gobierno?.lectura(b.evento), tag = l && (l.protegido || l.delegable) ? (l.protegido ? 'protegido' : l.delegadoA ? 'delegado' : 'delegable') : null
            return <li key={b.id} style={{ ...c.style, ['--c' as string]: b.color ?? 'var(--primary)' } as CSSProperties} data-tomado={gesto?.activo && gesto.bloque.id === b.id || undefined} data-seccion={sec ?? undefined} data-innegociable={esNoNegociable(b.evento) || undefined} data-drip={l?.cuadrante} data-letra={l?.cuadrante ? l.cuadrante[0].toUpperCase() : undefined} data-protegido={l?.protegido || undefined}>
              <button onClick={() => { if (Date.now() - recienSoltado.current > 250) onAbrir(b.evento) }} onPointerDown={e => tomar(e, b)} data-planning-id={b.id} data-movible={movible(b) || undefined} data-pasado={yaPaso || undefined} data-compromiso={esCompromiso(b.evento) || undefined} data-vivo={vivo(b.inicio, b.fin) || undefined} data-corto={c.h < 26 || undefined}
                title={`${hora(b.inicio)} – ${hora(b.fin)} · ${b.titulo}`} aria-label={`${tr('{inicio} a {fin}, {titulo}, {duracion}', { inicio: hora(b.inicio), fin: hora(b.fin), titulo: b.titulo, duracion: duracion((b.fin - b.inicio) / 60000) })}${movible(b) ? `. ${tr('Arrastra para moverlo a otra hora.')}` : ''}`} data-con-brief={b.brief ? '' : undefined} data-con-tag={tag ?? undefined}>
                {sec && <svg className={d.icoSeccion} viewBox="0 0 16 16" aria-hidden><path d={SECCION[sec].icono} /></svg>}<span>{b.corto ?? b.titulo}</span>{c.h >= (subs ? 50 : 34) && <time>{hora(b.inicio)} – {hora(b.fin)}</time>}
                {tag && <em className={d.dripTag} data-tipo={tag} title={tag === 'protegido' ? tr('Protegido: nada nuevo entra encima') : tag === 'delegado' ? tr('De {quien}', { quien: l!.delegadoA }) : tr('Delegable: tócalo y «Delegar a Levy»')}>
                  {tag === 'protegido' ? <Lock size={9} aria-label={tr('protegido')} /> : tag === 'delegado' ? tr('de {quien}', { quien: l!.delegadoA }) : tr('delegable')}</em>}
              </button>
              {b.brief && <button className={d.miniBrief} onClick={() => onAbrir(b.brief!.evento)} title={b.brief.titulo} aria-label={tr('Abrir {titulo}', { titulo: b.brief.titulo })}>📋</button>}
              {subs && <div className={d.miniSub} data-sublinea data-corto={c.h < 38 || undefined} role="group" aria-label={tr('Pendientes de {titulo}', { titulo: b.titulo })}>
                {subs.map(it => marcar(it, c.h >= 38, d.miniSubItem))}</div>}
            </li>
          })}
          {objetivo && (() => {
            const c = lugar(objetivo.inicio, objetivo.fin, 'objetivo')
            return <li key="objetivo" style={{ ...c.style, ['--c' as string]: 'var(--gold)' } as CSSProperties}>
              <button onClick={() => onAbrir(objetivo.tarea)} data-objetivo data-hecha={objetivo.hecha || undefined} data-corto={c.h < 26 || undefined}
                title={tr('Objetivo · {hora} · {titulo}', { hora: hora(objetivo.inicio), titulo: objetivo.tarea.title })} aria-label={tr('Objetivo a las {hora}: {titulo}', { hora: hora(objetivo.inicio), titulo: objetivo.tarea.title })}>
                <span>{objetivo.tarea.title}</span>
              </button>
            </li>
          })()}
        </ol>
        {fantasma && <div className={d.miniFantasmas} aria-hidden={fantasma.igual || undefined}>
          <div className={h.fantasma} data-igual={fantasma.igual || undefined} role="status" aria-live="polite" style={{ top: fantasma.top, height: fantasma.alto }}>
            <time>{hhmm(fantasma.desde)} – {hhmm(fantasma.hasta)}<small> · {duracion(fantasma.hasta - fantasma.desde)}</small></time></div>
        </div>}
        {marcas.length > 0 && <ol className={d.miniMarcas} aria-label={tr('Pendientes con hora')}>
          {marcas.map(m => <li key={m.it.id} style={{ top: m.top }} data-marca-tarea data-encima={m.encima || undefined}>{marcar(m.it, true, d.miniMarca)}</li>)}
        </ol>}
        {ahoraY != null && ahoraY >= 0 && ahoraY <= alto && <p className={`${luz.lineaAhora} ${d.miniAhora}`} data-ahora-linea style={{ top: ahoraY }} aria-hidden>{hora(ahora)}</p>}
      </div>
    </div>
  </section>
}
