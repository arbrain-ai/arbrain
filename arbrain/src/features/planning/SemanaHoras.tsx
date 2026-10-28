'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { estiloEvento } from '@/lib/calendar/contraste'
import { CHIP_MIN, COLUMNA_COMPACTA, columnasDeBarra, DIAS_VISTA, TRAMO, altoHora, columnaCercana, columnaEntera, columnasDe, escalaVisual, diaEnHoras, diasAuto, diasDelRiel, diasVisibles, esArrastre, estirar, habil, hhmm, inicioDeVentana, instante, lineasDeTitulo, lugarEnColumna, repartir, lineasNecesarias, medianoche, minutoDelDia, primerDiaVisible, rangoCrear, ranura, reencuadrar, soltar, sumarDia, type Bloque, type DiasVista, type Pieza } from './semana-horas'
import { diasAlSoltarRiel, ejeDeRueda, ejeDeToque, FRENO_RUEDA, velocidad } from './carril-logica'
import { encuadreDe } from './encuadre'
import { useEncuadre } from './useEncuadre'
import { DRIP } from './drip'
import { SECCION } from './secciones'
import { fantasmasAntesDe, hhmm as hhmmP, type SemanaPerfecta } from './semana-perfecta'
import { franjasDelDia, rango, resumenCampo } from './campos-fondo'
import { instalacion } from '@/config'
import type { CampoFondo } from '@/config/tipos'
import h from './semana-horas.module.css'

/** Los campos de fondo de esta instalación (28 oct 2026): comida y trabajo profundo. */
const CAMPOS_FONDO = instalacion().camposFondo

/**
 * La rejilla de la Semana (9 oct 2026). Siete columnas del tramo de horas (TRAMO) con los bloques a la escala de
 * su duración, los solapes lado a lado, la ⭐ del día y lo de día completo en una franja arriba, y la línea de «ahora» en hoy.
 * Arrastrar mueve el bloque (o estira su borde de abajo); arrastrar en un hueco crea uno nuevo. Lo que no cabe
 * en el tramo se cuenta arriba o abajo de su columna. En el panel (~520 px) y en el teléfono se ven tres días que se
 * deslizan, con hoy primero. La misma pieza vive en la sección, en la pestaña del panel y en la vista del chat; quien la
 * monta decide cómo se escribe (la pluma del calendario con su autoguardado).
 *
 * Oficio de calendario (10 oct 2026, Daniel: «que quede solucionado lo antes posible»): con `onVentana` la Semana es una
 * ventana deslizante de 3 · 4 · 7 días sobre un riel con colchón a cada lado. El trackpad, Shift+rueda y el swipe la mueven
 * con el scroll nativo (inercia del sistema y ajuste al día por scroll-snap); al asentarse, el riel se recentra sin que se
 * note y avisa el primer día visible. Arrastrar en un hueco dibuja el bloque nuevo con su hora en vivo; Esc cancela todo
 * arrastre; cerca del borde de arriba o de abajo la página se desplaza sola; ⌥ + flechas mueven el bloque con el foco.
 *
 * Ronda 2 (10 oct 2026, Daniel tras probarlo): crear es SOLO arrastrar (un clic suelto no crea nada y no hay fantasma al pasar
 * el ratón; doble clic abre el editor en esa media hora). El gesto vertical gana: el riel decide el eje al empezar y, si fue
 * vertical, los días no se mueven hasta soltar; cambiar de día pide más recorrido (carril-logica.ts, `diasAlSoltarRiel`) y lo
 * asienta el riel mismo, sin scroll-snap. Con siete días en el teléfono la Semana es compacta: bloques mínimos y tocar abre el día.
 * Días a la vista, rango de horas, densidad, fines de semana y zona llegan del engrane (ajustes.ts) cuando lo monta el calendario.
 *
 * Ronda 3, el teléfono (10 oct 2026, Daniel: «dame un diseño incluso mejor que el de Google»): la cabecera (días y franja de día
 * completo) vive fuera del riel, pegada arriba al hacer scroll, y sigue al riel en horizontal (mismo `scrollLeft`). «Auto» elige los
 * días por el ancho y, al rotar, la ventana se reencuadra sin perder hoy. El título de cada bloque envuelve en las líneas que caben
 * (`lineasDeTitulo`), también en siete columnas. La franja de día completo nace plegada en una línea y se abre con un toque.
 */
export interface MarcaDia { id: string; titulo: string; color: string | null; abrir?: () => void }
/** Lo de varios días: UNA barra de `desde` a `hasta` (días civiles, inclusive), aunque se salga de lo visible. */
export interface BarraDia extends MarcaDia { desde: string; hasta: string }
export interface EstrellaDia { titulo: string; cumplido: boolean }

const ANGOSTO = 700
const MANTENER_MS = 320
/** El canal de horas en angosto (igual que `--canal` en el CSS): lo que queda es para los días. */
const CANAL_ANGOSTO = 38
/** Con `llenar`, la hora vive entre estos dos altos (px): legible en pantallas cortas, sin bloques gigantes en las altas. */
const HORA_MIN_LLENAR = 26, HORA_MAX_LLENAR = 72
const claveDias = (donde: string) => `arbrain:planning:semana-dias:${donde}`
/** 3 · 4 · 7 días a la vez en angosto, por superficie (el chat); null = los que quepan. */
function useDiasVista(donde: string): [DiasVista | null, (n: DiasVista) => void] {
  const [n, setN] = useState<DiasVista | null>(() => { try { const v = Number(localStorage.getItem(claveDias(donde))); return (DIAS_VISTA as readonly number[]).includes(v) ? v as DiasVista : null } catch { return null } })
  return [n, v => { setN(v); try { localStorage.setItem(claveDias(donde), String(v)) } catch { /* sin almacenamiento: vale para esta sesión */ } }]
}
const COLUMNA_DENSA = 96
/** Lo que un bloque le deja al chip de tareas en su borde derecho (px), y lo que ocupa el 📋 del brief en la tarjeta. */
const CHIP_RESERVA = 18, BRIEF_PX = 20
/** Por debajo de esto (px por bloque) el título manda: la hora de término se va y la hora entra solo si deja dos líneas de título. */
const BLOQUE_ESTRECHO = 140
/** Métrica del texto de un bloque, igual que en el CSS: alto de línea del título, de la línea de la hora y relleno vertical. */
const METRICA = { normal: { linea: 14, hora: 13, relleno: 7, letra: 11.5, lados: 20 }, denso: { linea: 13, hora: 12, relleno: 5, letra: 10.5, lados: 16 }, minimo: { linea: 12, hora: 0, relleno: 3, letra: 10, lados: 7 } } as const
/** Sin eventos de scroll durante este tiempo, el riel se da por asentado (respaldo de `scrollend`). */
const ASIENTO_MS = 140
/** Franja junto al borde de arriba o de abajo que desplaza la página mientras se arrastra, y su velocidad máxima por cuadro. */
const BORDE_AUTO = 48, VEL_AUTO = 16
const NUEVO: Bloque = { id: '\u0000nuevo', titulo: '', inicio: 0, fin: 0, color: null, movible: true }
/** El contenedor que desplaza la página en vertical (la sección, el panel o el documento). */
function scrollVertical(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if ((o === 'auto' || o === 'scroll' || o === 'overlay') && p.scrollHeight > p.clientHeight + 1) return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? null
}
const DIA_CORTO = new Intl.DateTimeFormat('es-MX', { weekday: 'short' })
const etiquetaCorta = (dia: string) => DIA_CORTO.format(new Date(dia + 'T12:00:00')).replace('.', '')
const DIA_LARGO = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
const etiquetaLarga = (dia: string) => DIA_LARGO.format(new Date(dia + 'T12:00:00'))
/** «30 min», «1 h», «1 h 45». */
const duracion = (min: number) => { const m = Math.round(min), hh = Math.floor(m / 60), mm = m % 60; return hh ? `${hh} h${mm ? ` ${mm}` : ''}` : `${mm} min` }
const ESTRELLA = <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" /></svg>

