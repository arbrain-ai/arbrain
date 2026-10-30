'use client'
/**
 * Botón Play (harness-noche 27 oct 2026). Palabras de Daniel: «Anthropic cada que requiere que yo corra un comando…
 * pone una casilla para solo darle Play… no puedo permitirme esto si le estoy enseñando esto a mis clientes de alto
 * ticket».
 *
 * La confirmación ya no es un diálogo que tapa la app: es una tarjeta EN EL HILO, debajo de lo que Levy está haciendo.
 *   - Arriba, qué va a pasar en palabras de todos los días (la frase la calcula el daemon). Abajo, plegado tras «Ver el
 *     comando», el literal: la frase orienta, el literal manda (es lo único que corre).
 *   - Una vez (ámbar: la acción principal) · «Permitir siempre las pruebas de tus proyectos» (la frase humana del patrón;
 *     el patrón literal `npm test *` va en el pie y en Ajustes › Permisos, donde se quita) · No. Desde el 29 oct (un fundador en Windows:
 *     «no me sale la opción de siempre») toda tarjeta rutinaria la trae: comandos de Bash y PowerShell, herramientas
 *     conectadas, escribir en una carpeta (tu memoria, aunque Levy haya leído afuera, con su aviso) y páginas de un dominio.
 *   - Cuando no se puede «siempre» (el freno, o una posible salida de datos), un botón «Que no me pregunte: modo …» abre
 *     Ajustes › Permisos y seguridad, donde se elige el modo. No aprueba nada: solo lleva ahí.
 *   - Rechazo escrito (ronda 2, T3): escribir sobre la tarjeta y mandar es decir que no con razón; la razón viaja a Levy.
 *     Si hay texto y la persona aprueba, el texto viaja con el sí.
 *   - Freno (borrar, enviar, publicar, pagar): sin ámbar. «No» es la opción neutra y la más grande; el sí dice la
 *     consecuencia («Borrar 14 archivos») con contorno rojo.
 *   - Cola (ronda 2, Duet): si la persona no contesta, la tarjeta no vence ni se dice que no sola: pasa a su cola, Levy
 *     sigue con lo demás y, cuando decide, se lo retoma (ver `ColaDeAprobaciones`). Por eso no hay cuenta regresiva.
 *   - «Córrelo tú»: cuando el comando necesita las manos de la persona (sudo, iniciar sesión), un botón lo corre en una
 *     terminal visible aquí mismo; su clic es la autorización y lo que salga vuelve a Levy.
 * Seguridad que no cambia: solo un clic de ratón o dedo real aprueba (ni el teclado ni un `click()` sintético), los
 * botones se arman tras un instante, y el navegador nunca manda el comando ni el patrón: los pone el daemon.
 * Color: neutros de base; ámbar solo para la acción principal de lo rutinario; rojo solo para peligro (el freno).
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUp, Check, ChevronDown, CircleAlert, Clock, Hand, Loader2, LockKeyhole, Play, Repeat, Settings2, ShieldAlert, Terminal, X } from 'lucide-react'
import { avisosDe, cuerpoDecision, desdeCuando, esClicHumano, fraseManos, literalVisible, piezasLiteral, resumenCorrida, sugerenciaModo, vaEnElHilo, type Confirmacion } from '@/features/permisos/lib/confirmacion'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { descartarTerminada, olvidar, registrarHilo, usePendientes } from '@/features/permisos/lib/pendientes'
// La terminal (xterm y su CSS) solo se carga cuando «Córrelo tú» de verdad corre: la tarjeta y la cola quedan ligeras.
const PtyPanel = lazy(() => import('@/features/cabina/terminal/PtyPanel').then(m => ({ default: m.PtyPanel })))
import s from './tarjeta-comando.module.css'

const ARMADO_MS = 700
const PELIGRO: Partial<Record<Confirmacion['categoria'], string>> = {
  borrar: 'Borra archivos: no van a la papelera.',
  enviar: 'Sale de tu computadora: un mensaje o datos que llegan a otra persona o servicio.',
  publicar: 'Lo publica: otras personas lo van a poder ver.',
  pagar: 'Mueve dinero.',
}
const SI_PELIGRO: Partial<Record<Confirmacion['categoria'], string>> = { borrar: 'Sí, borrar', enviar: 'Sí, enviarlo', publicar: 'Sí, publicarlo', pagar: 'Sí, pagar' }

/** Las tarjetas de este turno vivo. Mientras están montadas, el diálogo global no pinta lo que pidió Levy. */
export function TarjetasDelTurno() {
  const { pendientes, terminadas } = usePendientes()
  useEffect(() => registrarHilo(), [])
  // Lo que ya está en la cola se ve en la cola del hilo (ColaDelHilo), no aquí. Un «Córrelo tú» que acaba de terminar
  // se queda en «Listo» hasta que la persona dice «Entendido» (ronda 3).
  const aqui = [...pendientes, ...terminadas].filter(c => vaEnElHilo(c) && c.estado !== 'en_cola' && !c.enColaDesde)
  if (!aqui.length) return null
  return (
    <div className={s.pila} aria-label="Levy espera tu decisión">
      {aqui.map(c => <TarjetaComando key={c.id} c={c} />)}
    </div>
  )
}

