'use client'
/**
 * Taller › Memoria · ¿qué sabe mi cerebro de mí? (5 oct 2026, Daniel: «para el cliente es tangible ver crecer su cerebro»).
 * Funde la vista «Memoria y contexto» (antes en el «+») con la pestaña Archivos del Taller:
 *
 *  · El cerebro que crece: memorias, habilidades y documentos contados de verdad (no el tope de la lista) y cuántos se
 *    movieron esta semana. Las cifras cuentan una vez (shared/movimiento).
 *  · Memorias       lo que sé de ti, por capa, con buscador y lectura (el mismo componente de Memoria y contexto).
 *  · Habilidades    las skills de Levy: qué sabe hacer.
 *  · Documentos     los del negocio.
 *  · Instrucciones  lo que tengo detrás en cada conversación: CLAUDE.md, MEMORY.md y now.md, en lectura y bonito.
 *  · Contexto       lo que entra en la ventana de esta conversación (la anatomía medida).
 * Todo es lectura: para cambiar algo se le pide a Levy en el chat.
 */
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, BookOpen, BrainCircuit, ChevronRight, FileText, Gauge, Orbit, PenLine, ScrollText, Search, Wand2, type LucideIcon } from 'lucide-react'
import { MarkdownMessage } from '@/features/chat/components/MarkdownMessage'
import { Cifra, escalon, mov } from '@/shared/movimiento'
import { useFuente } from '../datos'
import { Memoria, Ventana, URL_MEMORIA } from '../vistas/Memoria'
import type { FotoMemoria } from '../vistas/contexto-capas'
import { hace } from './datos'
import s from './panel.module.css'
import w from './taller.module.css'

interface Archivo { ruta: string; titulo: string; detalle: string | null; grupo: 'memoria' | 'skills' | 'documentos'; editado: string }
interface Instruccion { ruta: string; titulo: string; detalle: string; editado: string; bytes: number }
interface FotoArchivos {
  archivos: Archivo[]; raiz: string | null
  totales?: Record<Archivo['grupo'], number>; semana?: Record<Archivo['grupo'], number>; instrucciones?: Instruccion[]
}
const URL_ARCHIVOS = '/api/cabina/archivos'
const SEMANA_MS = 7 * 86_400_000

// «Ver tu cerebro» (5 oct 2026, Daniel aprobó traer la constelación de la vieja sección Artificial Brain): memorias,
// skills y documentos conectados, en 2D y 3D. Perezosa: su código y el grafo bajan solo al elegir esta parte.
const VerTuCerebro = dynamic(() => import('@/features/cerebro/components/VerTuCerebro'), {
  ssr: false, loading: () => <Cargando />,
})

type Parte = 'cerebro' | 'memorias' | 'skills' | 'documentos' | 'instrucciones' | 'contexto'
/** La parte de Memoria que se abre al montar (la recuerda el Taller; /segundo-cerebro la pide en `cerebro`). */
export const LLAVE_PARTE_MEMORIA = 'arbrain.taller.memoria'
const PARTES: { id: Parte; nombre: string; Icono: LucideIcon }[] = [
  { id: 'cerebro', nombre: 'Ver tu cerebro', Icono: Orbit },
  { id: 'memorias', nombre: 'Memorias', Icono: BrainCircuit }, { id: 'skills', nombre: 'Habilidades', Icono: Wand2 },
  { id: 'documentos', nombre: 'Documentos', Icono: BookOpen }, { id: 'instrucciones', nombre: 'Instrucciones', Icono: ScrollText },
  { id: 'contexto', nombre: 'Contexto', Icono: Gauge },
]
const LLAVE = LLAVE_PARTE_MEMORIA
const leerParte = (): Parte => { try { const v = localStorage.getItem(LLAVE); return PARTES.some(p => p.id === v) ? v as Parte : 'memorias' } catch { return 'memorias' } }

