'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck, ShieldAlert, Mic, AudioLines, Accessibility, MonitorUp, Workflow, Keyboard,
  Bell, HardDrive, Camera, ExternalLink, RefreshCw, Loader2, Fingerprint, TerminalSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { esEdicionCliente } from '@/lib/edicion'
import {
  GRUPOS, abrirPanel, fichaEnEdicion, leerPermisos, pedirPermiso, permisosDisponibles,
  type EstadoPermiso, type EstadoPermisos, type Identidad, type Permiso, type PermisoId,
} from '../lib/permisos'

const CLIENTE = esEdicionCliente()
const ficha = (id: PermisoId) => fichaEnEdicion(id, CLIENTE)

const ICONOS: Record<PermisoId, LucideIcon> = {
  microfono: Mic, voz: AudioLines, accesibilidad: Accessibility, pantalla: MonitorUp,
  automatizacion: Workflow, entrada: Keyboard, notificaciones: Bell, disco: HardDrive, camara: Camera,
}

const PILDORA: Record<EstadoPermiso, { texto: string; clase: string }> = {
  concedido: { texto: 'Permitido', clase: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/30' },
  pendiente: { texto: 'Sin permitir', clase: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  denegado: { texto: 'Negado', clase: 'bg-red-500/10 text-red-400 border-red-500/30' },
  restringido: { texto: 'Restringido', clase: 'bg-card-hover text-muted border-border-subtle' },
  sin_dato: { texto: 'Sin dato', clase: 'bg-card-hover text-muted border-border-subtle' },
}

function Fila({ permiso, ocupado, onPedir, onAbrir }: {
  permiso: Permiso
  ocupado: boolean
  onPedir: () => void
  onAbrir: () => void
}) {
  const f = ficha(permiso.id)
  const Icono = ICONOS[permiso.id]
  const sinUso = f.grupo === 'sin_uso'
  const pildora = sinUso ? { texto: 'Sin uso', clase: PILDORA.sin_dato.clase } : PILDORA[permiso.estado]
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-card-hover border border-border-subtle shrink-0">
        <Icono size={15} className="text-foreground/70" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground/85">{f.titulo}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${pildora.clase}`}>{pildora.texto}</span>
        </div>
        <p className="text-xs text-muted/80 mt-0.5">{f.para}</p>
        {permiso.detalle && !sinUso && <p className="text-[11px] text-muted/60 mt-0.5">{permiso.detalle}</p>}
      </div>
      {!sinUso && (
        <div className="flex items-center gap-1.5 shrink-0">
          {permiso.sePuedePedir && (
            <button
              type="button"
              onClick={onPedir}
              disabled={ocupado}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/80 text-white hover:bg-primary transition-colors disabled:opacity-40"
            >
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : 'Permitir'}
            </button>
          )}
          <button
            type="button"
            onClick={onAbrir}
            title="Abrir este panel en Ajustes del Sistema"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-foreground/70 border border-border hover:bg-card-hover transition-colors"
          >
            Ajustes <ExternalLink size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

function Firma({ titulo, icono: Icono, identidad, estable, cambia }: {
  titulo: string
  icono: LucideIcon
  identidad: Identidad
  estable: string
  cambia: string
}) {
  const ok = identidad.firma === 'estable'
  const nombre = identidad.identificador ?? identidad.ruta?.split('/').pop() ?? 'desconocida'
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icono size={15} className={`mt-0.5 shrink-0 ${ok ? 'text-emerald-400' : 'text-amber-400'}`} />
      <div className="min-w-0">
        <p className="text-sm text-foreground/85">{titulo}</p>
        <p className="text-xs text-muted/80 mt-0.5">{ok ? estable : cambia}</p>
        <p className="text-[11px] text-muted/60 mt-0.5 font-mono truncate" title={identidad.requisito ?? undefined}>
          {nombre}{identidad.autoridad ? ` · ${identidad.autoridad}` : ok ? '' : ' · firma ad hoc'}
        </p>
      </div>
    </div>
  )
}

export function CentroPermisos() {
  const [disponible, setDisponible] = useState<boolean | null>(null)
  const [estado, setEstado] = useState<EstadoPermisos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [pidiendo, setPidiendo] = useState<PermisoId | null>(null)

  const refrescar = useCallback(async () => {
    setCargando(true)
    try {
      setEstado(await leerPermisos())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    const ok = permisosDisponibles()
    setDisponible(ok)
    if (!ok) return
    void refrescar()
    // Al volver de Ajustes del Sistema el estado cambia: releerlo sin que Daniel lo pida.
    const alVolver = () => { if (document.visibilityState === 'visible') void refrescar() }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [refrescar])

  const pedir = async (id: PermisoId) => {
    setPidiendo(id)
    try {
      const nuevo = await pedirPermiso(id)
      setEstado((prev) => prev && { ...prev, permisos: prev.permisos.map((p) => (p.id === id ? nuevo : p)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPidiendo(null)
    }
  }

  const usados = estado?.permisos.filter((p) => ficha(p.id).grupo !== 'sin_uso') ?? []
  const concedidos = usados.filter((p) => p.estado === 'concedido').length

  return (
    <section id="permisos" className="solid-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-muted" />
            <h2 className="text-sm font-semibold text-foreground/85">Permisos de macOS</h2>
            {estado && (
              <span className="text-[11px] text-muted/80 font-mono">{concedidos} de {usados.length} permitidos</span>
            )}
          </div>
          <p className="text-xs text-muted/80 mt-1">
            Lo que Arbrain puede hacer en tu Mac. Nada se pide al abrir la app: cada permiso se pide la primera vez
            que una función lo necesita, o aquí con «Permitir».
          </p>
        </div>
        {disponible && (
          <button
            type="button"
            onClick={() => void refrescar()}
            className="p-1.5 rounded-lg text-muted hover:text-foreground/80 hover:bg-card-hover transition-colors"
            title="Volver a leer los permisos"
            aria-label="Volver a leer los permisos"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {disponible === false && (
        <p className="px-5 py-4 text-xs text-muted/80">
          Disponible en la app de escritorio: el navegador no puede leer los permisos de macOS.
        </p>
      )}

      {error && <p className="px-5 py-3 text-xs text-red-400 border-b border-border-subtle">{error}</p>}

      {disponible && !estado && !error && (
        <div className="px-5 py-6 flex items-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" /> Leyendo permisos…</div>
      )}

      {estado && (
        <div className="divide-y divide-border-subtle">
          {GRUPOS.map((grupo) => {
            const filas = estado.permisos.filter((p) => ficha(p.id).grupo === grupo.id)
            if (filas.length === 0) return null
            return (
              <div key={grupo.id}>
                <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted/70 font-mono">{grupo.titulo}</p>
                <div className="divide-y divide-border-subtle/60">
                  {filas.map((p) => (
                    <Fila
                      key={p.id}
                      permiso={p}
                      ocupado={pidiendo === p.id}
                      onPedir={() => void pedir(p.id)}
                      onAbrir={() => void abrirPanel(p.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <div>
            <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted/70 font-mono">Que reinstalar no los borre</p>
            <Firma
              titulo="Arbrain"
              icono={Fingerprint}
              identidad={estado.app}
              estable="Firma estable: una reinstalación conserva todos los permisos."
              cambia="Firma ad hoc: macOS trata cada compilación como otra app y vuelve a preguntar todo."
            />
            {estado.motor && (
              <div className="flex items-start">
                <div className="flex-1 min-w-0">
                  <Firma
                    titulo="Terminales y agentes (motor)"
                    icono={TerminalSquare}
                    identidad={estado.motor}
                    estable="Lo que hacen los agentes en tus terminales se le concede al motor, y su firma es estable."
                    cambia="Lo que hacen los agentes en tus terminales se le concede al motor, y su firma cambia en cada compilación: por eso macOS vuelve a preguntar."
                  />
                </div>
                {estado.motor.firma !== 'estable' && (
                  <button
                    type="button"
                    onClick={() => void abrirPanel('gestion_apps')}
                    className="m-3 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-foreground/70 border border-border hover:bg-card-hover transition-colors shrink-0"
                  >
                    <ShieldAlert size={11} /> Ajustes
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
