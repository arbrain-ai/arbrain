import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deshacible, enOrden, estadoDecidida, fraseEspera, lineaRecomendacion, minutos, recomendadas, VENCIDA_A_LA_VISTA_MS, vencidasRecientes, type Tarjeta, type VistaBandeja } from '../src/features/decisiones/lib/bandeja'
import { seQuedaAlReabrir } from '../src/features/cabina/panel/telefono-logica'

const t = (o: Partial<Tarjeta>): Tarjeta => ({ id: 'cf_000000000001', estado: 'en_cola', tipo: 'decision', categoria: 'enviar', origen: 'agente', titulo: 'x', creada: 1, irreversible: true, ...o })

test('en orden: la que más lleva esperando primero; en lote solo las que Levy recomienda con Sí', () => {
  const lista = [t({ id: 'b', creada: 20, recomienda: 'si', categoria: 'otra' }), t({ id: 'a', creada: 10, recomienda: 'no' }), t({ id: 'c', creada: 30, recomienda: 'si', tipo: 'manos' })]
  assert.deepEqual(enOrden(lista).map(x => x.id), ['a', 'b', 'c'])
  assert.deepEqual(recomendadas(lista).map(x => x.id), ['b'])   // «Córrelo tú» nunca va en lote
})

test('la recomendación se dice en voz de Levy, sin repetir el sí o el no', () => {
  assert.equal(lineaRecomendacion(t({ recomienda: 'si', recomendacion: 'Sí: es parte de lo que pediste' })), 'Recomiendo que sí: es parte de lo que pediste')
  assert.equal(lineaRecomendacion(t({ recomienda: 'no', recomendacion: 'todavía no llega la factura' })), 'Recomiendo que no: todavía no llega la factura')
  assert.equal(lineaRecomendacion(t({})), null)
})

test('la métrica del día en una frase', () => {
  assert.equal(minutos(42), '42 min')
  assert.equal(minutos(125), '2 h 5 min')
  assert.equal(fraseEspera({ dia: '2026-11-03', minutos: 42, tarjetas: 2, abiertas: 1 }), 'Hoy el sistema esperó 42 min por ti (2 decisiones, 1 abierta).')
  assert.match(fraseEspera({ dia: '2026-11-03', minutos: 0, tarjetas: 0, abiertas: 0 }), /no ha esperado/)
})

test('estado de lo decidido y qué se puede deshacer', () => {
  assert.equal(estadoDecidida(t({ respuesta: 'otro', comentario: 'por correo' })), 'Otro: «por correo»')
  assert.equal(estadoDecidida(t({ estado: 'usada' })), 'Sí')
  assert.equal(deshacible({ ts: 'x', clase: 'configurar', que: 'y', sesion: 's' }), true)
  assert.equal(deshacible({ ts: 'x', clase: 'configurar', que: 'y' }), false)
})

test('volver a la bandeja del teléfono tras mirar otra app no te manda al chat', () => {
  assert.equal(seQuedaAlReabrir('/telefono/decisiones'), true)
})

test('«Sí a todas» (3 nov 2026): nunca agrupa contactar ni pagar; esas van una por una', () => {
  const lista = [t({ id: 'a', recomienda: 'si', categoria: 'otra' }), t({ id: 'b', recomienda: 'si', categoria: 'enviar' }), t({ id: 'c', recomienda: 'si', categoria: 'pagar' }),
    t({ id: 'd', recomienda: 'si', categoria: 'borrar' }), t({ id: 'e', recomienda: 'si', categoria: 'otra', unaPorUna: true }), t({ id: 'f', recomienda: 'no', categoria: 'otra' })]
  assert.deepEqual(recomendadas(lista).map(x => x.id), ['a', 'd'])
})

test('lo que venció porque su hora pasó: «ya no aplica», a la vista un rato y luego solo en el historial', () => {
  const ahora = 1_000_000_000
  const v = { vencidasHoy: [t({ id: 'reciente', estado: 'vencida', resuelta: ahora - 60_000 }), t({ id: 'vieja', estado: 'vencida', resuelta: ahora - VENCIDA_A_LA_VISTA_MS - 1 })] } as unknown as VistaBandeja
  assert.deepEqual(vencidasRecientes(v, ahora).map(x => x.id), ['reciente'])
  assert.equal(estadoDecidida(t({ estado: 'vencida' })), 'ya no aplica')
  assert.deepEqual(vencidasRecientes(null, ahora), [])
})

test('la franja vive en el Día de hoy, arriba del objetivo, y en /telefono; la píldora lleva ahí y cuenta lo mismo', () => {
  const f = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')
  const dia = f('features/planning/DiaVivo.tsx')
  assert.match(dia, /const decisiones = esHoy && !snapshot\?\.perfil \? <FranjaDecisiones \/> : null/)
  assert.ok(dia.indexOf('{decisiones}') < dia.indexOf('{franja}'), 'decisiones → objetivo')
  assert.match(f('features/cabina/panel/PanelTelefono.tsx'), /<FranjaDecisiones compacta \/>/)
  const pildora = f('features/cabina/panel/AgentesTrabajando.tsx')
  assert.match(pildora, /const espera = useBandeja\(15_000\)\.vista\?\.pendientes\.length/)
  assert.match(pildora, /onClick=\{irADecisiones\} data-testid="te-espera"/)
  assert.match(pildora, /abrirSeccion\(\{ vista: 'calendario', alcance: 'dia' \}\)/)
  assert.match(f('features/decisiones/FranjaDecisiones.tsx'), /const pendientes = enOrden\(b\.vista\?\.pendientes \?\? \[\]\)/)
})
