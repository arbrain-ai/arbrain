'use client'
/**
 * Traer tus llaves (BYOK). Lo usan el primer arranque y Ajustes › Llaves (11 oct 2026).
 * La llave va del campo al llavero del sistema por la app (`llave_guardar`); la pantalla solo vuelve a ver si existe y
 * su vista enmascarada. «Probar conexión» corre un turno mínimo en tu daemon con la llave que ya tiene.
 *
 * v1.1 (12 oct 2026, A/B del primer arranque › EL gap): el camino principal es «Conectar con OpenRouter» en un clic
 * (OAuth PKCE: el navegador del sistema, inicias sesión, autorizas y vuelves; la llave llega sola al llavero). Pegar
 * una llave de OpenRouter o de Anthropic queda plegado en «Otras formas». Si la prueba dice que la cuenta no tiene
 * saldo, el siguiente paso es recargar, con el enlace directo.
 *
 * 12 oct 2026 (decisión del autor): se quitó la opción del token de la suscripción de claude.ai. Arbrain no pide, captura ni guarda
 * tokens de claude.ai; si alguien pega uno, la validación lo rechaza (`esTokenDeSuscripcion`).
 *
 * A/B ronda 2 (12 oct): el resultado de la prueba viaja a todo el arranque (`usePruebaConexion`, que el primer arranque
 * comparte con este panel): «Continuar sin crédito» y «Conectado, falta crédito» en «Listo». Al volver a la ventana
 * tras «Recargar», la prueba se repite sola (`useReprobarAlVolver`). Red team OAuth: si OpenRouter vuelve sin
 * respuesta, a los 20 s se pregunta «¿Cancelaste en OpenRouter?» con «Reintentar»; al conectar se dice con qué llave.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldCheck, Terminal, Trash2, TriangleAlert, Zap } from 'lucide-react'
import {
  abrirEnNavegador, AVISO_SIN_RESPUESTA_MS, conectarOpenRouter, elegirMotor, esperarDaemon, estadoSuscripcion, hayApp, INSTALAR_CLAUDE,
  llaveBorrar, llaveGuardar, llavesEstado, NOMBRE_ALMACEN, nombrePlan, PAUSA_REPROBAR_MS, probarConexion, quienCobra, RECARGAR,
  reprobarAlVolver, textoConectado, validarLlave, type EstadoLlaves, type EstadoSuscripcion, type NombreLlave, type PruebaLlave,
} from '../lib/llaves'
import { TopeDeGasto } from '@/features/seguridad/components/Seguridad'

type Modo = 'openrouter' | 'api'

/**
 * «Otras formas» (v1.1: plegadas debajo de «Conectar con OpenRouter»). Cualquiera desbloquea el chat (decisión del
 * 11 oct: con solo OpenRouter, el daemon usa su endpoint compatible con Anthropic).
 */
const OPCIONES: Record<Modo, { titulo: string; resumen: string; etiqueta?: string; pasos: string[]; placeholder: string; tipo: 'claude' | 'openrouter'; nombre: NombreLlave }> = {
  openrouter: {
    titulo: 'Pegar una llave de OpenRouter', resumen: 'Si ya tienes una llave «sk-or-» creada a mano.',
    pasos: [
      'Entra a openrouter.ai, crea tu cuenta y agrega crédito.',
      'Ve a «Keys» y crea una llave nueva. Ponle un nombre como «Arbrain».',
      'Cópiala y pégala aquí. Empieza con «sk-or-».',
    ],
    placeholder: 'sk-or-v1-…', tipo: 'openrouter', nombre: 'OPENROUTER_API_KEY',
  },
  api: {
    titulo: 'API key de Anthropic', resumen: 'Directo con Anthropic; pagas solo lo que usas.',
    pasos: [
      'Entra a console.anthropic.com e inicia sesión (o crea tu cuenta).',
      'Ve a «API keys» y crea una nueva. Ponle un nombre como «Arbrain».',
      'Cópiala y pégala aquí. Empieza con «sk-ant-».',
    ],
    placeholder: 'sk-ant-api03-…', tipo: 'claude', nombre: 'ANTHROPIC_API_KEY',
  },
}
const ORDEN: Modo[] = ['openrouter', 'api']

