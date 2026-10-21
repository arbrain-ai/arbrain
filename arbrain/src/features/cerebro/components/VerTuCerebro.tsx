'use client'
/**
 * «Ver tu cerebro» (5 oct 2026, Daniel aprobó llevar la constelación de la vieja sección Artificial Brain al Taller ›
 * Memoria): tus memorias, skills y documentos, conectados, en 2D y 3D con su conmutador como antes. Clic en una
 * neurona = su panel y su síntesis. Es el momento wow para clientes y para la demo de la masterclass.
 *
 *  · Liviano: este archivo se importa perezoso (next/dynamic) y lee el grafo solo al montarse; la 3D es otro trozo
 *    que baja solo si la eliges. El grafo viaja sin extractos (el panel lee el archivo al abrirlo).
 *  · Lenguaje de la casa (docs/lenguaje-de-movimiento.md): oro solo para lo que cambió en 48 h; morado y neutro para
 *    lo demás; las neuronas entran escalonadas una sola vez; las cifras cuentan una sola vez.
 *  · Solo lectura: lee `.claude/memory`, `.claude/skills` y `docs/business-os` del Studio. Las credenciales no entran.
 *
 * Reúsa los lienzos y paneles de la sección vieja (GraphCanvas, Graph3D, NodePanel, SynthesisPanel); CerebroPage queda
 * como linaje (regla de preservación) y /segundo-cerebro redirige aquí.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import type { CerebroGraph, CerebroNodeType } from '../types'
import { CAPAS_BASE, TYPE_META, esDelAhora } from '../types'
import { GraphCanvas } from './GraphCanvas'
import { NodePanel } from './NodePanel'
import { SynthesisPanel } from './SynthesisPanel'
import { TIPOS_CLARO } from './lienzo-casa'
import c from './cerebro.module.css'

const Graph3D = dynamic(() => import('./Graph3D').then((m) => m.Graph3D), {
  ssr: false,
  loading: () => <p className={c.estado}>Encendiendo la constelación…</p>,
})

type Vista = '2d' | '3d'
type Panel = 'node' | 'synthesis' | null
const LLAVE_VISTA = 'arbrain:cerebro:vista'
const URL_GRAFO = `/api/cerebro/graph?capas=${CAPAS_BASE.join(',')}`

/** Los tipos que muestra el Taller, agrupados como los lee Daniel. Knowledge compilado queda fuera (≈1,000 notas). */
const GRUPOS: { titulo: string; tipos: CerebroNodeType[] }[] = [
  { titulo: 'Memoria', tipos: ['user', 'project', 'feedback', 'reference'] },
  { titulo: 'Skills', tipos: ['skill'] },
  { titulo: 'Documentos', tipos: ['documento'] },
]
const TIPOS = GRUPOS.flatMap((g) => g.tipos)
const miles = (n: number) => Math.round(n).toLocaleString('es-MX')

