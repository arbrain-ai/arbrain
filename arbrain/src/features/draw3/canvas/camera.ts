/**
 * Camera transformations (world ↔ screen)
 *
 * Canvas v3 uses world coordinates for all elements. The camera maps
 * world space → screen space at render time.
 */
import type { Camera, BBox } from '../elements/types'

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 }
export const MIN_ZOOM = 0.01
export const MAX_ZOOM = 20

export interface ScreenPoint { x: number; y: number }
export interface WorldPoint { x: number; y: number }

export function worldToScreen(p: WorldPoint, camera: Camera, viewport: { width: number; height: number }): ScreenPoint {
  return {
    x: (p.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (p.y - camera.y) * camera.zoom + viewport.height / 2,
  }
}

export function screenToWorld(p: ScreenPoint, camera: Camera, viewport: { width: number; height: number }): WorldPoint {
  return {
    x: (p.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (p.y - viewport.height / 2) / camera.zoom + camera.y,
  }
}

export function panCamera(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...camera,
    x: camera.x - dxScreen / camera.zoom,
    y: camera.y - dyScreen / camera.zoom,
  }
}

/**
 * Zoom centered at cursor position (in screen coords).
 * factor > 1 zooms in.
 */
export function zoomCamera(
  camera: Camera,
  factor: number,
  cursor: ScreenPoint,
  viewport: { width: number; height: number }
): Camera {
  const nextZoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  if (nextZoom === camera.zoom) return camera

  // Keep cursor world position stable
  const worldBefore = screenToWorld(cursor, camera, viewport)
  const newCamera = { ...camera, zoom: nextZoom }
  const worldAfter = screenToWorld(cursor, newCamera, viewport)
  return {
    ...newCamera,
    x: newCamera.x + (worldBefore.x - worldAfter.x),
    y: newCamera.y + (worldBefore.y - worldAfter.y),
  }
}

export function setZoomAtCenter(
  camera: Camera,
  zoom: number,
  viewport: { width: number; height: number },
): Camera {
  return zoomCamera(camera, zoom / camera.zoom, { x: viewport.width / 2, y: viewport.height / 2 }, viewport)
}

export function fitToBBox(
  bbox: BBox,
  viewport: { width: number; height: number },
  padding = 64
): Camera {
  if (bbox.width === 0 || bbox.height === 0) return DEFAULT_CAMERA
  const availW = Math.max(viewport.width - padding * 2, 1)
  const availH = Math.max(viewport.height - padding * 2, 1)
  const zoom = clamp(Math.min(availW / bbox.width, availH / bbox.height), MIN_ZOOM, MAX_ZOOM)
  return {
    x: (bbox.minX + bbox.maxX) / 2,
    y: (bbox.minY + bbox.maxY) / 2,
    zoom,
  }
}

export function viewportInWorld(camera: Camera, viewport: { width: number; height: number }): BBox {
  const halfW = (viewport.width / 2) / camera.zoom
  const halfH = (viewport.height / 2) / camera.zoom
  return {
    minX: camera.x - halfW,
    minY: camera.y - halfH,
    maxX: camera.x + halfW,
    maxY: camera.y + halfH,
    width: halfW * 2,
    height: halfH * 2,
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