export function MemoriaTaller() {
  const memoria = useFuente<FotoMemoria>(URL_MEMORIA).data
  const archivos = useFuente<FotoArchivos>(URL_ARCHIVOS)
  const [parte, setParte] = useState<Parte>('memorias')
  useEffect(() => { setParte(leerParte()) }, [])
  const elegir = (p: Parte) => { setParte(p); try { localStorage.setItem(LLAVE, p) } catch { /* sin almacenamiento */ } }
  const a = archivos.data
  const nMem = memoria?.archivos.length ?? null
  const memSemana = memoria ? memoria.archivos.filter(f => f.fecha && Date.now() - Date.parse(f.fecha) < SEMANA_MS).length : 0
  const nSkills = a ? a.totales?.skills ?? a.archivos.filter(x => x.grupo === 'skills').length : null
  const nDocs = a ? a.totales?.documentos ?? a.archivos.filter(x => x.grupo === 'documentos').length : null
  const cifras: { n: number | null; nombre: [string, string]; semana: number; parte: Parte }[] = [
    { n: nMem, nombre: ['memoria', 'memorias'], semana: memSemana, parte: 'memorias' },
    { n: nSkills, nombre: ['habilidad', 'habilidades'], semana: a?.semana?.skills ?? 0, parte: 'skills' },
    { n: nDocs, nombre: ['documento', 'documentos'], semana: a?.semana?.documentos ?? 0, parte: 'documentos' },
  ]
  return <div className={w.vista}>
    <section className={`${w.cerebro} ${mov.entra}`} style={escalon(1)} aria-label="Tu cerebro">
      <p className={w.cerebroTitular}>Lo que tu cerebro sabe de ti</p>
      <div className={w.cerebroCifras}>{cifras.map((c, i) => <button key={c.parte} className={w.cerebroCifra} onClick={() => elegir(c.parte)} aria-pressed={parte === c.parte} style={escalon(i + 2)}>
        <Cifra valor={c.n} clave={`cerebro-${c.parte}`} formato={x => Math.round(x).toLocaleString('es-MX')} className={w.cerebroNumero} />
        <span>{c.n === 1 ? c.nombre[0] : c.nombre[1]}</span>
        {c.semana > 0 && <small title="Nuevas o editadas en los últimos 7 días">{c.semana} recientes</small>}
      </button>)}</div>
    </section>
    <div className={w.partes} role="tablist" aria-label="Qué ver de tu memoria">
      {PARTES.map(p => <button key={p.id} role="tab" aria-selected={parte === p.id} onClick={() => elegir(p.id)}><p.Icono size={13} aria-hidden /><span>{p.nombre}</span></button>)}
    </div>
    {parte === 'cerebro' ? <div className={w.incrustada}><VerTuCerebro /></div>
      : parte === 'memorias' ? <div className={w.incrustada}><Memoria grande /></div>
      : parte === 'contexto' ? <div className={w.incrustada}><Ventana grande /></div>
      : parte === 'instrucciones' ? <Instrucciones data={a} error={archivos.error} />
      : <ListaArchivos data={a} error={archivos.error} grupo={parte === 'skills' ? 'skills' : 'documentos'} />}
  </div>
}

function Cargando({ error }: { error?: string }) {
  return <div className={s.cargando} aria-busy={!error}>{error ? <><b>No se pudo leer</b><span>{error}</span></> : <><span className={s.brillo} /><span className={s.brillo} /></>}</div>
}

function ListaArchivos({ data, error, grupo }: { data: FotoArchivos | undefined; error?: string; grupo: 'skills' | 'documentos' }) {
  const [filtro, setFiltro] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const q = filtro.trim().toLowerCase()
  const lista = useMemo(() => (data?.archivos ?? []).filter(a => a.grupo === grupo && (!q || a.titulo.toLowerCase().includes(q) || a.ruta.toLowerCase().includes(q) || a.detalle?.toLowerCase().includes(q))), [data, grupo, q])
  if (abierto) return <Lector ruta={abierto} volver={() => setAbierto(null)} etiqueta={grupo === 'skills' ? 'Habilidades' : 'Documentos'} />
  if (!data) return <Cargando error={error} />
  if (!data.raiz) return <p className={w.nota}>El cerebro no está montado en esta máquina. En el Studio aquí ves memoria, habilidades y documentos.</p>
  const ver = q || todos ? lista : lista.slice(0, 12)
  const Icono = grupo === 'skills' ? Wand2 : FileText
  return <>
    <label className={w.buscar}><Search size={14} aria-hidden /><input placeholder={grupo === 'skills' ? 'Buscar una habilidad' : 'Buscar en los documentos del negocio'} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Buscar" /></label>
    {!lista.length ? <p className={w.nota}>Nada coincide con «{filtro}».</p> : <section className={`${w.tarjeta} ${mov.entra}`} style={escalon(1)}>
      <div className={s.lista}>{ver.map(a => <button key={a.ruta} className={s.fila} onClick={() => setAbierto(a.ruta)} title={a.ruta}>
        <span className={s.marca}><Icono size={13} className={s.iconoArchivo} aria-hidden /></span>
        <span className={s.filaTexto}><span className={s.filaNombre}>{a.titulo}</span>{a.detalle && <span className={s.filaMeta}>{a.detalle}</span>}</span>
        <span className={s.filaEstado}>{hace(a.editado)}</span>
      </button>)}</div>
      {lista.length > ver.length && <button className={s.mas} onClick={() => setTodos(true)}>Ver las {lista.length}</button>}
    </section>}
  </>
}

