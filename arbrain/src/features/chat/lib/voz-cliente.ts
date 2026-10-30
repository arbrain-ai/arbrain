'use client'
/**
 * ¿Tu Arbrain tiene llave de Groq para dictar? (edición cliente, 21 oct 2026, carril VOZ). Pregunta al daemon
 * (`/api/llaves/salud` › `voz.groq`: solo si existe, nunca el valor; no toca el llavero) al montar, al volver a la
 * ventana y cuando Ajustes › Voz avisa que la llave cambió. `null` = todavía no se sabe: el micrófono lleva a Ajustes.
 */
import { useEffect, useState } from 'react'
import { EVENTO_LLAVE_VOZ } from '@/features/primer-arranque/lib/llaves'

export async function daemonTieneLlaveVoz(f: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const r = await f('/api/llaves/salud', { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json().catch(() => null) as { voz?: { groq?: unknown } } | null
    return typeof j?.voz?.groq === 'boolean' ? j.voz.groq : null
  } catch { return null }
}

export function useLlaveVoz(activo: boolean): boolean | null {
  const [hay, setHay] = useState<boolean | null>(null)
  useEffect(() => {
    if (!activo || typeof window === 'undefined') return
    let vivo = true
    let reintento: ReturnType<typeof setTimeout> | null = null
    // Tras guardar o quitar la llave, la app reinicia el daemon: se pregunta hasta que conteste lo esperado.
    const mirar = (intentos = 1, esperado?: boolean) => {
      if (reintento) { clearTimeout(reintento); reintento = null }
      void daemonTieneLlaveVoz().then(v => {
        if (!vivo) return
        if (v !== null && (esperado === undefined || v === esperado || intentos <= 1)) setHay(v)
        const listo = esperado === undefined ? v !== null : v === esperado
        if (!listo && intentos > 1) reintento = setTimeout(() => mirar(intentos - 1, esperado), 1_500)
      })
    }
    const alCambiar = (e: Event) => {
      const presente = (e as CustomEvent<{ presente?: boolean }>).detail?.presente
      if (typeof presente === 'boolean') setHay(presente)
      mirar(20, presente)
    }
    const alVolver = () => { if (document.visibilityState !== 'hidden') mirar() }
    mirar()
    window.addEventListener(EVENTO_LLAVE_VOZ, alCambiar)
    window.addEventListener('focus', alVolver)
    return () => { vivo = false; if (reintento) clearTimeout(reintento); window.removeEventListener(EVENTO_LLAVE_VOZ, alCambiar); window.removeEventListener('focus', alVolver) }
  }, [activo])
  return hay
}