function useLlaves() {
  const [estado, setEstado] = useState<EstadoLlaves | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    if (!hayApp()) return
    try { setEstado(await llavesEstado()); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'No pude leer el llavero.') }
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  return { estado, setEstado, error, setError, recargar }
}

const llaveDe = (e: EstadoLlaves | null, n: NombreLlave) => e?.llaves.find(l => l.nombre === n)
/** Cualquiera de las dos llaves basta para que Levy hable. */
export const hayConQueHablar = (e: EstadoLlaves | null) => !!e && (e.listo || ORDEN.some(m => llaveDe(e, OPCIONES[m].nombre)?.presente))

export interface PruebaConexion {
  prueba: PruebaLlave | null
  setPrueba: (p: PruebaLlave | null) => void
  probando: boolean
  /** Corre la prueba (una a la vez) y devuelve su resultado. Mientras prueba, el resultado anterior sigue a la vista. */
  probar: () => Promise<PruebaLlave | null>
}

/** La prueba de la llave como estado compartible: el primer arranque la crea y la pasa al panel y a «Listo». */
export function usePruebaConexion(): PruebaConexion {
  const [prueba, setPrueba] = useState<PruebaLlave | null>(null)
  const [probando, setProbando] = useState(false)
  const enCurso = useRef<Promise<PruebaLlave | null> | null>(null)
  const probar = useCallback(() => {
    if (enCurso.current) return enCurso.current
    setProbando(true)
    const p = (async () => {
      try { await esperarDaemon(20_000); const r = await probarConexion(); setPrueba(r); return r } finally { setProbando(false); enCurso.current = null }
    })()
    enCurso.current = p
    return p
  }, [])
  return { prueba, setPrueba, probando, probar }
}

/** Al volver a la ventana (foco o pestaña visible) repite la prueba sola, si `activo`. Sin «Ya recargué» obligatorio. */
export function useReprobarAlVolver(activo: boolean, probar: () => unknown) {
  useEffect(() => {
    if (!activo || typeof window === 'undefined') return
    let ultimo = 0
    const alVolver = () => {
      if (document.visibilityState === 'hidden') return
      const t = Date.now()
      if (t - ultimo < PAUSA_REPROBAR_MS) return
      ultimo = t
      void probar()
    }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => { window.removeEventListener('focus', alVolver); document.removeEventListener('visibilitychange', alVolver) }
  }, [activo, probar])
}

export interface EstadoPanel { listo: boolean; cobra: 'openrouter' | 'anthropic'; motor?: 'suscripcion' | 'llave' }

/** ¿Hay Claude Code con sesión de suscripción y cuál motor usa el chat? (GET /api/llaves/suscripcion) */
function useSuscripcion() {
  const [estado, setEstado] = useState<EstadoSuscripcion | null>(null)
  const [buscando, setBuscando] = useState(false)
  const recargar = useCallback(async (fresco = false) => {
    setBuscando(true)
    try { setEstado(await estadoSuscripcion(fresco)) } finally { setBuscando(false) }
  }, [])
  useEffect(() => { void recargar() }, [recargar])
  return { estado, buscando, recargar }
}

/**
 * `onEstado({ listo, cobra })` cuando cambia si hay con qué hablar y a quién se recarga (primer arranque).
 * `control`: la prueba compartida con quien lo monta; sin ella, el panel usa la suya (Ajustes › Llaves).
 */
