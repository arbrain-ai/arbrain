'use client'
/**
 * «La historia de tu cerebro» (27 oct 2026). Daniel: «una forma para visualizar lo relacionado a git siento que es lo
 * que le falta». Para alguien que nunca usó git: qué cambió en su cerebro, quién lo hizo (tú, Levy, un agente o una
 * rutina), cuándo y por qué, en frases; los trabajos en paralelo que salen de tu cerebro principal y se incorporan; memorias y
 * skills como texto con lo añadido y lo quitado; el código plegado; y «Volver a como estaba» con vista previa, como un
 * cambio nuevo que también se deshace. Datos: /api/historia (servidor.ts). Notas: docs/builds/harness-noche-2026-10-27/nodos/historia.md.
 *
 * Ronda 2 (crítico ciego): sin jerga de git en lo visible (la tira técnica de Daniel es la única excepción y se marca
 * `data-tecnico`); una línea por cambio; color con significado: gris para lo que trabaja, morado solo para lo elegido y
 * la identidad, ámbar solo en «Listo para incorporar» con su botón (una pieza por pantalla). Estado con forma además
 * de color (palomita, reloj, signo). Movimiento: el mapa de trabajos se dibuja desde tu cerebro principal y el punto
 * donde se incorporan aparece al final; solo late lo que trabaja ahora. Con «reducir movimiento», todo llega quieto.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Check, ChevronDown, ChevronRight, CircleDashed, CircleHelp, Clock3, CornerUpLeft, FileCode2, FileText, GitMerge, LayoutPanelLeft, Loader2, Pause, RefreshCw, Sparkles, Undo2, X } from 'lucide-react'
import { mov, escalon, Cifra } from '@/shared/movimiento'
import { useFuente, releer } from '@/features/cabina/datos'
import { useAhora } from '@/features/cabina/useAhora'
import {
  AREAS, NOMBRE_AREA, NOMBRE_CORRE, NOMBRE_ESTADO, NOMBRE_HECHO, NOMBRE_MOTIVO, NOTA_AREA, agruparAutomaticos, areaPrincipal, claveDia, cuandoAbsoluto, cuandoRelativo,
  clasePieza, fraseCorta, fraseEnCurso, loImportante, nombreDeArchivo, piezasProsa, porDia, resumenCodigo, resumenDia, textoLugar, type MotivoImportante,
  type Area, type ArchivoDiff, type Bloque, type Carril, type DiffCambio, type Evento, type Hecho, type Historia, type Linea, type Lugar, type PreviaVolver, type Quien, type Tira,
} from './modelo'
import { GrafoGit } from './GrafoGit'
import { useCarrilPedido } from './carril-pedido'
import h from './historia.module.css'
import { zonaDueno } from '@/shared/lib/zona-dueno'

export const URL_HISTORIA = '/api/historia'
export const URL_CARRILES = '/api/historia?parte=carriles'
const urlCambio = (sha: string) => `/api/historia/cambio?sha=${sha}`
const urlArchivo = (sha: string, ruta: string) => `/api/historia/cambio?sha=${sha}&ruta=${encodeURIComponent(ruta)}`

interface Carriles { carriles: Carril[]; avisos: string[] }

/** Lo que se ve cuando la vista está dormida en el hilo. */
export function resumenHistoria(x: Historia | undefined): string | null {
  if (!x) return null
  const hoy = claveDia(new Date().toISOString())
  const n = x.eventos.filter(e => claveDia(e.cuando) === hoy).length
  return `Historia · ${n === 0 ? 'sin cambios hoy' : n === 1 ? '1 cambio hoy' : `${n} cambios hoy`}`
}

async function refrescar() {
  await Promise.all([fetch(`${URL_HISTORIA}?fresco=1`, { cache: 'no-store' }).catch(() => null), fetch(`${URL_CARRILES}&fresco=1`, { cache: 'no-store' }).catch(() => null)])
  await Promise.all([releer(URL_HISTORIA), releer(URL_CARRILES)])
}

const QUIENES: { id: Quien | 'todos'; nombre: string }[] = [{ id: 'todos', nombre: 'Todos' }, { id: 'persona', nombre: 'Tú' }, { id: 'levy', nombre: 'Levy' }, { id: 'subagente', nombre: 'Agentes' }, { id: 'rutina', nombre: 'Rutinas' }]
const nombreCorto = (ruta: string) => { const p = ruta.split('/'); return p.length > 2 ? p.slice(-2).join('/') : ruta }
/** «evidencia-visible-y-una-sola-via-2026-10-26.md» → «Evidencia visible y una sola via»; «SKILL.md» toma el nombre de su carpeta. */
const sinExtension = (ruta: string) => {
  const p = ruta.split('/'), base = /^(SKILL|README|INDICE|index)\.md$/i.test(p[p.length - 1]) && p.length > 1 ? p[p.length - 2] : p[p.length - 1]
  const t = base.replace(/\.(md|mdx|txt)$/i, '').replace(/[-_]?\d{4}-\d{2}-\d{2}$/, '').replace(/[-_]+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : base
}

// ── Pequeñas piezas ──

function Cuando({ iso, ahora }: { iso: string; ahora: number }) {
  return <time dateTime={iso} title={cuandoAbsoluto(iso)}>{cuandoRelativo(iso, ahora)}</time>
}

function Nodo({ e }: { e: Evento }) {
  if (e.tipo === 'junta' || e.tipo === 'sincroniza' || e.tipo === 'trae') return <span className={h.nodo} data-forma="junta" data-quien={e.quien} aria-hidden><GitMerge size={11} /></span>
  if (e.tipo === 'volver') return <span className={h.nodo} data-forma="volver" data-quien={e.quien} aria-hidden><CornerUpLeft size={11} /></span>
  return <span className={h.nodo} data-quien={e.quien} aria-hidden />
}

const TEXTO_CORRE: Record<Evento['corre'], string> = {
  'al-instante': 'Memoria, habilidades y documentos viven en el disco que tu cerebro lee: guardarlos ya es usarlos.',
  si: 'La app que sirve el Studio ya incluye este cambio.',
  no: 'Ya está en tu cerebro principal, pero la app del Studio todavía no lo instala.',
  'sin-verificar': 'Toca el servidor de Levy o la app de escritorio: no hay una marca que diga qué versión corre.',
}
/** Forma además de color: palomita = ya corre, reloj = falta instalar, signo = no se puede saber. */
function IconoCorre({ c, size = 12 }: { c: Evento['corre']; size?: number }) {
  return c === 'no' ? <Clock3 size={size} aria-hidden /> : c === 'sin-verificar' ? <CircleHelp size={size} aria-hidden /> : <Check size={size} aria-hidden />
}
function Corre({ c }: { c: Evento['corre'] }) {
  return <span className={h.corre} data-corre={c} title={TEXTO_CORRE[c]}><IconoCorre c={c} />{NOMBRE_CORRE[c]}</span>
}

/** Deja el texto en la caja del chat sin enviarlo (el mismo camino que Rutinas y Memoria). */
function redactar(texto: string) {
  if (window.location.pathname.startsWith('/chat')) { window.dispatchEvent(new CustomEvent('cabina:redactar', { detail: { texto } })); return }
  try { sessionStorage.setItem('cabina:redactar', texto) } catch { /* modo privado */ }
  window.location.assign('/chat')
}

function Cargando({ texto }: { texto: string }) { return <div className={h.cargando} aria-label={texto}><span /><span /><span /></div> }

// ── El texto que cambió, en prosa ──

/**
 * Ronda 4: una ruta larga o un id no se lee en la prosa. Se muestra su nombre (archivo citado) o «ver ubicación» /
 * «ver id», y el texto exacto aparece solo si se pide.
 */
function Oculto({ clase, texto }: { clase: 'id' | 'ubicacion' | 'archivo'; texto: string }) {
  const [ver, setVer] = useState(false)
  const etiqueta = clase === 'archivo' ? nombreDeArchivo(texto) : clase === 'id' ? 'ver id' : 'ver ubicación'
  return <span className={h.oculto} data-oculto={clase}>
    <button type="button" className={clase === 'archivo' ? h.ocultoNombre : h.ocultoBoton} aria-expanded={ver} title={ver ? undefined : texto}
      aria-label={clase === 'archivo' ? `${etiqueta}: ${ver ? 'ocultar' : 'ver'} ubicación` : undefined} onClick={() => setVer(v => !v)}>{etiqueta}</button>
    {ver && <code className={h.ocultoTexto}>{texto}</code>}
  </span>
}

/** Texto plano con sus rutas e ids sueltos plegados. */
function Plano({ texto }: { texto: string }) {
  return <>{piezasProsa(texto).map((p, i) => p.tipo === 'texto' ? <span key={i}>{p.texto}</span> : <Oculto key={i} clase={p.tipo} texto={p.texto} />)}</>
}

/** Negritas y código en línea de markdown, sin sus marcas. */
function EnLinea({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}><Plano texto={p.slice(2, -2)} /></b>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) { const c = p.slice(1, -1), k = clasePieza(c); return k ? <Oculto key={i} clase={k} texto={c} /> : <code key={i}>{c}</code> }
    return <Plano key={i} texto={p} />
  })}</>
}

