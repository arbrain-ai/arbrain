'use client'
/**
 * Ajustes › Sin filtro de la edición cliente (v0.2.23, 4 nov 2026). Daniel en clase: «les voy a incluir un manual del
 * paso a paso para que sepan cómo conectar su API»; y el 4 nov: «el modelo sin filtro también metámoslo en una
 * siguiente versión».
 *
 * El alumno conecta DeepSeek V4.1 Flash abliterated con SU llave de abliteration.ai: va del campo a su Arbrain por el
 * mismo puente que las demás llaves (`llave_guardar`), el daemon la recibe por stdin al reiniciarse y la pantalla solo
 * vuelve a ver si existe y su vista enmascarada. Nunca viaja una llave de Daniel. El manual paso a paso vive aquí mismo
 * y, para su Levy, en `arbrain/cerebro/manuales/sin-filtro.md`.
 */
import { useEffect, useState } from 'react'
import { ExternalLink, Eye, EyeOff, KeyRound, Loader2, MessageSquare, ShieldAlert } from 'lucide-react'
import {
  abrirEnNavegador, CONSOLA_ABLITERATION, esperarDaemon, hayApp, llaveGuardar, llavesEstado, limpiarLlave, validarLlaveSinFiltro,
  type EstadoLlaves,
} from '../lib/llaves'
import { Aviso, BotonQuitar, EstadoGuardada } from './PanelLlaves'

