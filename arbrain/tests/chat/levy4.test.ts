// Levy v4 en Live detrás de la bandera `levy4` (8 nov 2026): la bandera, el camino de siempre sin ella y la paridad de la
// boca por fonema con la de la noche (harness/variantes/c06/boca.js, fixture generado con ese archivo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEVY4_CLAVE, levy4Activo, pedirAlineacion, usarLevy4 } from '../../src/features/chat/lib/levy4.ts'
import { LEVY_VIVO_CLAVE } from '../../src/features/chat/lib/levy-vivo.ts'
import { asimParpadeo, C06, crearIdentidad, cuadroDePista, FuenteVisemas, nivelParpadeo, VisPista } from '../../src/features/chat/lib/levy4-nucleo.ts'
import { pista, type Fonema } from '../../src/features/chat/lib/levy-visemas.ts'
import { bocaPesos, MORPHS_BOCA } from '../../src/features/chat/lib/levy4-boca.js'
import type { VoiceTrack } from '../../src/features/live/voice/player.ts'

/** Un navegador mínimo: la URL y un localStorage en memoria. */
function navegador(search = '', guardado: Record<string, string> = {}) {
  const mem = new Map(Object.entries(guardado))
  const w = { location: { search }, localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)) } } }
  ;(globalThis as { window?: unknown }).window = w
  return { mem, ir: (s: string) => { w.location.search = s } }
}
const sinNavegador = () => { delete (globalThis as { window?: unknown }).window }

test('la bandera levy4 está apagada por defecto y en el servidor', () => {
  sinNavegador()
  assert.equal(levy4Activo(), false)
  navegador('')
  assert.equal(levy4Activo(), false)
  navegador('?levyVivo=1')
  assert.equal(levy4Activo(), false, 'Levy vivo (2D) no enciende el v4')
  sinNavegador()
})

test('?levy4=1 la enciende y queda guardada; ?levy4=0 la apaga; también a mano por localStorage', () => {
  const nav = navegador('?levy4=1')
  assert.equal(levy4Activo(), true)
  assert.equal(nav.mem.get(LEVY4_CLAVE), '1')
  nav.ir('')
  assert.equal(levy4Activo(), true, 'sigue encendida sin el parámetro')
  nav.ir('?levy4=0')
  assert.equal(levy4Activo(), false)
  nav.ir('?levy4=talvez')
  assert.equal(levy4Activo(), false, 'otro valor no la toca')
  navegador('', { [LEVY4_CLAVE]: '1' })
  assert.equal(levy4Activo(), true)
  sinNavegador()
})

