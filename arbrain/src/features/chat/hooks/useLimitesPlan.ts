'use client'
import { useEffect, useState } from 'react'
import { limitesDeRespuesta, type LimitesPlan } from '../lib/limites-plan'

// Límites del plan de UNA cuenta (2 oct 2026) para el panel de contexto de la barra de escribir.
// El daemon guarda 60 s cada lectura: abrir y cerrar el panel no lanza una consulta por vez.
// `oculto`: la identidad no es la personal de Daniel (403); el bloque no se pinta.
export type LecturaLimites = { account: string; limits?: LimitesPlan; error?: string; oculto?: boolean }

export function useLimitesPlan(account: string): LecturaLimites | null {
  const [lectura, setLectura] = useState<LecturaLimites | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    void fetch(`/api/chat/limits?${new URLSearchParams({ account })}`, { signal: ac.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json().catch(() => null)
      if (response.status === 403) { if (!ac.signal.aborted) setLectura({ account, oculto: true }); return }
      if (!response.ok) throw new Error(data?.error || 'No se pudieron consultar los límites.')
      if (!ac.signal.aborted) setLectura({ account, limits: limitesDeRespuesta(data) })
    }).catch(error => { if (!ac.signal.aborted) setLectura({ account, error: error instanceof Error ? error.message : 'No hubo respuesta.' }) })
    return () => ac.abort()
  }, [account])
  // Una lectura de otra cuenta nunca se muestra como la de esta.
  return lectura?.account === account ? lectura : null
}
