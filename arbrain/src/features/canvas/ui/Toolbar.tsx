'use client'

/**
 * Canvas v4 — el rail de herramientas.
 *
 * Rail vertical flotante, agrupado por funcion, con flyouts para las variantes.
 * Es la forma que convergieron Figma, Miro y tldraw, y no por moda: un rail
 * vertical deja el ancho completo para el lienzo (que es donde se trabaja) y
 * los grupos hacen que la mano encuentre la herramienta sin leer.
 *
 * REGLA: el boton del grupo MUESTRA la ultima variante usada. Si elegiste el
 * marcador, el grupo queda con el icono del marcador — volver a el es un clic,
 * no dos. Un rail que siempre muestra el primero de cada grupo obliga a abrir
 * el flyout cada vez para la herramienta que mas usas.
 */

import { useEffect, useRef, useState } from 'react'
import type { Tool } from '../input/pointers'
import type { Theme } from '../theme/tokens'
import * as I from './icons'

type IconFn = (p: { size?: number }) => React.ReactElement

interface Item { tool: Tool; label: string; key: string; icon: IconFn }

/** Los grupos del rail. El orden es el de la mano, no el del código. */
const GRUPOS: Array<{ id: string; items: Item[] }> = [
  { id: 'puntero', items: [
    { tool: 'select', label: 'Seleccionar', key: 'V', icon: I.IconCursor },
    { tool: 'pan', label: 'Mano', key: 'H', icon: I.IconHand },
  ]},
  // NOTA y TEXTO viven en primer nivel, cada una con su boton.
  //
  // Estaban metidas en un grupo "contenido" con la seccion, asi que el icono de
  // TEXTO no se veia nunca — Daniel: *"falta el icono que me permite añadir
  // texto"*. Un grupo tiene sentido para ocho formas que comparten gesto; no
  // para tres herramientas que no se parecen en nada y se usan a diario.
  { id: 'nota', items: [{ tool: 'sticky', label: 'Nota', key: 'N', icon: I.IconSticky }] },
  { id: 'texto', items: [{ tool: 'text', label: 'Texto', key: 'T', icon: I.IconText }] },
  { id: 'formas', items: [
    { tool: 'rect', label: 'Rectángulo', key: 'R', icon: I.IconSquare },
    { tool: 'ellipse', label: 'Círculo', key: 'O', icon: I.IconCircle },
    { tool: 'triangle', label: 'Triángulo', key: '', icon: I.IconTriangle },
    { tool: 'diamond', label: 'Rombo', key: '', icon: I.IconDiamond },
    { tool: 'star', label: 'Estrella', key: '', icon: I.IconStar },
    { tool: 'pill', label: 'Píldora', key: '', icon: I.IconPill },
    { tool: 'hexagon', label: 'Hexágono', key: '', icon: I.IconHexagon },
    { tool: 'arrow', label: 'Flecha', key: '', icon: I.IconArrowShape },
  ]},
  { id: 'conector', items: [
    { tool: 'connector', label: 'Conector', key: 'C', icon: I.IconConnector },
  ]},
  { id: 'seccion', items: [
    { tool: 'section', label: 'Sección', key: 'S', icon: I.IconSection },
  ]},
  { id: 'tinta', items: [
    { tool: 'pen', label: 'Lápiz', key: 'P', icon: I.IconPen },
    { tool: 'highlighter', label: 'Marcador', key: 'M', icon: I.IconMarker },
    { tool: 'eraser', label: 'Goma', key: 'E', icon: I.IconEraser },
  ]},
  { id: 'insertar', items: [
    { tool: 'table', label: 'Tabla', key: '', icon: I.IconTable },
    { tool: 'image', label: 'Imagen', key: '', icon: I.IconImage },
    { tool: 'embed', label: 'Embed', key: '', icon: I.IconEmbed },
    { tool: 'code', label: 'Código', key: '', icon: I.IconCode },
  ]},
]

export const TOOL_SHORTCUTS: Record<string, Tool> = Object.fromEntries(
  GRUPOS.flatMap(g => g.items.filter(i => i.key).map(i => [i.key.toLowerCase(), i.tool])),
)

interface Props {
  tool: Tool
  theme: Theme
  onPick: (t: Tool) => void
  /** Ajustes del lapiz. `color` ausente = la tinta del tema. */
  tinta: { color?: string; size: number }
  onTinta: (t: { color?: string; size: number }) => void
}

/**
 * La paleta del lapiz.
 *
 * DOCE, no cincuenta y cinco. El canvas viejo ofrecia una cuadricula de 55
 * swatches y eso es una decision que nadie quiere tomar mientras dibuja: el
 * estandar de Daniel es paleta de RESTRICCION, y una fila que se abarca de un
 * vistazo se elige mas rapido que una que hay que escanear.
 *
 * `undefined` es la primera y es el DEFAULT: la tinta del tema, la unica que
 * sobrevive un cambio de claro a oscuro.
 */
