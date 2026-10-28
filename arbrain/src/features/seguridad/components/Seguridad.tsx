'use client'
/**
 * Seguridad del alumno (12 oct 2026; docs/builds/seguridad-alumno-2026-10-12/AUDITORIA.md). Edición cliente.
 *
 *   FrenoGeneral       botón «Pausar todo» siempre a la mano y, en pausa, la franja «Levy está en pausa · Reanudar».
 *   SeccionSeguridad   Ajustes › Permisos y seguridad: el modo de permisos (grupal 23 oct 2026) con su interruptor
 *                      «Quitar también el freno (bajo mi responsabilidad)», las carpetas a las que el cerebro puede
 *                      entrar, el freno, «Lo que hizo Levy» (bitácora local) y el tope de gasto. Con el freno quitado,
 *                      aviso arriba de la sección y una píldora junto a «Pausar todo» en toda la app (un clic lo devuelve).
 *   TopeDeGasto        texto y enlaces para poner un límite de crédito a la llave, y el gasto si el proveedor lo deja
 *                      ver (OpenRouter). Lo usan Ajustes › Llaves (y el primer arranque, que monta ese panel) y Seguridad.
 *
 * Todo pasa por las rutas `/api/seguridad/*` del servidor local, que exigen la cookie de la app y su origen; los
 * secretos los pone ese servidor (reanudar y abrir carpetas llevan el de confirmar), nunca el navegador.
 */
import { useCallback, useEffect, useState } from 'react'
import { ReglasSiempre } from '@/features/permisos/components/ReglasSiempre'
import { createPortal } from 'react-dom'
import { ExternalLink, FolderOpen, FolderPlus, Loader2, OctagonPause, Play, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Wallet, X } from 'lucide-react'
import { abrirEnNavegador } from '@/features/primer-arranque/lib/llaves'
import {
  avisoSinFreno, ENLACES_TOPE, ETIQUETA_DECISION, FICHAS_MODO, FRASE_SIN_FRENO, fraseCoincide, horaDe, NOMBRE_SIN_FRENO, nombreHerramienta, resumenGasto, RIESGO_SIN_FRENO,
  type AccionBitacora, type CarpetaAbierta, type EstadoPausa, type EstadoPermisosLevy, type ModoPermisos, type RespuestaGasto,
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
  const sinFreno = useSinFrenoGlobal()
  if (!montado || !pausa) return null
  return createPortal(
    <>
    {sinFreno.activo && !pausa.pausado && (
      <div role="status" className="fixed bottom-12 right-3 z-[95] flex max-w-[min(26rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-amber-400/50 bg-amber-950/85 py-1 pl-3 pr-1 text-[12px] text-amber-50 shadow-md backdrop-blur-xl">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate" title={avisoSinFreno(sinFreno.desde)}>Freno quitado: envía, borra y publica sin preguntarte</span>
        <button type="button" onClick={() => void sinFreno.devolver()} disabled={sinFreno.ocupado} className="btn-secondary shrink-0 !rounded-full !px-2.5 !py-0.5 text-[11.5px]">
          {sinFreno.ocupado ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null} Poner el freno
        </button>
      </div>
    )}
    {pausa.pausado ? (
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
    )}
    </>,
    document.body,
  )
}

/** Estado del freno quitado para la píldora de toda la app (se consulta cada 10 s y al volver a la ventana). */
function useSinFrenoGlobal(cadaMs = 10_000) {
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
  const devolver = useCallback(async () => {
    setOcupado(true)
    try { setEstado(await pedir<EstadoPermisosLevy>('/api/seguridad/permisos', { method: 'POST', body: JSON.stringify({ sinFreno: false }) })); window.dispatchEvent(new Event(EVENTO_PERMISOS)) }
    catch { /* se reintenta en la próxima lectura */ }
    finally { setOcupado(false) }
  }, [])
  return { activo: !!estado?.sinFreno, desde: estado?.sinFrenoDesde ?? null, ocupado, devolver }
}

/** Avisa a las otras vistas (Ajustes, la píldora) que el modo o el freno cambiaron. */
const EVENTO_PERMISOS = 'arbrain:permisos'

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

/** Aviso fijo arriba de Permisos y seguridad mientras el freno está quitado; un clic lo devuelve. */
function AvisoSinFreno({ p }: { p: Permisos }) {
  const [ocupado, setOcupado] = useState(false)
  if (!p.estado?.sinFreno) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-950/40 px-4 py-3 text-[13px] text-amber-50">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{avisoSinFreno(p.estado.sinFrenoDesde)} Dinero, valores y secretos siguen bloqueados.</span>
      <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); await p.mandar({ sinFreno: false }); setOcupado(false) }} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">
        {ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Volver a poner el freno
      </button>
    </div>
  )
}

/**
 * «Quitar también el freno (bajo mi responsabilidad)»: solo dentro de «Sin preguntar». Muestra el riesgo en dos líneas
 * y pide escribir la frase exacta; el daemon la vuelve a validar. Apagarlo es un clic.
 */
