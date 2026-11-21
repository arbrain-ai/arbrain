'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { instalacion } from '@/config'
import { useCivilClock } from '@/features/sistema/useHabitRecords'
import type { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { useAtomicos } from '@/features/sistema/useAtomicos'
import { nombreEnPantalla } from '@/lib/sistema/atomicos'
import { usePreferencia } from './orden-tareas'
import s from './franja-plan.module.css'
import { tr } from '@/shared/i18n'
import { trNodos } from '@/shared/i18n'

/**
 * El objetivo de cada escala, UN solo esqueleto para Día, Semana y Mes (25 oct 2026, 08:54, Daniel: «el objetivo del mes debe compartir
 * la interfaz del objetivo de la semana… colapsado por defecto se ve el objetivo con el dorado que ya teníamos; al dar clic veo
 * completo»). Una línea con el riel dorado de la casa a la izquierda, la escala en dorado y el título legible; en el Día, además, los
 * hábitos de hoy marcables ahí mismo. Un toque la abre: el título entero y su detalle (entregables, subobjetivos, hábitos).
 *
 * - Plegada por defecto; el dispositivo recuerda si la dejaste abierta (el Mes recuerda la suya aparte). Con `recordar={false}`
 *   (el Día en el teléfono, 4 nov 2026) nace plegada cada vez.
 * - Lo que la abre desde fuera (`abrirSenal`: el aviso «N te esperan», un push) la abre SOLO esta vez: plegarla la deja como estaba y
 *   no se guarda (4 nov 2026, 19:31: el aviso la dejaba abierta para siempre y en el teléfono tapaba la línea del tiempo).
 * - Sin detalle no hay toggle (antes la Semana vacía tenía un chevron que «no muestra nada»): el título se lee entero en su línea.
 * - La temporada/monk mode vive solo en la vista H (25 oct 2026, 08:10).
 * - `encima` (16 nov 2026, Daniel con el Día fijado junto al chat: «este toggle en lugar de mandar para abajo, que sea como una pestaña
 *   que se sobrepone al dar clic»): la franja es SIEMPRE una línea y su detalle se abre como una pestaña flotante encima de lo que sigue
 *   (la línea del día no se mueve). Se cierra con clic fuera o Esc, nace plegada cada vez y no se guarda en el dispositivo.
 */
export function FranjaPlan({ rotulo, titulo, vacio, cuenta, habitos, detalle, aviso, abrirSenal = 0, clave = 'arbrain.calendario.franja-abierta', abiertaInicial = false, recordar = true, encima = false }: {
  /** «Hoy», «Semana · S4», «Mes · octubre». */
  rotulo: ReactNode
  titulo: string | null
  vacio: string
  /** «k de n» de los entregables, en dorado a la derecha (Semana y Mes; el Día cuenta sus hábitos). */
  cuenta?: { k: number; n: number } | null
  /** Las casillas de hoy; sin ellas (un día futuro), la franja no las pinta. */
  habitos?: { dia: string; habits: ReturnType<typeof useHabitRecords>; especial?: Record<string, { hecho: boolean; onToggle?: () => void }> }
  /** Lo que se ve al abrir. Vacío (null/false) = no hay nada que abrir y no se pinta el toggle. */
  detalle?: ReactNode
  /** Dónde recuerda el dispositivo si quedó abierta. */
  clave?: string
  /** Abierta hasta que se pliegue (el Día a pantalla completa: la lista del día ocupa la columna izquierda, 3 nov 2026). */
  abiertaInicial?: boolean
  /** Lo que se ve en la línea aunque esté plegada, junto a la cuenta («7 te esperan», 4 nov 2026). */
  aviso?: ReactNode
  /** Cada vez que cambia (y no es 0), la franja se abre si estaba plegada (el aviso lleva a su sección), sin guardarlo. */
  abrirSenal?: number
  /** false: el dispositivo no guarda si quedó abierta (nace plegada, o `abiertaInicial`, cada vez). */
  recordar?: boolean
  /** El detalle se sobrepone como pestaña flotante en vez de empujar lo de abajo (el Día sin scroll). */
  encima?: boolean
}) {
  const [guardada, alternarGuardada] = usePreferencia(clave, abiertaInicial)
  const [suelta, setSuelta] = useState(abiertaInicial)
  const preferida = recordar ? guardada : suelta
  // Abierta por la señal: dura hasta que la persona la pliega; nunca se escribe en la preferencia.
  const [porSenal, setPorSenal] = useState(false)
  useEffect(() => { if (abrirSenal) setPorSenal(true) }, [abrirSenal])
  // Encima: abierta solo mientras se usa (un clic, o la señal «N te esperan»); cerrarla suelta las dos y nada se guarda.
  const [flota, setFlota] = useState(false)
  const cerrarFlota = () => { setFlota(false); setPorSenal(false) }
  const { today } = useCivilClock()
  const conDetalle = Boolean(detalle), abierta = conDetalle && (encima ? flota || porSenal : preferida || porSenal)
  const alternar = () => {
    if (encima) { if (abierta) cerrarFlota(); else setFlota(true); return }
    if (abierta && porSenal) { setPorSenal(false); if (!preferida) return }
    if (recordar) alternarGuardada(); else setSuelta(x => !x)
  }
  const raiz = useRef<HTMLElement>(null)
  const flotando = encima && abierta
  // La pestaña llega hasta donde termina su marco (la hoja del día), nunca más: lo que no cabe se desplaza dentro de ella. Se mide en
  // px del documento (offset*), que no cambian con el zoom de la interfaz.
  const [tope, setTope] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = raiz.current, marco = el?.offsetParent as HTMLElement | null
    if (!flotando || !el || !marco) { setTope(null); return }
    const medir = () => setTope(Math.max(160, marco.clientHeight - el.offsetTop - el.offsetHeight - 8))
    medir()
    const o = new ResizeObserver(medir); o.observe(marco)
    return () => o.disconnect()
  }, [flotando])
  // Clic fuera o Esc la cierran. Lo que ella misma abrió (la hoja de una tarea, el menú de prioridad) no cuenta como «fuera».
  useEffect(() => {
    if (!flotando) return
    const propio = '[role="dialog"], [role="menu"], [data-menu-prioridad], [data-hoja-ignora]'
    const fuera = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || raiz.current?.contains(t) || t.closest(propio)) return
      cerrarFlota()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      const t = e.target as HTMLElement | null
      // Escribiendo dentro (sumar una casilla): el primer Esc suelta el campo; con una hoja o un menú abiertos, Esc es de ellos.
      if (t && raiz.current?.contains(t) && t.matches('input, textarea, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"]:not([data-franja-flotante]), [role="menu"]')) return
      e.preventDefault(); e.stopPropagation(); cerrarFlota()
    }
    document.addEventListener('pointerdown', fuera, true); document.addEventListener('keydown', tecla, true)
    return () => { document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla, true) }
  }, [flotando])
  const linea = <span className={s.seg} data-objetivo><span className={s.rotulo}>{rotulo}</span>
    {titulo ? <span className={s.titulo}>{titulo}</span> : <span className={s.vacio}>{tr(vacio)}</span>}</span>

  return <section ref={raiz} className={s.franja} data-abierta={(abierta && !encima) || undefined} data-encima={encima || undefined} data-flotando={flotando || undefined}
    data-sin-detalle={(!conDetalle && !encima) || undefined} data-vacio={!titulo || undefined}
    data-objetivo-escala aria-label={habitos ? tr('Objetivo y hábitos') : tr('Objetivo')}>
    <div className={s.linea}>
      {conDetalle ? <button className={s.resumen} onClick={alternar} aria-expanded={abierta} aria-haspopup={encima ? 'dialog' : undefined}
        title={abierta ? (encima ? tr('Cerrar (Esc)') : tr('Plegar a una línea')) : encima ? tr('Ver el objetivo y las tareas de hoy') : tr('Ver el objetivo completo')}>{linea}</button>
        : <div className={s.resumen}>{linea}</div>}
      {cuenta && cuenta.n > 0 && <span className={s.cuenta}>{trNodos('{k} de {n}', { k: <b>{cuenta.k}</b>, n: cuenta.n })}</span>}
      {aviso}
      {habitos && habitos.dia <= today && <Casillas {...habitos} />}
      {conDetalle && <button className={s.chevron} onClick={alternar} aria-expanded={abierta} aria-label={abierta ? tr('Plegar el objetivo') : tr('Abrir el objetivo')}><ChevronDown size={15} aria-hidden /></button>}
    </div>
    {abierta && (encima ? <div className={s.flotante} role="dialog" aria-label={tr('Objetivo y tareas del día')} data-franja-flotante style={tope ? { maxHeight: tope } : undefined}>
      {titulo && <p className={s.tituloEntero}>{titulo}</p>}
      <div className={s.detalle}>{detalle}</div>
    </div> : <div className={s.detalle}>{detalle}</div>)}
  </section>
}

