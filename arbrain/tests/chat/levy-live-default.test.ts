// Levy en Live (13 nov 2026, Daniel: «esto del levy 2D metelo al live de tu foto de perfil»): Live abre por defecto con el
// Levy 2D de los videos (cara oficial + atlas + movimiento del 3D), sin bandera; el 3D y el 2D anterior quedan en Ajustes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CARA_LIVE_CLAVE, CARA_LIVE_EVENTO, CARAS_LIVE, caraLive, fijarCaraLive, levyVivoActivo } from '../../src/features/chat/lib/levy-vivo.ts'

function navegador(guardado: Record<string, string> = {}) {
  const mem = new Map(Object.entries(guardado)), eventos: string[] = []
  ;(globalThis as { window?: unknown }).window = {
    location: { search: '' },
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)) } },
    dispatchEvent: (e: Event) => { eventos.push(e.type); return true },
  }
  return { mem, eventos }
}
const sinNavegador = () => { delete (globalThis as { window?: unknown }).window }

test('sin nada guardado (y en el servidor) Live abre con el Levy de los videos', () => {
  sinNavegador()
  assert.equal(caraLive(), 'videos')
  navegador()
  assert.equal(caraLive(), 'videos')
  // la clave vieja de la vista (guardaba «3d» por defecto) ya no tapa el cambio
  navegador({ 'arbrain.live.vista': '3d' })
  assert.equal(caraLive(), 'videos')
  navegador({ [CARA_LIVE_CLAVE]: 'otra-cosa' })
  assert.equal(caraLive(), 'videos', 'un valor desconocido vuelve al default')
  sinNavegador()
})

test('Ajustes guarda la elección, avisa a Live abierto y se puede volver a lo anterior', () => {
  const nav = navegador()
  fijarCaraLive('3d')
  assert.equal(caraLive(), '3d'); assert.equal(nav.mem.get(CARA_LIVE_CLAVE), '3d'); assert.deepEqual(nav.eventos, [CARA_LIVE_EVENTO])
  fijarCaraLive('2d-anterior')
  assert.equal(caraLive(), '2d-anterior')
  fijarCaraLive('videos')
  assert.equal(caraLive(), 'videos')
  assert.deepEqual(CARAS_LIVE.map(c => c.id), ['videos', '3d', '2d-anterior'], 'el default va primero')
  sinNavegador()
})

test('la bandera levyVivo sigue igual fuera de Live (sello del chat, Command Center)', () => {
  navegador()
  assert.equal(levyVivoActivo(), false)
  sinNavegador()
})

test('Live monta la cara de los videos según la preferencia, no según la bandera', () => {
  const fuente = readFileSync(new URL('../../src/features/live/components/LiveWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(fuente.includes("<LevyFace key={agente} agent={agente} vivo={cara==='videos'} framing=\"camera\""), 'LevyFace de Live con vivo por preferencia')
  assert.ok(fuente.includes("useState<CaraLive>('videos')"), 'arranca en el de los videos')
  assert.ok(!fuente.includes("'arbrain.live.vista'"), 'la clave vieja no decide')
  const cara = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(cara.includes('const vivoOn = vivoPedido ?? banderaVivo'), 'sin prop manda la bandera, como antes')
  const ajustes = readFileSync(new URL('../../src/features/configuracion/components/ModalAjustes.tsx', import.meta.url), 'utf8')
  assert.ok(ajustes.includes('<SeccionLevyLive />'), 'la opción vive en Ajustes › Apariencia')
})
