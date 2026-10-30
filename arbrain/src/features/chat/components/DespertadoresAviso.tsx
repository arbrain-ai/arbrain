'use client'
/**
 * Aviso de despertadores pendientes de la conversación (chat vivo, 3 oct 2026).
 * Levy los programa con su herramienta `despertador`; aquí Daniel ve que hay algo agendado
 * («⏰ 2 despertadores · el próximo a las 14:05»), qué dice cada uno y puede cancelarlo.
 * Se refresca cada 10 s y cuando termina un turno (el turno pudo crear o consumir uno).
 */
import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, X } from 'lucide-react'
import { tocaLeerAhora } from '@/shared/lib/reposo'
import { zonaDueno } from '@/shared/lib/zona-dueno'

export interface DespertadorDto { id: string; texto: string; dueAt: number; cadaMs: number | null; restantes: number | null; estado: string }

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: zonaDueno() })

export function resumenDespertadores(lista: DespertadorDto[]): string | null {
  const pendientes = lista.filter(d => d.estado === 'pendiente').sort((a, b) => a.dueAt - b.dueAt)
  if (!pendientes.length) return null
  return `${pendientes.length === 1 ? '1 despertador' : `${pendientes.length} despertadores`} · el próximo a las ${hora(pendientes[0].dueAt)}`
}

export function DespertadoresAviso({ conversationId, account, refrescar }: { conversationId?: string | null; account?: string | null; refrescar?: unknown }) {
  const [lista, setLista] = useState<DespertadorDto[]>([])
  const [abierto, setAbierto] = useState(false)
  const leer = useCallback(async () => {
    if (!conversationId) { setLista([]); return }
    try {
      const res = await fetch('/api/chat/despertadores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatSessionId: conversationId, account: account ?? 'default' }), cache: 'no-store' })
      const json = res.ok ? await res.json() as { despertadores?: DespertadorDto[] } : null
      setLista(Array.isArray(json?.despertadores) ? json!.despertadores : [])
    } catch { /* sin red: se conserva lo último */ }
  }, [conversationId, account])
  useEffect(() => {
    void leer()
    let leidoEn = Date.now()
    const iv = setInterval(() => { if (tocaLeerAhora(10_000, leidoEn)) { leidoEn = Date.now(); void leer() } }, 10_000)
    return () => clearInterval(iv)
  }, [leer, refrescar])
  const resumen = resumenDespertadores(lista)
  if (!resumen) return null
  const cancelar = async (id: string) => {
    setLista(prev => prev.filter(d => d.id !== id))
    try { await fetch('/api/chat/despertadores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatSessionId: conversationId, account: account ?? 'default', cancelar: id }) }) } finally { void leer() }
  }
  return (
    <div data-testid="despertadores-aviso" className="mx-auto mb-1.5 w-full max-w-3xl px-1">
      <button type="button" onClick={() => setAbierto(v => !v)} title="Despertadores que Levy programó en esta conversación"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted hover:text-foreground transition-colors">
        <AlarmClock size={12} className="text-brand-ink" />
        <span>{resumen}</span>
      </button>
      {abierto && (
        <ul className="mt-1.5 flex flex-col gap-1 rounded-xl border border-border bg-card p-2 text-[12px]">
          {lista.filter(d => d.estado === 'pendiente').sort((a, b) => a.dueAt - b.dueAt).map(d => (
            <li key={d.id} className="flex items-start gap-2">
              <span className="shrink-0 font-mono text-[11px] text-brand-ink">{hora(d.dueAt)}</span>
              <span className="min-w-0 flex-1 text-foreground/90">{d.texto}{d.cadaMs ? <span className="text-muted"> · cada {Math.round(d.cadaMs / 60_000)} min{d.restantes ? `, quedan ${d.restantes}` : ''}</span> : null}</span>
              <button type="button" onClick={() => void cancelar(d.id)} aria-label={`Cancelar despertador ${d.id}`} title="Cancelar" className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
