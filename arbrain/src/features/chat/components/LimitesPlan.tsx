'use client'
import { useEffect, useState } from 'react'
import { CHAT_ACCOUNTS } from '../stores/account-store'
import { nivelPct, textoPct } from '../lib/contexto-conversacion'
import { cuentasDeLimites, textoObservado, textoReinicio, type LimitesPlan as Limites } from '../lib/limites-plan'
import { useLimitesPlan, type LecturaLimites } from '../hooks/useLimitesPlan'

// «Límites del plan» dentro del panel de contexto de la barra de escribir (2 oct 2026, pedido de
// Daniel): Claude con su ventana de 5 h y la semanal (% y hora de reinicio), como /usage; Codex solo si
// la cuenta existe y reporta límites. Todo lo dice el proveedor: lo que falta dice «sin dato».

const BARRA = { ok: 'bg-brand', aviso: 'bg-amber-500', alto: 'bg-red-500', 'sin-dato': '' } as const

function Fila({ label, percent, resetsAt, ahora }: { label: string; percent: number | null; resetsAt: string | null; ahora: Date }) {
  const reinicio = textoReinicio(resetsAt, ahora)
  return <li data-limite-fila data-limite-pct={percent == null ? '' : String(percent)}>
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="truncate text-muted">{label}</span>
      <span className="shrink-0 tabular-nums">{percent == null ? <span className="text-muted">sin dato</span> : `${textoPct(percent)} usado`}</span>
    </div>
    {percent != null && <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
      <div className={`h-full rounded-full ${BARRA[nivelPct(percent)]}`} style={{ width: `${Math.max(percent > 0 ? 2 : 0, percent)}%` }} />
    </div>}
    {reinicio && <p className="mt-0.5 text-[11px] text-muted tabular-nums">{reinicio}</p>}
  </li>
}

function Bloque({ titulo, lectura, filasFijas, ahora }: { titulo: string; lectura: LecturaLimites | null; filasFijas: string[]; ahora: Date }) {
  const limits: Limites | undefined = lectura?.limits
  const cuenta = CHAT_ACCOUNTS.find(item => item.id === lectura?.account)?.label
  const encabezado = `${titulo}${limits?.plan ? ` ${limits.plan}` : ''}${cuenta && cuenta !== 'Tú' ? ` · ${cuenta}` : ''}`
  // Sin lectura todavía o sin respuesta: las filas pedidas quedan a la vista, en «sin dato».
  const filas = limits?.windows.length ? limits.windows : filasFijas.map(label => ({ id: label, label, percent: null, resetsAt: null }))
  const motivo = !lectura ? null : lectura.error ?? (limits && !limits.available ? limits.reason : null)
  return <section data-limites-bloque={titulo} className="mt-3">
    <h3 className="text-xs font-semibold text-foreground/80">{encabezado}</h3>
    {!lectura && <p role="status" className="text-[11px] text-muted">Consultando…</p>}
    {limits?.reached && <p role="alert" className="text-[11px] text-red-400">Límite alcanzado: {limits.reached}.</p>}
    <ul className="mt-1.5 space-y-2">{filas.map(v => <Fila key={v.id} label={v.label} percent={v.percent} resetsAt={v.resetsAt} ahora={ahora} />)}</ul>
    {motivo && <p className="mt-1 text-[11px] text-muted/80">{motivo}</p>}
    {limits?.available && <p className="mt-1 text-[11px] text-muted/70">{textoObservado(limits.observedAt, ahora)}</p>}
  </section>
}

export function LimitesPlan({ account }: { account: string }) {
  const cuentas = cuentasDeLimites(account)
  const claude = useLimitesPlan(cuentas.claude)
  const codex = useLimitesPlan(cuentas.codex)
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(id) }, [])
  if (claude?.oculto) return null
  const mostrarCodex = !codex?.oculto && (cuentas.codexEsLaConversacion || codex?.limits?.available === true)
  return <div data-limites-plan className="border-t border-border mt-4 pt-3">
    <h2 className="text-sm font-semibold">Límites del plan</h2>
    <Bloque titulo="Claude" lectura={claude} filasFijas={['Ventana de 5 h', 'Semanal']} ahora={ahora} />
    {mostrarCodex && <Bloque titulo="Codex" lectura={codex} filasFijas={['Semanal']} ahora={ahora} />}
  </div>
}
