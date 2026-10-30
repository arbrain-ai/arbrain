'use client'

/**
 * Canvas v4 — LA BARRA CONTEXTUAL.
 *
 * Reemplaza a `Inspector` + `Typografia`, que eran dos barras FIJAS arriba al
 * centro de la pantalla. Dos problemas, los dos senalados por Daniel con
 * capturas de Miro al lado:
 *
 * 1. FIJA arriba = tienes que mirar a otro sitio para editar lo que tienes
 *    delante. La barra va anclada DEBAJO del elemento, se mueve con el, y salta
 *    arriba cuando no cabe.
 * 2. DOS barras = el mismo elemento se edita en dos sitios y hay que aprenderse
 *    cual controla que. Una sola, con separadores.
 *
 * QUE SE TOMA DE MIRO Y QUE NO:
 *   · SE TOMA la gramatica de los botones (relleno lleno / contorno anillo, la
 *     `A` con banda de color, el tamaño con escalera) porque es literal y no
 *     hay que aprenderla.
 *   · NO se toma el boton de comentario: sin multijugador seria una capacidad
 *     prometida y vacia — el pecado que el v3 cometio diez veces.
 *   · NO se toma "Colores de la marca +Agregar colores" vacio: los de Daniel ya
 *     existen y van en la primera fila, puestos.
 *   · SE AGREGA el ROL, que Miro no puede tener: es lo que deja que un cambio
 *     de tema repinte el lienzo entero. Un color suelto no sobrevive el cambio;
 *     un rol si.
 *   · SE AGREGA el boton de IA apuntando a Levy, que es el punto del producto.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  CanvasElement, Arrowhead, Routing, SectionTint, ShapeKind, StrokeStyle, TrazoOverride,
} from '../model/element'
import { bounds } from '../model/element'
import type { EdgeKind, Theme, Role } from '../theme/tokens'
import { estiloDeRol, resolveFill, resolveStroke, resolveRadius } from '../theme/tokens'
import type { Camera } from '../model/element'
import type { Viewport } from '../render/viewport'
import { worldToScreen } from '../render/viewport'
import type { TextStyle, FontFamily } from '../text/types'
import { FAMILIAS, PESOS, type TipografiaPatch } from '../model/typography'
import { SIN_COLOR, MARCA, PALETA, RELLENOS, RESALTADOS, type Muestra } from './paleta'
import * as I from './icons'
import { contarPorCategoria, esSeleccionMixta, ROTULO_CATEGORIA, textoObjetos, type CategoriaElemento } from '../model/filtro-seleccion'

/** Alto de la barra. Se usa para decidir si cabe debajo del elemento. */
const ALTO = 42
/** Aire entre la barra y el elemento. Pegada se lee como parte del dibujo. */
const AIRE = 14

interface Props {
  /** Toda la seleccion. La barra edita a TODOS, no solo al primero. */
  elementos: CanvasElement[]
  theme: Theme
  camera: Camera
  viewport: Viewport
  /** Estilo de texto comun a la seleccion. Un campo ausente = valores distintos. */
  estiloTexto: Partial<TextStyle> & { align?: string }
  conTexto: boolean
  /**
   * Aplica el parche a la seleccion.
   *
   * `solo` acota a QUE elementos. Sin el, pintar de rojo tres figuras y sus dos
   * flechas le metia un campo `color` a los conectores, que no lo leen: datos
   * muertos escritos en silencio, exactamente el patron que este canvas existe
   * para no repetir.
   */
  onChange: (patch: Partial<CanvasElement>, solo?: (e: CanvasElement) => boolean) => void
  onTipografia: (p: TipografiaPatch) => void
  /**
   * Abre y cierra un GESTO continuo (arrastrar un deslizador).
   *
   * Sin esto, arrastrar el grosor de 1.5 a 6 dejaba DIEZ entradas en el
   * historial y un deshacer retrocedia un escalon. Medido el 20 ago 2026. Es la
   * misma clase de fallo que el lienzo ya habia resuelto para arrastrar figuras
   * ("el deshacer devolvia 1.5px"), y la barra no usaba el mecanismo que ya
   * existia — un arreglo aprendido que no se aplico en la superficie nueva.
   */
  onGestoInicio?: () => void
  onGestoFin?: (etiqueta: string) => void
  onDelete: () => void
  onDuplicate: () => void
  onFront: () => void
  onBack: () => void
  /**
   * ACOMODAR — el motor de layout del compilador, aplicado a la seleccion.
   *
   * Aqui iba el boton de destello de Miro, que abre su chat de IA. NO se copio:
   * este lienzo no tiene chat, y un boton que abre algo inexistente es
   * exactamente el pecado que el v3 cometio diez veces en su contrato.
   *
   * Lo que si existe y nadie podia alcanzar es `arrange` (dagre), afinado desde
   * el primer dia y encerrado dentro del compilador. Ese es el boton: se
   * seleccionan cajas conectadas y se colocan solas. Es la capa semantica hecha
   * gesto, y hace algo real la primera vez que se toca.
   *
   * `undefined` = no hay nada que acomodar (menos de dos figuras) y el boton no
   * se pinta. Un boton en gris que no explica por que esta en gris es peor que
   * la ausencia.
   */
  onAcomodar?: () => void
  /**
   * Cuantas de las seleccionadas estan bloqueadas y NO se van a mover.
   *
   * Se dice ANTES de pulsar, en el propio boton. Un acomodo que respeta un
   * candado se ve exactamente igual que uno que no funciono, y la unica forma
   * honesta de distinguirlos es avisar de que va a pasar.
   */
  acomodarBloqueados?: number
  /**
   * Fija o suelta el ANCLAJE de un conector.
   *
   * Existe porque un anclaje que no se puede soltar es una trampa: conectas por
   * el lado equivocado, mueves la caja esperando que la flecha se acomode, y no
   * se acomoda nunca. La decision de la mano tiene que poder deshacerse por la
   * misma mano.
   */
  onAnclaje?: (fijar: boolean) => void
  /** Seleccion mixta: elegir un tipo REDUCE la seleccion a ese tipo. */
  onFiltrar?: (categoria: CategoriaElemento) => void
  onAgrupar?: () => void
  onDesagrupar?: () => void
  /** Hay algo agrupado en la seleccion: la barra enseña «Desagrupar» en vez de «Agrupar». */
  hayGrupo?: boolean
}

/**
 * Los roles que se ofrecen a mano.
 *
 * ⚠️ `drawn` TIENE QUE ESTAR. Es el rol con el que nace toda figura dibujada, y
 * sin entrada aqui el boton enseñaba el id interno crudo — se veia "drawn" en
 * la barra, en ingles y sin significado. Lo cazo una captura, no una metrica:
 * el modelo estaba bien y lo que fallaba era lo que la pantalla decia.
 */
const ROLES: Array<{ role: Role; label: string }> = [
  { role: 'drawn', label: 'A mano' },
  { role: 'card', label: 'Neutro' }, { role: 'module', label: 'Módulo' },
  { role: 'form', label: 'Entrada' }, { role: 'callout', label: 'Llamada' },
  { role: 'deliverable', label: 'Entregable' }, { role: 'trigger', label: 'Disparador' },
  { role: 'agent', label: 'Agente' }, { role: 'risk', label: 'Riesgo' },
  { role: 'sticky', label: 'Nota' },
]

