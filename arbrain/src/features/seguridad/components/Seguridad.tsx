'use client'
/**
 * Seguridad del alumno (12 oct 2026; docs/builds/seguridad-alumno-2026-10-12/AUDITORIA.md). Edición cliente.
 *
 *   FrenoGeneral       botón «Pausar todo» siempre a la mano y, en pausa, la franja «Levy está en pausa · Reanudar»
 *                      (con «Volver a que me pregunte» si está en Autónomo). Junto a él, la píldora «Autónomo» con
 *                      «Volver a preguntar» (0.2.15: reemplaza a «Sin freno · Poner»). Y, una vez, la tarjeta de
 *                      migración para quien venía de «Sin preguntar» o del freno quitado, o cuyo texto cambió.
 *   SeccionSeguridad   Ajustes › Permisos y seguridad: el nivel de permisos (Autónomo con su consentimiento, Automático
 *                      en mi carpeta, Preguntar siempre), las carpetas a las que el cerebro puede entrar, el freno,
 *                      «Lo que hizo Levy» (bitácora local) y el tope de gasto.
 *   TopeDeGasto        texto y enlaces para poner un límite de crédito a la llave, y el gasto si el proveedor lo deja
 *                      ver (OpenRouter). Lo usan Ajustes › Llaves (y el primer arranque, que monta ese panel) y Seguridad.
 *
 * Todo pasa por las rutas `/api/seguridad/*` del servidor local, que exigen la cookie de la app y su origen; los
 * secretos los pone ese servidor (reanudar, abrir carpetas y aflojar permisos llevan el de confirmar), nunca el navegador.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReglasSiempre } from '@/features/permisos/components/ReglasSiempre'
import { createPortal } from 'react-dom'
import { ExternalLink, FolderOpen, FolderPlus, Loader2, OctagonPause, Play, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react'
import { abrirEnNavegador } from '@/features/primer-arranque/lib/llaves'
import { CASILLAS_VACIAS, ConsentimientoAutonomia, listoParaAceptar, type Casillas } from './ConsentimientoAutonomia'
import {
  avisoAutonomo, consentimientoVigente, cuerpoAceptacion, ENLACES_TOPE, ETIQUETA_DECISION, FICHAS_MODO, horaDe, NOMBRE_MODO, nombreHerramienta, RED_MINIMA, resumenGasto,
  type AccionBitacora, type CarpetaAbierta, type EstadoPausa, type EstadoPermisosLevy, type ModoPermisos, type RespuestaGasto, type ViaConsentimiento,
} from '../lib/seguridad'
import {
  CLAVE_PREFERENCIA_PAUSA, colocarBotonPausa, dondeEstaPausa, ESQUINAS_PAUSA, escribirPreferenciaPausa, EVENTO_PREFERENCIA_PAUSA, leerPreferenciaPausa,
  SELECTOR_OBSTACULOS_PAUSA, type Caja, type Colocacion, type EsquinaPausa, type PreferenciaPausa,
} from '../lib/boton-pausa'

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

/** Avisa a las otras vistas (Ajustes, la píldora) que el modo cambió. */
const EVENTO_PERMISOS = 'arbrain:permisos'

/** Estado del modo de permisos para toda la app (se consulta cada 10 s y al volver a la ventana). */
function useModoGlobal(cadaMs = 10_000) {
  const [estado, setEstado] = useState<EstadoPermisosLevy | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const leer = useCallback(async () => { try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos')) } catch { /* daemon reiniciando */ } }, [])
  useEffect(() => {
    void leer()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void leer() }, cadaMs)
    const alCambiar = () => void leer()
    window.addEventListener(EVENTO_PERMISOS, alCambiar)
    return () => { window.clearInterval(t); window.removeEventListener(EVENTO_PERMISOS, alCambiar) }
  }, [leer, cadaMs])
  const mandar = useCallback(async (cuerpo: Record<string, unknown>) => {
    setOcupado(true)
    try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos', { method: 'POST', body: JSON.stringify(cuerpo) })); window.dispatchEvent(new Event(EVENTO_PERMISOS)); return true }
    catch { return false }
    finally { setOcupado(false) }
  }, [])
  return { estado, autonomo: estado?.modo === 'autonomo', desde: estado?.consentimiento?.ts ?? null, ocupado, mandar }
}

