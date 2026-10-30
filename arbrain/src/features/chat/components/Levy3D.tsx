'use client'

// Levy en 3D (4 oct 2026). Es el avatar del estudio de personajes (docs/agents/personajes-v5,
// mundo-v6): paquete levy 3.2.2, 52 ARKit + 15 visemas, esqueleto Mixamo. Se copió sin cambios
// a public/levy-3d/ y aquí solo se anima lo mínimo: respiración, parpadeo, mirada al puntero y
// boca/cabeza al hablar. La boca sigue el nivel real del audio del reproductor de Live
// (LivePcmPlayer.level), no un audio propio. Si no hay WebGL o el GLB no carga, avisa por
// onFail y quien lo monta cae al LevyFace 2.5D.

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LivePcmPlayer } from '@/features/live/voice/player'
import { energyAt } from '@/features/chat/lib/levy-lipsync'
import type { Bone, Mesh, Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const LEVY_3D_URL = '/levy-3d/levy-v3-2-2-n34.glb'

/** Mirada de cada paquete del estudio (package.look): `paint` = cuánto de la ilustración horneada
 *  se emite, `lit` = cuánta luz real recibe. Más `lit` y menos `paint` = menos contraste. */
export interface Levy3DLook { paint: number; lit: number; hideLipStrips?: boolean; /** Ganancia de mandíbula y de visemas: cada paquete trae su rango (performanceProfile.gains). */ jaw?: number; vis?: number
  /** Escenario: `calido` (por defecto) o `violeta` = el del retrato (fondo negro opaco, halo violeta detrás de la cabeza, luz de borde morada). */
  stage?: 'calido' | 'violeta'
  /** Cierre de labios en reposo (mouthClose): tapa la ranura de la malla con la boca quieta; se suelta al abrir la mandíbula. */
  restClose?: number
  /** Cejas en reposo (browInnerUp / browOuterUp): el paquete trae 0.14 / 0.25; Levy relaja el ceño con interior alto y exterior quieto. */
  browInner?: number; browOuter?: number
  /** Separación de labios al hablar (mouthLowerDown/mouthUpperUp ∝ mandíbula): en mallas donde jawOpen baja el mentón sin abrir la boca. */
  lipPart?: number
  /** Fracción del labio superior en la separación (mouthUpperUp = lipPart×mandíbula×lipUpper; 0.75 por defecto). 0 = labio superior fijo y solo baja el inferior. */
  lipUpper?: number
  /** Visemas que rota al hablar (por defecto aa, E, O, I, U, aa, DD, nn). Levy quita la U: abulta los labios en esta malla. */
  vowels?: string[]
  /** Intervalo entre parpadeos en reposo, en segundos [mín, máx] (por defecto [2, 5.5]). */
  blinkEvery?: [number, number]
  /** Gestos con intención: microsonrisa al terminar una frase (`endSmile`, se suma a la sonrisa ~1.5 s) y ceja exterior que acompaña un énfasis de la voz (`emphasisBrow`). */
  gestures?: { endSmile: number; emphasisBrow: number }
  /** Respiración visible (opcional): los hombros suben al inhalar (rad en LeftShoulder/RightShoulder) y el pecho se abre (rad extra en Spine2). Sin el campo, todo igual. */
  breathe?: { shoulders: number; chest?: number }
  /** Energía de la boca desde la pista de la frase (`energyAt`, la del 2D) en vez del analizador: exacta y sin retraso; `lead` adelanta la boca al sonido (s). */
  trackEnergy?: { lead: number }
  /** Reposo propio del personaje (sustituye los valores fijos del animador; sin él, los de siempre): `mouthSmile`,
   *  `speakSmile` (al hablar/escuchar), `eyeSquint`, `eyeBlink` (piso del párpado), `eyeWide`, `cheekSquint`,
   *  `mouthPress`, `browDown`. Sensei: mirada firme con párpado a media altura y boca recta, como su retrato. */
  rest?: Partial<Record<'mouthSmile' | 'speakSmile' | 'eyeSquint' | 'eyeBlink' | 'eyeWide' | 'cheekSquint' | 'mouthPress' | 'browDown', number>>
  /** Quietud del personaje: multiplica el vaivén de reposo y el cabeceo al hablar (1 = el de siempre). `blinkMs`: duración del parpadeo (160 por defecto). */
  sway?: number; blinkMs?: number
  /** Aplasta en vertical los huesos de los ojos cerca del cierre del parpadeo (0-1, curva blink⁴): en mallas cuyo párpado no tapa el globo, el iris no asoma con el ojo cerrado. */
  blinkSquash?: number
  /** Cuánto sigue la cabeza (no los ojos) al puntero y a la fase: 1 = lo de siempre. */
  headFollow?: number
  /** Encuadre en Live (fill): alto visible en H (3.2 por defecto) y cuánto bajan los ojos del centro (0.25 H). Menos `vis` = cara más grande. */
  frame?: { vis?: number; down?: number }
  /** Interior de la boca (cavidad y tiras internas del labio): color y emisivo lineales. Sin esto se ve como grieta negra al hablar. */
  oral?: { color: [number, number, number]; emissive: [number, number, number] }
  /** Curva de boca con el nivel real de la voz (llega hasta 1.0): abre solo por encima de `gate`, con `gain` y tope `max`,
   *  sin piso, para que cierre en pausas y consonantes. Sin ella, la de siempre (0.12 + nivel×2.2, × jaw). */
  jawCurve?: { gate: number; gain: number; max: number; /** Modo sílaba: abre según el envolvente rápido por encima de una base lenta (×syllable), así cierra en los valles aunque el nivel venga saturado. */ syllable?: number; /** Envolvente asimétrico: subida y caída por segundo (p. ej. 50/12 = ataque rápido, caída de ~80 ms). */ attack?: number; release?: number }
  /** Parpadeo más seco: multiplica la curva del párpado (recortada a 1) para pasar menos cuadros en ranura. */
  blinkSnap?: number
  /** Cabeceo al hablar desde la mandíbula ya suavizada (no del nivel crudo, que salta entre cuadros y hace brincar la cabeza). */
  smoothNod?: boolean
  /** Mirada viva: los huesos LeftEye/RightEye siguen al puntero o a la fase (`follow`, rad por unidad) con microsacadas (`saccade`, rad). */
  eyes?: { follow: number; saccade: number }
  /** Solo con `stage: 'violeta'`: paradas del halo (`[offset, 'rgba(...)']`) y color de los filos, por personaje. Sin ellos, los de Levy. */
  halo?: Array<[number, string]>; rimColor?: number
  /** Filo fresnel sumado al emisivo (la luz de borde del retrato, que la ilustración emitida tapa): color, fuerza `k` y caída `p`. Sin él, nada cambia. */
  fresnel?: { color: number; k: number; p: number } }
// Noche del 4 oct (docs/agents/levy-presencia-noche-2026-10-04/3d): textura ORIGINAL retocada (boca pintada
// sobre la abertura real en reposo, sin motas cálidas en la cara), cuello y hombros alisados y el escenario
// violeta del retrato. Rumbo de Daniel: personaje estilizado, conservar los ojos.
export const LOOK_LEVY: Levy3DLook = { paint: 0.78, hideLipStrips: true, lit: 0.6, stage: 'violeta', restClose: 0.6, jaw: 0.55, vis: 0.6, browInner: 1, browOuter: 0, lipPart: 0.9, lipUpper: 0, vowels: ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_aa', 'viseme_E'], rest: { eyeBlink: 0.12 }, blinkEvery: [1.8, 3.8], gestures: { endSmile: 0.2, emphasisBrow: 0.3 }, oral: { color: [0, 0, 0], emissive: [0.03, 0.008, 0.06] }, jawCurve: { gate: 0.08, gain: 0.48, max: 0.36, attack: 50, release: 12 }, blinkSnap: 1.6, sway: 0.4, smoothNod: true, eyes: { follow: 0.12, saccade: 0.05 }, breathe: { shoulders: 0.07, chest: 0.006 } }

// Precarga (4 oct 2026, «la latencia lo más mínima posible»): el GLB se descarga y se parsea en
// segundo plano al abrir la app o el chat; al abrir Live, el avatar ya está en memoria y solo falta
// subirlo a la GPU. `tomarAvatar` entrega el parseado UNA vez (el montaje lo destruye al cerrar).
const avatarPrecargado = new Map<string, Promise<GLTF>>()
async function cargarAvatar(url: string): Promise<GLTF> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  return new GLTFLoader().loadAsync(url)
}
/** Descarga y parsea el avatar sin montarlo. Idempotente. */
export function precargarAvatar(url: string = LEVY_3D_URL): void {
  if (typeof window === 'undefined' || avatarPrecargado.has(url)) return
  const p = cargarAvatar(url)
  avatarPrecargado.set(url, p)
  p.catch(() => { if (avatarPrecargado.get(url) === p) avatarPrecargado.delete(url) })
}
/** Solo calienta la caché HTTP (bytes), sin parsear ni retener memoria: para los avatares que aún no se ven. */
export function calentarAvatar(url: string): void {
  if (typeof window === 'undefined') return
  void fetch(url).then(r => r.arrayBuffer()).catch(() => {})
}
function tomarAvatar(url: string): Promise<GLTF> {
  const p = avatarPrecargado.get(url)
  if (p) { avatarPrecargado.delete(url); return p.catch(() => cargarAvatar(url)) }
  return cargarAvatar(url)
}
export type Levy3DStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'

// Reposo neutro-amable (4 oct 2026): sonrisa leve, sin boca apretada ni ceño; el de los paquetes se leía severo.
const BASELINE: Record<string, number> = { mouthSmileLeft: 0.38, mouthSmileRight: 0.38, eyeSquintLeft: 0.04, eyeSquintRight: 0.04, mouthPressLeft: 0.1, mouthPressRight: 0.1 }
const VOWELS = ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_U', 'viseme_aa', 'viseme_DD', 'viseme_nn']
const ALL_VISEMES = ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_U', 'viseme_DD', 'viseme_nn']

// Fase del turno de chat (4 oct 2026): el cuerpo dice en qué va Levy. Pensando: aparta la mirada
// hacia arriba, pausa y respira lento. Herramienta: mira hacia el panel de la derecha, donde
// trabaja. Escribiendo: mira al frente. Esperando: baja la mirada, quieto. Reposo: sigue al puntero.
export type Levy3DPhase = 'reposo' | 'pensando' | 'herramienta' | 'escribiendo' | 'esperando'
const GAZE: Record<Levy3DPhase, { x: number; y: number; breath: number; follow: number }> = {
  reposo: { x: 0, y: 0, breath: 1.5, follow: 1 },
  pensando: { x: -0.7, y: -0.9, breath: 0.85, follow: 0 },
  herramienta: { x: 1.6, y: 0.1, breath: 1.7, follow: 0 },
  escribiendo: { x: 0, y: 0, breath: 1.5, follow: 0 },
  esperando: { x: 0.2, y: 0.7, breath: 0.8, follow: 0 },
}

export function Levy3D({ className = '', status = 'idle', phase = 'reposo', voiceRef, onReady, onFail, model: modelUrl = LEVY_3D_URL, look = LOOK_LEVY, fill = false, label = 'Levy en 3D' }: {
  className?: string
  /** URL del GLB (mismo rig Mixamo + ARKit/visemas que Levy). */
  model?: string
  look?: Levy3DLook
  /** Ocupa todo el contenedor (encuadre cerrado de busto) en vez de un cuadrado. */
  fill?: boolean
  label?: string
  status?: Levy3DStatus
  phase?: Levy3DPhase
  voiceRef?: RefObject<LivePcmPlayer | null>
  onReady?: () => void
  onFail?: (reason: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef(status)
  const phaseRef = useRef(phase)
  const [ready, setReady] = useState(false)
  const cb = useRef({ onReady, onFail })
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { cb.current = { onReady, onFail } }, [onReady, onFail])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let alive = true
    let frame = 0
    let cleanup = () => {}
    const cleanupExtra: Array<() => void> = []

    void (async () => {
      try {
        const THREE = await import('three')
        if (!alive) return

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
        renderer.domElement.setAttribute('aria-hidden', 'true')
        host.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const violeta = look.stage === 'violeta'
        if (violeta) {
          // Escenario del retrato: luz lavanda de frente, filos morados desde atrás a ambos lados y luz cenital violeta.
          scene.add(new THREE.HemisphereLight(0xd9ccff, 0x140a2a, 0.9))
          const key = new THREE.DirectionalLight(0xf1eaff, 1.2); key.position.set(0.2, 1.0, 3.4); scene.add(key)
          for (const sx of [-1, 1]) { const rim = new THREE.DirectionalLight(look.rimColor ?? 0x9a5cff, 3.5); rim.position.set(2.2 * sx, 0.8, -1.6); scene.add(rim) }
          const top = new THREE.DirectionalLight(0xb08cff, 1.2); top.position.set(0, 3, -0.6); scene.add(top)
        } else {
          // Luz cálida y frontal (menos contraste, menos «miedo»): cielo/suelo claros y cálidos, luz de
          // llave de frente y apenas arriba, relleno desde el otro lado y un filo dorado muy suave.
          scene.add(new THREE.HemisphereLight(0xfff3e8, 0xb9a89a, 1.5))
          const key = new THREE.DirectionalLight(0xfff0e0, 1.9); key.position.set(0.4, 1.2, 3.4); scene.add(key)
          const fillLight = new THREE.DirectionalLight(0xffe4d0, 0.9); fillLight.position.set(-2.4, 0.6, 2.4); scene.add(fillLight)
          const rim = new THREE.DirectionalLight(0xffd9a8, 0.5); rim.position.set(2, 2.5, -2.5); scene.add(rim)
        }

        const gltf = await tomarAvatar(modelUrl)
        if (!alive) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); return }
        const model = gltf.scene
        scene.add(model)

        // Mirada del estudio (configureLook): la textura lleva el sombreado de la ilustración,
        // se muestra casi sin luz y con algo de luz real.
        const meshes: Mesh[] = []
        const bones: Record<string, Bone> = {}
        model.traverse((o: Object3D) => {
          const m = o as Mesh
          if (m.isMesh) {
            meshes.push(m)
            if (look.hideLipStrips && /lip.?strips/i.test(m.name)) m.visible = false
            for (const mat of [m.material].flat() as import('three').MeshStandardMaterial[]) {
              if (!mat.map || /iris/i.test(mat.name)) continue
              mat.toneMapped = false
              mat.emissiveMap = mat.map
              if (violeta) mat.emissive?.setRGB(0.96, 0.96, 1) // neutra-fría: la piel lavanda del retrato sin empuje cálido
              else mat.emissive?.setRGB(1, 0.95, 0.9) // calidez: la ilustración horneada se empuja hacia la luz cálida
              mat.emissiveIntensity = look.paint
              mat.color?.setScalar(look.lit)
              if (look.fresnel) {
                const fr = look.fresnel, col = new THREE.Color(fr.color)
                mat.onBeforeCompile = sh => {
                  sh.uniforms.fresCol = { value: col }; sh.uniforms.fresK = { value: fr.k }; sh.uniforms.fresP = { value: fr.p }
                  sh.fragmentShader = 'uniform vec3 fresCol; uniform float fresK; uniform float fresP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
                    '#include <emissivemap_fragment>\n  totalEmissiveRadiance += fresCol * fresK * pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), fresP);')
                }
              }
              mat.needsUpdate = true
            }
            if (look.oral) for (const mat of [m.material].flat() as import('three').MeshStandardMaterial[]) {
              if (!/oral|inner lip/i.test(mat.name)) continue
              mat.color.setRGB(...look.oral.color); mat.emissive.setRGB(...look.oral.emissive); mat.emissiveIntensity = 1; mat.toneMapped = false; mat.needsUpdate = true
            }
            m.frustumCulled = false
          }
          if ((o as Bone).isBone) bones[o.name] = o as Bone
        })
        const morphMeshes = meshes.filter(m => m.morphTargetDictionary && m.morphTargetInfluences)
        const setMorph = (name: string, value: number) => {
          for (const m of morphMeshes) {
            const i = m.morphTargetDictionary![name]
            if (i !== undefined) m.morphTargetInfluences![i] = value
          }
        }
        // Fondo negro opaco y halo violeta en un plano detrás de la cabeza (redondo con cualquier aspecto).
        let haloTex: import('three').CanvasTexture | null = null
        if (violeta) {
          scene.background = new THREE.Color(0x010104)
          const c = document.createElement('canvas'); c.width = c.height = 512
          const g = c.getContext('2d')!, gr = g.createRadialGradient(256, 256, 0, 256, 256, 256)
          for (const [o, col] of look.halo ?? [[0, 'rgba(110,62,225,1)'], [0.3, 'rgba(70,34,160,0.92)'], [0.55, 'rgba(26,10,72,0.75)'], [0.78, 'rgba(5,2,18,0.4)'], [1, 'rgba(1,1,4,0)']] as const) gr.addColorStop(o, col)
          g.fillStyle = gr; g.fillRect(0, 0, 512, 512)
          haloTex = new THREE.CanvasTexture(c); haloTex.colorSpace = THREE.SRGBColorSpace
          const headY = new THREE.Vector3(); model.updateMatrixWorld(true); (bones.Head ?? model).getWorldPosition(headY)
          const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.805), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, toneMapped: false }))
          halo.position.set(0, headY.y, -0.45); halo.renderOrder = -1; scene.add(halo)
          cleanupExtra.push(() => { halo.geometry.dispose(); (halo.material as import('three').Material).dispose(); haloTex?.dispose() })
        }
        const rest = Object.fromEntries(['Head', 'Neck', 'Spine', 'Spine1', 'Spine2', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder'].filter(n => bones[n]).map(n => [n, bones[n].rotation.clone()]))

        // Encuadre de busto: la cabeza arriba, hombros abajo.
        const headPos = new THREE.Vector3()
        model.updateMatrixWorld(true)
        ;(bones.Head ?? model).getWorldPosition(headPos)
        // Cerrado (Live a lo grande): cara y cuello llenan el cuadro para que la boca se lea; en el
        // chat (cuadrado) se queda el busto de antes.
        // Encuadre por la cara, no por el hueso Head (cada paquete lo coloca distinto): H = de los ojos a la
        // coronilla. Se ve ~3.2 H de alto (cabeza completa y cuello), con los ojos en el tercio alto.
        const eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3(), topP = new THREE.Vector3()
        const eyes = bones.LeftEye && bones.RightEye
        if (eyes) { bones.LeftEye.getWorldPosition(eyeA); bones.RightEye.getWorldPosition(eyeB); eyeA.add(eyeB).multiplyScalar(0.5) } else eyeA.copy(headPos).add(new THREE.Vector3(0, 0.09, 0))
        if (bones.HeadTop_End) bones.HeadTop_End.getWorldPosition(topP); else topP.copy(eyeA).add(new THREE.Vector3(0, 0.12, 0))
        const H = Math.min(0.2, Math.max(0.08, topP.y - eyeA.y))
        const DIST = 1.9
        const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20)
        const target = new THREE.Vector3(0, fill ? eyeA.y - (look.frame?.down ?? 0.25) * H : headPos.y - 0.1, 0)
        camera.position.set(fill ? 0 : 0.04, target.y + (fill ? 0 : 0.03), fill ? DIST : 1.95)
        camera.lookAt(target)
        const fovFor = (aspect: number) => {
          if (!fill) return 24
          const fv = look.frame?.vis ?? 3.2
          const visible = Math.max(fv * H, (fv * 0.9375 * H) / Math.max(aspect, 0.2)) // en columnas estrechas, el ancho manda
          return (2 * Math.atan(visible / 2 / DIST) * 180) / Math.PI
        }

        const resize = () => {
          const w = host.clientWidth || 1, h = host.clientHeight || 1
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.fov = fovFor(camera.aspect)
          camera.updateProjectionMatrix()
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(host)

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
        let px = 0, py = 0, tx = 0, ty = 0
        const onMove = (e: PointerEvent) => {
          const r = host.getBoundingClientRect()
          tx = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / Math.max(r.width, 400)) * 2))
          ty = Math.max(-1, Math.min(1, ((e.clientY - (r.top + r.height * 0.3)) / Math.max(r.height, 400)) * 2))
        }
        window.addEventListener('pointermove', onMove)

        const clock = new THREE.Clock()
        let gx = 0, gy = 0, follow = 1, breathRate = 1.5, breathPhase = 0
        let jaw = 0, vis = 0, blink = 0, nextBlink = 1.5, blinkT = -1, smile = 0, brow = 0, speakPhase = 0, vowel = 0
        let sx = 0, sy = 0, stx = 0, sty = 0, nextSac = 1, env = 0, envBase = 0
        let quiet = 0, spoke = 0, endPulse = 0, browPulse = 0, lastEmph = -9
        const R = look.rest ?? {}
        const blinkS = (look.blinkMs ?? 160) / 1000
        const restSmile = R.mouthSmile ?? BASELINE.mouthSmileLeft, speakSmile = R.speakSmile ?? 0.4
        const squint = R.eyeSquint ?? BASELINE.eyeSquintLeft, lid = R.eyeBlink ?? squint * 0.6
        const wide = R.eyeWide ?? 0.1, cheek = R.cheekSquint ?? 0.12, press = R.mouthPress ?? BASELINE.mouthPressLeft
        const tick = () => {
          frame = requestAnimationFrame(tick)
          if (document.visibilityState === 'hidden') return
          const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime
          const ph = GAZE[phaseRef.current]
          const st = phaseRef.current === 'pensando' && statusRef.current === 'idle' ? 'thinking' : statusRef.current
          const vpos = look.trackEnergy ? voiceRef?.current?.position : null
          const level = st === 'speaking' || voiceRef?.current?.speaking ? (vpos?.track ? energyAt(vpos.track, vpos.elapsed + look.trackEnergy!.lead)[0] : (voiceRef?.current?.level ?? 0)) : 0
          const talking = level > 0.04

          // Boca: el nivel real del audio abre la mandíbula; las vocales rotan al ritmo del habla.
          const k = 1 - Math.exp(-dt * 22)
          // Amplitud generosa (Live a lo grande): con la cara ocupando el cuadro la boca tiene que notarse.
          const jc = look.jawCurve
          env += (level - env) * (1 - Math.exp(-dt * 35)); envBase += (level - envBase) * (1 - Math.exp(-dt * 3))
          const over = !jc ? 0 : jc.syllable ? (level < jc.gate * 0.5 ? 0 : Math.max(0, env - envBase * jc.syllable) + Math.max(0, env - jc.gate) * 0.15) : Math.max(0, level - jc.gate)
          const jawT = talking ? (jc ? Math.min(jc.max, over * jc.gain) : Math.min(0.95, 0.12 + level * 2.2) * (look.jaw ?? 1)) : 0
          jaw += (jawT - jaw) * (jc?.attack && jc.release ? 1 - Math.exp(-dt * (jawT > jaw ? jc.attack : jc.release)) : k)
          vis += ((talking ? (jc ? Math.min(0.7, over * jc.gain * 1.7) : Math.min(1, 0.25 + level * 3.2) * (look.vis ?? 1)) : 0) - vis) * k
          if (talking) {
            speakPhase += dt * (7 + level * 5)
            if (speakPhase >= 1) { speakPhase -= 1; vowel = (vowel + 1 + Math.floor(Math.random() * 3)) % (look.vowels ?? VOWELS).length }
          }
          for (const v of ALL_VISEMES) setMorph(v, 0)
          setMorph((look.vowels ?? VOWELS)[vowel % (look.vowels ?? VOWELS).length], vis)
          setMorph('jawOpen', jaw)
          setMorph('mouthClose', (look.restClose ?? 0) * Math.max(0, 1 - jaw * 4))
          if (look.lipPart) {
            const part = Math.min(1, jaw * look.lipPart)
            setMorph('mouthLowerDownLeft', part); setMorph('mouthLowerDownRight', part)
            setMorph('mouthUpperUpLeft', part * (look.lipUpper ?? 0.75)); setMorph('mouthUpperUpRight', part * (look.lipUpper ?? 0.75))
          }

          // Gestos con intención: la frase termina (0.35 s de silencio tras ≥0.8 s de voz) → microsonrisa; un golpe de voz → ceja.
          if (look.gestures) {
            if (talking) { spoke += dt; quiet = 0 } else { quiet += dt }
            if (!talking && quiet > 0.35 && spoke > 0.8) { endPulse = look.gestures.endSmile; spoke = 0 }
            if (talking && env - envBase > 0.3 && t - lastEmph > 1.8) { browPulse = look.gestures.emphasisBrow; lastEmph = t }
            endPulse *= Math.exp(-dt / 1.1); browPulse *= Math.exp(-dt / 0.45)
            if (quiet > 4) spoke = 0
          }
          // Gestos de estado: sonrisa al hablar/escuchar, ceja al pensar o atender.
          const wantSmile = st === 'speaking' || st === 'listening' ? speakSmile : restSmile
          const wantBrow = st === 'thinking' || st === 'transcribing' ? 0.45 : st === 'listening' ? 0.25 : 0
          smile += (wantSmile - smile) * (1 - Math.exp(-dt * 3))
          brow += (wantBrow - brow) * (1 - Math.exp(-dt * 3))
          setMorph('mouthSmileLeft', Math.max(restSmile, smile) + endPulse)
          setMorph('mouthSmileRight', Math.max(restSmile, smile) + endPulse)
          setMorph('browInnerUp', Math.max(look.browInner ?? 0.14, brow)) // ceja interior apenas alzada: mirada abierta, no ceño
          setMorph('eyeWideLeft', wide); setMorph('eyeWideRight', wide); setMorph('browOuterUpLeft', Math.max(look.browOuter ?? 0.25, brow * 0.5) + browPulse); setMorph('browOuterUpRight', (look.browOuter ?? 0.25) + browPulse)
          setMorph('cheekSquintLeft', cheek); setMorph('cheekSquintRight', cheek)
          setMorph('mouthPressLeft', talking ? 0 : press)
          setMorph('mouthPressRight', talking ? 0 : press)
          if (R.browDown !== undefined) { setMorph('browDownLeft', R.browDown * (1 - brow)); setMorph('browDownRight', R.browDown * (1 - brow)) }

          // Parpadeo aleatorio, párpados caen y suben en ~160 ms.
          nextBlink -= dt
          if (nextBlink <= 0 && blinkT < 0 && !reduced.matches) { blinkT = 0; nextBlink = (look.blinkEvery?.[0] ?? 2) + Math.random() * ((look.blinkEvery?.[1] ?? 5.5) - (look.blinkEvery?.[0] ?? 2)) }
          if (blinkT >= 0) { blinkT += dt; blink = Math.min(1, Math.sin(Math.min(1, blinkT / blinkS) * Math.PI) * (look.blinkSnap ?? 1)); if (blinkT > blinkS) { blinkT = -1; blink = 0 } }
          setMorph('eyeBlinkLeft', Math.max(lid, blink))
          setMorph('eyeBlinkRight', Math.max(lid, blink))
          if (look.blinkSquash) for (const n of ['LeftEye', 'RightEye']) if (bones[n]) bones[n].scale.y = 1 - look.blinkSquash * blink ** 4 // solo cerca del cierre: tapa el globo sin aplastar el iris a media caída
          setMorph('eyeSquintLeft', squint)
          setMorph('eyeSquintRight', squint)

          // Cuerpo: respiración y la cabeza sigue el puntero con suavidad.
          px += (tx - px) * (1 - Math.exp(-dt * 3)); py += (ty - py) * (1 - Math.exp(-dt * 3))
          const calm = reduced.matches ? 0 : 1
          const sw = calm * (look.sway ?? 1)
          // Fase del turno: mirada y ritmo de respiración que se acomodan despacio (sin saltos).
          const kp = 1 - Math.exp(-dt * 2.2)
          gx += (ph.x - gx) * kp; gy += (ph.y - gy) * kp; follow += (ph.follow - follow) * kp; breathRate += (ph.breath - breathRate) * kp
          breathPhase += dt * breathRate
          const breath = Math.sin(breathPhase) * calm
          const pxe = px * follow + gx, pye = py * follow + gy
          const nod = look.smoothNod ? Math.sin(t * 5.2) * jaw * 0.1 : talking ? Math.sin(t * 5.2) * level * 0.05 : 0
          const think = st === 'thinking' ? -0.07 : 0
          const apply = (n: string, x: number, y: number, z: number) => {
            const b = bones[n], r = rest[n]
            if (b && r) b.rotation.set(r.x + x, r.y + y, r.z + z)
          }
          apply('Spine', breath * 0.008, 0, 0)
          const hx = pxe * (look.headFollow ?? 1), hy = pye * (look.headFollow ?? 1)
          apply('Spine1', breath * 0.01, hx * 0.03, 0)
          apply('Spine2', breath * (0.012 + (look.breathe?.chest ?? 0)), hx * 0.05, Math.sin(t * 0.6) * 0.01 * sw)
          if (look.breathe) { const inh = (breath + 1) / 2 * look.breathe.shoulders; apply('LeftShoulder', 0, 0, inh); apply('RightShoulder', 0, 0, -inh) }
          apply('Neck', hy * 0.05 + nod * 0.4 * (look.sway ?? 1), hx * 0.12, 0)
          // Con la ceja en énfasis la cabeza no se ladea (ceja + ladeo se lee pícaro): el ladeo baja mientras dura el gesto.
          const level_ = look.gestures ? 1 - Math.min(1, browPulse / Math.max(0.01, look.gestures.emphasisBrow)) : 1
          apply('Head', hy * 0.09 + nod * (look.sway ?? 1) + think, hx * 0.2 + Math.sin(t * 0.4) * 0.03 * sw, (Math.sin(t * 0.5) * 0.015 * sw - hx * 0.02) * level_)
          if (look.eyes) {
            // Mirada viva: los ojos adelantan a la cabeza hacia el puntero o la fase, con microsacadas rápidas cada 0.6-2.5 s.
            nextSac -= dt
            if (nextSac <= 0) { nextSac = 0.6 + Math.random() * 1.9; stx = (Math.random() * 2 - 1) * look.eyes.saccade; sty = (Math.random() * 2 - 1) * look.eyes.saccade * 0.6 }
            const ks = 1 - Math.exp(-dt * 30)
            sx += (stx - sx) * ks; sy += (sty - sy) * ks
            const ex = (sx + pxe * look.eyes.follow) * calm, ey = (sy + pye * look.eyes.follow * 0.6) * calm
            apply('LeftEye', ey, ex, 0); apply('RightEye', ey, ex, 0)
          }

          renderer.render(scene, camera)
        }
        tick()
        setReady(true)
        cb.current.onReady?.()

        cleanup = () => {
          cancelAnimationFrame(frame)
          ro.disconnect()
          window.removeEventListener('pointermove', onMove)
          model.traverse((o: Object3D) => {
            const m = o as Mesh
            if (!m.isMesh) return
            m.geometry?.dispose()
            for (const mat of [m.material].flat() as import('three').MeshStandardMaterial[]) {
              for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) mat[key]?.dispose()
              mat.dispose()
            }
          })
          for (const f of cleanupExtra) f()
          renderer.dispose()
          renderer.forceContextLoss()
          renderer.domElement.remove()
        }
        if (!alive) cleanup()
      } catch (error) {
        console.warn('[Levy3D] sin avatar 3D, uso el rostro 2.5D:', error)
        if (alive) cb.current.onFail?.(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => { alive = false; cleanup() }
  }, [voiceRef, modelUrl]) // eslint-disable-line react-hooks/exhaustive-deps -- look/fill son fijos por montaje

  return (
    <div className={`relative isolate overflow-hidden ${fill ? 'h-full w-full' : 'aspect-square'} ${className}`} role="img" aria-label={label} data-levy-3d={ready ? 'live' : 'loading'}>
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  )
}
