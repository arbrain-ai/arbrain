'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDashed, KeyRound, Loader2, XCircle } from 'lucide-react'
import { usePreferenciaMotor, type PreferenciaMotor } from './preferencia-store'
import { MOTOR_CLAUDE, motoresPorApi, opcionesNuevas, type EstadoMotor, type EstadoRegistro, type Registro } from './estado-motores'
import { nombreEsfuerzo } from '@/shared/lib/uso-modelo'
import { CatalogoModelos } from './CatalogoModelos'

/**
 * Configuración → Modelo y motores (2 oct 2026, segunda versión). Dos bloques:
 *  1. Motores: Claude (Claude Code SDK) y DeepSeek por OpenRouter con Codex como arnés. Cada uno dice si está
 *     activo y, si está bloqueado, qué se comprobó y qué falta (sin jerga del registro). GPT no se ofrece
 *     (motor sin cuenta activa).
 *  2. Conversaciones nuevas: en qué motor, modelo y esfuerzo nacen. «Como está» no toca nada. Cada conversación
 *     conserva lo suyo; dentro de ella se cambia en la barra del chat.
 * Las listas de modelos y esfuerzos salen del catálogo vivo de cada motor (las mismas rutas del selector del
 * chat); el registro del daemon solo publica el NOMBRE de la variable de cada llave.
 */

interface ModeloCatalogo { value: string; displayName: string; supportedEfforts?: string[] }

const VACIA: PreferenciaMotor = { motor: null, modelo: null, esfuerzo: null }

