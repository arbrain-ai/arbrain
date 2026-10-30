'use client'
/**
 * Monitoreo de cohorte («Levy por fundador», CONTRATO-DAEMON.md §7). Apagado por defecto; activarlo es una decisión
 * explícita. Antes de decidir se ve EXACTAMENTE qué se enviaría (la vista previa la arma el daemon, sin enviarla).
 * Lo usan el primer arranque (con `pendiente`, la decisión se aplica al continuar) y Ajustes › Privacidad (al instante).
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, Lock } from 'lucide-react'
import { Interruptor } from '@/features/configuracion/components/Interruptor'
import { Aviso } from './PanelLlaves'

interface Dia { dia: string; sesiones: number; acciones_venta: number; cierres: number; facturacion: Record<string, number> }
interface EstadoCohorte {
  consentimiento: { acepto: boolean; fecha: string; version: number | string } | null
  endpoint_configurado: boolean
  ultimo_envio: number | null
  vista_previa: { version: number; instalacion: string; generado: string; dias: Dia[] }
}

export const LO_QUE_SE_ENVIA = ['Cuántas sesiones tuviste cada día', 'Cuántas acciones de venta y cierres registraste', 'El total facturado por día y moneda']
export const LO_QUE_NUNCA = ['El texto de tus conversaciones', 'Nombres, correos o datos de tus clientes', 'Tus archivos, tu memoria o tus llaves']

export async function fijarConsentimiento(acepto: boolean): Promise<EstadoCohorte> {
  const r = await fetch('/api/monitoreo/consentimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acepto }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'No pude guardar tu decisión.')
  return j as EstadoCohorte
}

export function PanelMonitoreo({ pendiente, onPendiente }: { pendiente?: boolean; onPendiente?: (v: boolean) => void }) {
  const [estado, setEstado] = useState<EstadoCohorte | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [verMuestra, setVerMuestra] = useState(false)
  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/monitoreo', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? 'No pude leer el estado del monitoreo.')
      setEstado(j); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude leer el estado del monitoreo.') }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const enPrimerArranque = onPendiente !== undefined
  const activo = enPrimerArranque ? !!pendiente : !!estado?.consentimiento?.acepto
  const cambiar = async (v: boolean) => {
    if (enPrimerArranque) { onPendiente!(v); return }
    setOcupado(true); setError(null)
    try { setEstado(await fijarConsentimiento(v)) } catch (e) { setError(e instanceof Error ? e.message : 'No pude guardar.') } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista titulo="Qué se enviaría" items={LO_QUE_SE_ENVIA} tono="si" />
        <Lista titulo="Qué nunca sale" items={LO_QUE_NUNCA} tono="no" />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Compartir mi avance con el programa</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            {activo ? 'Activado: una vez al día, solo las cifras de arriba. Lo apagas cuando quieras.' : 'Apagado: no sale nada de tu computadora.'}
          </p>
        </div>
        <Interruptor activo={activo} onCambio={cambiar} etiqueta={activo ? 'Dejar de compartir mi avance' : 'Compartir mi avance con el programa'} disabled={ocupado} />
      </div>

      {estado && !estado.endpoint_configurado && (
        <Aviso tono="info">Este Arbrain no tiene configurado a dónde enviar. Aunque lo actives, no sale nada hasta que tu programa lo configure en una actualización.</Aviso>
      )}

      <div className="rounded-2xl border border-border-subtle">
        <button type="button" onClick={() => setVerMuestra(v => !v)} aria-expanded={verMuestra}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[13px] font-medium text-foreground/90 hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-brand rounded-2xl">
          <span className="inline-flex items-center gap-2"><Lock className="size-3.5 text-brand-ink" aria-hidden /> Ver exactamente qué se enviaría</span>
          <ChevronDown className={`size-4 text-muted transition-transform ${verMuestra ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {verMuestra && (
          <div className="border-t border-border-subtle px-4 py-3">
            {!estado && !error && <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Armando la muestra…</p>}
            {estado && <Muestra dias={estado.vista_previa?.dias ?? []} instalacion={estado.vista_previa?.instalacion} />}
            {estado && <details className="mt-3 text-[12px] text-muted"><summary className="cursor-pointer select-none">Ver el paquete tal cual (JSON)</summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-foreground/[0.04] p-3 font-mono text-[11.5px] leading-relaxed text-foreground/80">{JSON.stringify(estado.vista_previa, null, 2)}</pre>
            </details>}
          </div>
        )}
      </div>
      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}

function Lista({ titulo, items, tono }: { titulo: string; items: string[]; tono: 'si' | 'no' }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{titulo}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map(i => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-foreground/90">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tono === 'si' ? 'bg-brand' : 'bg-foreground/30'}`} aria-hidden />{i}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Muestra({ dias, instalacion }: { dias: Dia[]; instalacion?: string }) {
  if (!dias.length) return <p className="text-[13px] text-muted">Todavía no hay días con actividad. Cuando uses Arbrain, aquí verás las cifras de cada día antes de que salgan.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <caption className="sr-only">Lo que se enviaría por día</caption>
        <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Día</th><th className="py-1 pr-3 font-medium">Sesiones</th><th className="py-1 pr-3 font-medium">Acciones de venta</th><th className="py-1 pr-3 font-medium">Cierres</th><th className="py-1 font-medium">Facturado</th></tr></thead>
        <tbody>{dias.slice(-7).map(d => (
          <tr key={d.dia} className="border-t border-border-subtle text-foreground/90">
            <td className="py-1.5 pr-3 tabular-nums">{d.dia}</td><td className="py-1.5 pr-3 tabular-nums">{d.sesiones}</td><td className="py-1.5 pr-3 tabular-nums">{d.acciones_venta}</td><td className="py-1.5 pr-3 tabular-nums">{d.cierres}</td>
            <td className="py-1.5 tabular-nums">{Object.entries(d.facturacion ?? {}).map(([m, v]) => `${v.toLocaleString('es-MX')} ${m}`).join(' · ') || '0'}</td>
          </tr>
        ))}</tbody>
      </table>
      {instalacion && <p className="mt-2 text-[11.5px] text-muted">Identificador de esta instalación (aleatorio, no te identifica): {instalacion}</p>}
    </div>
  )
}
