'use client'
// Segundo Cerebro — constelación 3D (Arbrain). Motor propio: proyección 3D por
// SOFTWARE sobre <canvas> 2D (el mismo path de render que el atlas 2D y
// DrawEditor3, probado estable en el webview). CERO WebGL a propósito: el stack
// anterior (react-force-graph-3d + three) crasheaba el backend ANGLE-Metal del
// WKWebView de macOS y, al ser un webview de UN proceso, congelaba la app
// entera (incidente 11 jul 2026). Evitar WebGL elimina la clase completa del
// bug: la escena 3D vive en JS (layout force-directed en 3 ejes + cámara
// orbital con perspectiva + depth-sort + fog) y se rasteriza con Canvas2D.
// La operación sigue AI-first: este componente solo MUESTRA; abrir nodo,
// slice, búsqueda y síntesis conservan el mismo contrato que el GraphCanvas 2D.
import { useEffect, useRef } from 'react'
import type { CerebroEdge, CerebroNode, CerebroNodeType } from '../types'
import { TYPE_META, esDelAhora } from '../types'
import { prefiereQuieto } from '@/shared/movimiento'
import { coincide, entrada, escalones, formaDe, nacer, trazarForma, type Forma } from './lienzo-casa'

interface Graph3DProps {
  nodes: CerebroNode[]
  edges: CerebroEdge[]
  visibleTypes: CerebroNodeType[]
  query: string
  selectedId: string | null
  multiSelection: string[]
  onSelect: (id: string | null, additive: boolean) => void
}

// ── Nodo de simulación/render (posición 3D + proyección en pantalla) ────────
interface SimNode {
  id: string
  node: CerebroNode
  r: number
  color: string
  forma: Forma
  ahora: boolean
  escalon: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  // proyección del frame actual
  sx: number
  sy: number
  scale: number
  depth: number
  onScreen: boolean
}

interface SimLink {
  source: SimNode
  target: SimNode
  kind: CerebroEdge['kind']
}

// ── Forma orgánica del layout (procedural, determinista) ────────────────────
// Dos lóbulos elipsoidales definen el VOLUMEN donde vive la constelación. Es
// solo matemática para el layout: no se dibuja ninguna malla (Daniel mató la
// "piel" visual el 6 jul: metía ruido).
const LOBE = { rx: 23, ry: 24, rz: 36, offset: 14 }

// Sesgo por tipo hacia regiones del volumen para que los clusters sean
// legibles en 3D (mismos valores que la versión three.js original).
const TYPE_REGION: Record<CerebroNodeType, { x: number; y: number; z: number }> = {
  user: { x: 0, y: 10, z: 26 }, // El dueño al frente
  project: { x: 0, y: 16, z: 0 }, // proyectos en la corona
  feedback: { x: -22, y: 0, z: -6 }, // reglas al lado izquierdo
  reference: { x: 22, y: 0, z: -6 }, // referencias al derecho
  skill: { x: 0, y: -2, z: 4 }, // skills al centro: son el puente entre memorias (5 oct 2026)
  documento: { x: 0, y: -20, z: 8 }, // documentos del negocio abajo, la base
  concept: { x: 0, y: 4, z: -28 }, // conceptos atrás
  connection: { x: 0, y: -10, z: -18 }, // conexiones atrás-abajo
}

const FOV = (50 * Math.PI) / 180
const MIN_DIST = 34
const MAX_DIST = 520

