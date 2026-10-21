/**
 * Evidencia del cursor fantasma (antes/después) sin quitarle la pantalla a Daniel: la misma cadena de acciones
 * sobre una Calculadora PROPIA, en los dos estilos, con la traza REAL de posiciones del panel (120 por segundo)
 * y la captura de la ventana. El video se compone con `render-fantasma.py`. Mide además cuánto tarda cada acción
 * (la animación nunca debe retrasarla).   npx tsx src/manos/fantasma-traza.ts <dir>
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AdaptadorCasa } from './adaptadores/casa.js'

const CALC = 'com.apple.calculator'
const dir = process.argv[2] ?? '/tmp'
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const m = new AdaptadorCasa({ quien: 'evidencia-fantasma' })
const antes = new Set((await m.apps()).filter(a => a.bundle === CALC).map(a => a.pid))
execFileSync('open', ['-g', '-n', '-a', 'Calculator'])
let pid = 0
for (let i = 0; i < 60 && !pid; i++) { await dormir(100); pid = (await m.apps()).find(a => a.bundle === CALC && !antes.has(a.pid))?.pid ?? 0 }
await dormir(900)
const w = (await m.ventanas({ pid })).find(v => v.marco.h > 150)!
await m.cliente.llamar('captura', { ventana: w.id, ruta: join(dir, 'ventana.png') }).catch(e => console.log('captura:', e.message))
const resultado: Record<string, unknown> = { ventana: w.marco }
for (const estilo of ['antes', 'humano']) {
  await m.cliente.llamar('fantasma', { estilo, traza: 'iniciar' })
  await dormir(300)
  const accionesMs: number[] = []
  const clic = async (et: string) => {
    const o = await m.observar({ pid, max_elementos: 300 })
    const ref = o.elementos.find(e => e.rol === 'AXButton' && (e.etiqueta === et || (et === 'Borrar todo' && e.etiqueta === 'Borrar')))?.ref
    if (!ref) return
    const t = performance.now()
    await m.actuar({ pid, accion: 'click', ref, asentar: false })
    accionesMs.push(Math.round((performance.now() - t) * 10) / 10)
  }
  // Cadena como la de un agente (~200 ms entre acciones), pausa, y dos clics en la misma zona.
  for (const et of ['Borrar todo', '1', '2', 'Multiplicar', '3', 'Es igual a']) { await clic(et); await dormir(200) }
  await dormir(1500)
  for (const et of ['9', '9']) { await clic(et); await dormir(300) }
  await dormir(1800)
  const { traza } = await m.cliente.llamar('fantasma', { traza: 'leer' })
  resultado[estilo] = { acciones_ms: accionesMs, traza }
  console.log(`${estilo}: ${traza.length} muestras · acción (ms) ${accionesMs.join(', ')}`)
  await dormir(4800) // que se desvanezca antes del siguiente estilo
}
await m.cliente.llamar('fantasma', { estilo: 'humano', traza: 'parar' })
await m.actuar({ pid, accion: 'tecla', tecla: 'q', modificadores: ['cmd'] })
await m.cerrar()
writeFileSync(join(dir, 'traza.json'), JSON.stringify(resultado))
process.exit(0)
