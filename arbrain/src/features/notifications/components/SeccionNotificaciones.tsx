'use client'
/**
 * Ajustes › Notificaciones (12 oct 2026, Daniel: «no hay forma para que el usuario habilite las notificaciones»).
 * Cualquier persona con cuenta en Arbrain (el dueño, su equipo, quien siga) ve el estado de ESTE dispositivo, las activa en
 * un toque, se manda una prueba (solo a sí misma) y las apaga. En iPhone sin Arbrain en la pantalla de inicio, en vez de
 * un botón muerto, la guía de 3 pasos. Patrón de la comunidad (la web de la comunidad, perfil › Notificaciones).
 *
 * Edición cliente (v0.2.18, un fundador con iPhone): los avisos de SU Levy (una decisión pendiente, una rutina que
 * terminó, una respuesta larga con la app cerrada), sin la campana del negocio original. En iPhone: iOS 16.4+, Tu Arbrain
 * en la pantalla de inicio y entrando por su dirección de Tailscale (HTTPS). En la computadora se explica y se manda al
 * teléfono: ahí no hay service worker.
 */
import { useState } from 'react'
import { AlertTriangle, Bell, BellOff, CheckCircle2, Copy, Loader2, Send, Share, Smartphone, SquarePlus } from 'lucide-react'
import { resumenEstado } from '../lib/soportePush'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { esEdicionCliente } from '@/lib/edicion'
import { useAjustes } from '@/shared/stores/ajustes-store'
import { tr, trn, trNodos } from '@/shared/i18n'

const CLIENTE = esEdicionCliente()