function QuitarFreno({ p }: { p: Permisos }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const e = p.estado
  if (!e || e.modo !== 'libre') return null
  const frase = e.frase || FRASE_SIN_FRENO
  const activar = async () => { setOcupado(true); if (await p.mandar({ sinFreno: true, frase: texto })) { setTexto(''); setAbierto(false) } setOcupado(false) }
  const apagar = async () => { setOcupado(true); await p.mandar({ sinFreno: false }); setOcupado(false) }
  return (
    <div className={`mt-3 rounded-xl border px-3 py-2.5 ${e.sinFreno ? 'border-amber-400/50 bg-amber-950/30' : 'border-border-subtle'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><ShieldAlert className={`size-4 ${e.sinFreno ? 'text-amber-300' : 'text-muted'}`} aria-hidden /> {NOMBRE_SIN_FRENO}</span>
        {e.sinFreno ? (
          <button type="button" role="switch" aria-checked="true" onClick={() => void apagar()} disabled={ocupado} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">{ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Apagar</button>
        ) : (
          <button type="button" role="switch" aria-checked="false" aria-expanded={abierto} onClick={() => setAbierto(a => !a)} className="btn-secondary shrink-0 !px-3 !py-1.5 text-[12.5px]">{abierto ? 'Cancelar' : 'Activar…'}</button>
        )}
      </div>
      {e.sinFreno && <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-200">{avisoSinFreno(e.sinFrenoDesde)} Si cambias de modo se apaga solo.</p>}
      {!e.sinFreno && !abierto && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Opcional. Enviar, borrar y publicar dejarían de pedirte clic. No lo recomendamos salvo que revises seguido «Lo que hizo Levy».</p>}
      {!e.sinFreno && abierto && (
        <form className="mt-2 space-y-2" onSubmit={(ev) => { ev.preventDefault(); if (fraseCoincide(texto, frase)) void activar() }}>
          <div className="rounded-lg bg-red-950/30 px-3 py-2 text-[12.5px] leading-relaxed text-red-100">
            <p>{RIESGO_SIN_FRENO[0]}</p>
            <p className="mt-1">{RIESGO_SIN_FRENO[1]}</p>
          </div>
          <label className="block text-[12.5px] text-muted">Para activarlo escribe: <b className="select-all text-foreground/90">{frase}</b>
            <input value={texto} onChange={(ev) => setTexto(ev.target.value)} className="input-field mt-1 min-h-10 w-full px-3 text-[13px]" spellCheck={false} autoComplete="off" aria-label="Frase de confirmación" />
          </label>
          <button type="submit" disabled={!fraseCoincide(texto, frase) || ocupado} className="btn-secondary !border-amber-400/50 !px-3 !py-2 text-[13px] text-amber-200">{ocupado && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Quitar el freno bajo mi responsabilidad</button>
        </form>
      )}
    </div>
  )
}

/** Cuánto pregunta Levy antes de actuar. El freno (enviar, borrar, publicar, pagar) no depende del modo. */
function ModoDePermisos({ p }: { p: Permisos }) {
  const { estado, error } = p
  const [ocupado, setOcupado] = useState<ModoPermisos | null>(null)
  const elegir = async (modo: ModoPermisos) => {
    if (modo === estado?.modo) return
    setOcupado(modo)
    await p.mandar({ modo })
    setOcupado(null)
  }
  return (
    <Tarjeta titulo="Cuánto te pregunta Levy" icono={ShieldCheck}>
      <div role="radiogroup" aria-label="Modo de permisos" className="space-y-2">
        {FICHAS_MODO.map(f => {
          const activo = estado?.modo === f.modo
          return (
            <button key={f.modo} type="button" role="radio" aria-checked={activo} disabled={!estado || !!ocupado} onClick={() => void elegir(f.modo)}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${activo ? 'border-brand/60 bg-brand/10' : 'border-border-subtle hover:border-foreground/25'}`}>
              <span aria-hidden className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border ${activo ? 'border-brand' : 'border-foreground/30'}`}>{activo && <span className="size-1.5 rounded-full bg-brand" />}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">{f.nombre}{f.recomendado && <span className="rounded-full bg-foreground/10 px-1.5 text-[10.5px] font-medium text-muted">recomendado</span>}{ocupado === f.modo && <Loader2 className="size-3 animate-spin" aria-hidden />}</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{f.detalle}</span>
              </span>
            </button>
          )
        })}
      </div>
      <QuitarFreno p={p} />
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        <b className="text-foreground/90">En cualquier modo</b>, enviar, borrar, publicar o pagar te pide tu clic (salvo que dentro de «Sin preguntar» quites el freno: entonces enviar, borrar y publicar ya no); mover dinero, comprar y operar valores o cripto nunca se hace; tus llaves, contraseñas, navegadores y carteras nunca se tocan; y si Levy acaba de leer algo de internet, un correo o un archivo de afuera, vuelve a preguntarte antes de actuar. Las rutinas automáticas nunca actúan sin ti: solas solo escriben sus reportes y el resumen de tu día; lo que necesite tu clic queda pendiente en la app y la rutina sigue con lo demás. Levy no puede cambiar este ajuste: solo tú, aquí.
      </p>
      {estado && !estado.sandbox && estado.modo === 'libre' && <p className="mt-2 text-[12.5px] text-amber-300">En esta computadora los comandos de Levy no corren en una caja aislada: en «Sin preguntar» se ejecutan directamente.</p>}
      {error && <p className="mt-2 text-[12.5px] text-red-300" role="alert">{error}</p>}
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
        Levy trabaja dentro de tu cerebro de Arbrain. Si necesita otra carpeta (un proyecto, tus documentos de clientes), agrégala aquí, una por una: podrá leerla sin preguntarte y escribir en ella según el modo de arriba (en «Preguntar siempre» te pide permiso). Fuera de estas carpetas nunca escribe. Nunca entra a tus llaves, contraseñas, navegadores ni carteras, aunque agregues su carpeta.
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

/** Ajustes › Permisos y seguridad. */
export function SeccionSeguridad() {
  const p = usePermisos()
  return (
    <div className="space-y-4">
      <AvisoSinFreno p={p} />
      <ModoDePermisos p={p} />
      <ReglasSiempre />
      <Carpetas />
      <Freno />
      <LoQueHizoLevy />
      <TopeDeGasto />
    </div>
  )
}
