import { test } from 'node:test'
import { strict as assert } from 'node:assert'

// El navegador mínimo que la tienda real necesita (corre en Node, con la lógica REAL de fijadas.ts y bus.ts).
const mem = new Map<string, string>()
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0 }
g.sessionStorage = g.localStorage

import { esEdicionCliente } from '../../src/lib/edicion'

// En la edición cliente el panel solo tiene lienzo, explorador, documento y memoria (lib/edicion.ts › VISTAS_CLIENTE):
// las pruebas que abren finanzas, negocio, calendario o tareas son de la instalación de Daniel y ahí se saltan.
const SOLO_ORIGINAL = esEdicionCliente() && 'edición cliente: el panel no tiene estas vistas'

const mano = (vista: string, extra: Record<string, unknown> = {}) => ({ vista, ...extra })

test('el cliente aplica soltar, guardar y fijar sobre el panel real, sin importar quién abrió la pestaña', { skip: SOLO_ORIGINAL }, async () => {
  const { usePanelFijadas } = await import('../../src/features/cabina/panel/fijadas')
  const { aplicar, estadoReal } = await import('../../src/features/cabina/panel/bus')
  const st = () => usePanelFijadas.getState()
  st().cargar()
  // El panel de las capturas de Daniel: todo abierto a mano desde el «+» (ids mano-…) salvo lo que fijó Levy.
  st().fijar('mano-finanzas-a', mano('finanzas') as never)
  st().fijar('mano-contenido-b', mano('contenido') as never)
  st().fijar('mano-negocio-c', mano('negocio', { seccion: 'oferta' }) as never)
  st().fijar('mano-equipo-d', mano('equipo') as never)
  st().fijar('mano-centro-e', mano('centro') as never)
  st().fijar('levy-masterclass', mano('documento', { ruta: 'docs/business-os/masterclass.md', titulo: 'Masterclass del 17' }) as never, true, { deLevy: true })
  st().fijar('mano-doc-pergamino', mano('documento', { ruta: '/Users/tu-usuario/Developer/artificial-brain/docs/business-os/cerebro-artificial-pergamino/index.html', titulo: 'Pergamino' }) as never)
  assert.equal(estadoReal().pestanas.length, 7)

  // soltar de vistas que abrió Daniel (la clave exacta de Levy no coincidía con la de él)
  for (const vista of ['finanzas', 'contenido', 'negocio', 'equipo', 'centro']) {
    const a = aplicar({ id: `c-${vista}`, accion: 'soltar', input: { vista } as never })
    assert.equal(a.ok, true, vista)
    assert.equal(a.cerradas.length, 1, vista)
  }
  assert.deepEqual(estadoReal().pestanas.map(p => p.id), ['levy-masterclass', 'mano-doc-pergamino'])

  // soltar de algo que no está: ok, sin cambios, lo dice
  const nada = aplicar({ id: 'c-nada', accion: 'soltar', input: { vista: 'finanzas' } as never })
  assert.equal(nada.ok, true); assert.match(nada.detalle, /no había/)

  // guardar sin fijar saca la pestaña de la barra; el documento se reconoce aunque venga con ruta absoluta
  const g1 = aplicar({ id: 'c-guardar', accion: 'guardar', input: { vista: 'documento', ruta: 'docs/business-os/masterclass.md' } as never })
  assert.deepEqual(g1.cerradas, ['Masterclass del 17'])
  assert.deepEqual(g1.pestanas.map(p => p.id), ['mano-doc-pergamino'])

  // soltar el pergamino por su ruta relativa (la pestaña la abrió Daniel con ruta absoluta)
  assert.equal(aplicar({ id: 'c-perg', accion: 'soltar', input: { vista: 'documento', ruta: 'docs/business-os/cerebro-artificial-pergamino/index.html' } as never }).cerradas.length, 1)
  assert.equal(estadoReal().pestanas.length, 0)

  // fijar muestra siempre: el documento «Octubre» queda abierto, a la vista y marcado como de Levy
  const f = aplicar({ id: 'c-octubre', accion: 'fijar', input: { vista: 'documento', ruta: 'docs/guardados/plan-octubre-2026/index.html', titulo: 'Octubre', fijar: true } as never, conversacion: 'conv-1' })
  assert.equal(f.ok, true); assert.deepEqual(f.abiertas, ['Octubre'])
  const octubre = estadoReal().pestanas.find(p => p.titulo === 'Octubre')
  assert.ok(octubre?.activa); assert.ok(octubre?.deLevy)
  // y el calendario en mes: una sola pestaña, que cambia de enfoque al pedirse otra vez
  aplicar({ id: 'c-cal1', accion: 'fijar', input: { vista: 'calendario', alcance: 'semana', fijar: true } as never })
  aplicar({ id: 'c-cal2', accion: 'fijar', input: { vista: 'calendario', alcance: 'mes', fijar: true } as never })
  const cal = st().fijadas.filter(x => x.input.vista === 'calendario')
  assert.equal(cal.length, 1); assert.equal(cal[0].input.alcance, 'mes')

  // Servidores vive en el Taller (5 oct 2026): fijarla abre Taller › Servidores, sin pestaña propia
  const antes = st().fijadas.length
  const srv = aplicar({ id: 'c-srv', accion: 'fijar', input: { vista: 'servidores', fijar: true } as never })
  assert.equal(srv.ok, true); assert.deepEqual(srv.abiertas, ['Taller · Máquina'])
  assert.equal(st().taller, true); assert.equal(st().activa, 'taller'); assert.equal(st().fijadas.length, antes)
  const { useSegmentoTaller } = await import('../../src/features/cabina/panel/taller-segmento')
  assert.equal(useSegmentoTaller.getState().segmento, 'maquina')

  // guardar + fijar: queda abierta y marcada como guardada
  aplicar({ id: 'c-gf', accion: 'guardar', input: { vista: 'finanzas', fijar: true } as never })
  assert.ok(estadoReal().pestanas.find(p => p.vista === 'finanzas')?.guardada)
})

