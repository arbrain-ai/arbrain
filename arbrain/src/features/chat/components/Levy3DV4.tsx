'use client'

// Levy v4 en Live (8 nov 2026, bandera `levy4`, apagada por defecto: ver lib/levy4.ts). Es el Levy3D de producción (B: misma
// escena, escenario violeta, encuadre de Live, puntero, fases del turno, gestos por nivel, cabeceo, respiración) con el v4
// vigente de la noche de Levy v4 (candidato c06, labs/god-animation/practicas/2026-11-08-levy-noche):
//   · GLB de c06 (cara oficial proyectada, párpado que cierra en una línea, cuello y hombros del retrato);
//   · su identidad en tiempo de ejecución (arco y cierre del párpado) y su boca r5c (crearBoca: cavidad sin luz con
//     interior oscuro suave, labios finos, comisuras que no se rasgan);
//   · la vida y el parpadeo de p4 que no necesitan la pista entera: reposo de ojos y cejas, parpadeo por niveles cada
//     3,2-4,8 s con el iris apagado en la rendija y el globo aplanado al final, párpado vivo, ojos que sonríen, deriva lenta
//     de la cabeza y cabeceo filtrado;
//   · la boca POR FONEMA desde la alineación de ElevenLabs que el reproductor guarda en `track.alineacion` (los mismos
//     visemas que levy-visemas.ts calcula para «Levy vivo»). Si la frase no trae alineación (respaldo Apple/LemonFox), la
//     boca vuelve a la de B por nivel.
// Lo que no entra (necesita la pista entera, en el arnés se planificaba): parpadeo en las pausas, ceja en los acentos,
// golpe de cabeza, mirada que se aparta en la pausa y respiración anclada a la voz.

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LivePcmPlayer } from '@/features/live/voice/player'
import type { Bone, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { LOOK_LEVY, type Levy3DPhase, type Levy3DStatus } from './Levy3D'
import { LEVY4_URL } from '@/features/chat/lib/levy4'
import { asimParpadeo, BOCA_REPOSO, C06, crearIdentidad, FuenteVisemas, nivelParpadeo, ruido3, type Vis } from '@/features/chat/lib/levy4-nucleo'
import { crearBoca } from '@/features/chat/lib/levy4-boca.js'

const BASELINE_PRESS = 0.1
const ALL_VISEMES = ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_U', 'viseme_DD', 'viseme_nn']
const GAZE: Record<Levy3DPhase, { x: number; y: number; breath: number; follow: number }> = {
  reposo: { x: 0, y: 0, breath: 1.5, follow: 1 },
  pensando: { x: -0.7, y: -0.9, breath: 0.85, follow: 0 },
  herramienta: { x: 1.6, y: 0.1, breath: 1.7, follow: 0 },
  escribiendo: { x: 0, y: 0, breath: 1.5, follow: 0 },
  esperando: { x: 0.2, y: 0.7, breath: 0.8, follow: 0 },
}
type BocaV4 = { pesos: (vis: Vis | null, t: number, opts?: object) => { pesos: Record<string, number>; suma: Record<string, number>; hablando: number }; fijarApertura: (ap: number) => void }

export function Levy3DV4({ className = '', status = 'idle', phase = 'reposo', voiceRef, onReady, onFail, model: modelUrl = LEVY4_URL, fill = false, label = 'Levy en 3D' }: {
  className?: string
  model?: string
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
    const look = { ...LOOK_LEVY, browInner: C06.look.browInner, browOuter: C06.look.browOuter, rest: { ...LOOK_LEVY.rest, ...C06.look.rest }, eyes: C06.look.eyes, gestures: { endSmile: C06.vida.sonrisa.amp, emphasisBrow: C06.vida.ceja.amp } }

    void (async () => {
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        if (!alive) return

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
        renderer.domElement.setAttribute('aria-hidden', 'true')
        host.appendChild(renderer.domElement)

        // Escenario violeta del retrato (el de B en Live; el alfa de la noche es solo para videos).
        const scene = new THREE.Scene()
        scene.add(new THREE.HemisphereLight(0xd9ccff, 0x140a2a, 0.9))
        const key = new THREE.DirectionalLight(0xf1eaff, 1.2); key.position.set(0.2, 1.0, 3.4); scene.add(key)
        for (const sx of [-1, 1]) { const rim = new THREE.DirectionalLight(0x9a5cff, 3.5); rim.position.set(2.2 * sx, 0.8, -1.6); scene.add(rim) }
        const top = new THREE.DirectionalLight(0xb08cff, 1.2); top.position.set(0, 3, -0.6); scene.add(top)

        const gltf = await new GLTFLoader().loadAsync(modelUrl)
        if (!alive) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); return }
        const model = gltf.scene
        scene.add(model)

        const meshes: Mesh[] = []
        const bones: Record<string, Bone> = {}
        model.traverse((o: Object3D) => {
          const m = o as Mesh
          if (m.isMesh) {
            meshes.push(m)
            if (look.hideLipStrips && /lip.?strips/i.test(m.name)) m.visible = false
            for (const mat of [m.material].flat() as MeshStandardMaterial[]) {
              if (!mat.map || /iris/i.test(mat.name)) continue
              mat.toneMapped = false
              mat.emissiveMap = mat.map
              mat.emissive?.setRGB(0.96, 0.96, 1)
              mat.emissiveIntensity = look.paint
              mat.color?.setScalar(look.lit)
              mat.needsUpdate = true
            }
            if (look.oral) for (const mat of [m.material].flat() as MeshStandardMaterial[]) {
              if (!/oral|inner lip/i.test(mat.name)) continue
              mat.color.setRGB(...look.oral.color); mat.emissive.setRGB(...look.oral.emissive); mat.emissiveIntensity = 1; mat.toneMapped = false; mat.needsUpdate = true
            }
            m.frustumCulled = false
          }
          if ((o as Bone).isBone) bones[o.name] = o as Bone
        })
        const morphMeshes = meshes.filter(m => m.morphTargetDictionary && m.morphTargetInfluences)
        const base0 = morphMeshes.map(m => [...m.morphTargetInfluences!])
        const setMorph = (name: string, value: number) => {
          for (const m of morphMeshes) { const i = m.morphTargetDictionary![name]; if (i !== undefined) m.morphTargetInfluences![i] = value }
        }
        const resetMorph = (name: string) => morphMeshes.forEach((m, k) => { const i = m.morphTargetDictionary![name]; if (i !== undefined) m.morphTargetInfluences![i] = base0[k][i] })

        // Fondo negro opaco y halo violeta detrás de la cabeza (como B en Live).
        scene.background = new THREE.Color(0x010104)
        const c = document.createElement('canvas'); c.width = c.height = 512
        const g = c.getContext('2d')!, gr = g.createRadialGradient(256, 256, 0, 256, 256, 256)
        for (const [o, col] of [[0, 'rgba(110,62,225,1)'], [0.3, 'rgba(70,34,160,0.92)'], [0.55, 'rgba(26,10,72,0.75)'], [0.78, 'rgba(5,2,18,0.4)'], [1, 'rgba(1,1,4,0)']] as const) gr.addColorStop(o, col)
        g.fillStyle = gr; g.fillRect(0, 0, 512, 512)
        const haloTex = new THREE.CanvasTexture(c); haloTex.colorSpace = THREE.SRGBColorSpace
        const headY = new THREE.Vector3(); model.updateMatrixWorld(true); (bones.Head ?? model).getWorldPosition(headY)
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.805), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, toneMapped: false }))
        halo.position.set(0, headY.y, -0.45); halo.renderOrder = -1; scene.add(halo)
        cleanupExtra.push(() => { halo.geometry.dispose(); halo.material.dispose(); haloTex.dispose() })
        const rest = Object.fromEntries(['Head', 'Neck', 'Spine', 'Spine1', 'Spine2', 'LeftEye', 'RightEye', 'LeftShoulder', 'RightShoulder'].filter(n => bones[n]).map(n => [n, bones[n].rotation.clone()]))

        // Boca r5c de c06 (cambia cavidad, labios y comisuras en tiempo de ejecución) e identidad r5 (párpado).
        const boca = crearBoca({ THREE, meshes, opciones: { bocaR2: C06.bocaR2 } }) as BocaV4
        const ident = crearIdentidad(morphMeshes)
        const fuente = new FuenteVisemas()
        // blinkOculta: iris, pupila y esclerótica hacia un oscuro de párpado mientras el párpado los tapa (sin astillas).
        const BO = C06.look.blinkOculta
        const ocuC = new THREE.Color(...BO.color), ocuE = new THREE.Color(...BO.emisivo)
        const ojosMat: { mat: MeshStandardMaterial; c: import('three').Color; e: import('three').Color | null }[] = []
        for (const m of meshes) for (const mat of [m.material].flat() as MeshStandardMaterial[]) {
          if (!/EyePaint|pupil|sclera/i.test(mat.name) || ojosMat.some(q => q.mat === mat)) continue
          ojosMat.push({ mat, c: mat.color.clone(), e: mat.emissive ? mat.emissive.clone() : null })
        }
        const ojosParpadeo = (b: number) => {
          for (const n of ['LeftEye', 'RightEye']) if (bones[n]) bones[n].scale.y = 1 - C06.look.blinkSquash * b ** C06.look.blinkSquashPot
          const u = Math.min(1, Math.max(0, (b - BO.desde) / (BO.hasta - BO.desde))), f = u * u * (3 - 2 * u)
          for (const q of ojosMat) { q.mat.color.copy(q.c).lerp(ocuC, f); if (q.mat.emissive && q.e) q.mat.emissive.copy(q.e).lerp(ocuE, f) }
        }

        // Encuadre de Live (el de B).
        const headPos = new THREE.Vector3()
        model.updateMatrixWorld(true)
        ;(bones.Head ?? model).getWorldPosition(headPos)
        const eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3(), topP = new THREE.Vector3()
        if (bones.LeftEye && bones.RightEye) { bones.LeftEye.getWorldPosition(eyeA); bones.RightEye.getWorldPosition(eyeB); eyeA.add(eyeB).multiplyScalar(0.5) } else eyeA.copy(headPos).add(new THREE.Vector3(0, 0.09, 0))
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
          const visible = Math.max(fv * H, (fv * 0.9375 * H) / Math.max(aspect, 0.2))
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
        let jaw = 0, vis = 0, blink = 0, blinkT = -1, smile = 0, brow = 0, speakPhase = 0, vowel = 0
        let sx = 0, sy = 0, stx = 0, sty = 0, nextSac = 1, env = 0, envBase = 0
        let quiet = 0, spoke = 0, endPulse = 0, browPulse = 0, lastEmph = -9
        // v4: parpadeo por niveles con su propio reloj, párpado vivo, deriva y cabeceo filtrado
        const P = C06.vida.parpadeo, EXP = C06.vida.expresion, DER = C06.vida.deriva, BN = C06.look.blinkNiveles
        let nextBlink = 1.5, blinkHold = 2, pz = 0, eyD = 0
        let cab: { n: number; v: number } | null = null
        const fasD = Array.from({ length: 12 }, () => Math.random() * Math.PI * 2)
        let prevBoca = new Set<string>(), sumaBoca: Record<string, number> = {}, modoV4 = false
        const R = look.rest ?? {}
        const restSmile = R.mouthSmile ?? 0.38, speakSmile = R.speakSmile ?? 0.4
        const squint = R.eyeSquint ?? 0.04, lid = R.eyeBlink ?? squint * 0.6
        const wide = R.eyeWide ?? 0.1, cheek = R.cheekSquint ?? 0.12, press = R.mouthPress ?? BASELINE_PRESS
        const vowels = look.vowels ?? ALL_VISEMES
        const tick = () => {
          frame = requestAnimationFrame(tick)
          if (document.visibilityState === 'hidden') return
          const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime
          const ph = GAZE[phaseRef.current]
          const st = phaseRef.current === 'pensando' && statusRef.current === 'idle' ? 'thinking' : statusRef.current
          const player = voiceRef?.current ?? null
          const vpos = player?.position ?? null   // la frase que suena ahora (null = nada audible)
          const level = st === 'speaking' || vpos ? (vpos ? vpos.level : (player?.level ?? 0)) : 0
          const talking = level > 0.04

          // Mandíbula de B por nivel: mueve la boca de respaldo y, siempre, el cabeceo.
          const k = 1 - Math.exp(-dt * 22)
          const jc = look.jawCurve!
          env += (level - env) * (1 - Math.exp(-dt * 35)); envBase += (level - envBase) * (1 - Math.exp(-dt * 3))
          const over = Math.max(0, level - jc.gate)
          const jawT = talking ? Math.min(jc.max, over * jc.gain) : 0
          jaw += (jawT - jaw) * (1 - Math.exp(-dt * (jawT > jaw ? jc.attack! : jc.release!)))
          vis += ((talking ? Math.min(0.7, over * jc.gain * 1.7) : 0) - vis) * k

          // Boca: por fonema con la alineación de la frase que suena; si no la trae, la de B por nivel.
          // En el hueco entre frases (o al callar) tras una frase con alineación, sigue la boca v4 en su reposo: la mandíbula de
          // B (que aún cae) no abre la boca un instante.
          const visemas = vpos ? fuente.vis(vpos.track, vpos.elapsed) : null
          modoV4 = visemas ? true : vpos ? false : modoV4
          let hablando = talking
          if (modoV4) {
            for (const n of BOCA_REPOSO) setMorph(n, 0)
            setMorph('mouthClose', look.restClose ?? 0)
            const r = visemas && vpos ? boca.pesos(visemas, vpos.elapsed) : boca.pesos(null, 0)
            for (const n of prevBoca) if (!(n in r.pesos) && !BOCA_REPOSO.includes(n)) resetMorph(n)
            prevBoca = new Set()
            for (const [n, v] of Object.entries(r.pesos)) { setMorph(n, v); prevBoca.add(n) }
            sumaBoca = r.suma || {}
            hablando = r.hablando > 0.5
          } else {
            if (prevBoca.size) { for (const n of prevBoca) resetMorph(n); prevBoca = new Set(); sumaBoca = {} }
            if (talking) {
              speakPhase += dt * (7 + level * 5)
              if (speakPhase >= 1) { speakPhase -= 1; vowel = (vowel + 1 + Math.floor(Math.random() * 3)) % vowels.length }
            }
            for (const v of ALL_VISEMES) setMorph(v, 0)
            setMorph(vowels[vowel % vowels.length], vis)
            setMorph('jawOpen', jaw)
            setMorph('mouthClose', (look.restClose ?? 0) * Math.max(0, 1 - jaw * 4))
            const part = Math.min(1, jaw * (look.lipPart ?? 0))
            setMorph('mouthLowerDownLeft', part); setMorph('mouthLowerDownRight', part)
            setMorph('mouthUpperUpLeft', part * (look.lipUpper ?? 0.75)); setMorph('mouthUpperUpRight', part * (look.lipUpper ?? 0.75))
            boca.fijarApertura(jaw + part)
          }
          const own = (n: string) => prevBoca.has(n)

          // Gestos de B por nivel (amplitudes de c06): microsonrisa al cerrar frase, ceja en el golpe de voz.
          if (talking) { spoke += dt; quiet = 0 } else { quiet += dt }
          if (!talking && quiet > 0.35 && spoke > 0.8) { endPulse = look.gestures.endSmile; spoke = 0 }
          if (talking && env - envBase > 0.3 && t - lastEmph > 1.8) { browPulse = look.gestures.emphasisBrow; lastEmph = t }
          endPulse *= Math.exp(-dt / 1.1); browPulse *= Math.exp(-dt / 0.45)
          if (quiet > 4) spoke = 0
          const wantSmile = st === 'speaking' || st === 'listening' ? speakSmile : restSmile
          const wantBrow = st === 'thinking' || st === 'transcribing' ? 0.45 : st === 'listening' ? 0.25 : 0
          smile += (wantSmile - smile) * (1 - Math.exp(-dt * 3))
          brow += (wantBrow - brow) * (1 - Math.exp(-dt * 3))
          if (!own('mouthSmileLeft')) setMorph('mouthSmileLeft', Math.max(restSmile, smile) + endPulse + (sumaBoca.mouthSmileLeft ?? 0))
          if (!own('mouthSmileRight')) setMorph('mouthSmileRight', Math.max(restSmile, smile) + endPulse + (sumaBoca.mouthSmileRight ?? 0))
          setMorph('eyeWideLeft', wide); setMorph('eyeWideRight', wide)
          if (!own('mouthPressLeft')) setMorph('mouthPressLeft', hablando ? 0 : press)
          if (!own('mouthPressRight')) setMorph('mouthPressRight', hablando ? 0 : press)

          // Parpadeo de p4: cada 3,2-4,8 s, por niveles (un nivel por cuadro de 1/30 s).
          nextBlink -= dt
          if (nextBlink <= 0 && blinkT < 0 && !reduced.matches) { blinkT = 0; nextBlink = P.reposo[0] + Math.random() * (P.reposo[1] - P.reposo[0]) }
          if (blinkT >= 0) {
            if (blinkT === 0) blinkHold = BN.tiene[0] + Math.floor(Math.random() * (BN.tiene[1] - BN.tiene[0] + 1))
            blinkT += dt
            const b = nivelParpadeo(blinkT, blinkHold)
            if (b < 0) { blinkT = -1; blink = 0 } else blink = b
          }
          // Párpado vivo (pausa, ruido lento, acompaña a la mirada) y ojos que sonríen con la sonrisa de cierre.
          const calm = reduced.matches ? 0 : 1
          pz += ((hablando ? 0 : 1) - pz) * (1 - Math.exp(-dt / Math.max(0.05, EXP.pausa.k)))
          const sonr = endPulse / Math.max(0.01, C06.vida.sonrisa.amp)
          const lidV = Math.max(0, lid + EXP.pausa.lid * pz + EXP.lidRuido * ruido3(t, [0.09, 0.23, 0.41], fasD, 6) * calm + EXP.lidMirada * eyD)
          const wB = Math.max(lidV, blink)
          setMorph('eyeBlinkLeft', asimParpadeo(wB))
          setMorph('eyeBlinkRight', wB)
          setMorph('browInnerUp', Math.max(look.browInner ?? 0.14, brow) + P.cejaIn * blink)
          ojosParpadeo(blink)
          setMorph('eyeSquintLeft', squint + EXP.pausa.squint * pz + EXP.sonrisaOjos * sonr)
          setMorph('eyeSquintRight', squint + EXP.pausa.squint * pz + EXP.sonrisaOjos * sonr)
          setMorph('cheekSquintLeft', cheek + EXP.sonrisaOjos * sonr); setMorph('cheekSquintRight', cheek + EXP.sonrisaOjos * sonr)
          const bo = Math.max(look.browOuter ?? 0.25, brow * 0.5) + browPulse + P.cejaComp * blink + EXP.pausa.outer * pz
          setMorph('browOuterUpLeft', bo); setMorph('browOuterUpRight', bo)
          ident.paso()

          // Cuerpo: respiración de B, la cabeza sigue al puntero y a la fase; cabeceo filtrado y deriva lenta (p4).
          px += (tx - px) * (1 - Math.exp(-dt * 3)); py += (ty - py) * (1 - Math.exp(-dt * 3))
          const sw = calm * (look.sway ?? 1)
          const kp = 1 - Math.exp(-dt * 2.2)
          gx += (ph.x - gx) * kp; gy += (ph.y - gy) * kp; follow += (ph.follow - follow) * kp; breathRate += (ph.breath - breathRate) * kp
          breathPhase += dt * breathRate
          const breath = Math.sin(breathPhase) * calm
          const pxe = px * follow + gx, pye = py * follow + gy
          const nod = Math.sin(t * 5.2) * jaw * 0.1
          {
            const kk = C06.vida.suaveCabeza.k, n = Math.max(1, Math.ceil(dt * 120)), h = dt / n
            if (!cab) cab = { n: nod, v: 0 }
            for (let q = 0; q < n; q++) { cab.v += (kk * kk * (nod - cab.n) - 2 * kk * cab.v) * h; cab.n += cab.v * h }
          }
          const nodV = cab.n
          const think = st === 'thinking' ? -0.07 : 0
          const apply = (n: string, x: number, y: number, z: number) => { const b = bones[n], r = rest[n]; if (b && r) b.rotation.set(r.x + x, r.y + y, r.z + z) }
          apply('Spine', breath * 0.008, 0, 0)
          const hx = pxe * (look.headFollow ?? 1), hy = pye * (look.headFollow ?? 1)
          apply('Spine1', breath * 0.01, hx * 0.03, 0)
          apply('Spine2', breath * (0.012 + (look.breathe?.chest ?? 0)), hx * 0.05, Math.sin(t * 0.6) * 0.01 * sw)
          if (look.breathe) { const inh = (breath + 1) / 2 * look.breathe.shoulders; apply('LeftShoulder', 0, 0, inh); apply('RightShoulder', 0, 0, -inh) }
          apply('Neck', hy * 0.05 + nodV * 0.4 * (look.sway ?? 1), hx * 0.12, 0)
          const level_ = 1 - Math.min(1, browPulse / Math.max(0.01, look.gestures.emphasisBrow))
          const dP = DER.pitch * ruido3(t, [0.13, 0.29, 0.47], fasD, 0) * calm, dY = DER.yaw * ruido3(t, [0.07, 0.19, 0.37], fasD, 3) * calm, dR = DER.roll * ruido3(t, [0.11, 0.21, 0.33], fasD, 9) * calm
          apply('Head', hy * 0.09 + nodV * (look.sway ?? 1) + think + dP, hx * 0.2 + Math.sin(t * 0.4) * 0.03 * sw + dY, (Math.sin(t * 0.5) * 0.015 * sw - hx * 0.02) * level_ + dR)
          // Mirada viva de B: los ojos adelantan a la cabeza, con microsacadas (amplitud de c06).
          nextSac -= dt
          if (nextSac <= 0) { nextSac = 0.6 + Math.random() * 1.9; stx = (Math.random() * 2 - 1) * look.eyes.saccade; sty = (Math.random() * 2 - 1) * look.eyes.saccade * 0.6 }
          const ks = 1 - Math.exp(-dt * 30)
          sx += (stx - sx) * ks; sy += (sty - sy) * ks
          const ex = (sx + pxe * look.eyes.follow) * calm, ey = (sy + pye * look.eyes.follow * 0.6) * calm
          eyD = ey
          const eb = P.ojoAbajo * blink
          apply('LeftEye', ey + eb, ex, 0); apply('RightEye', ey + eb, ex, 0)

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
            for (const mat of [m.material].flat() as MeshStandardMaterial[]) {
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
        console.warn('[Levy3DV4] sin avatar 3D v4, uso el rostro 2.5D:', error)
        if (alive) cb.current.onFail?.(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => { alive = false; cleanup() }
  }, [voiceRef, modelUrl]) // eslint-disable-line react-hooks/exhaustive-deps -- fill es fijo por montaje

  return (
    <div className={`relative isolate overflow-hidden ${fill ? 'h-full w-full' : 'aspect-square'} ${className}`} role="img" aria-label={label} data-levy-3d={ready ? 'live' : 'loading'} data-levy-version="v4">
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  )
}
