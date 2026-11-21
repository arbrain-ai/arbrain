// Levy en Live (13 nov 2026, Daniel: «esto del levy 2D metelo al live de tu foto de perfil»): Live abre por defecto con el
// Levy 2D de los videos (cara oficial + atlas + movimiento del 3D), sin bandera; el 3D y el 2D anterior quedan en Ajustes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CARA_LIVE_2D_CLAVE, CARA_LIVE_CLAVE, CARA_LIVE_EVENTO, CARAS_LIVE, caraConAtlas, caraLive, fijarCaraLive, levyVivoActivo, ultimaCara2d } from '../../src/features/chat/lib/levy-vivo.ts'

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

test('sin nada guardado (y en el servidor) Live abre «Como en YouTube» (19 nov: «el nuevo levy esta gigante»)', () => {
  sinNavegador()
  assert.equal(caraLive(), 'youtube')
  navegador()
  assert.equal(caraLive(), 'youtube')
  // la clave vieja de la vista (guardaba «3d» por defecto) ya no tapa el cambio
  navegador({ 'arbrain.live.vista': '3d' })
  assert.equal(caraLive(), 'youtube')
  navegador({ [CARA_LIVE_CLAVE]: 'otra-cosa' })
  assert.equal(caraLive(), 'youtube', 'un valor desconocido vuelve al default')
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
  // 19 nov 2026: «Como en YouTube» (plano medio en el estudio del canal) pasa a ser el default y va primero.
  fijarCaraLive('youtube')
  assert.equal(caraLive(), 'youtube')
  assert.deepEqual(CARAS_LIVE.map(c => c.id), ['youtube', 'videos', '3d', '2d-anterior'], 'el default va primero')
  sinNavegador()
})

test('el botón 2D/3D vuelve al último 2D elegido (de cerca o como en YouTube), no siempre al primer plano', () => {
  const nav = navegador()
  assert.equal(ultimaCara2d(), 'youtube', 'sin nada guardado, como en YouTube')
  fijarCaraLive('youtube'); fijarCaraLive('3d')
  assert.equal(caraLive(), '3d'); assert.equal(nav.mem.get(CARA_LIVE_2D_CLAVE), 'youtube')
  assert.equal(ultimaCara2d(), 'youtube')
  fijarCaraLive('videos'); fijarCaraLive('3d')
  assert.equal(ultimaCara2d(), 'videos')
  navegador({ [CARA_LIVE_2D_CLAVE]: '3d' })
  assert.equal(ultimaCara2d(), 'youtube', 'el 3D nunca es «el último 2D»: vuelve al default')
  // la boca de los videos (atlas) va en las dos caras de los videos; el 3D y el 2D anterior no la usan
  assert.deepEqual(CARAS_LIVE.map(c => caraConAtlas(c.id)), [true, true, false, false])
  sinNavegador()
})

test('la bandera levyVivo sigue igual fuera de Live (sello del chat, Command Center)', () => {
  navegador()
  assert.equal(levyVivoActivo(), false)
  sinNavegador()
})

test('Live monta la cara de los videos según la preferencia, no según la bandera', () => {
  const fuente = readFileSync(new URL('../../src/features/live/components/LiveWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(fuente.includes("<LevyFace key={agente} agent={agente} vivo={caraConAtlas(cara)} framing={cara==='youtube'?'medio':'camera'}"), 'LevyFace de Live con vivo y encuadre por preferencia')
  assert.ok(fuente.includes('fijarCaraLive(vista===\'3d\'?ultimaCara2d():\'3d\')'), 'el botón vuelve al último 2D')
  assert.ok(fuente.includes("useState<CaraLive>('videos')"), 'arranca en el de los videos')
  assert.ok(!fuente.includes("'arbrain.live.vista'"), 'la clave vieja no decide')
  const cara = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(cara.includes('const vivoOn = vivoPedido ?? banderaVivo'), 'sin prop manda la bandera, como antes')
  const ajustes = readFileSync(new URL('../../src/features/configuracion/components/ModalAjustes.tsx', import.meta.url), 'utf8')
  assert.ok(ajustes.includes('<SeccionLevyLive />'), 'la opción vive en Ajustes › Apariencia')
})