/** Preferencia del botón «Pausar todo» (esquina y texto), guardada en este navegador y compartida entre Ajustes y el botón. */
function usePreferenciaPausa() {
  const [pref, setPref] = useState<PreferenciaPausa>(() => leerPreferenciaPausa(null))
  useEffect(() => {
    const leer = () => { try { setPref(leerPreferenciaPausa(window.localStorage.getItem(CLAVE_PREFERENCIA_PAUSA))) } catch { /* almacenamiento bloqueado */ } }
    leer()
    const alGuardar = (e: StorageEvent) => { if (e.key === CLAVE_PREFERENCIA_PAUSA) leer() }
    window.addEventListener(EVENTO_PREFERENCIA_PAUSA, leer)
    window.addEventListener('storage', alGuardar)
    return () => { window.removeEventListener(EVENTO_PREFERENCIA_PAUSA, leer); window.removeEventListener('storage', alGuardar) }
  }, [])
  const guardar = useCallback((cambio: Partial<PreferenciaPausa>) => {
    setPref(prev => {
      const texto = escribirPreferenciaPausa({ ...prev, ...cambio })
      try { window.localStorage.setItem(CLAVE_PREFERENCIA_PAUSA, texto) } catch { /* almacenamiento bloqueado: vale para esta sesión */ }
      queueMicrotask(() => window.dispatchEvent(new Event(EVENTO_PREFERENCIA_PAUSA)))
      return leerPreferenciaPausa(texto)
    })
  }, [])
  return { pref, guardar }
}

/** Ancho que se reserva al esquivar: el del botón ya abierto con su texto, para que al pasar el ratón tampoco tape nada. */
const ANCHO_ABIERTO = 128

/** Mide lo que el botón no debe tapar y lo coloca en su esquina sin taparlo (al cambiar el tamaño de la ventana o el campo de escribir). */
function useColocacion(esquina: EsquinaPausa, activo: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<Colocacion | null>(null)
  useEffect(() => {
    if (!activo) return
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const obstaculos: Caja[] = Array.from(document.querySelectorAll(SELECTOR_OBSTACULOS_PAUSA))
        .filter(o => !el.contains(o))
        .map(o => o.getBoundingClientRect())
      const nueva = colocarBotonPausa({ esquina, ancho: Math.max(r.width, ANCHO_ABIERTO), alto: r.height || 32, vw: window.innerWidth, vh: window.innerHeight, obstaculos })
      setPos(prev => (prev && prev.top === nueva.top && prev.bottom === nueva.bottom && prev.left === nueva.left && prev.right === nueva.right ? prev : nueva))
    }
    const pedir = () => { if (!cuadro) cuadro = window.requestAnimationFrame(medir) }
    pedir()
    window.addEventListener('resize', pedir)
    window.visualViewport?.addEventListener('resize', pedir)
    // El campo de escribir crece con el texto y aparece o se va al cambiar de panel: un vistazo barato cada medio segundo.
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') pedir() }, 500)
    return () => {
      window.removeEventListener('resize', pedir)
      window.visualViewport?.removeEventListener('resize', pedir)
      window.clearInterval(t)
      if (cuadro) window.cancelAnimationFrame(cuadro)
    }
  }, [esquina, activo])
  return { ref, pos }
}