test('sin bandera, Live usa el camino de siempre: Levy3D para los tres agentes y la voz sin alineación', () => {
  navegador('')
  for (const a of ['levy', 'trinity', 'sensei']) assert.equal(usarLevy4(levy4Activo(), a), false, a)
  assert.equal(pedirAlineacion(), false, 'la petición de voz no cambia')
  navegador('?levy4=1')
  assert.equal(usarLevy4(levy4Activo(), 'levy'), true)
  assert.equal(usarLevy4(levy4Activo(), 'trinity'), false, 'Trinity y Sensei siguen con su 3D')
  assert.equal(usarLevy4(levy4Activo(), 'sensei'), false)
  assert.equal(pedirAlineacion(), true, 'con el v4 la voz trae la alineación')
  navegador('', { [LEVY_VIVO_CLAVE]: '1' })
  assert.equal(pedirAlineacion(), true, 'Levy vivo la sigue pidiendo como antes')
  sinNavegador()
  // El montaje de siempre sigue en LiveWorkspace, sin cambios, en la rama sin bandera.
  const fuente = readFileSync(new URL('../../src/features/live/components/LiveWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(fuente.includes("usarLevy4(levy4,agente)?<Levy3DV4 "), 'el v4 solo entra por usarLevy4')
  assert.ok(fuente.includes(':<Levy3D key={agente} fill voiceRef={voice.player} status={status} model={info.modelo} look={info.look} label={`${info.nombre} en 3D`} onReady={()=>setReady(true)} onFail={()=>setAvatar3d(false)} className={styles.avatar}/>'), 'Levy3D intacto')
  assert.ok(fuente.includes('const [levy4,setLevy4]=useState(false)'), 'apagada hasta leer la bandera al montar')
})

const fx = JSON.parse(readFileSync(new URL('./fixtures/levy4-boca-c06.json', import.meta.url), 'utf8')) as {
  g: Record<string, unknown>; morphs: string[]; visemas: string[]; cuadros: number[][]; muestras: [number, number[], number, number][]
  fonemas: Fonema[]; durPista: number; cuadrosRef: number
}

test('paridad de la boca: bocaPesos de la app = la de c06 en 460 instantes de la voz de entreno', () => {
  assert.deepEqual(MORPHS_BOCA, fx.morphs)
  assert.deepEqual(fx.g, C06.bocaR2.g, 'la g de la app es la de c06')
  const vis = { fps: 30, visemas: fx.visemas, cuadros: fx.cuadros }
  let peor = 0, hab = 0
  for (const [t, esperado, sonrisa, hablando] of fx.muestras) {
    const r = bocaPesos(vis, t, { g: C06.bocaR2.g })
    MORPHS_BOCA.forEach((k: string, j: number) => { peor = Math.max(peor, Math.abs(r.pesos[k] - esperado[j])) })
    peor = Math.max(peor, Math.abs(((r.suma as Record<string, number>).mouthSmileLeft ?? 0) - sonrisa))
    if (r.hablando !== hablando) hab++
  }
  assert.ok(peor < 1e-5, `error máx ${peor}`)
  assert.equal(hab, 0)
  // hay de todo: abre, cierra en p/b/m, redondea y calla
  const jaw = fx.muestras.map(m => m[1][0]), close = fx.muestras.map(m => m[1][1])
  assert.ok(Math.max(...jaw) > 0.5 && Math.min(...jaw) === 0)
  assert.ok(fx.muestras.some(m => m[1][0] < 0.01 && m[1][1] >= 0.59 && m[3] === 1), 'cierre p/b/m hablando')
  assert.ok(close.some(c => c > 0.59))
})

test('de los fonemas a la boca: los cuadros de la app son los de visemas.json y dan los mismos pesos', () => {
  const p = pista(fx.fonemas, fx.durPista)
  let peor = 0
  for (let i = 0; i < fx.cuadrosRef; i++) { const c = cuadroDePista(p, i / 30); for (let j = 0; j < 20; j++) peor = Math.max(peor, Math.abs(c[j] - fx.cuadros[i][j])) }
  assert.ok(peor < 0.002, `cuadros: error máx ${peor}`)
  const vp = new VisPista(p)
  let peorP = 0
  for (const [t, esperado] of fx.muestras) {
    if (t > (fx.cuadrosRef - 3) / 30) continue
    const r = bocaPesos(vp.preparar(t), t, { g: C06.bocaR2.g })
    MORPHS_BOCA.forEach((k: string, j: number) => { peorP = Math.max(peorP, Math.abs(r.pesos[k] - esperado[j])) })
  }
  assert.ok(peorP < 0.01, `pesos: error máx ${peorP}`)
})

/** Alineación sintética: cada carácter dura `ms`, como la de ElevenLabs. */
function al(texto: string, ms = 80) {
  const chars = [...texto]
  return { chars, starts: chars.map((_, i) => i * ms / 1000), ends: chars.map((_, i) => (i + 1) * ms / 1000) }
}

test('la boca por fonema sale de track.alineacion; sin alineación (respaldo Apple/LemonFox) no hay pista y vuelve la de B', () => {
  const fuente = new FuenteVisemas()
  const sinAl: VoiceTrack = { rate: 24000, chunks: [], length: 0 }
  assert.equal(fuente.vis(sinAl, 0.2), null)
  assert.equal(fuente.vis(null, 0.2), null)
  assert.equal(fuente.vis({ ...sinAl, alineacion: { chars: [], starts: [], ends: [] } }, 0.2), null)
  const tr: VoiceTrack = { rate: 24000, chunks: [], length: 0, alineacion: al('   papá', 80) }
  const enP = 3 * 0.08 + 0.04 - 0.04, enA = 6 * 0.08 + 0.04 - 0.04   // centro de la letra − adelanto de 40 ms
  const rp = bocaPesos(fuente.vis(tr, enP), enP, { g: C06.bocaR2.g }), ra = bocaPesos(fuente.vis(tr, enA), enA, { g: C06.bocaR2.g })
  assert.ok(rp.pesos.mouthClose >= 0.59 && rp.pesos.jawOpen < 0.01, `p cierra (${rp.pesos.mouthClose.toFixed(2)}, ${rp.pesos.jawOpen.toFixed(3)})`)
  assert.ok(ra.pesos.jawOpen > 0.3, `á abre (${ra.pesos.jawOpen.toFixed(2)})`)
  // crece en streaming: con más alineación la pista se rehace
  tr.alineacion = al('   papá mamá', 80)
  const enM = 8 * 0.08
  assert.ok(bocaPesos(fuente.vis(tr, enM), enM, { g: C06.bocaR2.g }).pesos.mouthClose >= 0.59, 'la m que llegó después también cierra')
})

test('parpadeo de p4 por niveles (un nivel por cuadro de 1/30 s), asimetría y párpado de identidad r5', () => {
  const vistos: number[] = []
  for (let k = 1; ; k++) { const b = nivelParpadeo(k / 60, 1); if (b < 0) break; if (k % 2 === 0) vistos.push(b) }
  assert.deepEqual(vistos, [0.42, 0.8, 1, 0.9, 0.64, 0.42, 0.32])
  assert.equal(nivelParpadeo(10 / 30 + 0.01, 2), -1)
  assert.equal(asimParpadeo(C06.look.rest.eyeBlink), C06.look.rest.eyeBlink, 'reposo intacto')
  assert.equal(asimParpadeo(1), 1, 'cierre intacto')
  assert.ok(asimParpadeo(0.5) < 0.5 && asimParpadeo(0.5) > 0.44)
  const w = [0.5, 0, 0, 0.5, 0, 0]
  const id = crearIdentidad([{ morphTargetDictionary: { eyeBlinkLeft: 0, eyeBlinkArcLeft: 1, eyeBlinkCierreLeft: 2, eyeBlinkRight: 3, eyeBlinkArcRight: 4, eyeBlinkCierreRight: 5 }, morphTargetInfluences: w }])
  assert.equal(id.morphs, 4)
  id.paso()
  assert.ok(Math.abs(w[1] - 1) < 1e-9 && Math.abs(w[4] - 1) < 1e-9, 'arco 4·w·(1−w)')
  const u = (0.5 - 0.4) / 0.6
  assert.ok(Math.abs(w[2] - u * u * (3 - 2 * u)) < 1e-9, 'cierre smoothstep(0,4, 1, w)')
  assert.equal(crearIdentidad([{ morphTargetDictionary: { eyeBlinkLeft: 0 }, morphTargetInfluences: [1] }]).morphs, 0, 'GLB sin esos morphs: nada')
})
