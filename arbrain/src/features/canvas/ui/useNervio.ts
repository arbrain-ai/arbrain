'use client'
/**
 * Los nodos con nervio de la página, vivos (14 oct 2026, model/nervio.ts).
 *
 * Costo bajo a propósito: UNA petición en lote por página para todos los estados, al abrir y luego cada minuto solo
 * si la ventana está a la vista (al volver a ella, si lo último tiene más de 30 s). Los medios se resuelven al abrir y
 * cada 5 min (para ver llegar el VSL2 nuevo del sábado), nunca por cuadro. El servidor cachea cada fuente aparte.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasElement } from '../model/element'
import { claveFuente, claveMedio, necesidades, type EstadoVivo, type MedioResuelto, type VivoNervio } from '../model/nervio'

export const CADA_ESTADO_MS = 60_000
export const CADA_MEDIO_MS = 5 * 60_000
const VACIO: VivoNervio & { version: number } = { estados: new Map(), medios: new Map(), version: 0 }

export function useNervio(elements: readonly CanvasElement[], activo: boolean): VivoNervio & { version: number } {
  const nec = useMemo(() => necesidades(elements), [elements])
  const firmaF = nec.fuentes.map(claveFuente).sort().join('\n')
  const firmaM = nec.medios.map(claveMedio).sort().join('\n')
  const necRef = useRef(nec)
  necRef.current = nec
  const [vivo, setVivo] = useState(VACIO)

  useEffect(() => {
    if (!activo || !firmaF) return
    let vivoEf = true, ultimo = 0
    const pedir = async () => {
      ultimo = Date.now()
      try {
        const r = await fetch('/api/canvas/nervio/estado', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fuentes: necRef.current.fuentes }),
        })
        const j = await r.json() as { ok?: boolean; estados?: Record<string, EstadoVivo> }
        if (!vivoEf || !j.ok || !j.estados) return
        setVivo(v => ({ ...v, estados: new Map(Object.entries(j.estados!)), version: v.version + 1 }))
      } catch { /* sin red: se queda lo último; la pastilla no inventa verde */ }
    }
    void pedir()
    const reloj = setInterval(() => { if (document.visibilityState === 'visible') void pedir() }, CADA_ESTADO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible' && Date.now() - ultimo > 30_000) void pedir() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { vivoEf = false; clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver) }
  }, [activo, firmaF])

  useEffect(() => {
    if (!activo || !firmaM) return
    let vivoEf = true
    const pedir = async () => {
      const pares = await Promise.all(necRef.current.medios.map(async m => {
        const q = new URLSearchParams(m.src.map(s => ['src', s]))
        try { return [claveMedio(m), await (await fetch(`/api/canvas/nervio/medio?${q}`)).json() as MedioResuelto] as const }
        catch { return [claveMedio(m), { ok: false, error: 'sin conexión' } as MedioResuelto] as const }
      }))
      if (vivoEf) setVivo(v => ({ ...v, medios: new Map(pares), version: v.version + 1 }))
    }
    void pedir()
    const reloj = setInterval(() => { if (document.visibilityState === 'visible') void pedir() }, CADA_MEDIO_MS)
    return () => { vivoEf = false; clearInterval(reloj) }
  }, [activo, firmaM])

  return vivo
}