/** Botón flotante «Pausar todo», la píldora «Autónomo» y, en pausa, la franja con «Reanudar». */
export function FrenoGeneral() {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const { pausa, ocupado, error, fijar } = usePausa()
  const modo = useModoGlobal()
  const { pref } = usePreferenciaPausa()
  const { ref, pos } = useColocacion(pref.esquina, montado && !!pausa && !pausa.pausado)
  if (!montado || !pausa) return null
  const volver = (via: ViaConsentimiento) => void modo.mandar({ modo: 'carpeta', via })
  const derecha = pref.esquina !== 'abajo-izquierda'
  const arriba = pref.esquina === 'arriba-derecha'
  // Mientras se mide la primera vez, la esquina con su margen de siempre (bottom-3/right-3): nunca se queda sin botón.
  const lugar: React.CSSProperties = pos ?? (arriba ? { top: 56, right: 12 } : derecha ? { bottom: 12, right: 12 } : { bottom: 12, left: 12 })
  return createPortal(
    <>
    {modo.estado && (modo.estado.migracion || modo.estado.reaceptar) && <TarjetaMigracion estado={modo.estado} mandar={modo.mandar} />}
    {pausa.pausado ? (
      <div role="status" aria-live="polite" className="fixed left-1/2 top-14 z-[101] flex max-w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-950/80 px-4 py-2.5 text-[13px] text-amber-50 shadow-lg backdrop-blur-xl">
        <OctagonPause className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0">Levy está en pausa: no corre ningún turno, rutina ni herramienta.{error ? ` ${error}` : ''}</span>
        {modo.autonomo && (
          <button type="button" onClick={() => volver('pausa')} disabled={modo.ocupado} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]" title={avisoAutonomo(modo.desde)}>
            {modo.ocupado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />} Volver a que me pregunte
          </button>
        )}
        <button type="button" onClick={() => void fijar(false)} disabled={ocupado} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">
          {ocupado ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} Reanudar
        </button>
      </div>
    ) : (
      <div ref={ref} style={lugar} data-boton-pausa={pref.esquina}
        className={`fixed z-[95] flex max-w-[calc(100vw-1.5rem)] gap-2 ${arriba ? 'flex-col' : 'flex-col-reverse'} ${derecha ? 'items-end' : 'items-start'}`}>
        <button type="button" onClick={() => void fijar(true)} disabled={ocupado} aria-label="Pausar todo" title="Pausar todo: detiene todo lo que Levy está haciendo y no deja empezar nada hasta que reanudes"
          className={`group flex h-8 min-w-8 items-center justify-center rounded-full border border-border-subtle bg-[var(--glass-bg)] text-[12px] font-medium text-foreground/80 shadow-md backdrop-blur-xl transition-[colors,padding] hover:border-red-400/50 hover:text-red-300 focus-visible:border-red-400/50 focus-visible:text-red-300 focus-visible:outline-2 focus-visible:outline-brand ${pref.conTexto ? 'gap-1.5 px-3' : 'px-2 hover:gap-1.5 hover:px-3 focus-visible:gap-1.5 focus-visible:px-3'}`}>
          {ocupado ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : <OctagonPause className="size-3.5 shrink-0" aria-hidden />}
          <span aria-hidden className={pref.conTexto ? 'whitespace-nowrap' : 'max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-150 group-hover:max-w-[8rem] group-hover:opacity-100 group-focus-visible:max-w-[8rem] group-focus-visible:opacity-100'}>Pausar todo</span>
        </button>
        {modo.autonomo && (
          <div role="status" className="flex max-w-[min(26rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-brand/40 bg-[var(--glass-bg)] py-1 pl-3 pr-1 text-[12px] text-foreground/85 shadow-md backdrop-blur-xl" data-pildora-autonomo>
            <Sparkles className="size-3.5 shrink-0 text-brand-ink" aria-hidden />
            <span className="min-w-0 truncate" title={`${avisoAutonomo(modo.desde)} ${RED_MINIMA}`}>Autónomo</span>
            <button type="button" onClick={() => volver('pildora')} disabled={modo.ocupado} className="btn-secondary shrink-0 !rounded-full !px-2.5 !py-0.5 text-[11.5px]" title="Vuelve a «Automático en mi carpeta» en un clic; tu consentimiento se conserva para regresar cuando quieras">
              {modo.ocupado ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null} Volver a preguntar
            </button>
          </div>
        )}
      </div>
    )}
    </>,
    document.body,
  )
}

/**
 * Quien ya tenía Arbrain (0.2.15): si venía de «Sin preguntar» o del freno quitado, o si el texto de Autónomo cambió de
 * versión, ve esta tarjeta una vez. Decidir después = queda en «Automático en mi carpeta» y no se vuelve a preguntar.
 */