/** Un renglón de markdown, sin sus marcas: los títulos pesan, las viñetas son viñetas. */
function Renglon({ texto }: { texto: string }) {
  const t = /^(#{1,6})\s+(.*)$/.exec(texto)
  if (t) return <b className={h.titulo}><EnLinea texto={t[2]} /></b>
  const v = /^(\s*)(?:[-*]|\d+\.)\s+(.*)$/.exec(texto)
  if (v) return <><span className={h.vineta} aria-hidden>•</span><EnLinea texto={v[2]} /></>
  return <EnLinea texto={texto || '\u00a0'} />
}

function LineaProsa({ l }: { l: Linea }) {
  if (l.tipo === 'cambio') return <p className={h.lp} data-l="cambio">
    {l.partes.map((p, i) => { const t = p.texto.replace(/\*\*|^#{1,6}\s+/g, ''); return p.tipo === 'igual' ? <span key={i}>{t}</span> : p.tipo === 'mas' ? <ins key={i}>{t}</ins> : <del key={i}>{t}</del> })}
  </p>
  return <p className={h.lp} data-l={l.tipo}>{l.tipo === 'menos' ? <del><Renglon texto={l.texto} /></del> : <Renglon texto={l.texto} />}</p>
}

/** Los bloques de un archivo de texto. Lo igual se recorta a sus bordes: dos renglones antes y después de cada cambio. */
export function Prosa({ bloques, maximo = 80 }: { bloques: Bloque[]; maximo?: number }) {
  const [todo, setTodo] = useState(false)
  const filas: ReactNode[] = []
  let n = 0
  bloques.forEach((b, bi) => {
    if (bi > 0) filas.push(<p key={`s${bi}`} className={h.salto} aria-hidden>···</p>)
    b.lineas.forEach((l, li) => {
      if (!todo && n >= maximo) return
      if ((l.tipo === 'mas' || l.tipo === 'menos') && !l.texto.trim()) return
      if (l.tipo === 'igual') {
        const cerca = b.lineas.slice(Math.max(0, li - 2), li + 3).some(x => x.tipo !== 'igual')
        if (!cerca) return
      }
      n++
      filas.push(<LineaProsa key={`${bi}-${li}`} l={l} />)
    })
  })
  const total = bloques.reduce((s, b) => s + b.lineas.filter(l => l.tipo !== 'igual').length, 0)
  return <div className={h.prosa}>
    {filas}
    {!todo && n >= maximo && total > maximo && <button className={h.enlace} data-ver-todo onClick={() => setTodo(true)}>Ver todo el cambio ({total === 1 ? '1 renglón' : `${total} renglones`})</button>}
  </div>
}

// ── Un cambio por dentro ──

/** Ronda 4: un archivo largo se lee por su principio y el resto a un clic; la tarjeta termina a la vista. */
const MAXIMO_PROSA = 10

function ArchivoTexto({ a, i, onVolver, solo }: { a: ArchivoDiff; i: number; onVolver: (rutas: string[]) => void; solo?: boolean }) {
  return <article className={`${h.archivo} ${mov.entra}`} style={escalon(i)} data-area={a.area}>
    <header className={h.archivoCab}>
      <div>
        <b>{sinExtension(a.ruta)}</b>
        <small>{NOMBRE_AREA[a.area]}{a.estado !== 'cambiado' && <em data-estado={a.estado}>{a.estado === 'nuevo' ? 'nuevo' : 'borrado'}</em>}<Oculto clase="ubicacion" texto={a.ruta} /></small>
      </div>
      {a.resumen && <span className={h.resumenTexto}>{a.resumen}</span>}
    </header>
    {a.protegido ? <p className={h.hueco}>Archivo protegido: no se muestra.</p> : a.bloques ? <Prosa bloques={a.bloques} maximo={MAXIMO_PROSA} /> : <p className={h.hueco}>Este cambio trae demasiados textos: abre el archivo para leerlo completo.</p>}
    {a.regresable && !solo && <footer className={h.archivoPie}>
      <button className={h.secundario} data-volver onClick={() => onVolver([a.ruta])}><Undo2 size={13} aria-hidden /> Volver este archivo a como estaba</button>
    </footer>}
  </article>
}

function ArchivoCodigo({ sha, a }: { sha: string; a: ArchivoDiff }) {
  const [abierto, setAbierto] = useState(false)
  const d = useFuente<{ bloques: Bloque[]; resumen: string }>(abierto && a.tipo === 'codigo' && !a.protegido ? urlArchivo(sha, a.ruta) : null)
  return <li className={h.codigoFila}>
    <button className={h.codigoBoton} aria-expanded={abierto} onClick={() => setAbierto(x => !x)} disabled={a.tipo !== 'codigo' || a.protegido}>
      <FileCode2 size={13} aria-hidden />
      <span title={a.ruta}>{nombreCorto(a.ruta)}</span>
      <small>{a.tipo === 'binario' ? 'imagen u otro archivo' : a.estado === 'nuevo' ? 'nuevo' : a.estado === 'borrado' ? 'borrado' : null}</small>
      <span className={h.cifras}><ins>+{a.mas}</ins> <del>−{a.menos}</del></span>
      {a.tipo === 'codigo' && !a.protegido && <ChevronDown size={13} aria-hidden data-girado={abierto || undefined} />}
    </button>
    <div className={mov.pliega} data-plegada={!abierto || undefined}><div>
      {abierto && (d.data ? <pre className={h.codigo}>{d.data.bloques.flatMap((b, bi) => [
        <span key={`h${bi}`} className={h.codigoSalto}>renglón {b.desde}</span>,
        ...b.lineas.flatMap((l, li) => l.tipo === 'cambio'
          ? [<span key={`${bi}-${li}a`} data-l="menos">{l.antes}</span>, <span key={`${bi}-${li}b`} data-l="mas">{l.despues}</span>]
          : [<span key={`${bi}-${li}`} data-l={l.tipo}>{l.texto}</span>]),
      ])}</pre> : d.error ? <p className={h.hueco}>{d.error}</p> : <Cargando texto="Leyendo el código" />)}
    </div></div>
  </li>
}

type ParaDetalle = Pick<Evento, 'sha' | 'tipo' | 'cuando' | 'detalle' | 'dentro' | 'dentroTotal'>

function Detalle({ e, ahora, onVolver, frase }: { e: ParaDetalle; ahora: number; onVolver: (sha: string, rutas?: string[]) => void; frase?: string }) {
  const d = useFuente<DiffCambio>(urlCambio(e.sha))
  const [codigoAbierto, setCodigoAbierto] = useState(false)
  const x = d.data
  const textos = x?.archivos.filter(a => a.tipo === 'texto') ?? []
  const codigo = x?.archivos.filter(a => a.tipo !== 'texto') ?? []
  const regresables = x?.archivos.filter(a => a.regresable).map(a => a.ruta) ?? []
  return <div className={h.detalle} data-diff-abierto>
    {frase && <p className={h.fraseCompleta}>{frase}</p>}
    {e.detalle && <p className={h.porque}><span>Por qué</span>{e.detalle.split('\n\n')[0]}</p>}
    {e.dentro && e.dentro.length > 0 && <div className={h.dentro}>
      <p className={h.cejaChica}>Lo que trajo · <b>{e.dentroTotal ?? e.dentro.length} {(e.dentroTotal ?? 0) === 1 ? 'cambio' : 'cambios'}</b></p>
      <ul>{e.dentro.map((y, i) => <li key={y.sha} className={mov.entra} style={escalon(i)}><Nodo e={y} /><span>{y.frase}</span><small>{y.quienNombre} · <Cuando iso={y.cuando} ahora={ahora} /></small></li>)}</ul>
      {(e.dentroTotal ?? 0) > e.dentro.length && <p className={h.nota}>Y {(e.dentroTotal ?? 0) - e.dentro.length} más.</p>}
    </div>}
    {!x ? (d.error ? <p className={h.hueco}>{d.error}</p> : <Cargando texto="Leyendo el cambio" />) : <>
      {AREAS.map(area => {
        const delArea = textos.filter(a => a.area === area)
        if (!delArea.length) return null
        return <section key={area} className={h.grupo} data-area={area}>
          <p className={h.cejaChica}>{NOMBRE_AREA[area]} · <b>{NOTA_AREA[area].toLowerCase()}</b></p>
          {delArea.map((a, i) => <ArchivoTexto key={a.ruta} a={a} i={i} solo={regresables.length < 2} onVolver={rutas => onVolver(e.sha, rutas)} />)}
        </section>
      })}
      {codigo.length > 0 && <section className={h.grupo}>
        <button className={h.plegado} aria-expanded={codigoAbierto} onClick={() => setCodigoAbierto(v => !v)}>
          <FileCode2 size={14} aria-hidden />
          <span><b>{resumenCodigo(codigo)}</b><small>El código de la app y sus pruebas. Ábrelo solo si quieres ver el detalle.</small></span>
          <ChevronDown size={14} aria-hidden data-girado={codigoAbierto || undefined} />
        </button>
        <div className={mov.pliega} data-plegada={!codigoAbierto || undefined}><div>
          <ul className={h.codigoLista}>{codigo.map(a => <ArchivoCodigo key={a.ruta} sha={e.sha} a={a} />)}</ul>
        </div></div>
      </section>}
      {x.recortado && <p className={h.nota}>Este cambio trae muchos textos: se muestran los primeros 30.</p>}
      <footer className={h.acciones}>
        {e.tipo === 'volver'
          ? <button className={h.secundario} data-volver onClick={() => onVolver(e.sha)}><Undo2 size={13} aria-hidden /> Deshacer este regreso</button>
          : regresables.length > 0
            ? <button className={h.secundario} data-volver onClick={() => onVolver(e.sha, regresables)}><Undo2 size={13} aria-hidden /> {regresables.length === 1 ? 'Volver este archivo a como estaba' : `Volver estos ${regresables.length} archivos a como estaban`}</button>
            : <p className={h.nota}>Volver con un clic es para memorias y habilidades. Si quieres regresar código, pídeselo a Levy.</p>}
        <span className={h.huella}>{cuandoAbsoluto(e.cuando)}</span>
      </footer>
    </>}
  </div>
}

// ── La línea del tiempo: una línea por cambio ──

function EventoFila({ e, i, ahora, abierto, onAbrir, onVolver }: { e: Evento; i: number; ahora: number; abierto: boolean; onAbrir: () => void; onVolver: (sha: string, rutas?: string[]) => void }) {
  const principal = areaPrincipal(e)
  const categoria = principal ? NOMBRE_AREA[principal] : ''
  const corta = fraseCorta(e.frase)
  return <li className={`${h.evento} ${mov.entra}`} style={escalon(i)} data-quien={e.quien} data-tipo={e.tipo} data-area-principal={principal} data-abierto={abierto || undefined}>
    <Nodo e={e} />
    <button className={h.eventoBoton} data-abrir aria-expanded={abierto} onClick={onAbrir}>
      <span className={h.frase}>{corta}</span>
      <span className={h.meta}>
        {categoria && <span className={h.categoria}>{categoria}</span>}
        {e.corre !== 'al-instante' && <span className={h.correIcono} data-corre={e.corre} title={`${NOMBRE_CORRE[e.corre]}. ${TEXTO_CORRE[e.corre]}`}><IconoCorre c={e.corre} size={11} /></span>}
        <span className={h.autor} data-quien={e.quien} title={e.firmado ? 'Firmado por quien lo hizo' : undefined}>{e.quienNombre}</span>
        <Cuando iso={e.cuando} ahora={ahora} />
      </span>
    </button>
    <div className={mov.pliega} data-plegada={!abierto || undefined}><div>{abierto && <>
      <p className={h.metaAbierta}><Corre c={e.corre} />{e.tema && <span>Tema: {e.tema}</span>}{e.areas.map(a => <span key={a.area}>{NOMBRE_AREA[a.area]} {a.archivos === 1 ? '1 archivo' : `${a.archivos} archivos`}</span>)}</p>
      <Detalle e={e} ahora={ahora} onVolver={onVolver} frase={corta !== e.frase ? e.frase : undefined} />
    </>}</div></div>
  </li>
}

/** Lo que guardaron las máquinas solas (rutinas, sincronías), en una fila que se abre. */
function FilaAutomaticos({ eventos, ahora, abiertos, onAbrir, onVolver }: { eventos: Evento[]; ahora: number; abiertos: string | null; onAbrir: (sha: string) => void; onVolver: (sha: string, rutas?: string[]) => void }) {
  const [ver, setVer] = useState(false)
  const n = eventos.length
  const ultimo = eventos[0]
  return <li className={h.automaticos} data-automaticos data-abierto={ver || undefined}>
    <span className={h.nodo} data-quien="rutina" aria-hidden />
    <button className={h.eventoBoton} aria-expanded={ver} onClick={() => setVer(v => !v)}>
      <span className={h.fraseAuto}><RefreshCw size={12} aria-hidden />{n} cambios automáticos<ChevronRight size={13} aria-hidden data-girado-90={ver || undefined} /></span>
      <span className={h.meta}><span className={h.categoria}>Rutinas y sincronías</span><Cuando iso={ultimo.cuando} ahora={ahora} /></span>
    </button>
    <div className={mov.pliega} data-plegada={!ver || undefined}><div>{ver && <>
      <p className={h.notaAuto}>Las máquinas se ponen al día solas: copias entre computadoras, respaldos y rutinas. No necesitan nada de ti.</p>
      <ol className={h.eventos} data-dentro-auto>{eventos.map((e, i) => <EventoFila key={e.sha} e={e} i={i} ahora={ahora} abierto={abiertos === e.sha} onAbrir={() => onAbrir(e.sha)} onVolver={onVolver} />)}</ol>
    </>}</div></div>
  </li>
}

function LineaDelTiempo({ eventos, ahora, onVolver }: { eventos: Evento[]; ahora: number; onVolver: (sha: string, rutas?: string[]) => void }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const dias = useMemo(() => porDia(eventos, ahora), [eventos, ahora])
  if (!eventos.length) return <p className={h.hueco}>Nada con ese filtro en los últimos cambios.</p>
  const alternar = (sha: string) => setAbierto(x => x === sha ? null : sha)
  let k = 0
  return <div className={h.linea}>
    {dias.map(d => <section key={d.clave} className={h.dia}>
      <h4 className={h.diaTitulo}><span>{d.titulo}</span><small>{d.eventos.length === 1 ? '1 cambio' : `${d.eventos.length} cambios`}</small></h4>
      <ol className={h.eventos}>
        {agruparAutomaticos(d.eventos).map(f => f.tipo === 'evento'
          ? <EventoFila key={f.e.sha} e={f.e} i={k++} ahora={ahora} abierto={abierto === f.e.sha} onAbrir={() => alternar(f.e.sha)} onVolver={onVolver} />
          : <FilaAutomaticos key={f.clave} eventos={f.eventos} ahora={ahora} abiertos={abierto} onAbrir={alternar} onVolver={onVolver} />)}
      </ol>
    </section>)}
  </div>
}

// ── Lo importante de hoy: cada cambio con su diferencia a un clic ──

const NOMBRE_QUIEN_CORTO: Record<Quien, string> = { persona: 'Tú', levy: 'Levy', subagente: 'Un agente', rutina: 'Una rutina' }
const ICONO_MOTIVO: Record<MotivoImportante, typeof Check> = { trabajo: GitMerge, regreso: CornerUpLeft, entregable: FileText, memoria: BookOpen, skill: Sparkles, contenido: FileText, producto: LayoutPanelLeft }

/** «2 memorias y 1 skill», «12 archivos del producto». Lo que tocó, en palabras. */
function queToco(e: Evento): string {
  const mem = e.areas.find(a => a.area === 'memoria')?.archivos ?? 0, sk = e.areas.find(a => a.area === 'skills')?.archivos ?? 0
  const partes: string[] = []
  if (mem) partes.push(mem === 1 ? '1 memoria' : `${mem} memorias`)
  if (sk) partes.push(sk === 1 ? '1 habilidad' : `${sk} habilidades`)
  const resto = e.total.archivos - mem - sk
  if (resto > 0) partes.push(partes.length ? (resto === 1 ? '1 archivo más' : `${resto} archivos más`) : (resto === 1 ? '1 archivo' : `${resto} archivos`))
  return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

function LoImportante({ x, ahora, onVolver }: { x: Historia; ahora: number; onVolver: (sha: string, rutas?: string[]) => void }) {
  const entregables = useMemo(() => new Set((x.hecho ?? []).map(y => y.sha)), [x.hecho])
  const lista = useMemo(() => loImportante(x.eventos, ahora, { entregables }), [x.eventos, ahora, entregables])
  const [abierto, setAbierto] = useState<string | null>(null)
  return <section className={h.importante} data-importante aria-labelledby="historia-importante">
    <h3 id="historia-importante" className={h.importanteTitulo}>Lo importante de hoy</h3>
    {!lista.length ? <p className={h.hueco}>Hoy no hay cambios que necesiten tu atención. Lo automático está abajo, plegado.</p> : <ol className={h.importanteLista}>
      {lista.map(({ e, motivo }, i) => {
        const Icono = ICONO_MOTIVO[motivo]
        const es = abierto === e.sha
        const corta = fraseCorta(e.frase, 96)
        return <li key={e.sha} className={`${h.tarjeta} ${mov.entra}`} style={escalon(i)} data-motivo={motivo} data-area-principal={areaPrincipal(e)} data-abierto={es || undefined}>
          <button className={h.tarjetaBoton} data-abrir aria-expanded={es} onClick={() => setAbierto(es ? null : e.sha)}>
            <span className={h.tarjetaIcono} aria-hidden><Icono size={14} /></span>
            <span className={h.tarjetaTexto}>
              <b>{corta}</b>
              <small><span className={h.motivo}>{NOMBRE_MOTIVO[motivo]}</span> · {NOMBRE_QUIEN_CORTO[e.quien]} · <Cuando iso={e.cuando} ahora={ahora} /></small>
              {!es && <span className={h.tarjetaToco}>{queToco(e)}<span className={h.verAngosto}>{queToco(e) ? ' · ' : ''}Ver qué cambió ›</span></span>}
            </span>
            <span className={h.tarjetaVer}>{es ? 'Cerrar' : 'Ver qué cambió'}<ChevronDown size={13} aria-hidden data-girado={es || undefined} /></span>
          </button>
          <div className={mov.pliega} data-plegada={!es || undefined}><div>{es && <Detalle e={e} ahora={ahora} onVolver={onVolver} frase={corta !== e.frase ? e.frase : undefined} />}</div></div>
        </li>
      })}
    </ol>}
  </section>
}

// ── Hecho: lo terminado ──

const ICONO_HECHO = { documento: FileText, seccion: LayoutPanelLeft, trabajo: GitMerge } as const

function ListaHecho({ hecho, ahora, onVolver }: { hecho: Hecho[]; ahora: number; onVolver: (sha: string, rutas?: string[]) => void }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  if (!hecho.length) return <p className={h.hueco}>Todavía no hay entregables terminados en los últimos cambios.</p>
  return <ol className={h.hechos} data-hecho>
    {hecho.map((x, i) => {
      const clave = `${x.sha}:${x.ruta ?? x.titulo}`
      const Icono = ICONO_HECHO[x.tipo]
      const es = abierto === clave
      return <li key={clave} className={`${h.hechoFila} ${mov.entra}`} style={escalon(i)} data-abierto={es || undefined}>
        <button className={h.eventoBoton} aria-expanded={es} onClick={() => setAbierto(es ? null : clave)} title={x.titulo}>
          <span className={h.frase}><Icono size={13} aria-hidden className={h.hechoIcono} />{x.titulo}</span>
          <span className={h.meta}><span className={h.categoria}>{NOMBRE_HECHO[x.tipo]}</span><span className={h.autor}>{x.quienNombre}</span><Cuando iso={x.cuando} ahora={ahora} /></span>
        </button>
        <div className={mov.pliega} data-plegada={!es || undefined}><div>{es && <>
          {x.ruta && <p className={h.metaAbierta}><span>Vive en {x.ruta.split('/').slice(-3).join(' › ')}</span></p>}
          <Detalle e={{ sha: x.sha, tipo: x.tipo === 'trabajo' ? 'junta' : 'cambio', cuando: x.cuando }} ahora={ahora} onVolver={onVolver} />
        </>}</div></div>
      </li>
    })}
  </ol>
}

// ── Trabajos en curso: una lista por estado; el recorrido de cada uno, en su detalle ──

const QUIEN_TRABAJO = NOMBRE_QUIEN_CORTO

/** Estado con forma además de color. */
function IconoEstado({ e }: { e: Carril['estado'] }) {
  if (e === 'trabajando') return <Clock3 size={13} aria-hidden />
  if (e === 'listo') return <Check size={13} aria-hidden />
  if (e === 'en-main') return <GitMerge size={13} aria-hidden />
  if (e === 'quieto') return <Pause size={13} aria-hidden />
  return <CircleDashed size={13} aria-hidden />
}

/**
 * El recorrido de un trabajo, dibujado con etiquetas en cada paso (se lee sin leyenda): salió de tu cerebro principal,
 * hizo sus cambios y ahora trabaja, espera o ya volvió.
 */
export function RecorridoTrabajo({ c, ahora }: { c: Carril; ahora: number }) {
  const cambios = c.adelante > 0 ? (c.adelante === 1 ? '1 cambio propio' : `${c.adelante} cambios propios`) : 'Sin cambios propios todavía'
  const fin = c.estado === 'en-main' ? <>Volvió a tu cerebro principal{c.juntado ? <> <Cuando iso={c.juntado} ahora={ahora} /></> : null}</>
    : c.estado === 'listo' ? 'Listo: espera que lo incorpores'
    : c.estado === 'trabajando' ? 'Sigue trabajando ahora'
    : c.estado === 'quieto' ? 'Detenido' : 'Aún no empieza'
  return <ol className={h.recorrido} data-recorrido data-estado={c.estado} aria-label={`Recorrido de ${c.nombre}`}>
    <li data-paso="sale"><span className={h.recorridoPunto} aria-hidden /><b>Salió de tu cerebro principal</b>{c.salio && <small><Cuando iso={c.salio} ahora={ahora} /></small>}</li>
    <li data-paso="trabaja"><span className={h.recorridoPunto} aria-hidden /><b>{cambios}</b>{c.ultimo && <small>el último <Cuando iso={c.ultimo.cuando} ahora={ahora} /></small>}</li>
    <li data-paso="fin"><span className={`${h.recorridoPunto}${c.estado === 'trabajando' ? ` ${mov.late}` : ''}`} aria-hidden /><b>{fin}</b></li>
  </ol>
}

function TrabajoFila({ c, i, ahora, sel, onSel }: { c: Carril; i: number; ahora: number; sel: boolean; onSel: () => void }) {
  const desde = c.salio ?? c.ultimo?.cuando
  // «Ver cambios» del Taller: el carril pedido se trae a la vista
  const fila = useRef<HTMLLIElement>(null)
  useEffect(() => { if (sel) fila.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [sel])
  return <li ref={fila} className={`${h.trabajo} ${mov.entra}`} style={escalon(i)} data-estado={c.estado} data-sel={sel || undefined}>
    <button className={h.trabajoBoton} aria-expanded={sel} onClick={onSel}>
      <span className={h.trabajoIcono} data-estado={c.estado} title={NOMBRE_ESTADO[c.estado]}><IconoEstado e={c.estado} /></span>
      <span className={h.trabajoTexto}>
        <b>{c.nombre}</b>
        <span className={h.trabajoUltimo}>{QUIEN_TRABAJO[c.quien]}{desde && <> · desde <Cuando iso={desde} ahora={ahora} /></>}</span>
      </span>
      <ChevronDown size={13} aria-hidden className={h.trabajoFlecha} data-girado={sel || undefined} />
    </button>
    <div className={mov.pliega} data-plegada={!sel || undefined}><div>{sel && <div className={h.trabajoDetalle}>
      <RecorridoTrabajo c={c} ahora={ahora} />
      {c.recientes && c.recientes.length > 0 && <>
        <p className={h.cejaChica}>Lo último que hizo</p>
        <ul>{c.recientes.slice(0, 5).map((r, k) => <li key={k}><span>{fraseCorta(r.frase, 90)}</span><small><Cuando iso={r.cuando} ahora={ahora} /></small></li>)}</ul>
      </>}
      {c.sinGuardar > 0 && <p className={h.nota}>Tiene cambios abiertos: es normal mientras trabaja.</p>}
    </div>}</div></div>
  </li>
}

const ACTIVOS = 5

function Trabajos({ x, ahora, sel, onSel }: { x: Carriles | undefined; ahora: number; sel: string | null; onSel: (rama: string | null) => void }) {
  const [verResto, setVerResto] = useState(false)
  const [verIncorporados, setVerIncorporados] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [desplegadoPara, setDesplegadoPara] = useState<string | null>(null)
  if (!x) return <Cargando texto="Leyendo los trabajos en curso" />
  // Los más activos primero: el que guardó hace menos.
  const enCurso = x.carriles.filter(c => c.estado === 'trabajando').sort((a, b) => Date.parse(b.ultimo?.cuando ?? '0') - Date.parse(a.ultimo?.cuando ?? '0'))
  const listos = x.carriles.filter(c => c.estado === 'listo')
  const incorporados = x.carriles.filter(c => c.estado === 'en-main')
  const resto = x.carriles.filter(c => c.estado === 'esperando' || c.estado === 'quieto')
  // El carril que pidió «Ver cambios» se ve aunque esté plegado o sin empezar (un worktree recién nacido aún no trabaja)
  const elegido = sel ? x.carriles.find(c => c.rama === sel) : undefined
  const suelto = elegido && resto.includes(elegido) ? elegido : null
  // una vez por elección (patrón «ajustar estado al cambiar una prop»): después, plegar vuelve a ser de quien mira
  if (sel !== desplegadoPara) {
    setDesplegadoPara(sel)
    if (elegido) { setAbierto(true); if (incorporados.includes(elegido)) setVerIncorporados(true); if (enCurso.indexOf(elegido) >= ACTIVOS) setVerResto(true) }
  }
  const fila = (c: Carril, i: number) => <TrabajoFila key={c.rama} c={c} i={i} ahora={ahora} sel={sel === c.rama} onSel={() => onSel(sel === c.rama ? null : c.rama)} />
  const pedir = () => redactar(`Incorpora a mi cerebro principal ${listos.length === 1 ? 'el trabajo' : 'los trabajos'} ${listos.map(c => `«${c.nombre}»`).join(', ')}. Antes revisa que no choquen entre sí y dime qué trae cada uno.`)
  const avisos = [...new Set(x.avisos)]
  const cuenta = [listos.length ? `${listos.length} ${listos.length === 1 ? 'listo' : 'listos'} para incorporar` : null, `${enCurso.length} trabajando`].filter(Boolean).join(' · ')
  const visibles = verResto ? enCurso : enCurso.slice(0, ACTIVOS)
  return <div className={h.trabajos} data-carriles data-abierto={abierto || undefined}>
    <button className={h.plegarTrabajos} aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
      <span><b>Trabajos de los agentes</b><small>{cuenta}</small></span>
      <ChevronRight size={15} aria-hidden data-girado-90={abierto || undefined} />
    </button>
    <p className={h.trabajosCuenta} data-cuenta>{cuenta}</p>
    <div className={h.trabajosCuerpo}>
      {suelto && <section data-pedido><p className={h.subtitulo}>El trabajo que pediste ver</p><ol className={h.trabajoLista}>{fila(suelto, 0)}</ol></section>}
      {listos.length > 0 && <section className={h.listos} data-listos>
        <header><p className={h.listosTitulo}><Check size={13} aria-hidden /> Te toca: {listos.length === 1 ? '1 trabajo listo' : `${listos.length} trabajos listos`}</p>
          <p className={h.listosNota}>Terminaron y esperan que los incorpores a tu cerebro principal.</p>
          <button className={h.primario} data-pedir onClick={pedir}>Pedir a Levy que {listos.length === 1 ? 'lo incorpore' : 'los incorpore'}</button></header>
        <ol className={h.trabajoLista}>{listos.map(fila)}</ol>
      </section>}
      <section>
        <p className={h.subtitulo}>Trabajando ahora · {enCurso.length}</p>
        {enCurso.length ? <ol className={h.trabajoLista}>{visibles.map(fila)}</ol> : <p className={h.hueco}>Nadie trabaja en paralelo ahora mismo.</p>}
        {enCurso.length > ACTIVOS && <button className={h.enlace} data-ver-mas aria-expanded={verResto} onClick={() => setVerResto(v => !v)}>{verResto ? 'Ver menos' : `y ${enCurso.length - ACTIVOS} más ›`}</button>}
      </section>
      {incorporados.length > 0 && <>
        <button className={h.plegado} aria-expanded={verIncorporados} onClick={() => setVerIncorporados(v => !v)}>
          <GitMerge size={14} aria-hidden /><span><b>{incorporados.length === 1 ? '1 trabajo ya incorporado' : `${incorporados.length} trabajos ya incorporados`}</b><small>Ya están en tu cerebro principal.</small></span>
          <ChevronDown size={14} aria-hidden data-girado={verIncorporados || undefined} />
        </button>
        <div className={mov.pliega} data-plegada={!verIncorporados || undefined}><div>
          {verIncorporados && <ol className={h.trabajoLista}>{incorporados.slice(0, 20).map(fila)}</ol>}
        </div></div>
      </>}
      {resto.length > 0 && <p className={h.nota}>{resto.filter(c => c.estado === 'esperando').length > 0 && `${resto.filter(c => c.estado === 'esperando').length} sin empezar todavía. `}{resto.filter(c => c.estado === 'quieto').length > 0 && `${resto.filter(c => c.estado === 'quieto').length} detenidos o guardados aparte.`}</p>}
      {avisos.length > 0 && <p className={h.nota}>{avisos.slice(0, 2).join(' ')}</p>}
    </div>
  </div>
}

// ── Volver ──

function DialogoVolver({ pedido, onCerrar }: { pedido: { sha: string; rutas?: string[] }; onCerrar: () => void }) {
  const [previa, setPrevia] = useState<PreviaVolver | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fase, setFase] = useState<'previa' | 'guardando' | 'hecho' | 'deshaciendo' | 'deshecho'>('previa')
  const [hecho, setHecho] = useState<{ sha: string; titulo: string } | null>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  // La vista se repinta cada 5 s (el reloj): el cierre llega nuevo cada vez y no debe relanzar la vista previa.
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  useEffect(() => {
    let vivo = true
    fetch('/api/historia/volver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) })
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? `Respondió ${r.status}.`); return b as PreviaVolver })
      .then(p => { if (vivo) setPrevia(p) }, e => { if (vivo) setError(e instanceof Error ? e.message : 'No pude preparar la vista previa.') })
    cancelar.current?.focus()
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cerrar.current() }
    window.addEventListener('keydown', tecla)
    return () => { vivo = false; window.removeEventListener('keydown', tecla) }
  }, [pedido])

  const confirmar = async (sha: string, rutas: string[] | undefined, siguiente: 'hecho' | 'deshecho') => {
    setError(null); setFase(siguiente === 'hecho' ? 'guardando' : 'deshaciendo')
    try {
      const r = await fetch('/api/historia/volver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha, rutas, confirmar: true }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? `Respondió ${r.status}.`)
      setHecho({ sha: b.sha, titulo: b.titulo }); setFase(siguiente)
      void refrescar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo.'); setFase(siguiente === 'hecho' ? 'previa' : 'hecho') }
  }

  const n = previa?.archivos.length ?? 0
  return createPortal(<div className={h.velo} onMouseDown={ev => { if (ev.target === ev.currentTarget) onCerrar() }}>
    <div className={h.dialogo} role="dialog" aria-modal="true" aria-labelledby="historia-volver-titulo">
      <header className={h.dialogoCab}>
        <div>
          <p className={h.cejaChica}>Volver a como estaba</p>
          <h3 id="historia-volver-titulo" className={h.dialogoTitulo}>
            {fase === 'hecho' ? 'Listo: ya está como antes' : fase === 'deshecho' ? 'Deshecho: quedó como estaba' : previa ? `«${previa.frase}»` : 'Preparando la vista previa'}
          </h3>
        </div>
        <button className={h.cerrar} onClick={onCerrar} aria-label="Cerrar"><X size={15} /></button>
      </header>
      <div className={h.dialogoCuerpo}>
        {fase === 'hecho' || fase === 'deshecho' ? <div className={`${h.listo} ${mov.aparece}`}>
          <p><Check size={15} aria-hidden /> Se guardó como un cambio nuevo: <b>{hecho?.titulo}</b>.</p>
          <p className={h.nota}>La historia no se borró: el cambio original sigue ahí y este regreso también se puede deshacer.</p>
        </div> : !previa ? (error ? <p className={h.aviso}>{error}</p> : <Cargando texto="Preparando la vista previa" />) : <>
          <p className={h.explica}>
            {n === 0 ? 'No hay nada que se pueda regresar desde aquí.' : <>Vas a regresar {n === 1 ? 'un archivo a como estaba' : `${n} archivos a como estaban`} <b>antes</b> de este cambio. Se guarda como un cambio nuevo, «Volver: …». Nada se borra de la historia y lo puedes deshacer con otro clic.</>}
          </p>
          {previa.archivos.map(a => <article key={a.ruta} className={h.archivo}>
            <header className={h.archivoCab}>
              <div><b>{sinExtension(a.ruta)}</b><small title={a.ruta}>{nombreCorto(a.ruta)}{a.accion !== 'restaura' && <em data-estado={a.accion === 'borra' ? 'borrado' : 'nuevo'}>{a.accion === 'borra' ? 'se quita' : 'regresa'}</em>}</small></div>
              <span className={h.resumenTexto}>{a.resumen}</span>
            </header>
            <p className={h.leyenda}><del>tachado</del> se va · <ins>resaltado</ins> regresa</p>
            <Prosa bloques={a.bloques} maximo={40} />
          </article>)}
          {previa.rechazados.length > 0 && <div className={h.rechazados}>
            <p className={h.cejaChica}>Se quedan como están</p>
            <ul>{previa.rechazados.map(r => <li key={r.ruta}><span title={r.ruta}>{nombreCorto(r.ruta)}</span><small>{r.motivo}</small></li>)}</ul>
          </div>}
          {error && <p className={h.aviso}>{error}</p>}
        </>}
      </div>
      <footer className={h.dialogoPie}>
        {fase === 'hecho' || fase === 'deshaciendo' ? <>
          <button className={h.secundario} disabled={fase === 'deshaciendo'} onClick={() => hecho && confirmar(hecho.sha, undefined, 'deshecho')}>
            {fase === 'deshaciendo' ? <Loader2 size={13} className={h.gira} aria-hidden /> : <Undo2 size={13} aria-hidden />} Deshacer este regreso
          </button>
          <button className={h.primario} onClick={onCerrar}>Cerrar</button>
        </> : fase === 'deshecho' ? <button className={h.primario} onClick={onCerrar}>Cerrar</button> : <>
          <button ref={cancelar} className={h.secundario} onClick={onCerrar}>Cancelar</button>
          <button className={h.primario} data-confirmar disabled={!previa || n === 0 || fase === 'guardando'} onClick={() => previa && confirmar(previa.sha, previa.archivos.map(a => a.ruta), 'hecho')}>
            {fase === 'guardando' ? <Loader2 size={13} className={h.gira} aria-hidden /> : <Undo2 size={13} aria-hidden />} Volver {n === 1 ? 'este archivo' : n > 1 ? `estos ${n}` : ''}
          </button>
        </>}
      </footer>
    </div>
  </div>, document.body)
}

// ── La vista ──

const LUGARES: { id: 'web' | 'servidor' | 'escritorio'; nombre: string }[] = [
  { id: 'web', nombre: 'App web del Studio' }, { id: 'servidor', nombre: 'Servidor de Levy' }, { id: 'escritorio', nombre: 'App de escritorio' },
]
function IconoLugar({ l }: { l: Lugar }) {
  return l.estado === 'al-dia' ? <Check size={12} aria-hidden /> : l.estado === 'faltan' ? <Clock3 size={12} aria-hidden /> : <CircleHelp size={12} aria-hidden />
}

/** La tira de Daniel (técnica a propósito), al final y plegada en una línea: qué está en tu cerebro principal y qué corre dónde. */
function TiraTecnica({ t, ahora, enCurso }: { t: Tira; ahora: number; enCurso: string }) {
  const [abierta, setAbierta] = useState(false)
  const sinVerificar = LUGARES.filter(({ id }) => t[id].estado === 'sin-verificar').length
  const web = t.web.estado === 'al-dia' ? 'web al día' : t.web.estado === 'faltan' ? `web: faltan ${t.web.faltan ?? ''}`.trim() : 'web sin verificar'
  return <section className={h.tira} data-tecnico aria-label="Para ti: qué corre dónde" data-abierta={abierta || undefined}>
    <button className={h.tiraLinea} aria-expanded={abierta} onClick={() => setAbierta(v => !v)}>
      <span className={h.tiraCeja}>Para ti · técnico</span>
      <span className={h.tiraResumen}><code>{t.principal.corto}</code> · {web}{sinVerificar > 0 && ` · ${sinVerificar} sin verificar`}</span>
      <ChevronRight size={13} aria-hidden data-girado-90={abierta || undefined} />
    </button>
    <div className={mov.pliega} data-plegada={!abierta || undefined}><div>{abierta && <div className={h.tiraRejilla}>
      <div className={h.tiraCelda} data-estado="al-dia" title={t.principal.frase}>
        <span className={h.tiraNombre}>Tu cerebro principal</span>
        <span className={h.tiraValor}><code>{t.principal.corto}</code> <Cuando iso={t.principal.cuando} ahora={ahora} /></span>
      </div>
      {LUGARES.map(({ id, nombre }) => {
        const l = t[id]
        return <div key={id} className={h.tiraCelda} data-estado={l.estado} title={l.nota ?? (l.estado === 'al-dia' ? 'Verificado contra lo que corre.' : undefined)}>
          <span className={h.tiraNombre}>{nombre}</span>
          <span className={h.tiraValor}><IconoLugar l={l} />{textoLugar(l)}{l.corto && <code>{l.corto}</code>}{l.estimado && l.cuando && <small>{id === 'escritorio' ? 'instalada' : 'compilado'} <Cuando iso={l.cuando} ahora={ahora} /></small>}</span>
        </div>
      })}
      <p className={h.tiraEnCurso}>{enCurso}</p>
    </div>}</div></div>
  </section>
}

function Heroe({ x, c, ahora, grande }: { x: Historia; c: Carriles | undefined; ahora: number; grande?: boolean }) {
  const r = resumenDia(x.eventos, ahora, c?.carriles ?? null)
  const hoy = claveDia(new Date(ahora).toISOString())
  const n = x.eventos.filter(e => claveDia(e.cuando) === hoy).length
  const listos = c?.carriles.filter(y => y.estado === 'listo').length ?? 0
  const trabajando = c?.carriles.filter(y => y.estado === 'trabajando').length ?? 0
  const toca = !c ? null : listos > 0
    ? <><b>Te toca:</b> {listos === 1 ? 'revisar 1 trabajo listo para incorporar.' : `revisar ${listos} trabajos listos para incorporar.`}</>
    : <><b>No te toca nada.</b> {trabajando === 0 ? 'Nadie trabaja en paralelo ahora.' : trabajando === 1 ? 'Un trabajo sigue en curso.' : `${trabajando} trabajos siguen en curso.`}</>
  return <header className={h.heroe}>
    <div className={h.heroeTexto}>
      <p className={`${h.cejaHeroe} ${mov.entra}`} style={escalon(0)}>{grande ? <span>{new Intl.DateTimeFormat('es-MX', { timeZone: zonaDueno(), weekday: 'long', day: 'numeric', month: 'long' }).format(ahora)}</span> : <>Tu cerebro · <b>historia</b></>}<span className={h.vivo}><RefreshCw size={11} aria-hidden /> <Cuando iso={x.leidoEn} ahora={ahora} /></span></p>
      <h3 className={`${h.palabra} ${mov.entra}`} style={escalon(1)} data-resumen>
        {n === 0 ? r.titular : <>Hoy tu cerebro cambió <Cifra valor={n} clave={`historia-hoy-${hoy}`} formato={v => String(Math.round(v))} /> {n === 1 ? 'vez' : 'veces'}</>}
      </h3>
      <p className={`${h.hacer} ${mov.entra}`} style={escalon(2)}>{r.detalle}</p>
      {toca && <p className={`${h.toca} ${mov.entra}`} style={escalon(3)} data-toca={listos > 0 || undefined}>{toca}</p>}
    </div>
  </header>
}

function Filtros<T extends string>({ opciones, valor, onCambio, etiqueta }: { opciones: { id: T; nombre: string; n?: number }[]; valor: T; onCambio: (v: T) => void; etiqueta: string }) {
  return <div className={h.filtros} role="group" aria-label={etiqueta}>
    {opciones.map(o => <button key={o.id} className={h.filtro} aria-pressed={valor === o.id} onClick={() => onCambio(o.id)}>{o.nombre}{o.n != null && <small>{o.n}</small>}</button>)}
  </div>
}

export function VistaHistoria({ grande }: { grande?: boolean }) {
  const lect = useFuente<Historia>(URL_HISTORIA, 60_000)
  const car = useFuente<Carriles>(URL_CARRILES, 90_000)
  const ahora = useAhora()
  const [pestana, setPestana] = useState<'linea' | 'hecho'>('linea')
  const [area, setArea] = useState<Area | 'todo'>('todo')
  const [quien, setQuien] = useState<Quien | 'todos'>('todos')
  const [sel, setSel] = useState<string | null>(null)
  const [volver, setVolver] = useState<{ sha: string; rutas?: string[] } | null>(null)
  const x = lect.data
  const eventos = useMemo(() => (x?.eventos ?? []).filter(e => (area === 'todo' || e.areas.some(a => a.area === area)) && (quien === 'todos' || e.quien === quien)), [x, area, quien])
  const conteoArea = (a: Area) => (x?.eventos ?? []).filter(e => e.areas.some(y => y.area === a)).length
  const onVolver = (sha: string, rutas?: string[]) => setVolver({ sha, rutas })

  if (!x) return <div className={h.historia}>{lect.error ? <p className={h.aviso}>{lect.error}</p> : <Cargando texto="Leyendo la historia de tu cerebro" />}</div>
  return <div className={h.historia} data-grande={grande || undefined}>
    {x.avisos.length > 0 && <p className={h.aviso}>{x.avisos.join(' ')}</p>}
    <Heroe x={x} c={car.data} ahora={ahora} grande={grande} />
    <div className={h.rejilla}>
      <div className={h.zonaImportante}><LoImportante x={x} ahora={ahora} onVolver={onVolver} /></div>
      <aside className={h.columnaCarriles} aria-label="Trabajos de los agentes">
        <header className={h.seccionCab}><h3 className={h.importanteTitulo}>Trabajos de los agentes</h3></header>
        {car.error && !car.data ? <p className={h.aviso}>{car.error}</p> : <Trabajos x={car.data} ahora={ahora} sel={sel} onSel={setSel} />}
      </aside>
      <section className={h.columnaLinea} aria-label="Todo lo que cambió">
        <div className={h.pestanas} role="tablist" aria-label="Qué ver">
          <button role="tab" aria-selected={pestana === 'linea'} className={h.pestana} onClick={() => setPestana('linea')}>Todo lo que cambió</button>
          <button role="tab" aria-selected={pestana === 'hecho'} className={h.pestana} data-pestana-hecho onClick={() => setPestana('hecho')}>Hecho{x.hecho?.length ? <small>{x.hecho.length}</small> : null}</button>
        </div>
        {pestana === 'linea' ? <>
          <div className={h.filtrosFila}>
            <Filtros etiqueta="Qué parte" valor={area} onCambio={setArea} opciones={[{ id: 'todo' as const, nombre: 'Todo' }, ...AREAS.map(a => ({ id: a, nombre: NOMBRE_AREA[a], n: conteoArea(a) })).filter(o => o.n > 0)]} />
            <Filtros etiqueta="Quién" valor={quien} onCambio={setQuien} opciones={QUIENES} />
          </div>
          <LineaDelTiempo eventos={eventos} ahora={ahora} onVolver={onVolver} />
          <p className={h.nota}>Se muestran los últimos {x.eventos.length} cambios de tu cerebro principal.</p>
        </> : <>
          <p className={h.nota}>Lo que Levy, los agentes o tú terminaron: documentos, secciones nuevas de la app y trabajos incorporados. Ábrelo para ver su cambio.</p>
          <ListaHecho hecho={x.hecho ?? []} ahora={ahora} onVolver={onVolver} />
        </>}
      </section>
    </div>
    {x.tira && <TiraTecnica t={x.tira} ahora={ahora} enCurso={fraseEnCurso(x.sinGuardarAreas, x.sinGuardar)} />}
    {volver && <DialogoVolver pedido={volver} onCerrar={() => setVolver(null)} />}
  </div>
}

/**
 * Taller › Historia (28 oct 2026). Daniel: «no estoy seguro si debería añadir variedad en un nuevo panel o meterlo en el taller…
 * cómo podemos obtener lo mejor de ambos mundos». Dos capas en una pestaña: arriba la del dueño (el día en una frase, «Te toca» y
 * lo importante de hoy), debajo la técnica, el historial de git como VS Code (GrafoGit.tsx). Lo demás de la vista en palabras (los
 * trabajos por estado, todo lo que cambió y «Hecho») queda plegado al pie, y la tira de qué corre dónde al final.
 */
export function HistoriaTaller() {
  const lect = useFuente<Historia>(URL_HISTORIA, 60_000)
  const car = useFuente<Carriles>(URL_CARRILES, 90_000)
  const ahora = useAhora()
  const [palabras, setPalabras] = useState(false)
  const [pestana, setPestana] = useState<'trabajos' | 'linea' | 'hecho'>('trabajos')
  const [sel, setSel] = useState<string | null>(null)
  const [volver, setVolver] = useState<{ sha: string; rutas?: string[] } | null>(null)
  // «Ver cambios» desde el renglón de un agente: abre «en palabras › Trabajos» con su carril elegido
  const pedido = useCarrilPedido()
  useEffect(() => { if (pedido.rama) { setPalabras(true); setPestana('trabajos'); setSel(pedido.rama) } }, [pedido.rama, pedido.n])
  const x = lect.data
  const onVolver = (sha: string, rutas?: string[]) => setVolver({ sha, rutas })
  return <div className={h.historia} data-taller-historia>
    {!x ? (lect.error ? <p className={h.aviso}>{lect.error}</p> : <Cargando texto="Leyendo la historia de tu cerebro" />) : <>
      {x.avisos.length > 0 && <p className={h.aviso}>{x.avisos.join(' ')}</p>}
      <Heroe x={x} c={car.data} ahora={ahora} />
      <LoImportante x={x} ahora={ahora} onVolver={onVolver} />
    </>}
    <GrafoGit ahora={ahora} />
    {x && <section className={h.palabras} data-palabras data-abierto={palabras || undefined}>
      <button className={h.plegado} aria-expanded={palabras} onClick={() => setPalabras(v => !v)}>
        <BookOpen size={14} aria-hidden /><span><b>La misma historia, en palabras</b><small>Los trabajos de los agentes por estado, todo lo que cambió y lo terminado.</small></span>
        <ChevronDown size={14} aria-hidden data-girado={palabras || undefined} />
      </button>
      <div className={mov.pliega} data-plegada={!palabras || undefined}><div>{palabras && <div className={h.palabrasCuerpo}>
        <div className={h.pestanas} role="tablist" aria-label="Qué ver">
          <button role="tab" aria-selected={pestana === 'trabajos'} className={h.pestana} onClick={() => setPestana('trabajos')}>Trabajos</button>
          <button role="tab" aria-selected={pestana === 'linea'} className={h.pestana} onClick={() => setPestana('linea')}>Todo lo que cambió</button>
          <button role="tab" aria-selected={pestana === 'hecho'} className={h.pestana} data-pestana-hecho onClick={() => setPestana('hecho')}>Hecho{x.hecho?.length ? <small>{x.hecho.length}</small> : null}</button>
        </div>
        {pestana === 'trabajos' ? (car.error && !car.data ? <p className={h.aviso}>{car.error}</p> : <Trabajos x={car.data} ahora={ahora} sel={sel} onSel={setSel} />)
          : pestana === 'linea' ? <LineaDelTiempo eventos={x.eventos} ahora={ahora} onVolver={onVolver} />
          : <ListaHecho hecho={x.hecho ?? []} ahora={ahora} onVolver={onVolver} />}
      </div>}</div></div>
    </section>}
    {x?.tira && <TiraTecnica t={x.tira} ahora={ahora} enCurso={fraseEnCurso(x.sinGuardarAreas, x.sinGuardar)} />}
    {volver && <DialogoVolver pedido={volver} onCerrar={() => setVolver(null)} />}
  </div>
}