export function PanelLlaves({ onEstado, compacto = false, control }: { onEstado?: (e: EstadoPanel) => void; compacto?: boolean; control?: PruebaConexion }) {
  const app = typeof window !== 'undefined' && hayApp()
  const { estado, setEstado, error, setError } = useLlaves()
  const [modo, setModo] = useState<Modo>('openrouter')
  const propia = usePruebaConexion()
  const { prueba, setPrueba, probando, probar } = control ?? propia
  const [conectada, setConectada] = useState<string | null>(null)
  const sub = useSuscripcion()
  const conSuscripcion = !!sub.estado?.activo
  const conLlave = hayConQueHablar(estado)
  const listo = conLlave || conSuscripcion
  const guardadas = ORDEN.filter(m => llaveDe(estado, OPCIONES[m].nombre)?.presente)
  // El chat usa Anthropic antes que OpenRouter (CONTRATO-DAEMON § OPENROUTER_API_KEY): la recarga va a quien cobra.
  const cobra = quienCobra(estado)

  useEffect(() => { onEstado?.({ listo, cobra, motor: conSuscripcion ? 'suscripcion' : 'llave' }) }, [listo, cobra, conSuscripcion, onEstado])
  useReprobarAlVolver(app && listo && reprobarAlVolver(prueba), probar)

  if (!app) {
    return <Aviso tono="info">Las llaves se guardan desde la app de Arbrain, en el llavero de tu sistema. Ábrela para continuar; este navegador no puede guardarlas.</Aviso>
  }
  if (estado && !estado.disponible) {
    return <Aviso tono="alerta">Tu sistema no tiene un llavero disponible{estado.error ? ` (${estado.error})` : ''}. En Linux instala GNOME Keyring o KWallet y vuelve a abrir Arbrain. Por seguridad, Arbrain no guarda llaves en archivos.</Aviso>
  }
  const almacen = NOMBRE_ALMACEN[estado?.almacen ?? ''] ?? 'el llavero de tu sistema'
  const actual = OPCIONES[modo]
  const conOpenRouter = !!llaveDe(estado, 'OPENROUTER_API_KEY')?.presente
  const alGuardar = (e: EstadoLlaves) => { setEstado(e); setPrueba(null); void probar() }

  return (
    <div className="space-y-4">
      {!compacto && (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
          <span>{estado?.almacen === 'archivo-local'
            ? <>Se guardan en {almacen} (solo tu usuario lo lee y los agentes no tienen acceso), nunca en esta pantalla. Arbrain solo las usa para hablar con el modelo en tu nombre.</>
            : <>Se guardan en {almacen}, nunca en un archivo ni en esta pantalla. Arbrain solo las usa para hablar con el modelo en tu nombre.</>}</span>
        </p>
      )}

      <MiClaudeCode sub={sub.estado} buscando={sub.buscando} onRecargar={sub.recargar} prueba={conSuscripcion ? prueba : null} probando={probando}
        onProbar={probar} onCambio={() => { setPrueba(null); void sub.recargar(true).then(() => probar()) }} onError={setError} />

      {guardadas.length > 0 && (
        <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Llaves guardadas">
          <ul className="space-y-2">
            {guardadas.map(m => (
              <li key={m} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-[13.5px] font-medium text-foreground">{m === 'openrouter' ? 'Cuenta de OpenRouter' : OPCIONES[m].titulo}</span>
                <span className="flex items-center gap-1.5">
                  <EstadoGuardada vista={llaveDe(estado, OPCIONES[m].nombre)?.vista ?? null} />
                  <BotonQuitar nombre={OPCIONES[m].nombre} onHecho={(e) => { setEstado(e); setPrueba(null); if (m === 'openrouter') setConectada(null) }} onError={setError} />
                </span>
              </li>
            ))}
          </ul>
          {conectada && conOpenRouter && <p className="mt-2 flex items-center gap-2 text-[13px] text-foreground/90" role="status"><Check className="size-4 shrink-0 text-success" aria-hidden /> {conectada}</p>}
          {!conSuscripcion && <button type="button" className="btn-secondary mt-3 !px-3 !py-2 text-[13px]" onClick={probar} disabled={probando}>
            {probando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} Probar conexión
          </button>}
          {probando && !conSuscripcion && <p className="mt-2 text-[12.5px] text-muted" role="status">Probando con un mensaje corto al modelo…</p>}
          {prueba && !conSuscripcion && <ResultadoPrueba prueba={prueba} cobra={cobra} onReintentar={probar} probando={probando} />}
          {conSuscripcion && <p className="mt-2 text-[12.5px] text-muted">Guardada, pero sin usar: Levy habla con tu Claude Code.</p>}
        </section>
      )}

      {!conOpenRouter && <ConectarOpenRouter principal={!listo && !sub.estado?.sesion} onGuardada={(e, texto) => { setConectada(texto); alGuardar(e) }} onError={setError} />}

      <details className="group rounded-2xl border border-border-subtle bg-surface/70">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13.5px] font-medium text-foreground/90 [&::-webkit-details-marker]:hidden">
          <span>Otras formas de conectar <span className="font-normal text-muted">(pegar una llave)</span></span>
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <div role="radiogroup" aria-label="Otra forma de conectar" className="grid gap-2">
            {ORDEN.map(m => {
              const o = OPCIONES[m], activa = modo === m, ya = guardadas.includes(m)
              return (
                <button key={m} type="button" role="radio" aria-checked={activa} onClick={() => setModo(m)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${activa ? 'border-brand/60 bg-brand/[0.07]' : 'border-border-subtle hover:bg-foreground/[0.03]'}`}>
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${activa ? 'border-brand bg-brand' : 'border-foreground/25'}`} aria-hidden>{activa && <span className="size-1.5 rounded-full bg-white" />}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">{o.titulo}
                      {o.etiqueta && <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">{o.etiqueta}</span>}
                      {ya && <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">Guardada</span>}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{o.resumen}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {guardadas.includes(modo) ? (
            <p className="mt-3 text-[12.5px] text-muted">Ya tienes esta llave guardada. Para cambiarla, quítala arriba y pega la nueva.</p>
          ) : <>
            <ol className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-muted">
              {actual.pasos.map((p, i) => (
                <li key={i} className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{i + 1}</span><span>{p}</span></li>
              ))}
            </ol>
            <CampoLlave key={modo} placeholder={actual.placeholder} etiqueta={actual.titulo} tipo={actual.tipo}
              onGuardada={alGuardar} onError={setError} />
          </>}
        </div>
      </details>

      {/* Seguridad del alumno (12 oct 2026): tope de gasto de la llave, en el primer arranque y en Ajustes › Llaves. */}
      {conLlave && !conSuscripcion && <TopeDeGasto compacto={compacto} />}

      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}

/**
 * «Mi Claude Code» (21 oct 2026): si ya pagas Claude Pro o Max, Levy habla con TU Claude Code, con la sesión que
 * iniciaste en tu terminal. Arbrain no pide, ve ni guarda ningún token (el login es el de Anthropic, en tu terminal) y
 * no le pasa ninguna llave de API, así que no se cobra aparte. Con sesión detectada es la opción recomendada; sin ella,
 * los pasos para instalar e iniciar sesión, plegados para quien no tiene plan.
 */
function MiClaudeCode({ sub, buscando, onRecargar, prueba, probando, onProbar, onCambio, onError }: {
  sub: EstadoSuscripcion | null; buscando: boolean; onRecargar: (fresco?: boolean) => Promise<void>
  prueba: PruebaLlave | null; probando: boolean; onProbar: () => unknown; onCambio: () => void; onError: (m: string | null) => void
}) {
  const [cambiando, setCambiando] = useState(false)
  const [reintentado, setReintentado] = useState(false)
  if (!sub) return null // daemon sin esta función (versión anterior) o navegador sin app
  const plan = nombrePlan(sub.plan)
  const cambiar = async (motor: 'suscripcion' | 'llave') => {
    setCambiando(true); onError(null)
    try { await elegirMotor(motor); onCambio() } catch (e) { onError(e instanceof Error ? e.message : 'No pude cambiar con qué habla Levy.'); void onRecargar(true) } finally { setCambiando(false) }
  }
  const privacidad = <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Arbrain no ve ni guarda tu sesión: la abre tu propio Claude Code. Tampoco le pasa llaves de API, aunque tengas <code className="font-mono">ANTHROPIC_API_KEY</code> en tu sistema: así usa tu plan y no te cobra aparte. Las rutinas automáticas no corren con tu plan.</p>

  if (sub.activo) {
    return (
      <section className="rounded-2xl border border-brand/40 bg-brand/[0.06] p-4" aria-label="Mi Claude Code">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground"><Terminal className="size-4 text-brand-ink" aria-hidden /> Mi Claude Code
          <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">En uso</span></h3>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">Levy habla con tu Claude Code{plan ? ` y tu plan ${plan}` : ' y tu suscripción'}.</p>
        {!sub.sesion && <Aviso tono="alerta" className="mt-3">{sub.mensaje ?? 'Tu Claude Code no tiene la sesión iniciada.'}</Aviso>}
        {privacidad}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2 text-[13px]" onClick={() => void onProbar()} disabled={probando}>
            {probando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} Probar conexión
          </button>
          {!sub.sesion && <button type="button" className="btn-secondary !px-3 !py-2 text-[13px]" onClick={() => void onRecargar(true)} disabled={buscando}>
            {buscando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />} Ya inicié sesión
          </button>}
          <button type="button" className="min-h-10 rounded-lg px-3 text-[13px] text-muted hover:bg-foreground/[0.06] hover:text-foreground" onClick={() => void cambiar('llave')} disabled={cambiando}>
            {cambiando ? 'Cambiando…' : 'Usar una llave en su lugar'}
          </button>
        </div>
        {probando && <p className="mt-2 text-[12.5px] text-muted" role="status">Probando con un mensaje corto a tu Claude Code…</p>}
        {prueba && (prueba.ok
          ? <p className="mt-3 flex items-center gap-2 text-[13px] text-success" role="status"><Check className="size-4" aria-hidden /> Conexión lista: tu Claude Code respondió{prueba.ms ? ` en ${(prueba.ms / 1000).toFixed(1)} s` : ''}.</p>
          : <Aviso tono="alerta" className="mt-3">{(prueba.code && MENSAJE_PRUEBA[prueba.code]) || prueba.error || 'No pude probar la conexión.'}</Aviso>)}
      </section>
    )
  }

  if (sub.sesion) {
    return (
      <section className="rounded-2xl border border-brand/40 bg-brand/[0.06] p-4" aria-label="Mi Claude Code">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground"><Terminal className="size-4 text-brand-ink" aria-hidden /> Usa tu Claude Code
          <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand-ink">Recomendado si tienes Pro o Max</span></h3>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">Encontré tu Claude Code con tu sesión iniciada{plan ? ` (plan ${plan})` : ''}. Levy puede hablar con él y usar lo que ya pagas, sin llaves.</p>
        {privacidad}
        <button type="button" className="btn-primary mt-3 min-h-11 w-full justify-center !px-5 text-[14.5px] sm:w-auto" onClick={() => void cambiar('suscripcion')} disabled={cambiando}>
          {cambiando ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Conectando…</> : <><Terminal className="size-4" aria-hidden /> Usar mi Claude Code</>}
        </button>
      </section>
    )
  }

  return (
    <details className="group rounded-2xl border border-border-subtle bg-surface/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13.5px] font-medium text-foreground/90 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Terminal className="size-4 text-brand-ink" aria-hidden /> ¿Ya pagas Claude Pro o Max? <span className="font-normal text-muted">Usa tu Claude Code</span></span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4">
        {sub.code === 'otra_via' && sub.mensaje && <Aviso tono="alerta" className="mb-3">{sub.mensaje}</Aviso>}
        <ol className="space-y-2 text-[13px] leading-relaxed text-muted">
          {!sub.instalado && (
            <li className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">1</span>
              <span>Instala Claude Code. En la terminal (macOS o Linux): <code className="block select-all break-all rounded-lg bg-foreground/[0.06] px-2 py-1 font-mono text-[12px] text-foreground">{INSTALAR_CLAUDE.unix}</code>
                En Windows (PowerShell): <code className="block select-all break-all rounded-lg bg-foreground/[0.06] px-2 py-1 font-mono text-[12px] text-foreground">{INSTALAR_CLAUDE.windows}</code></span></li>
          )}
          <li className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{sub.instalado ? 1 : 2}</span>
            <span>Abre una terminal, escribe <code className="font-mono text-foreground">claude</code> e inicia sesión con tu cuenta de Claude (Pro o Max). El inicio de sesión es de Anthropic: Arbrain no lo ve.</span></li>
          <li className="flex gap-2"><span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{sub.instalado ? 2 : 3}</span>
            <span>Vuelve aquí y pulsa «Ya inicié sesión».</span></li>
        </ol>
        <button type="button" className="btn-secondary mt-3 min-h-10 !px-3 text-[13px]" onClick={() => { setReintentado(true); void onRecargar(true) }} disabled={buscando}>
          {buscando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />} Ya inicié sesión
        </button>
        {reintentado && !buscando && sub.code && sub.code !== 'otra_via' && <p className="mt-2 text-[12.5px] text-muted" role="status">{sub.instalado ? 'Todavía no veo tu sesión.' : 'Todavía no encuentro Claude Code en esta computadora.'}</p>}
      </div>
    </details>
  )
}

/**
 * El botón principal: OAuth PKCE con OpenRouter. El navegador del sistema hace el login; la llave vuelve por el
 * servidor local (una sola vez) y va directo al llavero. La persona nunca ve, copia ni pega un «sk-or-».
 */
function ConectarOpenRouter({ principal, onGuardada, onError }: { principal: boolean; onGuardada: (e: EstadoLlaves, conectado: string) => void; onError: (m: string | null) => void }) {
  const [fase, setFase] = useState<'inicio' | 'esperando' | 'guardando'>('inicio')
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [sinRespuesta, setSinRespuesta] = useState(false)
  const control = useRef<AbortController | null>(null)
  useEffect(() => () => control.current?.abort(), [])
  // Red team OAuth, B2: si la persona dijo «no» en OpenRouter y el regreso no llegó a esta app, no se espera 10 min
  // en silencio: a los 20 s se pregunta y se ofrece reintentar.
  useEffect(() => {
    setSinRespuesta(false)
    if (fase !== 'esperando') return
    const t = setTimeout(() => setSinRespuesta(true), AVISO_SIN_RESPUESTA_MS)
    return () => clearTimeout(t)
  }, [fase, url])

  const conectar = async () => {
    control.current?.abort()
    const c = new AbortController(); control.current = c
    setFallo(null); onError(null); setUrl(null); setFase('esperando')
    const r = await conectarOpenRouter({ abrir: abrirEnNavegador, senal: c.signal, alAbrir: setUrl })
    if (!r.ok) { if (control.current === c) setFase('inicio'); if (r.code !== 'cancelado') setFallo(r.error); return }
    setFase('guardando')
    try {
      if (!validarLlave(r.llave, 'openrouter').ok) throw new Error('OpenRouter entregó una llave con un formato inesperado. Prueba con «Otras formas».')
      const conectado = textoConectado(r.llave)
      onGuardada(await llaveGuardar('OPENROUTER_API_KEY', r.llave), conectado)
    } catch (e) { setFallo(e instanceof Error ? e.message : 'No pude guardar la llave en el llavero.') } finally { setFase('inicio') }
  }

  return (
    <section className={`rounded-2xl border p-4 ${principal ? 'border-brand/40 bg-brand/[0.06]' : 'border-border-subtle bg-surface/70'}`} aria-label="Conectar con OpenRouter">
      <h3 className="text-sm font-semibold text-foreground">Conecta tu cuenta de OpenRouter</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">Un clic: se abre tu navegador, inicias sesión o creas tu cuenta, autorizas y vuelves. Sin copiar ni pegar llaves. Con esa cuenta Levy habla con Claude y con otros modelos; pagas lo que usas.</p>
      {fase === 'esperando' ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-[13.5px] text-foreground"><Loader2 className="size-4 animate-spin text-brand-ink" aria-hidden /> Esperando a que autorices en tu navegador…</p>
          {sinRespuesta && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              ¿Cancelaste en OpenRouter?
              <button type="button" className="btn-secondary min-h-9 !px-3 text-[13px]" onClick={() => void conectar()}><RefreshCw className="size-3.5" aria-hidden /> Reintentar</button>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {url && <button type="button" className="btn-secondary min-h-10 !px-3 text-[13px]" onClick={() => { void abrirEnNavegador(url).catch(() => {}) }}><ExternalLink className="size-3.5" aria-hidden /> Abrir de nuevo</button>}
            <button type="button" className="min-h-10 rounded-lg px-3 text-[13px] text-muted hover:bg-foreground/[0.06] hover:text-foreground" onClick={() => { control.current?.abort(); setFase('inicio') }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${principal ? 'btn-primary' : 'btn-secondary'} mt-3 min-h-11 w-full justify-center !px-5 text-[14.5px] sm:w-auto`} onClick={() => void conectar()} disabled={fase === 'guardando'}>
          {fase === 'guardando' ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Guardando en el llavero…</> : <><ExternalLink className="size-4" aria-hidden /> Conectar con OpenRouter</>}
        </button>
      )}
      {fallo && <Aviso tono="alerta" className="mt-3">{fallo}</Aviso>}
    </section>
  )
}

function CampoLlave({ placeholder, etiqueta, tipo, onGuardada, onError }: { placeholder: string; etiqueta: string; tipo: 'claude' | 'openrouter'; onGuardada: (e: EstadoLlaves) => void; onError: (m: string | null) => void }) {
  const [valor, setValor] = useState('')
  const [ver, setVer] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const veredicto = valor ? validarLlave(valor, tipo) : null
  const guardar = async () => {
    setTocado(true)
    const v = validarLlave(valor, tipo)
    if (!v.ok) return
    setGuardando(true); onError(null)
    try {
      const e = await llaveGuardar(v.nombre, valor)
      setValor('') // fuera de la memoria de la pantalla en cuanto llega al llavero
      onGuardada(e)
    } catch (e) { onError(e instanceof Error ? e.message : 'No pude guardar la llave.') } finally { setGuardando(false) }
  }
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
      <label className="sr-only" htmlFor={`llave-${tipo}`}>{etiqueta}</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={ref} id={`llave-${tipo}`} type={ver ? 'text' : 'password'} value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => setTocado(!!valor)}
            placeholder={placeholder} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            aria-invalid={tocado && veredicto?.ok === false} aria-describedby={`llave-${tipo}-ayuda`}
            className="input-field min-h-11 !pl-9 !pr-10 font-mono text-[13px]" />
          <button type="button" onClick={() => setVer(v => !v)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
            aria-label={ver ? 'Ocultar la llave' : 'Mostrar la llave'}>
            {ver ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <button type="submit" className="btn-primary min-h-11 shrink-0 !px-4" disabled={!valor || guardando || (veredicto?.ok === false)}>
          {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Guardar'}
        </button>
      </div>
      <p id={`llave-${tipo}-ayuda`} className={`mt-1.5 min-h-[1.25rem] text-[12px] ${tocado && veredicto?.ok === false ? 'text-error' : 'text-muted'}`} aria-live="polite">
        {tocado && veredicto?.ok === false ? veredicto.error : veredicto?.ok ? 'Formato correcto. Se guarda en el llavero, no aquí.' : ''}
      </p>
    </form>
  )
}

export function BotonQuitar({ nombre, onHecho, onError }: { nombre: NombreLlave; onHecho: (e: EstadoLlaves) => void; onError: (m: string | null) => void }) {
  const [seguro, setSeguro] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!seguro) return <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-foreground/[0.06] hover:text-foreground" onClick={() => setSeguro(true)}><Trash2 className="size-3.5" aria-hidden /> Quitar</button>
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="text-muted">¿Quitarla del llavero?</span>
      <button type="button" disabled={ocupado} className="min-h-9 rounded-lg bg-error/12 px-2.5 font-medium text-error hover:bg-error/20" onClick={async () => {
        setOcupado(true)
        try { onHecho(await llaveBorrar(nombre)) } catch (e) { onError(e instanceof Error ? e.message : 'No pude quitarla.') } finally { setOcupado(false); setSeguro(false) }
      }}>Quitar</button>
      <button type="button" className="min-h-9 rounded-lg px-2.5 text-muted hover:text-foreground" onClick={() => setSeguro(false)}>Cancelar</button>
    </span>
  )
}

export function EstadoGuardada({ vista }: { vista: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[12px] font-medium text-success">
      <Check className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">Guardada{vista ? ` · ${vista}` : ''}</span>
    </span>
  )
}

const MENSAJE_PRUEBA: Record<string, string> = {
  falta_llave: 'Tu Arbrain todavía no ve la llave. Espera unos segundos y prueba de nuevo.',
  llave_invalida: 'La llave no es válida o venció. Revísala y pégala de nuevo.',
  sin_saldo: 'La llave funciona, pero tu cuenta no tiene saldo o crédito. Recarga en tu proveedor (OpenRouter o Anthropic).',
  saturado: 'Claude está saturado en este momento. Tu llave está bien; prueba en un minuto.',
  sin_red: 'No hay conexión a internet o algo la bloquea.',
  tiempo: 'Claude tardó demasiado en responder. Prueba de nuevo.',
  sin_sesion: 'Tu Claude Code no tiene la sesión iniciada. Abre una terminal, escribe «claude», inicia sesión con tu cuenta y prueba de nuevo.',
}

function ResultadoPrueba({ prueba, cobra, onReintentar, probando }: { prueba: PruebaLlave; cobra: 'openrouter' | 'anthropic'; onReintentar: () => void; probando: boolean }) {
  if (prueba.ok) return <p className="mt-3 flex items-center gap-2 text-[13px] text-success" role="status"><Check className="size-4" aria-hidden /> Conexión lista: el modelo respondió{prueba.ms ? ` en ${(prueba.ms / 1000).toFixed(1)} s` : ''}.</p>
  if (prueba.code === 'sin_saldo') return <PasoRecarga cobra={cobra} onReintentar={onReintentar} probando={probando} />
  return <Aviso tono="alerta" className="mt-3">{(prueba.code && MENSAJE_PRUEBA[prueba.code]) || prueba.error || 'No pude probar la conexión.'}</Aviso>
}

/**
 * `sin_saldo` deja de ser un error: es el siguiente paso, con el enlace directo a recargar y la prueba de vuelta. Lo
 * pintan el panel de llaves, «Listo» del primer arranque y el chat (burbuja de un turno que falló por falta de crédito).
 * Al volver a la ventana, quien lo monta repite la prueba sola (`useReprobarAlVolver`); el botón queda por si acaso.
 */
export function PasoRecarga({ cobra, onReintentar, probando, className = 'mt-3' }: { cobra: 'openrouter' | 'anthropic'; onReintentar: () => void; probando: boolean; className?: string }) {
  const [error, setError] = useState<string | null>(null)
  const donde = cobra === 'openrouter' ? 'OpenRouter' : 'Anthropic'
  return (
    <div className={`${className} rounded-xl bg-warning/10 px-3.5 py-3 text-left text-[13px] leading-relaxed text-foreground`} role="status">
      <p className="flex items-start gap-2 font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> Tu cuenta quedó conectada, pero todavía no tiene crédito.</p>
      <ol className="mt-2 space-y-2 pl-6">
        <li className="list-decimal">
          Recarga crédito en {donde} con tu tarjeta.
          <button type="button" className="btn-primary ml-0 mt-1.5 flex min-h-10 !px-3 text-[13px]" onClick={() => { setError(null); void abrirEnNavegador(RECARGAR[cobra]).catch(e => setError(e instanceof Error ? e.message : 'No pude abrir tu navegador.')) }}>
            <ExternalLink className="size-3.5" aria-hidden /> Recargar crédito en {donde}
          </button>
        </li>
        <li className="list-decimal">
          Vuelve aquí y prueba de nuevo.
          <button type="button" className="btn-secondary mt-1.5 flex min-h-10 !px-3 text-[13px]" onClick={onReintentar} disabled={probando}>
            {probando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />} Ya recargué, probar de nuevo
          </button>
        </li>
      </ol>
      {error && <p className="mt-2 text-error">{error}</p>}
    </div>
  )
}

export function Aviso({ tono, children, className = '' }: { tono: 'info' | 'alerta'; children: React.ReactNode; className?: string }) {
  return (
    <p role={tono === 'alerta' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${tono === 'alerta' ? 'bg-warning/10 text-foreground' : 'bg-brand/8 text-foreground/90'} ${className}`}>
      {tono === 'alerta' ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />}
      <span>{children}</span>
    </p>
  )
}
