'use client'

/**
 * Canvas v4 — barra de estado, abajo a la derecha.
 *
 * Zoom, vista del lienzo, tema, deshacer/rehacer y el estado del guardado.
 * Abajo a la derecha porque es donde no estorba: arriba compite con el
 * contenido y a la izquierda choca con el rail.
 *
 * El estado del guardado vive AQUI y no flotando sobre el lienzo. Daniel ya
 * habia pedido eso mismo en el v3 ("estorbaba en tablet") — es un requisito
 * ganado con feedback, no una preferencia.
 */

import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../theme/tokens'
import type { BackgroundKind } from '../render/background'
import type { AutosaveStatus } from '../state/autosave'
import * as I from './icons'
import { useZoomVivo, type CamaraViva } from './CamaraViva'
import { bordeInferior } from './Capitulos'

interface Props {
  theme: Theme
  zoom: number
  /** El porcentaje sigue al gesto sin que la Pizarra se vuelva a pintar (ver CamaraViva.tsx). */
  camara?: CamaraViva
  background: BackgroundKind
  save: AutosaveStatus
  canUndo: boolean
  canRedo: boolean
  onZoom: (factor: number) => void
  onFit: () => void
  onZoomTo: (z: number) => void
  onBackground: (k: BackgroundKind) => void
  /** Sin él no hay botón de tema: la pizarra sigue el tema de la app (sección Lienzo, 3 oct 2026). */
  onTheme?: () => void
  onUndo: () => void
  onRedo: () => void
  onExport: (soloSeleccion: boolean) => void
  onAtajos: () => void
  haySeleccion: boolean
  /** Teléfono o panel estrecho: sin separadores, guardado como punto y botones más chicos, para no desbordar. */
  angosto?: boolean
}

const VISTAS: Array<{ kind: BackgroundKind; label: string; icon: (p: { size?: number }) => React.ReactElement }> = [
  { kind: 'liso', label: 'Liso', icon: I.IconGridNone },
  { kind: 'puntos', label: 'Puntos', icon: I.IconGridDots },
  { kind: 'cuadricula', label: 'Cuadrícula', icon: I.IconGridLines },
]

const NIVELES = [0.1, 0.25, 0.5, 1, 2, 4]