/** «Tu Mac» o «Tu computadora», según el navegador (solo en el cliente; antes de montar, la forma neutra). */
function useEquipo(): string {
  const [equipo, setEquipo] = useState('Tu computadora')
  useEffect(() => { if (/Mac/i.test(navigator.userAgent)) setEquipo('Tu Mac') }, [])
  return equipo
}

/**
 * El literal en piezas (ronda 4): cada argumento (un archivo, una opción) es una pieza que no se parte a media palabra;
 * el renglón se corta solo en los espacios. Una pieza más ancha que la caja sí se parte, por dentro.
 */
function Literal({ texto, bash, etiqueta, foco = false }: { texto: string; bash: boolean; etiqueta: string; foco?: boolean }) {
  return <pre className={s.literal} tabIndex={foco ? 0 : undefined} aria-label={etiqueta}>
    {bash && <span className={s.prompt} aria-hidden>$ </span>}
    {piezasLiteral(texto).map((p, i) => /^\s+$/.test(p) ? p : <span key={i} className={s.pieza}>{p}</span>)}
  </pre>
}

/**
 * El comando crudo, plegado (pulido final, 28 oct): la frase humana queda arriba y el literal (rutas de un `rm`, un
 * `sudo installer`) vive tras «Ver el comando». Sigue siendo lo único que corre; solo deja de ser lo primero que se lee.
 */
function ComandoPlegado({ texto, bash, etiqueta, foco = false }: { texto: string; bash: boolean; etiqueta: string; foco?: boolean }) {
  const [ver, setVer] = useState(false)
  return <div className={s.plegado}>
    <button type="button" className={s.verComando} onClick={() => setVer(v => !v)} aria-expanded={ver} data-ver-comando>
      <ChevronDown size={13} aria-hidden data-abierta={ver ? 'si' : undefined} className={s.flechita} /> {ver ? 'Ocultar el comando' : 'Ver el comando'}
    </button>
    {ver && <Literal texto={texto} bash={bash} etiqueta={etiqueta} foco={foco} />}
  </div>
}

type Decision = 'una' | 'siempre' | 'no' | 'correr'

/**
 * La decisión sobre una confirmación (la usan la tarjeta completa y la ficha compacta de la cola). Solo un clic real
 * aprueba: el teclado (detail 0) y los clics sintéticos no. «No» sí acepta teclado. Los botones se arman tras un instante.
 */