function TarjetaMigracion({ estado, mandar }: { estado: EstadoPermisosLevy; mandar: (c: Record<string, unknown>) => Promise<boolean> }) {
  const [casillas, setCasillas] = useState<Casillas>(CASILLAS_VACIAS)
  const [ocupado, setOcupado] = useState<'aceptar' | 'despues' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!estado.texto) return null
  const porque = estado.reaceptar
    ? 'El texto del modo Autónomo cambió. Para seguir en Autónomo tienes que leer y aceptar la versión nueva; si no, Levy queda en «Automático en mi carpeta».'
    : estado.migracion === 'sinFreno'
      ? 'Tenías «Sin preguntar» con el freno quitado. Esa opción se retiró: ahora existe el modo Autónomo, que hace lo mismo con una red mínima y un texto que aceptas. Mientras decides, Levy está en «Automático en mi carpeta».'
      : 'Tenías «Sin preguntar». Esa opción se retiró: ahora existe el modo Autónomo, que hace lo mismo con una red mínima y un texto que aceptas. Mientras decides, Levy está en «Automático en mi carpeta».'
  const aceptar = async () => {
    setOcupado('aceptar'); setError(null)
    if (!(await mandar(cuerpoAceptacion(estado.texto!, estado.reaceptar ? 'version' : 'migracion')))) setError('No se pudo guardar. Reintenta.')
    setOcupado(null)
  }
  const despues = async () => { setOcupado('despues'); await mandar({ decidirDespues: true }); setOcupado(null) }
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="migracion-titulo" className="glass-panel-strong flex max-h-[calc(100vh-2rem)] w-full max-w-[600px] flex-col gap-4 overflow-y-auto p-5 shadow-2xl" data-tarjeta-migracion>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-ink" aria-hidden><Sparkles className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="migracion-titulo" className="text-[16px] font-semibold leading-snug tracking-tight text-foreground">¿Cómo quieres que trabaje tu cerebro?</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{porque}</p>
          </div>
        </div>
        <ConsentimientoAutonomia texto={estado.texto} marcadas={casillas} onMarcadas={setCasillas} deshabilitado={!!ocupado} />
        {error && <p role="alert" className="text-[12.5px] text-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void despues()} disabled={!!ocupado} className="btn-secondary min-h-11 !px-4">{ocupado === 'despues' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Decidir después'}</button>
          <button type="button" onClick={() => void aceptar()} disabled={!listoParaAceptar(casillas) || !!ocupado} className="btn-primary min-h-11 !px-4">{ocupado === 'aceptar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Empezar en modo autónomo'}</button>
        </div>
      </div>
    </div>
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

/** Estado del modo de permisos, compartido por el aviso de arriba y la tarjeta del modo. */
function usePermisos() {
  const [estado, setEstado] = useState<EstadoPermisosLevy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const leer = useCallback(async () => { try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos')) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer.') } }, [])
  useEffect(() => {
    void leer()
    const alCambiar = () => void leer()
    window.addEventListener(EVENTO_PERMISOS, alCambiar)
    return () => window.removeEventListener(EVENTO_PERMISOS, alCambiar)
  }, [leer])
  const mandar = useCallback(async (cuerpo: Record<string, unknown>) => {
    setError(null)
    try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos', { method: 'POST', body: JSON.stringify(cuerpo) })); window.dispatchEvent(new Event(EVENTO_PERMISOS)); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.'); return false }
  }, [])
  return { estado, error, mandar }
}
type Permisos = ReturnType<typeof usePermisos>

