/**
 * Demo en vivo: las manos dibujan un perrito en sfmap en ~1 minuto, en una página NUEVA, con el lápiz
 * de la app y el cursor fantasma. Todo por la interfaz (menú, doble clic, teclas, trazos); nada por API.
 *
 *   cd arbrain/server && npx tsx src/manos/lienzo/demo-perrito.ts [--segundos 60] [--nombre "Perrito"] [--sin-frente]
 *
 * Pasos: abrir sfmap → traerla al frente (es una demo: se mira) → ⌘N «Lienzo nuevo» → doble clic en su fila y
 * nombre → clic en el lienzo y tecla P (lápiz) → 33 trazos → verificación por píxeles → foco de vuelta.
 * Sale con código 0 solo si el dibujo está en la página (≥ 80 % de las muestras oscuras).
 */
import { ClienteCasa } from '../adaptadores/casa.js'
import { largo, perritoEn } from './perrito.js'

const APP = 'com.saasfactory.sfmap'

function arg(nombre: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : def
}

export interface ResultadoDemo { ok: boolean; pagina: string; segundos: number; dibujo_s: number; oscuras: number; muestras: number; cursor_real_movido: boolean; pasos: string[] }

export async function demoPerrito(opts: { segundos?: number; nombre?: string; alFrente?: boolean; cliente?: ClienteCasa } = {}): Promise<ResultadoDemo> {
  const c = opts.cliente ?? new ClienteCasa(undefined, undefined, undefined, 'demo-perrito')
  const objetivo = opts.segundos ?? 60
  const t0 = Date.now()
  const pasos: string[] = []
  const paso = (s: string) => { pasos.push(`${((Date.now() - t0) / 1000).toFixed(1)} s · ${s}`); if (!opts.cliente) console.log(pasos[pasos.length - 1]) }
  const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

  const abierta = await c.llamar('abrir', { app: APP })
  const pid = abierta.pid
  paso(`sfmap abierta (pid ${pid})`)
  const ventana = (await c.llamar('ventanas', { pid })).filter((v: any) => v.en_pantalla && v.marco.h > 300).sort((a: any, b: any) => b.z - a.z)[0]
  if (!ventana) throw new Error('sfmap no tiene ventana en pantalla')
  const W = ventana.marco.w, H = ventana.marco.h
  if (opts.alFrente !== false) { await c.llamar('mostrar', { pid, ventana: ventana.id }); paso('al frente para que se vea') }

  // Página nueva por el menú (⌘N = Archivo › Lienzo nuevo).
  await c.llamar('actuar', { pid, ventana: ventana.id, accion: 'tecla', tecla: 'n', modificadores: ['cmd'] })
  await esperar(500)
  const nombre = opts.nombre ?? `Perrito de las manos ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
  const obs = await c.llamar('observar', { pid, ventana: ventana.id, consulta: 'Lienzo nuevo' })
  const fila = (obs.elementos ?? []).find((e: any) => e.etiqueta === 'Lienzo nuevo' && e.marco.x - ventana.marco.x < 380 && e.marco.y - ventana.marco.y > 120)
  if (fila) {
    const x = fila.marco.x - ventana.marco.x + fila.marco.w / 2, y = fila.marco.y - ventana.marco.y + fila.marco.h / 2
    await c.llamar('clic_xy', { pid, ventana: ventana.id, x, y, veces: 2, devolver_foco: false })
    await esperar(300)
    const campo = ((await c.llamar('observar', { pid, ventana: ventana.id, consulta: 'Lienzo nuevo' })).elementos ?? []).find((e: any) => e.rol === 'AXTextField' && e.valor === 'Lienzo nuevo')
    if (campo) {
      await c.llamar('actuar', { pid, ventana: ventana.id, accion: 'valor', ref: campo.ref, valor: nombre })
      await c.llamar('actuar', { pid, ventana: ventana.id, accion: 'tecla', ref: campo.ref, tecla: 'return' })
      paso(`página nueva «${nombre}»`)
    } else paso('página nueva (el campo de nombre no apareció: queda «Lienzo nuevo»)')
  } else paso('página nueva (panel de lienzos cerrado: queda «Lienzo nuevo»)')

  // El lienzo: lo que queda a la derecha del panel. Clic en vacío para el foco y P = lápiz.
  const izq = fila ? 430 : 80
  const cx = Math.round((izq + W) / 2 + 40), cy = Math.round(H / 2 + 10)
  const k = Math.min(1.1, (H - 220) / 460, (W - izq - 160) / 440)
  await c.llamar('clic_xy', { pid, ventana: ventana.id, x: W - 60, y: 140, devolver_foco: false })
  await c.llamar('actuar', { pid, ventana: ventana.id, accion: 'tecla', tecla: 'p' })
  paso('lápiz en la mano')

  const trazos = perritoEn(cx, cy, k)
  const L = largo(trazos)
  const preparacion = (Date.now() - t0) / 1000
  const dibujo = Math.max(15, objetivo - preparacion - 2)
  // Con rampas y frenado en curvas la mano va a ~70 % de crucero; 33 pausas de ~0.115 s entre trazos.
  const velocidad = Math.max(120, Math.min(1500, L / (0.7 * (dibujo - trazos.length * 0.115))))
  const td = Date.now()
  const r = await c.llamar('trazo', { pid, ventana: ventana.id, trazos, velocidad: Math.round(velocidad), presion: 0.75, devolver_foco: true }, 5 * 60_000)
  const dibujo_s = (Date.now() - td) / 1000
  paso(`perrito: ${trazos.length} trazos, ${r.eventos} eventos, ${dibujo_s.toFixed(1)} s, cursor real ${r.cursor_real_movido ? 'MOVIDO' : 'quieto'}`)

  // Verificación por píxeles sobre la línea de la cabeza, el cuerpo y el piso.
  await esperar(400)
  const muestras = [0, 15, 16, 32].flatMap(i => trazos[i].filter((_, j) => j % 3 === 0))
  const colores = (await c.llamar('pixel', { pid, ventana: ventana.id, puntos: muestras })).colores as { hex: string }[]
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) }
  const oscuras = colores.filter(x => x.hex && lum(x.hex) < 120).length
  const ok = oscuras >= 0.8 * colores.length
  paso(`verificación: ${oscuras}/${colores.length} muestras oscuras → ${ok ? 'DIBUJADO' : 'NO SE VE EL DIBUJO'}`)
  return { ok, pagina: nombre, segundos: (Date.now() - t0) / 1000, dibujo_s, oscuras, muestras: colores.length, cursor_real_movido: !!r.cursor_real_movido, pasos }
}

if (process.argv[1] && /demo-perrito\.(ts|js)$/.test(process.argv[1])) {
  demoPerrito({ segundos: Number(arg('segundos', '60')), nombre: arg('nombre'), alFrente: !process.argv.includes('--sin-frente') })
    .then(r => { console.log(JSON.stringify({ ...r, pasos: undefined })); process.exit(r.ok ? 0 : 1) })
    .catch(e => { console.error('DEMO_FALLO', e.message); process.exit(2) })
}
