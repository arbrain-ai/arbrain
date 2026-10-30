/**
 * Prueba de concurrencia (en vivo, contra ArbrainManos): dos agentes sobre la misma ventana.
 *
 *   1. B quiere actuar mientras A tiene la ventana → B recibe «ocupada» con quién y desde cuándo (no se pisan en silencio).
 *   2. Regresión real del 2 oct: los refs que A leyó siguen valiendo aunque B observe la misma ventana
 *      con otras opciones (truncada, filtrada).
 *   3. Si B espera lo suficiente (A suelta), B actúa.
 *   4. En paralelo: A y B disparan a la vez; ninguna acción de B se cuela entre las de A.
 *
 * Usa la Calculadora y deja su pantalla como estaba. `npx tsx src/manos/concurrencia.ts`
 */
import { execFileSync } from 'node:child_process'
import { AdaptadorCasa } from './adaptadores/casa.js'
import type { Observacion } from './contrato.js'

const CALC = 'com.apple.calculator'
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const pantalla = (o: Observacion) => String(o.elementos.find(e => /campo de edición|edit field|main display/i.test(e.etiqueta ?? ''))?.valor ?? '')
const ref = (o: Observacion, etiqueta: string) => o.elementos.find(e => e.rol === 'AXButton' && e.etiqueta === etiqueta)?.ref