/** Aviso fijo arriba de Permisos y seguridad mientras Autónomo está activo; un clic lo regresa a «carpeta». También los avisos del daemon (Windows sin Python). */
function AvisosArriba({ p }: { p: Permisos }) {
  const [ocupado, setOcupado] = useState(false)
  const e = p.estado
  if (!e) return null
  return (
    <>
      {e.modo === 'autonomo' && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/40 bg-brand/[0.08] px-4 py-3 text-[13px] text-foreground/90">
          <Sparkles className="size-4 shrink-0 text-brand-ink" aria-hidden />
          <span className="min-w-0 flex-1">{avisoAutonomo(e.consentimiento?.ts)} {RED_MINIMA}</span>
          <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); await p.mandar({ modo: 'carpeta', via: 'ajustes' }); setOcupado(false) }} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">
            {ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Volver a preguntar
          </button>
        </div>
      )}
      {(e.avisos ?? []).map(a => (
        <div key={a.id} role="alert" className="rounded-2xl border border-amber-400/50 bg-amber-950/40 px-4 py-3 text-[13px] text-amber-50" data-aviso-permisos={a.id}>
          <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{a.texto}</span></p>
          <p className="mt-1 pl-6 text-[12.5px] text-amber-200">{a.como}</p>
        </div>
      ))}
    </>
  )
}

/**
 * Cuánto pregunta Levy antes de actuar: los tres niveles. Elegir Autónomo abre su texto y sus dos casillas (salvo que el
 * consentimiento vigente ya esté guardado: entonces es un clic). Con consentimiento guardado, se puede retirar.
 */