export function StatusBar(p: Props) {
  const [menuExport, setMenuExport] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuExport) return
    const fuera = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setMenuExport(false)
    }
    window.addEventListener('pointerdown', fuera)
    return () => window.removeEventListener('pointerdown', fuera)
  }, [menuExport])

  const { theme: t } = p
  const [vistaAbierta, setVistaAbierta] = useState(false)
  const [zoomAbierto, setZoomAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!vistaAbierta && !zoomAbierto) return
    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) { setVistaAbierta(false); setZoomAbierto(false) }
    }
    window.addEventListener('pointerdown', fuera)
    return () => window.removeEventListener('pointerdown', fuera)
  }, [vistaAbierta, zoomAbierto])

  const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: p.angosto ? 30 : 32, height: p.angosto ? 30 : 32, borderRadius: 8, border: 'none', cursor: 'pointer',
    display: 'grid', placeItems: 'center', background: 'transparent',
    color: t.text.body, transition: 'background 120ms ease', ...extra,
  })

  const hover = (on: boolean) => (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.background = on ? t.roles.sticky.fill : 'transparent'
  }

  const sep = p.angosto ? null : <div style={{ width: 1, height: 20, background: t.roles.card.stroke.color, opacity: .7, margin: '0 3px' }} />

  const VistaIcon = VISTAS.find(v => v.kind === p.background)?.icon ?? I.IconGridNone

  return (
    <div ref={ref} style={{
      position: 'absolute', right: p.angosto ? 8 : 14, bottom: bordeInferior(!!p.angosto),
      // Nada cortado: si aun asi no cabe, envuelve en otra fila (los menus cuelgan de sus botones, no se recortan).
      maxWidth: p.angosto ? 'calc(100% - 16px)' : 'calc(100% - 28px)', flexWrap: 'wrap', justifyContent: 'flex-end',
      display: 'flex', alignItems: 'center', gap: 2, padding: 5,
      background: t.roles.card.fill,
      border: `1px solid ${t.roles.card.stroke.color}`,
      borderRadius: 12,
      boxShadow: t.name === 'oscuro'
        ? '0 8px 28px rgba(0,0,0,.55)' : '0 8px 28px rgba(15,15,25,.10)',
      font: '600 12px CanvasSans, system-ui', color: t.text.body, zIndex: 20,
    }}>
      {/* Estado del guardado: texto plano, sin icono que llame la atencion.
          Solo se pone rojo cuando algo falla de verdad. */}
      <span
        title={p.save.kind === 'error' || p.save.kind === 'sincronizando' ? p.save.mensaje
               : p.save.kind === 'bloqueado' ? p.save.motivo : undefined}
        style={{
          padding: p.angosto ? '0 6px' : '0 10px', color: p.save.kind === 'error' ? theme_error(t) : t.text.caption,
          whiteSpace: 'nowrap',
          cursor: p.save.kind === 'error' || p.save.kind === 'bloqueado' || p.save.kind === 'sincronizando' ? 'help' : 'default',
        }}>
        {p.angosto ? <span aria-label={textoGuardado(p.save)} style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 4,
            background: p.save.kind === 'error' ? theme_error(t) : p.save.kind === 'limpio' ? '#16a34a' : '#d97706' }} />
         : textoGuardado(p.save)}
      </span>
      {sep}

      <button title="Deshacer (⌘Z)" onClick={p.onUndo} disabled={!p.canUndo}
        style={btn({ opacity: p.canUndo ? 1 : .35, cursor: p.canUndo ? 'pointer' : 'default' })}
        onPointerEnter={e => p.canUndo && hover(true)(e)} onPointerLeave={hover(false)}>
        <I.IconUndo size={18} />
      </button>
      <button title="Rehacer (⇧⌘Z)" onClick={p.onRedo} disabled={!p.canRedo}
        style={btn({ opacity: p.canRedo ? 1 : .35, cursor: p.canRedo ? 'pointer' : 'default' })}
        onPointerEnter={e => p.canRedo && hover(true)(e)} onPointerLeave={hover(false)}>
        <I.IconRedo size={18} />
      </button>
      {sep}

      {/* VISTA del lienzo: liso, puntos, cuadricula */}
      <div style={{ position: 'relative' }}>
        <button title="Vista del lienzo" data-vista onClick={() => { setVistaAbierta(v => !v); setZoomAbierto(false) }}
          style={btn()} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <VistaIcon size={18} />
        </button>
        {vistaAbierta && (
          <div style={menu(t)}>
            {VISTAS.map(v => {
              const Icon = v.icon
              const act = v.kind === p.background
              return (
                <button key={v.kind} data-vista-opt={v.kind}
                  onClick={() => { p.onBackground(v.kind); setVistaAbierta(false) }}
                  style={fila(t, act)}
                  onPointerEnter={e => { if (!act) e.currentTarget.style.background = t.roles.sticky.fill }}
                  onPointerLeave={e => { if (!act) e.currentTarget.style.background = 'transparent' }}>
                  <Icon size={16} /> <span>{v.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {sep}

      <button title="Alejar" onClick={() => p.onZoom(1 / 1.2)} style={btn()}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}><I.IconMinus size={16} /></button>

      <div style={{ position: 'relative' }}>
        <button title="Nivel de zoom" data-zoom onClick={() => { setZoomAbierto(z => !z); setVistaAbierta(false) }}
          style={{ ...btn({ width: p.angosto ? 46 : 56 }), font: 'inherit' }}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <PorcentajeZoom camara={p.camara} zoom={p.zoom} />
        </button>
        {zoomAbierto && (
          <div style={menu(t)}>
            {NIVELES.map(z => (
              <button key={z} onClick={() => { p.onZoomTo(z); setZoomAbierto(false) }}
                style={fila(t, Math.abs(p.zoom - z) < 0.005)}
                onPointerEnter={e => { e.currentTarget.style.background = t.roles.sticky.fill }}
                onPointerLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                {Math.round(z * 100)}%
              </button>
            ))}
          </div>
        )}
      </div>

      <button title="Acercar" onClick={() => p.onZoom(1.2)} style={btn()}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}><I.IconPlus size={16} /></button>
      <button title="Encuadrar (⇧1)" data-fit onClick={p.onFit} style={btn()}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}><I.IconFit size={17} /></button>
      {sep}

      {/*
        EXPORTAR, con menu.

        El dueño: *"hay un boton que dice sel, intuyo que descarga pero no me gusta
        como funciona"*. Y con razon: "sel" era una abreviatura que solo entiende
        quien escribio el codigo, aparecia y desaparecia segun hubiera seleccion,
        y descargaba de golpe sin decir que iba a descargar. Ahora hay UN boton
        estable que abre un menu con las dos opciones escritas en palabras, y la
        de seleccion se deshabilita —no se esconde— cuando no hay nada elegido:
        una opcion que aparece y desaparece nunca se aprende.
      */}
      <div style={{ position: 'relative' }} ref={exportRef}>
        <button title="Exportar" data-export onClick={() => setMenuExport(v => !v)}
          style={{ ...btn(), background: menuExport ? theme_suave(t) : 'transparent' }}
          onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
          <I.IconDownload size={17} />
        </button>
        {menuExport && (
          <div style={{
            position: 'absolute', bottom: 42, right: 0, minWidth: 210, padding: 5,
            borderRadius: 11, zIndex: 60,
            background: t.roles.card.fill, border: `1px solid ${t.roles.card.stroke.color}`,
            boxShadow: t.name === 'oscuro' ? '0 14px 40px rgba(0,0,0,.6)' : '0 14px 40px rgba(15,15,25,.16)',
          }}>
            {([
              { id: 'todo', label: 'Exportar el lienzo', icon: I.IconImage, off: false, sel: false },
              { id: 'sel', label: 'Exportar la selección', icon: I.IconFit, off: !p.haySeleccion, sel: true },
            ] as const).map(o => (
              <button key={o.id} data-export-opcion={o.id} disabled={o.off}
                onClick={() => { p.onExport(o.sel); setMenuExport(false) }}
                onPointerEnter={e => { if (!o.off) e.currentTarget.style.background = theme_suave(t) }}
                onPointerLeave={e => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 9px', borderRadius: 7, border: 'none', textAlign: 'left',
                  cursor: o.off ? 'default' : 'pointer', background: 'transparent',
                  color: o.off ? t.text.caption : t.text.body, opacity: o.off ? 0.45 : 1,
                  font: '600 12.5px CanvasSans, system-ui',
                }}>
                <o.icon size={15} />
                <span style={{ flex: 1 }}>{o.label}</span>
                <span style={{ font: '500 11px CanvasSans', color: t.text.caption }}>PNG</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {sep}

      {/* La hoja de atajos necesita una PUERTA visible. Un atajo que solo se
          abre con su propio atajo es un chiste: quien no lo sabe, no lo
          descubre. */}
      <button title="Atajos (?)" data-atajos-abrir onClick={p.onAtajos} style={btn()}
        onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
        <span style={{ font: '800 13px CanvasSans, system-ui' }}>?</span>
      </button>

      {p.onTheme && <button title={t.name === 'claro' ? 'Tema oscuro' : 'Tema claro'} data-theme-toggle onClick={p.onTheme}
        style={btn()} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
        {t.name === 'claro' ? <I.IconMoon size={17} /> : <I.IconSun size={17} />}
      </button>}
    </div>
  )
}

const textoGuardado = (save: AutosaveStatus) =>
  save.kind === 'limpio' ? (save.version ? `guardado v${save.version}` : 'al día')
  : save.kind === 'guardando' ? 'guardando…'
  : save.kind === 'sucio' ? 'sin guardar'
  // 'bloqueado' NO es rojo: el sistema esta haciendo lo correcto.
  : save.kind === 'bloqueado' ? 'sin convertir'
  // Choque con otro escritor que se reintenta solo: tampoco es rojo.
  : save.kind === 'sincronizando' ? 'sincronizando…'
  : 'error al guardar'

const theme_error = (t: Theme) => t.roles.risk.stroke.color
const theme_suave = (t: Theme) => t.name === 'oscuro' ? 'rgba(255,255,255,.07)' : 'rgba(15,15,25,.055)'

const menu = (t: Theme): React.CSSProperties => ({
  position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
  display: 'flex', flexDirection: 'column', gap: 2, padding: 5, minWidth: 132,
  background: t.roles.card.fill,
  border: `1px solid ${t.roles.card.stroke.color}`,
  borderRadius: 10,
  boxShadow: t.name === 'oscuro' ? '0 10px 30px rgba(0,0,0,.6)' : '0 10px 30px rgba(15,15,25,.14)',
  zIndex: 40,
})

const fila = (t: Theme, activo: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
  borderRadius: 7, border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
  background: activo ? t.accent : 'transparent',
  color: activo ? '#fff' : t.text.body,
})

function PorcentajeZoom({ camara, zoom }: { camara?: CamaraViva; zoom: number }) {
  return <>{Math.round(useZoomVivo(camara, zoom) * 100)}%</>
}