// ── Random determinista por id: el layout es ESTABLE entre sesiones ─────────
// (misma constelación cada vez que se abre; nada de Math.random)
function hash32(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Física: port fiel de las fuerzas de la versión anterior (d3-style) ──────
// Corre UNA vez por dataset (~300 ticks síncronos, <100ms con ~224 nodos); el
// render loop después solo proyecta — no hay física por frame.
function runLayout(nodes: SimNode[], links: SimLink[]) {
  const LINK_DIST = (l: SimLink) => (l.kind === 'tag' ? 46 : 24)
  const LINK_STRENGTH = (l: SimLink) => (l.kind === 'tag' ? 0.06 : 0.3)
  const CHARGE = -42
  const DECAY = 0.6 // velocityDecay 0.4 de d3

  // conteo de links por nodo (bias del link force, como d3)
  const degree = new Map<SimNode, number>()
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
  }

  let alpha = 1
  const alphaDecay = 1 - Math.pow(0.001, 1 / 300)
  for (let tick = 0; tick < 300; tick++) {
    alpha += (0 - alpha) * alphaDecay

    // Repulsión many-body O(n²): 224² es trivial y determinista.
    // Softening d3-style: d² se clampa a ≥1 — sin esto un par casi-solapado
    // genera fuerzas ~1e7 y el layout explota a Infinity/NaN.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dz = b.z - a.z
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 1e-6) {
          // par exactamente solapado: dirección determinista para separarlo
          dx = (((hash32(a.id) % 100) - 50) || 7) * 0.01
          dy = (((hash32(b.id) % 100) - 50) || -5) * 0.01
          dz = 0.5
          d2 = dx * dx + dy * dy + dz * dz
        }
        if (d2 < 1) d2 = 1
        const f = (CHARGE * alpha) / d2
        a.vx += dx * f
        a.vy += dy * f
        a.vz += dz * f
        b.vx -= dx * f
        b.vy -= dy * f
        b.vz -= dz * f
      }
    }

    // Springs de links
    for (const l of links) {
      const s = l.source
      const t = l.target
      let dx = t.x + t.vx - s.x - s.vx
      let dy = t.y + t.vy - s.y - s.vy
      let dz = t.z + t.vz - s.z - s.vz
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist < 1e-6) {
        dx = 1e-3
        dist = 1e-3
      }
      const k = ((dist - LINK_DIST(l)) / dist) * alpha * LINK_STRENGTH(l)
      const bias =
        (degree.get(s) ?? 1) / (((degree.get(s) ?? 1) + (degree.get(t) ?? 1)) || 1)
      t.vx -= dx * k * bias
      t.vy -= dy * k * bias
      t.vz -= dz * k * bias
      s.vx += dx * k * (1 - bias)
      s.vy += dy * k * (1 - bias)
      s.vz += dz * k * (1 - bias)
    }

    // brainForce: sesgo por tipo + shell de los dos lóbulos + fisura central
    for (const n of nodes) {
      const region = TYPE_REGION[n.node.type]
      n.vx += (region.x - n.x) * 0.028 * alpha
      n.vy += (region.y - n.y) * 0.028 * alpha
      n.vz += (region.z - n.z) * 0.028 * alpha
      const cx = n.x >= 0 ? LOBE.offset : -LOBE.offset
      const qx = (n.x - cx) / LOBE.rx
      const qy = n.y / (n.y < 0 ? LOBE.ry * 0.82 : LOBE.ry)
      const qz = n.z / LOBE.rz
      const rho = Math.sqrt(qx * qx + qy * qy + qz * qz)
      if (Math.abs(n.x) < 5 && n.y > -6) {
        const dir = n.x >= 0 ? 1 : -1
        n.vx += dir * 0.45 * alpha * ((5 - Math.abs(n.x)) / 5)
      }
      if (rho > 0.97) {
        // Cap del empuje: sin él la fuerza es cuadrática en la posición y un
        // nodo lanzado lejos entra en oscilación inestable (explota a NaN)
        const f = Math.min((rho - 0.97) * 1.6, 1.2) * alpha
        n.vx -= (n.x - cx) * f
        n.vy -= n.y * f
        n.vz -= n.z * f
      } else if (rho < 0.55 && rho > 0.0001) {
        const f = (0.55 - rho) * 1.3 * alpha
        n.vx += (n.x - cx) * f
        n.vy += n.y * f
        n.vz += n.z * f
      }
    }

    // Integración + fricción + clamp de velocidad (cinturón anti-explosión:
    // ninguna fuerza puede mover un nodo más de 12 unidades por tick)
    for (const n of nodes) {
      n.vx = Math.max(-12, Math.min(12, n.vx * DECAY))
      n.vy = Math.max(-12, Math.min(12, n.vy * DECAY))
      n.vz = Math.max(-12, Math.min(12, n.vz * DECAY))
      n.x += n.vx
      n.y += n.vy
      n.z += n.vz
    }
  }

  // Red final: si algo no-finito sobrevivió, re-sembrar ese nodo determinista
  // (jamás debe pasar con los caps de arriba, pero un NaN aquí mataría el render)
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) {
      const rnd = mulberry(hash32(n.id + ':rescue'))
      const region = TYPE_REGION[n.node.type]
      n.x = region.x + (rnd() - 0.5) * 20
      n.y = region.y + (rnd() - 0.5) * 18
      n.z = region.z + (rnd() - 0.5) * 20
      n.vx = n.vy = n.vz = 0
    }
  }
}