const kb = (b: number) => b < 1024 ? `${b} bytes` : `${(b / 1024).toFixed(1)} KB`

function Instrucciones({ data, error }: { data: FotoArchivos | undefined; error?: string }) {
  const [abierta, setAbierta] = useState<Instruccion | null>(null)
  if (abierta) return <Lector ruta={abierta.ruta} volver={() => setAbierta(null)} etiqueta="Instrucciones" titulo={abierta.titulo} />
  if (!data) return <Cargando error={error} />
  const lista = data.instrucciones ?? []
  if (!lista.length) return <p className={w.nota}>Las instrucciones viven en el Studio; aquí no están montadas.</p>
  return <>
    <p className={w.nota}>Esto entra completo en cada conversación, antes de tu primer mensaje. Es lo que me hace Levy y no un asistente cualquiera.</p>
    <div className={w.instrucciones}>{lista.map((x, i) => <button key={x.ruta} className={`${w.instruccion} ${mov.entra}`} style={escalon(i + 1)} onClick={() => setAbierta(x)}>
      <span className={w.instruccionNumero}>{i + 1}</span>
      <span className={w.instruccionTexto}><b>{x.titulo}</b><span>{x.detalle}</span><code>{x.ruta.replace(/^\.claude\//, '')} · {kb(x.bytes)} · {hace(x.editado)}</code></span>
      <ChevronRight size={15} className={s.flecha} aria-hidden />
    </button>)}</div>
  </>
}

/** Lector de solo lectura; «Corregir esto» deja la cita en la caja del chat (escribir es de Levy). */
function Lector({ ruta, volver, etiqueta, titulo }: { ruta: string; volver: () => void; etiqueta: string; titulo?: string }) {
  const { data, error } = useFuente<{ ruta: string; texto: string; editado: string }>(`${URL_ARCHIVOS}?ruta=${encodeURIComponent(ruta)}`)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); volver() } }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [volver])
  const texto = data?.texto.replace(/^---\n[\s\S]*?\n---\n/, '') ?? ''
  const corregir = () => {
    const cita = `Sobre \`${ruta}\`: `
    if (window.location.pathname.startsWith('/chat')) window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto: cita } }))
    else { try { sessionStorage.setItem('cabina:redactar', cita) } catch { /* modo privado */ } window.location.assign('/chat') }
  }
  return <div className={`${w.lector} ${mov.aparece}`}>
    <div className={w.lectorBarra}>
      <button onClick={volver} title="Volver (Esc)"><ArrowLeft size={14} aria-hidden />{etiqueta}</button>
      <button onClick={corregir} title="Deja la cita en la caja del chat para que digas qué cambiar"><PenLine size={14} aria-hidden />Corregir esto</button>
    </div>
    <p className={w.lectorTitulo}>{titulo ?? ruta.split('/').at(-1)}</p>
    <p className={w.lectorMeta}><code>{ruta}</code>{data ? ` · editado ${hace(data.editado)}` : ''}</p>
    {error ? <p className={s.aviso}>{error}</p> : !data ? <Cargando /> : <div className={`${s.lectura} ${w.lectorTexto}`}><MarkdownMessage content={texto} /></div>}
  </div>
}
