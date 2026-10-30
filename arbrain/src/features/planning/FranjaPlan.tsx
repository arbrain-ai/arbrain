'use client'
import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { instalacion } from '@/config'
import { useCivilClock } from '@/features/sistema/useHabitRecords'
import type { useHabitRecords } from '@/features/sistema/useHabitRecords'
import { useAtomicos } from '@/features/sistema/useAtomicos'
import { nombreEnPantalla } from '@/lib/sistema/atomicos'
import { usePreferencia } from './orden-tareas'
import s from './franja-plan.module.css'

/**
 * El objetivo de cada escala, UN solo esqueleto para Día, Semana y Mes (25 oct 2026, 08:54, Daniel: «el objetivo del mes debe compartir
 * la interfaz del objetivo de la semana… colapsado por defecto se ve el objetivo con el dorado que ya teníamos; al dar clic veo
 * completo»). Una línea con el riel dorado de la casa a la izquierda, la escala en dorado y el título legible; en el Día, además, los
 * hábitos de hoy marcables ahí mismo. Un toque la abre: el título entero y su detalle (entregables, subobjetivos, hábitos).
 *
 * - Plegada por defecto; el dispositivo recuerda si la dejaste abierta (el Mes recuerda la suya aparte).
 * - Sin detalle no hay toggle (antes la Semana vacía tenía un chevron que «no muestra nada»): el título se lee entero en su línea.
 * - La temporada/monk mode vive solo en la vista H (25 oct 2026, 08:10).
 */
export function FranjaPlan({ rotulo, titulo, vacio, cuenta, habitos, detalle, clave = 'arbrain.calendario.franja-abierta' }: {
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
}) {
  const [preferida, alternar] = usePreferencia(clave)
  const { today } = useCivilClock()
  const conDetalle = Boolean(detalle), abierta = conDetalle && preferida
  const linea = <span className={s.seg} data-objetivo><span className={s.rotulo}>{rotulo}</span>
    {titulo ? <span className={s.titulo}>{titulo}</span> : <span className={s.vacio}>{vacio}</span>}</span>

  return <section className={s.franja} data-abierta={abierta || undefined} data-sin-detalle={!conDetalle || undefined} data-vacio={!titulo || undefined}
    data-objetivo-escala aria-label={habitos ? 'Objetivo y hábitos' : 'Objetivo'}>
    <div className={s.linea}>
      {conDetalle ? <button className={s.resumen} onClick={alternar} aria-expanded={abierta} title={abierta ? 'Plegar a una línea' : 'Ver el objetivo completo'}>{linea}</button>
        : <div className={s.resumen}>{linea}</div>}
      {cuenta && cuenta.n > 0 && <span className={s.cuenta}><b>{cuenta.k}</b> de {cuenta.n}</span>}
      {habitos && habitos.dia <= today && <Casillas {...habitos} />}
      {conDetalle && <button className={s.chevron} onClick={alternar} aria-expanded={abierta} aria-label={abierta ? 'Plegar el objetivo' : 'Abrir el objetivo'}><ChevronDown size={15} aria-hidden /></button>}
    </div>
    {abierta && <div className={s.detalle}>{detalle}</div>}
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
  return <div className={s.seg} data-habitos role="group" aria-label={`Hábitos de hoy: ${n} de ${lista.length}`}>
    <i className={s.sep} aria-hidden /><span className={s.rotulo}>Hábitos</span><b className={s.contador}>{n}/{lista.length}</b>
    {lista.map(x => { const nombre = nombreEnPantalla(x.nombre, x.p), si = hecho(x.clave)
      return <button key={x.clave} className={s.casilla} data-hecho={si || undefined} aria-pressed={si} aria-label={nombre} title={nombre}
        onClick={() => { if (especial[x.clave]?.onToggle) especial[x.clave].onToggle!(); else habits.toggle(dia, x.clave, 'manual') }}>
        {si && <Check size={11} strokeWidth={3} aria-hidden />}</button> })}
  </div>
}