/** Un gesto en curso: mover el bloque entero, estirar su borde de abajo o dibujar uno nuevo en un hueco. */
interface Gesto {
  modo: 'mover' | 'estirar' | 'crear'
  bloque: Bloque
  diaOrigen: string
  /** Minutos entre el borde de arriba del bloque y el dedo (para que no salte al tomarlo). Al crear: el minuto donde empezó. */
  agarre: number
  x0: number; y0: number
  activo: boolean
  /** Con el dedo, el gesto espera a que se mantenga presionado; antes de eso, deslizar es scroll. */
  esDedo: boolean
  /** Dónde va: día y minuto de inicio (mover) o de término (estirar). */
  dia: string
  minuto: number
}

export function SemanaHoras({ dias: diasFijos, semana, inicio, onVentana, sinBarra, hoy, ahora, bloques, todoElDia, barras = [], estrellas, onMover, onEstirar, onCrear, onAbrir, onDia, tramo = TRAMO, donde = 'chat', barra, amplia, diasVista, finDeSemana = true, compacta, zona, todoElDiaAbierto, onTodoElDia, listo = true, llenar = false, perfecta = null, corteRutina = null, campos = CAMPOS_FONDO }: {
  /** Semana fija (la vista del chat). Sin `onVentana` se pintan estos días. */
  dias?: string[]
  /** Ventana deslizante: un día de la semana a la que se llega (Hoy, el Mes, la URL) y el primer día visible, si ya se sabe. */
  semana?: string
  inicio?: string | null
  /** El riel se asentó en otro día o cambió cuántos se ven: quien monta guarda el primer día visible y el título. */
  onVentana?: (inicio: string, n: number) => void
  /** Modo Enfoque: sin la fila de chips ni el selector de días, solo la rejilla. */
  sinBarra?: boolean
  hoy: string; ahora: number
  bloques: Bloque[]
  todoElDia: Map<string, MarcaDia[]>
  barras?: BarraDia[]
  estrellas?: Map<string, EstrellaDia | null>
  /** Soltar en otro hueco u otro día. Quien monta la rejilla escribe y avisa si el proveedor no confirma. */
  onMover?: (b: Bloque, inicio: Date, fin: Date) => void
  onEstirar?: (b: Bloque, fin: Date) => void
  onCrear?: (inicio: Date, fin: Date) => void
  onAbrir?: (b: Bloque) => void
  /** Modo Enfoque de la Semana (10 oct 2026): horas más altas con el espacio que deja el objetivo plegado. */
  amplia?: boolean
  onDia?: (dia: string) => void
  tramo?: { desde: number; hasta: number }
  /** Para recordar 3 · 4 · 7 por superficie (sección, panel, chat). */
  donde?: string
  /** Lo que va arriba de la rejilla, a la izquierda del selector de días (la leyenda). */
  barra?: ReactNode
  /** Días a la vista elegidos en el engrane (null = los que quepan). Sin esto (el chat), la rejilla trae su selector 3 · 4 · 7. */
  diasVista?: DiasVista | null
  /** Sin sábado ni domingo: el riel salta de viernes a lunes. */
  finDeSemana?: boolean
  /** Densidad compacta: horas más bajas. */
  compacta?: boolean
  /** La zona horaria en la esquina («GMT-6»). */
  zona?: string | null
  /** La franja de día completo abierta o plegada en una línea (el engrane la recuerda). Sin `onTodoElDia` (el chat), siempre abierta. */
  todoElDiaAbierto?: boolean
  onTodoElDia?: () => void
  /** Ya hay lectura: el encuadre de la hora espera a que lo de arriba (objetivo, chips) ocupe su lugar. */
  listo?: boolean
  /** Dos columnas (24 oct 2026): la rejilla toma el alto que le dan y la hora mide lo que alcance para que el tramo quepa sin scroll. */
  llenar?: boolean
  /** La Semana Perfecta (semana-perfecta.ts): sus bloques en fantasma, detrás de todo, sin tapar el arrastre. null = no se pinta. */
  perfecta?: SemanaPerfecta | null
  /** Campos de fondo (campos-fondo.ts): franjas detrás de todo, sin ser eventos. Por defecto, los de la instalación. */
  campos?: readonly CampoFondo[] | null
  /** Los fantasmas solo hasta aquí (epoch ms): la rutina a futuro no se pinta (26 oct 2026). null = todos. */
  corteRutina?: number | null
}) {
  const raiz = useRef<HTMLDivElement>(null), riel = useRef<HTMLDivElement>(null), cabecera = useRef<HTMLDivElement>(null)
  const columnas = useRef<(HTMLDivElement | null)[]>([])
  const [ancho, setAncho] = useState(0)
  const angosto = ancho > 0 && ancho < ANGOSTO
  const [elegidos, setElegidos] = useDiasVista(donde)
  const controlado = diasVista !== undefined
  const canalPx = angosto ? CANAL_ANGOSTO : 44
  // «Auto» (null): los que caben por ancho, en cualquier tamaño (3 en el teléfono vertical, 7 al girarlo, 4 o 5 en medio).
  const nDias: number = controlado ? diasVista ?? diasAuto(ancho - canalPx) : angosto ? elegidos ?? diasAuto(ancho - canalPx) : 7
  const porVista = columnasDe(nDias, finDeSemana)
  // Siete en una columna angosta: títulos de una línea y solo la hora de inicio; más angosta aún (7 en el teléfono), compacta.
  const anchoColumna = (ancho - canalPx) / porVista
  const denso = angosto && anchoColumna < COLUMNA_DENSA
  const minimo = angosto && anchoColumna < COLUMNA_COMPACTA
  const horas = tramo.hasta - tramo.desde
  // Llenar: el alto útil del riel se reparte entre las horas del tramo; nunca más bajo que una hora compacta ni más alto que Enfoque.
  const [altoRiel, setAltoRiel] = useState(0)
  useLayoutEffect(() => {
    const el = riel.current
    if (!llenar || !el) { setAltoRiel(0); return }
    const medir = () => setAltoRiel(el.clientHeight)
    medir()
    const o = new ResizeObserver(medir); o.observe(el)
    return () => o.disconnect()
  }, [llenar])
  const horaPx = llenar && altoRiel > 0 ? Math.min(HORA_MAX_LLENAR, Math.max(HORA_MIN_LLENAR, Math.floor((altoRiel - 10) / Math.max(1, tramo.hasta - tramo.desde))))
    : altoHora({ angosto, amplia, compacta })
  // La ventana deslizante: `objetivo` es el primer día que debe verse; `base`, el centro del riel que está pintado.
  const desliza = Boolean(onVentana)
  // Cambió cuántas columnas caben (rotar, redimensionar, el engrane): la ventana se reencuadra sin perder hoy (`reencuadrar`).
  const columnasPrevias = useRef<number | null>(null)
  const recuadro = desliza && inicio && ancho > 0 && columnasPrevias.current !== null && columnasPrevias.current !== porVista
    ? reencuadrar(inicio, columnasPrevias.current, porVista, hoy, finDeSemana) : null
  useLayoutEffect(() => { if (ancho > 0) columnasPrevias.current = porVista }, [ancho, porVista])
  const pedido = desliza ? recuadro ?? inicio ?? inicioDeVentana(semana ?? hoy, hoy, nDias, finDeSemana) : null
  const objetivo = pedido && !finDeSemana ? habil(pedido) : pedido
  const [baseFija, setBase] = useState<string | null>(null)
  const base = baseFija ?? objetivo
  const dias = useMemo(() => desliza && base ? diasDelRiel(base, porVista, undefined, finDeSemana) : diasFijos ?? [], [desliza, base, porVista, diasFijos, finDeSemana])
  columnas.current.length = dias.length
  // Semana de llamadas (19 oct 2026): ventanas de fondo, brief en su llamada y tareas sin duración como chips (`repartir`), una vez.
  const reparto = useMemo(() => repartir(bloques), [bloques])
  const porDia = useMemo(() => new Map(dias.map(d => [d, diaEnHoras(bloques, d, tramo, reparto)])), [dias, bloques, tramo, reparto])
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const gestoRef = useRef<Gesto | null>(null)
  const recienSoltado = useRef(0)
  /** El riel lo lleva un gesto (dedo o trackpad): nadie lo recentra hasta que se suelte. */
  const arrastre = useRef(false)

  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    // El ancho con decimales (10 oct 2026): `clientWidth` redondea y las columnas, que dividen el ancho entre los días a la vista,
    // dejaban asomar 0.2 px del día siguiente en la orilla. Con el ancho exacto, los días a la vista llenan el riel justo.
    const medir = (exacto?: number) => setAncho(exacto ?? el.clientWidth)
    medir()
    const o = new ResizeObserver(([e]) => medir(e?.contentBoxSize?.[0]?.inlineSize ?? e?.contentRect.width)); o.observe(el)
    return () => o.disconnect()
  }, [])
  // Semana fija (el chat) en teléfono y panel: abre en hoy (o en el lunes si hoy no cae en ella), sin animación.
  const primerFijo = desliza ? null : dias[0]
  useLayoutEffect(() => {
    const r = riel.current
    if (!r || !angosto || desliza) return
    const i = primerDiaVisible(dias, hoy), col = columnas.current[i]
    r.scrollLeft = col ? col.offsetLeft - (columnas.current[0]?.offsetLeft ?? 0) : 0
  }, [angosto, primerFijo, porVista]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al llegar a otra semana o cambiar de forma

  // La cabecera pegajosa vive fuera del riel (si no, `overflow-x` del riel le quita lo pegajoso): sigue su `scrollLeft` al píxel.
  const sincronizar = useCallback(() => { const r = riel.current, c = cabecera.current; if (r && c && c.scrollLeft !== r.scrollLeft) c.scrollLeft = r.scrollLeft }, [])
  useLayoutEffect(() => { sincronizar() })
  useEffect(() => {
    const r = riel.current
    if (!r) return
    r.addEventListener('scroll', sincronizar, { passive: true })
    return () => r.removeEventListener('scroll', sincronizar)
  }, [sincronizar])

  /** Distancia en px de la primera columna pintada a la columna i (fraccional: el ancho de un día no es entero). */
  // En px del riel (los de `scrollLeft`), no de pantalla: con el zoom de la interfaz (⌘+/−, CSS `zoom` en <html>) o el de la
  // ventana, getBoundingClientRect mide en pantalla y el riel se movía `zoom` veces de más: la rejilla quedaba días adelante
  // del título y con un día partido en la orilla (10 oct 2026, capturas de Daniel). Una sola escala para medir y mover.
  const escalaRiel = useCallback(() => { const r = riel.current; return r ? escalaVisual(r.getBoundingClientRect().width, r.offsetWidth) : 1 }, [])
  const bordeDe = useCallback((i: number) => {
    const c = columnas.current[i], c0 = columnas.current[0]
    return c && c0 ? (c.getBoundingClientRect().left - c0.getBoundingClientRect().left) / escalaRiel() : 0
  }, [escalaRiel])
  // La ventana deslizante avisa su primer día y cuántos se ven (al llegar, al cambiar 3 · 4 · 7, al asentarse el riel).
  const avisado = useRef('')
  const avisar = useRef(onVentana); avisar.current = onVentana
  useEffect(() => {
    if (!desliza || !ancho || !objetivo) return
    const k = `${objetivo}:${porVista}`
    if (avisado.current === k && inicio === objetivo) return
    avisado.current = k; avisar.current?.(objetivo, porVista)
  }, [desliza, ancho, objetivo, porVista, inicio])
  // Llevar el riel al objetivo: al recentrar o cambiar de forma, sin animación (no se nota: el contenido se movió lo mismo);
  // con las flechas, ← →, Hoy cercano, deslizando suave. Si el objetivo cae fuera del riel pintado, se repinta a su alrededor.
  const forma = useRef('')
  useLayoutEffect(() => {
    const r = riel.current
    if (!desliza || !r || !ancho || !objetivo || !base) return
    const i = dias.indexOf(objetivo)
    if (i < 0 || i + porVista > dias.length) { setBase(objetivo); return }
    const destino = bordeDe(i), clave = `${base}:${porVista}:${ancho}:${finDeSemana}`
    const salto = forma.current !== clave
    forma.current = clave
    if (Math.abs(r.scrollLeft - destino) < 1) return
    if (salto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) r.scrollLeft = destino
    else r.scrollTo({ left: destino, behavior: 'smooth' })
  }, [desliza, objetivo, base, porVista, ancho, dias, bordeDe, finDeSemana])
  // Asentarse: cuando el riel se detiene en un día (lo lleve el gesto, la rueda o el código), ese día es el nuevo centro del riel
  // y, si no era el objetivo, se avisa. Sin scroll-snap (10 oct 2026): si quedó entre dos días, el riel mismo va al más cercano.
  const vivos = useRef({ dias, base, objetivo, porVista }); vivos.current = { dias, base, objetivo, porVista }
  useEffect(() => {
    const r = riel.current
    if (!desliza || !r) return
    const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let t: ReturnType<typeof setTimeout> | undefined
    const asentar = () => {
      clearTimeout(t)
      if (arrastre.current) return
      if (gestoRef.current) { t = setTimeout(asentar, ASIENTO_MS); return }
      const v = vivos.current, bordes = v.dias.map((_, i) => bordeDe(i))
      const i = columnaCercana(bordes, r.scrollLeft), dia = v.dias[i]
      if (!dia) return
      if (Math.abs(bordes[i] - r.scrollLeft) > 2) { r.scrollTo({ left: bordes[i], behavior: reducido() ? 'auto' : 'smooth' }); t = setTimeout(asentar, ASIENTO_MS * 3); return }
      if (dia !== v.base) setBase(dia)
      if (dia !== v.objetivo) { avisado.current = `${dia}:${v.porVista}`; avisar.current?.(dia, v.porVista) }
    }
    const moviendo = () => { clearTimeout(t); t = setTimeout(asentar, ASIENTO_MS) }
    const columna = () => bordeDe(1) - bordeDe(0)
    /** Suelta el gesto: el riel va `n` días desde la columna donde empezó, deslizando suave. */
    const llevar = (desde: number, n: number) => {
      arrastre.current = false
      const bordes = vivos.current.dias.map((_, i) => bordeDe(i))
      const i = Math.max(0, Math.min(bordes.length - 1, columnaCercana(bordes, desde) + n))
      r.scrollTo({ left: bordes[i], behavior: reducido() ? 'auto' : 'smooth' })
      moviendo()
    }

    // Trackpad y rueda: el eje se decide al empezar el gesto y el vertical gana las diagonales. Horizontal: el riel sigue al gesto
    // con freno y, al soltar, se asienta por `diasAlSoltarRiel`. Vertical: la parte horizontal no mueve días; la página sí baja.
    let eje: 'x' | 'y' | null = null, ultimo = 0, s0 = 0, d = 0, acumulado = 0, ultimoPaso = 0, soltadoEn = -1e9
    let suelta: ReturnType<typeof setTimeout> | undefined
    const soltarRueda = () => { if (eje === 'x') { soltadoEn = performance.now(); llevar(s0, diasAlSoltarRiel(d, columna(), 0, vivos.current.porVista)) } eje = null }
    const rueda = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || gestoRef.current?.activo) return
      // Ratón con Shift+rueda: donde el sistema no lo convierte en scroll horizontal (llega solo deltaY), cada muesca es un día.
      if (e.shiftKey && e.deltaX === 0 && e.deltaY) {
        e.preventDefault()
        acumulado += e.deltaY * (e.deltaMode === 1 ? 16 : 1)
        const ahora = performance.now()
        if (Math.abs(acumulado) < 40 || ahora - ultimoPaso < 160) return
        const bordes = vivos.current.dias.map((_, i) => bordeDe(i))
        const i = Math.max(0, Math.min(bordes.length - 1, columnaCercana(bordes, r.scrollLeft) + Math.sign(acumulado)))
        acumulado = 0; ultimoPaso = ahora
        r.scrollTo({ left: bordes[i], behavior: reducido() ? 'auto' : 'smooth' })
        return
      }
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.clientWidth : 1
      const dx = e.deltaX * k, dy = e.deltaY * k, ahora = performance.now()
      if (eje === 'y' && ahora - ultimo > 160) eje = null
      ultimo = ahora
      if (!eje) {
        eje = ejeDeRueda(dx, dy)
        // Un gesto que se corta un instante (la inercia del trackpad a veces titubea) sigue siendo el mismo: no se parte en dos.
        if (eje === 'x') { if (ahora - soltadoEn > 350) { s0 = r.scrollLeft; d = 0 } arrastre.current = true; clearTimeout(t) }
      }
      if (eje === 'x') {
        e.preventDefault()
        d -= dx * FRENO_RUEDA
        r.scrollLeft = s0 - d
        sincronizar()
        clearTimeout(suelta); suelta = setTimeout(soltarRueda, 160)
      } else if (eje === 'y' && dx) {
        e.preventDefault()
        const v = scrollVertical(raiz.current)
        if (v) v.scrollTop += dy
      }
    }

    // El dedo: igual. Hasta decidir, nada se mueve; si es horizontal, el riel sigue al dedo 1:1 y la página queda quieta.
    let x0 = 0, y0 = 0, xAnt = 0, ejeT: 'x' | 'y' | null = null, t0 = 0, tocando = false, muestras: { t: number; d: number }[] = []
    const toque = (e: TouchEvent) => {
      tocando = e.touches.length === 1 && !gestoRef.current?.activo
      if (!tocando) return
      x0 = xAnt = e.touches[0].clientX; y0 = e.touches[0].clientY; ejeT = null; muestras = []
    }
    const arrastra = (e: TouchEvent) => {
      if (!tocando) return
      if (gestoRef.current?.activo) { tocando = false; if (ejeT === 'x') llevar(t0, 0); return }
      const x = e.touches[0].clientX, mx = (x - x0) / escalaRiel(), my = (e.touches[0].clientY - y0) / escalaRiel()
      if (!ejeT) { ejeT = ejeDeToque(mx, my); if (ejeT === 'x') { t0 = r.scrollLeft; arrastre.current = true; clearTimeout(t) } }
      if (ejeT !== 'x') return
      if (e.cancelable) e.preventDefault()
      r.scrollLeft = t0 - mx
      sincronizar()
      muestras.push({ t: performance.now(), d: (x - xAnt) / escalaRiel() }); xAnt = x
      if (muestras.length > 12) muestras.shift()
    }
    const suelto = () => {
      if (!tocando) return
      tocando = false
      if (ejeT === 'x') llevar(t0, diasAlSoltarRiel(-(r.scrollLeft - t0), columna(), velocidad(muestras, performance.now()), vivos.current.porVista))
    }
    r.addEventListener('scroll', moviendo, { passive: true }); r.addEventListener('scrollend', moviendo)
    // La cabecera pegajosa desliza los días igual que el riel: el gesto empieza en cualquiera de los dos.
    const superficies = [r, cabecera.current].filter((x): x is HTMLDivElement => Boolean(x))
    for (const el of superficies) {
      el.addEventListener('wheel', rueda, { passive: false })
      el.addEventListener('touchstart', toque, { passive: true }); el.addEventListener('touchmove', arrastra, { passive: false })
      el.addEventListener('touchend', suelto); el.addEventListener('touchcancel', suelto)
    }
    return () => {
      clearTimeout(t); clearTimeout(suelta); arrastre.current = false
      r.removeEventListener('scroll', moviendo); r.removeEventListener('scrollend', moviendo)
      for (const el of superficies) {
        el.removeEventListener('wheel', rueda)
        el.removeEventListener('touchstart', toque); el.removeEventListener('touchmove', arrastra); el.removeEventListener('touchend', suelto); el.removeEventListener('touchcancel', suelto)
      }
    }
  }, [desliza, bordeDe, escalaRiel, sincronizar])
  // Los encabezados entran con su escalón solo al llegar; los días que el riel pinta después ya no animan.
  const [asentada, setAsentada] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAsentada(true), 900); return () => clearTimeout(t) }, [])

  /** Día y minuto bajo el puntero. Fuera de las columnas, la más cercana. */
  const bajo = useCallback((x: number, y: number) => {
    const cols = columnas.current
    let i = cols.findIndex(c => { if (!c) return false; const r = c.getBoundingClientRect(); return x >= r.left && x < r.right })
    if (i < 0) { const r0 = cols[0]?.getBoundingClientRect(); i = r0 && x < r0.left ? 0 : dias.length - 1 }
    const r = cols[i]!.getBoundingClientRect()
    return { dia: dias[i], minuto: tramo.desde * 60 + (y - r.top) / r.height * horas * 60 }
  }, [dias, tramo.desde, horas])

  const terminar = useCallback((soltado: boolean) => {
    const g = gestoRef.current
    gestoRef.current = null; setGesto(null)
    if (!g?.activo) return
    recienSoltado.current = Date.now()
    if (!soltado) return
    if (g.modo === 'mover') { const r = soltar(g.bloque, g.dia, g.minuto, tramo); if (r) onMover?.(g.bloque, r.inicio, r.fin) }
    else if (g.modo === 'crear') { const r = rangoCrear(g.agarre, g.minuto, tramo); onCrear?.(instante(g.diaOrigen, r.desde), instante(g.diaOrigen, r.hasta)) }
    else { const fin = estirar(g.bloque, g.diaOrigen, g.minuto, tramo); if (fin) onEstirar?.(g.bloque, fin) }
  }, [onMover, onEstirar, onCrear, tramo])

  // Mientras hay gesto: el puntero se sigue en toda la ventana; con el dedo, el scroll queda quieto hasta soltar.
  useEffect(() => {
    if (!gesto) return
    let timer: ReturnType<typeof setTimeout> | undefined, cuadro = 0
    let ultimo: { x: number; y: number } | null = null
    const scroller = scrollVertical(raiz.current)
    const activar = () => { const g = gestoRef.current; if (g && !g.activo) { gestoRef.current = { ...g, activo: true }; setGesto(gestoRef.current); navigator.vibrate?.(8) } }
    if (gesto.esDedo && !gesto.activo) timer = setTimeout(activar, MANTENER_MS)
    const seguir = (x: number, y: number) => {
      const g = gestoRef.current
      if (!g) return
      const p = bajo(x, y)
      gestoRef.current = { ...g, activo: true, dia: g.modo === 'mover' ? p.dia : g.diaOrigen, minuto: g.modo === 'mover' ? p.minuto - g.agarre : p.minuto }
      setGesto(gestoRef.current)
    }
    const mover = (e: PointerEvent) => {
      const g = gestoRef.current
      if (!g) return
      const lejos = Math.hypot(e.clientX - g.x0, e.clientY - g.y0)
      if (!g.activo) {
        if (g.esDedo) { if (lejos > 8) { clearTimeout(timer); gestoRef.current = null; setGesto(null) } return }
        if (!esArrastre(e.clientX - g.x0, e.clientY - g.y0)) return
      }
      ultimo = { x: e.clientX, y: e.clientY }
      // Moviendo un bloque, acercarse al borde del riel desliza a los días de al lado (también a otra semana).
      const r = riel.current
      if (r && g.modo === 'mover' && (angosto || desliza)) { const rr = r.getBoundingClientRect(); if (e.clientX > rr.right - 28) r.scrollLeft += 10; else if (e.clientX < rr.left + 56) r.scrollLeft -= 10 }
      seguir(e.clientX, e.clientY)
    }
    // Cerca del borde de arriba o de abajo, la página se desplaza sola (más rápido cuanto más cerca) y el gesto la sigue.
    const auto = () => {
      cuadro = requestAnimationFrame(auto)
      if (!ultimo || !gestoRef.current?.activo || !scroller) return
      const doc = scroller === document.scrollingElement
      const caja = doc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
      const arriba = Math.max(caja.top, 0) + BORDE_AUTO, abajo = Math.min(caja.bottom, window.innerHeight) - BORDE_AUTO
      const v = ultimo.y < arriba ? -(arriba - ultimo.y) : ultimo.y > abajo ? ultimo.y - abajo : 0
      if (!v) return
      const antes = scroller.scrollTop
      scroller.scrollTop += Math.max(-VEL_AUTO, Math.min(VEL_AUTO, v / BORDE_AUTO * VEL_AUTO))
      if (scroller.scrollTop !== antes) seguir(ultimo.x, ultimo.y)
    }
    cuadro = requestAnimationFrame(auto)
    const arriba = () => { clearTimeout(timer); terminar(true) }
    const cancelar = () => { clearTimeout(timer); terminar(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && gestoRef.current) { e.preventDefault(); e.stopPropagation(); cancelar() } }
    const quieto = (e: TouchEvent) => { if (gestoRef.current?.activo) e.preventDefault() }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', arriba); window.addEventListener('pointercancel', cancelar)
    window.addEventListener('keydown', tecla, true); window.addEventListener('touchmove', quieto, { passive: false })
    return () => {
      clearTimeout(timer); cancelAnimationFrame(cuadro)
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', arriba); window.removeEventListener('pointercancel', cancelar)
      window.removeEventListener('keydown', tecla, true); window.removeEventListener('touchmove', quieto)
    }
  }, [gesto?.bloque.id, gesto?.modo, gesto?.esDedo, bajo, terminar, angosto, desliza]) // eslint-disable-line react-hooks/exhaustive-deps -- un gesto, una suscripción

  function tomar(e: ReactPointerEvent, p: Pieza, modo: Gesto['modo']) {
    if (minimo || e.button !== 0 || !p.bloque.movible || (modo === 'mover' ? !onMover : !onEstirar)) return
    e.stopPropagation()
    const pos = bajo(e.clientX, e.clientY)
    const inicioMin = p.bloque.inicio < medianoche(p.dia) ? 0 : minutoDelDia(p.bloque.inicio, p.dia)
    const g: Gesto = { modo, bloque: p.bloque, diaOrigen: p.dia, agarre: pos.minuto - inicioMin, x0: e.clientX, y0: e.clientY, activo: false, esDedo: e.pointerType === 'touch',
      dia: p.dia, minuto: modo === 'mover' ? inicioMin : minutoDelDia(p.bloque.fin, p.dia) }
    gestoRef.current = g; setGesto(g)
  }

  /** Clic sostenido en un hueco: empieza a dibujar un bloque nuevo (con el dedo, tras mantener presionado). Un clic suelto no crea. */
  function empezarCrear(e: ReactPointerEvent, dia: string) {
    if (!onCrear || minimo || e.button !== 0 || e.target !== e.currentTarget || gestoRef.current) return
    const p = bajo(e.clientX, e.clientY)
    const g: Gesto = { modo: 'crear', bloque: NUEVO, diaOrigen: dia, agarre: p.minuto, x0: e.clientX, y0: e.clientY, activo: false, esDedo: e.pointerType === 'touch', dia, minuto: p.minuto }
    gestoRef.current = g; setGesto(g)
  }
  /** Teclado: ⌥↑ ⌥↓ mueven el bloque con el foco 15 min; ⌥← ⌥→, un día. El foco lo sigue a su nuevo lugar. */
  function teclaBloque(e: ReactKeyboardEvent, p: Pieza) {
    if (!e.altKey || e.metaKey || e.ctrlKey || !p.bloque.movible || !onMover) return
    const dMin = e.key === 'ArrowUp' ? -15 : e.key === 'ArrowDown' ? 15 : 0, dDia = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dMin && !dDia) return
    e.preventDefault(); e.stopPropagation()
    const ini = p.bloque.inicio < medianoche(p.dia) ? tramo.desde * 60 : minutoDelDia(p.bloque.inicio, p.dia)
    const r = soltar(p.bloque, sumarDia(p.dia, dDia), ini + dMin, tramo)
    if (!r) return
    onMover(p.bloque, r.inicio, r.fin)
    const id = p.bloque.id
    requestAnimationFrame(() => requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>(`[data-planning-id="${CSS.escape(id)}"]`)?.focus()))
  }

  // La pieza fantasma: dónde caería el bloque si se suelta ahora (o el bloque nuevo que se está dibujando).
  const fantasma = useMemo(() => {
    if (!gesto?.activo) return null
    if (gesto.modo === 'crear') { const r = rangoCrear(gesto.agarre, gesto.minuto, tramo); return { dia: gesto.diaOrigen, desde: r.desde, hasta: r.hasta, igual: false, nuevo: true } }
    const b = gesto.bloque
    if (gesto.modo === 'mover') {
      const r = soltar(b, gesto.dia, gesto.minuto, tramo)
      const ini = r ? minutoDelDia(r.inicio.getTime(), gesto.dia) : minutoDelDia(b.inicio, gesto.dia)
      const dur = Math.max(15, (b.fin - b.inicio) / 60_000)
      return { dia: gesto.dia, desde: ini, hasta: Math.min(ini + dur, tramo.hasta * 60), igual: !r }
    }
    const fin = estirar(b, gesto.diaOrigen, gesto.minuto, tramo)
    const ini = Math.max(minutoDelDia(b.inicio, gesto.diaOrigen), tramo.desde * 60)
    return { dia: gesto.diaOrigen, desde: ini, hasta: fin ? minutoDelDia(fin.getTime(), gesto.diaOrigen) : minutoDelDia(b.fin, gesto.diaOrigen), igual: !fin }
  }, [gesto, tramo])

  /** Doble clic en un hueco: el editor en esa media hora (la convención de las apps de calendario), sin fantasma previo. */
  const crearEn = (e: ReactMouseEvent, dia: string) => {
    if (!onCrear || minimo || Date.now() - recienSoltado.current < 250 || e.target !== e.currentTarget) return
    const p = bajo(e.clientX, e.clientY), r = ranura(dia, p.minuto, tramo)
    onCrear(r.inicio, r.fin)
  }
  const ahoraMin = minutoDelDia(ahora, hoy)
  const y = (minuto: number) => `calc(${(minuto - tramo.desde * 60) / 60} * var(--hora))`
  // El encuadre vertical (22 oct 2026, useEncuadre.ts): al abrir, a medianoche o con «Hoy», si hoy se ve, el ahora a un tercio de lo
  // visible; si no, la primera hora con eventos de los días a la vista o las 5:30. Solo en el calendario: en el chat el scroll es del hilo.
  // Tapa arriba la cabecera pegajosa de días (y la barra, que es su `top`).
  const canal = useRef<HTMLDivElement>(null)
  useEncuadre({
    ancla: canal, origen: tramo.desde * 60, pxPorMinuto: horaPx / 60, clave: desliza ? hoy : null, listo: listo && ancho > 0,
    encuadre: () => {
      const vis = objetivo ? diasVisibles(objetivo, porVista, finDeSemana) : dias
      return encuadreDe(vis.includes(hoy) ? ahoraMin : null, vis.flatMap(d => porDia.get(d)?.piezas.map(p => p.desde) ?? []))
    },
    tapa: () => { const c = cabecera.current; return c ? (parseFloat(getComputedStyle(c).top) || 0) + c.offsetHeight : 0 },
  })
  const estilo = { '--hora': `${horaPx}px`, '--horas': horas, '--dias': dias.length, '--ancho': `${ancho}px`, '--col': `${columnaEntera(ancho, canalPx, porVista)}px`, '--por-vista': porVista } as CSSProperties
  const metrica = minimo ? METRICA.minimo : denso ? METRICA.denso : METRICA.normal
  // La franja de día completo: plegada (una línea por día) solo si quien monta la recuerda; el chat la ve siempre abierta.
  const plegada = Boolean(onTodoElDia) && !todoElDiaAbierto
  const conFranja = dias.some(d => (todoElDia.get(d)?.length ?? 0) > 0 || estrellas?.get(d))
  // Las barras de varios días, recortadas a lo visible: columna de inicio y de fin (1-based) y si siguen fuera.
  const tramos = barras.flatMap(b => { const c = columnasDeBarra(dias, b.desde, b.hasta); return c ? [{ ...b, ...c }] : [] })
  const etiquetaGrid = `Semana en horas, de las ${hhmm(tramo.desde * 60)} a las ${hhmm(tramo.hasta * 60)}`

  return <div ref={raiz} className={h.rejilla} style={estilo} data-angosto={angosto || undefined} data-desliza={desliza || undefined} data-asentada={asentada || undefined} data-denso={denso || undefined} data-minimo={minimo || undefined} data-compacta={compacta || undefined} data-amplia={amplia || undefined} data-llenar={llenar || undefined} data-arrastrando={gesto?.activo || undefined} data-creando={gesto?.activo && gesto.modo === 'crear' || undefined}>
    {!sinBarra && (barra || (angosto && !controlado)) && <div className={h.barra}>
      <div className={h.barraIzq}>{barra}</div>
      {angosto && !controlado && <div className={h.diasVista} role="radiogroup" aria-label="Días a la vista">
        {DIAS_VISTA.filter(n => n > 1).map(n => <button key={n} role="radio" aria-checked={nDias === n} onClick={() => setElegidos(n as DiasVista)} title={`${n} días a la vista`}>{n}</button>)}
      </div>}
    </div>}
    <div role="grid" aria-label={etiquetaGrid} className={h.tabla}>
      {/* La cabecera, pegada arriba al hacer scroll (10 oct 2026): días y franja de día completo. Sigue al riel en horizontal y también
          desliza los días (`data-carril`: PlanningCalendar no lo convierte en otro periodo). */}
      <div ref={cabecera} className={h.rielCab} data-carril={angosto || desliza || undefined} data-plegada={plegada || undefined}>
        <div className={h.lienzo} role="row">
          {/* Encabezado: día, número, hoy. Un toque abre ese Día. */}
          <div className={`${h.esquina} ${h.cab}`} aria-hidden>{zona && <span className={h.zona}>{zona}</span>}</div>
          {dias.map((d, i) => <button key={d} role="columnheader" className={h.cab} data-hoy={d === hoy || undefined} data-pasado={d < hoy || undefined}
            style={{ '--i': i } as CSSProperties} onClick={() => onDia?.(d)} aria-label={`Abrir el ${etiquetaLarga(d)}`}>
            <small>{minimo ? etiquetaCorta(d).slice(0, 2) : etiquetaCorta(d)}</small><b>{Number(d.slice(8))}</b>
          </button>)}

          {/* La franja: la ⭐ del día y lo de día completo. Plegada, una línea por día; un toque la abre (y la esquina la vuelve a plegar). */}
          <div className={`${h.esquina} ${h.franja}`}>
            {onTodoElDia && conFranja && <button className={h.plegar} onClick={onTodoElDia} aria-expanded={!plegada} aria-label={plegada ? 'Abrir lo de día completo' : 'Plegar lo de día completo'}
              title={plegada ? 'Ver todo lo de día completo' : 'Plegar a una línea'}><svg viewBox="0 0 12 12" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg></button>}
          </div>
          {dias.map(d => { const e = estrellas?.get(d) ?? null, marcas = todoElDia.get(d) ?? [], total = marcas.length + (e ? 1 : 0)
            const resumen = plegada && total > 1
            return <div key={d} className={h.franja} data-hoy={d === hoy || undefined} data-pasado={d < hoy || undefined} data-resumen={resumen || undefined}>
              {resumen ? <button className={h.franjaLinea} onClick={onTodoElDia} aria-label={`${total} de día completo el ${etiquetaLarga(d)}: abrir`}>
                  {e ? <span className={h.estrella} data-cumplido={e.cumplido || undefined}>{ESTRELLA}<span>{e.titulo}</span></span>
                    : <span className={`${h.marca} ev-color`} style={estiloEvento(marcas[0].color) as CSSProperties}><span>{marcas[0].titulo}</span></span>}
                  <b className={h.mas}>+{total - 1}</b>
                </button>
                : <>
                  {e && <span className={h.estrella} data-cumplido={e.cumplido || undefined} title={e.titulo}>{ESTRELLA}<span>{e.titulo}</span></span>}
                  {marcas.map(m => <button key={m.id} className={`${h.marca} ev-color`} style={estiloEvento(m.color) as CSSProperties} title={m.titulo} onClick={m.abrir} disabled={!m.abrir}><span>{m.titulo}</span></button>)}
                </>}
            </div> })}
          {/* Lo de varios días (25 oct 2026): una barra por evento que cruza sus días, nunca repetida en cada columna. */}
          {tramos.length > 0 && <>
            <div className={`${h.esquina} ${h.barrasEsquina}`} aria-hidden />
            <div className={h.barras}>{tramos.map(b => <button key={b.id} className={`${h.barra} ev-color`} style={{ ...estiloEvento(b.color), gridColumn: `${b.a} / ${b.z}` } as CSSProperties}
              data-sigue-antes={b.antes || undefined} data-sigue-despues={b.despues || undefined} title={b.titulo} onClick={b.abrir} disabled={!b.abrir}><span>{b.titulo}</span></button>)}</div>
          </>}
        </div>
      </div>

      {/* El cuerpo: el canal de horas y una columna por día. `data-carril`: deslizar de lado recorre los días en el riel. */}
      <div ref={riel} className={h.riel} data-carril={angosto || desliza || undefined}>
        <div className={h.lienzo} role="row">
          <div ref={canal} className={h.canal} aria-hidden>
            {Array.from({ length: horas + 1 }, (_, k) => <span key={k} style={{ top: `calc(${k} * var(--hora))` }} data-borde={k === 0 || k === horas || undefined}>{String(tramo.desde + k).padStart(2, '0')}</span>)}
            {dias.includes(hoy) && ahoraMin >= tramo.desde * 60 && ahoraMin <= tramo.hasta * 60 && <time className={h.ahoraHora} style={{ top: y(ahoraMin) }}>{hhmm(ahoraMin)}</time>}
          </div>
          {dias.map((d, i) => { const { piezas, antes, despues, bandas = [], chips = [] } = porDia.get(d)!, esHoy = d === hoy
            return <div key={d} ref={el => { columnas.current[i] = el }} role="gridcell" className={h.columna} data-hoy={esHoy || undefined} data-pasado={d < hoy || undefined}
              aria-label={`${etiquetaLarga(d)}: ${piezas.length + antes.length + despues.length} bloques${chips.length ? `, ${chips.reduce((n, g) => n + g.bloques.length, 0)} tareas` : ''}`}
              onClick={minimo ? () => onDia?.(d) : undefined} onDoubleClick={e => crearEn(e, d)} onPointerDown={e => empezarCrear(e, d)} onContextMenu={e => { if (gestoRef.current) e.preventDefault() }} data-crea={onCrear && !minimo ? '' : undefined}>
              {esHoy && ahoraMin > tramo.desde * 60 && <i className={h.vivido} style={{ height: y(Math.min(ahoraMin, tramo.hasta * 60)) }} aria-hidden />}
              {antes.length > 0 && <button className={h.fuera} data-lado="antes" onClick={() => onDia?.(d)} title={antes.map(b => `${hhmm(minutoDelDia(b.inicio, d))} ${b.titulo}`).join('\n')}>
                ↑ {minimo ? antes.length : antes.length === 1 ? `${hhmm(minutoDelDia(antes[0].inicio, d))} ${antes[0].titulo}` : `${antes.length} antes de las ${tramo.desde}`}</button>}
              {/* Campos de fondo (28 oct 2026): trabajo profundo como campo tenue y la ventana de comida como riel al borde. Nunca tapan:
                  lo real va encima y, si una llamada pisa el trabajo profundo, su etiqueta lo dice («7 h · 1 h con llamadas»). */}
              {(() => {
                const franjas = franjasDelDia(campos, d)
                if (!franjas.length) return null
                const llamadas = piezas.filter(p => p.bloque.compromiso).map(p => ({ desde: p.desde, hasta: p.hasta }))
                const resumen = resumenCampo(franjas, 'profundo', llamadas)
                const etiquetada = new Set<string>()
                return franjas.filter(f => f.hasta > tramo.desde * 60 && f.desde < tramo.hasta * 60).map((f, k) => {
                  const a = Math.max(f.desde, tramo.desde * 60), z = Math.min(f.hasta, tramo.hasta * 60)
                  // El nombre una vez por campo y por día, en su primera franja que no tape una tarjeta.
                  const libre = !minimo && !etiquetada.has(f.clave) && !piezas.some(p => p.desde < a + 22 && p.hasta > a)
                  if (libre) etiquetada.add(f.clave)
                  const texto = f.clave === 'profundo' && resumen ? resumen.texto : `${f.titulo} · ${rango(f)}`
                  return <div key={`c${k}`} className={h.campo} data-tipo={f.tipo} data-campo={f.clave} style={{ top: y(a), height: `calc(${(z - a) / 60} * var(--hora) - 1px)` }}
                    title={`${f.titulo} · ${rango(f)}${f.clave === 'profundo' && resumen?.tapado ? ` · ${texto.split(' · ').slice(1).join(' · ')}` : ''}`} aria-hidden>
                    {libre && <span>{f.tipo === 'comida' ? 'Comida' : texto}</span>}</div>
                })
              })()}
              {/* La Semana Perfecta (25 oct 2026): el ritmo ideal en fantasma, debajo de las bandas y de las tarjetas. Lo real tapa lo ideal. */}
              {fantasmasAntesDe(perfecta, d, corteRutina).filter(f => f.hasta > tramo.desde * 60 && f.desde < tramo.hasta * 60).map((f, k) => { const a = Math.max(f.desde, tramo.desde * 60), z = Math.min(f.hasta, tramo.hasta * 60)
                return <div key={`p${k}`} className={h.perfecta} data-c={f.cuadrante} style={{ '--c': DRIP[f.cuadrante].color, top: y(a), height: `calc(${(z - a) / 60} * var(--hora) - 1px)` } as CSSProperties}
                  title={`Semana perfecta · ${hhmmP(f.desde)}–${hhmmP(f.hasta)} · ${f.titulo} (${DRIP[f.cuadrante].nombre})`} aria-hidden>
                  {/* El nombre solo donde nada real lo tapa (las tarjetas son translúcidas: dos textos encimados no se leen). */}
                  {!minimo && !piezas.some(p => p.desde < a + 20 && p.hasta > a) && <span>{f.titulo}</span>}</div> })}
              {/* Ventanas de disponibilidad: banda de fondo detrás de las tarjetas (no ocupa columna ni tapa el arrastre para crear). */}
              {bandas.map(p => <div key={p.bloque.id} className={`${h.banda} ev-color`} style={{ ...estiloEvento(p.bloque.color), top: y(p.desde), height: `calc(${(p.hasta - p.desde) / 60} * var(--hora) - 1px)` } as CSSProperties}>
                <button onClick={() => onAbrir?.(p.bloque)} title={`${hhmm(p.desde)} – ${hhmm(p.hasta)} · ${p.bloque.titulo}`} aria-label={`Ventana de ${hhmm(p.desde)} a ${hhmm(p.hasta)}, ${p.bloque.titulo}`}>{minimo ? '' : p.bloque.titulo}</button>
              </div>)}
              {piezas.map(p => { const b = p.bloque, enGesto = gesto?.activo && gesto.bloque.id === b.id, dur = p.hasta - p.desde, corto = dur <= 35
                const ini = b.inicio < medianoche(d) ? null : hhmm(minutoDelDia(b.inicio, d)), fin = hhmm(minutoDelDia(b.fin, d))
                // El título manda (ronda 3): envuelve en las líneas que caben; en un bloque estrecho la hora entra solo si deja dos líneas.
                // Encimados lado a lado (25 oct 2026, Riel). Con chips a su altura, el borde es de ellos.
                const util = anchoColumna - (p.resguardo && !minimo ? CHIP_RESERVA : 0), lugar = lugarEnColumna(p.col, p.cols, util)
                const separa = p.cols > 1 ? 3 : minimo ? 2 : 6, texto = b.corto ?? b.titulo
                const anchoBloque = anchoColumna > 0 ? lugar.width : anchoColumna / p.cols, estrecho = anchoBloque < BLOQUE_ESTRECHO
                const alto = dur / 60 * horaPx - 2
                const { lineas, conHora } = lineasDeTitulo(alto - (corto ? 2 : metrica.relleno), metrica.linea, corto ? 0 : metrica.hora,
                  lineasNecesarias(texto, anchoBloque - metrica.lados - (b.brief ? BRIEF_PX : 0), metrica.letra))
                // Lo corto (≤ 35 min) siempre dice al menos el principio del título; solo un bloque de unos minutos queda en puro color.
                const diminuto = corto ? alto < 9 : lineas === 0
                const horaCorta = (p.cols > 1 && angosto) || denso || estrecho
                return <div key={b.id} className={`${h.bloque} ev-color`} data-corto={corto || undefined} data-diminuto={diminuto || undefined} data-tarea={b.tarea || undefined} data-rutina={b.rutina || undefined}
                  data-seccion={b.seccion} data-innegociable={b.innegociable || undefined} data-p1={b.prioridad || undefined} data-compromiso={b.compromiso || undefined} data-sigue-arriba={p.sigueArriba || undefined} data-sigue-abajo={p.sigueAbajo || undefined} data-origen={enGesto || undefined}
                  data-pasado={b.fin <= ahora || undefined} data-con-brief={b.brief ? '' : undefined}
                  data-drip={b.drip} data-letra={b.drip ? DRIP[b.drip].letra : undefined} data-drip-nombre={b.drip ? DRIP[b.drip].nombre : undefined} data-ahora={b.inicio <= ahora && ahora < b.fin || undefined} data-protegido={b.protegido || undefined} data-delegable={b.delegable || undefined}
                  style={{ ...estiloEvento(b.tarea ? null : b.color), top: y(p.desde), height: `calc(${dur / 60} * var(--hora) - 2px)`, '--lineas': Math.max(1, lineas),
                    ...(anchoColumna > 0 ? { left: `${lugar.left}px`, width: `${Math.max(8, lugar.width - separa)}px` }
                      : { left: `calc(${p.col} / ${p.cols} * 100%)`, width: `calc(${1 / p.cols} * 100% - ${separa}px)` }) } as CSSProperties}>
                  {b.seccion && !diminuto && <svg className={h.icoSeccion} viewBox="0 0 16 16" aria-hidden><path d={SECCION[b.seccion].icono} /></svg>}
                  <button className={h.cuerpo} data-planning-id={b.id} data-movible={b.movible && onMover && !minimo ? '' : undefined}
                    onPointerDown={e => tomar(e, p, 'mover')} onClick={() => { if (minimo) onDia?.(d); else if (Date.now() - recienSoltado.current > 250) onAbrir?.(b) }} onKeyDown={e => teclaBloque(e, p)}
                    aria-label={`${b.titulo}${b.brief ? ' (con brief)' : ''}, ${ini ?? 'desde antes'} a ${fin}${b.movible && onMover ? '. Arrastra para moverlo; Opción y flechas lo mueven.' : ''}`}>
                    {corto ? <span className={h.linea}><strong>{texto}</strong>{ini && !estrecho && !minimo && <time>{ini}</time>}</span>
                      : <><strong>{texto}</strong>{conHora && <time>{ini ? (horaCorta ? ini : `${ini} – ${fin}`) : `hasta ${fin}`}</time>}</>}
                  </button>
                  {/* El brief de la misma persona vive en la tarjeta de su llamada: un toque al 📋 lo abre. */}
                  {/* DRIP (24 oct 2026): lo delegable lleva su etiqueta; lo de alguien más dice de quién; lo protegido, su candado. */}
                  {!diminuto && !minimo && (b.protegido || b.delegable) && <span className={h.dripTag} data-tipo={b.protegido ? 'protegido' : b.delegadoA ? 'delegado' : 'delegable'} data-solo-icono={estrecho || corto || undefined}
                    title={b.protegido ? 'Protegido: nada nuevo entra encima' : b.delegadoA ? `De ${b.delegadoA}` : 'Delegable: tócalo y «Delegar a Levy»'}>
                    {b.protegido ? <svg viewBox="0 0 12 12" aria-hidden><rect x="2.5" y="5.2" width="7" height="5.3" rx="1.3" /><path d="M4.2 5.2V3.9a1.8 1.8 0 0 1 3.6 0v1.3" fill="none" /></svg>
                      : <span>{b.delegadoA ? b.delegadoA : estrecho || corto ? 'D' : 'delegable'}</span>}</span>}
                  {b.brief && !minimo && onAbrir && <button className={h.brief} onPointerDown={e => e.stopPropagation()} onClick={() => onAbrir(b.brief!)} title={b.brief.titulo} aria-label={`Abrir ${b.brief.titulo}`}>📋</button>}
                  {b.movible && onEstirar && !p.sigueAbajo && dur >= 30 && <span className={h.borde} onPointerDown={e => tomar(e, p, 'estirar')} aria-hidden />}
                </div> })}
              {/* Tareas con hora sin duración (19 oct 2026): un chip en el borde derecho; las que caen juntas, uno con su cuenta. */}
              {chips.map(g => { const una = g.bloques.length === 1 ? g.bloques[0] : null
                const lista = g.bloques.map(b => `${hhmm(minutoDelDia(b.inicio, d))} ${b.titulo}`).join('\n')
                return <button key={g.bloques[0].id} className={h.chip} data-p1={g.bloques.some(b => b.prioridad) || undefined} data-varias={una ? undefined : ''} data-pasado={g.bloques.every(b => b.inicio + CHIP_MIN * 60_000 <= ahora) || undefined}
                  style={{ top: y(g.desde) }} title={lista} onPointerDown={e => e.stopPropagation()}
                  onClick={() => { if (una && !minimo && onAbrir) onAbrir(una); else onDia?.(d) }}
                  aria-label={una ? `Tarea: ${una.titulo}, ${hhmm(g.desde)}` : `${g.bloques.length} tareas desde las ${hhmm(g.desde)}: abrir el día`}>{una ? null : g.bloques.length}</button> })}
              {fantasma && fantasma.dia === d && <div className={h.fantasma} data-igual={fantasma.igual || undefined} data-nuevo={'nuevo' in fantasma || undefined} role="status" aria-live="polite" style={{ top: y(fantasma.desde), height: `calc(${(fantasma.hasta - fantasma.desde) / 60} * var(--hora) - 2px)` }}>
                <time>{hhmm(fantasma.desde)} – {hhmm(fantasma.hasta)}<small> · {duracion(fantasma.hasta - fantasma.desde)}</small></time></div>}
              {esHoy && ahoraMin >= tramo.desde * 60 && ahoraMin <= tramo.hasta * 60 && <i className={h.ahora} style={{ top: y(ahoraMin) }} aria-hidden />}
              {despues.length > 0 && <button className={h.fuera} data-lado="despues" onClick={() => onDia?.(d)} title={despues.map(b => `${hhmm(minutoDelDia(b.inicio, d))} ${b.titulo}`).join('\n')}>
                ↓ {minimo ? despues.length : despues.length === 1 ? `${hhmm(minutoDelDia(despues[0].inicio, d))} ${despues[0].titulo}` : `${despues.length} después de las ${tramo.hasta}`}</button>}
            </div> })}
        </div>
      </div>
    </div>
  </div>
}
