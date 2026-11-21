'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LivePcmPlayer, VoiceTrack } from '@/features/live/voice/player'
import type { AudioEngine } from '@/features/command-center/lib/audio-engine'
import type { LoopStatus } from '@/features/command-center/hooks/useVoiceLoop'
import { align, Calibrador, energyAt, features, timelineMs, type Timeline } from '@/features/chat/lib/levy-lipsync'
import { fonemas, palabras, pesosAtlas, pista, type Pista } from '@/features/chat/lib/levy-visemas'
import { canalesEn, esAtlasCanales, pesosCanales, pistaBoca, type PistaBoca } from '@/features/chat/lib/levy-boca'
import { frasesDe, MovimientoVivo } from '@/features/chat/lib/levy-movimiento'
import { cabezaLPActiva, levyVivoActivo } from '@/features/chat/lib/levy-vivo'
import { cajaCuerpo, cssMatriz, CuerpoVivo, derivaCamara, MEDIO_CABEZA, MEDIO_CUERPO, MEDIO_FONDO, MEDIO_MATE, RETRATO_EN_CUERPO, transformCuerpo } from '@/features/chat/lib/levy-medio'
import { clipDeseado, ClipsVivos, CLIPS_URL, type Manifiesto } from '@/features/chat/lib/levy-clips'
import { BRAZOS_URL, BrazosVivos, type ManifiestoBrazos } from '@/features/chat/lib/levy-brazos'
import { Retrato } from '@/shared/components/Retrato'
import { alCambiarEstado, estadoVentana } from '@/shared/lib/reposo'

// El arte de cada cara va en WebP SIN PÉRDIDA (5 oct 2026, scripts/retratos.sh): los mismos píxeles que el PNG con
// un 30 % menos de bytes. Lo usan el retrato fijo y la textura del rig (`arte` reemplaza el `art` de geometry.js,
// que sigue apuntando al PNG que escriben las herramientas de medida).
export const LEVY_PORTRAIT = '/levy-face/assets/levy.webp'
// Mismo rig 2D de la comunidad para los tres agentes de Live; cada uno trae su propia hoja de personaje y geometría.
export type CaraAgente = 'levy' | 'trinity' | 'sensei'
// `vivo` (bandera Levy vivo, apagada por defecto): la cara OFICIAL (chip Arbrain) y el atlas de bocas horneado para ella.
// Trinity y Sensei no lo tienen todavía; cuando se hornee su atlas basta con declararlo aquí.
type Vivo = { arte: string; retrato: string; atlas: string }
const CARAS: Record<CaraAgente, { base: string; retrato: string; arte: string; nombre: string; lado: 1 | -1; vivo?: Vivo }> = {
  levy: { base: '/levy-face', retrato: LEVY_PORTRAIT, arte: 'levy.webp', nombre: 'Levy', lado: 1,
    vivo: { arte: 'levy-oficial.webp', retrato: '/levy-face/assets/levy-oficial.webp', atlas: 'assets/atlas/atlas.json' } },
  trinity: { base: '/agentes-2d/trinity', retrato: '/agentes-2d/trinity/assets/trinity.webp', arte: 'trinity.webp', nombre: 'Trinity', lado: 1 },
  sensei: { base: '/agentes-2d/sensei', retrato: '/agentes-2d/sensei/assets/sensei.webp', arte: 'sensei.webp', nombre: 'Sensei', lado: -1 },
}
// Daniel (4 oct, viendo hablar a Levy): «no me gusta que tenga dientes» y «a la mitad del movimiento
// se ve doble, como bizco». En Arbrain la cara es UNA sola imagen deformada: sin la vista ¾ fundida
// en el giro (dos pares de iris a media pose) ni la pintura de boca abierta (dientes); la boca abre a
// la cavidad oscura procedural. El párpado cerrado dibujado entra como cortinilla opaca (rig.js).
const CAPAS = { giro: false, boca: false, brilloOjos: false, cavidadPareja: true, respiracion: 2.2, torso: 4 }
// Same URL-loaded rig as SaaS Factory; the shader and artwork stay together.
// Import dinámico sin `new Function` (11 oct 2026): la CSP de la edición cliente no permite 'unsafe-eval' y el
// constructor tronaba al cargar el módulo (el chat entero caía). `webpackIgnore` deja el import() nativo del navegador.
const importUrl = <T = RigModule>(url: string): Promise<T> => import(/* webpackIgnore: true */ url) as Promise<T>
type Utterance = { meta: { events: unknown[]; total: number; audioDur: number; text: string }; readonly t: number; readonly paused: boolean; amp: (t: number) => [number, number]; ampFloor?: number; jawGain?: number; browSpeak?: number; browPulse?: number
  /** Levy vivo: pesos de las teselas del atlas en el instante que suena (null = sin alineación: boca paramétrica). */
  pesosAtlas?: (teselas: string[]) => [number, number][] | null }
