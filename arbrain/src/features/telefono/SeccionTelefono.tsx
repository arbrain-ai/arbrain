'use client'
/**
 * Ajustes › Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1).
 *
 * TU Arbrain (el que corre en esta computadora) como app en el celular, por la red privada de Tailscale de la persona.
 * No es el «Agente Arbrain» del sitio del programa (fue confusión real en la grupal del 23 oct): por eso el nombre y el icono
 * dicen «Tu Arbrain». Estado, dirección con QR, código de entrada de un solo uso y el paso a paso para iPhone y Android.
 * Lo hace `scripts/servidor/telefono.mjs` por `/api/telefono`; esta pantalla solo pregunta y pide.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Power, RefreshCw, Smartphone } from 'lucide-react'
import { Aviso } from '@/features/primer-arranque/components/PanelLlaves'
import { caminoQR, codigoQR } from './qr'

interface Estado {
  estado: string
  url?: string
  host?: string
  paso?: string | null
  enlace?: string | null
  detalle?: string
  error?: string
  desdeTelefono?: boolean
}

const TITULO: Record<string, string> = {
  encendido: 'Encendido',
  apagado: 'Apagado',
  'falta-tailscale': 'Falta Tailscale',
  'falta-sesion': 'Falta iniciar sesión en Tailscale',
  'falta-aprobacion': 'Falta aprobar esta computadora en Tailscale',
  'apagado-tailscale': 'Tailscale está desconectado',
  arrancando: 'Tailscale está arrancando',
  'sin-magicdns': 'Falta activar MagicDNS',
  'falta-https': 'Falta activar HTTPS en tu red de Tailscale',
  'falta-permiso': 'Falta un permiso de Tailscale',
  desfasado: 'Hay que volver a encenderlo',
  'servidor-viejo': 'Actualiza Arbrain',
  'sin-modo-servidor': 'Solo con Arbrain en modo servidor',
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pedirEstado(): Promise<Estado> {
  const r = await fetch('/api/telefono', { cache: 'no-store' })
  const j = await r.json().catch(() => ({})) as Estado
  if (!r.ok) throw new Error(j.error || `Arbrain respondió ${r.status}.`)
  return j
}

export function SeccionTelefono() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<null | 'encender' | 'apagar' | 'leer'>('leer')
  const [codigo, setCodigo] = useState<{ codigo: string; vence: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const leer = useCallback(async () => {
    setOcupado('leer'); setError(null)
    try { setEstado(await pedirEstado()) } catch (e) { setError(e instanceof Error ? e.message : 'No pude leer el estado.') } finally { setOcupado(null) }
  }, [])
  useEffect(() => { void leer() }, [leer])

  const actuar = async (accion: 'encender' | 'apagar') => {
    setOcupado(accion); setError(null); setCodigo(null)
    try {
      const r = await fetch('/api/telefono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) })
      const j = await r.json().catch(() => ({})) as Estado & { reiniciaWeb?: boolean }
      if (!r.ok) throw new Error(j.error || `Arbrain respondió ${r.status}.`)
      setEstado(j)
      // Encender o apagar relanza la web con el permiso nuevo: se espera a que vuelva (unos segundos).
      if (j.reiniciaWeb) {
        await dormir(1500)
        for (let i = 0; i < 40; i++) {
          try { setEstado(await pedirEstado()); break } catch { await dormir(1500) }
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude completar la orden.') } finally { setOcupado(null) }
  }

  const pedirCodigo = async () => {
    setError(null)
    try {
      const r = await fetch('/api/telefono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'codigo' }) })
      const j = await r.json().catch(() => ({})) as { codigo?: string; vence?: string; error?: string }
      if (!r.ok || !j.codigo || !j.vence) throw new Error(j.error || 'No pude crear el código.')
      setCodigo({ codigo: j.codigo, vence: j.vence })
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude crear el código.') }
  }

  const qr = useMemo(() => (estado?.url ? caminoQR(codigoQR(estado.url)) : null), [estado?.url])
  const encendido = estado?.estado === 'encendido'
  const sinServidor = estado?.estado === 'sin-modo-servidor'

  return (
    <div className="space-y-4" data-seccion="telefono">
      <section className="rounded-2xl border border-brand/40 bg-brand/[0.06] p-4" aria-label="Tu cerebro en el teléfono">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <Smartphone className="size-4 text-brand-ink" aria-hidden /> Tu cerebro en el teléfono
          <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">Tu Arbrain</span>
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Abre <strong className="text-foreground">tu Arbrain</strong>, el que vive en esta computadora (tu Levy, tu día, tu plan), desde tu
          celular y en cualquier lugar. Viaja por tu red privada de Tailscale, cifrada y sin abrir nada a internet. No es el
          «Agente Arbrain» del sitio del programa: esa es otra app.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${encendido ? 'bg-success/12 text-success' : 'bg-surface text-foreground/80'}`} data-estado={estado?.estado ?? 'leyendo'}>
            {ocupado === 'leer' && !estado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className={`size-2 rounded-full ${encendido ? 'bg-success' : 'bg-muted'}`} aria-hidden />}
            {estado ? (TITULO[estado.estado] ?? estado.estado) : 'Revisando…'}
          </span>
          {!sinServidor && (
            <>
              {encendido ? (
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void actuar('apagar')}>
                  {ocupado === 'apagar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Power className="size-3.5" aria-hidden />} Apagar
                </button>
              ) : (
                <button type="button" className="btn-primary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void actuar('encender')}>
                  {ocupado === 'encender' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Power className="size-3.5" aria-hidden />} Encender
                </button>
              )}
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void leer()} aria-label="Revisar de nuevo">
                <RefreshCw className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>

        {estado && !encendido && (estado.paso || estado.enlace || estado.error) && (
          <Aviso tono={estado.estado === 'apagado' ? 'info' : 'alerta'} className="mt-3">
            {estado.paso ?? estado.error}
            {estado.enlace && <> <a className="font-medium underline" href={estado.enlace} target="_blank" rel="noreferrer">Abrir el enlace de Tailscale</a></>}
          </Aviso>
        )}
        {estado?.estado === 'apagado' && !estado.paso && (
          <p className="mt-3 text-[13px] text-muted">Tailscale está listo en esta computadora. Pulsa «Encender» y aparecerá aquí la dirección para tu teléfono.</p>
        )}
        {sinServidor && <Aviso tono="info" className="mt-3">Esta función es de Arbrain instalado con su prompt (modo servidor). Pídele a Claude Code «Pon mi cerebro en mi teléfono».</Aviso>}

        {encendido && estado?.url && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            {qr && (
              <svg viewBox={`0 0 ${qr.lado} ${qr.lado}`} className="size-40 rounded-xl bg-white p-0" role="img" aria-label={`Código QR de ${estado.url}`} shapeRendering="crispEdges" data-qr={estado.url}>
                <rect width={qr.lado} height={qr.lado} fill="#fff" />
                <path d={qr.d} fill="#000" />
              </svg>
            )}
            <div className="min-w-0 space-y-2">
              <p className="text-[13px] text-muted">Escanéalo con la cámara de tu teléfono (con Tailscale abierto y la misma cuenta):</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 truncate rounded-lg bg-surface px-2 py-1 text-[13px] text-foreground" data-url-telefono>{estado.url}</code>
                <button type="button" className="btn-secondary !px-2 !py-1 text-[12px]" onClick={() => { void navigator.clipboard?.writeText(estado.url!).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }) }} aria-label="Copiar la dirección">
                  {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                </button>
              </div>
              <button type="button" className="btn-secondary !px-3 !py-1.5 text-[13px]" onClick={() => void pedirCodigo()}>
                <KeyRound className="size-3.5" aria-hidden /> Código para entrar
              </button>
              {codigo && (
                <p className="text-[13px] text-foreground" role="status">
                  Escribe en tu teléfono <strong className="font-mono text-[16px] tracking-wider" data-codigo>{codigo.codigo}</strong>. Sirve una vez
                  y hasta las {new Date(codigo.vence).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                </p>
              )}
              {estado.desdeTelefono && <p className="text-[12.5px] text-success">Lo estás viendo desde tu teléfono: ya funciona.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Paso a paso">
        <Pasos titulo="iPhone" pasos={[
          'Instala Tailscale desde la App Store y entra con la misma cuenta que en tu computadora.',
          'Escanea el QR con la Cámara y abre la dirección en Safari.',
          'Toca Compartir › «Agregar a pantalla de inicio». Se llama «Tu Arbrain».',
          'Abre «Tu Arbrain» desde tu pantalla y entra con el código de aquí (o tu contraseña). Dura 30 días.',
        ]} />
        <Pasos titulo="Android" pasos={[
          'Instala Tailscale desde Google Play y entra con la misma cuenta que en tu computadora.',
          'Escanea el QR con la cámara y abre la dirección en Chrome.',
          'Entra con el código de aquí (o tu contraseña).',
          'Menú ⋮ › «Instalar app» (o «Agregar a la pantalla principal»). Se llama «Tu Arbrain».',
        ]} />
      </section>

      <p className="text-[12.5px] leading-relaxed text-muted">
        Funciona mientras esta computadora esté prendida, con internet y con Arbrain corriendo. Si la apagas, el teléfono no
        tiene a quién preguntar. Solo entran los equipos de tu cuenta de Tailscale y, además, con tu código o contraseña.
      </p>

      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}

function Pasos({ titulo, pasos }: { titulo: string; pasos: string[] }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <h4 className="text-[13.5px] font-semibold text-foreground">{titulo}</h4>
      <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
        {pasos.map((p, i) => (
          <li key={i} className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{i + 1}</span><span>{p}</span></li>
        ))}
      </ol>
    </div>
  )
}
