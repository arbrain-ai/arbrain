// Atlas de cabeza (19 nov 2026, PRUEBA, apagada por defecto): la cabeza gira e inclina con campos horneados con LivePortrait.
// Sin la bandera el rig y Live son exactamente los de antes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { CABEZA_LP_CLAVE, cabezaLPActiva } from '../../src/features/chat/lib/levy-vivo.ts'

const publico = (url: string) => new URL(`../../public${url}`, import.meta.url)

test('el manifiesto del atlas de cabeza: rejilla 5×5 de giro × inclinación con el neutro en medio', () => {
  const m = JSON.parse(readFileSync(publico('/levy-face/medio/cabeza/cabeza.json'), 'utf8')) as { archivo: string; lado: number; rejilla: [number, number]; yaw: number[]; pitch: number[]; rango: number }
  assert.ok(existsSync(publico(`/levy-face/medio/cabeza/${m.archivo}`)))
  assert.deepEqual(m.rejilla, [m.yaw.length, m.pitch.length])
  assert.ok(m.yaw.includes(0) && m.pitch.includes(0), 'el neutro (el retrato) está en la rejilla')
  for (const v of [m.yaw, m.pitch]) for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1], 'valores crecientes')
  assert.ok(m.rango > 0 && m.rango < 128 && m.lado === 256)
})

test('la bandera arranca apagada y se enciende con ?levyCabezaLP=1', () => {
  const mem = new Map<string, string>()
  const ventana = (search: string) => { (globalThis as { window?: unknown }).window = { location: { search }, localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } } } }
  ventana(''); assert.equal(cabezaLPActiva(), false)
  ventana('?levyCabezaLP=1'); assert.equal(cabezaLPActiva(), true); assert.equal(mem.get(CABEZA_LP_CLAVE), '1')
  ventana(''); assert.equal(cabezaLPActiva(), true, 'queda guardada')
  ventana('?levyCabezaLP=0'); assert.equal(cabezaLPActiva(), false)
  delete (globalThis as { window?: unknown }).window
})

test('sin la bandera nada cambia: el rig solo usa el atlas con capas.cabeza y LevyFace solo lo pide con la bandera', () => {
  const rig = readFileSync(publico('/levy-face/rig/rig.js'), 'utf8')
  assert.ok(rig.includes('if (capas.cabeza) {'), 'el atlas solo se carga con la opción')
  assert.ok(rig.includes('if (uCabezaOn > 0.5) p += campoCabeza(p);'), 'el campo solo se aplica con el atlas cargado')
  assert.ok(rig.includes("gl.uniform1f(this.u.uCabezaOn, C ? 1 : 0);"))
  const f = readFileSync(new URL('../../src/features/chat/components/LevyFace.tsx', import.meta.url), 'utf8')
  assert.ok(f.includes('...(cabezaLP ? { cabeza: MEDIO_CABEZA_LP } : {})'), 'LevyFace lo pide solo con la bandera')
  assert.ok(f.includes('const [cabezaLP, setCabezaLP] = useState(false)'), 'apagada hasta leer la bandera al montar')
})
