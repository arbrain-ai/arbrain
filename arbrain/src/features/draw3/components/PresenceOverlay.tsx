/**
 * Overlays DOM de presence (fase 5): cursores remotos + flash de actividad
 * del agente. DOM en vez de canvas: baratos, no tocan el render loop y
 * se re-posicionan solos con cada re-render por cambio de camara.
 */
'use client'
import { worldToScreen } from '../canvas/camera'
import { usePresenceStore } from '../stores/presence-store'
import { bboxFromElement, type CanvasElement, type Camera } from '../elements/types'
import type { AgentFlash } from './hooks/useCanvasPresence'

type Viewport = { width: number; height: number; dpr: number }

export function RemoteCursorsOverlay({ camera, viewport }: { camera: Camera; viewport: Viewport }) {
  const users = usePresenceStore(s => s.users)
  const selfClientId = usePresenceStore(s => s.selfClientId)
  if (users.size === 0) return null

  return (
    <div data-draw3-ui className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Array.from(users.values()).map(user => {
        if (user.clientId === selfClientId || !user.cursor) return null
        const screen = worldToScreen(user.cursor, camera, viewport)
        if (screen.x < -40 || screen.y < -40 || screen.x > viewport.width + 40 || screen.y > viewport.height + 40) return null
        return (
          <div
            key={user.clientId}
            className="absolute transition-transform duration-75"
            style={{ transform: `translate(${screen.x}px, ${screen.y}px)` }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" style={{ display: 'block' }}>
              <path d="M0 0 L16 12 L8.5 13 L5 20 Z" fill={user.user.color} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
            </svg>
            <span
              className="absolute left-4 top-4 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-black/85"
              style={{ backgroundColor: user.user.color }}
            >
              {user.user.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AgentFlashOverlay({
  flash,
  elements,
  camera,
  viewport,
}: {
  flash: AgentFlash | null
  elements: CanvasElement[]
  camera: Camera
  viewport: Viewport
}) {
  if (!flash || flash.ids.size === 0) return null
  const flashed = elements.filter(el => flash.ids.has(el.id))
  if (flashed.length === 0) return null

  let badgePlaced = false
  return (
    <div data-draw3-ui className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {flashed.map(el => {
        const box = bboxFromElement(el)
        const tl = worldToScreen({ x: box.minX, y: box.minY }, camera, viewport)
        const br = worldToScreen({ x: box.maxX, y: box.maxY }, camera, viewport)
        const width = Math.max(8, br.x - tl.x)
        const height = Math.max(8, br.y - tl.y)
        if (br.x < 0 || br.y < 0 || tl.x > viewport.width || tl.y > viewport.height) return null
        const showBadge = !badgePlaced
        badgePlaced = true
        return (
          <div
            key={el.id}
            className="absolute rounded-lg animate-pulse"
            style={{
              left: tl.x - 4,
              top: tl.y - 4,
              width: width + 8,
              height: height + 8,
              border: '2px solid rgba(167, 139, 250, 0.9)',
              boxShadow: '0 0 18px rgba(167, 139, 250, 0.55), inset 0 0 12px rgba(167, 139, 250, 0.12)',
            }}
          >
            {showBadge && (
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
                ✨ Levy
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
