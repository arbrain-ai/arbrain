'use client'
// Segundo Cerebro — grafo 2D force-directed en <canvas> nativo (patrón del repo:
// DrawEditor3 también es canvas puro). d3-force da la física estilo Obsidian;
// el render es nuestro para respetar el design system (tokens + Montserrat).
import { useEffect, useRef } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force'
import type { CerebroEdge, CerebroNode, CerebroNodeType } from '../types'
import { esDelAhora } from '../types'
import { alCambiarTema, coincide, entrada, escalones, formaDe, leerPaleta, nacer, trazarForma, type Forma, type PaletaLienzo } from './lienzo-casa'

interface SimNode {
  id: string
  node: CerebroNode
  r: number
  forma: Forma
  ahora: boolean
  escalon: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface SimLink {
  source: SimNode | string
  target: SimNode | string
  kind: CerebroEdge['kind']
}

interface GraphCanvasProps {
  nodes: CerebroNode[]
  edges: CerebroEdge[]
  visibleTypes: CerebroNodeType[]
  query: string
  selectedId: string | null
  multiSelection: string[]
  onSelect: (id: string | null, additive: boolean) => void
}

const MIN_ZOOM = 0.12
const MAX_ZOOM = 5

export function GraphCanvas({
  nodes,
  edges,
  visibleTypes,
  query,
  selectedId,
  multiSelection,
  onSelect,
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const simNodesRef = useRef<SimNode[]>([])
  const simLinksRef = useRef<SimLink[]>([])
  const transformRef = useRef({ x: 0, y: 0, k: 0.9 })
  const hoverRef = useRef<string | null>(null)
  const rafRef = useRef(0)
  const didFitRef = useRef(false)
  const fitFramesRef = useRef(0)
  const userInteractedRef = useRef(false)
  const focusTargetRef = useRef<string | null>(null)
  // Lenguaje de la casa (5 oct 2026): paleta del tema y entrada una sola vez (lienzo-casa.ts)
  const paletaRef = useRef<PaletaLienzo | null>(null)
  const nacioRef = useRef<number | null>(null)

  // Props vivas para el loop de render sin re-crear la simulación
  const liveRef = useRef({ visibleTypes, query, selectedId, multiSelection, onSelect })
  liveRef.current = { visibleTypes, query, selectedId, multiSelection, onSelect }

  // ── Simulación: se (re)construye solo cuando cambia el dataset ────────────
  useEffect(() => {
    const prev = new Map(simNodesRef.current.map((n) => [n.id, n]))
    const pasos = escalones(nodes)
    nacioRef.current = nacer(`2d:${nodes.length}`)
    const simNodes: SimNode[] = nodes.map((n) => {
      const kept = prev.get(n.id)
      return {
        id: n.id,
        node: n,
        r: Math.min(4 + Math.sqrt(n.degree) * 2.2, 17),
        forma: formaDe(n.type),
        ahora: esDelAhora(n),
        escalon: pasos.get(n.id) ?? 0,
        x: kept?.x,
        y: kept?.y,
        vx: kept?.vx,
        vy: kept?.vy,
      }
    })
    const ids = new Set(simNodes.map((n) => n.id))
    const simLinks: SimLink[] = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, kind: e.kind }))

    simNodesRef.current = simNodes
    simLinksRef.current = simLinks

    simRef.current?.stop()
    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'tag' ? 120 : 70))
          .strength((l) => (l.kind === 'tag' ? 0.12 : 0.45)),
      )
      .force('charge', forceManyBody().strength(-160))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide<SimNode>((d) => d.r + 7))
      .force('fx', forceX(0).strength(0.045))
      .force('fy', forceY(0).strength(0.06))
    // El timer interno de d3 usa rAF, que Chrome pausa en tabs ocultas.
    // Lo apagamos y avanzamos la física manualmente desde nuestro loop (step()).
    // Pre-asentamos el layout síncronamente (~300 ticks, decenas de ms con ~170
    // nodos): el atlas aparece YA organizado; el drag lo recalienta después.
    sim.stop()
    sim.alpha(1)
    sim.tick(300)
    simRef.current = sim
    // Re-encuadrar el nuevo dataset. El render-loop (deps []) no se re-monta, así
    // que el contador de fit vive en un ref que reseteamos aquí (no en una var
    // local del loop). Sin esto, un "Re-escanear memoria" no re-encuadraba.
    didFitRef.current = false
    fitFramesRef.current = 0
    userInteractedRef.current = false
    return () => {
      sim.stop()
    }
  }, [nodes, edges])

  // ── Render loop + interacciones ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // El tamaño se re-verifica en CADA frame: en el mount (StrictMode/HMR) el
    // rect puede medir 0 y un fit con width=0 colapsa el zoom a MIN_ZOOM.
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
        return true // cambió
      }
      return true
    }
    syncSize()
    paletaRef.current = leerPaleta(canvas)
    const soltarTema = alCambiarTema(() => { paletaRef.current = leerPaleta(canvas) })
    const ro = new ResizeObserver(() => {
      if (syncSize() && !userInteractedRef.current) fitView()
    })
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const toScreen = (wx: number, wy: number) => {
      const t = transformRef.current
      return {
        x: wx * t.k + t.x + width / 2,
        y: wy * t.k + t.y + height / 2,
      }
    }
    const toWorld = (sx: number, sy: number) => {
      const t = transformRef.current
      return {
        x: (sx - width / 2 - t.x) / t.k,
        y: (sy - height / 2 - t.y) / t.k,
      }
    }

    const fitView = () => {
      const ns = simNodesRef.current
      if (ns.length === 0) return
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of ns) {
        if (n.x == null || n.y == null) continue
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
      }
      if (!Number.isFinite(minX)) return
      const spanX = Math.max(maxX - minX, 100)
      const spanY = Math.max(maxY - minY, 100)
      const k = Math.min((width - 120) / spanX, (height - 120) / spanY, 1.6)
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      transformRef.current = {
        k: Math.max(k, MIN_ZOOM),
        x: -cx * Math.max(k, MIN_ZOOM),
        y: -cy * Math.max(k, MIN_ZOOM),
      }
    }

    const neighborSets = () => {
      const { selectedId: sel } = liveRef.current
      const focus = hoverRef.current ?? sel
      if (!focus) return null
      const set = new Set<string>([focus])
      for (const l of simLinksRef.current) {
        const s = typeof l.source === 'string' ? l.source : l.source.id
        const t = typeof l.target === 'string' ? l.target : l.target.id
        if (s === focus) set.add(t)
        if (t === focus) set.add(s)
      }
      return set
    }

    const draw = () => {
      const { visibleTypes: vt, query: q, selectedId: sel, multiSelection: multi } =
        liveRef.current
      const visible = new Set(vt)
      const lowerQ = q.trim().toLowerCase()
      const matches = lowerQ
        ? new Set(simNodesRef.current.filter((n) => coincide(n.node, lowerQ)).map((n) => n.id))
        : null
      const pal = paletaRef.current ?? leerPaleta(canvas)
      const reloj = performance.now()
      const hood = neighborSets()
      const multiSet = new Set(multi)

      // Autofit: en los primeros frames con tamaño VÁLIDO (el layout del shell
      // tarda en estabilizarse) y hasta que el usuario tome el control. El
      // contador vive en un ref que el effect de simulación resetea por dataset,
      // así el re-scan también re-encuadra.
      if (!didFitRef.current && width > 0) {
        fitFramesRef.current++
        const f = fitFramesRef.current
        if (f === 1 || f === 6 || f === 24) fitView()
        if (f >= 24) didFitRef.current = true
      }
      // Centrado suave al seleccionar desde fuera (backlinks, búsqueda)
      if (focusTargetRef.current) {
        const target = simNodesRef.current.find((n) => n.id === focusTargetRef.current)
        if (target && target.x != null && target.y != null) {
          const t = transformRef.current
          const desiredX = -target.x * t.k
          const desiredY = -target.y * t.k
          t.x += (desiredX - t.x) * 0.18
          t.y += (desiredY - t.y) * 0.18
          if (Math.abs(desiredX - t.x) < 1 && Math.abs(desiredY - t.y) < 1) {
            focusTargetRef.current = null
          }
        } else {
          focusTargetRef.current = null
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const t = transformRef.current
      const nodeAlpha = (n: SimNode): number => {
        if (!visible.has(n.node.type)) return 0
        const e = entrada(nacioRef.current, n.escalon, reloj)
        // La búsqueda manda: un match brilla aunque haya un nodo seleccionado
        if (matches) return (matches.has(n.id) || multiSet.has(n.id) ? 1 : 0.1) * e
        if (hood && !hood.has(n.id) && !multiSet.has(n.id)) return 0.13 * e
        return e
      }

      // Aristas
      for (const l of simLinksRef.current) {
        const s = l.source as SimNode
        const tg = l.target as SimNode
        if (typeof s === 'string' || typeof tg === 'string') continue
        if (s.x == null || tg.x == null) continue
        const aS = nodeAlpha(s)
        const aT = nodeAlpha(tg)
        if (aS === 0 || aT === 0) continue
        const dim = Math.min(aS, aT) < 1
        const p1 = toScreen(s.x!, s.y!)
        const p2 = toScreen(tg.x!, tg.y!)
        const focus = hoverRef.current ?? sel
        const touchesFocus = focus && (s.id === focus || tg.id === focus)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.globalAlpha = Math.min(aS, aT, 1)
        if (touchesFocus) {
          ctx.strokeStyle = pal.marca
          ctx.lineWidth = 1.4
          ctx.setLineDash([])
        } else {
          ctx.strokeStyle = dim ? pal.aristaTenue : pal.arista
          ctx.lineWidth = 1
          ctx.setLineDash(l.kind === 'tag' ? [3, 4] : [])
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      // Nodos
      for (const n of simNodesRef.current) {
        if (n.x == null || n.y == null) continue
        const alpha = nodeAlpha(n)
        if (alpha === 0) continue
        const p = toScreen(n.x, n.y)
        if (p.x < -40 || p.y < -40 || p.x > width + 40 || p.y > height + 40) continue
        const r = Math.max(n.r * t.k, 2.5)

        ctx.globalAlpha = alpha
        // Halo de marca para el seleccionado (el oro es del «ahora», no de la selección)
        if (n.id === sel) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 9)
          ctx.fillStyle = pal.marcaSuave
          ctx.fill()
        }
        trazarForma(ctx, n.forma, p.x, p.y, r)
        ctx.fillStyle = pal.tipos[n.node.type]
        ctx.fill()
        // Lo que cambió en las últimas 48 h: anillo de oro (lo único dorado del lienzo)
        if (n.ahora) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 2.2)
          ctx.strokeStyle = pal.oro
          ctx.lineWidth = 1.6
          ctx.stroke()
        }

        // Aislado: anillo punteado (señal de "nadie lo referencia")
        if (n.node.degree === 0) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 3.5)
          ctx.strokeStyle = pal.textoTenue
          ctx.lineWidth = 1
          ctx.setLineDash([2, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (n.id === sel) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 3.5)
          ctx.strokeStyle = pal.texto
          ctx.lineWidth = 2
          ctx.stroke()
        } else if (multiSet.has(n.id)) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 3.5)
          ctx.strokeStyle = pal.marca
          ctx.lineWidth = 1.6
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        } else if (matches?.has(n.id)) {
          trazarForma(ctx, n.forma, p.x, p.y, r + 4)
          ctx.strokeStyle = pal.marca
          ctx.lineWidth = 2.2
          ctx.stroke()
        }

        // Labels: screen-space (tamaño constante), aparecen con zoom o foco
        const focused =
          n.id === sel || n.id === hoverRef.current || (hood?.has(n.id) ?? false)
        const showLabel =
          focused || multiSet.has(n.id) || matches?.has(n.id) || r * 2 > 13 || t.k > 1.7
        if (showLabel) {
          const label =
            n.node.title.length > 34 ? n.node.title.slice(0, 32) + '…' : n.node.title
          ctx.font = `${focused ? 600 : 500} 10.5px Montserrat, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.lineWidth = 3
          ctx.strokeStyle = pal.halo
          ctx.strokeText(label, p.x, p.y + r + 4)
          ctx.fillStyle = focused ? pal.texto : pal.textoTenue
          ctx.fillText(label, p.x, p.y + r + 4)
        }
        ctx.globalAlpha = 1
      }
    }

    // Loop dual rAF + setTimeout: rAF da 60fps con la tab visible; el timeout
    // mantiene vivo el render cuando Chrome pausa rAF (tab oculta/minimizada).
    let stopped = false
    let timeoutId = 0
    const step = () => {
      if (stopped) return
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(timeoutId)
      const hasSize = syncSize()
      const sim = simRef.current
      if (sim && (sim.alpha() > sim.alphaMin() || sim.alphaTarget() > 0)) {
        sim.tick(1)
      }
      if (hasSize) draw()
      rafRef.current = requestAnimationFrame(step)
      timeoutId = window.setTimeout(step, 200)
    }
    step()

    // ── Interacciones ─────────────────────────────────────────────────────
    let pointerDown = false
    let dragNode: SimNode | null = null
    let moved = 0
    let lastX = 0
    let lastY = 0

    // offsetX no es confiable (untrusted events lo dejan sin ajustar); siempre
    // derivamos del clientX contra el rect vivo del canvas.
    const evtPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.x, y: e.clientY - rect.y }
    }

    const hitTest = (sx: number, sy: number): SimNode | null => {
      const { visibleTypes: vt } = liveRef.current
      const visible = new Set(vt)
      const w = toWorld(sx, sy)
      const t = transformRef.current
      // iterar al revés: los últimos dibujados quedan "encima"
      for (let i = simNodesRef.current.length - 1; i >= 0; i--) {
        const n = simNodesRef.current[i]
        if (n.x == null || n.y == null || !visible.has(n.node.type)) continue
        const hitR = Math.max(n.r, 6 / t.k)
        const dx = w.x - n.x
        const dy = w.y - n.y
        if (dx * dx + dy * dy <= hitR * hitR) return n
      }
      return null
    }

    const onPointerDown = (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* pointer sintético (tests) o ya liberado */
      }
      pointerDown = true
      moved = 0
      const p0 = evtPos(e)
      lastX = p0.x
      lastY = p0.y
      dragNode = hitTest(p0.x, p0.y)
      if (dragNode) {
        dragNode.fx = dragNode.x
        dragNode.fy = dragNode.y
        simRef.current?.alphaTarget(0.25)
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      const pm = evtPos(e)
      if (!pointerDown) {
        const hit = hitTest(pm.x, pm.y)
        hoverRef.current = hit?.id ?? null
        canvas.style.cursor = hit ? 'pointer' : 'grab'
        return
      }
      const dx = pm.x - lastX
      const dy = pm.y - lastY
      moved += Math.abs(dx) + Math.abs(dy)
      lastX = pm.x
      lastY = pm.y
      userInteractedRef.current = true
      if (dragNode) {
        const w = toWorld(pm.x, pm.y)
        dragNode.fx = w.x
        dragNode.fy = w.y
      } else {
        transformRef.current.x += dx
        transformRef.current.y += dy
        focusTargetRef.current = null
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      pointerDown = false
      if (dragNode) {
        simRef.current?.alphaTarget(0)
        dragNode.fx = null
        dragNode.fy = null
      }
      if (moved < 5) {
        const pu = evtPos(e)
        const hit = hitTest(pu.x, pu.y)
        liveRef.current.onSelect(hit?.id ?? null, e.shiftKey || e.metaKey)
      }
      dragNode = null
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      userInteractedRef.current = true
      const t = transformRef.current
      const factor = Math.exp(-e.deltaY * 0.0022)
      const newK = Math.min(Math.max(t.k * factor, MIN_ZOOM), MAX_ZOOM)
      // zoom anclado al cursor
      const pw = evtPos(e)
      const mx = pw.x - width / 2
      const my = pw.y - height / 2
      t.x = mx - ((mx - t.x) / t.k) * newK
      t.y = my - ((my - t.y) / t.k) * newK
      t.k = newK
      focusTargetRef.current = null
    }
    const onDblClick = () => {
      fitView()
    }
    // Sin esto, sacar el cursor del canvas dejaba hoverRef fijo en el último nodo
    // y el grafo quedaba atenuado a ese vecindario indefinidamente.
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

    // Hook de verificación agéntica (solo dev): posición en pantalla de un nodo
    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as Record<string, unknown>).__cerebroScreenPos = (id: string) => {
        const n = simNodesRef.current.find((sn) => sn.id === id || sn.id.includes(id))
        if (!n || n.x == null || n.y == null) return null
        const rect = canvas.getBoundingClientRect()
        const p = toScreen(n.x, n.y)
        return { id: n.id, x: rect.x + p.x, y: rect.y + p.y }
      }
      ;(window as unknown as Record<string, unknown>).__cerebroDebug = () => ({
        t: { ...transformRef.current },
        wh: [width, height],
        alpha: simRef.current?.alpha(),
        nodes: simNodesRef.current.length,
      })
    }

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(timeoutId)
      ro.disconnect()
      soltarTema()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDblClick)
    }
  }, [])

  // Centrado suave cuando la selección viene de fuera (panel, búsqueda)
  useEffect(() => {
    if (selectedId) focusTargetRef.current = selectedId
  }, [selectedId])

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />
}
