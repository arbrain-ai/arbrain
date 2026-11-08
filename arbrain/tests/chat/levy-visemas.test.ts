import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aperturaAtlas, boca, fonemas, g2p, pesosAtlas, pista, unirAlineacion, VISEMAS, type Alineacion } from '../../src/features/chat/lib/levy-visemas.ts'

/** Alineación sintética: cada carácter dura `ms` (los espacios también), como la de ElevenLabs. */
function al(texto: string, ms = 80): Alineacion {
  const chars = [...texto]
  return { chars, starts: chars.map((_, i) => i * ms / 1000), ends: chars.map((_, i) => (i + 1) * ms / 1000) }
}
const fon = (texto: string) => g2p(al(texto)).map(([f, v]) => `${f}:${v}`)

test('la h es muda y le pasa su tiempo a la letra siguiente', () => {
  assert.deepEqual(fon('hola'), ['o:O', 'l:nn', 'a:aa'])
  const [o] = g2p(al('hola'))
  assert.equal(o[2], 0, 'la o empieza donde empezaba la h')
  assert.equal(o[3], 0.16)
  // «ch» no es h muda
  assert.deepEqual(fon('chao'), ['ch:CH', 'a:aa', 'o:O'])
})

test('qu y gu delante de e/i: la u no suena; delante de a sí', () => {
  assert.deepEqual(fon('queso'), ['q:kk', 'e:E', 's:SS', 'o:O'])
  assert.deepEqual(fon('guiso'), ['g:kk', 'i:I', 's:SS', 'o:O'])
  assert.deepEqual(fon('guapo'), ['g:kk', 'u:U', 'a:aa', 'p:PP', 'o:O'])
  const [q] = g2p(al('queso'))
  assert.equal(q[3], 0.16, 'el dígrafo dura lo que la q y la u juntas')
})

test('ll, ch y rr son un solo fonema; seseo, y final, x = ks', () => {
  assert.deepEqual(fon('calle'), ['k:kk', 'a:aa', 'ʝ:CH', 'e:E'])
  assert.deepEqual(fon('perro'), ['p:PP', 'e:E', 'rr:RR', 'o:O'])
  assert.deepEqual(fon('cena zapato'), ['s:SS', 'e:E', 'n:nn', 'a:aa', 's:SS', 'a:aa', 'p:PP', 'a:aa', 't:DD', 'o:O'])
  assert.deepEqual(fon('hoy yo'), ['o:O', 'i:I', 'y:CH', 'o:O'])
  assert.deepEqual(fon('éxito'), ['e:E', 'k:kk', 's:SS', 'i:I', 't:DD', 'o:O'])
})

test('p, b, m y v cierran los labios; la f muerde', () => {
  assert.deepEqual(fon('vaca bomba'), ['b:PP', 'a:aa', 'k:kk', 'a:aa', 'b:PP', 'o:O', 'm:PP', 'b:PP', 'a:aa'])
  assert.deepEqual(fon('foco'), ['f:FF', 'o:O', 'k:kk', 'o:O'])
})

test('cada cierre p/b/m se fuerza en su cuadro, aunque dure menos que un cuadro', () => {
  // a ritmo normal (70 ms por letra) el canal «cierra» suavizado ya pasa de 0.5 en cada m/p (como fonemas.py)
  const lento = pista(fonemas(al('amapa', 70)), 0.6)
  for (const f of lento.fonemas.filter(f => f.v === 'PP')) assert.ok(boca(lento, (f.s + f.e) / 2 - 0.04).cierra > 0.5, f.f)
  // rápido (20 ms por letra): el suavizado solo llegaría a ~0.35; en el atlas el cierre se fuerza igual
  const p = pista(fonemas(al('     amapa', 20)), 0.4)   // los espacios dan 100 ms de aire antes (el adelanto no se sale del 0)
  const tes = ['sil', 'PP@1.00', 'aa@1.00', 'aa@0.50']
  for (const f of p.fonemas.filter(f => f.v === 'PP')) {
    // cualquier cuadro de 60 cps que caiga en el cierre (con el adelanto de 40 ms)
    for (const d of [0, 0.004, 0.008]) {
      const top = pesosAtlas(p, f.s - 0.04 + d, tes)
      assert.equal(top[0][0], 1, 'la tesela de cierre manda')
      assert.ok(top[0][1] >= 0.9, `peso de cierre ${top[0][1].toFixed(2)}`)
    }
  }
})