function useOscuro() {
  const [oscuro, setOscuro] = useState(true)
  useEffect(() => {
    const leer = () => setOscuro(document.documentElement.classList.contains('dark'))
    leer()
    const mo = new MutationObserver(leer)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return oscuro
}

export function VerTuCerebro({ grande }: { grande?: boolean }) {
  const [graph, setGraph] = useState<CerebroGraph | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('2d')
  const [visibles, setVisibles] = useState<CerebroNodeType[]>(TIPOS)
  const [q, setQ] = useState('')
  const [elegido, setElegido] = useState<string | null>(null)
  const [cadena, setCadena] = useState<string[]>([])
  const [slice, setSlice] = useState<string[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const oscuro = useOscuro()

  useEffect(() => {
    try { if (localStorage.getItem(LLAVE_VISTA) === '3d') setVista('3d') } catch { /* sin almacenamiento */ }
  }, [])
  const cambiarVista = (v: Vista) => { setVista(v); try { localStorage.setItem(LLAVE_VISTA, v) } catch { /* sin almacenamiento */ } }

  const cargar = useCallback(async (refrescar = false) => {
    setCargando(true); setError(null)
    try {
      const res = await fetch(`${URL_GRAFO}${refrescar ? '&refresh=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 403 ? 'Solo el dueño puede ver el cerebro.' : `El servidor respondió ${res.status}.`)
      setGraph(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el cerebro.')
    } finally { setCargando(false) }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  // Esc cierra el panel (y no se lleva el Taller)
  useEffect(() => {
    if (!panel) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPanel(null) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [panel])

  const porId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph])
  const cuenta = useMemo(() => {
    const out = {} as Record<CerebroNodeType, number>
    for (const t of Object.keys(TYPE_META) as CerebroNodeType[]) out[t] = 0
    for (const n of graph?.nodes ?? []) out[n.type]++
    return out
  }, [graph])
  const recientes = useMemo(() => (graph?.nodes ?? []).filter((n) => esDelAhora(n)).length, [graph])

  const elegir = useCallback((id: string | null, sumar: boolean) => {
    if (id && sumar) {
      setSlice((p) => (p.includes(id) ? p.filter((s) => s !== id) : [...p, id]))
      setPanel((p) => p ?? 'synthesis')
      return
    }
    if (!id) { setElegido(null); setPanel((p) => (p === 'node' ? null : p)); return }
    setElegido(id); setCadena((p) => (p.at(-1) === id ? p : [...p, id])); setPanel('node')
  }, [])
  const navegar = useCallback((id: string) => { setElegido(id); setCadena((p) => (p.at(-1) === id ? p : [...p, id])); setPanel('node') }, [])
  const atras = useCallback(() => {
    setCadena((p) => { if (p.length <= 1) return p; const n = p.slice(0, -1); setElegido(n.at(-1) ?? null); return n })
  }, [])
  const alternarSlice = useCallback((id: string) => setSlice((p) => (p.includes(id) ? p.filter((s) => s !== id) : [...p, id])), [])
  const sintetizarVecindario = useCallback((id: string) => {
    const hood = new Set([id])
    for (const e of graph?.edges ?? []) {
      if (e.kind === 'tag') continue
      if (e.source === id) hood.add(e.target)
      if (e.target === id) hood.add(e.source)
    }
    setSlice([...hood].slice(0, 15)); setPanel('synthesis')
  }, [graph])
  const alternarTipo = (t: CerebroNodeType) => setVisibles((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  // La muestra de la leyenda: el color que de verdad pinta el lienzo a la vista
  const muestra = (t: CerebroNodeType) => (vista === '3d' || oscuro ? TYPE_META[t].color : TIPOS_CLARO[t])

  const capas = graph?.meta.capas
  const listo = graph?.ok

  return <div className={c.vista} data-grande={grande || undefined}>
    <header className={`${c.cabeza} ${mov.entra}`} style={escalon(0)}>
      <p className={c.ceja}>Ver tu cerebro · <b>lo que sé de ti, conectado</b></p>
      {listo && <p className={c.cifras}>
        <span><Cifra valor={capas?.memoria ?? cuenta.user + cuenta.project + cuenta.feedback + cuenta.reference} clave={`cerebro-mem-${graph.meta.generatedAt.slice(0, 10)}`} formato={miles} /> memorias</span>
        <span><Cifra valor={capas?.skills ?? cuenta.skill} clave={`cerebro-skills-${graph.meta.generatedAt.slice(0, 10)}`} formato={miles} /> skills</span>
        <span><Cifra valor={capas?.documentos ?? cuenta.documento} clave={`cerebro-docs-${graph.meta.generatedAt.slice(0, 10)}`} formato={miles} /> documentos</span>
        <span className={c.tenue}><Cifra valor={graph.edges.length} clave={`cerebro-aristas-${graph.meta.generatedAt.slice(0, 10)}`} formato={miles} /> conexiones</span>
        {recientes > 0 && <span className={c.ahora} title="Cambiaron en las últimas 48 horas"><i aria-hidden />{recientes} {recientes === 1 ? 'cambió' : 'cambiaron'} en 48 h</span>}
      </p>}
    </header>

    <div className={`${c.barra} ${mov.entra}`} style={escalon(1)}>
      <label className={c.buscar}>
        <Search size={14} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar una neurona" aria-label="Buscar en el cerebro" />
        {q && <button onClick={() => setQ('')} aria-label="Borrar búsqueda"><X size={13} /></button>}
      </label>
      <button className={c.sintetizar} aria-pressed={panel === 'synthesis'} onClick={() => setPanel(panel === 'synthesis' ? null : 'synthesis')}
        title="Arma un brief, una explicación o un ángulo de video con las neuronas que elijas (shift + clic)">
        <Sparkles size={13} aria-hidden />Sintetizar{slice.length > 0 && <small>{slice.length}</small>}
      </button>
      <div className={c.conmutador} role="tablist" aria-label="Vista del cerebro">
        {(['2d', '3d'] as const).map((v) => <button key={v} role="tab" aria-selected={vista === v} onClick={() => cambiarVista(v)} title={v === '3d' ? 'Constelación 3D' : 'Atlas 2D'}>{v.toUpperCase()}</button>)}
      </div>
      <button className={c.icono} onClick={() => void cargar(true)} aria-label="Volver a leer el cerebro" title="Volver a leer">
        <RefreshCw size={14} className={cargando ? c.gira : undefined} />
      </button>
    </div>

    <div className={`${c.lienzo} ${mov.aparece}`} style={escalon(2)} data-vista={vista}>
      {!graph && cargando && <p className={c.estado}>Leyendo tu cerebro…</p>}
      {error && <p className={c.aviso}>{error}</p>}
      {graph && !graph.ok && <p className={c.aviso}>El cerebro vive en el disco del Studio y esta máquina no lo tiene montado. Ábrelo en el Studio o en la app de escritorio.</p>}
      {listo && (vista === '3d'
        ? <Graph3D nodes={graph.nodes} edges={graph.edges} visibleTypes={visibles} query={q} selectedId={elegido} multiSelection={slice} onSelect={elegir} />
        : <GraphCanvas nodes={graph.nodes} edges={graph.edges} visibleTypes={visibles} query={q} selectedId={elegido} multiSelection={slice} onSelect={elegir} />)}

      {listo && <div className={c.leyenda} role="group" aria-label="Mostrar u ocultar por tipo">
        {GRUPOS.map((g) => g.tipos.map((t) => {
          const activo = visibles.includes(t)
          return <button key={t} aria-pressed={activo} onClick={() => alternarTipo(t)} title={`${TYPE_META[t].label}: ${cuenta[t]}. Clic para ${activo ? 'ocultar' : 'mostrar'}`}>
            <i data-forma={TYPE_META[t].forma} style={{ background: muestra(t) }} aria-hidden />
            {g.tipos.length > 1 ? TYPE_META[t].label : g.titulo}<small>{cuenta[t]}</small>
          </button>
        }))}
      </div>}
      {listo && !panel && <p className={c.pista}>{vista === '3d' ? 'Arrastra para orbitar · clic abre una neurona · shift + clic la suma a la síntesis' : 'Clic abre una neurona · shift + clic la suma a la síntesis · doble clic encuadra'}</p>}

      {/* Los dos paneles quedan montados mientras la hoja está abierta: abrir un nodo no aborta una síntesis en curso. */}
      {panel && <aside className={c.hoja} aria-label={panel === 'node' ? 'Neurona' : 'Síntesis'}>
        {elegido && <div className={c.hojaCuerpo} hidden={panel !== 'node'}>
          <NodePanel nodeId={elegido} chain={cadena} onNavigate={navegar} onBack={atras}
            onClose={() => { setPanel(null); setElegido(null) }} onAddToSlice={alternarSlice}
            onSynthesizeNeighborhood={sintetizarVecindario} inSlice={slice.includes(elegido)} />
        </div>}
        <div className={c.hojaCuerpo} hidden={panel !== 'synthesis'}>
          <SynthesisPanel nodesById={porId} slice={slice} onRemoveFromSlice={alternarSlice} onClearSlice={() => setSlice([])} onClose={() => setPanel(null)} />
        </div>
      </aside>}
    </div>

    <p className={c.fuente}>Lee en vivo <code>.claude/memory</code>, <code>.claude/skills</code> y <code>docs/business-os</code> del Studio. Una línea une dos neuronas cuando una enlaza o nombra a la otra; las sueltas llevan anillo punteado. Solo lectura; las credenciales nunca entran.</p>
  </div>
}

export default VerTuCerebro