export function SeccionModelo() {
  const { preferencia, estado, error: errorCarga, cargar, guardar } = usePreferenciaMotor()
  const [registro, setRegistro] = useState<Registro | null>(null)
  const [estadoRegistro, setEstadoRegistro] = useState<EstadoRegistro>('cargando')
  const [borrador, setBorrador] = useState<PreferenciaMotor>(VACIA)
  const [modelos, setModelos] = useState<ModeloCatalogo[] | null>(null)
  const [modelosError, setModelosError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { if (preferencia) setBorrador(preferencia) }, [preferencia])
  useEffect(() => {
    let vivo = true
    fetch('/api/chat/modelos', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (r.status === 404) { setEstadoRegistro('viejo'); return }
        if (!r.ok) { setEstadoRegistro('error'); return }
        setRegistro(data as Registro); setEstadoRegistro('ok')
      })
      .catch(() => { if (vivo) setEstadoRegistro('error') })
    return () => { vivo = false }
  }, [])

  const motores = useMemo<EstadoMotor[]>(() => [MOTOR_CLAUDE, ...motoresPorApi(registro, estadoRegistro)], [registro, estadoRegistro])
  const opciones = useMemo(() => opcionesNuevas(motores, preferencia?.motor ?? null), [motores, preferencia?.motor])
  const motorElegido = motores.find((m) => m.id === borrador.motor)

  // Catálogo vivo del motor elegido (mismo endpoint que el selector del chat). Un motor bloqueado no se consulta:
  // su catálogo responde error mientras el motor esté apagado.
  useEffect(() => {
    if (!borrador.motor || !motorElegido?.disponible) { setModelos(null); setModelosError(null); return }
    let vivo = true
    setModelos(null); setModelosError(null)
    const qs = borrador.motor === 'default' ? '' : `?account=${encodeURIComponent(borrador.motor)}`
    fetch(`/api/chat/models${qs}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) { setModelosError(`El motor no entregó su lista de modelos (${r.status}).`); return }
        setModelos((Array.isArray(data.models) ? data.models : []).filter((m: ModeloCatalogo) => m?.value && m.value !== 'default'))
      })
      .catch(() => { if (vivo) setModelosError('Sin conexión con el servidor del chat.') })
    return () => { vivo = false }
  }, [borrador.motor, motorElegido?.disponible])

  const modeloElegido = modelos?.find((m) => m.value === borrador.modelo) ?? null
  // Sin modelo elegido, el esfuerzo se valida contra el modelo por defecto del motor en el daemon.
  const esfuerzos = modeloElegido?.supportedEfforts ?? (modelos?.length === 1 ? modelos[0].supportedEfforts ?? [] : [])
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(preferencia ?? VACIA)
  const sinServidor = estado === 'sin-servidor'
  const elegible = !borrador.motor || !!motorElegido?.disponible
  const llaves = registro?.proveedores.filter((p) => p.auth.kind === 'api-key') ?? []

  async function onGuardar() {
    setGuardando(true); setAviso(null)
    try {
      await guardar(borrador)
      setAviso({ tipo: 'ok', texto: borrador.motor ? 'Listo: las conversaciones nuevas nacen con esta elección.' : 'Listo: todo queda como estaba.' })
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-5" id="modelo" data-seccion-modelo>
      <CatalogoModelos />
      <section aria-labelledby="motores-titulo" className="solid-card overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h3 id="motores-titulo" className="text-sm font-semibold text-foreground/90">Motores</h3>
          <p className="mt-0.5 text-xs leading-snug text-muted">Lo que puede correr tus conversaciones hoy. OpenAI ya no se ofrece: no tiene suscripción.</p>
        </div>
        <ul className="divide-y divide-border-subtle">
          {motores.map((m) => <FilaMotor key={m.id} motor={m} />)}
        </ul>
        {llaves.length > 0 && (
          <p className="flex items-start gap-2 border-t border-border-subtle px-4 py-2.5 text-[11px] leading-snug text-muted sm:px-5">
            <KeyRound size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>Las llaves se quedan en el .env del Studio; aquí solo se ve el nombre de su variable: {llaves.map((p) => `${p.auth.variable} (${p.auth.presente ? 'presente' : 'falta'})`).join(', ')}.</span>
          </p>
        )}
      </section>

      <section aria-labelledby="nuevas-titulo" className="solid-card overflow-hidden p-4 sm:p-5">
        <h3 id="nuevas-titulo" className="text-sm font-semibold text-foreground/90">Conversaciones nuevas</h3>
        <p className="mt-0.5 text-xs leading-snug text-muted">Nacen con el último modelo y esfuerzo que usaste (se recuerda solo al enviar); si ese modelo está apagado en Modelos, con el primero encendido. Aquí puedes fijarlo a mano. Cada conversación conserva lo suyo.</p>

        {sinServidor && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-snug text-foreground/85">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
            <span>No se puede guardar todavía: el servidor del chat corre la versión anterior y no conoce esta preferencia. Lo resuelve el reinicio del servidor del chat, que hace Levy. Mientras, todo sigue como está.</span>
          </p>
        )}
        {estado === 'error' && errorCarga && <p role="alert" className="mt-3 text-xs text-red-400/85">{errorCarga}</p>}

        <fieldset className="mt-4 space-y-2" disabled={sinServidor || estado === 'cargando'}>
          <legend className="sr-only">Motor de las conversaciones nuevas</legend>
          {opciones.map((o) => {
            const activo = borrador.motor === o.id
            return (
              <label
                key={o.id ?? 'como-esta'}
                className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${activo ? 'border-primary/50 bg-primary/5' : 'border-border-subtle bg-card/40'} ${o.disponible ? 'cursor-pointer hover:bg-card-hover' : 'cursor-not-allowed'}`}
              >
                <input
                  type="radio" name="motor" className="mt-1 accent-[var(--primary)]"
                  checked={activo} disabled={!o.disponible}
                  onChange={() => { setBorrador({ motor: o.id, modelo: null, esfuerzo: null }); setAviso(null) }}
                />
                <span className={`min-w-0 flex-1 ${o.disponible ? '' : 'opacity-70'}`}>
                  <span className="block text-[13px] font-medium text-foreground/90">{o.titulo}</span>
                  <span className="block text-xs leading-snug text-muted">{o.detalle}</span>
                  {o.aviso && <span className="mt-0.5 block text-[11px] text-gold">{o.aviso}</span>}
                </span>
              </label>
            )
          })}
        </fieldset>

        {borrador.motor && motorElegido?.disponible && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted/80">Modelo</span>
              <select
                className="mt-1.5 h-11 w-full rounded-lg border border-border-subtle bg-card px-3 text-sm text-foreground/90"
                value={borrador.modelo ?? ''} disabled={!modelos}
                onChange={(e) => setBorrador((b) => ({ ...b, modelo: e.target.value || null, esfuerzo: null }))}
              >
                <option value="">El de la cuenta</option>
                {(modelos ?? []).map((m) => <option key={m.value} value={m.value}>{m.displayName}</option>)}
              </select>
              {!modelos && !modelosError && <span className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Loader2 size={11} className="animate-spin" aria-hidden /> Consultando el motor…</span>}
              {modelosError && <span className="mt-1 block text-[11px] text-red-400/85">{modelosError}</span>}
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted/80">Esfuerzo</span>
              <select
                className="mt-1.5 h-11 w-full rounded-lg border border-border-subtle bg-card px-3 text-sm text-foreground/90"
                value={borrador.esfuerzo ?? ''} disabled={!modelos || esfuerzos.length === 0}
                onChange={(e) => setBorrador((b) => ({ ...b, esfuerzo: e.target.value || null }))}
              >
                <option value="">El de la cuenta</option>
                {esfuerzos.map((e) => <option key={e} value={e}>{nombreEsfuerzo(e)}</option>)}
              </select>
              {modelos && esfuerzos.length === 0 && <span className="mt-1 block text-[11px] text-muted">Elige un modelo para ver sus niveles.</span>}
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button" onClick={onGuardar} disabled={!cambiado || guardando || sinServidor || !elegible}
            className="min-h-11 rounded-lg bg-primary/85 px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {!cambiado && !aviso && preferencia && <span className="text-xs text-muted">Sin cambios por guardar.</span>}
          {aviso && <span role="status" className={`text-xs ${aviso.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400/85'}`}>{aviso.texto}</span>}
        </div>
      </section>
    </div>
  )
}