export function useDecision(c: Confirmacion, texto = '') {
  const [armado, setArmado] = useState(false)
  const [ocupado, setOcupado] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const t = window.setTimeout(() => setArmado(true), ARMADO_MS); return () => window.clearTimeout(t) }, [])
  const decidir = useCallback(async (d: Decision) => {
    setOcupado(d); setError(null)
    const comentario = texto
    const cuerpo = d === 'no' ? cuerpoDecision(c.id, 'rechazar', { comentario }) : d === 'correr' ? cuerpoDecision(c.id, 'correr', { comentario }) : cuerpoDecision(c.id, 'permitir', { alcance: d, comentario })
    try {
      const r = await fetch('/api/confirmaciones/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({})) as Confirmacion & { error?: string }
      if (!r.ok && r.status !== 404 && r.status !== 409) throw new Error(j.error ?? 'No pude enviar tu decisión.')
      olvidar(c.id, r.ok ? j : undefined)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude enviar tu decisión.'); setOcupado(null) }
  }, [c.id, texto])
  const alClic = (d: Decision) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (d !== 'no' && !esClicHumano({ detail: e.detail, isTrusted: e.nativeEvent.isTrusted })) return
    void decidir(d)
  }
  return { armado, ocupado, error, decidir, alClic }
}

