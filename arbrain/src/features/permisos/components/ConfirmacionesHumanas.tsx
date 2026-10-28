'use client'
/**
 * Confirmación humana del freno (AUDITORIA I8; CONTRATO-DAEMON.md v3 §6). Edición cliente.
 *
 * Cuando un agente quiere enviar, pagar, borrar o publicar (y, sin sandbox, correr cualquier comando de terminal), el
 * daemon no lo ejecuta con la palabra del modelo: crea una confirmación pendiente y espera el clic de la persona. Este
 * diálogo la muestra y solo un clic humano la resuelve (el secreto que aprueba lo pone el servidor local; ni el
 * navegador ni el modelo lo conocen).
 *
 * v3 (red team C1/C2): se ve el LITERAL completo que de verdad corre (monoespaciado, con scroll, sin recortar ni
 * reinterpretar; lo invisible se marca ⟨U+…⟩), los avisos del daemon como etiquetas y el origen («Pedida por Levy»,
 * «Rutina», «Manos»). El `resumen` es solo el título.
 *
 * Diseño «nativo»: modal centrado, una pendiente a la vez (la más vieja primero), el botón seguro con el foco
 * («Rechazar»), Escape rechaza, y «Permitir» exige un clic deliberado de ratón o trackpad: se habilita tras un instante
 * y ni el teclado ni un `click()` sintético aprueban.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CreditCard, Loader2, Send, ShieldAlert, Terminal, Trash2, Upload } from 'lucide-react'
import { avisoSinSandbox, avisosDe, esClicHumano, etiquetaOrigen, literalVisible, vaEnElHilo, type Confirmacion, type EstadoSandbox } from '../lib/confirmacion'
import { olvidar, usePendientes } from '../lib/pendientes'
// La cola (ronda 2) trae la tarjeta del hilo y su CSS: se carga aparte, así este diálogo sigue ligero.
const ContadorCola = lazy(() => import('./ColaDeAprobaciones').then(m => ({ default: m.ContadorCola })))

export type { Confirmacion } from '../lib/confirmacion'
export { ordenarPendientes } from '../lib/confirmacion'

const VERBO: Record<Confirmacion['categoria'], string> = { enviar: 'enviar', pagar: 'pagar', borrar: 'borrar', publicar: 'publicar', otra: 'hacer algo que necesita tu permiso' }
const ICONO = { enviar: Send, pagar: CreditCard, borrar: Trash2, publicar: Upload, otra: ShieldAlert } as const
const ARMADO_MS = 700
const VISTO_SIN_SANDBOX = 'arbrain.aviso-sin-sandbox.visto'

export function ConfirmacionesHumanas() {
  // Botón Play (27 oct 2026): un solo sondeo compartido con la tarjeta del hilo. Lo que pidió Levy en la conversación
  // se contesta en el hilo mientras haya un turno vivo a la vista; este diálogo queda de respaldo (rutinas, manos, o
  // un pedido sin hilo en pantalla). «Córrelo tú» solo vive en el hilo (necesita su terminal).
  const { pendientes, sandbox, hilosVivos } = usePendientes()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  const aqui = pendientes.filter(c => c.estado === 'pendiente' && c.tipo !== 'manos' && !(hilosVivos > 0 && vaEnElHilo(c)))
  const actual = aqui[0]
  // Cola de aprobaciones (ronda 2): lo que nadie contestó a tiempo vive en el contador y su panel, no en este diálogo.
  if (!montado) return null
  return <>
    <Suspense fallback={null}><ContadorCola /></Suspense>
    {actual && createPortal(<DialogoConfirmacion key={actual.id} c={actual} sandbox={sandbox} restantes={aqui.length - 1} alResolver={() => olvidar(actual.id)} />, document.body)}
  </>
}

/** La primera vez que aparece un comando de terminal sin sandbox, el aviso va completo; después, en una línea. */
function useAvisoSinSandbox(aplica: boolean): 'primera' | 'resumida' | null {
  const [modo, setModo] = useState<'primera' | 'resumida' | null>(null)
  useEffect(() => {
    if (!aplica) { setModo(null); return }
    let visto = false
    try { visto = window.localStorage.getItem(VISTO_SIN_SANDBOX) === '1'; window.localStorage.setItem(VISTO_SIN_SANDBOX, '1') } catch { /* sin almacenamiento: siempre completo */ }
    setModo(visto ? 'resumida' : 'primera')
  }, [aplica])
  return modo
}

