'use client'
/**
 * Ajustes › Teléfono · tu Levy en el teléfono SIN Tailscale (3 nov 2026; docs/builds/arbrain-connect-2026-11-03/SPEC.md).
 *
 * Como Cloudroom Connect: un QR para escanear con la cámara, el estado «Listo desde…», la dirección privada con
 * Copiar y Abrir, los teléfonos con sesión y «Cerrar sesión en todos los teléfonos». El QR es de un solo uso y 10
 * minutos (lo crea el supervisor, scripts/servidor/conectar.mjs); se renueva solo. La dirección sola no abre nada:
 * sin el QR o el código, el relay responde 401. Esta pantalla solo pregunta y pide por `/api/conectar`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, LogOut, Power, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { Aviso } from '@/features/primer-arranque/components/PanelLlaves'
import { caminoQR, codigoQR } from './qr'
import { horaCorta, textoEstadoConectar, type EstadoConectar } from './conectar-ui'

async function pedir<T>(metodo: 'GET' | 'POST', cuerpo?: Record<string, string>): Promise<T> {
  const r = await fetch('/api/conectar', metodo === 'GET'
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const j = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `Arbrain respondió ${r.status}.`)
  return j
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function TarjetaConectar() {
  const [estado, setEstado] = useState<EstadoConectar | null>(null)
  const [qr, setQr] = useState<{ url: string; vence: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<null | 'leer' | 'encender' | 'apagar' | 'cerrar' | 'abrir'>('leer')
  const [copiado, setCopiado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const leer = useCallback(async () => {
    try { setEstado(await pedir<EstadoConectar>('GET')); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'No pude leer el estado.') }
  }, [])

  const nuevoQr = useCallback(async () => {
    try { setQr(await pedir<{ url: string; vence: string }>('POST', { accion: 'qr' })) } catch { setQr(null) }
  }, [])

  useEffect(() => { void leer().finally(() => setOcupado(null)) }, [leer])
  // Mientras se ve la sección: el estado cada 10 s (para ver entrar al teléfono) y el QR antes de que venza.
  useEffect(() => {
    const t = setInterval(() => { void leer() }, 10_000)
    return () => clearInterval(t)
  }, [leer])
  const listo = estado?.estado === 'listo'
  useEffect(() => {
    if (!listo) { setQr(null); return }
    void nuevoQr()
    const t = setInterval(() => { void nuevoQr() }, 8 * 60_000)
    return () => clearInterval(t)
  }, [listo, nuevoQr])
  // Cuando entra un teléfono nuevo, el QR que usó ya no sirve: se pide otro.
  const cuantos = estado?.telefonos?.length ?? 0
  useEffect(() => { if (listo && cuantos > 0) void nuevoQr() }, [cuantos, listo, nuevoQr])

  const actuar = async (accion: 'encender' | 'apagar') => {
    setOcupado(accion); setError(null); setAviso(null)
    try {
      const j = await pedir<EstadoConectar & { reiniciaWeb?: boolean }>('POST', { accion })
      setEstado(j)
      // Encender o apagar relanza la web con el Host nuevo: se espera a que vuelva.
      if (j.reiniciaWeb) await dormir(1500)
      for (let i = 0; i < 40; i++) {
        try { const s = await pedir<EstadoConectar>('GET'); setEstado(s); if (accion === 'apagar' || s.estado === 'listo') break } catch { /* la web vuelve */ }
        await dormir(1500)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude completar la orden.') } finally { setOcupado(null) }
  }

  const cerrarTodos = async () => {
    setOcupado('cerrar'); setError(null)
    try {
      const j = await pedir<{ cerradas: number }>('POST', { accion: 'cerrar-telefonos' })
      setAviso(j.cerradas === 1 ? 'Cerré 1 sesión. Ese teléfono tendrá que volver a escanear el QR.' : `Cerré ${j.cerradas} sesiones. Cada teléfono tendrá que volver a escanear el QR.`)
      setConfirmar(false)
      await leer()
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude cerrar las sesiones.') } finally { setOcupado(null) }
  }

  // Abrir = entrar desde ESTE navegador: lleva un QR de un solo uso, no solo la dirección (que sin sesión da 401).
  const abrir = async () => {
    setOcupado('abrir')
    const ventana = window.open('about:blank', '_blank')
    try {
      const j = await pedir<{ url: string }>('POST', { accion: 'qr' })
      if (ventana) { ventana.opener = null; ventana.location.href = j.url } else window.location.href = j.url
      void nuevoQr()
    } catch (e) { ventana?.close(); setError(e instanceof Error ? e.message : 'No pude abrirla.') } finally { setOcupado(null) }
  }

  const camino = useMemo(() => (qr?.url ? caminoQR(codigoQR(qr.url)) : null), [qr?.url])
  const t = estado ? textoEstadoConectar(estado) : null
  const sinServidor = estado?.estado === 'sin-modo-servidor' || estado?.estado === 'servidor-viejo'

  return (
    <section className="rounded-2xl border border-brand/40 bg-brand/[0.06] p-4" aria-label="Tu Levy en el teléfono" data-seccion="conectar">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <Smartphone className="size-4 text-brand-ink" aria-hidden /> Tu Levy en el teléfono
        <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">Sin instalar nada</span>
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Escanea el QR con la cámara de tu celular y entras directo a tu Levy, desde cualquier lugar. No necesitas Tailscale ni
        abrir puertos: esta máquina se conecta sola al relay privado de Arbrain y solo entra quien tiene tu QR o tu código.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${t?.tono === 'ok' ? 'bg-success/12 text-success' : t?.tono === 'alerta' ? 'bg-warning/15 text-foreground' : 'bg-surface text-foreground/80'}`} data-estado-conectar={estado?.estado ?? 'leyendo'}>
          {ocupado === 'leer' && !estado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className={`size-2 rounded-full ${t?.tono === 'ok' ? 'bg-success' : t?.tono === 'alerta' ? 'bg-warning' : 'bg-muted'}`} aria-hidden />}
          {t?.titulo ?? 'Revisando…'}
        </span>
        {t?.detalle && <span className="text-[12.5px] text-muted">{t.detalle}</span>}
        {!sinServidor && estado && (estado.estado === 'apagado' || estado.estado === 'revocada' ? (
          <button type="button" className="btn-primary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void actuar('encender')}>
            {ocupado === 'encender' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Power className="size-3.5" aria-hidden />} Encender
          </button>
        ) : (
          <button type="button" className="btn-secondary !px-3 !py-1.5 text-[13px]" disabled={!!ocupado} onClick={() => void actuar('apagar')}>
            {ocupado === 'apagar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Power className="size-3.5" aria-hidden />} Apagar
          </button>
        ))}
      </div>

      {sinServidor && <Aviso tono="info" className="mt-3">{estado?.error ?? 'Esta función es de Arbrain en modo servidor. Pídele a Claude Code «Pon mi cerebro en mi teléfono».'}</Aviso>}
      {estado?.estado === 'apagado' && !estado.relay && <Aviso tono="info" className="mt-3">Falta la dirección del relay de Arbrain en esta copia (prototipo: se da con `npm run servidor -- conectar encender --relay …`).</Aviso>}

      {listo && estado?.url && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="flex flex-col items-center gap-1.5">
            {camino ? (
              <svg viewBox={`0 0 ${camino.lado} ${camino.lado}`} className="size-44 rounded-xl bg-white" role="img" aria-label="Código QR para entrar desde tu teléfono" shapeRendering="crispEdges" data-qr-conectar={qr?.url}>
                <rect width={camino.lado} height={camino.lado} fill="#fff" />
                <path d={camino.d} fill="#000" />
              </svg>
            ) : <div className="grid size-44 place-items-center rounded-xl bg-surface"><QrCode className="size-8 text-muted" aria-hidden /></div>}
            <button type="button" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground" onClick={() => void nuevoQr()}>
              <RefreshCw className="size-3" aria-hidden /> Otro QR
            </button>
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <h4 className="text-[13.5px] font-semibold text-foreground">Escanéalo con tu teléfono</h4>
              <p className="text-[13px] leading-relaxed text-muted">
                Con la cámara del iPhone o de tu Android. Abre el enlace y ya estás dentro. Este QR sirve una sola vez
                {qr?.vence ? ` y hasta las ${horaCorta(qr.vence)}` : ''}; si alguien más lo ve, pide otro.
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface/70 px-3 py-2">
              <p className="text-[12px] font-medium text-muted">Dirección privada</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-[13px] text-foreground" data-url-conectar>{estado.url}</code>
                <button type="button" className="btn-secondary !px-2 !py-1 text-[12px]" aria-label="Copiar la dirección" onClick={() => { void navigator.clipboard?.writeText(estado.url!).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }) }}>
                  {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copiado ? 'Copiada' : 'Copiar'}
                </button>
                <button type="button" className="btn-secondary !px-2 !py-1 text-[12px]" disabled={!!ocupado} onClick={() => void abrir()}>
                  {ocupado === 'abrir' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />} Abrir
                </button>
              </div>
              <p className="mt-1 text-[11.5px] text-muted">Sola no abre nada: sin tu QR o tu código responde «sin sesión».</p>
            </div>
          </div>
        </div>
      )}

      {listo && (
        <div className="mt-4 rounded-xl border border-border-subtle bg-surface/70 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground">Teléfonos con sesión</p>
              <p className="text-[12px] text-muted">{aviso ?? (cuantos === 0 ? 'Ninguno todavía. Siguen dentro hasta que los cierres aquí (30 días sin usar).' : 'Siguen dentro hasta que los cierres aquí.')}</p>
            </div>
            {confirmar && <button type="button" className="btn-secondary !px-2.5 !py-1 text-[12px]" onClick={() => setConfirmar(false)}>Cancelar</button>}
            <button type="button" className="btn-secondary !px-2.5 !py-1 text-[12px] text-danger" disabled={ocupado === 'cerrar'} onClick={() => (confirmar ? void cerrarTodos() : setConfirmar(true))} data-cerrar-telefonos>
              {ocupado === 'cerrar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LogOut className="size-3.5" aria-hidden />}
              {confirmar ? '¿Cerrar sesión en todos?' : 'Cerrar sesión en todos los teléfonos'}
            </button>
          </div>
          {cuantos > 0 && (
            <ul className="mt-2 space-y-1">
              {estado!.telefonos!.map((tel) => (
                <li key={tel.id} className="flex items-center gap-2 text-[12.5px] text-foreground/90">
                  <Smartphone className="size-3.5 text-muted" aria-hidden />
                  <span className="font-medium">{tel.agente}</span>
                  <span className="text-muted">· entró {horaCorta(tel.creada, true)}{tel.nombreMaquina && estado!.telefonos!.some((x) => x.maquina !== tel.maquina) ? ` · en ${tel.nombreMaquina}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {estado?.desdeTelefono && estado.porRelay && <p className="mt-3 text-[12.5px] text-success">Lo estás viendo desde tu teléfono por el relay: ya funciona.</p>}
      {error && <Aviso tono="alerta" className="mt-3">{error}</Aviso>}
    </section>
  )
}
