'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Cifra, Palomita } from '@/shared/movimiento'
import { Plus } from 'lucide-react'
import { conEntregable, conNuevoEntregable, entregablesDe } from './claridad'
import { esc } from './vivo-piezas'
import c from './claridad.module.css'

/**
 * El objetivo del Día, de la Semana o del Mes (6 oct 2026; el Día desde el 10 oct): texto negro sobre el recuadro amarillo de la marca, el mismo en las escalas.
 * Debajo, su bandeja (entregables o cuenta regresiva). Nada aquí late: el objetivo es firme, no vivo.
 * Sin el globo de «Conversar con Levy» desde el 10 oct 2026 (Daniel: «es molesto»); se conversa en el chat de siempre.
 *
 * Plegable (ronda 3, 10 oct 2026, Daniel: «es tan simple como dar un clic»): con `onPlegar`, nace en UNA línea (rótulo, título y
 * cuenta) y un toque en cualquier parte de la cabeza lo abre con su bandeja; otro toque lo pliega. El estado lo recuerda el engrane
 * (`abreObjetivo`), el mismo en Día, Semana y Mes.
 */
export function ObjetivoCaja({ rotulo, titulo, vacio, leyendo, cuenta, marca, children, i = 0, plegada = false, onPlegar }: {
  rotulo: ReactNode; titulo: string | null; vacio: string; leyendo: boolean
  /** «k de n» arriba a la derecha (entregables o semanas). */
  cuenta?: { k: number; n: number; clave: string; unidad?: string } | null
  /** Una marca legible en lugar de la cuenta (el Mes: «Semana 2 de 5»). */
  marca?: ReactNode
  children?: ReactNode; i?: number
  /** Plegada en una línea; solo cuenta si hay `onPlegar`. */
  plegada?: boolean
  onPlegar?: () => void
}) {
  const plegable = Boolean(onPlegar), cerrada = plegable && plegada
  const texto = leyendo ? 'Leyendo tu objetivo…' : titulo ?? vacio
  const derecha = <>
    {cuenta && cuenta.n > 0 && <span className={c.cuenta}><Cifra valor={cuenta.k} clave={cuenta.clave} formato={n => String(Math.round(n))} /> de {cuenta.n}{cuenta.unidad ? ` ${cuenta.unidad}` : ''}</span>}
    {!cuenta && marca && <span className={c.cuenta}>{marca}</span>}
  </>
  const cuerpo = leyendo ? <p className={c.cajaVacia}>Leyendo tu objetivo…</p> : titulo ? <h2>{titulo}</h2> : <p className={c.cajaVacia}>{vacio}</p>
  return <section className={`${c.objetivo} ${c.entra}`} style={esc(i)} data-vacio={!titulo || undefined} data-plegable={plegable || undefined} data-plegada={cerrada || undefined}>
    <div className={c.caja}>
      {plegable ? <button className={c.cabeza} onClick={onPlegar} aria-expanded={!cerrada} title={cerrada ? 'Abrir el objetivo' : 'Plegar a una línea'}>
          <span className={c.rotulo}>{rotulo}</span>
          <span className={c.lineaTitulo} aria-hidden={!cerrada}>{texto}</span>
          {derecha}
          <svg className={c.chevron} viewBox="0 0 12 12" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
        </button>
        : <header><span className={c.rotulo}>{rotulo}</span>{derecha}</header>}
      {plegable ? <div className={c.desplegable} inert={cerrada || undefined}><div>{cuerpo}</div></div> : cuerpo}
    </div>
    {children && (plegable ? <div className={c.desplegable} inert={cerrada || undefined}><div><div className={c.bandeja}>{children}</div></div></div> : <div className={c.bandeja}>{children}</div>)}
  </section>
}

/**
 * Las casillas de un objetivo, la misma pieza en Día, Semana y Mes (10 oct 2026, Daniel: «toma de referencia la de la semana»).
 * Lee líneas `- [ ]` / `- [x]` de un texto y lo devuelve entero a su fuente por `guardar`: el «cómo se comprueba» del registro
 * de objetivos, o la descripción de la tarea o del evento del día. Lo marcado se ve al instante; los toques seguidos se guardan
 * en fila, cada uno con todo lo marcado hasta ese momento. «Agregar» suma una casilla al final sin mover las de arriba.
 */
