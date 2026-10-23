'use client'
/**
 * Ajustes › Voz de la edición cliente (21 oct 2026, carril VOZ; Daniel: «puedes pintar una interfaz de usuario para que
 * el usuario utilice la llave de Groq»).
 *
 * Dictar necesita una llave de Groq (gratis). Igual que las llaves del chat: va del campo al llavero del sistema por la
 * app (`llave_guardar`), el daemon la recibe por stdin al reiniciarse y la pantalla solo vuelve a ver si existe y su
 * vista enmascarada. «Probar» le pide al daemon que la use contra Groq (sin gastar audio).
 * «Escuchar» no necesita nada: lee con la mejor voz en español del dispositivo. Con una llave de LemonFox (opcional, de
 * pago; v0.2.10, grupal del 23 oct: «la voz por defecto en Windows es fea») lee con la voz de LemonFox.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Mic, Volume2, Zap } from 'lucide-react'
import {
  abrirEnNavegador, CONSOLA_GROQ, CONSOLA_LEMONFOX, esperarDaemon, EVENTO_LLAVE_VOZ, hayApp, llaveGuardar, llavesEstado, limpiarLlave, MARCA_DESDE_MIC, probarVoz, validarLlaveLemonfox, validarLlaveVoz,
  type EstadoLlaves, type PruebaVoz,
} from '../lib/llaves'
import { Aviso, BotonQuitar, EstadoGuardada } from './PanelLlaves'

const MENSAJE: Record<string, string> = {
  falta_llave: 'Tu Arbrain todavía no ve la llave. Espera unos segundos y prueba de nuevo.',
  llave_invalida: 'Groq no reconoce esa llave. Quítala, crea una nueva en console.groq.com/keys y pégala otra vez.',
  saturado: 'Groq está ocupado en este momento. Tu llave está bien; prueba en un minuto.',
  sin_red: 'No hay conexión a internet o algo la bloquea.',
  tiempo: 'Groq tardó demasiado en responder. Prueba de nuevo.',
}
/** Mientras el daemon se reinicia con la llave nueva, la prueba puede caer en el viejo: se reintenta un rato. */
const ESPERAR_REINICIO = new Set(['falta_llave', 'sin_daemon', 'error'])

const avisarCambio = (presente: boolean) => window.dispatchEvent(new CustomEvent(EVENTO_LLAVE_VOZ, { detail: { presente } }))

