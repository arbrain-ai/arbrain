'use client'
// «Preparando respuesta» no gira en silencio (resiliencia, 12 oct 2026). Pasados ESPERA_SIN_EXPLICAR_MS sin una sola
// señal del turno, se consulta la salud real del chat (`/api/salud/chat`: base, URL del daemon y su /health) y se dice
// qué pasa con la acción que toca. Cada CONSULTA_CADA_MS se vuelve a mirar mientras siga la espera.
import { useEffect, useState } from 'react'

export const ESPERA_SIN_EXPLICAR_MS = 25_000
const CONSULTA_CADA_MS = 10_000

export type SaludPublica = { ok?: boolean; etapas?: { supabase?: { ok?: boolean }; daemon?: { ok?: boolean } } } | null

/** Texto para la persona según la salud del chat (null = la sonda no respondió: el servidor web no está). */
export function explicarEspera(salud: SaludPublica, segundos: number): string {
  if (!salud) return 'No hay conexión con Arbrain ahora; se está reparando sola. Tu mensaje está guardado y sale en cuanto vuelva.'
  if (salud.etapas?.daemon?.ok === false) return 'El motor de Arbrain no responde; se está reiniciando solo. Tu mensaje está guardado y sigue en camino.'
  if (salud.etapas?.supabase?.ok === false) return 'La base de Arbrain no responde; se reintenta sola. Tu mensaje está guardado.'
  return `Lleva ${segundos} s preparándose. El motor de Arbrain está activo; algunas respuestas tardan en empezar. Puedes esperar o detenerla.`
}

/** Explicación de una espera larga (null mientras no pase el umbral o si no hay espera). */
export function useEsperaExplicada(esperando: boolean): string | null {
  const [texto, setTexto] = useState<string | null>(null)
  useEffect(() => {
    if (!esperando) { setTexto(null); return }
    const inicio = Date.now()
    let vivo = true
    let timer: ReturnType<typeof setTimeout>
    const mirar = async () => {
      let salud: SaludPublica = null
      try {
        const r = await fetch('/api/salud/chat', { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
        salud = await r.json().catch(() => null) as SaludPublica
      } catch { salud = null }
      if (!vivo) return
      setTexto(explicarEspera(salud, Math.round((Date.now() - inicio) / 1000)))
      timer = setTimeout(() => { void mirar() }, CONSULTA_CADA_MS)
    }
    timer = setTimeout(() => { void mirar() }, ESPERA_SIN_EXPLICAR_MS)
    return () => { vivo = false; clearTimeout(timer) }
  }, [esperando])
  return texto
}