/** Los hábitos de hoy en la franja: las casillas de «Hábitos de hoy» en chico, con la misma pluma y la misma privacidad (los tres
 *  cuentan en el x/3; el privado se llama «Hábito 3» siempre, sin candado, desde el 28 oct). */
function Casillas({ dia, habits, especial = {} }: NonNullable<Parameters<typeof FranjaPlan>[0]['habitos']>) {
  const atomicos = useAtomicos()
  const propuesta = instalacion().habitosAtomicos
  const lista = (habits.data?.habitos ?? []).map(x => ({ ...x, p: atomicos.data?.habitos[x.clave] ?? propuesta?.habitos[x.clave] }))
  if (!lista.length) return null
  const hecho = (clave: string) => especial[clave] ? especial[clave].hecho : habits.record(dia, clave)?.hecho === true
  const n = lista.filter(x => hecho(x.clave)).length
  return <div className={s.seg} data-habitos role="group" aria-label={tr('Hábitos de hoy: {n} de {total}', { n, total: lista.length })}>
    <i className={s.sep} aria-hidden /><span className={s.rotulo}>{tr('Hábitos')}</span><b className={s.contador}>{n}/{lista.length}</b>
    {lista.map(x => { const nombre = nombreEnPantalla(x.nombre, x.p), si = hecho(x.clave)
      return <button key={x.clave} className={s.casilla} data-hecho={si || undefined} aria-pressed={si} aria-label={nombre} title={nombre}
        onClick={() => { if (especial[x.clave]?.onToggle) especial[x.clave].onToggle!(); else habits.toggle(dia, x.clave, 'manual') }}>
        {si && <Check size={11} strokeWidth={3} aria-hidden />}</button> })}
  </div>
}