export function PanelVoz() {
  const app = typeof window !== 'undefined' && hayApp()
  const [estado, setEstado] = useState<EstadoLlaves | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prueba, setPrueba] = useState<PruebaVoz | null>(null)
  const [probando, setProbando] = useState(false)
  const [desdeMic, setDesdeMic] = useState(false)
  const enCurso = useRef(false)

  useEffect(() => {
    try { if (sessionStorage.getItem(MARCA_DESDE_MIC)) { setDesdeMic(true); sessionStorage.removeItem(MARCA_DESDE_MIC) } } catch { /* sin storage */ }
    if (!app) return
    llavesEstado().then(setEstado).catch(e => setError(e instanceof Error ? e.message : 'No pude leer el llavero.'))
  }, [app])

  const llave = estado?.llaves.find(l => l.nombre === 'GROQ_API_KEY')
  const guardada = !!llave?.presente
  // Una app anterior a esta versión no conoce la llave de Groq: su llavero no la lista.
  const appVieja = !!estado && estado.disponible && !llave

  const probar = useCallback(async (tras = false) => {
    if (enCurso.current) return
    enCurso.current = true; setProbando(true)
    try {
      let r: PruebaVoz = { ok: false }
      for (let i = 0; i < (tras ? 12 : 1); i++) {
        if (tras) await esperarDaemon(20_000)
        r = await probarVoz()
        if (r.ok || !ESPERAR_REINICIO.has(r.code ?? 'error')) break
        await new Promise(res => setTimeout(res, 1_500))
      }
      setPrueba(r)
    } finally { enCurso.current = false; setProbando(false) }
  }, [])

  if (!app) return <Aviso tono="info">La llave de voz se guarda desde la app de Arbrain, en el llavero de tu sistema. Ábrela para continuar.</Aviso>
  if (estado && !estado.disponible) return <Aviso tono="alerta">Tu sistema no tiene un llavero disponible{estado.error ? ` (${estado.error})` : ''}. Por seguridad, Arbrain no guarda llaves en archivos.</Aviso>

  return (
    <div className="space-y-4">
      {desdeMic && !guardada && (
        <Aviso tono="info">Para dictar con el micrófono falta tu llave de Groq. Es gratis y toma un minuto: créala, pégala aquí y vuelve al chat.</Aviso>
      )}

      <section className={`rounded-2xl border p-4 ${guardada ? 'border-border-subtle bg-surface/70' : 'border-brand/40 bg-brand/[0.06]'}`} aria-label="Voz, llave de Groq">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mic className="size-4 text-brand-ink" aria-hidden /> Voz · llave de Groq <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">gratis</span>
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">Con ella dictas tus mensajes desde el micrófono del chat. Groq convierte tu voz en texto; Arbrain solo usa la llave para eso y la guarda en el llavero de tu sistema, nunca en un archivo.</p>

        {guardada ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] font-medium text-foreground">Llave de Groq</span>
              <span className="flex items-center gap-1.5">
                <EstadoGuardada vista={llave?.vista ?? null} />
                <BotonQuitar nombre="GROQ_API_KEY" onError={setError} onHecho={(e) => { setEstado(e); setPrueba(null); avisarCambio(false) }} />
              </span>
            </div>
            <button type="button" className="btn-secondary !px-3 !py-2 text-[13px]" onClick={() => void probar()} disabled={probando}>
              {probando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} Probar llave
            </button>
            {probando && <p className="text-[12.5px] text-muted" role="status">Probando tu llave con Groq…</p>}
            {prueba && !probando && (prueba.ok
              ? <p className="flex items-center gap-2 text-[13px] text-success" role="status"><Check className="size-4" aria-hidden /> Lista: ya puedes dictar desde el chat{prueba.ms ? ` (Groq respondió en ${(prueba.ms / 1000).toFixed(1)} s)` : ''}.</p>
              : <Aviso tono="alerta">{(prueba.code && MENSAJE[prueba.code]) || prueba.error || 'No pude probar la llave.'}</Aviso>)}
          </div>
        ) : appVieja ? (
          <Aviso tono="alerta" className="mt-3">Esta versión de la app todavía no guarda la llave de voz. Actualiza Arbrain y vuelve aquí.</Aviso>
        ) : (
          <>
            <ol className="mt-4 space-y-2 text-[13px] leading-relaxed text-muted">
              <li className="flex gap-2"><Paso n={1} /><span>Abre la consola de Groq e inicia sesión (o crea tu cuenta, es gratis).
                <button type="button" className="btn-secondary mt-1.5 flex min-h-9 !px-3 text-[13px]" onClick={() => { setError(null); void abrirEnNavegador(CONSOLA_GROQ).catch(e => setError(e instanceof Error ? e.message : 'No pude abrir tu navegador.')) }}>
                  <ExternalLink className="size-3.5" aria-hidden /> Abrir console.groq.com/keys
                </button></span></li>
              <li className="flex gap-2"><Paso n={2} /><span>Pulsa «Create API Key» y ponle un nombre como «Arbrain».</span></li>
              <li className="flex gap-2"><Paso n={3} /><span>Cópiala y pégala aquí. Empieza con «gsk_».</span></li>
            </ol>
            <CampoGroq onError={setError} onGuardada={(e) => { setEstado(e); setPrueba(null); avisarCambio(true); void probar(true) }} />
          </>
        )}
      </section>

      <VozDeRespuestas estado={estado} onEstado={setEstado} onError={setError} />

      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}

