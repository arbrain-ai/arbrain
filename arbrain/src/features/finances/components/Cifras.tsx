'use client'
/**
 * Las tres cifras del espejo (6 nov 2026): lo que tienes, lo que entró y lo que salió. Pocas palabras: el número y de dónde
 * sale. «Lo que tienes» es de hoy (la foto de saldos + Polar después de ella); entró y salió son del rango elegido, y su
 * periodo se dice una vez, en la cabeza de la gráfica. Las rayas de color de Entró y Salió son la leyenda de la gráfica.
 */
import { Cifra, escalon, mov } from '@/shared/movimiento'
import type { LoQueTienes } from '../types/finances'
import { fechaConAnio } from '../lib/espejo'
import { pesos } from '../lib/modelo'
import h from './finanzas.module.css'

export function Cifras({ tienes, entro, salio, hoy, clave }: {
  tienes: LoQueTienes | null | undefined; entro: number; salio: number; hoy: string; clave: string
}) {
  const fmt = (n: number) => pesos(Math.round(n))
  const deTienes = tienes
    ? `Saldos del ${fechaConAnio(tienes.cierre, hoy)}${tienes.cobros_hasta ? ` + Polar al ${fechaConAnio(tienes.cobros_hasta, hoy)}` : ''}`
    : 'Dicta tus saldos a Levy'
  return <div className={h.cifras}>
    <div className={`${h.cifra} ${mov.entra}`} style={escalon(0)} data-heroe role="group" aria-label="Lo que tienes">
      <p className={h.cifraEtiqueta}>Lo que tienes</p>
      <p className={h.cifraValor} data-sin-dato={!tienes || undefined}>{tienes ? <Cifra valor={tienes.mxn} clave={`tienes-${tienes.cierre}-${tienes.mxn}`} formato={fmt} /> : 'Sin foto'}</p>
      <p className={h.cifraSub}>{deTienes}</p>
    </div>
    <div className={`${h.cifra} ${mov.entra}`} style={escalon(1)} role="group" aria-label="Entró">
      <p className={h.cifraEtiqueta}><i data-t="gana" aria-hidden />Entró</p>
      <p className={h.cifraValor}><Cifra valor={entro} clave={`entro-${clave}-${entro}`} formato={fmt} /></p>
    </div>
    <div className={`${h.cifra} ${mov.entra}`} style={escalon(2)} role="group" aria-label="Salió">
      <p className={h.cifraEtiqueta}><i data-t="pierde" aria-hidden />Salió</p>
      <p className={h.cifraValor}><Cifra valor={salio} clave={`salio-${clave}-${salio}`} formato={fmt} /></p>
    </div>
  </div>
}
