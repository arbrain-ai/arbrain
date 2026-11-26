'use client'
/**
 * Un órgano de El pulso, vivo como en el mapa v16 (15 nov 2026). Daniel: «lo bonito de esta versión 16 puedes meterlo a
 * tu negocio, e igualmente manteniendo la calidad». Lo que trae del mapa (todo leído en `pulso-vivo.ts`, nada nace aquí):
 *
 *   · su IDENTIDAD: el disco de su acento con su ícono (Marketing violeta, Mente del comprador orquídea, Venta esmeralda,
 *     Entrega cielo, Finanzas oro, Sistemas acero; el rojo es solo del dolor) y la franja de su color arriba;
 *   · su NÚMERO vivo en grande, que cuenta hasta su valor una sola vez (`useCuenta` del lenguaje de movimiento);
 *   · su ESTADO «en calma / duele» con la misma cuenta del cartel, y su punto late solo si su fuente responde;
 *   · «N espera tu toque» cuando la bandeja trae decisiones que DECLARAN este órgano;
 *   · la CURVA de su serie del BI (30 días) que se dibuja de izquierda a derecha y aterriza en el oro de hoy;
 *   · su META contra la realidad en una barra que se llena, o el HUECO punteado «sin meta · ponla tú», que le pasa la
 *     pregunta a Levy (nunca una meta inventada).
 *
 * Movimiento con intención (Lasseter: una idea a la vez, entradas y salidas suaves): primero entra la tarjeta, luego
 * cuenta el número, luego se traza la curva y al final se llena la meta. Solo transform, opacity y clip-path: 60 fps.
 * Con «reducir movimiento», todo llega quieto en su estado final.
 *
 * Toda la tarjeta se toca (un botón que la cubre); lo que va encima (ponla tú, Canal de Levy) es su propio botón.
 */
import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight, Plus, type LucideIcon } from 'lucide-react'
import { ACENTO, type DatosCartelOrgano } from '@/features/canvas/islas/bloques/cartel'
import { pedirALevy } from '@/features/cabina/documento/enviar'
import { Cifra } from '@/shared/movimiento'
import { tr, trMarca } from '@/shared/i18n'
import { ORGANO, type Pulso } from './pulso'
import { partirCifra, porcentaje, unirCifra } from './pulso-vivo'
import v from './organo-vivo.module.css'

export function OrganoVivo({ x, vivo, icono: I, i, abrir, children, debajo }: {
  x: Pulso; vivo?: DatosCartelOrgano; icono: LucideIcon; i: number
  abrir?: () => void
  /** Lo que el órgano trae además de lo vivo (Marketing: sus canales). */
  children?: ReactNode
  /** Lo que va encima del botón que cubre la tarjeta (Marketing: la fila del Canal de Levy). */
  debajo?: ReactNode
}) {
  const o = ORGANO[x.organo]
  const a = vivo ? ACENTO[vivo.acento] : ACENTO.violeta
  const estado = vivo?.estado ?? (x.estado === 'numero' ? 'calma' : x.estado === 'leyendo' ? 'leyendo' : x.estado === 'oculto' ? 'oculto' : 'sin-sensor')
  const numero = x.estado === 'numero'
  const decisiones = vivo?.decisiones ?? 0
  const estilo = { ['--a-claro' as string]: a.claro, ['--a-oscuro' as string]: a.oscuro, ['--n' as string]: i } as CSSProperties
  const nombre = tr(o.nombre)

  return <div className={v.organo} style={estilo} data-organo={x.organo} data-estado={x.estado} data-clima={estado} data-toca={abrir ? '' : undefined} data-testid={`organo-${x.organo}`}>
    {abrir && <button type="button" className={v.cubre} onClick={abrir} aria-label={tr('{nombre}: abrir', { nombre })} />}
    <span className={v.franja} aria-hidden />
    <span className={v.luz} aria-hidden />

    <span className={v.cabeza}>
      <span className={v.disco} aria-hidden><I size={17} strokeWidth={2.1} /></span>
      <span className={v.quien}>
        <span className={v.nombre}>{nombre}</span>
        <span className={v.pregunta}>{tr(x.pregunta ?? o.pregunta)}</span>
      </span>
      {abrir && <ChevronRight className={v.chevron} size={16} aria-hidden />}
    </span>

    {numero && x.cifra ? <span className={v.numero}>
      <CifraViva texto={x.cifra} clave={`pulso-vivo:${x.organo}`} />
      {x.unidad && <span className={v.unidad}>{x.unidad}</span>}
    </span> : null}

    {(numero || estado === 'leyendo') && <span className={v.pildoras}>
      <Clima estado={estado} porque={vivo?.porque} />
      {decisiones > 0 && <span className={v.toque} title={tr('Decisiones de la bandeja que declaran este órgano')}>
        <i aria-hidden />{decisiones === 1 ? tr('1 espera tu toque') : tr('{n} esperan tu toque', { n: decisiones })}
      </span>}
    </span>}

    {/* El contexto de su número (Venta: lo de fuera de Polar, con su fecha); Marketing lo dice en sus canales. */}
    {numero && !x.canales && x.detalle?.length ? <span className={v.detalles}>{x.detalle.map(d => <span key={d}>{d}</span>)}</span> : null}

    {numero && vivo && vivo.serie.length >= 5 && <Curva serie={vivo.serie} nombre={vivo.serieNombre} />}

    {children}

    {numero && vivo && (vivo.meta ? <Meta vivo={vivo} /> : <Hueco vivo={vivo} nombre={nombre} />)}

    {debajo}

    <span className={v.fuente}>{tr('Fuente: {fuente}', { fuente: tr(x.fuente) })}</span>
  </div>
}

