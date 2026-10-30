'use client'
/**
 * EL VISOR DEL NERVIO (14 oct 2026): lo que un nodo conectado abre DENTRO del lienzo.
 *
 * Un video o audio del Studio (servido con Range desde /api/canvas/nervio/medio/flujo), un video público, una página
 * propia en vista previa (ejemplo.mx/aplicar) o el último evento de su fuente de estado. Se acopla al borde derecho del
 * lienzo y un nervio (una curva viva) lo une con el nodo que lo abrió, siguiendo a la cámara en cada cuadro.
 *
 * Regla de casa (CLAUDE.md, regla 7): el video nace PAUSADO y SILENCIADO. Nada suena hasta que Daniel lo pide.
 * La latencia se mide y se enseña: del clic al primer cuadro (`data-primer-cuadro-ms`).
 *
 * v2 (14 oct, Daniel: «el botón de abrir fuera e ir no funcionan. debería ser uno solo que lo abra en el navegador»):
 * un solo botón. Si la liga es de fuera, «Abrir en el navegador ↗» por el opener de Tauri (`@/lib/navegador`); si es de
 * Arbrain, su etiqueta de siempre y abre dentro de la app. La vista previa es un teléfono (o un escritorio de 1280 px)
 * escalado para caber entero, y el panel nunca se sale del viewport (model/visor-disposicion.ts).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Camera, CanvasElement } from '../model/element'
import type { Theme } from '../theme/tokens'
import { worldToScreen, type Viewport } from '../render/viewport'
import { COLOR_SEMAFORO, duracionTexto, haceTexto, type AccionNervio, type EstadoVivo, type MedioResuelto, type Nervio } from '../model/nervio'
import { AIRE, BISEL, TELEFONO, disposicionVisor, encajarEscritorio, encajarTelefono, type ModoPrevia } from '../model/visor-disposicion'

export { anchoVisor } from '../model/visor-disposicion'
export interface VisorAbierto { id: string; accion: AccionNervio; t0: number }

const CLAVE_MODO = 'arbrain:nervio-previa-modo'
const leerModo = (): ModoPrevia => { try { return localStorage.getItem(CLAVE_MODO) === 'escritorio' ? 'escritorio' : 'telefono' } catch { return 'telefono' } }

export function NervioVisor({ el, nervio, accion, t0, medio, estado, camera, viewport, theme, onCerrar, abrir }: {
  el: CanvasElement; nervio: Nervio | null; accion: AccionNervio; t0: number
  medio?: MedioResuelto; estado?: EstadoVivo
  camera: Camera; viewport: Viewport; theme: Theme
  onCerrar: () => void
  /** El ÚNICO botón: la liga del nodo. `fuera` = navegador del sistema; si no, abre dentro de Arbrain con su etiqueta. */
  abrir?: { fuera: boolean; etiqueta: string; ir: () => void }
}) {
  const oscuro = theme.name === 'oscuro'
  const [modo, setModo] = useState<ModoPrevia>('telefono')
  useEffect(() => { setModo(leerModo()) }, [])
  const elegirModo = (m: ModoPrevia) => { setModo(m); try { localStorage.setItem(CLAVE_MODO, m) } catch {} }
  const disp = disposicionVisor(viewport, accion, modo)
  const hoja = disp.forma === 'hoja'
  const w = disp.width
  const left = disp.left
  const cajaRef = useRef<HTMLDivElement>(null)
  const cuerpoRef = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState(260)
  const [cuerpo, setCuerpo] = useState<{ width: number; height: number } | null>(null)
  const top = disp.top ?? Math.max(8, viewport.height - 8 - alto)
  const [primerCuadro, setPrimerCuadro] = useState<number | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => { setPrimerCuadro(null); setFallo(null) }, [el.id, accion, medio?.url])
  useLayoutEffect(() => {
    const n = cajaRef.current, c = cuerpoRef.current
    if (n) setAlto(n.offsetHeight)
    if (c) setCuerpo({ width: c.clientWidth, height: c.clientHeight })
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (n) setAlto(n.offsetHeight)
      if (c) setCuerpo(prev => (prev && prev.width === c.clientWidth && prev.height === c.clientHeight ? prev : { width: c.clientWidth, height: c.clientHeight }))
    })
    if (n) ro.observe(n)
    if (c) ro.observe(c)
    return () => ro.disconnect()
  }, [accion, el.id])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onCerrar])

  const fg = oscuro ? 'rgba(255,255,255,0.92)' : '#27123E'
  const tenue = oscuro ? 'rgba(255,255,255,0.56)' : 'rgba(39,18,62,0.56)'
  const borde = oscuro ? 'rgba(255,255,255,0.12)' : 'rgba(39,18,62,0.12)'
  const acento = oscuro ? '#C9A2FF' : theme.accent

  // El nervio: del borde del nodo más cercano al visor hasta el costado del visor.
  // Si el nodo quedó a la altura del visor (debajo o a su derecha), el nervio sale por arriba del nodo y entra por abajo.
  // En hoja (abajo, a todo el ancho) sale por abajo del nodo y entra por el borde de arriba de la hoja.
  const derecho = worldToScreen({ x: el.x + el.width, y: el.y + el.height / 2 }, camera, viewport)
  let d: string, a: { x: number; y: number }
  if (hoja) {
    a = worldToScreen({ x: el.x + el.width / 2, y: el.y + el.height }, camera, viewport)
    const b = { x: Math.min(left + w - 24, Math.max(left + 24, a.x)), y: top }
    const dy = Math.max(30, (b.y - a.y) * 0.5)
    d = `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`
  } else if (derecho.x < left - 40) {
    a = derecho
    const b = { x: left, y: top + Math.min(alto, 220) / 2 }
    const dx = Math.max(40, (b.x - a.x) * 0.5)
    d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  } else {
    a = worldToScreen({ x: el.x + el.width / 2, y: el.y }, camera, viewport)
    const b = { x: Math.min(left + w - 24, Math.max(left + 24, a.x)), y: top + alto }
    const dy = Math.max(30, (a.y - b.y) * 0.5)
    d = `M ${a.x} ${a.y} C ${a.x} ${a.y - dy}, ${b.x} ${b.y + dy}, ${b.x} ${b.y}`
  }

  const titulo = nervio?.rotulo ?? nervio?.medio?.titulo ?? ('name' in el && typeof (el as { name?: unknown }).name === 'string' ? (el as { name: string }).name : 'Nodo')
  const marcar = () => {
    const ms = Math.round(performance.now() - t0)
    setPrimerCuadro(ms)
    ;(window as unknown as { __nervioPrimerCuadro?: number }).__nervioPrimerCuadro = ms
  }

  const medida = [
    medio?.origen?.startsWith('medio:') ? medio.origen.slice(6) : medio?.origen?.startsWith('env:') ? medio.origen.slice(4) : null,
    duracionTexto(medio?.duracion),
    medio?.ancho && medio.alto ? `${medio.ancho}×${medio.alto}` : null,
    medio?.bytes ? `${(medio.bytes / 1e6).toFixed(0)} MB` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <style>{`
        @keyframes nervio-entra { from { opacity: 0; transform: translateX(10px) scale(.985) } to { opacity: 1; transform: none } }
        @keyframes nervio-sube { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes nervio-pulso { to { stroke-dashoffset: -28 } }
        @keyframes nervio-traza { from { stroke-dashoffset: 1200 } to { stroke-dashoffset: 0 } }
      `}</style>
      <svg data-nervio-linea={el.id} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 30 }}>
        <path d={d} fill="none" stroke={acento} strokeOpacity={0.22} strokeWidth={6} strokeLinecap="round" />
        <path d={d} fill="none" stroke={acento} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="1200"
          style={{ animation: 'nervio-traza 380ms cubic-bezier(.2,.8,.2,1) both' }} />
        <path d={d} fill="none" stroke={acento} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="2 12" strokeOpacity={0.9}
          style={{ animation: 'nervio-pulso 900ms linear infinite' }} />
        <circle cx={a.x} cy={a.y} r={4.5} fill={acento} />
        <circle cx={a.x} cy={a.y} r={9} fill="none" stroke={acento} strokeOpacity={0.3} strokeWidth={1.5} />
      </svg>
      <div ref={cajaRef} data-nervio-visor={el.id} data-accion={accion}
        data-primer-cuadro-ms={primerCuadro ?? ''}
        onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
        data-forma={disp.forma} data-modo={accion === 'previa' ? modo : undefined}
        style={{
          position: 'absolute', left, width: w, zIndex: 31, boxSizing: 'border-box',
          ...(disp.top == null ? { bottom: 8 } : { top: disp.top }),
          ...(disp.height != null ? { height: disp.height } : {}),
          maxHeight: disp.maxHeight, display: 'flex', flexDirection: 'column',
          background: oscuro ? 'rgba(20,18,30,0.97)' : 'rgba(255,255,255,0.985)',
          border: `1px solid ${borde}`, borderRadius: 14, overflow: 'hidden', color: fg,
          boxShadow: oscuro ? '0 18px 50px rgba(0,0,0,0.55)' : '0 18px 50px rgba(39,18,62,0.16), 0 2px 6px rgba(39,18,62,0.06)',
          font: '500 13px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
          animation: `${hoja ? 'nervio-sube' : 'nervio-entra'} 170ms cubic-bezier(.2,.8,.2,1) both`,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px', borderBottom: `1px solid ${borde}`, flex: 'none' }}>
          {estado && <span title={estado.texto} style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: COLOR_SEMAFORO[estado.semaforo], boxShadow: `0 0 0 3px ${COLOR_SEMAFORO[estado.semaforo]}33` }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</div>
            {estado && <div style={{ color: tenue, fontSize: 12 }}>{estado.texto}</div>}
          </div>
          {abrir && accion !== 'enlace' && (
            <button type="button" data-nervio-abrir={abrir.fuera ? 'navegador' : 'arbrain'} onClick={abrir.ir}
              title={abrir.fuera ? `Abrir ${el.link ?? ''} en tu navegador` : undefined} style={boton(borde, fg)}>
              {abrir.fuera ? (w < 400 ? 'Navegador ↗' : 'Abrir en el navegador ↗') : abrir.etiqueta}
            </button>
          )}
          <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ ...boton(borde, fg), width: 28, padding: 0 }}>×</button>
        </div>

        <div ref={cuerpoRef} data-nervio-cuerpo style={accion === 'previa'
          ? { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: oscuro ? 'rgba(255,255,255,0.035)' : 'rgba(39,18,62,0.045)' }
          : { flex: '0 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {accion === 'medio' && (
          !medio ? <div style={{ padding: 16, color: tenue }}>Buscando el medio…</div>
          : !medio.ok ? <div style={{ padding: 16, color: COLOR_SEMAFORO.rojo }}>Sin medio: {medio.error}</div>
          : medio.tipo === 'embed'
            ? <iframe key={medio.url} src={medio.url} title={titulo} onLoad={marcar} allow="fullscreen; picture-in-picture"
                style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', border: 'none', background: '#000' }} />
            : medio.clase === 'audio'
              ? <audio key={medio.url} src={medio.url} controls muted preload="auto" onLoadedData={marcar} style={{ display: 'block', width: '100%', padding: 12, boxSizing: 'border-box' }} />
              : <video key={medio.url} src={medio.url} controls muted playsInline preload="auto"
                  onLoadedData={marcar} onError={() => setFallo('El reproductor no pudo leer el archivo.')}
                  style={{ display: 'block', width: '100%', maxHeight: Math.max(160, disp.maxHeight - 90), objectFit: 'contain', aspectRatio: medio.ancho && medio.alto ? `${medio.ancho} / ${medio.alto}` : '16 / 9', background: '#000' }} />
        )}
        {accion === 'previa' && el.link && cuerpo && cuerpo.height > 0 && (
          <Previa key={el.link} url={el.link} titulo={titulo} modo={modo} cuerpo={cuerpo} oscuro={oscuro} onLoad={marcar} />
        )}
        {accion === 'estado' && (
          <div style={{ padding: '12px 14px', display: 'grid', gap: 6 }}>
            <div style={{ color: tenue, fontSize: 12 }}>Último evento</div>
            <div style={{ font: '500 12.5px ui-monospace, "JetBrains Mono", monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{estado?.detalle ?? 'sin dato'}</div>
          </div>
        )}
        </div>

        {(medida || primerCuadro != null || fallo || (estado && accion !== 'estado') || accion === 'previa') && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 14px', minHeight: 34, boxSizing: 'border-box', borderTop: `1px solid ${borde}`, color: tenue, fontSize: 11.5, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
            {accion === 'previa' && (
              <div role="radiogroup" aria-label="Vista previa como" style={{ display: 'inline-flex', flex: 'none', padding: 2, gap: 2, borderRadius: 8, border: `1px solid ${borde}` }}>
                {(['telefono', 'escritorio'] as const).map(m => (
                  <button key={m} type="button" role="radio" aria-checked={modo === m} data-nervio-modo={m} onClick={() => elegirModo(m)}
                    style={{ height: 22, padding: '0 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      font: '600 11.5px Inter, ui-sans-serif, system-ui, sans-serif',
                      background: modo === m ? (oscuro ? 'rgba(201,162,255,0.18)' : 'rgba(124,58,237,0.10)') : 'transparent',
                      color: modo === m ? acento : tenue }}>
                    {m === 'telefono' ? 'Teléfono' : 'Escritorio'}
                  </button>
                ))}
              </div>
            )}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fallo ?? (medida || (estado?.detalle ?? ''))}
            </span>
            {estado && w >= 420 && <span title={estado.medidoEn} style={{ flex: 'none' }}>{haceTexto(Date.parse(estado.medidoEn), Date.now())?.replace('hace segundos', 'medido ahora') ?? ''}</span>}
            {primerCuadro != null && <span style={{ color: acento, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap' }}>{accion === 'medio' ? 'primer cuadro' : 'cargó'} en {primerCuadro} ms</span>}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * La página en un dispositivo escalado: el iframe se dibuja a su tamaño real (390×844 o 1280 de ancho) y `transform:
 * scale` lo encoge para caber entero. Así la página responde como en ese dispositivo, sin scroll horizontal; el
 * vertical sigue dentro del iframe.
 */
function Previa({ url, titulo, modo, cuerpo, oscuro, onLoad }: {
  url: string; titulo: string; modo: ModoPrevia; cuerpo: { width: number; height: number }; oscuro: boolean; onLoad: () => void
}) {
  const filo = oscuro ? 'rgba(255,255,255,0.16)' : 'rgba(39,18,62,0.16)'
  if (modo === 'telefono') {
    const t = encajarTelefono(cuerpo)
    const radio = Math.round(44 * t.escala)
    return (
      <div data-nervio-telefono={t.escala.toFixed(3)} style={{
        position: 'absolute', left: Math.max(AIRE, (cuerpo.width - t.marcoAncho) / 2), top: Math.max(AIRE, (cuerpo.height - t.marcoAlto) / 2),
        width: t.marcoAncho, height: t.marcoAlto, boxSizing: 'border-box', padding: BISEL, borderRadius: radio + BISEL,
        background: oscuro ? '#0d0b14' : '#17121f', boxShadow: `0 0 0 1px ${filo}, 0 14px 34px rgba(20,10,40,${oscuro ? 0.5 : 0.18})`,
      }}>
        <div style={{ width: TELEFONO.ancho * t.escala, height: TELEFONO.alto * t.escala, borderRadius: radio, overflow: 'hidden', position: 'relative', background: '#fff' }}>
          <iframe src={url} title={titulo} onLoad={onLoad}
            style={{ position: 'absolute', left: 0, top: 0, width: TELEFONO.ancho, height: TELEFONO.alto, border: 'none', background: '#fff',
              transform: `scale(${t.escala})`, transformOrigin: '0 0' }} />
        </div>
      </div>
    )
  }
  const e = encajarEscritorio(cuerpo)
  return (
    <div data-nervio-escritorio={e.escala.toFixed(3)} style={{
      position: 'absolute', left: Math.max(AIRE, (cuerpo.width - e.ventanaAncho) / 2), top: AIRE,
      width: e.ventanaAncho, height: e.ventanaAlto, overflow: 'hidden', borderRadius: 8, background: '#fff',
      boxShadow: `0 0 0 1px ${filo}, 0 10px 28px rgba(20,10,40,${oscuro ? 0.45 : 0.14})`,
    }}>
      <iframe src={url} title={titulo} onLoad={onLoad}
        style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: e.iframeAlto, border: 'none', background: '#fff',
          transform: `scale(${e.escala})`, transformOrigin: '0 0' }} />
    </div>
  )
}

const boton = (borde: string, fg: string): React.CSSProperties => ({
  height: 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${borde}`, background: 'transparent', color: fg,
  font: '600 12px Inter, ui-sans-serif, system-ui, sans-serif', cursor: 'pointer', flex: 'none',
})
