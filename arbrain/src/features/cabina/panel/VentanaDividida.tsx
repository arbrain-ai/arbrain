'use client'
/**
 * La ventana dividida (8 oct 2026, ver division.ts): hasta cuatro vistas a la vez, como los grupos de Visual Studio.
 * Columnas y filas con divisores que se arrastran (doble clic: mitad y mitad). Cada parte es un grupo con su propia
 * cabecera de pestañas (la pinta Contenido, igual a la de la ventana: las de arriba quedan a la misma altura). Clic
 * dentro de una parte le da el foco: lo nuevo que se abra cae en su grupo.
 *
 * `derechaOculta` (9 oct 2026): la columna derecha se esconde con ⌘B sin desmontarse (sus vistas conservan scroll,
 * borrador y documentos) y vuelve con su mismo ancho; el pliegue usa el tiempo y la curva de la casa (movimiento.css).
 */
import { useRef, type ReactNode } from 'react'
import { limitarCorte, type Celdas, type Cortes, type Ranura } from './division'
import s from './panel.module.css'

interface Props {
  celdas: Celdas
  foco: Ranura
  cortes: Cortes
  vista: (clave: string) => ReactNode
  cabecera: (r: Ranura) => ReactNode
  onFoco: (r: Ranura) => void
  onCortes: (c: Cortes, persistir: boolean) => void
  derechaOculta?: boolean
}

export function Division({ celdas, foco, cortes, vista, cabecera, onFoco, onCortes, derechaOculta = false }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const dos = !!(celdas[1] || celdas[3])
  const oculta = dos && derechaOculta

  // Arrastrar un divisor: `eje` x mueve el corte entre columnas; y0/y1 el de la fila en esa columna.
  const arrastrar = (eje: 'x' | 0 | 1) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const barra = e.currentTarget, caja = raiz.current?.getBoundingClientRect()
    if (!caja) return
    barra.setPointerCapture(e.pointerId)
    document.documentElement.classList.add(s.redimensionando)
    const corte = (ev: PointerEvent): Cortes => eje === 'x'
      ? { ...cortes, x: limitarCorte((ev.clientX - caja.left) / caja.width) }
      : { ...cortes, y: (eje === 0 ? [limitarCorte((ev.clientY - caja.top) / caja.height), cortes.y[1]] : [cortes.y[0], limitarCorte((ev.clientY - caja.top) / caja.height)]) as [number, number] }
    const mover = (ev: PointerEvent) => onCortes(corte(ev), false)
    const soltar = (ev: PointerEvent) => {
      barra.removeEventListener('pointermove', mover); barra.removeEventListener('pointerup', soltar); barra.removeEventListener('pointercancel', soltar)
      document.documentElement.classList.remove(s.redimensionando)
      onCortes(corte(ev), true)
    }
    barra.addEventListener('pointermove', mover); barra.addEventListener('pointerup', soltar); barra.addEventListener('pointercancel', soltar)
  }
  const mitad = (eje: 'x' | 0 | 1) => () => onCortes(eje === 'x' ? { ...cortes, x: 0.5 } : { ...cortes, y: (eje === 0 ? [0.5, cortes.y[1]] : [cortes.y[0], 0.5]) as [number, number] }, true)

  const parte = (r: Ranura) => {
    const clave = celdas[r]
    if (!clave) return null
    return <section key={r} className={s.parte} data-foco={r === foco || undefined} data-ranura={r} onPointerDownCapture={() => { if (r !== foco) onFoco(r) }}>
      {cabecera(r)}
      <div className={s.parteCuerpo} key={clave}>{vista(clave)}</div>
    </section>
  }
  const columna = (col: 0 | 1) => {
    const arriba = celdas[col], abajo = celdas[col + 2]
    if (!arriba && !abajo) return null
    const partida = !!arriba && !!abajo
    return <div className={s.columnaDivision} style={col === 0 && dos ? { flex: `0 0 ${oculta ? 100 : cortes.x * 100}%` } : undefined}
      data-columna={col} data-oculta={(col === 1 && oculta) || undefined} inert={col === 1 && oculta} aria-hidden={(col === 1 && oculta) || undefined}>
      {partida
        ? <>
          <div className={s.filaDivision} style={{ flex: `0 0 ${cortes.y[col] * 100}%` }}>{parte(col as Ranura)}</div>
          <div className={s.divisorFila} role="separator" aria-orientation="horizontal" aria-label="Cambiar el alto" title="Arrastra para cambiar el alto · doble clic: mitad y mitad" onPointerDown={arrastrar(col)} onDoubleClick={mitad(col)} />
          <div className={s.filaDivision} style={{ flex: 1 }}>{parte((col + 2) as Ranura)}</div>
        </>
        : parte((arriba ? col : col + 2) as Ranura)}
    </div>
  }

  return <div ref={raiz} className={s.division} data-dividida data-derecha-oculta={oculta || undefined}>
    {columna(0)}
    {dos && <div className={s.divisorColumna} hidden={oculta} role="separator" aria-orientation="vertical" aria-label="Cambiar el ancho" title="Arrastra para cambiar el ancho · doble clic: mitad y mitad" onPointerDown={arrastrar('x')} onDoubleClick={mitad('x')} />}
    {columna(1)}
  </div>
}