function FilaMotor({ motor }: { motor: EstadoMotor }) {
  const comprobando = motor.etiqueta === 'Comprobando…'
  const Icono = comprobando ? Loader2 : motor.disponible ? CheckCircle2 : XCircle
  return (
    <li className="px-4 py-3 sm:px-5" data-motor={motor.id} data-motor-disponible={motor.disponible}>
      <div className="flex items-start gap-3">
        <Icono className={`mt-0.5 size-4 shrink-0 ${comprobando ? 'animate-spin text-muted' : motor.disponible ? 'text-emerald-400' : 'text-gold'}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-semibold text-foreground">{motor.titulo}</span>
            <span className={`text-[11px] font-medium ${motor.disponible ? 'text-emerald-400' : 'text-gold'}`}>{motor.etiqueta}</span>
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted">{motor.detalle}</p>
          {motor.queFalta && (
            <p className="mt-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-snug text-foreground/85" data-que-falta>
              <span className="font-semibold">Por qué está bloqueado: </span>{motor.queFalta}
            </p>
          )}
          {motor.pasos.length > 0 && (
            <details className="group mt-2">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted hover:text-foreground/80 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden /> Qué se comprobó
              </summary>
              <ul className="mt-1 space-y-1 pl-4">
                {motor.pasos.map((p) => {
                  const I = p.ok === null ? CircleDashed : p.ok ? CheckCircle2 : XCircle
                  return (
                    <li key={p.texto} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                      <I className={`mt-px size-3 shrink-0 ${p.ok ? 'text-emerald-400' : p.ok === false ? 'text-gold' : ''}`} aria-hidden />
                      <span>{p.texto}</span>
                    </li>
                  )
                })}
              </ul>
            </details>
          )}
        </div>
      </div>
    </li>
  )
}
