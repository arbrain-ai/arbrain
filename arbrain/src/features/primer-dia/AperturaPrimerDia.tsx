'use client'
/**
 * Tu primer día se abre solo (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga). Montado en el shell de la edición del
 * alumno; no pinta nada. Una vez, con la bienvenida terminada y el recorrido de Levy ya visto o saltado (`ofrecer` lo decide
 * el servidor con modelo.ts › debeOfrecer): Levy abre el primer día en el chat y el Taller se pone en «Tu primer día».
 * Apagado, `/api/primer-dia` responde { activo: false } y esto no hace nada.
 */
import { useEffect, useRef } from 'react'
import { mostrarPanel } from '@/features/cabina/panel/ventanas'
import { pedirSegmentoTaller } from '@/features/cabina/panel/taller-segmento'
import { releer } from '@/features/cabina/datos'
import { URL_PRIMER_DIA } from './modelo'
import { usePrimerDia } from './PrimerDia'

export function AperturaPrimerDia() {
  const { data } = usePrimerDia()
  const hecho = useRef(false)
  const ofrecer = !!(data?.activo && data.ofrecer)
  useEffect(() => {
    if (!ofrecer || hecho.current) return
    hecho.current = true
    void (async () => {
      try {
        const r = await fetch(URL_PRIMER_DIA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'ofrecer' }), cache: 'no-store' })
        if (!r.ok) return
        pedirSegmentoTaller('primer-dia')
        mostrarPanel('taller')
      } finally { void releer(URL_PRIMER_DIA) }
    })()
  }, [ofrecer])
  return null
}
