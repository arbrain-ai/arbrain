/**
 * Demo del cursor fantasma para evidencia (antes/después): abre una Calculadora PROPIA (open -n), graba la
 * ventana con `screencapture -v` mientras las manos hacen una cadena de clics como un agente, y la cierra.
 *   npx tsx src/manos/demo-fantasma.ts <salida.mov>
 */
import { execFileSync, spawn } from 'node:child_process'
import { AdaptadorCasa } from './adaptadores/casa.js'

const CALC = 'com.apple.calculator'
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
const salida = process.argv[2] ?? '/tmp/fantasma.mov'
const m = new AdaptadorCasa({ quien: 'demo-fantasma' })
const antes = new Set((await m.apps()).filter(a => a.bundle === CALC).map(a => a.pid))
execFileSync('open', ['-g', '-n', '-a', 'Calculator'])
let pid = 0
for (let i = 0; i < 60 && !pid; i++) { await dormir(100); pid = (await m.apps()).find(a => a.bundle === CALC && !antes.has(a.pid))?.pid ?? 0 }
await dormir(800)
const w = (await m.ventanas({ pid })).find(v => v.en_pantalla && v.marco.h > 150)!
const r = `${Math.round(w.marco.x - 60)},${Math.round(w.marco.y - 40)},${Math.round(w.marco.w + 120)},${Math.round(w.marco.h + 80)}`
// Solo para la evidencia que pidió Daniel: la ventana PROPIA al frente durante la grabación; luego se le devuelve el frente a su app.
const frente = (await m.apps()).find(a => a.activa)
await m.mostrar({ pid, ventana: w.id })
await dormir(400)
const grab = spawn('screencapture', ['-v', '-V', '9', '-x', '-R', r, salida], { stdio: 'ignore' })
await dormir(1200)
const ref = async (et: string) => (await m.observar({ pid, max_elementos: 300 })).elementos.find(e => e.rol === 'AXButton' && e.etiqueta === et)!.ref
// Cadena como la de un agente: observa → actúa, con ~200 ms entre acciones; luego una pausa y dos clics en la misma zona.
for (const et of ['Borrar todo', '1', '2', 'Multiplicar', '3', 'Es igual a']) {
  const rr = await ref(et).catch(() => null)
  if (rr) await m.actuar({ pid, accion: 'click', ref: rr, asentar: false })
  await dormir(200)
}
await dormir(1500)
for (const et of ['9', '9']) { const rr = await ref(et); await m.actuar({ pid, accion: 'click', ref: rr, asentar: false }); await dormir(300) }
await new Promise(res => grab.on('exit', res))
await m.actuar({ pid, accion: 'tecla', tecla: 'q', modificadores: ['cmd'] })
if (frente?.bundle) execFileSync('open', ['-b', frente.bundle])
await m.cerrar()
console.log(`grabado ${salida} · región ${r}`)
process.exit(0)
