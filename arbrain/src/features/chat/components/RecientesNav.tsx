'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { useRecientesStore } from '../stores/recientes-store'
import type { ChatSession } from '../hooks/useChatHistory'
import { deriveSessionState, type SessionDotState } from '../lib/session-status'
import { suscribirTurnosActivos, versionTurnosActivos } from '../lib/turnos-activos'
import { textMessageTitle } from '../lib/text-attachments'
import { cuentaDe, cuentaReciente } from '../lib/recientes-cuentas'
import { agruparPorDia, horaDelUltimo, huecoEn, MIME_CONVERSACION, ordenarFijadas, reacomodar, pideDecision, resumenRutinas, sacarReportes, separarFijadas, sueltaCambia, unirListas, type GrupoDia, type ZonaRecientes } from '../lib/recientes-lista'
import { diaAbierto, filasVisibles } from '../lib/recientes-plegado'
import { DOT_STYLE, DOT_TITLE, IndicadorConversacion } from './IndicadorConversacion'
import { EditorTitulo } from './EditorTitulo'
import { MenuConversacion, useMenuConversacion } from './MenuConversacion'
import { escucharEstrellaUnica, fijar, guardarOrdenFijadas, renombrar } from '../lib/acciones-conversacion'
import { esProtegida, tieneMenu } from '../lib/atajos-conversacion'
import { HILOS_RUTINAS, IDS_HILOS_RUTINAS, RUTINAS_EN_BARRA, hiloDeSesion } from '@/shared/constants/rutinas-hilos'

/** Cuántas pide a la API (la barra enseña los últimos tres días; el resto sigue en «Ver todas»). */
const LIMITE_PEDIDO = 60
const LIMITE_FIJADAS = 30
/** Tras publicar ChatPanel algo nuevo, espera esto antes de pedir (varias publicaciones seguidas = un pedido). */
const DEMORA_PUBLICACION_MS = 1500
/** Volver a la ventana no pide otra vez si acabó de pedir. */
const ENFRIAR_FOCO_MS = 3000
/** Con la ventana a la vista, refresca solo: fuera de /chat nadie publica y el semáforo se quedaba quieto. */
const REFRESCO_MS = 20_000
/**
 * Dónde va la carpeta «Rutinas»: true = ARRIBA de Fijadas (recomendación de Levy, 4 oct 2026, pendiente del visto
 * bueno de Daniel); false = debajo de Fijadas. Cambiarla es esta línea.
 */
const RUTINAS_ARRIBA = true

/** Reintento tras una lectura fallida (base, daemon o red caídos). */
const REINTENTO_FALLA_MS = 5_000

/** Lista de conversaciones o error con la causa: una falla NUNCA se pinta como «sin conversaciones» (12 oct 2026). */
const pedirLista = async (qs: string, signal: AbortSignal) => {
  const r = await fetch(`/api/chat/sessions?source=mc&${qs}`, { cache: 'no-store', signal })
  const j = await r.json().catch(() => null) as { sessions?: ChatSession[]; error?: string } | null
  if (!r.ok) throw new Error(typeof j?.error === 'string' && j.error ? j.error : `el servidor respondió ${r.status}`)
  return Array.isArray(j?.sessions) ? j.sessions : null
}

/**
 * Conversaciones recientes bajo las secciones de la barra lateral (1 oct 2026), como en Claude
 * Desktop pero sin filtros (Daniel: «por ahora no ocupamos un filtro»; siempre agrupa por fecha y
 * ordena por última actividad): arriba las fijadas, luego Hoy, Ayer y Hace 2 días (estos tres arrancan
 * plegados, con su conteo: «reducir ruido», 2 oct 2026). Se ven todas sus cuentas; las que no son su Claude llevan un rótulo corto. «Ver todas» abre el panel completo.
 * Abrir una conversación de otra cuenta resincroniza la cuenta activa del chat (ChatPanel, `openSessionById`).
 */