/** El número: cuenta hasta su valor la primera vez (con su formato: «$354,912 MXN»). Lo que no es número, tal cual. */
export function CifraViva({ texto, clave }: { texto: string; clave: string }) {
  const c = partirCifra(texto)
  if (!c) return <span className={v.cifra}>{texto}</span>
  return <>
    <Cifra valor={c.n} clave={`${clave}:${texto}`} className={v.cifra} formato={n => unirCifra(c, c.decimales ? n : Math.round(n))} />
  </>
}

export const TEXTO_CLIMA: Record<DatosCartelOrgano['estado'], string> = { calma: trMarca('en calma'), duele: trMarca('duele'), 'sin-sensor': trMarca('sin sensor'), leyendo: trMarca('leyendo'), oculto: trMarca('oculto') }

export function Clima({ estado, porque }: { estado: DatosCartelOrgano['estado']; porque?: string }) {
  return <span className={v.clima} data-clima={estado} title={porque || undefined}>
    <i aria-hidden />{tr(TEXTO_CLIMA[estado])}
  </span>
}

/** La curva de la realidad: área suave en su acento, el trazo que se dibuja y el último día en oro. Sin días sin dato. */
export function Curva({ serie, nombre, sinNombre }: { serie: number[]; nombre: string; sinNombre?: boolean }) {
  const lo = Math.min(...serie), hi = Math.max(...serie), span = hi - lo || 1
  const W = 100, H = 40
  const X = (k: number) => (k / (serie.length - 1)) * W
  const Y = (y: number) => H - 3 - ((y - lo) / span) * (H - 8)
  const pts = serie.map((y, k) => `${X(k).toFixed(2)},${Y(y).toFixed(2)}`)
  const linea = `M${pts.join('L')}`
  const area = `${linea}L${W},${H}L0,${H}Z`
  const u = serie.length - 1
  return <span className={v.curva} data-curva={serie.length} title={sinNombre ? tr('{nombre} · 30 días', { nombre }) : undefined}>
    {!sinNombre && <span className={v.curvaNombre}>{tr('{nombre} · 30 días', { nombre })}</span>}
    <span className={v.lienzoCurva}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path className={v.area} d={area} />
        <path className={v.trazo} d={linea} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={v.hoy} style={{ left: `${X(u)}%`, top: `${(Y(serie[u]) / H) * 100}%` }} aria-hidden />
    </span>
  </span>
}

/** La meta firmada contra la realidad: la barra se llena hasta su fracción (mínimo visible) con el degradado al oro. */
export function Meta({ vivo }: { vivo: DatosCartelOrgano }) {
  const m = vivo.meta!
  const f = m.fraccion
  return <span className={v.meta}>
    <span className={v.metaFila}>
      <b>{tr('Meta {meta}', { meta: m.texto })}</b>
      <span className={v.metaPct}>{f === null ? tr('sin realidad') : porcentaje(f)}</span>
    </span>
    <span className={v.barra} role="img" aria-label={f === null ? tr('Meta sin realidad que comparar') : tr('{pct} de la meta', { pct: porcentaje(f) })}>
      {f !== null && <span className={v.relleno} style={{ width: `${Math.max(3, Math.min(1, f) * 100)}%` }} />}
    </span>
    {vivo.realidad && <span className={v.metaNota} data-meta-realidad="">{vivo.realidad}</span>}
    {/* Lo que no es meta, aparte: las cuotas del Acompañamiento no son MRR recurrente y nunca suman a la barra. */}
    {vivo.aparte && <span className={v.metaNota} data-meta-aparte="">{vivo.aparte}</span>}
  </span>
}

/** Sin meta escrita en su fuente: el hueco que se ve a propósito e invita a ponerla (le pasa la pregunta a Levy). */
/** «ponla tú»: le pasa a Levy la pregunta de la meta con la realidad de hoy (nunca escribe una meta). */
export const pedirMeta = (vivo: DatosCartelOrgano, nombre: string) => pedirALevy(tr('Quiero ponerle meta a {organo} en Tu negocio. Hoy su realidad es {realidad}. Ayúdame a elegir el número y la fecha, y escríbela en su fuente cuando la firme.', {
  organo: nombre, realidad: vivo.realidad ?? (vivo.cifra ? `${vivo.cifra} ${vivo.unidad}`.trim() : tr('sin dato')),
}))

export function Hueco({ vivo, nombre }: { vivo: DatosCartelOrgano; nombre: string }) {
  const pedir = () => pedirMeta(vivo, nombre)
  return <span className={v.meta}>
    <span className={v.metaFila}>
      <b className={v.sinMeta}>{tr('Sin meta')}</b>
      {vivo.realidad && <span className={v.metaNota}>{vivo.realidad}</span>}
    </span>
    <button type="button" className={v.hueco} onClick={pedir} title={tr('Le pasa la pregunta a Levy con la realidad de hoy')}>
      {tr('ponla tú')}<Plus size={13} strokeWidth={2.4} aria-hidden />
    </button>
  </span>
}
