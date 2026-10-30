'use client'
import { useEffect, useMemo, useState } from 'react'
import { fusionarCatalogo, normalizarRemoto, type ComandoCatalogo } from '../lib/command-catalog'
import { useCommandStore } from '../stores/command-store'

const CLAVE = (account: string) => `chat:commands:v1:${account}`
const SIN_NOMBRES: string[] = []

// Una consulta por cuenta por sesión de la app: las paletas montadas después reusan el resultado.
const remotoPorCuenta = new Map<string, ComandoCatalogo[]>()
const enVuelo = new Map<string, Promise<ComandoCatalogo[] | null>>()

function leerCache(account: string): ComandoCatalogo[] {
  try {
    const raw = window.localStorage.getItem(CLAVE(account))
    return raw ? normalizarRemoto(JSON.parse(raw)) : []
  } catch { return [] }
}

function pedir(account: string): Promise<ComandoCatalogo[] | null> {
  const previa = enVuelo.get(account)
  if (previa) return previa
  const p = fetch(`/api/chat/commands?account=${encodeURIComponent(account)}`)
    .then(async (r) => {
      if (!r.ok) return null
      const data = (await r.json()) as { commands?: unknown }
      const lista = normalizarRemoto(data.commands)
      if (!lista.length) return null
      remotoPorCuenta.set(account, lista)
      try { window.localStorage.setItem(CLAVE(account), JSON.stringify(lista)) } catch { /* sin almacenamiento */ }
      return lista
    })
    .catch(() => null)
    .finally(() => { enVuelo.delete(account) })
  enVuelo.set(account, p)
  return p
}

/** Catálogo completo de la paleta «/»: base local al instante, caché de localStorage y luego el daemon. */
export function useCommandCatalog(account: string): ComandoCatalogo[] {
  const [remoto, setRemoto] = useState<ComandoCatalogo[]>(() => remotoPorCuenta.get(account) ?? [])
  const initNames = useCommandStore((s) => s.initNames[account]) ?? SIN_NOMBRES

  useEffect(() => {
    let vivo = true
    const enMemoria = remotoPorCuenta.get(account)
    if (enMemoria) setRemoto(enMemoria)
    else {
      const cache = leerCache(account)
      setRemoto(cache)
    }
    if (!remotoPorCuenta.has(account)) void pedir(account).then((l) => { if (vivo && l) setRemoto(l) })
    return () => { vivo = false }
  }, [account])

  const catalogo = useMemo(() => fusionarCatalogo({ remoto, initNames }), [remoto, initNames])
  useEffect(() => { useCommandStore.getState().setCatalogo(catalogo) }, [catalogo])
  return catalogo
}