type Rig = {
  ready: boolean
  pointerLock: boolean
  mouse: number[]
  life: { mouseIdle: number; notePointer: (x: number, y: number) => void }
  speech: { utt?: unknown } | null
  params: Record<string, unknown>
  emo?: { hz: number }
  _breathEv: unknown
  /** rig.js (Levy vivo): manifiesto del atlas cuando cargó, y gestos sumados desde fuera. */
  atlas?: { teselas: string[] } | null
  extra: { headShift?: [number, number]; headRot?: number; parallax?: [number, number]; brow?: [number, number]; blink?: number; cabeza?: [number, number] } | null
  /** rig.js (atlas de cabeza, prueba): manifiesto cuando cargó (rejilla de giro × inclinación en grados). */
  cabeza?: { yaw: number[]; pitch: number[] } | null
  emotion: (name: string, options?: { blendWith: string; amount: number }) => void
  pulse: (channel: string, amp: number, dur: number) => void
  set: (name: string, value: unknown) => void
  speakTimeline: (utterance: Utterance) => void
  exhale: (amount?: number) => void
  dispose: () => void
  /** rig.js (6 oct 2026): pausado duerme el bucle hasta `despertar()`; `fpsMax` pone tope de cuadros (0 = sin tope). */
  pausado: boolean
  fpsMax: number
  despertar: () => void
}
type RigModule = { Rig: new (canvas: HTMLCanvasElement, options: { base: string; geo?: unknown; capas?: { giro?: boolean; cerrado?: boolean; boca?: boolean; brilloOjos?: boolean; cavidadPareja?: boolean; respiracion?: number; torso?: number; atlas?: string; mate?: string; cabeza?: string } }) => Rig; textToVisemes: (text: string) => Timeline }
type GeometryModule = { default: unknown }
type Visemes = { textToVisemes: (text: string) => Timeline & { words?: string[] } }

/** Boca de los videos en Live: lo que se pinta en este cuadro se ve en el siguiente refresco (60 Hz). */
const PANTALLA_S = 1 / 60
/** Levy vivo: del movimiento del 3D (rad, ceja 0..1) al rig 2D (px de la rejilla de 1080, rad, parallax, ceja del rig). */
const GANANCIA = { asiente: 60, inclina: 1.5, ladeo: 0.6, giro: 6, ceja: 1.4 }
/** Atlas de cabeza (prueba): del 3D (grados) a la pose de LivePortrait. El giro del 3D es casi solo ruido (±1°): ×2,5. */
const GANANCIA_LP = { giro: 2.5, inclina: 1.0 }
const MEDIO_CABEZA_LP = 'medio/cabeza/cabeza.json'
/** Grados → coordenada fraccionaria en una rejilla de valores crecientes (fuera de rango, el borde). */
function indiceRejilla(vals: number[], x: number): number {
  if (x <= vals[0]) return 0
  for (let i = 0; i < vals.length - 1; i++) if (x <= vals[i + 1]) return i + (x - vals[i]) / (vals[i + 1] - vals[i])
  return vals.length - 1
}

/** Qué cara pone cada estado. El reposo es el retrato tal cual: la meta es el PNG, no una mueca. */
const CARA_DE: Record<LoopStatus, [string, { blendWith: string; amount: number }?]> = {
  idle: ['neutral'],
  error: ['neutral'],
  // Escuchar: calidez con atención (sonrisa mínima sostenida, ceño apenas junto, quieta).
  listening: ['calida', { blendWith: 'foco', amount: 0.3 }],
  // Pensar: una ceja que duda sobre un fondo cálido; la mirada se va y regresa (ver `pensar`). Con la
  // ganancia expresiva de Levy (1.6) el «foco» fruncía y entrecerraba un ojo: se leía enojado, el defecto
  // que el retrato no tiene. Medido en la hoja de expresiones del 4 oct (2d/iter-07).
  thinking: ['duda', { blendWith: 'calida', amount: 0.5 }],
  // Hablar: cálido con un pelo de énfasis; el acento lo ponen los golpes de voz (onsets del rig levantan
  // las cejas en cada sílaba fuerte). Con énfasis 0.22 y la ganancia 1.6 de Levy las cejas quedaban
  // sostenidas arriba toda la frase (0.54-1.02, trace de iter-10): cara de sorpresa, no de conversación.
  // iter-21: sin énfasis de fondo; subir la ceja abre el ojo en este rig, así que el reposo del habla
  // se queda cerca del retrato y solo las sílabas fuertes la levantan.
  speaking: ['calida'],
}