export function DialogoConfirmacion({ c, sandbox, restantes, alResolver }: { c: Confirmacion; sandbox: EstadoSandbox | null; restantes: number; alResolver: () => void }) {
  const [armado, setArmado] = useState(false)
  const [ocupado, setOcupado] = useState<'permitir' | 'rechazar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const rechazarRef = useRef<HTMLButtonElement>(null)
  const Icono = c.herramienta === 'Bash' ? Terminal : (ICONO[c.categoria] ?? ShieldAlert)
  const origen = etiquetaOrigen(c)
  const avisos = avisosDe(c)
  const literal = c.literal ? literalVisible(c.literal).texto : null
  const sinSandbox = useAvisoSinSandbox(!!sandbox && !sandbox.disponible && c.herramienta === 'Bash')

  useEffect(() => { const t = window.setTimeout(() => setArmado(true), ARMADO_MS); rechazarRef.current?.focus(); return () => window.clearTimeout(t) }, [])
  useEffect(() => { const t = window.setInterval(() => setAhora(Date.now()), 1000); return () => window.clearInterval(t) }, [])

  const resolver = useCallback(async (decision: 'permitir' | 'rechazar') => {
    setOcupado(decision); setError(null)
    try {
      const r = await fetch('/api/confirmaciones/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, decision }) })
      if (!r.ok && r.status !== 404 && r.status !== 409) throw new Error((await r.json().catch(() => ({}))).error ?? 'No pude enviar tu decisión.')
      alResolver()
    } catch (e) { setError(e instanceof Error ? e.message : 'No pude enviar tu decisión.'); setOcupado(null) }
  }, [c.id, alResolver])

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) { e.preventDefault(); e.stopPropagation(); void resolver('rechazar') } }
    window.addEventListener('keydown', teclas, true)
    return () => window.removeEventListener('keydown', teclas, true)
  }, [resolver, ocupado])

  const segundos = Math.max(0, Math.round((c.expira - ahora) / 1000))
  const vence = segundos < 120 ? `${segundos} s` : `${Math.round(segundos / 60)} min`

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="cf-titulo" aria-describedby="cf-quien cf-literal" className="glass-panel-strong flex max-h-[calc(100vh-2rem)] w-full max-w-[600px] flex-col p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning" aria-hidden><Icono className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="cf-titulo" className="text-[16px] font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">{c.resumen || '¿Permitir esta acción?'}</h2>
            <p id="cf-quien" className="mt-0.5 text-[13px] text-muted">{origen.quien} quiere {VERBO[c.categoria] ?? VERBO.otra}. No pasa sin tu clic.</p>
          </div>
        </div>

        {(origen.marcas.length > 0 || avisos.length > 0) && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Origen y avisos">
            {origen.marcas.map(m => (
              <li key={`o-${m}`} className={`rounded-full border px-2 py-0.5 text-[11.5px] font-medium ${origen.sinVerificar ? 'border-warning/40 bg-warning/10 text-warning' : 'border-brand/35 bg-brand/10 text-foreground/85'}`}>{m}</li>
            ))}
            {avisos.map(a => (
              <li key={`a-${a}`} className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11.5px] text-warning">
                <AlertTriangle className="size-3 shrink-0" aria-hidden />{a}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 min-h-0">
          <p className="mb-1 text-[12px] font-medium text-muted">{literal ? 'Esto es exactamente lo que se va a ejecutar:' : 'El servidor no mandó el comando exacto. Si no sabes qué hace, rechaza.'}</p>
          {literal && (
            <pre id="cf-literal" tabIndex={0} aria-label="Comando exacto que se va a ejecutar"
              className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border-subtle bg-foreground/[0.05] p-3 font-mono text-[12px] leading-relaxed text-foreground select-text">{literal}</pre>
          )}
        </div>

        {c.detalle && (
          <details className="mt-2 text-[12.5px] text-muted">
            <summary className="cursor-pointer select-none py-1">Detalle</summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-foreground/[0.05] p-3 font-mono text-[11.5px] leading-relaxed text-foreground/85">{c.detalle}</pre>
          </details>
        )}

        {sinSandbox && sandbox && (
          <p role="note" className={`mt-3 rounded-lg border border-border-subtle bg-surface/80 px-3 py-2 text-[12.5px] leading-snug text-foreground/85 ${sinSandbox === 'primera' ? '' : 'text-muted'}`}>
            {sinSandbox === 'primera' ? avisoSinSandbox(sandbox) : 'Sin sandbox en este equipo: cada comando de terminal pide tu clic.'}
          </p>
        )}

        <p className="mt-3 text-[12px] text-muted">
          {c.herramienta ? <>Herramienta: <span className="font-mono">{c.herramienta}</span> · </> : null}{c.origen === 'manos' ? `Si no decides, se rechaza sola en ${vence}.` : 'Si no decides ahora, queda en tu cola: nada pasa sin tu clic.'}{restantes > 0 ? ` Hay ${restantes} más esperando.` : ''}
        </p>
        {error && <p role="alert" className="mt-2 text-[12.5px] text-error">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button ref={rechazarRef} type="button" disabled={!!ocupado} onClick={() => void resolver('rechazar')} className="btn-secondary min-h-11 !px-4">
            {ocupado === 'rechazar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Rechazar'}
          </button>
          <button type="button" disabled={!armado || !!ocupado} onClick={(e) => { if (!esClicHumano({ detail: e.detail, isTrusted: e.nativeEvent.isTrusted })) return; void resolver('permitir') }} className="btn-primary min-h-11 !px-4"
            title="Solo con un clic: el teclado no aprueba acciones">
            {ocupado === 'permitir' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Permitir esta acción'}
          </button>
        </div>
      </div>
    </div>
  )
}