export function Entregables({ texto, guardar, i0 = 1, nombre = 'Entregables', vacio = 'Sin casillas todavía.' }: {
  texto: string; guardar?: (texto: string) => Promise<unknown>; i0?: number; nombre?: string; vacio?: string
}) {
  const [local, setLocal] = useState<Record<number, boolean>>({})
  const [nuevos, setNuevos] = useState<string[]>([])
  const [fallo, setFallo] = useState<string | null>(null)
  const cola = useRef<Promise<unknown>>(Promise.resolve()), enVuelo = useRef(0)
  // Lo agregado aún sin leer de vuelta va al final del texto, para que una casilla marcada en medio no lo borre.
  const actual = nuevos.reduce(conNuevoEntregable, texto)
  const base = entregablesDe(actual)
  // La lectura nueva ya trae lo marcado y lo agregado: lo local que coincide se suelta (sin parpadeo).
  useEffect(() => {
    if (enVuelo.current) return
    const leidas = entregablesDe(texto).items
    setNuevos([])
    setLocal(l => Object.fromEntries(Object.entries(l).filter(([k, v]) => leidas.find(e => e.linea === Number(k))?.hecho !== v)))
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega texto nuevo
  const items = base.items.map(e => ({ ...e, hecho: local[e.linea] ?? e.hecho }))
  const marcado = (marcas: Record<number, boolean>, t: string) => Object.entries(marcas).reduce((x, [l, h]) => conEntregable(x, Number(l), h), t)
  function enviar(siguiente: string, deshacer: () => void) {
    if (!guardar) return
    setFallo(null); enVuelo.current++
    cola.current = cola.current.then(() => guardar(siguiente))
      .catch(e => { deshacer(); setFallo(e instanceof Error ? e.message : 'No se pudo guardar.') })
      .finally(() => { enVuelo.current-- })
  }
  function alternar(linea: number, hecho: boolean) {
    const siguiente = { ...local, [linea]: hecho }
    setLocal(siguiente)
    enviar(marcado(siguiente, actual), () => setLocal(x => { const n = { ...x }; delete n[linea]; return n }))
  }
  function agregar(t: string) {
    if (!t.trim()) return
    setNuevos(n => [...n, t])
    enviar(marcado(local, conNuevoEntregable(actual, t)), () => setNuevos(n => n.filter(x => x !== t)))
  }
  return <>
    {items.length > 0 && <ul className={c.entregables} aria-label={nombre}>
      {items.map((e, n) => <li key={e.linea} className={c.entra} style={esc(i0 + n)}>
        <button role="checkbox" aria-checked={e.hecho} data-hecha={e.hecho || undefined} disabled={!guardar} onClick={() => alternar(e.linea, !e.hecho)}
          title={guardar ? (e.hecho ? 'Desmarcar' : 'Marcar como hecho') : undefined}>
          <span className={c.casilla} aria-hidden><Palomita /></span><span className={c.entregableTexto}>{e.texto}</span>
        </button>
      </li>)}
    </ul>}
    {base.resto && <p className={c.prosa}>{base.resto}</p>}
    {!items.length && !guardar && !base.resto && <p className={c.cajaVacia}>{vacio}</p>}
    {guardar && <Agregar vacio={!items.length ? vacio : null} onAgregar={agregar} i={i0 + items.length} />}
    {fallo && <p className={c.fallo} role="alert">{fallo}</p>}
  </>
}

/** La fila para sumar una casilla: un toque la vuelve campo; Enter agrega y deja el campo listo para la siguiente; Esc cierra. */
function Agregar({ vacio, onAgregar, i }: { vacio: string | null; onAgregar: (t: string) => void; i: number }) {
  const [abierta, setAbierta] = useState(false), [valor, setValor] = useState('')
  const cerrar = () => { setAbierta(false); setValor('') }
  return <div className={`${c.agregar} ${c.entra}`} style={esc(i)}>
    {vacio && !abierta && <span className={c.agregarVacio}>{vacio}</span>}
    {abierta ? <form onSubmit={e => { e.preventDefault(); onAgregar(valor); setValor('') }}>
        <span className={c.casilla} aria-hidden />
        <input autoFocus value={valor} onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar() } }}
          onBlur={() => { if (!valor.trim()) cerrar() }} placeholder="Qué tiene que pasar…" aria-label="Casilla nueva" maxLength={200} />
      </form>
      : <button onClick={() => setAbierta(true)}><Plus size={13} aria-hidden />Agregar</button>}
  </div>
}

/** Los segmentos de «k de n»: uno por entregable (o por semana), llenos los hechos. */
export function Segmentos({ k, n, i = 0 }: { k: number; n: number; i?: number }) {
  if (!n) return null
  return <span className={c.segmentos} aria-hidden>{Array.from({ length: n }, (_, x) => <i key={x} data-lleno={x < k || undefined} style={esc(i + x)} />)}</span>
}