// ── Sprites pre-rendereados (glow aditivo + core) por color de tipo ──────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const SPRITE = 96 // px del sprite offscreen; se escala con drawImage
function makeGlowSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const ctx = c.getContext('2d')!
  const [r, g, b] = hexToRgb(color)
  const grad = ctx.createRadialGradient(
    SPRITE / 2, SPRITE / 2, 0,
    SPRITE / 2, SPRITE / 2, SPRITE / 2,
  )
  grad.addColorStop(0, `rgba(${r},${g},${b},0.65)`)
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.28)`)
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SPRITE, SPRITE)
  return c
}
function makeCoreSprite(color: string, forma: Forma = 'circulo'): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const ctx = c.getContext('2d')!
  const [r, g, b] = hexToRgb(color)
  // núcleo con centro caliente (casi blanco) → punto de luz, no disco plano
  const grad = ctx.createRadialGradient(
    SPRITE / 2, SPRITE / 2, 0,
    SPRITE / 2, SPRITE / 2, SPRITE / 2,
  )
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.28, `rgba(${Math.min(r + 90, 255)},${Math.min(g + 90, 255)},${Math.min(b + 90, 255)},1)`)
  grad.addColorStop(0.62, `rgba(${r},${g},${b},1)`)
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = grad
  // Rombo para skills, cuadro para documentos (lienzo-casa.ts): la familia se lee por forma
  trazarForma(ctx, forma, SPRITE / 2, SPRITE / 2, forma === 'circulo' ? SPRITE / 2 : SPRITE / 2.6)
  ctx.fillStyle = grad
  ctx.fill()
  return c
}

// ── Cámara orbital ───────────────────────────────────────────────────────────
interface Camera {
  theta: number // azimut
  phi: number // elevación
  dist: number
  tx: number
  ty: number
  tz: number
}

export function Graph3D({
  nodes,
  edges,
  visibleTypes,
  query,
  selectedId,
  multiSelection,
  onSelect,
}: Graph3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simNodesRef = useRef<SimNode[]>([])
  const simLinksRef = useRef<SimLink[]>([])
  const camRef = useRef<Camera>({ theta: 0.49, phi: 0.31, dist: 165, tx: 0, ty: 0, tz: 0 })
  const autoRotateRef = useRef(true)
  const hoverRef = useRef<string | null>(null)
  const neighborsRef = useRef(new Map<string, Set<string>>())
  const hubLabelsRef = useRef(new Set<string>())
  const nacioRef = useRef<number | null>(null)
  const focusTargetRef = useRef<string | null>(null)
  const rafRef = useRef(0)

  // Props vivas para el loop de render sin re-crear la escena
  const liveRef = useRef({ visibleTypes, query, selectedId, multiSelection, onSelect })
  liveRef.current = { visibleTypes, query, selectedId, multiSelection, onSelect }

  // ── Dataset → posiciones iniciales deterministas → layout (una vez) ───────
  useEffect(() => {
    const prev = new Map(simNodesRef.current.map((n) => [n.id, n]))
    const pasos = escalones(nodes)
    nacioRef.current = nacer(`3d:${nodes.length}`)
    const simNodes: SimNode[] = nodes.map((n) => {
      const kept = prev.get(n.id)
      const rnd = mulberry(hash32(n.id))
      const region = TYPE_REGION[n.type]
      return {
        id: n.id,
        node: n,
        r: Math.min(0.85 + Math.sqrt(n.degree) * 0.5, 3.1),
        color: TYPE_META[n.type].color,
        forma: formaDe(n.type),
        ahora: esDelAhora(n),
        escalon: pasos.get(n.id) ?? 0,
        x: kept?.x ?? region.x + (rnd() - 0.5) * 30,
        y: kept?.y ?? region.y + (rnd() - 0.5) * 26,
        z: kept?.z ?? region.z + (rnd() - 0.5) * 30,
        vx: 0,
        vy: 0,
        vz: 0,
        sx: 0,
        sy: 0,
        scale: 0,
        depth: 0,
        onScreen: false,
      }
    })
    const byId = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = []
    for (const e of edges) {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (s && t) simLinks.push({ source: s, target: t, kind: e.kind })
    }
    // Vecindarios (para atenuar en hover/selección, mismas reglas que el 2D)
    const nb = new Map<string, Set<string>>()
    for (const l of simLinks) {
      if (l.kind === 'tag') continue
      if (!nb.has(l.source.id)) nb.set(l.source.id, new Set())
      if (!nb.has(l.target.id)) nb.set(l.target.id, new Set())
      nb.get(l.source.id)!.add(l.target.id)
      nb.get(l.target.id)!.add(l.source.id)
    }
    neighborsRef.current = nb

    runLayout(simNodes, simLinks)
    simNodesRef.current = simNodes
    simLinksRef.current = simLinks

    // Solo los hubs top hablan por default (constelación silenciosa; el resto
    // de labels aparece con hover/selección/slice/búsqueda)
    hubLabelsRef.current = new Set(
      [...simNodes]
        .sort((a, b) => b.node.degree - a.node.degree)
        .slice(0, 14)
        .map((n) => n.id),
    )

    // Auto-encuadre: distancia que abraza la esfera del layout
    let maxR = 1
    for (const n of simNodes) {
      maxR = Math.max(maxR, Math.hypot(n.x, n.y, n.z))
    }
    const cam = camRef.current
    cam.dist = Math.min(Math.max((maxR / Math.tan(FOV / 2)) * 1.18, MIN_DIST), MAX_DIST)
    cam.tx = 0
    cam.ty = 0
    cam.tz = 0
  }, [nodes, edges])

  // ── Render loop + interacciones (canvas 2D puro, sin WebGL) ────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const syncSize = (): boolean => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect || rect.width < 10 || rect.height < 10) return false
      if (Math.abs(rect.width - width) > 1 || Math.abs(rect.height - height) > 1) {
        width = rect.width
        height = rect.height
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      return true
    }
    syncSize()
    const ro = new ResizeObserver(() => syncSize())
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    // Sprites por tipo (glow + core), una sola vez
    const glowSprites = new Map<string, HTMLCanvasElement>()
    const coreSprites = new Map<string, HTMLCanvasElement>()
    for (const meta of Object.values(TYPE_META)) {
      if (!glowSprites.has(meta.color)) {
        glowSprites.set(meta.color, makeGlowSprite(meta.color))
        coreSprites.set(meta.color, makeCoreSprite(meta.color, meta.forma))
      }
    }

    // Estrellas de fondo: fijas en el mundo (parallax real al orbitar)
    const starRnd = mulberry(hash32('arbrain-stars'))
    const stars = Array.from({ length: 150 }, () => {
      const az = starRnd() * Math.PI * 2
      const el = (starRnd() - 0.5) * Math.PI
      const rad = 230 + starRnd() * 260
      const tint = starRnd()
      return {
        x: rad * Math.cos(el) * Math.sin(az),
        y: rad * Math.sin(el),
        z: rad * Math.cos(el) * Math.cos(az),
        a: 0.1 + starRnd() * 0.3,
        r: 0.6 + starRnd() * 1.1,
        // Sin estrellas de oro (5 oct 2026): el oro es solo de las neuronas que cambiaron en 48 h
        color: tint < 0.72 ? '255,255,255' : '167,139,250',
      }
    })

    // ── Proyección de un punto del mundo a pantalla ─────────────────────────
    let camX = 0, camY = 0, camZ = 0
    let rX = 1, rY = 0, rZ = 0 // right
    let uX = 0, uY = 1, uZ = 0 // up
    let fX = 0, fY = 0, fZ = -1 // forward
    let focal = 1

    const updateCameraBasis = () => {
      const cam = camRef.current
      const cp = Math.cos(cam.phi)
      camX = cam.tx + cam.dist * cp * Math.sin(cam.theta)
      camY = cam.ty + cam.dist * Math.sin(cam.phi)
      camZ = cam.tz + cam.dist * cp * Math.cos(cam.theta)
      // forward = normalize(target - cam)
      let fx = cam.tx - camX, fy = cam.ty - camY, fz = cam.tz - camZ
      const fl = Math.hypot(fx, fy, fz) || 1
      fx /= fl; fy /= fl; fz /= fl
      // right = normalize(cross(forward, worldUp=(0,1,0))) = (-f.z, 0, f.x)
      // (phi está clampeado a ±1.35 rad: nunca degenera mirando en vertical)
      const rx = -fz
      const ry = 0
      const rz = fx
      const rl = Math.hypot(rx, ry, rz) || 1
      rX = rx / rl; rY = ry / rl; rZ = rz / rl
      // up = cross(right, forward)
      uX = rY * fz - rZ * fy
      uY = rZ * fx - rX * fz
      uZ = rX * fy - rY * fx
      fX = fx; fY = fy; fZ = fz
      focal = height / 2 / Math.tan(FOV / 2)
    }

    const project = (x: number, y: number, z: number) => {
      const dx = x - camX, dy = y - camY, dz = z - camZ
      const zc = dx * fX + dy * fY + dz * fZ
      if (zc < 2) return null
      const xc = dx * rX + dy * rY + dz * rZ
      const yc = dx * uX + dy * uY + dz * uZ
      return {
        sx: width / 2 + (xc * focal) / zc,
        sy: height / 2 - (yc * focal) / zc,
        scale: focal / zc,
        depth: zc,
      }
    }

    const neighborSets = () => {
      const { selectedId: sel } = liveRef.current
      const focus = hoverRef.current ?? sel
      if (!focus) return null
      return new Set<string>([focus, ...(neighborsRef.current.get(focus) ?? [])])
    }

    // ── Frame ────────────────────────────────────────────────────────────────
    // «Reducir movimiento»: sin órbita automática (la casa: quieto llega a su estado final)
    const quieto = prefiereQuieto()
    const drawOrder: number[] = []
    const draw = () => {
      const { visibleTypes: vt, query: q, selectedId: sel, multiSelection: multi } =
        liveRef.current
      const cam = camRef.current
      const visible = new Set(vt)
      const lowerQ = q.trim().toLowerCase()
      const matches = lowerQ
        ? new Set(simNodesRef.current.filter((n) => coincide(n.node, lowerQ)).map((n) => n.id))
        : null
      const reloj = performance.now()
      const hood = neighborSets()
      const multiSet = new Set(multi)
      const focus = hoverRef.current ?? sel

      // Órbita automática sutil hasta que Daniel toma el control
      if (autoRotateRef.current && !quieto) cam.theta += 0.0016

      // Centrado suave al seleccionar desde fuera (backlinks, búsqueda, click)
      if (focusTargetRef.current) {
        const target = simNodesRef.current.find((n) => n.id === focusTargetRef.current)
        if (target) {
          cam.tx += (target.x - cam.tx) * 0.1
          cam.ty += (target.y - cam.ty) * 0.1
          cam.tz += (target.z - cam.tz) * 0.1
          const wantDist = 78
          cam.dist += (wantDist - cam.dist) * 0.06
          if (
            Math.abs(target.x - cam.tx) < 0.4 &&
            Math.abs(target.y - cam.ty) < 0.4 &&
            Math.abs(target.z - cam.tz) < 0.4
          ) {
            focusTargetRef.current = null
          }
        } else {
          focusTargetRef.current = null
        }
      }

      updateCameraBasis()

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Fondo: idéntico a la app (#09090b) + nebulosa Luminorphism sutil
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, width, height)
      const neb = ctx.createRadialGradient(
        width * 0.5, height * 0.46, 0,
        width * 0.5, height * 0.46, Math.max(width, height) * 0.62,
      )
      neb.addColorStop(0, 'rgba(140,39,241,0.07)')
      neb.addColorStop(0.55, 'rgba(140,39,241,0.025)')
      neb.addColorStop(1, 'rgba(140,39,241,0)')
      ctx.fillStyle = neb
      ctx.fillRect(0, 0, width, height)

      // Estrellas (parallax con la órbita)
      for (const s of stars) {
        const p = project(s.x, s.y, s.z)
        if (!p || p.sx < -4 || p.sy < -4 || p.sx > width + 4 || p.sy > height + 4) continue
        ctx.globalAlpha = s.a
        ctx.fillStyle = `rgba(${s.color},1)`
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // Proyección de todos los nodos (una vez por frame)
      const ns = simNodesRef.current
      const zNear = cam.dist - 60
      const zSpan = 150
      for (const n of ns) {
        const p = project(n.x, n.y, n.z)
        if (!p) {
          n.onScreen = false
          continue
        }
        n.sx = p.sx
        n.sy = p.sy
        n.scale = p.scale
        n.depth = p.depth
        n.onScreen =
          p.sx > -60 && p.sy > -60 && p.sx < width + 60 && p.sy < height + 60
      }

      const nodeAlpha = (n: SimNode): number => {
        if (!visible.has(n.node.type)) return 0
        const e = entrada(nacioRef.current, n.escalon, reloj)
        if (matches) return (matches.has(n.id) || multiSet.has(n.id) ? 1 : 0.07) * e
        if (hood && !hood.has(n.id) && !multiSet.has(n.id)) return 0.1 * e
        return e
      }
      // Fog: profundidad → atenúa (lejos = más tenue, se lee la profundidad)
      const fogOf = (depth: number) =>
        1 - Math.min(Math.max((depth - zNear) / zSpan, 0), 1) * 0.6

      // Aristas (detrás de los nodos)
      for (const l of simLinksRef.current) {
        const s = l.source
        const t = l.target
        if (!s.onScreen && !t.onScreen) continue
        const aS = nodeAlpha(s)
        const aT = nodeAlpha(t)
        if (aS === 0 || aT === 0) continue
        const pairAlpha = Math.min(aS, aT)
        const fog = fogOf((s.depth + t.depth) / 2)
        const touchesFocus = focus && (s.id === focus || t.id === focus)
        ctx.beginPath()
        ctx.moveTo(s.sx, s.sy)
        ctx.lineTo(t.sx, t.sy)
        if (touchesFocus && sel && (s.id === sel || t.id === sel)) {
          ctx.strokeStyle = `rgba(233,213,255,${0.85 * fog})`
          ctx.lineWidth = 1.5
          ctx.setLineDash([])
        } else if (touchesFocus) {
          ctx.strokeStyle = `rgba(167,139,250,${0.6 * fog})`
          ctx.lineWidth = 1.3
          ctx.setLineDash([])
        } else if (l.kind === 'tag') {
          ctx.strokeStyle = `rgba(140,140,165,${0.1 * pairAlpha * fog})`
          ctx.lineWidth = 1
          ctx.setLineDash([3, 4])
        } else {
          ctx.strokeStyle = `rgba(167,139,250,${0.26 * pairAlpha * fog})`
          ctx.lineWidth = 1
          ctx.setLineDash([])
        }
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Nodos: depth-sort atrás → adelante (los cercanos tapan a los lejanos)
      drawOrder.length = 0
      for (let i = 0; i < ns.length; i++) if (ns[i].onScreen) drawOrder.push(i)
      drawOrder.sort((a, b) => ns[b].depth - ns[a].depth)

      // Pass 1: glow aditivo (constelación de puntos de LUZ, look Luminorphism)
      ctx.globalCompositeOperation = 'lighter'
      for (const i of drawOrder) {
        const n = ns[i]
        const alpha = nodeAlpha(n)
        if (alpha === 0) continue
        const fog = fogOf(n.depth)
        const pr = Math.max(n.r * n.scale, 1.4)
        const glowR = pr * 3.4
        ctx.globalAlpha = 0.5 * alpha * fog
        const sprite = glowSprites.get(n.color)!
        ctx.drawImage(sprite, n.sx - glowR, n.sy - glowR, glowR * 2, glowR * 2)
      }
      ctx.globalCompositeOperation = 'source-over'

      // Pass 2: cores + halos + labels
      for (const i of drawOrder) {
        const n = ns[i]
        const alpha = nodeAlpha(n)
        if (alpha === 0) continue
        const fog = fogOf(n.depth)
        const pr = Math.max(n.r * n.scale, 1.4)
        ctx.globalAlpha = alpha * (0.55 + 0.45 * fog)
        const core = coreSprites.get(n.color)!
        ctx.drawImage(core, n.sx - pr, n.sy - pr, pr * 2, pr * 2)

        // Aislado: anillo punteado tenue (nadie lo referencia)
        if (n.node.degree === 0 && alpha > 0.5) {
          ctx.beginPath()
          ctx.arc(n.sx, n.sy, pr + 3, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(160,160,175,${0.4 * fog})`
          ctx.lineWidth = 1
          ctx.setLineDash([2, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        // Oro: cambió en las últimas 48 h (lo único dorado de la constelación)
        if (n.ahora && alpha > 0.3) {
          ctx.globalAlpha = alpha
          trazarForma(ctx, n.forma, n.sx, n.sy, pr + 2.4)
          ctx.strokeStyle = 'rgba(255,145,1,0.9)'
          ctx.lineWidth = 1.4
          ctx.stroke()
        }
        // Halo claro: seleccionado · halo MORADO punteado: en el slice
        if (n.id === sel) {
          ctx.globalAlpha = 1
          trazarForma(ctx, n.forma, n.sx, n.sy, pr + 4.5)
          ctx.strokeStyle = '#E9D5FF'
          ctx.lineWidth = 2
          ctx.stroke()
        } else if (multiSet.has(n.id)) {
          ctx.globalAlpha = 1
          ctx.beginPath()
          ctx.arc(n.sx, n.sy, pr + 4, 0, Math.PI * 2)
          ctx.strokeStyle = '#A78BFA'
          ctx.lineWidth = 1.7
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        } else if (matches?.has(n.id)) {
          ctx.globalAlpha = 1
          trazarForma(ctx, n.forma, n.sx, n.sy, pr + 4)
          ctx.strokeStyle = 'rgba(167,139,250,0.95)'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Labels screen-space: al enfocar, en el slice, en match o de cerca
        const focused =
          n.id === sel || n.id === hoverRef.current || (hood?.has(n.id) ?? false)
        // En 3D todo cae denso en pantalla: solo hablan los nodos ENFOCADOS
        // (hover/selección/slice/match), los hubs top del grafo, o cualquier
        // nodo con MUCHO zoom encima — el resto es constelación silenciosa
        const showLabel =
          focused ||
          multiSet.has(n.id) ||
          matches?.has(n.id) ||
          (hubLabelsRef.current.has(n.id) && pr > 7) ||
          pr > 24
        if (showLabel && alpha > 0.3) {
          const label =
            n.node.title.length > 34 ? n.node.title.slice(0, 32) + '…' : n.node.title
          ctx.globalAlpha = Math.min(alpha, 0.55 + 0.45 * fog)
          ctx.font = `${focused ? 600 : 500} 10.5px Montserrat, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.lineWidth = 3
          ctx.strokeStyle = 'rgba(9,9,11,0.85)'
          ctx.strokeText(label, n.sx, n.sy + pr + 4)
          ctx.fillStyle = focused ? '#f7f8f8' : 'rgba(200,200,210,0.78)'
          ctx.fillText(label, n.sx, n.sy + pr + 4)
        }
        ctx.globalAlpha = 1
      }
    }

    let stopped = false
    const step = () => {
      if (stopped) return
      if (syncSize()) draw()
      rafRef.current = requestAnimationFrame(step)
    }
    step()

    // ── Interacciones: drag = orbitar · wheel = acercar · click = nodo ──────
    let pointerDown = false
    let moved = 0
    let lastX = 0
    let lastY = 0

    const evtPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.x, y: e.clientY - rect.y }
    }

    const hitTest = (sx: number, sy: number): SimNode | null => {
      const { visibleTypes: vt } = liveRef.current
      const visible = new Set(vt)
      let best: SimNode | null = null
      for (const n of simNodesRef.current) {
        if (!n.onScreen || !visible.has(n.node.type)) continue
        const pr = Math.max(n.r * n.scale, 1.4)
        const hitR = Math.max(pr + 3, 9)
        const dx = sx - n.sx
        const dy = sy - n.sy
        if (dx * dx + dy * dy <= hitR * hitR) {
          if (!best || n.depth < best.depth) best = n // el más cercano a cámara
        }
      }
      return best
    }

    const onPointerDown = (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* pointer sintético (tests) o ya liberado */
      }
      pointerDown = true
      moved = 0
      const p = evtPos(e)
      lastX = p.x
      lastY = p.y
    }
    const onPointerMove = (e: PointerEvent) => {
      const p = evtPos(e)
      if (!pointerDown) {
        const hit = hitTest(p.x, p.y)
        hoverRef.current = hit?.id ?? null
        canvas.style.cursor = hit ? 'pointer' : 'grab'
        return
      }
      const dx = p.x - lastX
      const dy = p.y - lastY
      moved += Math.abs(dx) + Math.abs(dy)
      lastX = p.x
      lastY = p.y
      if (moved > 3) {
        autoRotateRef.current = false
        focusTargetRef.current = null
      }
      const cam = camRef.current
      cam.theta -= dx * 0.0052
      cam.phi = Math.min(Math.max(cam.phi + dy * 0.0052, -1.35), 1.35)
      canvas.style.cursor = 'grabbing'
    }
    const onPointerUp = (e: PointerEvent) => {
      pointerDown = false
      canvas.style.cursor = 'grab'
      if (moved < 5) {
        const p = evtPos(e)
        const hit = hitTest(p.x, p.y)
        liveRef.current.onSelect(hit?.id ?? null, e.shiftKey || e.metaKey)
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      autoRotateRef.current = false
      focusTargetRef.current = null
      const cam = camRef.current
      cam.dist = Math.min(Math.max(cam.dist * Math.exp(e.deltaY * 0.0016), MIN_DIST), MAX_DIST)
    }
    const onDblClick = () => {
      // doble click en el fondo = re-encuadrar (mismo gesto que el 2D)
      let maxR = 1
      for (const n of simNodesRef.current) {
        maxR = Math.max(maxR, Math.hypot(n.x, n.y, n.z))
      }
      const cam = camRef.current
      cam.tx = 0
      cam.ty = 0
      cam.tz = 0
      cam.dist = Math.min(Math.max((maxR / Math.tan(FOV / 2)) * 1.18, MIN_DIST), MAX_DIST)
      focusTargetRef.current = null
    }
    const onPointerLeave = () => {
      if (!pointerDown) {
        hoverRef.current = null
        canvas.style.cursor = 'grab'
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDblClick)

    // Hooks de verificación agéntica (dev o ?debug=1): proyección de un nodo a
    // coords de pantalla para poder clickearlo headless + estado del motor.
    const params = new URLSearchParams(window.location.search)
    if (process.env.NODE_ENV !== 'production' || params.get('debug') === '1') {
      const w = window as unknown as Record<string, unknown>
      w.__cerebroScreenPos = (id: string) => {
        const n = simNodesRef.current.find((sn) => sn.id === id || sn.id.includes(id))
        if (!n) return null
        const rect = canvas.getBoundingClientRect()
        return { id: n.id, x: rect.x + n.sx, y: rect.y + n.sy, inFront: n.onScreen }
      }
      w.__cerebroNodes = () =>
        simNodesRef.current.map((n) => ({ id: n.id, degree: n.node.degree }))
      w.__cerebroDebug = () => ({
        engine: 'canvas3d',
        nodes: simNodesRef.current.length,
        links: simLinksRef.current.length,
        camera: { ...camRef.current },
        autoRotate: autoRotateRef.current,
      })
    }

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDblClick)
    }
  }, [])

  // Foco de cámara al seleccionar (backlinks, búsqueda o click)
  useEffect(() => {
    if (selectedId) {
      focusTargetRef.current = selectedId
      autoRotateRef.current = false
    }
  }, [selectedId])

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ cursor: 'grab' }} />
}
