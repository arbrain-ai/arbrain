'use client'
/**
 * Dónde vive el editor (19 nov 2026, pedido del dueño: dos monitores; «para eso ya tengo el chat del otro lado», sin Levy flotante).
 *
 * En el escritorio el editor es una ventana nativa propia (`vista-editor`, ruta `/panel?editor=…`, por el mismo comando de
 * las ventanas desprendidas: `abrir_ventana`). La primera vez nace a tamaño completo en el monitor que NO tiene la ventana
 * principal; después la app recuerda su lugar (posición, tamaño y monitor) y la reabre ahí. Con un solo monitor, ocupa ese.
 * En el navegador (o el teléfono) es la ruta `/editor`, en la misma pestaña.
 */
import { isDesktopRuntime } from '@/lib/local-first/runtime'

export const ETIQUETA = 'vista-editor'
const CLAVE_YA = 'arbrain.editor.ventana-recordada'

export const rutaVentana = (proyecto?: string | null) => `/panel?editor=${encodeURIComponent(proyecto || 'galeria')}`
export const rutaWeb = (proyecto?: string | null) => (proyecto ? `/editor?proyecto=${encodeURIComponent(proyecto)}` : '/editor')

export interface MonitorL { x: number; y: number; ancho: number; alto: number }

/** El monitor donde nace: el que no contiene el centro de la ventana principal; con uno solo, ese. */
export function monitorDestino(monitores: MonitorL[], principal: { x: number; y: number }): MonitorL | null {
  if (!monitores.length) return null
  const dentro = (m: MonitorL) => principal.x >= m.x && principal.x < m.x + m.ancho && principal.y >= m.y && principal.y < m.y + m.alto
  const otros = monitores.filter(m => !dentro(m))
  // El más grande de los otros (sus dos monitores son iguales; con una laptop conectada, la grande).
  return [...(otros.length ? otros : monitores)].sort((a, b) => b.ancho * b.alto - a.ancho * a.alto)[0]
}

async function monitoresLogicos(): Promise<{ monitores: MonitorL[]; centro: { x: number; y: number } } | null> {
  try {
    const w = await import('@tauri-apps/api/window')
    const actual = w.getCurrentWindow()
    const [ms, pos, tam, escala] = await Promise.all([w.availableMonitors(), actual.outerPosition(), actual.outerSize(), actual.scaleFactor()])
    const monitores = ms.map(m => {
      const p = m.position.toLogical(m.scaleFactor), s = m.size.toLogical(m.scaleFactor)
      return { x: p.x, y: p.y, ancho: s.width, alto: s.height }
    })
    const p = pos.toLogical(escala), s = tam.toLogical(escala)
    return { monitores, centro: { x: p.x + s.width / 2, y: p.y + s.height / 2 } }
  } catch { return null }
}

/** Abre (o trae al frente) el editor. Devuelve dónde quedó. `pestanaNueva`: en el navegador, en otra pestaña (no se va del chat). */
export async function abrirEditor(proyecto?: string | null, o: { pestanaNueva?: boolean } = {}): Promise<'ventana' | 'pestana'> {
  return (await abrirEditorDetalle(proyecto, o)).via
}

export interface Apertura { via: 'ventana' | 'pestana'; monitores: number; otroMonitor: boolean }

export async function abrirEditorDetalle(proyecto?: string | null, o: { pestanaNueva?: boolean } = {}): Promise<Apertura> {
  if (!isDesktopRuntime()) {
    if (o.pestanaNueva) window.open(rutaWeb(proyecto), 'arbrain-editor'); else window.location.assign(rutaWeb(proyecto))
    return { via: 'pestana', monitores: 1, otroMonitor: false }
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const args: Record<string, unknown> = { etiqueta: ETIQUETA, ruta: rutaVentana(proyecto), titulo: 'Editor · Arbrain' }
  let recordada = false
  try { recordada = localStorage.getItem(CLAVE_YA) === '1' } catch { /* sin almacenamiento */ }
  const g = await monitoresLogicos()
  const monitores = g?.monitores.length ?? 1
  if (!recordada) {
    const m = g && monitorDestino(g.monitores, g.centro)
    // Un punto dentro del monitor destino + el tamaño del monitor: la ventana lo llena (Rust la ajusta bajo la barra de menús).
    if (m) Object.assign(args, { x: m.x + 100, y: m.y + 60, ancho: m.ancho, alto: m.alto })
  }
  try {
    await invoke('abrir_ventana', args)
    try { localStorage.setItem(CLAVE_YA, '1') } catch { /* sin almacenamiento */ }
    return { via: 'ventana', monitores, otroMonitor: monitores > 1 }
  } catch {
    window.location.assign(rutaWeb(proyecto))
    return { via: 'pestana', monitores, otroMonitor: false }
  }
}

/**
 * El comando `editor` del bus del panel (contrato §12.3: `mcp__editor__abrir_editor` → `{accion:"editor", input:{proyecto,
 * titulo, pantalla:"secundaria"}}`): abre el editor en ese proyecto en su ventana del otro monitor y dice dónde quedó.
 */
export async function atenderEditorBus(input: { proyecto?: unknown; titulo?: unknown } | undefined): Promise<{ ok: boolean; detalle: string; abiertas: string[]; donde?: string }> {
  const proyecto = typeof input?.proyecto === 'string' && /^prj_[A-Za-z0-9]{4,40}$/.test(input.proyecto) ? input.proyecto : null
  const titulo = typeof input?.titulo === 'string' && input.titulo.trim() ? input.titulo.trim().slice(0, 120) : proyecto ? `Editor · ${proyecto}` : 'Editor · galería'
  try {
    const a = await abrirEditorDetalle(proyecto, { pestanaNueva: true })
    const donde = a.via === 'pestana' ? 'otra pestaña del navegador' : a.otroMonitor ? 'ventana del editor, en el monitor secundario' : 'ventana del editor, a pantalla completa en el único monitor'
    return { ok: true, detalle: proyecto ? `abierto en el proyecto ${proyecto}` : 'abierto en la galería', abiertas: [titulo], donde }
  } catch (e) {
    return { ok: false, detalle: `no se pudo abrir el editor: ${e instanceof Error ? e.message : String(e)}`, abiertas: [] }
  }
}

/** F: pantalla completa. En la ventana nativa, la de macOS; en el navegador, la del documento. */
export async function alternarPantallaCompleta(): Promise<void> {
  if (isDesktopRuntime()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const w = getCurrentWindow()
      await w.setFullscreen(!(await w.isFullscreen()))
      return
    } catch { /* cae al documento */ }
  }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
  else await document.documentElement.requestFullscreen().catch(() => {})
}