export function PanelSinFiltro() {
  const app = typeof window !== 'undefined' && hayApp()
  const [estado, setEstado] = useState<EstadoLlaves | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reiniciando, setReiniciando] = useState(false)

  useEffect(() => {
    if (!app) return
    llavesEstado().then(setEstado).catch(e => setError(e instanceof Error ? e.message : 'No pude leer tus llaves.'))
  }, [app])

  const llave = estado?.llaves.find(l => l.nombre === 'ABLITERATION_AI_API_KEY')
  const guardada = !!llave?.presente
  // Un Arbrain anterior a v0.2.23 no conoce esta llave: su lista no la trae.
  const vieja = !!estado && estado.disponible && !llave

  const alGuardar = async (e: EstadoLlaves) => {
    setEstado(e); setReiniciando(true)
    try { await esperarDaemon(30_000) } finally { setReiniciando(false) }
  }

  if (!app) return <Aviso tono="info">La llave se guarda desde tu Arbrain (la app de escritorio o tu servidor). Ábrelo para continuar.</Aviso>
  if (estado && !estado.disponible) return <Aviso tono="alerta">Tu sistema no tiene dónde guardar llaves de forma segura{estado.error ? ` (${estado.error})` : ''}.</Aviso>

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${guardada ? 'border-border-subtle bg-surface/70' : 'border-error/35 bg-error/[0.05]'}`} aria-label="Sin filtro, llave de abliteration.ai">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="size-4 text-error" aria-hidden /> DeepSeek V4.1 Flash · abliterated
          <span className="rounded-full bg-error/12 px-2 py-0.5 text-[11px] font-medium text-error">sin filtro · no es Claude</span>
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Un modelo abierto al que le quitaron las negativas: responde lo que Claude no respondería. Corre con tu misma Levy,
          tu cerebro y tus herramientas, en una conversación aparte. Lo pagas tú por uso en abliteration.ai, con tu propia llave.
        </p>

        {guardada ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] font-medium text-foreground">Llave de abliteration.ai</span>
              <span className="flex items-center gap-1.5">
                <EstadoGuardada vista={llave?.vista ?? null} />
                <BotonQuitar nombre="ABLITERATION_AI_API_KEY" onError={setError} onHecho={(e) => void alGuardar(e)} />
              </span>
            </div>
            {reiniciando
              ? <p className="flex items-center gap-2 text-[12.5px] text-muted" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Tu Arbrain se reinicia unos segundos para tomar el cambio…</p>
              : <ComoUsarlo />}
          </div>
        ) : vieja ? (
          <Aviso tono="alerta" className="mt-3">Tu Arbrain todavía no conoce esta llave. Actualízalo (dile a Levy «jala los últimos cambios») y vuelve aquí.</Aviso>
        ) : (
          <>
            <ol className="mt-4 space-y-2 text-[13px] leading-relaxed text-muted">
              <li className="flex gap-2"><Paso n={1} /><span>Abre la consola de abliteration.ai y entra con tu cuenta de Google (o crea una cuenta nueva).
                <button type="button" className="btn-secondary mt-1.5 flex min-h-9 !px-3 text-[13px]" onClick={() => { setError(null); void abrirEnNavegador(CONSOLA_ABLITERATION).catch(e => setError(e instanceof Error ? e.message : 'No pude abrir tu navegador.')) }}>
                  <ExternalLink className="size-3.5" aria-hidden /> Abrir abliteration.ai/console
                </button></span></li>
              <li className="flex gap-2"><Paso n={2} /><span>Si tu cuenta no tiene saldo, carga crédito en su sección de facturación. Se cobra por uso; no hay mensualidad.</span></li>
              <li className="flex gap-2"><Paso n={3} /><span>Entra a «API keys», crea una llave nueva y ponle de nombre «Arbrain».</span></li>
              <li className="flex gap-2"><Paso n={4} /><span>Cópiala completa y pégala aquí abajo. Empieza con «ak_». Pégala solo aquí: nunca en el chat.</span></li>
              <li className="flex gap-2"><Paso n={5} /><span>Al guardarla, tu Arbrain se reinicia unos segundos. Luego, en el chat, abre el selector de modelo y elige «DeepSeek V4.1 Flash · abliterated».</span></li>
            </ol>
            <CampoLlave onError={setError} onGuardada={(e) => void alGuardar(e)} />
          </>
        )}
      </section>

      <section className="rounded-2xl border border-border-subtle bg-surface/70 p-4" aria-label="Lo que tienes que saber">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldAlert className="size-4 text-warning" aria-hidden /> Lo que tienes que saber
        </h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-muted">
          <li><strong className="font-medium text-foreground/85">No es Claude.</strong> El modelo no se niega a nada; los frenos de tu Arbrain sí siguen: los permisos, la pregunta antes de mandar mensajes, borrar o publicar, y nada de dinero.</li>
          <li><strong className="font-medium text-foreground/85">Tus mensajes de esa conversación van a abliteration.ai,</strong> un servicio de terceros. No le pases contraseñas ni datos de tus clientes que no quieras compartir.</li>
          <li><strong className="font-medium text-foreground/85">Cuánto cuesta:</strong> 1 USD por millón de tokens de entrada y 2 USD por millón de salida. Medido el 3 nov 2026: abrir una conversación cuesta unos 6 centavos de dólar y cada mensaje corto que sigue, menos de 1 centavo. Preguntar varias cosas en la misma conversación rinde mucho más.</li>
          <li><strong className="font-medium text-foreground/85">Lo que le pidas es tuyo.</strong> Úsalo con criterio y dentro de la ley.</li>
        </ul>
      </section>

      {error && <Aviso tono="alerta">{error}</Aviso>}
    </div>
  )
}

function ComoUsarlo() {
  return (
    <div className="rounded-xl bg-foreground/[0.035] px-3 py-2.5 text-[13px] leading-relaxed text-muted">
      <p className="flex items-center gap-2 font-medium text-foreground/90"><MessageSquare className="size-3.5" aria-hidden /> Cómo usarlo</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5">
        <li>En el chat, toca el selector de modelo (abajo, junto al «+»).</li>
        <li>Elige «DeepSeek V4.1 Flash · abliterated»: se abre una conversación nueva.</li>
        <li>Mientras estés en él, el selector se ve como una píldora roja. Para volver a Claude, elige otro modelo.</li>
      </ol>
    </div>
  )
}

function Paso({ n }: { n: number }) {
  return <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-error/12 text-[11px] font-semibold text-error">{n}</span>
}

function CampoLlave({ onGuardada, onError }: { onGuardada: (e: EstadoLlaves) => void; onError: (m: string | null) => void }) {
  const [valor, setValor] = useState('')
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const veredicto = valor ? validarLlaveSinFiltro(valor) : null
  const guardar = async () => {
    if (!validarLlaveSinFiltro(valor).ok) return
    setGuardando(true); onError(null)
    try { onGuardada(await llaveGuardar('ABLITERATION_AI_API_KEY', limpiarLlave(valor))); setValor('') }
    catch (e) { onError(e instanceof Error ? e.message : 'No pude guardar la llave.') } finally { setGuardando(false) }
  }
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
      <label className="sr-only" htmlFor="llave-sin-filtro">Llave de abliteration.ai</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input id="llave-sin-filtro" type={ver ? 'text' : 'password'} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ak_…"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-invalid={veredicto?.ok === false}
            className="input-field min-h-10 w-full px-3 pr-10 font-mono text-[13px]" />
          <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar la llave' : 'Mostrar la llave'}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-foreground">
            {ver ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <button type="submit" className="btn-primary min-h-10 shrink-0 !px-4 text-[13px]" disabled={!valor || guardando || veredicto?.ok === false}>
          {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Guardar'}
        </button>
      </div>
      {veredicto && !veredicto.ok && <p className="mt-1.5 text-[12px] text-error" aria-live="polite">{veredicto.error}</p>}
    </form>
  )
}
