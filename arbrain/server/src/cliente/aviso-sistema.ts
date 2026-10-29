/**
 * Aviso del sistema cuando Levy espera un clic (0.2.15, A6 del diagnóstico del 29 oct 2026). En el video de un fundador la
 * tarjeta esperaba 90 s mientras Arbrain estaba tapada por WhatsApp: nadie la vio y «caducó». Ahora, al crear una
 * pendiente (o al pasarla a la cola) el daemon manda una notificación nativa, que llega aunque la ventana esté tapada o
 * minimizada: macOS por `osascript` (Centro de notificaciones), Windows por un toast de PowerShell, Linux por
 * `notify-send`. Una por confirmación, y nunca más de una cada pocos segundos. Si el sistema no tiene cómo avisar, no
 * pasa nada: la tarjeta y la cola siguen ahí. Instalación de Daniel: no se usa (sus avisos van por la campana).
 */
import { spawn } from 'node:child_process'
import { esEdicionCliente } from '../edicion.js'

export interface ComandoAviso { cmd: string; args: string[] }

const limpio = (t: string, max: number) => t.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
/** Dentro de una cadena de AppleScript: comillas y barras escapadas. */
const applescript = (t: string) => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
/** Dentro de un literal de PowerShell con comillas simples: la comilla simple se duplica. */
const ps = (t: string) => t.replace(/'/g, "''")

/** El comando nativo para avisar, o null si la plataforma no tiene uno. Puro. */
export function comandoAviso(titulo: string, cuerpo: string, plataforma: string = process.platform): ComandoAviso | null {
  const t = limpio(titulo, 80), c = limpio(cuerpo, 200)
  if (plataforma === 'darwin') return { cmd: 'osascript', args: ['-e', `display notification "${applescript(c)}" with title "${applescript(t)}" sound name "Glass"`] }
  if (plataforma === 'win32') {
    const guion = [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
      '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
      `$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)`,
      `$n = $t.GetElementsByTagName('text'); $n.Item(0).AppendChild($t.CreateTextNode('${ps(t)}')) | Out-Null; $n.Item(1).AppendChild($t.CreateTextNode('${ps(c)}')) | Out-Null`,
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Arbrain').Show([Windows.UI.Notifications.ToastNotification]::new($t))`,
    ].join('; ')
    return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', guion] }
  }
  if (plataforma === 'linux') return { cmd: 'notify-send', args: ['-a', 'Arbrain', t, c] }
  return null
}

const avisadas = new Set<string>()
let ultimo = 0
const SILENCIO_MS = 3_000

/**
 * Manda el aviso (una vez por `clave`, y no más de uno cada `SILENCIO_MS`). Devuelve qué hizo. `correr` se inyecta en
 * pruebas; por defecto lanza el comando sin esperar ni mirar su salida (un fallo nunca toca el turno).
 */
export function avisarSistema(clave: string, titulo: string, cuerpo: string, op: { plataforma?: string; correr?: (c: ComandoAviso) => void; ahora?: number; cliente?: boolean } = {}): 'enviado' | 'repetido' | 'silencio' | 'sin_como' | 'no_cliente' {
  if (!(op.cliente ?? esEdicionCliente())) return 'no_cliente'
  if (avisadas.has(clave)) return 'repetido'
  const ahora = op.ahora ?? Date.now()
  if (ahora - ultimo < SILENCIO_MS) return 'silencio'
  const c = comandoAviso(titulo, cuerpo, op.plataforma)
  if (!c) return 'sin_como'
  if (avisadas.size > 500) avisadas.clear()
  avisadas.add(clave)
  ultimo = ahora
  try {
    (op.correr ?? ((x: ComandoAviso) => { const h = spawn(x.cmd, x.args, { stdio: 'ignore', detached: true, windowsHide: true }); h.on('error', () => {}); h.unref() }))(c)
  } catch { /* sin cómo avisar: la tarjeta sigue en la app */ }
  return 'enviado'
}

/** Solo pruebas. */
export function _avisoSistemaParaPruebas(): void { avisadas.clear(); ultimo = 0 }