function ModoDePermisos({ p }: { p: Permisos }) {
  const { estado, error } = p
  const [ocupado, setOcupado] = useState<ModoPermisos | 'retirar' | null>(null)
  const [aceptando, setAceptando] = useState(false)
  const [casillas, setCasillas] = useState<Casillas>(CASILLAS_VACIAS)
  const vigente = !!estado && consentimientoVigente(estado)
  const elegir = async (modo: ModoPermisos) => {
    if (!estado || modo === estado.modo) return
    if (modo === 'autonomo' && !vigente) { setAceptando(true); return }
    setOcupado(modo)
    await p.mandar({ modo, via: 'ajustes' })
    setOcupado(null)
  }
  const aceptar = async () => {
    if (!estado?.texto) return
    setOcupado('autonomo')
    if (await p.mandar(cuerpoAceptacion(estado.texto, 'ajustes'))) { setAceptando(false); setCasillas(CASILLAS_VACIAS) }
    setOcupado(null)
  }
  const retirar = async () => { setOcupado('retirar'); await p.mandar({ retirar: true, via: 'ajustes' }); setOcupado(null) }
  return (
    <Tarjeta titulo="Cuánto te pregunta Levy" icono={ShieldCheck}>
      <div role="radiogroup" aria-label="Nivel de permisos" className="space-y-2">
        {FICHAS_MODO.map(f => {
          const activo = estado?.modo === f.modo
          const abierto = f.modo === 'autonomo' && aceptando && !activo
          return (
            <div key={f.modo}>
              <button type="button" role="radio" aria-checked={activo} disabled={!estado || !!ocupado} onClick={() => void elegir(f.modo)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? 'border-brand/60 bg-brand/10' : 'border-border-subtle hover:border-foreground/25'}`}>
                <span aria-hidden className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border ${activo ? 'border-brand' : 'border-foreground/30'}`}>{activo && <span className="size-1.5 rounded-full bg-brand" />}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">{f.nombre}{f.recomendado && <span className="rounded-full bg-foreground/10 px-1.5 text-[10.5px] font-medium text-muted">recomendado</span>}{ocupado === f.modo && <Loader2 className="size-3 animate-spin" aria-hidden />}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{f.detalle}</span>
                </span>
              </button>
              {abierto && estado?.texto && (
                <div className="mt-2 space-y-3 rounded-xl border border-brand/30 bg-brand/[0.05] p-3">
                  <ConsentimientoAutonomia texto={estado.texto} marcadas={casillas} onMarcadas={setCasillas} deshabilitado={!!ocupado} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => { setAceptando(false); setCasillas(CASILLAS_VACIAS) }} disabled={!!ocupado} className="btn-secondary !px-3 !py-2 text-[13px]">Cancelar</button>
                    <button type="button" onClick={() => void aceptar()} disabled={!listoParaAceptar(casillas) || !!ocupado} className="btn-primary !px-3 !py-2 text-[13px]">{ocupado === 'autonomo' && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Empezar en modo autónomo</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {estado?.consentimiento && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2 text-[12.5px] text-muted" data-consentimiento-guardado>
          <span>
            Aceptaste el modo Autónomo el {horaDe(estado.consentimiento.ts)} (texto {estado.consentimiento.version}{estado.consentimiento.app ? `, Arbrain ${estado.consentimiento.app}` : ''}, por {estado.consentimiento.via}).
            {estado.reaceptar ? ' El texto cambió: vuelve a aceptarlo para seguir en Autónomo.' : ''}
          </span>
          <button type="button" onClick={() => void retirar()} disabled={!!ocupado} className="btn-secondary shrink-0 !px-2.5 !py-1 text-[12px]">{ocupado === 'retirar' && <Loader2 className="size-3 animate-spin" aria-hidden />} Retirar mi consentimiento</button>
        </div>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        <b className="text-foreground/90">En cualquier nivel</b>, mover dinero, comprar y operar valores o cripto nunca se hace; tus llaves, contraseñas, navegadores y carteras nunca se tocan; y Levy no puede cambiar este ajuste: solo tú, aquí. En «{NOMBRE_MODO.preguntar}» y «{NOMBRE_MODO.carpeta}», enviar, borrar y publicar te piden tu clic, y si Levy acaba de leer algo de internet, un correo o un archivo de afuera, vuelve a preguntarte antes de actuar. En «{NOMBRE_MODO.autonomo}» solo queda la red mínima. Las rutinas automáticas corren con tu nivel, pero lo que quieran enviar o publicar sin ti delante queda como borrador en «Mientras no estabas».
      </p>
      {estado && !estado.sandbox && estado.modo === 'autonomo' && <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-300">En esta computadora no hay caja de arena: en Autónomo los comandos corren directo en tu computadora.</p>}
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
    </Tarjeta>
  )
}

/**
 * A13 (0.2.15): su teléfono y su correo. Con ellos, «mándame un WhatsApp a mi número» escribe su número en la búsqueda
 * sin tarjeta, aunque no lo haya dicho en el chat; cualquier otro número que no salió de su mensaje sigue preguntando.
 */
function TusDatos({ p }: { p: Permisos }) {
  const guardado = p.estado?.misDatos
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)
  useEffect(() => { if (guardado) { setTelefono(guardado.telefono); setCorreo(guardado.correo) } }, [guardado?.telefono, guardado?.correo])
  const cambiado = !!guardado && (telefono.replace(/[\s().-]/g, '') !== guardado.telefono || correo.trim().toLowerCase() !== guardado.correo)
  const guardar = async () => { setOcupado(true); setListo(await p.mandar({ misDatos: { telefono, correo } })); setOcupado(false) }
  if (!p.estado) return null
  return (
    <Tarjeta titulo="Tus datos para mandarte mensajes" icono={ShieldCheck}>
      <p className="text-[12.5px] leading-relaxed text-muted">Cuando le pidas «mándame un mensaje a mi número», Levy usa estos sin preguntarte. Un número o correo que no sea tuyo ni salga de tu mensaje te lo sigue enseñando antes.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-muted">Tu teléfono con lada
          <input value={telefono} onChange={e => { setTelefono(e.target.value); setListo(false) }} inputMode="tel" autoComplete="tel" placeholder="+52 443 000 0000" className="input-field mt-1 min-h-10 w-full px-3 text-[13px]" data-mis-datos="telefono" />
        </label>
        <label className="text-[12px] text-muted">Tu correo
          <input value={correo} onChange={e => { setCorreo(e.target.value); setListo(false) }} inputMode="email" autoComplete="email" placeholder="tu@correo.com" className="input-field mt-1 min-h-10 w-full px-3 text-[13px]" data-mis-datos="correo" />
        </label>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {listo && !cambiado && <span className="text-[12px] text-muted" role="status">Guardado</span>}
        <button type="button" onClick={() => void guardar()} disabled={ocupado || !cambiado} className="btn-secondary !px-3 !py-1.5 text-[12.5px]">{ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Guardar</button>
      </div>
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
    <Tarjeta titulo="Carpetas a las que tu cerebro puede entrar" icono={FolderOpen}>
      <p className="text-[13px] leading-relaxed text-muted">
        Levy trabaja dentro de tu cerebro de Arbrain. Si necesita otra carpeta (un proyecto, tus documentos de clientes), agrégala aquí, una por una: podrá leerla sin preguntarte y escribir en ella según el nivel de arriba (en «Preguntar siempre» te pide permiso). Fuera de estas carpetas nunca escribe. Nunca entra a tus llaves, contraseñas, navegadores ni carteras, aunque agregues su carpeta.
      </p>
      <ul className="mt-3 space-y-1.5">
        {carpetas?.length === 0 && <li className="text-[12.5px] text-muted">Ninguna. Levy solo ve tu cerebro.</li>}
        {carpetas?.map(c => (
          <li key={c.ruta} className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.04] px-3 py-2">
            <code className="min-w-0 truncate text-[12px] text-foreground/90" title={c.ruta}>{c.ruta}</code>
            <button type="button" onClick={() => void mandar('cerrar', c.ruta)} disabled={ocupado} className="btn-secondary shrink-0 !px-2.5 !py-1 text-[12px]"><X className="size-3" aria-hidden /> Quitar</button>
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
        <button type="submit" disabled={!ruta.trim() || !seguro || ocupado} className="btn-secondary !px-3 !py-2 text-[13px]"><FolderPlus className="size-3.5" aria-hidden /> Agregar carpeta</button>
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
                {a.motivo && (a.decision !== 'hecho' || a.motivo.startsWith('sin preguntar')) && <p className="mt-0.5 text-[11.5px] text-muted">{a.motivo}</p>}
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
  const { pref, guardar } = usePreferenciaPausa()
  return (
    <Tarjeta titulo="Pausar todo" icono={OctagonPause}>
      <p className="text-[13px] leading-relaxed text-muted" data-donde-pausa>Detiene en el acto lo que Levy esté haciendo (respuestas, rutinas, comandos) y no deja empezar nada hasta que reanudes. También está {dondeEstaPausa(pref)} en toda la app{pref.conTexto ? '' : ', como un ícono pequeño que muestra «Pausar todo» al pasarle el ratón'}.</p>
      <div className="mt-3 flex items-center gap-3">
        {pausa?.pausado ? (
          <button type="button" onClick={() => void fijar(false)} disabled={ocupado} className="btn-secondary !px-3 !py-2 text-[13px]"><Play className="size-3.5" aria-hidden /> Reanudar</button>
        ) : (
          <button type="button" onClick={() => void fijar(true)} disabled={ocupado || !pausa} className="btn-secondary !border-red-400/40 !px-3 !py-2 text-[13px] text-red-300"><OctagonPause className="size-3.5" aria-hidden /> Pausar todo</button>
        )}
        <span className="text-[12.5px] text-muted" role="status">{pausa ? (pausa.pausado ? `En pausa desde ${pausa.desde ? horaDe(pausa.desde) : 'hace un momento'}.` : 'Levy está activo.') : 'Consultando…'}</span>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-muted">Posición del botón Pausar todo
          <select value={pref.esquina} onChange={e => guardar({ esquina: e.target.value as EsquinaPausa })} className="input-field mt-1 min-h-10 w-full px-3 text-[13px]" data-preferencia-pausa="esquina">
            {ESQUINAS_PAUSA.map(e => <option key={e.esquina} value={e.esquina}>{e.nombre[0].toUpperCase() + e.nombre.slice(1)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={pref.conTexto} onChange={e => guardar({ conTexto: e.target.checked })} data-preferencia-pausa="texto" />
          <span>Mostrar con texto</span>
        </label>
      </div>
      <p className="mt-1 text-[12px] text-muted">Se guarda en esta computadora. En pausa, la franja con «Reanudar» siempre se ve completa arriba.</p>
    </Tarjeta>
  )
}

/** Ajustes › Permisos y seguridad. */
export function SeccionSeguridad() {
  const p = usePermisos()
  return (
    <div className="space-y-4">
      <AvisosArriba p={p} />
      <ModoDePermisos p={p} />
      <TusDatos p={p} />
      <ReglasSiempre />
      <Carpetas />
      <Freno />
      <LoQueHizoLevy />
      <TopeDeGasto />
    </div>
  )
}