const TINTAS_LAPIZ: Array<string | undefined> = [
  undefined, '#8C27F1', '#dc2626', '#ea580c', '#d97706', '#16a34a',
  '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#78716c', '#ffffff',
]

/** Grosores. En px de MUNDO, como los guarda el trazo. */
const GROSORES = [2, 4, 7, 12, 20]

export function Toolbar({ tool, theme, onPick, tinta, onTinta }: Props) {
  // La ultima variante usada de cada grupo, para que el boton la recuerde.
  const [ultima, setUltima] = useState<Record<string, Tool>>({})
  const [abierto, setAbierto] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setAbierto(null)
    }
    // `pointerdown`, no `mousedown`: bajo touch-action:none WebKit suprime el
    // mousedown de compatibilidad y en iPad el flyout no se cerraria nunca.
    window.addEventListener('pointerdown', fuera)
    return () => window.removeEventListener('pointerdown', fuera)
  }, [abierto])

  const elegir = (grupoId: string, t: Tool) => {
    setUltima(u => ({ ...u, [grupoId]: t }))
    setAbierto(null)
    onPick(t)
  }

  return (
    <div ref={railRef} style={{
      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: 4, padding: 5,
      background: theme.roles.card.fill,
      border: `1px solid ${theme.roles.card.stroke.color}`,
      borderRadius: 14,
      boxShadow: theme.name === 'oscuro'
        ? '0 8px 28px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.04) inset'
        : '0 8px 28px rgba(15,15,25,.10), 0 1px 0 rgba(255,255,255,.9) inset',
      zIndex: 20,
    }}>
      {GRUPOS.map((g, gi) => {
        const activoEnGrupo = g.items.find(i => i.tool === tool)
        const mostrado = activoEnGrupo
          ?? g.items.find(i => i.tool === ultima[g.id])
          ?? g.items[0]
        const Icon = mostrado.icon
        const activo = !!activoEnGrupo
        const tieneVariantes = g.items.length > 1

        return (
          <div key={g.id} style={{ position: 'relative' }}>
            {gi > 0 && (
              <div style={{
                height: 1, margin: '4px 6px',
                background: theme.roles.card.stroke.color, opacity: 0.65,
              }} />
            )}
            <button
              aria-label={mostrado.label}
              data-tool={mostrado.tool}
              onPointerEnter={() => setSobre(g.id)}
              onPointerLeave={() => setSobre(null)}
              onClick={() => {
                // Si ya estas en esta herramienta, el clic ABRE sus variantes.
                // Es la convencion de Figma, y aqui hace falta de verdad: al
                // quitar el triangulo de la esquina, el punto de 3px es la unica
                // pista de que hay mas, y una pista no puede ser la unica puerta.
                if (activo && tieneVariantes) setAbierto(a => a === g.id ? null : g.id)
                else elegir(g.id, mostrado.tool)
              }}
              onContextMenu={e => { e.preventDefault(); if (tieneVariantes) setAbierto(a => a === g.id ? null : g.id) }}
              style={{
                position: 'relative', width: 40, height: 40, borderRadius: 10,
                display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none',
                background: activo ? theme.accent : sobre === g.id ? theme.roles.sticky.fill : 'transparent',
                color: activo ? '#fff' : theme.text.body,
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <Icon size={21} />
              {tieneVariantes && (
                // UN PUNTO, no un triangulo.
                //
                // Daniel: *"no me gusta que los iconos principales tengan como un
                // triangulo en la esquina inferior derecha, los hace lucir poco
                // profesionales"*. Tenia razon: la escuadra en la esquina es un
                // gesto de barra de herramientas de los 2000. El punto dice lo
                // mismo —"aqui hay mas"— y desaparece en el conjunto en vez de
                // ensuciar cada icono.
                //
                // El blanco de clic sigue midiendo 16x16 aunque el punto mida 3:
                // hacer clicable solo lo pintado es un blanco que la ley de Fitts
                // vuelve incomodo con raton e imposible con el dedo. La señal es
                // el punto; el area es la puerta.
                <span
                  data-tool-flyout={g.id}
                  onPointerDown={e => { e.stopPropagation(); setAbierto(a => a === g.id ? null : g.id) }}
                  style={{
                    position: 'absolute', right: 0, bottom: 0,
                    width: 16, height: 16, cursor: 'pointer',
                    display: 'grid', placeItems: 'center',
                    paddingRight: 4, paddingBottom: 4, boxSizing: 'border-box',
                  }}>
                  <span style={{
                    width: 3, height: 3, borderRadius: 99, pointerEvents: 'none',
                    background: activo ? 'rgba(255,255,255,.9)' : theme.text.caption,
                    opacity: activo ? 1 : 0.55,
                  }} />
                </span>
              )}
            </button>

            {/*
              TOOLTIP PROPIO. El `title` nativo tarda ~1.5s en aparecer, sale con
              la tipografia del sistema y no se puede posicionar — en una barra
              de herramientas eso significa que nadie lo ve nunca. Este sale al
              instante, del lado del lienzo, con la tecla escrita.
            */}
            {sobre === g.id && abierto !== g.id && (
              <div style={{
                position: 'absolute', left: 50, top: '50%', transform: 'translateY(-50%)',
                padding: '5px 9px', borderRadius: 7, whiteSpace: 'nowrap', pointerEvents: 'none',
                background: theme.name === 'oscuro' ? '#e9eaf2' : '#1a1b23',
                color: theme.name === 'oscuro' ? '#15161d' : '#f4f4f8',
                font: '600 11.5px CanvasSans, system-ui', zIndex: 40,
                display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: '0 4px 14px rgba(0,0,0,.28)',
              }}>
                {mostrado.label}
                {mostrado.key && (
                  <span style={{
                    padding: '1px 5px', borderRadius: 4, font: '700 10px CanvasSans, system-ui',
                    background: theme.name === 'oscuro' ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.16)',
                  }}>{mostrado.key}</span>
                )}
                {tieneVariantes && (
                  <span style={{ opacity: .6, font: '500 10.5px CanvasSans' }}>· {g.items.length} variantes</span>
                )}
              </div>
            )}

            {abierto === g.id && (
              <div style={{
                position: 'absolute', left: 48, top: 0,
                display: 'grid', gridTemplateColumns: g.items.length > 4 ? '1fr 1fr' : '1fr',
                gap: 3, padding: 5,
                background: theme.roles.card.fill,
                border: `1px solid ${theme.roles.card.stroke.color}`,
                borderRadius: 12,
                boxShadow: theme.name === 'oscuro'
                  ? '0 10px 30px rgba(0,0,0,.6)' : '0 10px 30px rgba(15,15,25,.14)',
                zIndex: 30,
              }}>
                {g.items.map(item => {
                  const ItemIcon = item.icon
                  const act = item.tool === tool
                  return (
                    <button key={item.tool} title={`${item.label}${item.key ? ` (${item.key})` : ''}`}
                      data-tool-variant={item.tool}
                      onClick={() => elegir(g.id, item.tool)}
                      style={{
                        width: 38, height: 38, borderRadius: 9, border: 'none', cursor: 'pointer',
                        display: 'grid', placeItems: 'center',
                        background: act ? theme.accent : 'transparent',
                        color: act ? '#fff' : theme.text.body,
                      }}
                      onPointerEnter={e => { if (!act) e.currentTarget.style.background = theme.roles.sticky.fill }}
                      onPointerLeave={e => { if (!act) e.currentTarget.style.background = 'transparent' }}
                    >
                      <ItemIcon size={20} />
                    </button>
                  )
                })}
                {/* AJUSTES DEL LAPIZ dentro de su propio flyout: se eligen
                    ANTES de dibujar, que es cuando importan. Tenerlos solo en el
                    inspector obliga a trazar primero y corregir despues. */}
                {g.id === 'tinta' && (
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8, paddingTop: 7, marginTop: 3,
                                borderTop: `1px solid ${theme.roles.card.stroke.color}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 20px)', gap: 4 }}>
                      {TINTAS_LAPIZ.map((c, i) => (
                        <button key={c ?? 'tema'} data-tinta-lapiz={c ?? 'tema'}
                          title={c ?? 'Tinta del tema (sigue al claro/oscuro)'}
                          onClick={() => onTinta({ ...tinta, color: c })}
                          style={{
                            width: 20, height: 20, borderRadius: 6, cursor: 'pointer', padding: 0,
                            background: c ?? theme.ink.lapiz,
                            border: tinta.color === c ? `2px solid ${theme.accent}` : `1px solid ${theme.roles.card.stroke.color}`,
                            boxShadow: i === 0 ? `inset 0 0 0 2px ${theme.roles.card.fill}` : undefined,
                          }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {GROSORES.map(w => (
                        <button key={w} data-grosor={w} title={`${w} px`}
                          onClick={() => onTinta({ ...tinta, size: w })}
                          style={{
                            flex: 1, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer',
                            display: 'grid', placeItems: 'center', padding: 0,
                            background: tinta.size === w ? theme.accent : 'transparent',
                          }}>
                          <span style={{
                            width: 16, height: Math.max(2, Math.round(w * 0.7)), borderRadius: 99,
                            background: tinta.size === w ? '#fff' : (tinta.color ?? theme.ink.lapiz),
                          }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