export function LevyFace({ className = '', status = 'idle', engineRef, segmentsRef, voiceRef, framing = 'portrait', agent = 'levy', vivo: vivoPedido }: {
  agent?: CaraAgente
  /** La cara de los videos (oficial + atlas + movimiento del 3D). Live la decide por su preferencia (13 nov 2026); sin
   *  prop, manda la bandera `levyVivo` como antes (el sello del chat y el Command Center no cambian). */
  vivo?: boolean
  className?: string
  /** `medio` (18 nov 2026, «como en YouTube»): plano medio con el cuerpo y el estudio de los videos. Solo Levy con la cara de los
   *  videos lo tiene; los demás caen al encuadre `camera`. */
  framing?: 'portrait' | 'camera' | 'medio'
  voiceRef?: RefObject<LivePcmPlayer | null>
  status?: LoopStatus
  engineRef?: RefObject<AudioEngine | null>
  segmentsRef?: RefObject<{ text: string }[]>
}) {
  const cara = CARAS[agent]
  // Bandera Levy vivo: se lee al montar (localStorage), nunca en el servidor; apagada todo queda como antes.
  const [banderaVivo, setBanderaVivo] = useState(false)
  useEffect(() => { setBanderaVivo(levyVivoActivo()) }, [])
  // Atlas de cabeza (prueba, apagada): la cabeza gira e inclina con campos de LivePortrait en vez del parallax de profundidad.
  const [cabezaLP, setCabezaLP] = useState(false)
  useEffect(() => { setCabezaLP(cabezaLPActiva()) }, [])
  const vivoOn = vivoPedido ?? banderaVivo
  const vivo = vivoOn ? cara.vivo ?? null : null
  const retrato = vivo?.retrato ?? cara.retrato
  // Plano medio: la cabeza viva (rig con opacidad) sobre el cuerpo de los videos, en el estudio del canal.
  const medio = framing === 'medio' && agent === 'levy' && !!vivo
  const encuadre: 'portrait' | 'camera' | 'medio' = medio ? 'medio' : framing === 'medio' ? 'camera' : framing
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const figuraRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLCanvasElement>(null)
  const brazosRef = useRef<HTMLCanvasElement>(null)
  const cuerpoRef = useRef<HTMLImageElement>(null)
  const fondoRef = useRef<HTMLImageElement>(null)
  const ladoRef = useRef(0)
  const statusRef = useRef(status)
  const despertarRef = useRef<(() => void) | null>(null)
  const [ready, setReady] = useState(false)
  const [ambiente, setAmbiente] = useState<string | null>(null)
  const [motionRevision, setMotionRevision] = useState(0)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setMotionRevision(value => value + 1)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => { statusRef.current = status; despertarRef.current?.() }, [status])

  // Pantalla completa sin recortar el retrato: el cuadro se ve entero y a los lados sigue el propio
  // borde del arte, estirado y desvanecido hacia el fondo, sin una costura donde termina el cuadrado.
  useEffect(() => {
    if (encuadre !== 'camera') return
    let vivo = true
    void ambienteDe(retrato).then(url => { if (vivo) setAmbiente(url) }).catch(() => {})
    return () => { vivo = false }
  }, [encuadre, retrato])

  // Plano medio: el lado de la caja del cuerpo en px (la transformación de cada cuadro va en la rejilla de 1024 del cuerpo).
  useEffect(() => {
    const el = figuraRef.current
    if (!medio || !el) return
    ladoRef.current = el.clientWidth
    const ro = new ResizeObserver(([e]) => { ladoRef.current = e.contentRect.width })
    ro.observe(el)
    return () => ro.disconnect()
  }, [medio])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let alive = true
    let rig: Rig | undefined
    let clips: ClipsVivos | null = null
    let brazos: BrazosVivos | null = null
    let frame = 0
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let lastPointer = -1e9, pointer: [number, number] = [0, 0]
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const side = Math.min(r.width, r.height)
      if (!side) return
      const x = (e.clientX - (r.left + r.width / 2)) / (side / 2), y = (e.clientY - (r.top + r.height / 2)) / (side / 2)
      const k = Math.min(1, 1.25 / Math.max(1e-6, Math.hypot(x / 1.25, y / 1.1)))
      pointer = [x * Math.min(1, k), y * Math.min(1, k)]
      // Volver tras un rato quieto es una reacción de orientación (parpadeo y tirón corto hacia ti).
      if (rig && performance.now() - lastPointer > 2500) rig.life.notePointer(pointer[0] + 0.01, pointer[1])
      lastPointer = performance.now()
      despertarRef.current?.()   // dormida con la app sin foco: el puntero encima la despierta
    }
    let bajaReposo = () => {}
    let espera: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      cancelAnimationFrame(frame); clearTimeout(espera)
      bajaReposo(); bajaReposo = () => {}; despertarRef.current = null
      window.removeEventListener('pointermove', onPointer)
      if (clips) { clips.dispose(); clips = null; canvas.style.visibility = ''; if (clipRef.current) clipRef.current.style.visibility = '' }
      if (brazos) { brazos.dispose(); brazos = null; if (brazosRef.current) brazosRef.current.style.visibility = ''; if (cuerpoRef.current) cuerpoRef.current.style.visibility = '' }
      if (rig) { rig.speech = null; rig.dispose(); rig = undefined }
      setReady(false)
    }
    const start = async () => {
      stop()
      if (!alive || motion.matches) return
      // El sello del chat vacío (44 px) no compite con el primer pintado: el retrato ligero ya está puesto y el
      // rig (código + texturas, ~3 MB) entra cuando la página terminó de cargar y el navegador está libre.
      if (encuadre === 'portrait') await despuesDeCargar()
      if (!alive || motion.matches) return
      try {
        const [module, visemes, geometry, manifiesto, gestosBrazos] = await Promise.all([
          importUrl(`${cara.base}/rig/rig.js`), importUrl<Visemes>(`${cara.base}/rig/visemes.js`), importUrl<GeometryModule>(`${cara.base}/rig/geometry.js`),
          medio ? fetch(`${CLIPS_URL}/clips.json`).then(r => (r.ok ? r.json() as Promise<Manifiesto> : null)).catch(() => null) : null,
          medio ? fetch(`${BRAZOS_URL}/gestos.json`).then(r => (r.ok ? r.json() as Promise<ManifiestoBrazos> : null)).catch(() => null) : null,
        ])
        if (!alive || motion.matches || rig) return
        // Plano medio: el lienzo es solo la cabeza (opacidad de los videos, mate.png) y el cuerpo respira entero por fuera, rígido;
        // sin `torso` el cuello del rig no se desliza contra el cuello del cuerpo en la costura.
        rig = new module.Rig(canvas, { base: cara.base, geo: { ...(geometry.default as object), art: vivo?.arte ?? cara.arte }, capas: vivo ? { ...CAPAS, atlas: vivo.atlas, ...(medio ? { mate: MEDIO_MATE, torso: 0 } : {}), ...(cabezaLP ? { cabeza: MEDIO_CABEZA_LP } : {}) } : CAPAS })
        ;(canvas as HTMLCanvasElement & { __rig?: Rig }).__rig = rig   // el banco de pruebas lee rig.params
        // La superficie es dueña de la mirada: el puntero manda cuando se mueve, y quieto la mirada
        // regresa a ti (contacto visual), en vez de quedarse clavada en el cuadro de texto.
        rig.pointerLock = true
        window.addEventListener('pointermove', onPointer, { passive: true })
        // Plano medio: los clips de la cara completa para escuchar y pensar (levy-clips.ts). Se cortan con el rig solo en
        // cuadros neutros; sin clips (o sin requestVideoFrameCallback) se queda el rig de siempre.
        const lienzoClip = clipRef.current, figura0 = figuraRef.current
        if (medio && manifiesto && lienzoClip && figura0) {
          try {
            clips = new ClipsVivos(lienzoClip, manifiesto, figura0)
            clips.onVisible = (v) => { lienzoClip.style.visibility = v ? 'visible' : 'hidden'; canvas.style.visibility = v ? 'hidden' : 'visible' }
            ;(canvas as HTMLCanvasElement & { __clips?: ClipsVivos }).__clips = clips   // el banco de pruebas lee los cortes
          } catch (error) { console.warn('[LevyFace] sin clips:', error); clips = null }
        }
        // Plano medio: los gestos de brazos del catálogo de los videos (levy-brazos.ts); el cuerpo estático y el clip se cambian en
        // el reposo, que es el mismo en los dos.
        const lienzoBrazos = brazosRef.current, cuerpoImg = cuerpoRef.current
        if (medio && gestosBrazos && lienzoBrazos && cuerpoImg && figura0) {
          try {
            brazos = new BrazosVivos(lienzoBrazos, gestosBrazos, figura0)
            brazos.onVisible = (v) => { lienzoBrazos.style.visibility = v ? 'visible' : 'hidden'; cuerpoImg.style.visibility = v ? 'hidden' : 'visible' }
            ;(canvas as HTMLCanvasElement & { __brazos?: BrazosVivos }).__brazos = brazos
          } catch (error) { console.warn('[LevyFace] sin gestos de brazos:', error); brazos = null }
        }
        let clipDesde = 0
        let lastStatus: LoopStatus | undefined
        let lastCara: LoopStatus | undefined
        let statusSince = 0
        let lastSegment = ''
        let voz: { track: VoiceTrack; elapsed: number; until: number } | null = null
        const calibrador = new Calibrador()
        // Pausas dentro de la voz: al entrar en una (>220 ms de silencio en el PCM) Levy asiente apenas y
        // vuelve a mirarte; es lo que hace quien habla al cerrar una idea (juez iter-05: «presencia»).
        let pausaDesde = -1, pausaMarcada = false, miradaHasta = 0
        let lastSpeechEnd = -1e9
        let pensar = { hasta: 0, fuera: false, lado: cara.lado as number }
        // Levy vivo: el movimiento del 3D (cabeza, cejas, parpadeo ~15/min) con el reloj real, frase a frase.
        const mov = vivo ? new MovimientoVivo() : null
        // Plano medio: los gestos de cuerpo del catálogo de los videos que caben en una imagen rígida (inclinarse, énfasis).
        const cuerpo = medio ? new CuerpoVivo() : null
        let cabeza3d: ReturnType<MovimientoVivo['tick']> | null = null
        const frases = new WeakMap<VoiceTrack, { id: string; chars: number; rev: number }>()
        let nFrase = 0
        // Eficiencia (6 oct 2026): la cara pintaba 60 cuadros por segundo siempre, también con la app en segundo
        // plano. Quieta y con la app sin foco (u oculta) se duerme del todo; quieta y a la vista, el sello del chat
        // vacío va a 30 cuadros (la vida va con el reloj real, no con los cuadros). Hablando o con el puntero
        // encima, a todo lo que da.
        let dormida = false
        const despertar = () => {
          if (!dormida || !alive || !rig) return
          dormida = false
          rig.despertar()
          clearTimeout(espera)
          frame = requestAnimationFrame(tick)
        }
        despertarRef.current = despertar
        bajaReposo = alCambiarEstado(despertar)
        const tick = () => {
          if (!alive || !rig) return
          if (rig.ready) setReady(true)
          const now = performance.now()
          // El banco de pruebas puede fijar el estado (canvas.__estado) para ver escuchar y pensar sin mandar nada al chat.
          const estado = (canvas as HTMLCanvasElement & { __estado?: LoopStatus }).__estado ?? statusRef.current
          const quieta = estado === 'idle' && !voz && !voiceRef?.current?.position?.track && !rig.speech
            && now - lastSpeechEnd > 2500 && now - lastPointer > 2600
          const ventana = estadoVentana()
          if (ventana === 'oculta' || (ventana === 'sin-foco' && quieta)) { clips?.dormir(); brazos?.dormir(); rig.pausado = true; dormida = true; return }
          const tope = encuadre === 'portrait' && quieta
          rig.fpsMax = tope ? 30 : 0
          // Entre cláusulas Live pasa ~60 ms por «pensando» (no hay audio sonando). Sin esta retención la cara
          // saltaba a pensar, subía la ceja y desviaba la mirada a media respuesta (trace iter-25, +0.5 s).
          const hablandoHace = now - Math.max(lastSpeechEnd, voz ? now : -1e9)
          const state: LoopStatus = estado === 'thinking' && hablandoHace < 1500 ? 'speaking' : estado
          // ---- clips (plano medio) ----
          // Escuchar y pensar con la cara completa horneada; ninguno mientras haya voz sonando, encargada (aparece en
          // `timings` antes de sonar) o recién terminada. Antes de entrar, el rig se queda 350 ms en la pose del retrato y
          // sin parpadeo a medias: el primer cuadro del clip es ese mismo retrato.
          let enClip = false
          if (clips) {
            const v = voiceRef?.current
            const pendiente = !!v?.timings?.some(t => t.firstSoundAt == null && !t.failed)
            const deseado = clipDeseado({ estado: state, vozActiva: pendiente || !!v?.position?.track || !!voz || now - lastSpeechEnd < 800 })
            // en el descanso entre vueltas (levy-clips.ts) el rig hace su propio gesto; al volver, otra vez 350 ms en el retrato
            const descansa = clips.descansando
            if (!deseado || descansa) clipDesde = 0; else if (!clipDesde) clipDesde = now
            const parpado = rig.params.blink as number[] | undefined
            clips.pedir(deseado, !!clipDesde && now - clipDesde > 350 && (parpado ? Math.max(parpado[0] ?? 0, parpado[1] ?? 0) : 0) < 0.04)
            enClip = (!!deseado && !descansa) || clips.ocupado
          }
          // Al cerrar la respuesta se queda ~2.5 s con la calidez del habla (sonrisa mínima) y luego vuelve al
          // retrato: terminar de hablar y quedar en neutro de golpe se lee frío. Con un clip, el rig (escondido) se queda en el
          // retrato: neutro y mirándote, para que el corte de vuelta no salte.
          const gesto: LoopStatus = enClip ? 'idle' : state === 'idle' && hablandoHace < 2500 ? 'speaking' : state
          if (gesto !== lastCara) {
            lastCara = gesto
            const [nombre, mezcla] = CARA_DE[gesto] ?? CARA_DE.idle
            rig.emotion(nombre, mezcla)
          }
          if (state !== lastStatus) {
            const [nombre, mezcla] = CARA_DE[gesto] ?? CARA_DE.idle
            rig.emotion(nombre, mezcla)
            // Al empezar a hablar la cara llega rápido: con el resorte de «cálida» (2.6 Hz) la ceja de pensar
            // tardaba ~0.7 s en bajar y los ojos arrancaban la frase abiertos de más (iter-26).
            if (state === 'speaking' && rig.emo) rig.emo.hz = 6
            lastStatus = state
            statusSince = now
            pensar = { hasta: now + 500, fuera: false, lado: cara.lado }
          }

          // ---- mirada ----
          const moviendo = now - lastPointer < 2600
          let mirada: [number, number]
          if (state === 'thinking') {
            // Pensar es desviar la mirada arriba y a un lado, y volver a ti de vez en cuando. Una pose
            // sostenida minutos se lee como cara congelada; esta alternancia, como alguien pensando.
            if (now > pensar.hasta) {
              const fuera = !pensar.fuera
              const lado = fuera && Math.random() < 0.3 ? -pensar.lado : pensar.lado
              pensar = { fuera, lado, hasta: now + (fuera ? 1800 + Math.random() * 2200 : 900 + Math.random() * 1300) }
            }
            mirada = pensar.fuera ? [pensar.lado * 0.62, -0.38] : moviendo ? pointer : [0, 0]
          } else if (state === 'listening') {
            // Escucha: a ti. Si el puntero se mueve, lo sigue con los ojos (la cabeza apenas).
            mirada = moviendo ? [pointer[0] * 0.8, pointer[1] * 0.8] : [0, 0]
          } else {
            mirada = moviendo ? pointer : [0, 0]
          }
          rig.mouse = mirada
          if (enClip) { rig.mouse = [0, 0]; rig.life.mouseIdle = 0; contactoVisual(rig) }
          // Contacto visual sostenido tras una pausa o al terminar: anula por un momento el desvío de mirada
          // espontáneo (la mirada sigue con sus microsacadas porque solo se fija el objetivo, no el ojo).
          if (now < miradaHasta && state !== 'thinking') { rig.mouse = moviendo ? pointer : [0, 0]; rig.life.mouseIdle = 0; (rig.life as { avertS?: { clock: number } }).avertS && contactoVisual(rig) }
          // Atención sostenida mientras hay alguien (puntero reciente, conversación en curso); sin nadie
          // durante un rato, `life` deja que la mirada pasee sola, como en el onboarding.
          if (moviendo || state !== 'idle' || now - statusSince < 30000 || now - lastPointer < 45000) rig.life.mouseIdle = 0

          // ---- boca ----
          const position = voiceRef?.current?.position
          ;(canvas as HTMLCanvasElement & { __pos?: unknown; __voz?: unknown }).__pos = position
          ;(canvas as HTMLCanvasElement & { __voz?: unknown }).__voz = voiceRef?.current
          if (position?.track) {
            // Voz de Live: la boca lee el PCM que está sonando y su timeline alineada a ese audio.
            if (!voz || voz.track !== position.track) {
              const track = position.track
              const continuo = now - lastSpeechEnd < 1500 || !!voz
              const arranque = !continuo
              const tl = visemes.textToVisemes(position.text)
              const holder = { track, elapsed: position.elapsed, until: now + 350 }
              let map: Float32Array | null = null
              const utt: Utterance = {
                meta: { events: tl.events, total: tl.total, audioDur: tl.total / 1000, text: position.text },
                get t() {
                  const p = voiceRef?.current?.position
                  if (!map && p?.track === track && p.complete) map = align(tl, track)
                  const duration = p?.track === track ? (p.complete ? p.duration : Math.max(p.duration, position.text.length * 0.035 + 0.25)) : holder.elapsed
                  return timelineMs(map, tl, holder.elapsed, duration) / 1000
                },
                get paused() { return false },
                // La boca se adelanta ~25 ms al sonido, como en una cara real (el gesto precede a la voz).
                amp: () => energyAt(track, holder.elapsed + 0.025),
                // Con energía exacta la boca puede cerrar de verdad en consonantes (piso 0.12) y abrir algo
                // más en vocales fuertes (×1.2, con el techo suave del rig): la «a» y la «o» se distinguen.
                ampFloor: 0.12,
                // Arranque (juez iter-06: «Ho-la» abría en una O negra grande con ojos de sorpresa): cuando
                // empieza a hablar desde el silencio, la primera sílaba entra al 60 % y sube en ~300 ms, y
                // el primer golpe de voz no levanta la ceja. Entre cláusulas seguidas no hay rampa.
                get jawGain() { return arranque ? 1.2 * Math.min(1, 0.6 + 0.4 * holder.elapsed / 0.3) : 1.2 },
                // Ojos al hablar iguales que en reposo (juez iter-04): sin ceja de fondo y con medio acento.
                browSpeak: 0,
                get browPulse() { return vivo || (arranque && holder.elapsed < 0.3) ? 0 : 0.5 },
                // Levy vivo: con la alineación por carácter la boca son los campos del atlas, en el segundo de audio que
                // suena (holder.elapsed, ya calibrado). La pista se rehace si llega más alineación o más audio.
                // 18 nov: con el atlas POR CANALES (atlas.json v2) la boca es la de los VIDEOS (levy-boca.ts, puerto de
                // boca_nueva.py): fonemas → abre, ancho, redondo, cierra → teselas de la rejilla horneada con LivePortrait.
                pesosAtlas: vivo ? (teselas: string[]) => {
                  const al = track.alineacion
                  if (!al?.chars.length) return null
                  const f = features(track)
                  const dur = Math.max(f.frames / 100, al.ends[al.ends.length - 1] + 0.3)
                  const man = rig?.atlas
                  if (esAtlasCanales(man)) {
                    if (!cacheBoca || cacheBoca.chars !== al.chars.length || cacheBoca.rev !== (al.rev ?? 0) || (f.frames - cacheBoca.frames > 25)) {
                      cacheBoca = { chars: al.chars.length, rev: al.rev ?? 0, frames: f.frames, pista: pistaBoca(al, { rms: f.rms, frames: f.frames }, dur) }
                    }
                    // La hora de la voz se lee AL PINTAR (el rig puede pintar antes que este tick: con holder.elapsed la boca iba
                    // ~15 ms tarde, medido el 18 nov) y se adelanta un cuadro de pantalla: lo que se pinta ahora se ve en el
                    // siguiente refresco. Es lo que hace el video, cuyo cuadro muestra la boca del centro de su intervalo.
                    const pos = voiceRef?.current?.position
                    const ahora = pos?.track === track ? pos.elapsed + calibrador.offset : holder.elapsed
                    const c = canalesEn(cacheBoca.pista, ahora + PANTALLA_S)
                    ;(rig as Rig & { __canales?: unknown }).__canales = c   // el banco de pruebas lee lo que pidió la boca
                    return pesosCanales(c, man)
                  }
                  if (!cache || cache.chars !== al.chars.length || cache.rev !== (al.rev ?? 0) || (f.frames - cache.frames > 50)) {
                    cache = { chars: al.chars.length, rev: al.rev ?? 0, frames: f.frames, pista: pista(fonemas(al, { rms: f.rms, frames: f.frames }), dur) }
                  }
                  return pesosAtlas(cache.pista, holder.elapsed, teselas)
                } : undefined,
              }
              let cache: { chars: number; rev: number; frames: number; pista: Pista } | null = null
              let cacheBoca: { chars: number; rev: number; frames: number; pista: PistaBoca } | null = null

              rig.speakTimeline(utt)
              // Una toma de aire por arranque de habla, no una por cláusula: entre cláusulas seguidas no se respira.
              if (continuo) rig._breathEv = null
              voz = holder
            }
            calibrador.observar(position.track, position.elapsed, position.level, now)
            voz.elapsed = position.elapsed + calibrador.offset
            const [energia] = energyAt(position.track, voz.elapsed)
            if (energia < 0.08) {
              if (pausaDesde < 0) pausaDesde = now
              if (!pausaMarcada && now - pausaDesde > 220) {
                pausaMarcada = true
                rig.pulse('headNod', 2.2, 0.6)
                miradaHasta = now + 900
              }
            } else { pausaDesde = -1; pausaMarcada = false }
            ;(canvas as HTMLCanvasElement & { __off?: number }).__off = calibrador.offset
            voz.until = now + 350
            // Levy vivo: cada frase con alineación registra sus gestos en el reloj absoluto (se rehace si crece)
            const al = position.track.alineacion
            if (mov && al?.chars.length) {
              const tr = position.track
              let fr = frases.get(tr)
              if (!fr) { fr = { id: `f${nFrase++}`, chars: 0, rev: 0 }; frases.set(tr, fr) }
              if (fr.chars !== al.chars.length || fr.rev !== (al.rev ?? 0)) {
                fr.chars = al.chars.length; fr.rev = al.rev ?? 0
                const energia = (a: number, b: number) => { let s = 0, n = 0; for (let t = a; t <= b; t += 0.01) { s += energyAt(tr, t)[0]; n++ } return n ? s / n : 0 }
                // en frases de 1.5-3.5 s, como el 3D: cada idea su gesto (la cláusula de Live puede traer varias)
                const t0 = now / 1000 - voz.elapsed
                frasesDe(palabras(al)).forEach((f, k) => { mov.frase(`${fr!.id}-${k}`, t0, f.texto, f.palabras, energia); cuerpo?.frase(`${fr!.id}-${k}`, t0, f.palabras); brazos?.agenda.frase(`${fr!.id}-${k}`, t0, f.palabras, now / 1000) })
              }
            }
          } else if (voz) {
            // Hueco entre cláusulas (~60 ms) o fin: la boca cierra con la energía (cero) y solo se suelta
            // la voz si el silencio dura. Cortar en cada bajón de nivel reiniciaba la boca y la respiración.
            voz.elapsed += 1 / 60
            if (now > voz.until) {
              rig.speech = null; rig.exhale(0.6); voz = null; lastSpeechEnd = now
              // fin de la respuesta: asiente una vez y se queda mirándote
              rig.pulse('headNod', 2.6, 0.7); miradaHasta = now + 1500
            }
          } else if (engineRef) {
            // Command Center: motor de audio propio, sin PCM a la mano; se conserva el camino estimado.
            const engine = engineRef.current
            const index = engine?.spokenSegments ?? 0
            const text = segmentsRef?.current[index]?.text ?? ''
            const key = `${index}:${text}`
            if (state === 'speaking' && text && engine && engine.ttsLevel > 0.005) {
              if (lastSegment !== key || !rig.speech) {
                const timeline = visemes.textToVisemes(text)
                rig.speakTimeline({
                  meta: { ...timeline, audioDur: timeline.total / 1000, text },
                  get t() { return (engine.activeFraction ?? 0) * timeline.total / 1000 },
                  get paused() { return false },
                  amp: () => { const level = engine.ttsLevel ?? 0; return [level, level] },
                })
                lastSegment = key
              }
            } else { if (rig.speech) lastSpeechEnd = now; rig.speech = null; lastSegment = '' }
          }
          if (mov) {
            // Del 3D al rig 2D, como deformación: asentir = la cabeza baja unos px y su profundidad se inclina; ladeo =
            // rotación en el cuello; giro = parallax de profundidad (giro: false sigue, no hay vista ¾ fundida).
            const g = mov.tick(now / 1000)
            cabeza3d = g
            const inc = g.cabeceo + g.inclina
            // Ganancias medidas con el juez por píxel de v3 sobre la captura (vivo/LEEME.md): la ceja de Levy vive pegada al
            // párpado: el acento se topa en 0.8 (más abre el ojo de sorpresa; hoja de cejas en vivo/hojas).
            const brow: [number, number] = [Math.min(0.8, g.ceja * GANANCIA.ceja), Math.min(0.8, g.ceja * GANANCIA.ceja) * 0.94]
            const C = rig.cabeza
            if (C) {
              // atlas de cabeza (prueba): giro e inclinación del 3D como poses de LivePortrait; el ladeo sigue siendo la rotación del rig
              rig.extra = { headShift: [0, 0], headRot: g.ladeo * GANANCIA.ladeo, parallax: [0, 0], brow, blink: g.parpadeo,
                cabeza: [indiceRejilla(C.yaw, g.giro * 57.3 * GANANCIA_LP.giro), indiceRejilla(C.pitch, inc * 57.3 * GANANCIA_LP.inclina)] }
            } else rig.extra = { headShift: [0, inc * GANANCIA.asiente], headRot: g.ladeo * GANANCIA.ladeo, parallax: [g.giro * GANANCIA.giro, inc * GANANCIA.inclina], brow, blink: g.parpadeo }
          }
          brazos?.tick(now / 1000)
          const figura = figuraRef.current
          if (medio && figura) {
            // Plano medio: la figura entera (cuerpo y cabeza juntos, sin costura) respira con el rig, se balancea con la cabeza,
            // se inclina o marca el énfasis con los gestos de cuerpo y lleva la cámara viva de los videos. Todo rígido.
            const tt = now / 1000, c = cuerpo ? cuerpo.cuerpo(tt) : { escala: 1, dy: 0 }
            figura.style.transform = cssMatriz(transformCuerpo({ t: tt, respira: Number(rig.params.breath ?? 0), ladeo: cabeza3d?.ladeo, giro: cabeza3d?.giro, escala: c.escala, dy: c.dy }), ladoRef.current)
            const fondo = fondoRef.current
            if (fondo) { const [dx, dy] = derivaCamara(tt), k = 0.15 * ladoRef.current / 1024; fondo.style.transform = `translate(${(dx * k).toFixed(2)}px,${(dy * k).toFixed(2)}px) scale(1.03)` }
          }
          // Con tope, este reloj también duerme entre cuadros (el rig pinta a 30; a 60 solo mantenía vivo el hilo).
          if (tope) espera = setTimeout(() => { frame = requestAnimationFrame(tick) }, 25)
          else frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      } catch (error) {
        console.warn('[LevyFace] Static portrait fallback:', error)
        stop()
      }
    }
    void start()
    return () => {
      alive = false
      stop()
    }
  }, [engineRef, segmentsRef, voiceRef, motionRevision, cara, encuadre, vivo, medio, cabezaLP])

  if (encuadre === 'medio') {
    // Como en YouTube: el estudio de la rotación del canal, el cuerpo de los videos (torso y brazos en reposo, sin cabeza) y la
    // cabeza viva del rig donde la pone el compositor de los videos. Antes de que cargue el rig, el retrato recortado en su sitio;
    // al cargar se cambia de golpe, sin fundido (una sola cabeza por cuadro).
    const caja = cajaCuerpo(), pct = (v: number) => `${(v * 100).toFixed(4)}%`
    return (
      <div className={`relative isolate overflow-hidden bg-[#140d08] [container-type:size] ${className}`} role="img" aria-label={cara.nombre} data-levy-face={ready ? 'animated' : 'portrait'} data-levy-encuadre="medio">
        <img ref={fondoRef} src={MEDIO_FONDO} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 size-full object-cover" style={{ transform: 'scale(1.03)' }} />
        <div ref={figuraRef} aria-hidden="true" className="absolute [transform-origin:0_0] will-change-transform" style={{ '--u': caja.u, width: caja.lado, height: caja.lado, top: caja.top, left: caja.left } as React.CSSProperties}>
          <img ref={cuerpoRef} src={MEDIO_CUERPO} alt="" draggable={false} className="absolute inset-0 size-full" />
          {/* la cabeza va antes en el DOM (el primer canvas de la cara es el rig, como siempre) y encima por z-index */}
          <div className="absolute z-[2]" style={{ left: pct(RETRATO_EN_CUERPO.x), top: pct(RETRATO_EN_CUERPO.y), width: pct(RETRATO_EN_CUERPO.lado), height: pct(RETRATO_EN_CUERPO.lado) }}>
            <img src={MEDIO_CABEZA} alt="" draggable={false} className={`absolute inset-0 size-full ${ready ? 'opacity-0' : 'opacity-100'}`} />
            <canvas key={motionRevision} ref={canvasRef} width={720} height={720} className={`absolute inset-0 size-full ${ready ? 'opacity-100' : 'opacity-0'}`} />
            {/* clips de escuchar y pensar (levy-clips.ts): se ve este o el rig, nunca los dos */}
            <canvas key={`clip-${motionRevision}`} ref={clipRef} width={720} height={720} className="invisible absolute inset-0 size-full" />
          </div>
          {/* gestos de brazos (levy-brazos.ts): se ve este o el cuerpo estático, nunca los dos; debajo de la cabeza */}
          <canvas key={`brazos-${motionRevision}`} ref={brazosRef} width={1024} height={1024} className="invisible absolute inset-0 z-[1] size-full" />
        </div>
      </div>
    )
  }
  if (encuadre === 'camera') {
    // El cuadro del retrato centrado a toda la altura (o a todo el ancho en vertical), con el ambiente
    // detrás. Imagen fija y lienzo comparten exactamente el mismo cuadro: no hay salto al cargar.
    return (
      <div className={`relative isolate overflow-hidden bg-[#050109] [container-type:size] ${className}`} role="img" aria-label={cara.nombre} data-levy-face={ready ? 'animated' : 'portrait'}>
        {ambiente && <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[min(100cqw,100cqh)] w-[calc(3*min(100cqw,100cqh))] bg-no-repeat [background-size:100%_100%] [mask-image:linear-gradient(to_bottom,transparent,black_6%,black_90%,transparent)]" style={{ backgroundImage: `url(${ambiente})` }} />}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[min(100cqw,100cqh)] [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent),linear-gradient(to_bottom,transparent,black_6%,black_90%,transparent)] [mask-composite:intersect]">
          <img src={retrato} alt="" className="absolute inset-0 size-full" draggable={false} />
          <canvas key={motionRevision} ref={canvasRef} width={720} height={720} aria-hidden="true" className={`absolute inset-0 size-full transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} />
        </div>
      </div>
    )
  }
  return (
    <div className={`relative isolate aspect-square overflow-hidden rounded-full ${className}`} role="img" aria-label={cara.nombre} data-levy-face={ready ? 'animated' : 'portrait'}>
      <Retrato agente={agent} size="48px" prioridad className="absolute inset-0 size-full object-cover" />
      <canvas key={motionRevision} ref={canvasRef} width={720} height={720} aria-hidden="true" className={`absolute inset-0 size-full transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}

/** Resuelve cuando la página terminó de cargar y el navegador quedó libre (tope 4 s). */
function despuesDeCargar(): Promise<void> {
  return new Promise(resolve => {
    const libre = () => {
      const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (idle) idle(() => resolve(), { timeout: 4000 }); else window.setTimeout(resolve, 600)
    }
    if (document.readyState === 'complete') libre(); else window.addEventListener('load', libre, { once: true })
  })
}

/** Saca a `life` de un desvío de mirada en curso: el reloj de desvíos se adelanta a un punto sin evento. */
function contactoVisual(rig: Rig) {
  const life = rig.life as unknown as { avertS: { mean: number; clock: number; current: () => number; since: (n: number) => number } }
  const S = life.avertS
  if (S.since(S.current()) < 1.6) S.clock += 1.6
}

/**
 * Ambiente a los lados del cuadro: el arte ocupa el centro de una franja de 3:1 y cada fila se prolonga
 * con el color de su propio borde, desvanecido hacia el fondo y desenfocado. Así la luz violeta y los
 * hombros continúan suaves en lugar de cortarse en una línea vertical.
 */
const ambientes = new Map<string, Promise<string>>()
function ambienteDe(src: string) {
  let hecho = ambientes.get(src)
  if (hecho) return hecho
  hecho = new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const S = 256, W = S * 3
      const base = document.createElement('canvas'); base.width = S; base.height = S
      const b = base.getContext('2d', { willReadFrequently: true })!
      b.drawImage(img, 0, 0, S, S)
      const px = b.getImageData(0, 0, S, S).data
      const out = document.createElement('canvas'); out.width = W; out.height = S
      const o = out.getContext('2d')!
      const fila = o.createImageData(W, S)
      const fondo = [5, 1, 9]
      const borde = (y: number, x0: number) => { const c = [0, 0, 0]; for (let x = x0; x < x0 + 4; x++) for (let k = 0; k < 3; k++) c[k] += px[(y * S + x) * 4 + k] / 4; return c }
      for (let y = 0; y < S; y++) {
        const izq = borde(y, 0), der = borde(y, S - 4)
        for (let x = 0; x < W; x++) {
          let c: number[]
          if (x >= S && x < 2 * S) { const i = (y * S + (x - S)) * 4; c = [px[i], px[i + 1], px[i + 2]] }
          else {
            const d = x < S ? (S - x) / S : (x - 2 * S + 1) / S
            const e = x < S ? izq : der
            const f = Math.exp(-d * 2.6)
            c = e.map((v, k) => fondo[k] + (v - fondo[k]) * f)
          }
          const i = (y * W + x) * 4
          fila.data[i] = c[0]; fila.data[i + 1] = c[1]; fila.data[i + 2] = c[2]; fila.data[i + 3] = 255
        }
      }
      o.putImageData(fila, 0, 0)
      // Desenfoque solo de los lados: el centro lo tapa el lienzo nítido, pero el borde no debe vibrar.
      const blur = document.createElement('canvas'); blur.width = W; blur.height = S
      const bl = blur.getContext('2d')!
      bl.filter = 'blur(10px)'; bl.drawImage(out, 0, 0)
      bl.filter = 'none'; bl.drawImage(out, S, 0, S, S, S, 0, S, S)
      resolve(blur.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error('sin retrato'))
    img.src = src
  })
  ambientes.set(src, hecho)
  return hecho
}
