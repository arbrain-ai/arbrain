'use client'
/**
 * Seguridad del alumno (12 oct 2026; docs/builds/seguridad-alumno-2026-10-12/AUDITORIA.md). Edición cliente.
 *
 *   FrenoGeneral       botón «Pausar todo» siempre a la mano y, en pausa, la franja «Levy está en pausa · Reanudar».
 *   SeccionSeguridad   Ajustes › Seguridad: el freno, «Lo que hizo Levy» (bitácora local), carpetas abiertas y el tope
 *                      de gasto.
 *   TopeDeGasto        texto y enlaces para poner un límite de crédito a la llave, y el gasto si el proveedor lo deja
 *                      ver (OpenRouter). Lo usan Ajustes › Llaves (y el primer arranque, que monta ese panel) y Seguridad.
 *
 * Todo pasa por las rutas `/api/seguridad/*` del servidor local, que exigen la cookie de la app y su origen; los
 * secretos los pone ese servidor (reanudar y abrir carpetas llevan el de confirmar), nunca el navegador.
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, FolderOpen, FolderPlus, Loader2, OctagonPause, Play, RefreshCw, ScrollText, Wallet, X } from 'lucide-react'
import { abrirEnNavegador } from '@/features/primer-arranque/lib/llaves'
import {
  ENLACES_TOPE, ETIQUETA_DECISION, horaDe, nombreHerramienta, resumenGasto,
  type AccionBitacora, type CarpetaAbierta, type EstadoPausa, type RespuestaGasto,
} from '../lib/seguridad'

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const j = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j
}

function usePausa(cadaMs = 3_000) {
  const [pausa, setPausa] = useState<EstadoPausa | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => { try { setPausa(await pedir<EstadoPausa>('/api/seguridad/pausa')) } catch { /* daemon reiniciando */ } }, [])
  useEffect(() => {
    void leer()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void leer() }, cadaMs)
    return () => window.clearInterval(t)
  }, [leer, cadaMs])
  const fijar = useCallback(async (pausado: boolean) => {
    setOcupado(true); setError(null)
    try { setPausa(await pedir<EstadoPausa>('/api/seguridad/pausa', { method: 'POST', body: JSON.stringify({ pausado }) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.') }
    finally { setOcupado(false) }
  }, [])
  return { pausa, ocupado, error, fijar }
}

/** Botón flotante «Pausar todo» y, en pausa, la franja con «Reanudar». */
export function FrenoGeneral() {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const { pausa, ocupado, error, fijar } = usePausa()
  if (!montado || !pausa) return null
  return createPortal(
    pausa.pausado ? (
      <div role="status" aria-live="polite" className="fixed left-1/2 top-14 z-[101] flex max-w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-950/80 px-4 py-2.5 text-[13px] text-amber-50 shadow-lg backdrop-blur-xl">
        <OctagonPause className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0">Levy está en pausa: no corre ningún turno, rutina ni herramienta.{error ? ` ${error}` : ''}</span>
        <button type="button" onClick={() => void fijar(false)} disabled={ocupado} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">
          {ocupado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} Reanudar
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => void fijar(true)} disabled={ocupado} title="Detiene todo lo que Levy está haciendo y no deja empezar nada hasta que reanudes"
        className="fixed bottom-3 right-3 z-[95] flex items-center gap-1.5 rounded-full border border-border-subtle bg-[var(--glass-bg)] px-3 py-1.5 text-[12px] font-medium text-foreground/80 shadow-md backdrop-blur-xl transition-colors hover:border-red-400/50 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-brand">
        {ocupado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <OctagonPause className="size-3.5" aria-hidden />} Pausar todo
      </button>
    ),
    document.body,
  )
}

function Tarjeta({ titulo, icono: Icono, children, accion }: { titulo: string; icono: typeof Wallet; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><Icono className="size-4 text-brand-ink" aria-hidden /> {titulo}</h3>
        {accion}
      </header>
      {children}
    </section>
  )
}

function Enlace({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => void abrirEnNavegador(url).catch(() => {})} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-ink underline-offset-2 hover:underline">
      {children} <ExternalLink className="size-3" aria-hidden />
    </button>
  )
}

/** Texto y enlaces para ponerle tope a la llave; el gasto, si OpenRouter lo deja ver. */
export function TopeDeGasto({ compacto = false }: { compacto?: boolean }) {
  const [g, setG] = useState<RespuestaGasto | null>(null)
  const [cargando, setCargando] = useState(false)
  const leer = useCallback(async () => { setCargando(true); try { setG(await pedir<RespuestaGasto>('/api/seguridad/gasto')) } catch { setG(null) } finally { setCargando(false) } }, [])
  useEffect(() => { void leer() }, [leer])
  const r = resumenGasto(g?.openrouter.gasto ?? null)
  return (
    <Tarjeta titulo="Ponle tope a tu gasto" icono={Wallet} accion={g?.openrouter.conectada ? (
      <button type="button" onClick={() => void leer()} className="icon-btn-ghost grid size-8 place-items-center" aria-label="Actualizar gasto">{cargando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}</button>
    ) : undefined}>
      <p className="text-[13px] leading-relaxed text-muted">
        Levy usa tu llave y cada respuesta cuesta. Ponle un límite de crédito para que, pase lo que pase (un error, una rutina que se repite, alguien que use tu llave), nunca gaste más de lo que decidas.
      </p>
      {r && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-foreground" role="status">{r.linea}</p>
          {r.porcentaje !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden><div className={`h-full ${r.porcentaje >= 80 ? 'bg-red-400' : 'bg-brand'}`} style={{ width: `${r.porcentaje}%` }} /></div>
          )}
          {r.sinLimite && <p className="mt-1 text-[12.5px] text-amber-300">Tu llave no tiene límite. Recomendado: ponle uno ahora (por ejemplo, US$10 al mes).</p>}
        </div>
      )}
      {g?.openrouter.error && <p className="mt-2 text-[12.5px] text-muted">{g.openrouter.error}</p>}
      {compacto ? (
        <p className="mt-2 text-[12.5px] text-muted">
          <Enlace url={ENLACES_TOPE.openrouterLlaves}>Límite en OpenRouter</Enlace> · <Enlace url={ENLACES_TOPE.anthropicLimite}>Límite en Anthropic</Enlace>
        </p>
      ) : (
        <ol className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
          <li><b className="text-foreground/90">OpenRouter:</b> abre tus llaves, pulsa la de Arbrain y fija su «credit limit» (puede reiniciarse cada día, semana o mes). <Enlace url={ENLACES_TOPE.openrouterLlaves}>Abrir mis llaves</Enlace></li>
          <li><b className="text-foreground/90">Anthropic:</b> en la consola, Settings › Billing › Spend limits, fija tu límite mensual. Anthropic no deja ver el gasto con una llave normal: revísalo en su consola. <Enlace url={ENLACES_TOPE.anthropicLimite}>Poner límite</Enlace> · <Enlace url={ENLACES_TOPE.anthropicUso}>Ver uso</Enlace></li>
        </ol>
      )}
    </Tarjeta>
  )
}

