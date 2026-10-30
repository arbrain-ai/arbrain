'use client'

/**
 * Canvas v4 — barra de alinear y distribuir.
 *
 * Aparece SOLO con varios elementos seleccionados, porque solo ahí significa
 * algo. Un botón de "alinear" siempre visible pero inerte la mitad del tiempo
 * enseña a ignorarlo.
 */

import type { Theme } from '../theme/tokens'
import type { AlignAxis, DistributeAxis } from '../model/align'

interface Props {
  theme: Theme
  cuantos: number
  onAlign: (a: AlignAxis) => void
  onDistribute: (a: DistributeAxis) => void
}

/** Cada icono DIBUJA lo que hace: tres barras y la línea contra la que se pegan. */
const AlignIcon = ({ axis }: { axis: AlignAxis }) => {
  const barras: Record<AlignAxis, React.ReactElement> = {
    izquierda: <><rect x="4" y="5" width="13" height="3.4" rx="1" /><rect x="4" y="10.3" width="8" height="3.4" rx="1" /><rect x="4" y="15.6" width="11" height="3.4" rx="1" /><line x1="2.6" y1="3.5" x2="2.6" y2="20.5" /></>,
    derecha: <><rect x="7" y="5" width="13" height="3.4" rx="1" /><rect x="12" y="10.3" width="8" height="3.4" rx="1" /><rect x="9" y="15.6" width="11" height="3.4" rx="1" /><line x1="21.4" y1="3.5" x2="21.4" y2="20.5" /></>,
    'centro-h': <><rect x="5.5" y="5" width="13" height="3.4" rx="1" /><rect x="8" y="10.3" width="8" height="3.4" rx="1" /><rect x="6.5" y="15.6" width="11" height="3.4" rx="1" /><line x1="12" y1="3" x2="12" y2="21" /></>,
    arriba: <><rect x="5" y="4" width="3.4" height="13" rx="1" /><rect x="10.3" y="4" width="3.4" height="8" rx="1" /><rect x="15.6" y="4" width="3.4" height="11" rx="1" /><line x1="3.5" y1="2.6" x2="20.5" y2="2.6" /></>,
    abajo: <><rect x="5" y="7" width="3.4" height="13" rx="1" /><rect x="10.3" y="12" width="3.4" height="8" rx="1" /><rect x="15.6" y="9" width="3.4" height="11" rx="1" /><line x1="3.5" y1="21.4" x2="20.5" y2="21.4" /></>,
    'centro-v': <><rect x="5" y="5.5" width="3.4" height="13" rx="1" /><rect x="10.3" y="8" width="3.4" height="8" rx="1" /><rect x="15.6" y="6.5" width="3.4" height="11" rx="1" /><line x1="3" y1="12" x2="21" y2="12" /></>,
  }
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"
      stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" style={{ display: 'block' }} aria-hidden>
      {barras[axis]}
    </svg>
  )
}

const DistIcon = ({ axis }: { axis: DistributeAxis }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
    {axis === 'horizontal'
      ? <><rect x="2.5" y="6" width="4" height="12" rx="1.2" /><rect x="10" y="6" width="4" height="12" rx="1.2" /><rect x="17.5" y="6" width="4" height="12" rx="1.2" /></>
      : <><rect x="6" y="2.5" width="12" height="4" rx="1.2" /><rect x="6" y="10" width="12" height="4" rx="1.2" /><rect x="6" y="17.5" width="12" height="4" rx="1.2" /></>}
  </svg>
)

const ALINEAR: AlignAxis[] = ['izquierda', 'centro-h', 'derecha', 'arriba', 'centro-v', 'abajo']
const NOMBRE: Record<AlignAxis, string> = {
  izquierda: 'Alinear a la izquierda', 'centro-h': 'Centrar horizontalmente', derecha: 'Alinear a la derecha',
  arriba: 'Alinear arriba', 'centro-v': 'Centrar verticalmente', abajo: 'Alinear abajo',
}

export function AlignBar({ theme: t, cuantos, onAlign, onDistribute }: Props) {
  const btn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
    display: 'grid', placeItems: 'center', background: 'transparent', color: t.text.body,
  }
  const hover = (on: boolean) => (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.background = on ? t.roles.sticky.fill : 'transparent'
  }

  return (
    <div style={{
      position: 'absolute', left: '50%', top: 14, transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 2, padding: 5,
      background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
      borderRadius: 12, zIndex: 25,
      boxShadow: t.name === 'oscuro' ? '0 8px 28px rgba(0,0,0,.55)' : '0 8px 28px rgba(15,15,25,.10)',
      font: '600 12px CanvasSans, system-ui', color: t.text.caption,
    }}>
      <span style={{ padding: '0 8px', whiteSpace: 'nowrap' }}>{cuantos} seleccionados</span>
      <div style={{ width: 1, height: 20, background: t.roles.card.stroke.color, opacity: .7, margin: '0 2px' }} />
      {ALINEAR.map(a => (
        <button key={a} title={NOMBRE[a]} data-alinear={a} onClick={() => onAlign(a)} style={btn}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <AlignIcon axis={a} />
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: t.roles.card.stroke.color, opacity: .7, margin: '0 2px' }} />
      {/* Distribuir necesita TRES: con dos no hay nada que repartir, y el boton
          se deshabilita en vez de mentir que hizo algo. */}
      {(['horizontal', 'vertical'] as DistributeAxis[]).map(a => (
        <button key={a} title={`Distribuir ${a === 'horizontal' ? 'horizontalmente' : 'verticalmente'}`}
          data-distribuir={a} onClick={() => onDistribute(a)} disabled={cuantos < 3}
          style={{ ...btn, opacity: cuantos < 3 ? .3 : 1, cursor: cuantos < 3 ? 'default' : 'pointer' }}
          onPointerEnter={e => cuantos >= 3 && hover(true)(e)} onPointerLeave={hover(false)}>
          <DistIcon axis={a} />
        </button>
      ))}
    </div>
  )
}
