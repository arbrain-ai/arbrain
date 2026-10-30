'use client'
/**
 * Un archivo que Levy cambió, legible (27 oct 2026, Ver y deshacer; ronda 2 tras el crítico ciego). Plegado: la frase
 * humana («cambió 2 líneas en tu memoria sobre «llamadas cohorte»»), sin ruta. Abierto: el diff y, al pie, «Ver
 * ubicación» con el nombre técnico. La prosa (.md) va por frase completa: la vieja tachada arriba, la nueva abajo, y
 * dentro solo palabras completas cuando el cambio es pequeño. El código, por líneas con lo igual plegado. Sirve a la
 * edición de Daniel y a la del alumno por igual: solo lee el input de la herramienta.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, FileCode2, FilePen, FileText, Brain, Sparkles, Undo2 } from 'lucide-react'
import { diffFrases, fraseCodigo, plegarLineas, resumenHumano, rutaCorta, type BloqueProsa, type Edicion, type PalabraMarcada } from '../lib/diff-edicion'
import s from './diff-edicion.module.css'

const MAX_LINEAS = 400
const MAX_ESCRITO = 1600

function IconoClase({ e }: { e: Edicion }) {
  const Icono = e.clase === 'memoria' ? Brain : e.clase === 'skill' ? Sparkles : e.clase === 'documento' ? FileText : e.escrito ? FilePen : FileCode2
  return <Icono className={s.icono} aria-hidden />
}

/** El formato de markdown no se lee como cambio: «**lunes**» se ve «lunes», «## Llamadas» se ve «Llamadas». */
const limpio = (t: string) => t.replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• ')

function Frase({ palabras, como }: { palabras: PalabraMarcada[]; como: 'del' | 'ins' }) {
  const Marca = como
  return <>{palabras.map((p, k) => {
    // La viñeta de markdown («- » al inicio) se ve como viñeta, no como guion.
    const t = (k === 0 && /^[-*+]$/.test(p.texto) ? '•' : limpio(p.texto)) + (k < palabras.length - 1 ? ' ' : '')
    return p.marca ? <Marca key={k}>{t}</Marca> : <span key={k}>{t}</span>
  })}</>
}

function BloqueFrases({ b }: { b: BloqueProsa }) {
  if (b.tipo === 'pliegue') return <p className={s.frasePliegue}>{b.frases === 1 ? '1 frase igual' : `${b.frases} frases iguales`}</p>
  if (b.tipo === 'igual') return <p className={s.fraseIgual}>{limpio(b.frase)}</p>
  return <div className={s.fraseCambio} data-fino={b.fino ? '' : undefined}>
    {b.antes.length > 0 && <div className={s.antes}>
      <span className={s.etiqueta}>Antes</span>
      <div>{b.antes.map((f, i) => <p key={i}><Frase palabras={f} como="del" /></p>)}</div>
    </div>}
    {b.despues.length > 0 && <div className={s.ahora}>
      <span className={s.etiqueta}>Ahora</span>
      <div>{b.despues.map((f, i) => <p key={i}><Frase palabras={f} como="ins" /></p>)}</div>
    </div>}
  </div>
}

/** Prosa (.md): cada cambio por frase completa. */
function DiffProsa({ e }: { e: Edicion }) {
  const bloques = useMemo(() => e.cambios.map(c => diffFrases(c.antes, c.despues)), [e])
  return <>{bloques.map((bs, i) => <div key={i} className={s.prosa}>{bs.map((b, k) => <BloqueFrases key={k} b={b} />)}</div>)}</>
}

/** Prosa escrita completa (Write de un .md): se lee como quedó, sin pintarla toda de verde. */
function ProsaEscrita({ e }: { e: Edicion }) {
  const [todo, setTodo] = useState(false)
  const texto = e.cambios.map(c => c.despues).join('\n\n')
  const corto = !todo && texto.length > MAX_ESCRITO
  return <div className={s.prosa}>
    {(corto ? texto.slice(0, MAX_ESCRITO) : texto).split('\n').filter(l => l.trim()).map((l, k) => <p key={k} className={s.fraseIgual}>{limpio(l.trim())}</p>)}
    {corto && <button type="button" className={s.enlace} onClick={() => setTodo(true)}>Ver todo lo que escribió</button>}
  </div>
}

/**
 * Código: la vista por defecto es SOLO la frase de para qué sirve y qué cambió; las líneas monoespaciadas aparecen
 * únicamente tras el clic explícito en «Ver el código» (nunca abiertas al cargar, ni en el detalle de la herramienta).
 * Ronda 4: al abrirlas, el pie del turno («Deshacer desde aquí») se trae a la vista para que no quede cortado abajo.
 */