function Carpetas() {
  const [carpetas, setCarpetas] = useState<CarpetaAbierta[] | null>(null)
  const [ruta, setRuta] = useState('')
  const [seguro, setSeguro] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const leer = useCallback(async () => { try { setCarpetas((await pedir<{ carpetas: CarpetaAbierta[] }>('/api/seguridad/carpetas')).carpetas) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer.') } }, [])
  useEffect(() => { void leer() }, [leer])
  const mandar = async (accion: 'abrir' | 'cerrar', r: string) => {
    setOcupado(true); setError(null)
    try { setCarpetas((await pedir<{ carpetas: CarpetaAbierta[] }>('/api/seguridad/carpetas', { method: 'POST', body: JSON.stringify({ accion, ruta: r }) })).carpetas); if (accion === 'abrir') { setRuta(''); setSeguro(false) } }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.') }
    finally { setOcupado(false) }
  }
  return (
    <Tarjeta titulo="Carpetas abiertas para Levy" icono={FolderOpen}>
      <p className="text-[13px] leading-relaxed text-muted">
        Levy trabaja solo dentro de tu cerebro de Arbrain. Si necesita otra carpeta, ábresela aquí, una por una: podrá leerla sin preguntarte y te pedirá permiso para escribir en ella. Nunca entra a tus llaves, contraseñas, navegadores ni carteras, aunque abras su carpeta.
      </p>
      <ul className="mt-3 space-y-1.5">
        {carpetas?.length === 0 && <li className="text-[12.5px] text-muted">Ninguna. Levy solo ve tu cerebro.</li>}
        {carpetas?.map(c => (
          <li key={c.ruta} className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.04] px-3 py-2">
            <code className="min-w-0 truncate text-[12px] text-foreground/90" title={c.ruta}>{c.ruta}</code>
            <button type="button" onClick={() => void mandar('cerrar', c.ruta)} disabled={ocupado} className="btn-secondary shrink-0 !px-2.5 !py-1 text-[12px]"><X className="size-3" aria-hidden /> Cerrar</button>
          </li>
        ))}
      </ul>
      <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (ruta.trim() && seguro) void mandar('abrir', ruta.trim()) }}>
        <label className="block text-[12.5px] text-muted">Ruta de la carpeta
          <input value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder="~/Documents/MiProyecto" className="input-field mt-1 min-h-10 w-full px-3 text-[13px]" spellCheck={false} autoComplete="off" />
        </label>
        <label className="flex items-start gap-2 text-[12.5px] text-muted">
          <input type="checkbox" checked={seguro} onChange={(e) => setSeguro(e.target.checked)} className="mt-0.5" />
          <span>Entiendo que Levy podrá leer todo lo que hay en esta carpeta.</span>
        </label>
        <button type="submit" disabled={!ruta.trim() || !seguro || ocupado} className="btn-secondary !px-3 !py-2 text-[13px]"><FolderPlus className="size-3.5" aria-hidden /> Abrir para Levy</button>
      </form>
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
    </Tarjeta>
  )
}

