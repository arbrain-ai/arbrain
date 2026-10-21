'use client'
/**
 * Ajustes › Privacidad › «Conectar con arbrain.ai (opcional)» (puente de seguimiento, 21 oct 2026).
 * Apagado por defecto. Se pega el token de «Conectar mi cerebro» (perfil de arbrain.ai), se ve EXACTAMENTE la señal que
 * saldría (la arma el daemon), se prueba con «Enviar ahora» y se desconecta cuando se quiera. La dirección es
 * configurable: el código es abierto y no queda atado a arbrain.ai.
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Loader2, Lock } from 'lucide-react'
import { Interruptor } from '@/features/configuracion/components/Interruptor'
import { Aviso } from './PanelLlaves'

interface Estado {
  conectado: boolean
  url: string
  pista: string | null
  compartir_texto: boolean
  manual: { semana: string; ofertas: number | null; conversaciones_venta: number | null } | null
  ultimo_envio: number | null
  ultimo_resultado: string | null
  vista_previa: Record<string, unknown>
  resultado?: string
  detalle?: string
}

const SE_ENVIA = ['Que tu Arbrain está instalado y su versión', 'Si tienes meta del mes, la semana y el día (el texto solo si lo permites)', 'Tus hábitos activos y cuántos días los cumpliste en 7 días', 'Cuántas conversaciones tuviste con Levy en 7 días (solo el número)', 'Cuántos eventos tiene tu calendario', 'Ofertas y conversaciones de venta, si las anotas abajo']
const NUNCA = ['El texto de tus conversaciones', 'Tu memoria ni tus archivos', 'Nombres o datos de tus clientes', 'Tus llaves']

async function pedir(cuerpo?: Record<string, unknown>): Promise<Estado> {
  const r = await fetch('/api/progreso', cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : { cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'No pude hablar con tu Arbrain local.')
  return j as Estado
}

export function PanelConexionArbrain() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [verUrl, setVerUrl] = useState(false)
  const [verJson, setVerJson] = useState(false)
  const [ofertas, setOfertas] = useState('')
  const [convs, setConvs] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const aplicar = useCallback((e: Estado) => {
    setEstado(e)
    setUrl(u => u || e.url)
    setOfertas(e.manual?.ofertas?.toString() ?? '')
    setConvs(e.manual?.conversaciones_venta?.toString() ?? '')
  }, [])
  useEffect(() => { pedir().then(aplicar, e => setError(e instanceof Error ? e.message : String(e))) }, [aplicar])

  const accion = async (cuerpo: Record<string, unknown>, ok?: (e: Estado) => string | null) => {
    setOcupado(true); setError(null); setAviso(null)
    try { const e = await pedir(cuerpo); aplicar(e); setAviso(ok?.(e) ?? null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setOcupado(false) }
  }
  const resultadoEnvio = (e: Estado) => e.resultado === 'enviado' ? 'Listo: arbrain.ai recibió tu señal.' : e.resultado === 'rechazado' ? `arbrain.ai rechazó el token: ${e.detalle ?? ''}. Genera uno nuevo en tu perfil.` : `No se pudo enviar: ${e.detalle ?? e.resultado ?? ''}`

  const conectado = !!estado?.conectado
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista titulo="Qué se envía" items={SE_ENVIA} tono="si" />
        <Lista titulo="Qué nunca sale" items={NUNCA} tono="no" />
      </div>

      {!conectado ? (
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface/70 p-4">
          <p className="text-[13px] leading-snug text-muted">Apagado: no sale nada. Para conectar, entra a tu perfil en arbrain.ai, toca «Generar mi token» en «Conectar mi cerebro» y pégalo aquí.</p>
          <label className="block text-[12.5px] font-medium text-foreground/90">Token
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e => setToken(e.target.value)} placeholder="arb_…"
              className="mt-1 block w-full rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-brand" />
          </label>
          <button type="button" onClick={() => setVerUrl(v => !v)} className="text-[12px] text-muted underline-offset-2 hover:underline">{verUrl ? 'Ocultar dirección' : 'Cambiar la dirección (avanzado)'}</button>
          {verUrl && (
            <label className="block text-[12.5px] font-medium text-foreground/90">Dirección del receptor
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} className="mt-1 block w-full rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-[12.5px] text-foreground" />
            </label>
          )}
          <button type="button" disabled={ocupado || !token.trim()} onClick={() => accion({ accion: 'conectar', token: token.trim(), url: url.trim() || undefined }, () => { setToken(''); return 'Conectado. Toca «Enviar ahora» para probar.' })}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-50">
            {ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Conectar
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface/70 p-4">
          <p className="text-[13px] text-foreground/90">
            Conectado con <span className="font-mono">{estado!.pista}…</span> a <span className="font-mono text-[12px]">{estado!.url}</span>. Se envía una vez al día mientras Arbrain está abierto.
          </p>
          <p className="text-[12.5px] text-muted">
            {estado!.ultimo_envio ? `Último envío: ${new Date(estado!.ultimo_envio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Todavía no se ha enviado nada.'}
            {estado!.ultimo_resultado && estado!.ultimo_resultado !== 'enviado' ? ` Último intento: ${estado!.ultimo_resultado}` : ''}
          </p>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><p className="text-[13px] font-semibold text-foreground">Compartir el texto de mis metas y el nombre de mis hábitos</p>
              <p className="text-[12px] text-muted">{estado!.compartir_texto ? 'Activado: tu acompañamiento en arbrain.ai ve qué metas y hábitos tienes.' : 'Apagado: solo se dice si existen y cuántos días cumpliste.'}</p></div>
            <Interruptor activo={estado!.compartir_texto} disabled={ocupado} etiqueta="Compartir el texto de mis metas" onCambio={v => accion({ accion: 'ajustes', compartir_texto: v })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-[12.5px] text-foreground/90">Ofertas hechas esta semana
              <input inputMode="numeric" value={ofertas} onChange={e => setOfertas(e.target.value.replace(/\D/g, ''))} className="mt-1 block w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-[13px]" /></label>
            <label className="text-[12.5px] text-foreground/90">Conversaciones de venta esta semana
              <input inputMode="numeric" value={convs} onChange={e => setConvs(e.target.value.replace(/\D/g, ''))} className="mt-1 block w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-[13px]" /></label>
            <button type="button" disabled={ocupado} onClick={() => accion({ accion: 'ajustes', manual: { ofertas: ofertas === '' ? null : Number(ofertas), conversaciones_venta: convs === '' ? null : Number(convs) } }, () => 'Guardado.')}
              className="min-h-10 rounded-lg border border-border-subtle px-3 text-[13px] hover:bg-foreground/[0.04] disabled:opacity-50">Guardar</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={() => accion({ accion: 'enviar' }, resultadoEnvio)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-50">
              {ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Enviar ahora
            </button>
            <button type="button" disabled={ocupado} onClick={() => accion({ accion: 'desconectar' }, () => 'Desconectado. Ya no sale nada.')}
              className="min-h-10 rounded-lg border border-border-subtle px-4 text-[13px] hover:bg-foreground/[0.04] disabled:opacity-50">Desconectar</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border-subtle">
        <button type="button" onClick={() => setVerJson(v => !v)} aria-expanded={verJson}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 text-left text-[13px] font-medium text-foreground/90 hover:bg-foreground/[0.03]">
          <span className="inline-flex items-center gap-2"><Lock className="size-3.5 text-brand-ink" aria-hidden /> Ver exactamente qué se envía</span>
          <ChevronDown className={`size-4 text-muted transition-transform ${verJson ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {verJson && (
          <pre className="max-h-72 overflow-auto border-t border-border-subtle bg-foreground/[0.04] p-3 font-mono text-[11.5px] leading-relaxed text-foreground/80">
            {estado ? JSON.stringify(estado.vista_previa, null, 2) : 'Armando la vista previa…'}
          </pre>
        )}
      </div>
      {aviso && <Aviso tono="info">{aviso}</Aviso>}
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
