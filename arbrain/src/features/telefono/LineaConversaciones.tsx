'use client'
/**
 * Ajustes › Máquinas (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05): una línea que dice si tus
 * conversaciones están en tus dos máquinas y cuándo se pusieron al día. Con el espejo apagado no se muestra nada: en
 * solo tu computadora o solo tu servidor hay una sola lista y no hay nada que explicar.
 */
import { useEffect, useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { horaCorta } from './conectar-ui'

interface Estado {
  activo: boolean
  host?: string
  maquinas?: string[]
  ultimaSync?: { en: string; codigo: string; motivo: string } | null
  aviso?: string | null
}

/** El texto de la línea. Puro (lo prueba tests/espejo-conversaciones). */
export function textoConversaciones(e: Estado, ahora = new Date()): { texto: string; detalle: string | null; bien: boolean } | null {
  if (!e.activo) return null
  const otras = (e.maquinas ?? []).filter((m) => m !== e.host)
  const donde = otras.length ? `en ${e.host} y ${otras.join(', ')}` : `en ${e.host}; tu otra máquina se suma al conversar allá`
  const s = e.ultimaSync
  if (!s) return { texto: `Tus conversaciones son una sola lista ${donde}.`, detalle: 'Se ponen al día en cuanto conversas o abres la lista.', bien: true }
  const cuando = horaCorta(s.en, true, ahora)
  if (s.codigo === 'ok') return { texto: `Tus conversaciones son una sola lista ${donde}.`, detalle: `Al día desde las ${cuando}.${e.aviso ? ` ${e.aviso}` : ''}`, bien: !e.aviso }
  return { texto: `Tus conversaciones son una sola lista ${donde}.`, detalle: `La última vez (${cuando}) no se pudieron poner al día: ${s.motivo || s.codigo}. Lo tuyo queda guardado aquí y se reintenta solo.`, bien: false }
}

export function LineaConversaciones() {
  const [estado, setEstado] = useState<Estado | null>(null)
  useEffect(() => {
    let vivo = true
    const leer = () => fetch('/api/espejo/conversaciones', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setEstado(j) }).catch(() => {})
    void leer()
    const t = setInterval(leer, 15_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  const linea = estado ? textoConversaciones(estado) : null
  if (!linea) return null
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl border border-border-subtle px-3 py-2 text-[13px] leading-relaxed text-foreground" data-conversaciones-espejo={linea.bien ? 'al-dia' : 'pendiente'}>
      <MessagesSquare className={`mt-0.5 size-4 shrink-0 ${linea.bien ? 'text-success' : 'text-warning'}`} aria-hidden />
      <span>{linea.texto}{linea.detalle && <span className="block text-[12px] text-muted">{linea.detalle}</span>}</span>
    </p>
  )
}