function Codigo({ e }: { e: Edicion }) {
  const [ver, setVer] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ver) return
    const pie = caja.current?.closest('[data-cambios]')?.querySelector<HTMLElement>('[data-pie-turno]')
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    pie?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' })
  }, [ver])
  return <div ref={caja} className={s.codigoCaja} data-codigo-visible={ver ? '' : undefined}>
    <p className={s.fraseCodigo}>{fraseCodigo(e)}</p>
    <button type="button" className={s.enlace} aria-expanded={ver} onClick={() => setVer(v => !v)} data-ver-codigo>
      {ver ? 'Ocultar el código' : 'Ver el código'}
    </button>
    {ver && <DiffCodigo e={e} />}
  </div>
}

/** Las líneas con su signo; lo igual lejos del cambio se pliega. */
function DiffCodigo({ e }: { e: Edicion }) {
  const lineas = useMemo(() => plegarLineas(e.lineas, 3), [e])
  const visibles = lineas.slice(0, MAX_LINEAS)
  return <pre className={s.lineas}>
    {visibles.map((l, k) => l.tipo === 'pliegue'
      ? <div key={k} className={s.pliegue}>{l.omitidas} {l.omitidas === 1 ? 'línea igual' : 'líneas iguales'}</div>
      : <div key={k} className={s.linea} data-tipo={l.tipo}>
          <span className={s.signo} aria-hidden>{l.tipo === 'agregada' ? '+' : l.tipo === 'quitada' ? '−' : ' '}</span>
          <span className={s.contenido}>{l.texto || ' '}</span>
        </div>)}
    {lineas.length > MAX_LINEAS && <div className={s.pliegue}>y {lineas.length - MAX_LINEAS} renglones más</div>}
  </pre>
}

/** «Ver ubicación»: el nombre técnico y la carpeta, solo si se piden. */
export function Ubicacion({ rutas, texto = 'Ver ubicación' }: { rutas: string[]; texto?: string }) {
  const [ver, setVer] = useState(false)
  if (!rutas.length) return null
  return <div className={s.ubicacion}>
    <button type="button" className={s.enlace} aria-expanded={ver} onClick={() => setVer(v => !v)}>{ver ? 'Ocultar ubicación' : texto}</button>
    {ver && <ul>{rutas.map(r => <li key={r}><code title={r}>{rutaCorta(r)}</code></li>)}</ul>}
  </div>
}

export function CuerpoDiff({ e }: { e: Edicion }) {
  return <div className={s.diff} data-diff data-diff-tipo={e.esTexto ? 'prosa' : 'codigo'}>
    {e.fallo && <p className={s.aviso}>Este cambio no se aplicó; el archivo quedó como estaba.</p>}
    {e.incompleto && <p className={s.aviso}>El detalle de este cambio llegó recortado; aquí va lo que se alcanzó a guardar.</p>}
    {e.escrito && e.esTexto && <p className={s.aviso}>Lo escribió completo. Así quedó:</p>}
    {e.esTexto ? (e.escrito ? <ProsaEscrita e={e} /> : <DiffProsa e={e} />) : <Codigo e={e} />}
    {e.ruta && <div className={s.diffPie}><Ubicacion rutas={[e.ruta]} /></div>}
  </div>
}

/**
 * Renglón de un archivo: plegado por defecto. `deshecho`: el archivo ya volvió a como estaba; la frase se atenúa y se
 * tacha, y a la derecha dice «Deshecho» (ronda 3). «Rehacer» vive una sola vez, al pie del turno: el checkpoint
 * del SDK rehace el turno entero, no un archivo suelto, y un botón por renglón prometería lo que no hace.
 */
export function DiffEdicion({ e, abierto: inicial = false, deshecho = false }: { e: Edicion; abierto?: boolean; deshecho?: boolean }) {
  const [abierto, setAbierto] = useState(inicial)
  return <li data-edicion={e.clase} {...(deshecho ? { 'data-deshecho': '' } : {})}>
    <div className={s.edicionCab}>
      <button type="button" className={s.edicionFila} aria-expanded={abierto} onClick={() => setAbierto(a => !a)} {...(e.fallo ? { 'data-fallo': '' } : {})}>
        <IconoClase e={e} />
        <span className={s.frase}>{resumenHumano(e)}{deshecho && <span className={s.soloLector}> (deshecho)</span>}</span>
        <ChevronRight className={s.flecha} aria-hidden />
      </button>
      {deshecho && <span className={s.marcaDeshecho} aria-hidden><Undo2 size={12} />Deshecho</span>}
    </div>
    {abierto && <CuerpoDiff e={e} />}
  </li>
}