const FIGURAS: Array<{ id: ShapeKind; label: string; Icono: (p: { size?: number }) => React.ReactElement }> = [
  { id: 'rect', label: 'Rectángulo', Icono: I.IconSquare },
  { id: 'pill', label: 'Píldora', Icono: I.IconPill },
  { id: 'ellipse', label: 'Elipse', Icono: I.IconCircle },
  { id: 'diamond', label: 'Rombo', Icono: I.IconDiamond },
  { id: 'triangle', label: 'Triángulo', Icono: I.IconTriangle },
  { id: 'hexagon', label: 'Hexágono', Icono: I.IconHexagon },
  { id: 'star', label: 'Estrella', Icono: I.IconStar },
  { id: 'arrow', label: 'Flecha', Icono: I.IconArrowShape },
]

const TINTES: SectionTint[] = ['neutro', 'morado', 'ambar', 'verde', 'azul', 'rosa', 'rojo']
const ETIQUETA_TINTE: Record<SectionTint, string> = {
  neutro: 'Neutro', morado: 'Morado', ambar: 'Ámbar', verde: 'Verde',
  azul: 'Azul', rosa: 'Rosa', rojo: 'Rojo',
}
const TINTAS: Array<string | undefined> = [undefined, '#8C27F1', '#dc2626', '#0d9488', '#2563eb', '#d97706']

const PUNTAS: Array<{ id: Arrowhead; label: string }> = [
  { id: 'ninguna', label: 'Ninguna' }, { id: 'flecha', label: 'Flecha' },
  { id: 'triangulo', label: 'Triángulo' }, { id: 'rombo', label: 'Rombo' },
  { id: 'circulo', label: 'Círculo' }, { id: 'barra', label: 'Barra' },
]
const RUTAS: Array<{ id: Routing; label: string; icon: (p: { size?: number }) => React.ReactElement }> = [
  { id: 'ortogonal', label: 'Codos', icon: I.IconRutaCodos },
  { id: 'recta', label: 'Recta', icon: I.IconRutaRecta },
  { id: 'curva', label: 'Curva', icon: I.IconRutaCurva },
]
const CLASES: Array<{ id: EdgeKind; label: string }> = [
  { id: 'flujo', label: 'Flujo' }, { id: 'agente', label: 'Agente' },
  { id: 'fragil', label: 'Frágil' }, { id: 'hueco', label: 'Hueco' },
]
const ESTILOS_LINEA: Array<{ id: StrokeStyle; label: string; Icono: (p: { size?: number }) => React.ReactElement }> = [
  { id: 'solid', label: 'Sólida', Icono: I.IconLineSolid },
  { id: 'dashed', label: 'Guiones', Icono: I.IconLineDashed },
  { id: 'dotted', label: 'Puntos', Icono: I.IconLineDotted },
]
const CSS_FAMILY: Record<FontFamily, string> = {
  montserrat: 'CanvasSans', 'roboto-slab': 'CanvasSlab',
  caveat: 'CanvasHand', 'jetbrains-mono': 'CanvasMono',
}
const NOMBRE_TIPO: Record<string, string> = {
  shape: 'Figura', text: 'Texto', ink: 'Trazo', connector: 'Conector',
  frame: 'Sección', image: 'Imagen', table: 'Tabla', embed: 'Embed', code: 'Código',
}

/* ────────────────────────────────────────────────────────────────────────────
 * ⚠️ ESTOS TRES VIVEN A NIVEL DE MODULO, Y NO ES ESTILO.
 *
 * Estaban definidos DENTRO del cuerpo de `BarraContextual`. En React eso crea
 * un TIPO DE COMPONENTE NUEVO en cada render, asi que el arbol entero se
 * desmonta y se vuelve a montar en cada cambio de estado. Medido el 20 ago
 * 2026: arrastrar el grosor de 2.5 a 6 terminaba en 2 — el input se destruia a
 * media pulsacion y el navegador perdia el puntero.
 *
 * Es el fallo que se lee como "la app se siente rara" y no aparece en ninguna
 * metrica: el modelo estaba bien y lo que fallaba era el ciclo de vida.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Una casilla de color de la paleta. */
function Casilla({ m, activo, onPick, redondo, t }: {
  m: Muestra; activo: boolean; onPick: () => void; redondo?: boolean; t: Theme
}) {
  return (
    <button type="button" title={m.label} data-muestra={m.id} onClick={onPick}
      style={{
        width: 24, height: 24, borderRadius: redondo ? 99 : 7, cursor: 'pointer', padding: 0,
        background: m.color ?? `repeating-conic-gradient(${t.text.caption}22 0% 25%, transparent 0% 50%) 50% / 9px 9px`,
        border: activo ? `2.5px solid ${t.accent}` : `1px solid ${t.roles.card.stroke.color}`,
        display: 'grid', placeItems: 'center',
      }}>
      {/* La casilla del tema lleva una diagonal: es la unica que NO es un color
          y sin marca se confunde con "blanco". */}
      {!m.color && <span style={{ width: 15, height: 2, background: t.text.caption,
                                  transform: 'rotate(-45deg)', borderRadius: 2 }} />}
    </button>
  )
}

function Paleta({ muestras, valor, onPick, redondo, t }: {
  muestras: Muestra[]; valor?: string; onPick: (c?: string) => void; redondo?: boolean; t: Theme
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Casilla t={t} m={SIN_COLOR} activo={!valor} onPick={() => onPick(undefined)} redondo={redondo} />
        <span style={{ width: 1, height: 20, background: t.roles.card.stroke.color, opacity: .7 }} />
        {MARCA.map(m => (
          <Casilla key={m.id} t={t} m={m} activo={valor === m.color} onPick={() => onPick(m.color)} redondo={redondo} />
        ))}
        <span style={{ font: '700 9px CanvasSans, system-ui', letterSpacing: .5,
                       textTransform: 'uppercase', color: t.text.caption, marginLeft: 2 }}>marca</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 24px)', gap: 6 }}>
        {muestras.map(m => (
          <Casilla key={m.id} t={t} m={m} activo={valor === m.color} onPick={() => onPick(m.color)} redondo={redondo} />
        ))}
      </div>
    </div>
  )
}

/**
 * Un deslizador que el historial ve como UN cambio, no como cuarenta.
 *
 * Arrastrar el grosor de 1.5 a 6 dejaba DIEZ entradas y un deshacer retrocedia
 * un escalon — la misma clase de fallo que el lienzo ya habia resuelto para
 * arrastrar figuras, sin aplicar aqui.
 *
 * El cierre va sobre `pointerup` de la VENTANA, no del propio input: soltar el
 * dedo fuera del riel es lo normal al llegar al tope, y con el listener en el
 * input ese gesto no cerraria nunca, dejando el historial abierto para siempre.
 */
