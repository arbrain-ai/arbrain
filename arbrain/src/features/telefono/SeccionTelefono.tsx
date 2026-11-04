'use client'
/**
 * Ajustes › Tu cerebro en el teléfono (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1).
 *
 * TU Arbrain (el que corre en esta computadora) como app en el celular, por la red privada de Tailscale de la persona.
 * No es el «Agente Arbrain» del sitio del programa (fue confusión real en la grupal del 23 oct): por eso el nombre y el icono
 * dicen «Tu Arbrain». Estado, dirección con QR, código de entrada de un solo uso y el paso a paso para iPhone y Android.
 * Lo hace `scripts/servidor/telefono.mjs` por `/api/telefono`; esta pantalla solo pregunta y pide.
 *
 * 3 nov 2026 (vuelta 2 del primer uso, «dos conversaciones con Claude Code»): «Encender» hace aquí lo que hacía
 * TELEFONO.md. Si falta algo, el supervisor abre lo que toca (App Store, inicio de sesión, el enlace de HTTPS) y esta
 * pantalla dice en una línea qué le queda a la persona, revisa cada pocos segundos y vuelve a encender sola hasta
 * «Encendido» (15 minutos como mucho, igual que la guía).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Power, RefreshCw, Smartphone } from 'lucide-react'
import { Aviso } from '@/features/primer-arranque/components/PanelLlaves'
import { caminoQR, codigoQR } from './qr'
import { TarjetaConectar } from './TarjetaConectar'

interface Estado {
  estado: string
  url?: string
  host?: string
  https?: boolean
  paso?: string | null
  enlace?: string | null
  detalle?: string
  error?: string
  desdeTelefono?: boolean
  ayuda?: { teToca: string | null; enlace: string | null; abierto: string | null }
}

/** Mientras se guía el encendido: cada cuánto se revisa y cada cuánto se vuelve a pedir encender (como la guía, 20 s). */
const REVISAR_MS = 4000
const REINTENTAR_MS = 20_000
const GUIA_MAX_MS = 15 * 60_000
/** Estados en los que lo que sigue es volver a encender ya (Tailscale listo, falta publicar). */
const LISTO_PARA_ENCENDER = new Set(['apagado', 'desfasado'])

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
  // Encendido guiado: lo que le toca a la persona ahora y desde cuándo se guía.
  const [guia, setGuia] = useState<{ desde: number; ultimoEncender: number; teToca: string | null; enlace: string | null } | null>(null)

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
      if (accion === 'encender' && j.estado !== 'encendido' && j.estado !== 'sin-modo-servidor' && j.estado !== 'servidor-viejo') {
        setGuia({ desde: Date.now(), ultimoEncender: Date.now(), teToca: j.ayuda?.teToca ?? j.paso ?? null, enlace: j.ayuda?.enlace ?? j.enlace ?? null })
      } else setGuia(null)
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

  // Guía: revisa cada pocos segundos; con Tailscale listo vuelve a encender enseguida, y si sigue faltando algo, cada 20 s
  // (así llega el enlace nuevo de sesión o de HTTPS). Termina en «Encendido» o a los 15 minutos.
  useEffect(() => {
    if (!guia) return
    let vivo = true
    const t = setInterval(async () => {
      if (!vivo || ocupado) return
      if (Date.now() - guia.desde > GUIA_MAX_MS) { setGuia(null); setError('Pasaron 15 minutos sin terminar. Cuando estés listo, pulsa «Encender» otra vez.'); return }
      let e: Estado
      try { e = await pedirEstado() } catch { return }
      if (!vivo) return
      setEstado(e)
      if (e.estado === 'encendido') { setGuia(null); return }
      const ya = LISTO_PARA_ENCENDER.has(e.estado) && (e.https !== false || Date.now() - guia.ultimoEncender >= REINTENTAR_MS)
      if (!ya && Date.now() - guia.ultimoEncender < REINTENTAR_MS) return
      try {
        const r = await fetch('/api/telefono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'encender' }) })
        const j = await r.json().catch(() => ({})) as Estado & { reiniciaWeb?: boolean }
        if (!vivo || !r.ok) return
        setEstado(j)
        if (j.estado === 'encendido') {
          setGuia(null)
          if (j.reiniciaWeb) { await dormir(1500); for (let i = 0; i < 40; i++) { try { setEstado(await pedirEstado()); break } catch { await dormir(1500) } } }
          return
        }
        setGuia((g) => g && { ...g, ultimoEncender: Date.now(), teToca: j.ayuda?.teToca ?? j.paso ?? g.teToca, enlace: j.ayuda?.enlace ?? j.enlace ?? g.enlace })
      } catch { /* la web vuelve; la siguiente vuelta repite */ }
    }, REVISAR_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [guia, ocupado])

  const qr = useMemo(() => (estado?.url ? caminoQR(codigoQR(estado.url)) : null), [estado?.url])
  const encendido = estado?.estado === 'encendido'
  const sinServidor = estado?.estado === 'sin-modo-servidor'

  return (
    <div className="space-y-4" data-seccion="telefono">
      {/* Sin Tailscale (3 nov 2026): el camino por omisión. El de Tailscale queda abajo para quien ya lo usa. */}
      <TarjetaConectar />
      <details className="group space-y-4 rounded-2xl border border-border-subtle p-3" data-tailscale>
        <summary className="cursor-pointer text-[13px] font-medium text-muted">Otra forma: por tu red privada de Tailscale</summary>
      <section className="mt-3 rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Tu cerebro en el teléfono">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <Smartphone className="size-4 text-brand-ink" aria-hidden /> Por Tailscale
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

        {guia && !encendido && (
          <div className="mt-3 rounded-xl bg-brand/8 px-3 py-2.5 text-[13px] leading-relaxed text-foreground/90" role="status" aria-live="polite" data-guia-telefono>
            <p className="flex items-start gap-2"><Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-ink" aria-hidden />
              <span>{guia.teToca ?? 'Encendiendo…'} <span className="text-muted">Sigo solo en cuanto lo hagas.</span></span></p>
            {guia.enlace?.startsWith('https://') && <a className="mt-1 inline-block font-medium underline" href={guia.enlace} target="_blank" rel="noreferrer">Abrir de nuevo</a>}
          </div>
        )}
        {!guia && estado && !encendido && (estado.paso || estado.enlace || estado.error) && (
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
      </details>

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