export function RecientesNav({ onElegir, tactil = false }: { onElegir: () => void; tactil?: boolean }) {
  const publicadas = useRecientesStore((s) => s.sesiones)
  const traidas = useRecientesStore((s) => s.traidas)
  const fijadasTraidas = useRecientesStore((s) => s.fijadas)
  const cargada = useRecientesStore((s) => s.cargada)
  const activaId = useRecientesStore((s) => s.activaId)
  const abiertos = useRecientesStore((s) => s.abiertos)
  const rutinas = useRecientesStore((s) => s.rutinas)
  const rutinasManual = useRecientesStore((s) => s.rutinasManual)
  const fijarRutinas = useRecientesStore((s) => s.fijarRutinas)
  const alternarDia = useRecientesStore((s) => s.alternarDia)
  const pathname = usePathname()
  const router = useRouter()
  const enChat = pathname === '/chat'
  // Turnos en curso del journal del daemon (los sondea useChatHistory): repinta el semáforo cuando cambian.
  useSyncExternalStore(suscribirTurnosActivos, versionTurnosActivos, () => 0)

  const control = useRef<AbortController | null>(null)
  const ultimoPedido = useRef(0)
  /** Causa de la última lectura fallida (null = al día). */
  const [falla, setFalla] = useState<string | null>(null)
  // Arrastre en curso (3 oct 2026): qué conversación y sobre qué zona va, para iluminar el destino.
  const [arrastrada, setArrastrada] = useState<ChatSession | null>(null)
  const [sobre, setSobre] = useState<ZonaRecientes | null>(null)
  // Reacomodar Fijadas (4 oct 2026): hueco donde caería lo arrastrado (0 = arriba de la primera fila).
  const [hueco, setHueco] = useState<number | null>(null)
  const nodosFijadas = useRef(new Map<string, HTMLElement>())
  const alturasFijadas = useRef(new Map<string, number>())

  // Pide lo reciente de todas las cuentas y las fijadas (ChatPanel solo publica la cuenta activa).
  const pedir = useCallback(async () => {
    control.current?.abort()
    const ctl = new AbortController()
    control.current = ctl
    ultimoPedido.current = Date.now()
    const { traer, traerRutinas, marcarCargada } = useRecientesStore.getState()
    try {
      const [recientes, fijadas, hilos] = await Promise.all([
        pedirLista(`limit=${LIMITE_PEDIDO}&sort=last_message`, ctl.signal),
        pedirLista(`limit=${LIMITE_FIJADAS}&sort=last_message&fijadas=1`, ctl.signal),
        // v3 (10 oct 2026): sin la carpeta en la barra no hay nada que pedir.
        RUTINAS_EN_BARRA ? pedirLista(`limit=${IDS_HILOS_RUTINAS.length}&rutinas=1`, ctl.signal) : Promise.resolve(null),
      ])
      if (ctl.signal.aborted) return
      setFalla(null)
      if (hilos) traerRutinas(hilos)
      if (recientes) traer(recientes, fijadas ?? useRecientesStore.getState().fijadas)
      else marcarCargada()
    } catch (e) {
      // Sin red o servidor caído: queda lo último que se pintó, se dice la causa y se reintenta solo.
      if (ctl.signal.aborted) return
      setFalla(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'sin conexión con el servidor')
      marcarCargada()
    }
  }, [])

  useEffect(() => {
    if (!falla) return
    const t = setTimeout(() => { void pedir() }, REINTENTO_FALLA_MS)
    return () => clearTimeout(t)
  }, [falla, pedir])

  // Al montar, de inmediato; cuando ChatPanel publica (algo cambió: título, semáforo, conversación
  // nueva), con debounce. Esa publicación es solo la señal; los datos vienen de la API.
  useEffect(() => {
    const demora = ultimoPedido.current ? DEMORA_PUBLICACION_MS : 0
    const t = setTimeout(() => { void pedir() }, demora)
    return () => clearTimeout(t)
  }, [publicadas, pedir])

  useEffect(() => () => control.current?.abort(), [])
  // Una conversación fijada desde otro lado (31 oct 2026: la que abrió Levy, panel/conversacion-nueva.ts) se relee al instante.
  useEffect(() => {
    const alFijar = () => { void pedir() }
    window.addEventListener('openclaw:session-pinned', alFijar)
    return () => window.removeEventListener('openclaw:session-pinned', alFijar)
  }, [pedir])
  // Estrella única (v3): otra ventana marcó una favorita; aquí se apagan las demás sin esperar a releer.
  useEffect(() => escucharEstrellaUnica(), [])

  // Al volver a la ventana (o al teléfono) las conversaciones pudieron cambiar desde otro lado.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      setAhora(Date.now())
      if (Date.now() - ultimoPedido.current < ENFRIAR_FOCO_MS) return
      void pedir()
    }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    // «Hoy» pasa a «Ayer» a medianoche aunque nadie toque nada; y el semáforo se mueve aunque no estés en el chat.
    const reloj = setInterval(() => {
      setAhora(Date.now())
      if (document.visibilityState === 'visible' && Date.now() - ultimoPedido.current >= REFRESCO_MS) void pedir()
    }, REFRESCO_MS)
    return () => {
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(reloj)
    }
  }, [pedir])

  const { fijadas, grupos, reportes } = useMemo(() => {
    const unidas = unirListas([...fijadasTraidas, ...traidas], publicadas)
    const { fijadas: todasFijadas, resto } = separarFijadas(unidas)
    // «Reportes» (el hilo viejo de los crons) pasa de Fijadas a la carpeta «Rutinas» como historial.
    const { fijadas, reportes } = sacarReportes(ordenarFijadas(todasFijadas))
    return { fijadas, reportes, grupos: agruparPorDia(resto, ahora) }
  }, [fijadasTraidas, traidas, publicadas, ahora])

  // Los dos hilos de la carpeta, en su orden: «Reportes» (el hilo de siempre, fijado, que trae la barra aparte) e
  // «Información»; el que aún no llegó de la API sale sin datos y apagado.
  const hilosRutinas = useMemo(
    () => HILOS_RUTINAS.map((h) => ({ hilo: h, sesion: h.sesionId ? rutinas.find((r) => r.id === h.sesionId) ?? null : reportes })),
    [rutinas, reportes],
  )
  // Morado = el cron declaró una decisión y Daniel aún no la ve. «Reportes» (historial) nunca cuenta.
  const morados = hilosRutinas.filter((x) => x.sesion && pideDecision(x.sesion)).length
  const resumen = resumenRutinas(morados)
  // Plegada por defecto; se despliega sola cuando hay algo morado y respeta lo que Daniel haga a mano.
  const rutinasAbierta = rutinasManual ?? morados > 0
  // Algo nuevo en morado suelta el plegado manual: no se queda escondido lo que te necesita.
  const moradosPrevios = useRef(0)
  useEffect(() => {
    if (morados > moradosPrevios.current) fijarRutinas(null)
    moradosPrevios.current = morados
  }, [morados, fijarRutinas])

  // Al cambiar el orden de Fijadas, cada fila se desliza de donde estaba a su nuevo lugar (FLIP).
  const ordenFijadas = fijadas.map((s) => s.id).join(',')
  useLayoutEffect(() => {
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const nuevas = new Map<string, number>()
    nodosFijadas.current.forEach((el, id) => {
      const y = el.offsetTop
      nuevas.set(id, y)
      const antes = alturasFijadas.current.get(id)
      if (!quieto && antes !== undefined && antes !== y) {
        el.animate([{ transform: `translateY(${antes - y}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
      }
    })
    alturasFijadas.current = nuevas
  }, [ordenFijadas])

  // Mientras no haya nada que pintar ni intento de carga, sin cabecera vacía.
  if (!cargada && grupos.length === 0 && fijadas.length === 0) return null

  const abrir = (id: string) => {
    onElegir()
    if (enChat) {
      window.dispatchEvent(new CustomEvent('openclaw:open-session', { detail: id }))
      return
    }
    // Fuera del chat ChatPanel no está montado: al montar abre la conversación de la navegación.
    try { sessionStorage.setItem('mc_activeChatSessionId', id) } catch { /* modo privado */ }
    router.push('/chat')
  }

  const idsFijadas = fijadas.map((s) => s.id)
  // Hueco que se ve: ninguno si soltar ahí deja todo igual (la fila junto a sí misma).
  const huecoVisible = arrastrada && hueco !== null && reacomodar(idsFijadas, arrastrada.id, hueco) ? hueco : null
  const fila = (s: ChatSession, i?: number) => (
    <FilaReciente
      key={s.id}
      s={s}
      activa={enChat && s.id === activaId}
      arrastrando={arrastrada?.id === s.id}
      linea={i === undefined || huecoVisible === null ? undefined : huecoVisible === i ? 'arriba' : huecoVisible === fijadas.length && i === fijadas.length - 1 ? 'abajo' : undefined}
      nodo={i === undefined ? undefined : (el) => { if (el) nodosFijadas.current.set(s.id, el); else nodosFijadas.current.delete(s.id) }}
      onAbrir={abrir}
      onArrastre={(x) => { setArrastrada(x); if (!x) { setSobre(null); setHueco(null) } }}
      tactil={tactil}
      hora={tactil ? horaDe(s, ahora) : undefined}
    />
  )

  // Una zona acepta solo si soltar ahí cambia algo: Fijadas acepta cualquier conversación (fijarla o
  // reacomodarla en el hueco), los días solo una fijada (desfijarla).
  const acepta = (z: ZonaRecientes) => (z === 'fijadas' ? !!arrastrada : sueltaCambia(arrastrada, z))
  const zona = (z: ZonaRecientes) => ({
    onDragOver: (e: DragEvent) => {
      if (!acepta(z) || !e.dataTransfer.types.includes(MIME_CONVERSACION)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (sobre !== z) setSobre(z)
      if (z === 'fijadas') {
        const mitades = fijadas.map((s) => {
          const r = nodosFijadas.current.get(s.id)?.getBoundingClientRect()
          return r ? r.top + r.height / 2 : Infinity
        })
        const h = huecoEn(mitades, e.clientY)
        if (h !== hueco) setHueco(h)
      }
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setSobre((v) => (v === z ? null : v))
      if (z === 'fijadas') setHueco(null)
    },
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(MIME_CONVERSACION)
      const s = arrastrada
      const h = hueco
      setArrastrada(null)
      setSobre(null)
      setHueco(null)
      if (!s || s.id !== id || !acepta(z)) return
      e.preventDefault()
      if (z === 'dias') { void fijar(s); return } // una fijada soltada en los días se desfija
      const orden = reacomodar(idsFijadas, s.id, h ?? idsFijadas.length)
      if (orden) void guardarOrdenFijadas(orden, s.is_favorite ? fijadas : [...fijadas, s])
    },
  })
  const destino = (z: ZonaRecientes) =>
    sueltaCambia(arrastrada, z) ? `rounded-lg outline-1 outline-dashed -outline-offset-1 transition-colors ${sobre === z ? 'bg-brand/10 outline-brand' : 'outline-border-subtle'}` : ''
  const mostrarFijadas = fijadas.length > 0 || sueltaCambia(arrastrada, 'fijadas')

  const carpeta = (
    <section className="mb-1" aria-label="Rutinas" data-testid="carpeta-rutinas">
      <EncabezadoSeccion
        etiqueta="Rutinas"
        resumen={resumen}
        abierto={rutinasAbierta}
        onAlternar={() => fijarRutinas(!rutinasAbierta)}
        tactil={tactil}
      />
      {rutinasAbierta && (
        <div className="space-y-0.5">
          {hilosRutinas.map(({ hilo, sesion }) => sesion
            ? <FilaReciente key={hilo.id} s={sesion} activa={enChat && sesion.id === activaId} arrastrando={false} onAbrir={abrir} onArrastre={setArrastrada} hora={horaDe(sesion, ahora)} morado={pideDecision(sesion)} tactil={tactil} />
            : <p key={hilo.id} className={`nav-item w-full cursor-default text-left text-muted/50 ${tactil ? 'min-h-11 text-[15px]' : 'text-xs'}`}>{hilo.icono} {hilo.etiqueta}</p>)}
        </div>
      )}
    </section>
  )

  return (
    <div className={`px-3 pb-4 ${tactil ? 'pt-1' : 'pt-0.5'}`}>

      {/* v3 (10 oct 2026): la sección «Rutinas» sale de la barra; sus hilos siguen en Taller › Rutinas y en el buscador. */}
      {RUTINAS_EN_BARRA && RUTINAS_ARRIBA && carpeta}

      {mostrarFijadas && (
        <section className={`mb-1 ${destino('fijadas')}`} aria-label="Fijadas" {...zona('fijadas')}>
          <EncabezadoSeccion etiqueta="Fijadas" tactil={tactil} />
          <div className="relative space-y-0.5">{fijadas.map((s, i) => fila(s, i))}</div>
          {fijadas.length === 0 && <p className="px-2.5 pb-2 text-[11px] text-muted/70">Suelta aquí para fijar</p>}
        </section>
      )}

      {RUTINAS_EN_BARRA && !RUTINAS_ARRIBA && carpeta}

      {falla && (
        <p role="status" data-recientes-falla className={`px-2.5 py-2 text-muted/70 ${tactil ? 'text-[13px]' : 'text-[11px]'}`}>
          {grupos.length === 0 && fijadas.length === 0 ? 'No pude cargar tus conversaciones' : 'No pude actualizar la lista'}: {falla}. Reintentando solo…
        </p>
      )}
      {!falla && grupos.length === 0 && fijadas.length === 0 && (
        <p className={`px-2.5 py-2 text-muted/70 ${tactil ? 'text-[13px]' : 'text-[11px]'}`}>Sin conversaciones en los últimos tres días</p>
      )}

      <div className={destino('dias')} {...zona('dias')}>
      {sueltaCambia(arrastrada, 'dias') && <p className="px-2.5 py-1.5 text-[11px] text-muted/70">Suelta aquí para desfijar</p>}
      {grupos.map((g: GrupoDia) => {
        // REGLA DURA (Daniel, 5ª vez, 2 oct 2026): cerrados al montar; candado en tests/chat/sidebar-grupos-cerrados.test.ts.
        // Plegados de entrada; lo que Daniel abre a mano queda en el store hasta cerrar la app (2 oct 2026).
        const abierto = diaAbierto(abiertos, g.clave)
        // Cerrado es cerrado, también con la conversación activa dentro (Daniel, 4 oct 2026).
        const filas = filasVisibles(g, abierto)
        return (
          <section key={g.clave} className="mb-1">
            <EncabezadoSeccion
              etiqueta={g.etiqueta}
              cuenta={g.sesiones.length}
              abierto={abierto}
              onAlternar={() => alternarDia(g.clave)}
              tactil={tactil}
              // Plegado no enseña filas, pero sí si adentro algo te espera (el color más urgente del día).
              senal={abierto ? undefined : senalDelDia(g.sesiones)}
            />
            {filas.length > 0 && <div className="space-y-0.5">{filas.map((s) => fila(s))}</div>}
          </section>
        )
      })}
      </div>
    </div>
  )
}

/** Hora del último mensaje de un hilo; sin mensajes, vacía (updated_at es la creación, no un resultado). */
const horaDe = (s: ChatSession, ahora: number) => (s.last_message_at ? horaDelUltimo(Date.parse(s.last_message_at), ahora) : '')

/** De lo que hay adentro de un día plegado, lo más urgente: trabajando > te toca > sin ver. */
const URGENCIA: SessionDotState[] = ['working', 'needs_reply', 'unread']
function senalDelDia(sesiones: ChatSession[]): SessionDotState | undefined {
  const estados = new Set(sesiones.map((x) => deriveSessionState(x)))
  return URGENCIA.find((e) => estados.has(e))
}

interface PropsEncabezado {
  etiqueta: string
  cuenta?: number
  resumen?: { texto: string; alDia: boolean }
  abierto?: boolean
  onAlternar?: () => void
  tactil?: boolean
  /** Día plegado: el estado más urgente de sus conversaciones (un punto junto al conteo). */
  senal?: SessionDotState
}

/**
 * Encabezados discretos (4 oct 2026, noche): en minúscula de oración, sin versalitas espaciadas. Los plegables
 * (días y Rutinas) son una fila entera que se toca: etiqueta, conteo, señal y el chevrón a la derecha.
 */
function EncabezadoSeccion({ etiqueta, cuenta, resumen, abierto, onAlternar, tactil, senal }: PropsEncabezado) {
  const tam = tactil ? 'min-h-11 text-[14px]' : 'min-h-7 text-[12px]'
  const clase = `flex w-full items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted ${tam}`
  // Rótulo puro (Fijadas): pequeño y quieto; las filas plegables de abajo se leen como accesos, no como rótulos.
  if (!onAlternar) return <div className={`flex w-full items-center px-2.5 pb-1 pt-1 font-semibold text-muted/75 ${tactil ? 'mt-2 text-[12px]' : 'mt-1.5 text-[11px]'}`}>{etiqueta}</div>
  return (
    <button type="button" onClick={onAlternar} aria-expanded={abierto} className={`${clase} transition-colors hover:bg-foreground/[0.04] hover:text-foreground active:bg-foreground/[0.06]`}>
      <span className="text-foreground/80">{etiqueta}</span>
      {/* Conteo del día completo, también plegado: es lo único que dice si vale la pena abrirlo (2 oct 2026). */}
      {cuenta !== undefined && <span className="font-normal tabular-nums text-muted/55">{cuenta}</span>}
      {senal && <span className={`size-1.5 shrink-0 rounded-full ${DOT_STYLE[senal]}`} title={DOT_TITLE[senal]} aria-label={DOT_TITLE[senal]} />}
      {/* Carpeta «Rutinas»: «al día» si todo está gris; si no, el contador morado («2 te necesitan»). */}
      {resumen && (resumen.alDia
        ? <span className="font-normal text-muted/55">· {resumen.texto}</span>
        : <span className="rounded-full bg-brand/15 px-2 py-px text-[11px] font-medium text-brand-ink" data-testid="rutinas-te-necesitan">{resumen.texto}</span>)}
      <ChevronDown className={`ml-auto size-3.5 shrink-0 text-muted/50 transition-transform duration-200 ${abierto ? '' : '-rotate-90'}`} aria-hidden />
    </button>
  )
}

// Con mouse: al pasar (o con el foco, o con el menú abierto) el final del título se desvanece bajo el «⋯», sin moverlo.
// Con el dedo no hay «⋯» (4 oct 2026, noche: cortaba los títulos): las acciones salen al mantener presionada la fila.
const MASCARA = '[mask-image:linear-gradient(to_right,#000_calc(100%_-_2.75rem),transparent_calc(100%_-_1rem))]'
// Literal (Tailwind solo genera clases que lee completas en el código).
const FILA_MASCARA = 'pointer-fine:group-hover/fila:[mask-image:linear-gradient(to_right,#000_calc(100%_-_2.75rem),transparent_calc(100%_-_1rem))] pointer-fine:group-focus-within/fila:[mask-image:linear-gradient(to_right,#000_calc(100%_-_2.75rem),transparent_calc(100%_-_1rem))]'
const BOTON_MAS = 'absolute right-1 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:hidden group-hover/fila:opacity-100 group-focus-within/fila:opacity-100'
/** Mantener presionado: lo que tarda en abrir el menú y cuánto puede moverse el dedo sin que cuente como scroll. */
const PRESION_MS = 420
const PRESION_TOLERANCIA_PX = 10

interface PropsFila {
  s: ChatSession
  activa: boolean
  /** Es la que se está arrastrando: se atenúa en su lugar mientras tanto. */
  arrastrando: boolean
  /** Dónde caería lo arrastrado en Fijadas: una línea arriba o abajo de esta fila. */
  linea?: 'arriba' | 'abajo'
  /** Solo las filas de Fijadas: para medir el hueco y deslizarlas al reacomodar. */
  nodo?: (el: HTMLDivElement | null) => void
  onAbrir: (id: string) => void
  onArrastre: (s: ChatSession | null) => void
  /** Hora del último mensaje, a la derecha (la carpeta «Rutinas» siempre; en el teléfono, todas). */
  hora?: string
  /** Solo la carpeta «Rutinas»: el color es binario (morado = pide decisión, gris = el resto); sustituye al no leído. */
  morado?: boolean
  /** Teléfono: título de hasta dos líneas a 15 px, hora arriba a la derecha y menú al mantener presionado. */
  tactil?: boolean
}

function FilaReciente({ s, activa, arrastrando, linea, nodo, onAbrir, onArrastre, hora, morado, tactil = false }: PropsFila) {
  const [editando, setEditando] = useState(false)
  const menu = useMenuConversacion(s, { onRenombrar: () => setEditando(true), onAbrir: (copia) => onAbrir(copia.id) })
  const presion = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout> } | null>(null)
  const abrioMenu = useRef(false)
  const estadoSemaforo = deriveSessionState(s)
  // En la carpeta Rutinas (morado !== undefined) solo hay trabajando / morado / gris: ni azul ni «no leído» aparte.
  const estado = morado === undefined ? estadoSemaforo : estadoSemaforo === 'working' ? 'working' : morado ? 'unread' : 'read'
  const reportes = esProtegida(s)
  const hilo = hiloDeSesion(s.id)
  const titulo = hilo ? `${hilo.icono} ${hilo.etiqueta}` : reportes ? 'Reportes' : textMessageTitle(s.title) || 'Conversación'
  const cuenta = cuentaReciente(cuentaDe(s))
  const detalle = [cuenta.corta ? cuenta.etiqueta : '', estado === 'read' ? '' : morado ? 'Te pide una decisión' : DOT_TITLE[estado]].filter(Boolean)
  // En el teléfono el punto y la estrella comparten una columna fija: todos los títulos arrancan en la misma x.
  const punto = tactil
    ? <span className="flex h-[1.375rem] w-3.5 shrink-0 items-center justify-center" aria-hidden={estado === 'read' && !s.is_starred}><IndicadorConversacion sesion={s} estado={estado} /></span>
    : <IndicadorConversacion sesion={s} estado={estado} />
  // Lo que ya viste se lee más quieto; lo que te espera, en primer plano.
  const tono = activa || menu.abierto ? 'text-foreground' : estado === 'read' ? 'text-foreground/85' : 'text-foreground'

  const soltarPresion = () => { if (presion.current) { clearTimeout(presion.current.t); presion.current = null } }
  const alPresionar = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || menu.opciones.length === 0) return
    abrioMenu.current = false
    const { clientX: x, clientY: y } = e
    soltarPresion()
    presion.current = {
      x, y,
      t: setTimeout(() => {
        presion.current = null
        abrioMenu.current = true
        try { navigator.vibrate?.(8) } catch { /* iOS no vibra desde la web */ }
        menu.abrirEn(x, y)
      }, PRESION_MS),
    }
  }
  const alMover = (e: React.PointerEvent) => {
    const p = presion.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESION_TOLERANCIA_PX) soltarPresion()
  }
  useEffect(() => soltarPresion, [])

  return (
    <div
      ref={nodo}
      className={`group/fila relative transition-opacity ${arrastrando ? 'opacity-40' : ''} ${tactil ? 'select-none [-webkit-touch-callout:none]' : ''}`}
      onKeyDown={menu.alTeclaFila}
      onContextMenu={editando ? undefined : (e) => {
        // Android abre su menú contextual al mantener presionado: si ya abrimos el nuestro, solo se calla el nativo.
        if (abrioMenu.current || presion.current) { e.preventDefault(); return }
        menu.alClicDerecho(e)
      }}
      // Arrastrable solo si tiene fila en la base donde guardar el fijado (las solo-SDK no). «Reportes» es fijo.
      draggable={!tactil && !editando && tieneMenu(s) && !reportes && !hilo}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_CONVERSACION, s.id)
        e.dataTransfer.effectAllowed = 'move'
        menu.setAbierto(false)
        onArrastre(s)
      }}
      onDragEnd={() => onArrastre(null)}
    >
      {linea && <span className={`pointer-events-none absolute inset-x-2 z-20 h-0.5 rounded-full bg-brand ${linea === 'arriba' ? '-top-[2px]' : '-bottom-[2px]'}`} aria-hidden />}
      {editando ? (
        <div className={`nav-item w-full gap-2 ${tactil ? 'min-h-11 text-[15px]' : 'text-xs'}`}>
          {punto}
          <EditorTitulo
            valor={s.title}
            className="min-w-0 flex-1"
            onConfirmar={(nuevo) => { setEditando(false); void renombrar(s, nuevo) }}
            onCancelar={() => setEditando(false)}
          />
        </div>
      ) : (
        <button
          onClick={(e) => {
            // Soltar tras mantener presionado abrió el menú: no abre además la conversación.
            if (abrioMenu.current) { abrioMenu.current = false; e.preventDefault(); return }
            onAbrir(s.id)
          }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={soltarPresion}
          onPointerCancel={soltarPresion}
          onPointerLeave={soltarPresion}
          className={`nav-item w-full text-left ${tactil ? 'min-h-11 !items-start !gap-2.5 rounded-xl !py-2.5 text-[15px] leading-[1.375rem] active:bg-foreground/[0.07]' : 'text-xs'} ${activa ? 'nav-item-active' : ''} ${menu.abierto ? '!bg-foreground/[0.07] !text-foreground' : ''}`}
          title={detalle.length > 0 ? `${titulo} · ${detalle.join(' · ')}` : titulo}
          aria-current={activa ? 'page' : undefined}
          aria-haspopup={tactil && menu.opciones.length > 0 ? 'menu' : undefined}
        >
          {punto}
          {tactil ? (
            <>
              <span className={`line-clamp-2 min-w-0 flex-1 break-words font-normal ${tono}`}>{titulo}</span>
              {(cuenta.corta || hora) && (
                <span className="flex h-[1.375rem] shrink-0 items-center gap-1.5 text-[12.5px] font-normal tabular-nums text-muted">
                  {cuenta.corta && <span className={`text-[11px] font-medium ${cuenta.texto}`} aria-label={cuenta.etiqueta}>{cuenta.corta}</span>}
                  {hora}
                </span>
              )}
            </>
          ) : (
            <span className={`flex min-w-0 flex-1 items-center gap-2 ${menu.abierto ? MASCARA : FILA_MASCARA}`}>
              <span className="min-w-0 flex-1 truncate">{titulo}</span>
              {cuenta.corta && <span className={`shrink-0 text-[10px] font-medium ${cuenta.texto}`} aria-label={cuenta.etiqueta}>{cuenta.corta}</span>}
              {hora && <span className="shrink-0 text-[10px] tabular-nums text-muted/60">{hora}</span>}
            </span>
          )}
        </button>
      )}
      {/* Las solo-SDK no tienen fila en la base donde guardar nada: sin menú. Con el dedo, el «⋯» no se pinta. */}
      {!editando && (
        <MenuConversacion sesion={s} control={menu} clase={`${BOTON_MAS} ${menu.abierto ? '!opacity-100 bg-foreground/10 !text-foreground' : ''}`} />
      )}
    </div>
  )
}