export async function probarConcurrencia(): Promise<{ ok: boolean; no_evaluable?: string; casos: { caso: string; ok: boolean; detalle: string }[] }> {
  const A = new AdaptadorCasa({ sesion: `prueba-A-${process.pid}`, quien: 'agente A' })
  const B = new AdaptadorCasa({ sesion: `prueba-B-${process.pid}`, quien: 'agente B' })
  const casos: { caso: string; ok: boolean; detalle: string }[] = []
  let { pid } = await A.abrir(CALC)
  await dormir(300)
  let propia: number | null = null
  const vs = (await A.ventanas({ pid })).filter(w => w.marco.h > 150)
  if (vs.length && !vs.some(w => w.en_pantalla)) {
    // La de Daniel está en otro escritorio: la prueba abre SU instancia aquí y la cierra al final.
    const antes = new Set((await A.apps()).filter(a => a.bundle === CALC).map(a => a.pid))
    execFileSync('open', ['-g', '-n', '-a', 'Calculator'])
    for (let i = 0; i < 60 && !propia; i++) { await dormir(100); const n = (await A.apps()).find(a => a.bundle === CALC && !antes.has(a.pid)); if (n && (await A.ventanas({ pid: n.pid })).some(w => w.en_pantalla && w.marco.h > 150)) propia = n.pid }
    if (!propia) { await A.cerrar(); await B.cerrar(); return { ok: false, no_evaluable: 'la Calculadora está en otro escritorio y no pude abrir una propia', casos } }
    pid = propia
  }
  let o = await A.observar({ pid, max_elementos: 400 })
  const antes = pantalla(o)
  const limpiar = async (m: AdaptadorCasa) => { for (let i = 0; i < 2; i++) { const x = await m.observar({ pid, max_elementos: 400 }); const r = ref(x, 'Borrar todo') ?? ref(x, 'Borrar'); if (r) await m.actuar({ pid, ventana: x.ventana, accion: 'click', ref: r, asentar: false }) } }
  try {
    // 1. A toma la ventana; B choca.
    await limpiar(A)
    o = await A.observar({ pid, max_elementos: 400 })
    const siete = ref(o, '7')!
    const b = await B.observar({ pid, max_elementos: 400 })
    const t0 = performance.now()
    const choque = await B.actuar({ pid, ventana: b.ventana, accion: 'click', ref: ref(b, '9')!, espera_candado_ms: 300, asentar: false })
    casos.push({ caso: 'B choca mientras A opera', ok: !choque.ok && /ocupada/.test(choque.detalle ?? '') && /agente A/.test(choque.detalle ?? ''), detalle: `${Math.round(performance.now() - t0)} ms · ${choque.detalle}` })

    // 2. B observa la misma ventana de otras formas; el ref de A sigue valiendo.
    await B.observar({ pid, ventana: o.ventana, max_elementos: 5 })
    await B.observar({ pid, ventana: o.ventana, consulta: 'Borrar' })
    await B.observar({ pid, ventana: o.ventana, max_elementos: 400 })
    const a7 = await A.actuar({ pid, ventana: o.ventana, accion: 'click', ref: siete, asentar: false })
    await dormir(150)
    const leido7 = pantalla(await A.observar({ pid, max_elementos: 400 }))
    casos.push({ caso: 'ref de A sobrevive a las lecturas de B', ok: a7.ok && leido7 === '7', detalle: `click ${siete} → ${a7.ok ? 'ok' : a7.detalle} · pantalla «${leido7}»` })

    // 3. A suelta; B actúa.
    await A.soltar()
    const b2 = await B.observar({ pid, max_elementos: 400 })
    const bOk = await B.actuar({ pid, ventana: b2.ventana, accion: 'click', ref: ref(b2, '8')!, espera_candado_ms: 300, asentar: false })
    await dormir(150)
    const leido78 = pantalla(await B.observar({ pid, max_elementos: 400 }))
    casos.push({ caso: 'B actúa cuando A suelta', ok: bOk.ok && leido78 === '78', detalle: `pantalla «${leido78}»` })
    await B.soltar()

    // 4. En paralelo: A teclea 1-2-3 y B 4-5-6 a la vez, sin esperar candado. Debe quedar la secuencia de uno solo.
    await limpiar(A); await A.soltar()
    const oa = await A.observar({ pid, max_elementos: 400 }), ob = await B.observar({ pid, max_elementos: 400 })
    const serie = async (m: AdaptadorCasa, ob: Observacion, ds: string[]) => { const r: boolean[] = []; for (const d of ds) r.push((await m.actuar({ pid, ventana: ob.ventana, accion: 'click', ref: ref(ob, d)!, espera_candado_ms: 0, asentar: false })).ok); return r }
    const [ra, rb] = await Promise.all([serie(A, oa, ['1', '2', '3']), serie(B, ob, ['4', '5', '6'])])
    await dormir(200)
    const final = pantalla(await A.observar({ pid, max_elementos: 400 }))
    const esperado = (ra.every(Boolean) ? '123' : '') + (rb.every(Boolean) ? '456' : '')
    const limpio = (ra.every(Boolean) && rb.every(x => !x)) || (rb.every(Boolean) && ra.every(x => !x))
    casos.push({ caso: 'en paralelo no se mezclan', ok: limpio && final.replace(/\D/g, '') === esperado, detalle: `A ${JSON.stringify(ra)} · B ${JSON.stringify(rb)} · pantalla «${final}»` })
    await A.soltar(); await B.soltar()
  } finally {
    // Dejar la pantalla como estaba.
    await A.soltar(); await B.soltar()
    await limpiar(A)
    o = await A.observar({ pid, max_elementos: 400 })
    for (const d of /^\d+$/.test(antes) && antes !== '0' ? antes.slice(0, 12) : '') { const r = ref(o, d); if (r) await A.actuar({ pid, ventana: o.ventana, accion: 'click', ref: r, asentar: false }) }
    await A.soltar()
    if (propia) await A.actuar({ pid: propia, accion: 'tecla', tecla: 'q', modificadores: ['cmd'] })
    await A.cerrar(); await B.cerrar()
  }
  return { ok: casos.every(c => c.ok), casos }
}

if (process.argv[1] && /concurrencia\.(ts|js)$/.test(process.argv[1])) {
  probarConcurrencia().then(r => {
    if (r.no_evaluable) { console.log(`CONCURRENCIA_NO_EVALUABLE: ${r.no_evaluable}`); process.exit(3) }
    for (const c of r.casos) console.log(`${c.ok ? 'OK ' : 'MAL'} ${c.caso.padEnd(40)} ${c.detalle}`)
    console.log(r.ok ? 'CONCURRENCIA_OK' : 'CONCURRENCIA_FALLO')
    process.exit(r.ok ? 0 : 1)
  })
}