test('tres pedidos en cola (7 oct, videos a/c/b) se aplican todos al reconectar', async () => {
  const { usePanelFijadas } = await import('../../src/features/cabina/panel/fijadas')
  const { aplicar, estadoReal } = await import('../../src/features/cabina/panel/bus')
  const st = () => usePanelFijadas.getState()
  for (const f of [...st().fijadas]) st().cerrar(f.id)
  const ruta = (x: string) => `~/Developer/labs/god-animation/practicas/2026-10-07-arbrain-un-cerebro-${x}/final.mp4`
  const cola = ['a', 'c', 'b'].map((x, i) => ({ id: `c-cola${i}`, accion: 'fijar' as const, conversacion: 'conv-7oct', input: { vista: 'documento', ruta: ruta(x), titulo: `Video ${x}`, fijar: true } as never }))
  for (const cmd of cola) assert.equal(aplicar(cmd).ok, true)
  assert.deepEqual(estadoReal().pestanas.map(p => p.titulo), ['Video a', 'Video c', 'Video b'])
  // y volver a recibir la misma cola (la ventana recargó antes de acusar) no pierde ni duplica nada
  for (const cmd of cola) aplicar(cmd)
  assert.equal(estadoReal().pestanas.length, 3)
})

test('dos ventanas (7 oct 2026): lo que Levy abre cae en la ventana elegida; el Día y el Taller de la otra no reciben nada; el acuse dice dónde', { skip: SOLO_ORIGINAL }, async () => {
  const { usePanelFijadas } = await import('../../src/features/cabina/panel/fijadas')
  const { aplicar, estadoReal } = await import('../../src/features/cabina/panel/bus')
  const st = () => usePanelFijadas.getState()
  // Estado limpio: Tareas y Taller viven en la Ventana 1 (la de la derecha, donde Daniel los tiene).
  for (const f of [...st().fijadas]) st().cerrar(f.id)
  st().moverAVentana('tareas', 'ventana-1'); st().moverAVentana('taller', 'ventana-1')
  assert.equal(estadoReal().casaEn.tareas, 'Ventana 1'); assert.equal(estadoReal().casaEn.taller, 'Ventana 1')

  // El destino resuelto es el panel principal (la izquierda): la pestaña nace ahí y la Ventana 1 no recibe nada.
  const a = aplicar({ id: 'c-izq', accion: 'fijar', input: { vista: 'documento', ruta: 'docs/a.html', titulo: 'A', fijar: true } as never }, { ventana: 'principal', texto: 'Panel principal (la de la izquierda)' })
  assert.deepEqual(a.abiertas, ['A']); assert.equal(a.donde, 'Panel principal (la de la izquierda)')
  assert.equal(st().enVentana['levy-c-izq'], undefined)
  assert.deepEqual(Object.entries(st().enVentana).sort(), [['taller', 'ventana-1'], ['tareas', 'ventana-1']])

  // Si Daniel pone el destino en la Ventana 1: nace allí, directo (sin pasar por el panel principal), y el acuse lo dice.
  const b = aplicar({ id: 'c-der', accion: 'fijar', input: { vista: 'documento', ruta: 'docs/b.html', titulo: 'B', fijar: true } as never }, { ventana: 'ventana-1', texto: 'Ventana 1 (la de la derecha)' })
  assert.equal(st().enVentana['levy-c-der'], 'ventana-1')
  assert.equal(b.donde, 'Ventana 1 (la de la derecha)')
  const reporte = b.pestanas.find(p => p.id === 'levy-c-der')
  assert.equal(reporte?.enVentana, true); assert.equal(reporte?.ventana, 'Ventana 1')

  // Una pestaña que ya existe se queda donde Daniel la tenía, aunque el destino sea otro; el acuse lo dice.
  const c = aplicar({ id: 'c-otra', accion: 'fijar', input: { vista: 'documento', ruta: 'docs/a.html', titulo: 'A', fijar: true } as never }, { ventana: 'ventana-1', texto: 'Ventana 1 (la de la derecha)' })
  assert.equal(st().enVentana['levy-c-izq'], undefined)
  assert.match(c.donde ?? '', /Panel principal \(ya estaba abierta ahí\)/)

  // Sin destino (comportamiento de siempre): panel principal.
  aplicar({ id: 'c-sin', accion: 'fijar', input: { vista: 'documento', ruta: 'docs/c.html', titulo: 'C', fijar: true } as never })
  assert.equal(st().enVentana['levy-c-sin'], undefined)

  // Soltar no se mueve a ningún lado.
  const s = aplicar({ id: 'c-s', accion: 'soltar', input: { vista: 'documento', ruta: 'docs/b.html' } as never }, { ventana: 'ventana-1', texto: 'x' })
  assert.equal(s.donde, undefined)
})
