'use client'
/**
 * Secciones pequeñas de Configuración (2 oct 2026): Apariencia, Cuenta, Notificaciones y Mac y sistema. Salen de la
 * página vieja de /settings con el mismo comportamiento, en español y sin lo que pertenece a otra parte
 * (etiquetas → Board, pestaña Crons → lista de conversaciones del chat). Censo: docs/builds/configuracion-orden-2026-10-02.
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Camera, Loader2, Mail, Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { updateAvatar, updateProfile } from '@/actions/auth'
import { ThemeToggle } from '@/shared/components/ThemeToggle'
import { CentroPermisos } from '@/features/permisos/components/CentroPermisos'
import { TarjetaComputerUse } from '@/features/permisos/components/ComputerUse'
import { esEdicionCliente } from '@/lib/edicion'

function Tarjeta({ titulo, detalle, children, accion }: { titulo: string; detalle?: string; children?: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="solid-card overflow-hidden">
      <div className={`flex items-center justify-between gap-4 px-4 py-3 sm:px-5 ${children ? 'border-b border-border-subtle' : ''}`}>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground/90">{titulo}</h3>
          {detalle && <p className="mt-0.5 text-xs leading-snug text-muted">{detalle}</p>}
        </div>
        {accion}
      </div>
      {children && <div className="px-4 py-4 sm:px-5">{children}</div>}
    </section>
  )
}

export function SeccionApariencia() {
  return (
    <Tarjeta
      titulo="Tema"
      detalle="Oscuro, claro o el del sistema. También con el botón de la luna al pie de la barra lateral o la tecla T."
      accion={<div className="w-36 shrink-0"><ThemeToggle /></div>}
    />
  )
}

export function SeccionCuenta() {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState('')
  const [cargado, setCargado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  if (profile && !cargado) { setNombre(profile.full_name ?? ''); setCargado(true) }

  const foto = vistaPrevia ?? profile?.avatar_url
  const iniciales = (profile?.full_name ?? profile?.email ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const cambiarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVistaPrevia(URL.createObjectURL(file)); setSubiendo(true); setMensaje(null)
    const fd = new FormData(); fd.append('avatar', file)
    const r = await updateAvatar(fd)
    setSubiendo(false)
    if (r.error) { setMensaje({ tipo: 'error', texto: r.error }); setVistaPrevia(null) }
    else { setMensaje({ tipo: 'ok', texto: 'Foto actualizada.' }); if (r.avatar_url) setVistaPrevia(r.avatar_url) }
  }

  const guardarNombre = async () => {
    setGuardando(true); setMensaje(null)
    const fd = new FormData(); fd.append('full_name', nombre)
    const r = await updateProfile(fd)
    setGuardando(false)
    setMensaje(r.error ? { tipo: 'error', texto: r.error } : { tipo: 'ok', texto: 'Nombre actualizado.' })
  }

  return (
    <Tarjeta titulo="Perfil" detalle="Tu nombre y tu foto en Arbrain.">
      <div className="space-y-4">
        {mensaje && (
          <p role="status" className={`rounded-lg px-3 py-2 text-xs ${mensaje.tipo === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>{mensaje.texto}</p>
        )}
        <div className="flex items-start gap-4 sm:gap-5">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative shrink-0" disabled={subiendo} aria-label="Cambiar la foto">
            {foto ? (
              <img src={foto} alt="" className="size-16 rounded-full border-2 border-border object-cover sm:size-20" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-full border-2 border-border bg-primary text-lg font-bold text-white sm:size-20">{iniciales}</div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {subiendo ? <Loader2 size={18} className="animate-spin text-white/80" /> : <Camera size={18} className="text-white/80" />}
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={cambiarFoto} className="hidden" />
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor="perfil-nombre" className="text-xs font-medium text-muted">Nombre</label>
            <div className="flex gap-2">
              <input
                id="perfil-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
                className="input-field min-h-11 min-w-0 flex-1 px-3 text-sm md:min-h-9"
              />
              <button
                type="button" onClick={guardarNombre} disabled={guardando || nombre === (profile?.full_name ?? '')}
                className="btn-primary min-h-11 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-30 md:min-h-9"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border-subtle pt-3">
          <span className="flex items-center gap-2 text-xs text-muted"><Mail size={14} className="text-muted/80" aria-hidden />{profile?.email ?? '—'}</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            <Shield size={14} className="text-muted/80" aria-hidden />
            {profile?.role === 'owner' ? 'Dueño' : profile?.role === 'admin' ? 'Administrador' : 'Miembro'}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            <CalendarDays size={14} className="text-muted/80" aria-hidden />
            Desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'}
          </span>
        </div>
      </div>
    </Tarjeta>
  )
}

// Ajustes › Notificaciones (12 oct 2026): estado, activar, prueba y apagar por dispositivo. Vive con su feature.
export { SeccionNotificaciones as SeccionAvisos } from '@/features/notifications/components/SeccionNotificaciones'

export function SeccionMac() {
  return (
    <div className="space-y-5">
      {/* Permisos de macOS: estado real, para qué sirve y su panel exacto (1 oct 2026) */}
      <CentroPermisos />
      {/* Computer use (10 oct 2026): interruptor general de las manos. Edición cliente 0.1.2 (revierte DECISIONES #11):
          interruptor en macOS y Windows, apagado en cada apertura; en Linux la misma tarjeta es un aviso sin interruptor. */}
      <TarjetaComputerUse />
      {/* Ops se retiró el 5 oct 2026: los crons viven en Rutinas y el rastro de agentes en el Taller › Registro. */}
      {/* El Registro lee la base del dueño: en la edición cliente no existe. */}
      {!esEdicionCliente() && <Tarjeta
        titulo="Registro de agentes"
        detalle="Turnos, errores y rutinas de los agentes, en vivo. Vive en el Taller del panel."
        accion={
          <Link href="/chat?panel=taller&taller=registro" className="nav-item min-h-11 shrink-0 border border-border-subtle px-3 text-xs md:min-h-9">
            Abrir el Registro <ArrowRight size={12} aria-hidden />
          </Link>
        }
      />}
    </div>
  )
}