function Deslizador({ etiqueta, t, onGestoInicio, onGestoFin, ...props }: {
  etiqueta: string; t: Theme
  onGestoInicio?: () => void; onGestoFin?: (etiqueta: string) => void
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input type="range" {...props}
      onPointerDown={() => {
        onGestoInicio?.()
        const fin = () => { onGestoFin?.(etiqueta); window.removeEventListener('pointerup', fin) }
        window.addEventListener('pointerup', fin)
      }}
      style={{ accentColor: t.accent, ...(props.style ?? {}) }} />
  )
}

export function BarraContextual(p: Props) {
  const { elementos: els, theme: t, camera, viewport: vp } = p
  const [pop, setPop] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  /**
   * CERRAR AL TOCAR FUERA.
   *
   * Daniel: *"las opciones de tipografia deberian desaparecer al hacer clic
   * afuera"*. Un panel que solo se cierra con su propio boton tapa el lienzo
   * justo donde estas trabajando, y hay que acordarse de que quedo abierto.
   */
  useEffect(() => {
    if (!pop) return
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setPop(null)
    }
    // `capture` porque el lienzo se traga los eventos de puntero para sus
    // gestos: sin capturar, un clic en el lienzo cerraria el panel a veces si
    // y a veces no, segun que gesto empezara.
    window.addEventListener('pointerdown', fuera, true)
    return () => window.removeEventListener('pointerdown', fuera, true)
  }, [pop])

  // Se mide el ancho REAL despues de pintar, para poder centrarla y acotarla a
  // la pantalla. Estimarlo por el numero de botones fallaria en cuanto un menu
  // enseñe un nombre de fuente largo.
  useLayoutEffect(() => {
    const w = raiz.current?.offsetWidth ?? 0
    if (w && Math.abs(w - ancho) > 1) setAncho(w)
  })

  /* ── DONDE VA LA BARRA ────────────────────────────────────────────────────
     Debajo de la caja de la seleccion, centrada en ella. Si no cabe abajo,
     salta arriba; si tampoco cabe (elemento mas alto que la pantalla), se pega
     al borde inferior — porque una barra fuera de la pantalla es una barra que
     no existe.                                                              */
  const caja = els.reduce((acc, e) => {
    const b = bounds(e)
    return {
      x0: Math.min(acc.x0, b.x), y0: Math.min(acc.y0, b.y),
      x1: Math.max(acc.x1, b.x + b.width), y1: Math.max(acc.y1, b.y + b.height),
    }
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
  const sup = worldToScreen({ x: (caja.x0 + caja.x1) / 2, y: caja.y0 }, camera, vp)
  const inf = worldToScreen({ x: (caja.x0 + caja.x1) / 2, y: caja.y1 }, camera, vp)

  const cabeAbajo = inf.y + AIRE + ALTO < vp.height - 8
  const crudo = cabeAbajo ? inf.y + AIRE
              : sup.y - AIRE - ALTO > 8 ? sup.y - AIRE - ALTO
              : vp.height - ALTO - 10
  /*
   * ACOTADA A LA PANTALLA, SIEMPRE.
   *
   * Sin este acote, seleccionar algo y despues panear hasta sacarlo de vista
   * se lleva la barra fuera con el — y lo que ves es que la barra
   * "desaparecio", no que el elemento se fue. Miro la mantiene pegada al borde
   * por lo mismo: sigue habiendo una seleccion, y sus controles tienen que
   * estar donde se puedan tocar.
   */
  const top = Math.min(Math.max(8, crudo), Math.max(8, vp.height - ALTO - 8))
  const left = Math.min(Math.max(8, inf.x - ancho / 2), Math.max(8, vp.width - ancho - 8))

  /* ── ESTILO ─────────────────────────────────────────────────────────────── */
  const suave = t.name === 'oscuro' ? 'rgba(169,92,255,.20)' : 'rgba(140,39,241,.12)'
  const btn = (activo?: boolean): React.CSSProperties => ({
    height: 32, minWidth: 32, padding: '0 6px', borderRadius: 8, border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: activo ? suave : 'transparent', color: activo ? t.accent : t.text.body,
    font: '600 12px CanvasSans, system-ui', whiteSpace: 'nowrap',
  })
  const hover = (on: boolean) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.currentTarget.dataset.activo === '1') return
    e.currentTarget.style.background = on ? t.roles.sticky.fill : 'transparent'
  }
  const sep = <div style={{ width: 1, height: 20, background: t.roles.card.stroke.color, opacity: .7, margin: '0 3px' }} />
  const panelBase: React.CSSProperties = {
    position: 'absolute', top: 40, padding: 8, borderRadius: 11, zIndex: 60,
    background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
    boxShadow: t.name === 'oscuro' ? '0 12px 34px rgba(0,0,0,.62)' : '0 12px 34px rgba(15,15,25,.15)',
  }

  /* ── LO QUE HAY SELECCIONADO ────────────────────────────────────────────── */
  const uno = els.length === 1 ? els[0] : null
  const figuras = els.filter(e => e.type === 'shape') as Extract<CanvasElement, { type: 'shape' }>[]
  const secciones = els.filter(e => e.type === 'frame') as Extract<CanvasElement, { type: 'frame' }>[]
  const conTrazo = [...figuras, ...secciones]
  const bloqueado = els.some(e => e.locked)
  const fijado = els.some(e => e.origin?.pinned)

  /**
   * El valor que la barra ENSEÑA para un atributo.
   *
   * Si no coincide, `undefined`: un control en blanco significa "hay varios
   * valores", nunca "es este".
   *
   * ⚠️ RECIBE SOBRE QUE PREGUNTAR. Preguntaba siempre sobre TODA la seleccion,
   * y un conector no tiene forma ni rol — asi que seleccionar tres figuras
   * identicas mas sus dos flechas hacia decir "Varios" en los dos botones. Se
   * vio en una captura: el modelo estaba bien y lo que mentia era la pantalla.
   */
  const comun = <T,>(f: (e: CanvasElement) => T, sobre: CanvasElement[] = els): T | undefined => {
    if (!sobre.length) return undefined
    const v = f(sobre[0])
    return sobre.every(e => f(e) === v) ? v : undefined
  }
  const trazoDe = (e: CanvasElement): TrazoOverride | undefined =>
    (e as { trazo?: TrazoOverride }).trazo
  const estiloLinea = comun(e => trazoDe(e)?.style, conTrazo.length ? conTrazo : els)
  const grosor = comun(e => trazoDe(e)?.width, conTrazo.length ? conTrazo : els)
  const radio = comun(e => trazoDe(e)?.radius, conTrazo.length ? conTrazo : els)
  const conLetras = els.filter(e => e.type === 'shape' || e.type === 'text')
  const colorTexto = comun(e => (e as { color?: { text?: string } }).color?.text, conLetras.length ? conLetras : els)
  const resaltado = comun(e => (e as { color?: { highlight?: string } }).color?.highlight, conLetras.length ? conLetras : els)
  const relleno = comun(e => (e as { color?: { fill?: string } }).color?.fill, figuras.length ? figuras : els)
  const contorno = comun(e => (e as { color?: { stroke?: string } }).color?.stroke, conTrazo.length ? conTrazo : els)
  const enlace = comun(e => e.link)

  /** Aplica un parche de trazo CONSERVANDO lo que ya habia. */
  const setTrazo = (patch: Partial<Omit<TrazoOverride, 'explicit'>>) => {
    const base = conTrazo[0] ? trazoDe(conTrazo[0]) : undefined
    p.onChange({ trazo: { ...base, ...patch, explicit: true } } as Partial<CanvasElement>,
      e => e.type === 'shape' || e.type === 'frame')
  }
  /** Igual para el color: cambiar el relleno no debe borrar el contorno. */
  const setColor = (patch: { fill?: string; stroke?: string; text?: string; highlight?: string }) => {
    // La BASE sale de un elemento que de verdad tenga colores, no del primero
    // de la seleccion: si el primero es un conector, se partiria de un objeto
    // vacio y se perderia lo que la mano ya habia elegido en las figuras.
    const conColor = els.find(e => e.type === 'shape' || e.type === 'text' || e.type === 'ink') ?? els[0]
    const base = (conColor as { color?: Record<string, unknown> }).color ?? {}
    const mezcla: Record<string, unknown> = { ...base, ...patch, explicit: true }
    // Un valor `undefined` explicito significa "devuelvelo al rol": se BORRA la
    // llave. Dejarla en undefined la mantendria viva en el JSON y el proximo
    // merge la reviviria.
    for (const k of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[k] === undefined) delete mezcla[k]
    }
    const quedan = Object.keys(mezcla).filter(k => k !== 'explicit')
    p.onChange({ color: quedan.length ? mezcla : undefined } as Partial<CanvasElement>,
      e => e.type === 'shape' || e.type === 'text' || e.type === 'ink')
  }

  const abrir = (id: string) => () => setPop(x => x === id ? null : id)

  const rotulo = (s: string) => (
    <div style={{ font: '700 10px CanvasSans, system-ui', letterSpacing: .5,
                  textTransform: 'uppercase', color: t.text.caption }}>{s}</div>
  )

  const tam = p.estiloTexto.size ? Math.round(p.estiloTexto.size) : undefined
  const familia = p.estiloTexto.family
  const alinea = p.estiloTexto.align

  /* ── SELECCION MIXTA (estilo Miro) ────────────────────────────────────────
     Varios tipos distintos: ni tipografia, ni figura, ni trazo — no significan
     nada para la mezcla. Filtro por tipo, agrupar, bloquear y el menu «⋯».
     Solo cuando todo es del mismo tipo salen los controles propios.          */
  if (esSeleccionMixta(els)) {
    const cuentas = contarPorCategoria(els)
    return (
      <div ref={raiz} data-barra-contextual data-barra-mixta style={{
        position: 'absolute', left, top, height: ALTO,
        display: 'flex', alignItems: 'center', gap: 1, padding: '0 5px',
        background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`, borderRadius: 12,
        boxShadow: t.name === 'oscuro' ? '0 8px 28px rgba(0,0,0,.55)' : '0 8px 28px rgba(15,15,25,.12)',
        font: '600 12px CanvasSans, system-ui', color: t.text.body, zIndex: 30, touchAction: 'none',
      }} onPointerDown={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <button type="button" data-filtro title="Quedarte solo con un tipo de objeto" onClick={abrir('filtro')}
            data-activo={pop === 'filtro' ? '1' : '0'} style={{ ...btn(pop === 'filtro'), padding: '0 8px' }}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            Filtro · {textoObjetos(els.length)}<I.IconChevronDown size={10} />
          </button>
          {pop === 'filtro' && (
            <div style={{ ...panelBase, left: 0, display: 'grid', gap: 2, minWidth: 190 }}>
              {rotulo('Quedarte solo con')}
              {cuentas.map(c => (
                <button key={c.categoria} type="button" data-filtro-tipo={c.categoria}
                  onClick={() => { p.onFiltrar?.(c.categoria); setPop(null) }}
                  style={{ ...btn(), justifyContent: 'space-between', width: '100%', height: 30, padding: '0 8px' }}>
                  <span style={{ textTransform: 'capitalize' }}>{ROTULO_CATEGORIA[c.categoria][1]}</span>
                  <span style={{ color: t.text.caption }}>{c.cuantos}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {sep}
        <button type="button" data-agrupar={p.hayGrupo ? 'desagrupar' : 'agrupar'}
          title={p.hayGrupo ? 'Desagrupar (⌘⇧G)' : 'Agrupar (⌘G)'}
          onClick={() => (p.hayGrupo ? p.onDesagrupar : p.onAgrupar)?.()}
          style={{ ...btn(), padding: '0 8px' }}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <I.IconGroup size={16} />{p.hayGrupo ? 'Desagrupar' : 'Agrupar'}
        </button>
        <button type="button" data-candado title={bloqueado ? 'Desbloquear (⌘⇧L)' : 'Bloquear (⌘⇧L)'}
          onClick={() => p.onChange({ locked: !bloqueado })}
          data-activo={bloqueado ? '1' : '0'} style={{ ...btn(bloqueado), padding: '0 8px' }}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          {bloqueado ? <I.IconLock size={16} /> : <I.IconUnlock size={16} />}{bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
        <div style={{ position: 'relative' }}>
          <button type="button" data-mas title="Más" onClick={abrir('mas')}
            data-activo={pop === 'mas' ? '1' : '0'} style={btn(pop === 'mas')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <I.IconDots size={17} />
          </button>
          {pop === 'mas' && (
            <div style={{ ...panelBase, right: 0, left: 'auto', display: 'grid', gap: 2, minWidth: 190 }}>
              {([
                ['Traer al frente', <I.IconBringFront size={16} key="f" />, p.onFront, 'frente'],
                ['Enviar al fondo', <I.IconSendBack size={16} key="b" />, p.onBack, 'fondo'],
                ['Duplicar  ⌘D', <I.IconDuplicate size={16} key="d" />, p.onDuplicate, 'duplicar'],
              ] as const).map(([label, icono, fn, key]) => (
                <button key={key} type="button" data-mas-accion={key}
                  onClick={() => { fn(); setPop(null) }}
                  style={{ ...btn(), justifyContent: 'flex-start', width: '100%', height: 30, padding: '0 8px' }}>
                  {icono}{label}
                </button>
              ))}
              <div style={{ height: 1, background: t.roles.card.stroke.color, opacity: .7, margin: '3px 0' }} />
              <button type="button" data-borrar onClick={() => { p.onDelete(); setPop(null) }}
                style={{ ...btn(), justifyContent: 'flex-start', width: '100%', height: 30, padding: '0 8px',
                         color: t.roles.risk.stroke.color }}>
                <I.IconTrash size={16} />Eliminar  Supr
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={raiz} data-barra-contextual style={{
      position: 'absolute', left, top, height: ALTO,
      display: 'flex', alignItems: 'center', gap: 1, padding: '0 5px',
      background: t.roles.card.fill,
      border: `1px solid ${t.roles.card.stroke.color}`,
      borderRadius: 12,
      boxShadow: t.name === 'oscuro' ? '0 8px 28px rgba(0,0,0,.55)' : '0 8px 28px rgba(15,15,25,.12)',
      font: '600 12px CanvasSans, system-ui', color: t.text.body, zIndex: 30,
      // Sin esto, arrastrar la barra panea el lienzo por debajo.
      touchAction: 'none',
    }}
      onPointerDown={e => e.stopPropagation()}>

      {/* ── QUE ES ───────────────────────────────────────────────────────────
          Solo con VARIOS seleccionados. Con uno, los iconos ya dicen que es y
          la palabra solo roba ancho — Miro no la pone por eso mismo. Con
          varios si hace falta: "3 elementos" es la unica pista de sobre cuantas
          cosas va a caer el siguiente clic. */}
      {els.length > 1 && <>
        <span style={{ padding: '0 7px 0 4px', color: t.text.caption, whiteSpace: 'nowrap' }}>
          {els.length} elementos
        </span>
        {sep}
      </>}
      {fijado && <span title="Lo tocó tu mano: el compilador ya no lo manda"
        style={{ ...btn(), color: t.accent, cursor: 'default', padding: '0 4px' }}><I.IconPin size={14} /></span>}

      {/* ── FIGURA: cambiar de forma ──────────────────────────────────────── */}
      {figuras.length > 0 && (() => {
        const actual = comun(e => (e as { shape?: ShapeKind }).shape, figuras)
        const Act = FIGURAS.find(f => f.id === actual)?.Icono ?? I.IconShapes
        return (
          <div style={{ position: 'relative' }}>
            <button type="button" data-forma title="Cambiar la forma" onClick={abrir('forma')}
              data-activo={pop === 'forma' ? '1' : '0'} style={btn(pop === 'forma')}
              onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
              <Act size={17} /><I.IconChevronDown size={10} />
            </button>
            {pop === 'forma' && (
              <div style={{ ...panelBase, left: 0, display: 'grid', gap: 8 }}>
                {rotulo('Forma')}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 34px)', gap: 4 }}>
                  {FIGURAS.map(f => (
                    <button key={f.id} type="button" data-figura={f.id} title={f.label}
                      onClick={() => { p.onChange({ shape: f.id } as Partial<CanvasElement>, e => e.type === 'shape'); setPop(null) }}
                      style={{ ...btn(actual === f.id), width: 34, height: 34, padding: 0 }}>
                      <f.Icono size={18} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── ROL: lo que Miro no tiene ─────────────────────────────────────── */}
      {figuras.length > 0 && (() => {
        const rol = comun(e => (e as { role?: Role }).role, figuras)
        return (
          <div style={{ position: 'relative' }}>
            <button type="button" data-inspector-rol title="Rol (decide su color en cualquier tema)"
              onClick={abrir('rol')} data-activo={pop === 'rol' ? '1' : '0'} style={btn(pop === 'rol')}
              onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
              <span style={{
                width: 13, height: 13, borderRadius: 4, flexShrink: 0,
                background: rol ? estiloDeRol(t, rol).fill : 'transparent',
                border: `2px ${rol ? estiloDeRol(t, rol).stroke.style : 'dashed'} ${rol ? estiloDeRol(t, rol).stroke.color : t.text.caption}`,
              }} />
              {rol ? (ROLES.find(r => r.role === rol)?.label ?? rol) : 'Varios'}
              <I.IconChevronDown size={10} />
            </button>
            {pop === 'rol' && (
              <div style={{ ...panelBase, left: 0, display: 'grid', gap: 6, minWidth: 178 }}>
                {rotulo('Rol')}
                <div style={{ display: 'grid', gap: 2 }}>
                  {ROLES.map(r => (
                    <button key={r.role} type="button" data-rol={r.role}
                      onClick={() => { p.onChange({ role: r.role } as Partial<CanvasElement>, e => e.type === 'shape'); setPop(null) }}
                      style={{ ...btn(rol === r.role), justifyContent: 'flex-start', width: '100%',
                               padding: '0 8px', height: 30 }}>
                      <span style={{
                        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                        background: t.roles[r.role].fill,
                        border: `2px ${t.roles[r.role].stroke.style} ${t.roles[r.role].stroke.color}`,
                      }} />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── TIPOGRAFIA ────────────────────────────────────────────────────── */}
      {p.conTexto && <>
        {(figuras.length > 0 || secciones.length > 0) && sep}
        <div style={{ position: 'relative' }}>
          <button type="button" data-familia title="Tipografía" onClick={abrir('familia')}
            data-activo={pop === 'familia' ? '1' : '0'}
            style={{ ...btn(pop === 'familia'), fontFamily: familia ? CSS_FAMILY[familia] : undefined, fontSize: 13 }}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            {FAMILIAS.find(f => f.id === familia)?.label ?? 'Varias'}
            <I.IconChevronDown size={10} />
          </button>
          {pop === 'familia' && (
            <div style={{ ...panelBase, left: 0, display: 'grid', gap: 6, minWidth: 190 }}>
              {rotulo('Tipografía')}
              <div style={{ display: 'grid', gap: 2 }}>
                {FAMILIAS.map(f => (
                  <button key={f.id} type="button" data-tipografia={f.id}
                    onClick={() => { p.onTipografia({ family: f.id }); setPop(null) }}
                    style={{ ...btn(familia === f.id), justifyContent: 'flex-start', width: '100%',
                             padding: '0 9px', height: 32, fontFamily: CSS_FAMILY[f.id], fontSize: 14 }}>
                    {f.label}
                  </button>
                ))}
              </div>
              {rotulo('Grosor')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {(familia ? PESOS[familia] : PESOS.montserrat).map(w => (
                  <button key={w} type="button" data-peso={w}
                    onClick={() => p.onTipografia({ weight: w })}
                    style={{ ...btn(p.estiloTexto.weight === w), height: 26, minWidth: 34,
                             fontWeight: w, fontSize: 11 }}>{w}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TAMAÑO con escalera. El numero se puede escribir; las flechas suben
            y bajan de una en una. Un menu de tallas obliga a aceptar un salto
            de 20 a 24 cuando lo que querias era 22. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <input data-tamano type="text" inputMode="numeric" value={tam ?? ''} placeholder="—"
            onChange={e => {
              const n = Number(e.target.value.replace(/[^\d]/g, ''))
              if (n >= 6 && n <= 400) p.onTipografia({ size: n })
            }}
            title="Tamaño"
            style={{
              width: 36, height: 28, textAlign: 'center', borderRadius: 7,
              border: `1px solid ${t.roles.card.stroke.color}`, background: t.canvas,
              color: t.text.body, font: '600 12px CanvasSans, system-ui', outline: 'none',
            }} />
          <div style={{ display: 'grid' }}>
            <button type="button" data-tamano-mas title="Más grande"
              onClick={() => p.onTipografia({ size: Math.min(400, (tam ?? 20) + 1) })}
              style={{ ...btn(), height: 15, minWidth: 20, padding: 0 }}><I.IconCaretUp size={12} /></button>
            <button type="button" data-tamano-menos title="Más chico"
              onClick={() => p.onTipografia({ size: Math.max(6, (tam ?? 20) - 1) })}
              style={{ ...btn(), height: 15, minWidth: 20, padding: 0 }}><I.IconCaretDown size={12} /></button>
          </div>
        </div>

        <button type="button" data-negrita title="Negrita  ⌘B" style={btn((p.estiloTexto.weight ?? 400) >= 600)}
          data-activo={(p.estiloTexto.weight ?? 400) >= 600 ? '1' : '0'}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}
          onClick={() => p.onTipografia({ weight: (p.estiloTexto.weight ?? 400) >= 600 ? 400 : 700 })}>
          <I.IconBold size={15} /></button>
        <button type="button" data-cursiva title="Cursiva  ⌘I" style={btn(p.estiloTexto.italic === true)}
          data-activo={p.estiloTexto.italic ? '1' : '0'}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}
          onClick={() => p.onTipografia({ italic: !p.estiloTexto.italic })}>
          <I.IconItalic size={15} /></button>
        <button type="button" data-subrayado title="Subrayado  ⌘U" style={btn(p.estiloTexto.underline === true)}
          data-activo={p.estiloTexto.underline ? '1' : '0'}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}
          onClick={() => p.onTipografia({ underline: !p.estiloTexto.underline })}>
          <I.IconUnderline size={15} /></button>

        {/* ALINEACION — ahora tambien en figuras, no solo en bloques de texto */}
        <div style={{ position: 'relative' }}>
          <button type="button" data-alinear title="Alineación" onClick={abrir('alinear')}
            data-activo={pop === 'alinear' ? '1' : '0'} style={btn(pop === 'alinear')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            {alinea === 'left' ? <I.IconAlignLeft size={15} />
              : alinea === 'right' ? <I.IconAlignRight size={15} />
              : <I.IconAlignCenter size={15} />}
          </button>
          {pop === 'alinear' && (
            <div style={{ ...panelBase, left: 0, display: 'flex', gap: 3 }}>
              {([['left', I.IconAlignLeft, 'Izquierda'], ['center', I.IconAlignCenter, 'Centro'],
                 ['right', I.IconAlignRight, 'Derecha']] as const).map(([a, Icono, label]) => (
                <button key={a} type="button" data-alinea={a} title={label}
                  onClick={() => { p.onTipografia({ align: a }); setPop(null) }}
                  style={{ ...btn(alinea === a), width: 34, height: 30, padding: 0 }}><Icono size={16} /></button>
              ))}
            </div>
          )}
        </div>

        {/* COLOR DE TEXTO */}
        <div style={{ position: 'relative' }}>
          <button type="button" data-color-texto title="Color del texto" onClick={abrir('texto')}
            data-activo={pop === 'texto' ? '1' : '0'} style={btn(pop === 'texto')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <I.IconTextColor size={17} color={colorTexto ?? t.text.body} />
          </button>
          {pop === 'texto' && (
            <div style={{ ...panelBase, left: -60, display: 'grid', gap: 9 }}>
              {rotulo('Color del texto')}
              <Paleta t={t} muestras={PALETA} valor={colorTexto} onPick={c => setColor({ text: c })} />
            </div>
          )}
        </div>

        {/* RESALTADOR */}
        <div style={{ position: 'relative' }}>
          <button type="button" data-resaltar title="Resaltar" onClick={abrir('resaltar')}
            data-activo={pop === 'resaltar' ? '1' : '0'} style={btn(pop === 'resaltar')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <I.IconHighlight size={17} color={resaltado ?? 'transparent'} />
          </button>
          {pop === 'resaltar' && (
            <div style={{ ...panelBase, left: -80, display: 'grid', gap: 9 }}>
              {rotulo('Resaltado')}
              <div style={{ display: 'flex', gap: 6 }}>
                <Casilla t={t} m={SIN_COLOR} activo={!resaltado} onPick={() => setColor({ highlight: undefined })} />
                {RESALTADOS.map(m => (
                  <Casilla key={m.id} t={t} m={m} activo={resaltado === m.color}
                    onPick={() => setColor({ highlight: m.color })} />
                ))}
              </div>
            </div>
          )}
        </div>
      </>}

      {/* ── CONTORNO Y RELLENO ────────────────────────────────────────────── */}
      {conTrazo.length > 0 && <>
        {sep}
        <div style={{ position: 'relative' }}>
          <button type="button" data-contorno title="Contorno" onClick={abrir('contorno')}
            data-activo={pop === 'contorno' ? '1' : '0'} style={btn(pop === 'contorno')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <I.IconStroke size={18} color={contorno ?? (figuras[0]
              ? resolveStroke(t, figuras[0].role, figuras[0].color, figuras[0].trazo).color
              : t.text.body)} />
          </button>
          {pop === 'contorno' && (() => {
            const ref = conTrazo[0]
            const efect = ref.type === 'shape'
              ? resolveStroke(t, ref.role, ref.color, ref.trazo)
              : { style: ref.trazo?.style ?? 'solid', width: ref.trazo?.width ?? 1.5 }
            const efectRadio = ref.type === 'shape' ? resolveRadius(t, ref.role, ref.trazo)
                             : (ref.trazo?.radius ?? t.roles.tray.radius)
            return (
              <div style={{ ...panelBase, left: -100, display: 'grid', gap: 11, width: 236 }}>
                {rotulo('Estilo')}
                <div style={{ display: 'flex', gap: 4 }}>
                  {ESTILOS_LINEA.map(l => (
                    <button key={l.id} type="button" data-linea={l.id} title={l.label}
                      onClick={() => setTrazo({ style: l.id })}
                      style={{ ...btn(estiloLinea === l.id || (!estiloLinea && efect.style === l.id)),
                               flex: 1, height: 30 }}><l.Icono size={18} /></button>
                  ))}
                </div>
                <label style={{ display: 'grid', gap: 5, font: '600 11px CanvasSans, system-ui', color: t.text.caption }}>
                  <span>Grosor · {(grosor ?? efect.width).toFixed(1)}</span>
                  <Deslizador t={t} onGestoInicio={p.onGestoInicio} onGestoFin={p.onGestoFin} data-grosor etiqueta="grosor" min={0} max={12} step={0.5} value={grosor ?? efect.width}
                    onChange={e => setTrazo({ width: Number(e.target.value) })} />
                </label>
                <label style={{ display: 'grid', gap: 5, font: '600 11px CanvasSans, system-ui', color: t.text.caption }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <I.IconCorner size={13} /> Esquinas · {Math.round(radio ?? efectRadio)}
                  </span>
                  <Deslizador t={t} onGestoInicio={p.onGestoInicio} onGestoFin={p.onGestoFin} data-radio etiqueta="esquinas" min={0} max={64} step={1} value={radio ?? efectRadio}
                    onChange={e => setTrazo({ radius: Number(e.target.value) })} />
                </label>
                <label style={{ display: 'grid', gap: 5, font: '600 11px CanvasSans, system-ui', color: t.text.caption }}>
                  <span>Opacidad · {Math.round((comun(e => e.opacity) ?? 1) * 100)}%</span>
                  <Deslizador t={t} onGestoInicio={p.onGestoInicio} onGestoFin={p.onGestoFin} data-opacidad etiqueta="opacidad" min={0.05} max={1} step={0.05}
                    value={comun(e => e.opacity) ?? 1}
                    onChange={e => p.onChange({ opacity: Number(e.target.value) })} />
                </label>
                {rotulo('Color del contorno')}
                <Paleta t={t} muestras={PALETA} valor={contorno} onPick={c => setColor({ stroke: c })} redondo />
              </div>
            )
          })()}
        </div>

        {figuras.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button type="button" data-relleno title="Relleno" onClick={abrir('relleno')}
              data-activo={pop === 'relleno' ? '1' : '0'} style={btn(pop === 'relleno')}
              onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
              <I.IconFill size={18} color={relleno ?? resolveFill(t, figuras[0].role, figuras[0].color)} />
            </button>
            {pop === 'relleno' && (
              <div style={{ ...panelBase, left: -120, display: 'grid', gap: 9 }}>
                {rotulo('Relleno')}
                <Paleta t={t} muestras={RELLENOS} valor={relleno} onPick={c => setColor({ fill: c })} redondo />
                <div style={{ font: '500 10px CanvasSans, system-ui', color: t.text.caption,
                              lineHeight: 1.35, maxWidth: 200 }}>
                  Un color elegido a mano deja de seguir al tema. Vuelve a la
                  primera casilla para devolvérselo al rol.
                </div>
              </div>
            )}
          </div>
        )}
      </>}

      {/* ── SECCION: el tinte del territorio ──────────────────────────────── */}
      {secciones.length > 0 && <>
        {sep}
        <div style={{ position: 'relative' }}>
          <button type="button" data-tinte-abrir title="Tinte de la sección" onClick={abrir('tinte')}
            data-activo={pop === 'tinte' ? '1' : '0'} style={btn(pop === 'tinte')}
            onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
            <span style={{
              width: 15, height: 15, borderRadius: 5,
              background: t.tints[secciones[0].tint ?? 'neutro'].fill,
              border: `2px solid ${t.tints[secciones[0].tint ?? 'neutro'].stroke}`,
            }} />
            <I.IconChevronDown size={10} />
          </button>
          {pop === 'tinte' && (
            <div style={{ ...panelBase, left: -40, display: 'grid', gap: 9 }}>
              {rotulo('Tinte')}
              <div style={{ display: 'flex', gap: 5 }}>
                {TINTES.map(id => (
                  <button key={id} type="button" data-tinte={id} title={ETIQUETA_TINTE[id]}
                    onClick={() => p.onChange({ tint: id } as Partial<CanvasElement>, e => e.type === 'frame')}
                    style={{
                      width: 24, height: 24, borderRadius: 7, cursor: 'pointer', padding: 0,
                      background: t.tints[id].fill,
                      border: `2px solid ${(secciones[0].tint ?? 'neutro') === id ? t.accent : t.tints[id].stroke}`,
                    }} />
                ))}
              </div>
              <button type="button" data-recortar
                onClick={() => p.onChange({ clip: !secciones[0].clip } as Partial<CanvasElement>, e => e.type === 'frame')}
                style={{ ...btn(secciones[0].clip), justifyContent: 'flex-start', height: 30, padding: '0 8px' }}>
                <I.IconCrop size={15} /> Recortar lo que sobresale
              </button>
            </div>
          )}
        </div>
      </>}

      {/* ── TINTA ─────────────────────────────────────────────────────────── */}
      {els.every(e => e.type === 'ink') && <>
        {sep}
        {TINTAS.map((c, i) => (
          <button key={c ?? 'tema'} type="button" data-tinta={c ?? 'tema'}
            onClick={() => p.onChange({ color: c } as Partial<CanvasElement>, e => e.type === 'ink')}
            title={c ?? 'Tinta del tema (sigue al claro/oscuro)'}
            style={{
              width: 24, height: 24, borderRadius: 7, cursor: 'pointer', padding: 0, marginRight: 2,
              background: c ?? t.ink.lapiz,
              border: comun(e => (e as { color?: string }).color) === c
                ? `2.5px solid ${t.accent}` : `1px solid ${t.roles.card.stroke.color}`,
              boxShadow: i === 0 ? `inset 0 0 0 2px ${t.canvas}` : undefined,
            }} />
        ))}
        {sep}
        {[3, 6, 12].map(s => (
          <button key={s} type="button" onClick={() => p.onChange({ size: s } as Partial<CanvasElement>, e => e.type === 'ink')}
            title={`Grosor ${s}`} style={btn(comun(e => (e as { size?: number }).size) === s)}>
            <span style={{ width: 16, height: Math.max(2, s / 1.6), borderRadius: 99,
                           background: comun(e => (e as { size?: number }).size) === s ? t.accent : t.text.body }} />
          </button>
        ))}
      </>}

      {/* ── CONECTOR ──────────────────────────────────────────────────────── */}
      {uno?.type === 'connector' && (() => {
        const c = uno
        const ruta = c.routing ?? 'ortogonal'
        const clase = c.kind ?? 'flujo'
        const fin = c.headEnd ?? (c.arrowEnd ? 'flecha' : 'ninguna')
        const ini = c.headStart ?? 'ninguna'
        const RutaIcono = RUTAS.find(r => r.id === ruta)!.icon
        const menu = (id: string, icono: React.ReactNode, titulo: string,
          opciones: Array<{ id: string; label: string; icono: React.ReactNode; activo: boolean; onPick: () => void }>) => (
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={abrir(id)} title={titulo} aria-label={titulo}
              data-activo={pop === id ? '1' : '0'} style={{ ...btn(pop === id), minWidth: 38 }}
              onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
              {icono}<I.IconChevronDown size={10} />
            </button>
            {pop === id && (
              <div style={{ ...panelBase, left: 0, minWidth: 180, display: 'grid', gap: 4 }}>
                {rotulo(titulo)}
                {opciones.map(o => (
                  <button key={o.id} type="button" onClick={() => { o.onPick(); setPop(null) }}
                    style={{ ...btn(o.activo), justifyContent: 'flex-start', width: '100%', height: 30, padding: '0 8px' }}>
                    {o.icono}{o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
        return <>
          {sep}
          {menu('ruta', <RutaIcono size={17} />, 'Ruta', RUTAS.map(r => ({
            id: r.id, label: r.label, activo: ruta === r.id, icono: <r.icon size={18} />,
            onPick: () => p.onChange({ routing: r.id, waypoints: undefined } as Partial<CanvasElement>, e => e.type === 'connector') })))}
          {menu('clase', <I.IconClase size={17} clase={clase} />, 'Clase de relación', CLASES.map(k => ({
            id: k.id, label: k.label, activo: clase === k.id, icono: <I.IconClase size={18} clase={k.id} />,
            onPick: () => p.onChange({ kind: k.id } as Partial<CanvasElement>, e => e.type === 'connector') })))}
          {menu('ini', <span style={{ display: 'grid', transform: 'scaleX(-1)' }}><I.IconPunta size={17} tipo={ini} /></span>,
            'Punta de inicio', PUNTAS.map(x => ({
              id: x.id, label: x.label, activo: ini === x.id,
              icono: <span style={{ display: 'grid', transform: 'scaleX(-1)' }}><I.IconPunta size={18} tipo={x.id} /></span>,
              onPick: () => p.onChange({ headStart: x.id } as Partial<CanvasElement>, e => e.type === 'connector') })))}
          {menu('fin', <I.IconPunta size={17} tipo={fin} />, 'Punta de fin', PUNTAS.map(x => ({
            id: x.id, label: x.label, activo: fin === x.id, icono: <I.IconPunta size={18} tipo={x.id} />,
            onPick: () => p.onChange({ headEnd: x.id, arrowEnd: x.id !== 'ninguna' } as Partial<CanvasElement>, e => e.type === 'connector') })))}
          {p.onAnclaje && (() => {
            const fijo = !!(c.fromPort || c.toPort)
            return (
              <button type="button" data-anclaje title={fijo
                  ? 'Anclaje fijo: la flecha se queda en los lados por donde la conectaste. Clic para soltarla.'
                  : 'Anclaje libre: el lado se recalcula al mover. Clic para fijarlo donde está ahora.'}
                onClick={() => p.onAnclaje?.(!fijo)}
                data-activo={fijo ? '1' : '0'} style={btn(fijo)}
                onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
                <I.IconPin size={15} />
              </button>
            )
          })()}
          <input data-etiqueta value={c.label ?? ''} placeholder="etiqueta…"
            onChange={e => p.onChange({ label: e.target.value } as Partial<CanvasElement>, x => x.type === 'connector')}
            style={{
              width: 100, height: 28, padding: '0 8px', borderRadius: 7, outline: 'none',
              border: `1px solid ${t.roles.card.stroke.color}`, background: t.canvas,
              color: t.text.body, font: '600 12px CanvasSans, system-ui',
            }} />
        </>
      })()}

      {/* ── ENLACE · CANDADO · IA · MAS ───────────────────────────────────── */}
      {sep}
      <div style={{ position: 'relative' }}>
        <button type="button" data-enlace title={enlace ? `Enlace: ${enlace}` : 'Insertar enlace'}
          onClick={abrir('enlace')} data-activo={pop === 'enlace' || enlace ? '1' : '0'}
          style={btn(pop === 'enlace' || !!enlace)}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <I.IconLink size={16} />
        </button>
        {pop === 'enlace' && (
          <div style={{ ...panelBase, left: -110, display: 'grid', gap: 8, width: 268 }}>
            {rotulo('Enlace')}
            <input data-enlace-url autoFocus defaultValue={enlace ?? ''} placeholder="https://…"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  p.onChange({ link: v || undefined })
                  setPop(null)
                }
                if (e.key === 'Escape') setPop(null)
              }}
              style={{
                height: 32, padding: '0 10px', borderRadius: 8, outline: 'none',
                border: `1px solid ${t.roles.card.stroke.color}`, background: t.canvas,
                color: t.text.body, font: '500 12px CanvasSans, system-ui',
              }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" data-enlace-guardar
                onClick={() => {
                  const inp = raiz.current?.querySelector<HTMLInputElement>('[data-enlace-url]')
                  p.onChange({ link: inp?.value.trim() || undefined })
                  setPop(null)
                }}
                style={{ ...btn(true), flex: 1, height: 30, background: t.accent, color: '#fff' }}>
                Guardar
              </button>
              {enlace && (
                <button type="button" data-enlace-quitar
                  onClick={() => { p.onChange({ link: undefined }); setPop(null) }}
                  style={{ ...btn(), height: 30, color: t.roles.risk.stroke.color }}>Quitar</button>
              )}
            </div>
            <div style={{ font: '500 10px CanvasSans, system-ui', color: t.text.caption, lineHeight: 1.35 }}>
              Aparece una marca en la esquina del elemento. ⌘ + clic lo abre.
            </div>
          </div>
        )}
      </div>

      {(p.hayGrupo || els.length > 1) && (
        <button type="button" data-agrupar={p.hayGrupo ? 'desagrupar' : 'agrupar'}
          title={p.hayGrupo ? 'Desagrupar (⌘⇧G)' : 'Agrupar (⌘G)'}
          onClick={() => (p.hayGrupo ? p.onDesagrupar : p.onAgrupar)?.()}
          style={{ ...btn(), padding: '0 8px' }}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <I.IconGroup size={16} />{p.hayGrupo ? 'Desagrupar' : 'Agrupar'}
        </button>
      )}

      <button type="button" data-candado title={bloqueado ? 'Desbloquear (⌘⇧L)' : 'Bloquear (⌘⇧L)'}
        onClick={() => p.onChange({ locked: !bloqueado })}
        data-activo={bloqueado ? '1' : '0'} style={btn(bloqueado)}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
        {bloqueado ? <I.IconLock size={16} /> : <I.IconUnlock size={16} />}
      </button>

      {p.onAcomodar && (
        <button type="button" data-acomodar
          title={`Acomodar: colocar estas figuras siguiendo sus flechas${
            p.acomodarBloqueados ? ` · ${p.acomodarBloqueados} bloqueada${p.acomodarBloqueados > 1 ? 's' : ''} no se mover${p.acomodarBloqueados > 1 ? 'án' : 'á'}` : ''}`}
          onClick={p.onAcomodar}
          onPointerEnter={e => { e.currentTarget.style.filter = 'brightness(1.12)' }}
          onPointerLeave={e => { e.currentTarget.style.filter = 'none' }}
          style={{ ...btn(), background: t.accent, color: '#fff', minWidth: 32, marginLeft: 2 }}>
          <I.IconSparkle size={16} />
        </button>
      )}

      <div style={{ position: 'relative' }}>
        <button type="button" data-mas title="Más" onClick={abrir('mas')}
          data-activo={pop === 'mas' ? '1' : '0'} style={btn(pop === 'mas')}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <I.IconDots size={17} />
        </button>
        {pop === 'mas' && (
          <div style={{ ...panelBase, right: 0, left: 'auto', display: 'grid', gap: 2, minWidth: 190 }}>
            {([
              ['Traer al frente', <I.IconBringFront size={16} key="f" />, p.onFront, 'frente'],
              ['Enviar al fondo', <I.IconSendBack size={16} key="b" />, p.onBack, 'fondo'],
              ['Duplicar  ⌘D', <I.IconDuplicate size={16} key="d" />, p.onDuplicate, 'duplicar'],
            ] as const).map(([label, icono, fn, key]) => (
              <button key={key} type="button" data-mas-accion={key}
                onClick={() => { fn(); setPop(null) }}
                style={{ ...btn(), justifyContent: 'flex-start', width: '100%', height: 30, padding: '0 8px' }}>
                {icono}{label}
              </button>
            ))}
            <div style={{ height: 1, background: t.roles.card.stroke.color, opacity: .7, margin: '3px 0' }} />
            <button type="button" data-borrar onClick={() => { p.onDelete(); setPop(null) }}
              style={{ ...btn(), justifyContent: 'flex-start', width: '100%', height: 30, padding: '0 8px',
                       color: t.roles.risk.stroke.color }}>
              <I.IconTrash size={16} />Eliminar  Supr
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
