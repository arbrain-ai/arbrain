'use client'
/**
 * Velocidad del visor (5 nov 2026, Daniel: «el cambio de velocidades parpadea mientras corre el video»). Un botón que da
 * la vuelta 1x → 1.25x → 1.5x → 1.75x → 2x → 1x, como el lector del chat; antes era un <select>.
 *
 * Por qué parpadeaba: con el video corriendo el visor se repinta en cada fotograma (el reloj), y React, en cada repintado
 * de un <select> controlado, vuelve a poner `option.selected = true` (react-dom › updateOptions) aunque el valor no haya
 * cambiado. En WebKit eso re-sincroniza el menú nativo abierto. El arnés lo contó: escrituras a `option.selected` con el
 * video corriendo. Este botón está en `memo` con props estables: el reloj no lo toca, solo cambia con la velocidad.
 */
import { memo } from 'react'
import { rotuloVelocidad, velocidadEnCiclo } from '../../documento/medio'
import v from './visor.module.css'

export const BotonVelocidad = memo(function BotonVelocidad({ vel, alCambiar, atajos }: { vel: number; alCambiar: (x: number) => void; atajos?: string }) {
  return <button type="button" className={v.velocidad} onClick={() => alCambiar(velocidadEnCiclo(vel))}
    aria-label={`Velocidad ${rotuloVelocidad(vel)}`} title={`Velocidad: clic para la siguiente (1× a 2×)${atajos ? ` · ${atajos}` : ''}`}>{rotuloVelocidad(vel)}</button>
})