/** `incrustada`: dentro de la ficha de la cola, que ya muestra la frase y desde cuándo (sin cabeza ni borde propios). */
export function TarjetaComando({ c, incrustada = false }: { c: Confirmacion; incrustada?: boolean }) {
  const [texto, setTexto] = useState('')
  const { armado, ocupado, error, decidir, alClic } = useDecision(c, texto)
  const manos = c.tipo === 'manos'
  const literal = c.literal ? literalVisible(c.literal).texto : null
  const avisos = avisosDe(c).filter(a => !/para que no te pregunte esto/.test(a))
  const peligro = PELIGRO[c.categoria]
  const rutina = c.origen === 'cron'
  const quien = rutina ? 'Una rutina tuya' : 'Levy'
  const titulo = manos ? 'Esto necesita tus manos' : c.herramienta === 'Bash' ? `${quien} quiere correr un comando` : `${quien} necesita tu permiso`
  const Icono = manos ? Hand : peligro ? ShieldAlert : Terminal
  const enCola = c.estado === 'en_cola' && c.enColaDesde ? desdeCuando(c.enColaDesde) : null
  const modoSugerido = sugerenciaModo(c)

  /** Rechazo escrito: Enter (sin Mayúsculas) manda el «no» con su razón. */
  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && texto.trim() && !ocupado) { e.preventDefault(); void decidir('no') }
  }

  if (manos && (c.estado === 'corrida' || (c.estado === 'corriendo' && typeof c.terminal === 'number'))) return <TarjetaCorriendo c={c} incrustada={incrustada} />

  const conTexto = texto.trim().length > 0
  const etiquetaNo = manos ? 'No, gracias' : peligro ? 'No, no lo hagas' : 'No'

  return (
    <section className={s.tarjeta} data-peligro={peligro ? 'si' : undefined} data-cola={enCola ? 'si' : undefined} data-incrustada={incrustada ? 'si' : undefined} aria-labelledby={incrustada ? undefined : `tc-${c.id}`} aria-label={incrustada ? (c.frase || c.resumen) : undefined}>
      {!incrustada && <header className={s.cabeza}>
        <span className={s.icono} aria-hidden><Icono size={16} /></span>
        <div className={s.titulos}>
          <h3 id={`tc-${c.id}`} className={s.titulo}>{titulo}</h3>
          <p className={s.frase}>{c.frase || c.resumen}</p>
        </div>
        {enCola && <span className={s.vence} title="Nada pasa sin tu clic: te espera aquí hasta que decidas"><Clock size={12} aria-hidden /> En tu cola {enCola}</span>}
      </header>}

      {peligro && <p className={s.peligro} role="note"><AlertTriangle size={13} aria-hidden /> {peligro} Esto siempre pide tu clic.</p>}

      {literal ? (
        <ComandoPlegado texto={literal} bash={c.herramienta === 'Bash'} etiqueta="Comando exacto" foco />
      ) : <p className={s.nota}>El servidor no mandó el comando exacto. Si no sabes qué hace, di que no.</p>}

      {avisos.length > 0 && (
        <ul className={s.avisos} aria-label="Avisos">
          {avisos.map(a => <li key={a}>{a}</li>)}
        </ul>
      )}

      {manos && (
        <p className={s.explica}>
          Levy no puede escribir tu contraseña ni iniciar sesión por ti, y está bien que sea así. Si lo corres tú, se abre una terminal aquí mismo:
          escribe lo que te pida (la contraseña no se ve mientras la escribes, es normal). Levy no la ve; solo recibe lo que salga.
        </p>
      )}

      {error && <p role="alert" className={s.error}>{error}</p>}

      <div className={s.botones} data-peligro={peligro ? 'si' : undefined}>
        {manos ? (
          <button type="button" className={s.principal} disabled={!armado || !!ocupado} onClick={alClic('correr')} title="Solo con un clic: el teclado no corre comandos">
            {ocupado === 'correr' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />} Correrlo en mi terminal
          </button>
        ) : peligro ? null : (
          <>
            <button type="button" className={s.principal} disabled={!armado || !!ocupado} onClick={alClic('una')} title="Solo con un clic: el teclado no aprueba acciones">
              {ocupado === 'una' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />} Una vez
            </button>
            {c.patron && (
              <button type="button" className={s.secundario} disabled={!armado || !!ocupado} onClick={alClic('siempre')} title={`Guarda la regla «${c.patron}»: esto ya no te pregunta`}>
                {ocupado === 'siempre' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Repeat size={15} aria-hidden />} {c.patronFrase || 'Permitir siempre este tipo de comando'}
              </button>
            )}
          </>
        )}
        {peligro && (
          <button type="button" className={s.consecuencia} disabled={!armado || !!ocupado} onClick={alClic('una')} title="Solo con un clic: el teclado no aprueba acciones">
            {ocupado === 'una' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null} {c.botonSi || SI_PELIGRO[c.categoria] || 'Sí, hacerlo'}
          </button>
        )}
        <button type="button" className={peligro ? s.noDominante : s.secundario} disabled={!!ocupado} onClick={alClic('no')}>
          {ocupado === 'no' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <X size={15} aria-hidden />} {etiquetaNo}
        </button>
      </div>

      <div className={s.rechazo} data-lleno={conTexto ? 'si' : undefined}>
        <textarea
          value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={alTeclear} maxLength={500} rows={1}
          aria-label={manos ? 'Escribe por qué no y Levy no lo pide' : 'Escribe qué prefieres y Levy no lo hace'}
          placeholder={manos ? '¿No lo quieres correr? Dile por qué…' : '¿Prefieres otra cosa? Escríbela y Levy no lo hace…'}
        />
        <button type="button" className={s.mandar} disabled={!conTexto || !!ocupado} onClick={alClic('no')} aria-label="Decir que no y mandarle esto a Levy" title="Decir que no y mandarle esto a Levy (Enter)">
          {ocupado === 'no' && conTexto ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ArrowUp size={14} aria-hidden />}
        </button>
      </div>
      {conTexto && !peligro && !manos && <p className={s.pie}>Enter manda tu «no» con esta razón. Si mejor apruebas, el texto viaja con tu sí.</p>}
      {!manos && !peligro && c.patron && !conTexto && <p className={s.pie}>«Permitir siempre» guarda la regla <code>{c.patron}</code> en Ajustes › Permisos y seguridad, donde la ves y la quitas.</p>}
      {!manos && !peligro && c.patron && c.patronAviso && <p className={s.pie} data-patron-aviso role="note">{c.patronAviso}</p>}
      {!manos && !rutina && modoSugerido && (
        <p className={s.pie} data-sugerencia-modo>
          <button type="button" className={s.verComando} onClick={() => useAjustes.getState().abrir('seguridad')} title="Abre Ajustes › Permisos y seguridad: ahí eliges cuánto te pregunta Levy (no aprueba esta acción)">
            <Settings2 size={13} aria-hidden /> Que no me pregunte: modo {modoSugerido}
          </button>
        </p>
      )}
    </section>
  )
}

