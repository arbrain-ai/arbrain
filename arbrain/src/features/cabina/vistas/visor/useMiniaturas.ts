'use client'
/**
 * Las miniaturas de un video para la barra del visor (8 nov 2026). Pide a la ruta firmada del propio video (`?miniaturas=meta`) cómo va
 * su hoja: el servidor la genera la primera vez (~1 min para 13 min de video) y mientras tanto contesta «generando»; aquí se
 * vuelve a preguntar cada 4 s, hasta ~6 min. Sin ffmpeg o con error → null y el visor sigue igual, sin miniaturas.
 */
import { useEffect, useState } from 'react'
import type { PlanMiniaturas } from '../../documento/medio'

export interface HojaMiniaturas extends PlanMiniaturas { hoja: string }
const CADA_MS = 4000, INTENTOS = 90

export function useMiniaturas(url: string | undefined): HojaMiniaturas | null {
  const [hoja, setHoja] = useState<HojaMiniaturas | null>(null)
  useEffect(() => {
    setHoja(null)
    if (!url) return
    let vivo = true, timer = 0, intentos = 0
    const base = url.split('?')[0]
    const pedir = async () => {
      try {
        const r = await fetch(`${base}?miniaturas=meta`, { cache: 'no-store' })
        if (!vivo || !r.ok) return
        const j = await r.json() as { estado?: string; clave?: string } & Partial<PlanMiniaturas>
        if (!vivo) return
        if (j.estado === 'lista' && j.clave && j.cada && j.n && j.cols && j.filas && j.ancho && j.alto) {
          setHoja({ cada: j.cada, n: j.n, cols: j.cols, filas: j.filas, ancho: j.ancho, alto: j.alto, hoja: `${base}?miniaturas=img&c=${j.clave}` })
        } else if (j.estado === 'generando' && ++intentos < INTENTOS) timer = window.setTimeout(pedir, CADA_MS)
      } catch { /* sin red: sin miniaturas */ }
    }
    void pedir()
    return () => { vivo = false; window.clearTimeout(timer) }
  }, [url])
  return hoja
}