function LoQueHizoLevy() {
  const [acciones, setAcciones] = useState<AccionBitacora[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => { try { setAcciones((await pedir<{ acciones: AccionBitacora[] }>('/api/seguridad/bitacora?limite=200')).acciones); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer.') } }, [])
  useEffect(() => {
    void leer()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void leer() }, 5_000)
    return () => window.clearInterval(t)
  }, [leer])
  const tono = { ok: 'text-success', aviso: 'text-amber-300', freno: 'text-red-300' } as const
  return (
    <Tarjeta titulo="Lo que hizo Levy" icono={ScrollText}>
      <p className="text-[13px] leading-relaxed text-muted">Cada acción con efecto (escribir, ejecutar comandos, abrir páginas, lo que te pidió confirmar y lo que Arbrain bloqueó). Queda solo en tu computadora, sin llaves ni contraseñas.</p>
      {error && <p className="mt-2 text-[12.5px] text-red-300">{error}</p>}
      {acciones?.length === 0 && <p className="mt-3 text-[12.5px] text-muted">Todavía nada.</p>}
      {!!acciones?.length && (
        <ol className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {acciones.map(a => {
            const e = ETIQUETA_DECISION[a.decision] ?? { texto: a.decision, tono: 'aviso' as const }
            return (
              <li key={a.id} className="rounded-lg bg-foreground/[0.03] px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                  <time className="tabular-nums text-muted" dateTime={new Date(a.ts).toISOString()}>{horaDe(a.ts)}</time>
                  <span className="font-medium text-foreground/90">{nombreHerramienta(a.herramienta)}</span>
                  {a.origen === 'cron' && <span className="rounded-full bg-foreground/10 px-1.5 text-[10.5px] text-muted">rutina</span>}
                  <span className={`ml-auto ${tono[e.tono]}`}>{e.texto}</span>
                </div>
                <code className="mt-1 block whitespace-pre-wrap break-all text-[11.5px] leading-snug text-foreground/75">{a.que}</code>
                {a.motivo && a.decision !== 'hecho' && <p className="mt-0.5 text-[11.5px] text-muted">{a.motivo}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </Tarjeta>
  )
}

function Freno() {
  const { pausa, ocupado, error, fijar } = usePausa(2_000)
  return (
    <Tarjeta titulo="Pausar todo" icono={OctagonPause}>
      <p className="text-[13px] leading-relaxed text-muted">Detiene en el acto lo que Levy esté haciendo (respuestas, rutinas, comandos) y no deja empezar nada hasta que reanudes. También está abajo a la derecha en toda la app.</p>
      <div className="mt-3 flex items-center gap-3">
        {pausa?.pausado ? (
          <button type="button" onClick={() => void fijar(false)} disabled={ocupado} className="btn-secondary !px-3 !py-2 text-[13px]"><Play className="size-3.5" aria-hidden /> Reanudar</button>
        ) : (
          <button type="button" onClick={() => void fijar(true)} disabled={ocupado || !pausa} className="btn-secondary !border-red-400/40 !px-3 !py-2 text-[13px] text-red-300"><OctagonPause className="size-3.5" aria-hidden /> Pausar todo</button>
        )}
        <span className="text-[12.5px] text-muted" role="status">{pausa ? (pausa.pausado ? `En pausa desde ${pausa.desde ? horaDe(pausa.desde) : 'hace un momento'}.` : 'Levy está activo.') : 'Consultando…'}</span>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
    </Tarjeta>
  )
}

/** Ajustes › Seguridad. */
export function SeccionSeguridad() {
  return (
    <div className="space-y-4">
      <Freno />
      <LoQueHizoLevy />
      <Carpetas />
      <TopeDeGasto />
    </div>
  )
}