/**
 * «Córrelo tú» en marcha y al terminar (ronda 3). Mientras corre: la terminal del motor, con la instrucción apuntando al
 * lugar exacto donde se escribe. Al terminar, el giro se detiene y queda «Listo» con lo que pasó en una frase (código
 * de salida y última línea útil, `resumenCorrida`); la salida completa queda plegada. «Entendido» la quita del hilo.
 */
function TarjetaCorriendo({ c, incrustada = false }: { c: Confirmacion; incrustada?: boolean }) {
  const [finLocal, setFinLocal] = useState(false)
  const [verSalida, setVerSalida] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const terminada = c.estado === 'corrida'
  const fin = terminada || finLocal
  const demo = c.id.startsWith('cf_demo')
  useEffect(() => { if (!fin) caja.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [fin])
  const r = terminada ? resumenCorrida(c) : { ok: null, titulo: 'Terminó', frase: 'Se lo estoy pasando a Levy con lo que salió.' }
  const IconoFin = r.ok === false ? CircleAlert : Check
  const equipo = useEquipo()
  const calida = fraseManos(c, equipo)
  return (
    <section className={s.tarjeta} data-corriendo={fin ? undefined : 'si'} data-fin={fin ? (r.ok === false ? 'error' : 'ok') : undefined} data-incrustada={incrustada ? 'si' : undefined} aria-live="polite" aria-label={fin ? r.titulo : 'Corriendo en tu terminal'}>
      <header className={s.cabeza}>
        <span className={s.icono} data-fin={fin ? (r.ok === false ? 'error' : 'ok') : undefined} aria-hidden>{fin ? <IconoFin size={16} /> : <Loader2 size={16} className="animate-spin" />}</span>
        <div className={s.titulos}>
          <p className={s.frase}>{fin ? r.titulo : 'Corriendo en tu terminal'}</p>
          <p className={s.subtitulo}>{fin ? r.frase : 'Mientras escribes la contraseña no se ve nada: es normal.'}</p>
        </div>
      </header>
      {/* Ronda 4: primero qué va a pasar y por qué se pide tu contraseña, en una frase cálida; debajo, la terminal. */}
      {!fin && calida && <p className={s.calida} data-calida><LockKeyhole size={15} aria-hidden /><span>{calida}</span></p>}
      {fin && c.literal && <ComandoPlegado texto={c.literal} bash etiqueta="Comando" />}
      {!fin && (
        <div className={s.terminalMarco}>
          <span className={s.terminalRotulo} aria-hidden><Terminal size={12} /> Tu terminal · escribe aquí</span>
          <div ref={caja} className={s.terminal}>
            {c.terminal != null && c.terminal >= 0 && !demo ? (
              <Suspense fallback={null}><PtyPanel id={c.terminal} visible activa onFin={() => setFinLocal(true)} onTitulo={() => {}} /></Suspense>
            ) : (
              <pre className={s.terminalDemo}>{c.salida ?? ''}<span className={s.cursor} aria-hidden /></pre>
            )}
          </div>
          {c.literal && <ComandoPlegado texto={c.literal} bash etiqueta="Lo que se corre" />}
        </div>
      )}
      {fin && (
        <div className={s.fin}>
          {terminada && c.salida && (
            <button type="button" className={s.enlace} onClick={() => setVerSalida(v => !v)} aria-expanded={verSalida}>
              <ChevronDown size={13} aria-hidden data-abierta={verSalida ? 'si' : undefined} className={s.flechita} /> {verSalida ? 'Ocultar lo que salió' : 'Ver lo que salió'}
            </button>
          )}
          {terminada && <button type="button" className={s.secundario} onClick={() => descartarTerminada(c.id)}>Entendido</button>}
        </div>
      )}
      {fin && verSalida && c.salida && <pre className={s.salida}>{c.salida}</pre>}
    </section>
  )
}