/** «Escuchar» una respuesta: la mejor voz del sistema, o LemonFox si la persona pega su llave (opcional, de pago). */
function VozDeRespuestas({ estado, onEstado, onError }: { estado: EstadoLlaves | null; onEstado: (e: EstadoLlaves) => void; onError: (m: string | null) => void }) {
  const llave = estado?.llaves.find(l => l.nombre === 'LEMONFOX_API_KEY')
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const veredicto = valor ? validarLlaveLemonfox(valor) : null
  // Una app anterior a v0.2.10 no conoce esta llave: su llavero no la lista y no se ofrece el campo.
  const soportada = !!llave
  const guardar = async () => {
    if (!validarLlaveLemonfox(valor).ok) return
    setGuardando(true); onError(null)
    try { onEstado(await llaveGuardar('LEMONFOX_API_KEY', limpiarLlave(valor))); setValor('') }
    catch (e) { onError(e instanceof Error ? e.message : 'No pude guardar la llave.') } finally { setGuardando(false) }
  }
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Voz de las respuestas">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Volume2 className="size-4 text-brand-ink" aria-hidden /> Voz de las respuestas
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        «Escuchar» una respuesta no necesita llave: Arbrain elige la mejor voz en español de tu computadora (en Windows, si tienes una voz «Natural», la usa). Si quieres una voz más humana, pega tu llave de LemonFox (de pago, por uso).
      </p>
      {!soportada ? null : llave?.presente ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13.5px] font-medium text-foreground">Llave de LemonFox</span>
          <span className="flex items-center gap-1.5">
            <EstadoGuardada vista={llave.vista ?? null} />
            <BotonQuitar nombre="LEMONFOX_API_KEY" onError={onError} onHecho={onEstado} />
          </span>
        </div>
      ) : (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
          <label className="sr-only" htmlFor="llave-lemonfox">Llave de LemonFox</label>
          <div className="flex gap-2">
            <input id="llave-lemonfox" type="password" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Llave de LemonFox (opcional)"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-invalid={veredicto?.ok === false}
              className="input-field min-h-10 min-w-0 flex-1 px-3 font-mono text-[13px]" />
            <button type="submit" className="btn-secondary min-h-10 shrink-0 !px-3 text-[13px]" disabled={!valor || guardando || veredicto?.ok === false}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Guardar'}
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-muted" aria-live="polite">
            {veredicto && !veredicto.ok ? <span className="text-error">{veredicto.error}</span> : (
              <button type="button" className="inline-flex items-center gap-1 font-medium text-brand-ink underline-offset-2 hover:underline" onClick={() => void abrirEnNavegador(CONSOLA_LEMONFOX).catch(() => {})}>
                Crear mi llave en LemonFox <ExternalLink className="size-3" aria-hidden />
              </button>
            )}
          </p>
        </form>
      )}
    </section>
  )
}

function Paso({ n }: { n: number }) {
  return <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand-ink">{n}</span>
}

function CampoGroq({ onGuardada, onError }: { onGuardada: (e: EstadoLlaves) => void; onError: (m: string | null) => void }) {
  const [valor, setValor] = useState('')
  const [ver, setVer] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const veredicto = valor ? validarLlaveVoz(valor) : null
  const guardar = async () => {
    setTocado(true)
    if (!validarLlaveVoz(valor).ok) return
    setGuardando(true); onError(null)
    try {
      const e = await llaveGuardar('GROQ_API_KEY', limpiarLlave(valor))
      setValor('') // fuera de la memoria de la pantalla en cuanto llega al llavero
      onGuardada(e)
    } catch (e) { onError(e instanceof Error ? e.message : 'No pude guardar la llave.') } finally { setGuardando(false) }
  }
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
      <label className="sr-only" htmlFor="llave-groq">Llave de Groq</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="llave-groq" type={ver ? 'text' : 'password'} value={valor} onChange={(e) => setValor(e.target.value)} onBlur={() => setTocado(!!valor)}
            placeholder="gsk_…" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            aria-invalid={tocado && veredicto?.ok === false} aria-describedby="llave-groq-ayuda"
            className="input-field min-h-11 !pl-9 !pr-10 font-mono text-[13px]" />
          <button type="button" onClick={() => setVer(v => !v)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
            aria-label={ver ? 'Ocultar la llave' : 'Mostrar la llave'}>
            {ver ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <button type="submit" className="btn-primary min-h-11 shrink-0 !px-4" disabled={!valor || guardando || veredicto?.ok === false}>
          {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Guardar'}
        </button>
      </div>
      <p id="llave-groq-ayuda" className={`mt-1.5 min-h-[1.25rem] text-[12px] ${tocado && veredicto?.ok === false ? 'text-error' : 'text-muted'}`} aria-live="polite">
        {tocado && veredicto && !veredicto.ok ? veredicto.error : veredicto?.ok ? 'Formato correcto. Se guarda en el llavero, no aquí.' : ''}
      </p>
    </form>
  )
}