/** Lo que tiene que cumplir un iPhone (siempre a la vista en la edición cliente). */
function RequisitosIphone() {
  const ir = useAjustes((s) => s.ir)
  return (
    <section aria-labelledby="notificaciones-iphone" className="solid-card px-4 py-4 sm:px-5" data-requisitos-iphone>
      <h3 id="notificaciones-iphone" className="text-sm font-semibold text-foreground/90">{tr('En iPhone')}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
        <li><strong className="font-medium text-foreground/85">{tr('iOS 16.4 o más.')}</strong> {tr('Lo ves en Ajustes › General › Información.')}</li>
        <li><strong className="font-medium text-foreground/85">{tr('Tu Arbrain en la pantalla de inicio.')}</strong> {tr('Apple solo entrega avisos a una app agregada desde Safari (Compartir › Agregar a pantalla de inicio).')}</li>
        <li><strong className="font-medium text-foreground/85">{tr('Entrando por tu dirección de Tailscale.')}</strong> {trNodos('La que empieza con {inicio} y termina en {fin}; sin HTTPS el iPhone no deja activarlos.', { inicio: <code className="text-xs">https://</code>, fin: <code className="text-xs">.ts.net</code> })}</li>
      </ul>
      <button type="button" onClick={() => ir('telefono')} className="mt-3 text-sm font-medium text-brand-ink underline-offset-2 hover:underline">
        {tr('Ver mi dirección en «Tu cerebro en el teléfono»')}
      </button>
    </section>
  )
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand-ink">{n}</span>
      <span className="text-sm leading-relaxed text-foreground/85">{children}</span>
    </li>
  )
}

export function SeccionNotificaciones() {
  const { estado, dispositivos, ocupado, error, activar, desactivar, enviarPrueba } = useNotificaciones()
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const [probando, setProbando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const activo = estado === 'activo'

  const mandarPrueba = async () => {
    setProbando(true); setPrueba(null)
    setPrueba(await enviarPrueba())
    setProbando(false)
  }

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/settings?seccion=notificaciones`)
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    } catch { /* sin portapapeles: el texto ya dice qué hacer */ }
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="notificaciones-estado" className="solid-card overflow-hidden" data-estado-push={estado}>
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${activo ? 'bg-brand/15 text-brand-ink' : 'bg-card-hover text-muted'}`}>
            {estado === 'cargando' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : activo ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h3 id="notificaciones-estado" className="text-sm font-semibold text-foreground/90">{tr('Este dispositivo')}</h3>
            <p className="mt-0.5 text-xs leading-snug text-muted" role="status">{resumenEstado(estado)}</p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          {estado === 'listo' && (
            <button type="button" onClick={() => void activar()} disabled={ocupado} className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 text-sm">
              {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bell className="size-4" aria-hidden />}
              {ocupado ? tr('Activando…') : tr('Activar notificaciones')}
            </button>
          )}

          {activo && (
            <>
              <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {tr('Listo. Te llegan aunque Arbrain esté cerrado.')}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void mandarPrueba()} disabled={probando} className="btn-secondary flex min-h-11 flex-1 items-center justify-center gap-2 text-sm">
                  {probando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                  {tr('Enviarme una prueba')}
                </button>
                <button type="button" onClick={() => void desactivar()} disabled={ocupado} className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40">
                  {ocupado ? tr('Un momento…') : tr('Desactivar')}
                </button>
              </div>
              {prueba && <p role="status" className={`text-sm ${prueba.ok ? 'text-success' : 'text-error'}`}>{tr(prueba.mensaje)}</p>}
            </>
          )}

          {estado === 'ios-instalar' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">{tr('Apple solo entrega notificaciones a {app} cuando vive en tu pantalla de inicio. Son 20 segundos:', { app: CLIENTE ? tr('Tu Arbrain') : 'Arbrain' })}</p>
              <ol className="space-y-2.5">
                <Paso n={1}>{trNodos(CLIENTE ? 'Toca {icono} {compartir} en la barra de Safari (con esta misma dirección de Tailscale abierta).' : 'Toca {icono} {compartir} en la barra de Safari.', { icono: <Share className="-mt-0.5 inline size-4 text-brand-ink" aria-label={tr('Compartir')} />, compartir: <strong>{tr('Compartir')}</strong> })}</Paso>
                <Paso n={2}>{trNodos('Elige {icono} {agregarInicio} y luego {agregar}.', { icono: <SquarePlus className="-mt-0.5 inline size-4 text-brand-ink" aria-hidden />, agregarInicio: <strong>{tr('Agregar a pantalla de inicio')}</strong>, agregar: <strong>{tr('Agregar')}</strong> })}</Paso>
                <Paso n={3}>{trNodos('Abre {app} desde el ícono nuevo, entra a {ruta} y toca {boton}.', { app: <strong>{CLIENTE ? tr('Tu Arbrain') : 'Arbrain'}</strong>, ruta: <strong>{tr('Ajustes › Notificaciones')}</strong>, boton: <strong>{tr('Activar notificaciones')}</strong> })}</Paso>
              </ol>
              <p className="text-xs text-muted">{tr('Tu sesión se queda iniciada. Necesitas iOS 16.4 o más.')}</p>
            </div>
          )}

          {estado === 'navegador-interno' && (
            <div className="space-y-3">
              <p className="text-sm text-muted">{trNodos('Estás dentro de otra app (WhatsApp, Instagram…). Abre este enlace en {safari} y agrega Arbrain a tu pantalla de inicio.', { safari: <strong>Safari</strong> })}</p>
              <button type="button" onClick={() => void copiarEnlace()} className="btn-secondary flex min-h-11 w-full items-center justify-center gap-2 text-sm">
                <Copy className="size-4" aria-hidden /> {copiado ? tr('Enlace copiado') : tr('Copiar enlace')}
              </button>
            </div>
          )}

          {estado === 'bloqueado' && (
            <div className="space-y-2 text-sm text-muted">
              <p className="flex items-start gap-2 text-gold"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {tr('Las bloqueaste antes y el teléfono no deja volver a preguntar.')}</p>
              <p className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
                <span>{trNodos('iPhone: {ruta}. Android o computadora: el candado junto a la dirección › Notificaciones › Permitir.', { ruta: <strong>{tr('Ajustes › Notificaciones › Arbrain › Permitir notificaciones')}</strong> })}</span>
              </p>
              <p>{tr('Luego vuelve aquí: el estado se actualiza solo.')}</p>
            </div>
          )}

          {estado === 'ios-actualizar' && <p className="text-sm text-muted">{tr('Actualiza tu iPhone en Ajustes › General › Actualización de software y vuelve aquí.')}</p>}
          {estado === 'en-computadora' && (
            <p className="text-sm text-muted">{tr('Los avisos de Levy llegan a tu teléfono. Abre tu Arbrain ahí por tu dirección de Tailscale (en iPhone, desde la pantalla de inicio) y actívalos en esta misma sección. Aquí en tu computadora sigues viendo todo en la app.')}</p>
          )}
          {estado === 'no-soportado' && (CLIENTE
            ? <p className="text-sm text-muted">{tr('Este navegador no recibe notificaciones. Abre tu Arbrain en tu teléfono por tu dirección de Tailscale (en iPhone, desde la pantalla de inicio) y actívalos ahí.')}</p>
            : <p className="text-sm text-muted">Aquí los avisos llegan a la campana. Para recibirlos en el teléfono, abre Arbrain ahí (en iPhone, desde la pantalla de inicio) y actívalos en esta misma sección.</p>)}
          {estado === 'sin-configurar' && (CLIENTE
            ? <p className="text-sm text-muted">{tr('A tu Arbrain le faltan sus llaves de avisos. Dile a Levy «actualiza mi Arbrain»: al reiniciarse las genera solo.')}</p>
            : <p className="text-sm text-muted">A este servidor le faltan las claves de notificaciones. Mientras tanto los avisos llegan a la campana.</p>)}

          {error && <p role="alert" className="text-sm text-error">{tr(error)}</p>}

          {dispositivos !== null && dispositivos > 0 && (
            <p className="text-xs text-muted">
              {activo
                ? dispositivos > 1 ? tr('Activas en {n} dispositivos tuyos, incluido este.', { n: dispositivos }) : tr('Este es tu único dispositivo con notificaciones.')
                : trn(dispositivos, 'Tienes otro dispositivo con notificaciones activas.', 'Tienes {n} dispositivos con notificaciones activas.')}
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="notificaciones-que" className="solid-card px-4 py-4 sm:px-5">
        <h3 id="notificaciones-que" className="text-sm font-semibold text-foreground/90">{tr('Qué te llega')}</h3>
        {CLIENTE ? (
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
            <li><strong className="font-medium text-foreground/85">{tr('Levy espera tu decisión:')}</strong> {tr('algo necesita tu sí o tu no; mientras, sigue con lo demás.')}</li>
            <li><strong className="font-medium text-foreground/85">{tr('Una rutina terminó:')}</strong> {tr('con lo que dejó o, si falló, por qué.')}</li>
            <li><strong className="font-medium text-foreground/85">{tr('Levy terminó tu respuesta:')}</strong> {tr('cuando tardó más de un minuto y cerraste la app.')}</li>
            <li>{tr('Uno por cada cosa, sin repetirse. Al tocarlo se abre donde está: la conversación o Taller › Rutinas.')}</li>
          </ul>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
            <li><strong className="font-medium text-foreground/85">Reportes:</strong> los que Levy te prepara (por ejemplo, el de la mañana).</li>
            <li><strong className="font-medium text-foreground/85">Avisos:</strong> cuando Levy termina un trabajo o necesita tu respuesta.</li>
            <li>Al tocar una, Arbrain abre su conversación. Todo queda también en la campana.</li>
          </ul>
        )}
      </section>

      {CLIENTE && <RequisitosIphone />}
    </div>
  )
}