test('paridad con fonemas.py sobre la toma del 7 nov (fonemas y cuadros a 30 cps)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/levy-visemas-v3.json', import.meta.url), 'utf8'))
  const a = fx.alineacion, pad = fx.pad
  const F = fonemas({ chars: a.chars, starts: a.starts.map((x: number) => x + pad), ends: a.ends.map((x: number) => x + pad) }, { rms: fx.rms, frames: fx.rms.length })
  assert.equal(F.length, fx.fonemas.length)
  let malT = 0
  F.forEach((f, k) => {
    const e = fx.fonemas[k]
    assert.equal(f.f, e.f); assert.equal(f.v, e.v); assert.equal(f.tonica, e.tonica, `tónica ${k} ${f.letra}`)
    if (Math.abs(f.s - e.s) > 0.0015 || Math.abs(f.e - e.e) > 0.0015) malT++
    assert.ok(Math.abs(f.amp - e.amp) < 0.01, `amp ${k}: ${f.amp} vs ${e.amp}`)
  })
  assert.equal(malT, 0, 'tiempos afinados iguales')
  const p = pista(F, fx.dur)
  let peor = 0, peorPeso = 0
  fx.cuadros.forEach((c: number[], i: number) => {
    const b = boca(p, i / 30)
    const v = [b.abre, b.ancho, b.redondo, b.cierra, b.muerde]
    for (let j = 0; j < 5; j++) peor = Math.max(peor, Math.abs(v[j] - c[j]))
    VISEMAS.forEach((x, j) => { peorPeso = Math.max(peorPeso, Math.abs(b.pesos[x] - fx.pesos[i][j])) })
  })
  assert.ok(peor < 0.01, `canales: error máx ${peor.toFixed(4)}`)
  assert.ok(peorPeso < 0.01, `pesos: error máx ${peorPeso.toFixed(4)}`)
})

test('la mezcla del atlas: pesos ≤ 1, interpola la apertura de las vocales y respeta el tope de teselas', () => {
  const tes = ['sil', 'PP@1.00', 'FF@1.00', 'aa@1.00', 'O@1.00', 'aa@0.50', 'O@0.50']
  const F = fonemas(al('papá oo', 90))
  const p = pista(F, 1)
  for (let t = 0; t < 0.8; t += 0.005) {
    const w = pesosAtlas(p, t, tes, 3)
    assert.ok(w.length <= 3)
    const s = w.reduce((a, [, x]) => a + x, 0)
    assert.ok(s <= 1 + 1e-6, `suma ${s} en ${t}`)
    for (const [, x] of w) assert.ok(x >= 0)
  }
  // una vocal átona débil (amp 0.3 → apertura 0.57) reparte entre la media y la entera, nunca sola en la entera
  const F2 = F.map(f => (f.v === 'aa' && !f.tonica ? { ...f, amp: 0.3 } : f))
  const a = F2.find(f => f.v === 'aa' && !f.tonica)!
  const w = new Map(pesosAtlas(pista(F2, 1), (a.s + a.e) / 2 - 0.04, tes, 6))
  assert.ok((w.get(3) ?? 0) > 0 && (w.get(5) ?? 0) > 0, 'aa@1 y aa@0.5 a la vez')
  assert.ok(Math.abs((w.get(3) ?? 0) / ((w.get(3) ?? 0) + (w.get(5) ?? 0)) - (aperturaAtlas(a.amp) - 0.5) / 0.5) < 0.02)
  // la curva de apertura conserva el orden y satura en 1
  assert.ok(aperturaAtlas(0.4) < aperturaAtlas(0.6) && aperturaAtlas(0.6) < aperturaAtlas(0.75) && aperturaAtlas(1) === 1)
})

test('alineación en streaming: los trozos con tiempos relativos se corren al audio ya recibido', () => {
  const d: Alineacion = { chars: [], starts: [], ends: [] }
  unirAlineacion(d, { chars: ['h', 'o'], starts: [0, 0.1], ends: [0.1, 0.2] }, 0)
  unirAlineacion(d, { chars: ['l', 'a'], starts: [0, 0.1], ends: [0.1, 0.2] }, 0.2)    // relativo al trozo
  unirAlineacion(d, { chars: [' ', 'y'], starts: [0.4, 0.5], ends: [0.5, 0.6] }, 0.4)  // absoluto
  assert.deepEqual(d.starts.map(x => Math.round(x * 1000) / 1000), [0, 0.1, 0.2, 0.3, 0.4, 0.5])
})
