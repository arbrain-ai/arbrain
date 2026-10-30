/**
 * Banco de pruebas en vivo del nodo A (noche 2–3 oct 2026): pedidos crudos a ArbrainManos.app.
 *   npx tsx src/manos/noche-a.ts llamar '<json>'      → un pedido crudo, imprime la respuesta
 *   npx tsx src/manos/noche-a.ts observar <app> [consulta]
 * Las pruebas que mueven el cursor o teclean toman antes el candado /tmp/manos-pantalla.lock (lo hace quien llama).
 */
import { ClienteCasa } from './adaptadores/casa.js'

const c = new ClienteCasa(undefined, undefined, undefined, 'nodo-a')
const [cmd, ...resto] = process.argv.slice(2)
try {
  if (cmd === 'llamar') {
    const p = JSON.parse(resto[0])
    const { op, ...args } = p
    console.log(JSON.stringify(await c.llamar(op, args, 120_000), null, 1).slice(0, Number(process.env.MAX ?? 6000)))
  } else if (cmd === 'observar') {
    const r = await c.llamar('observar', { app: resto[0], ...(resto[1] ? { consulta: resto[1] } : {}), max_elementos: 1500 })
    console.log(`${r.app} pid ${r.pid} ventana ${r.ventana} «${r.titulo}» ${r.url ?? ''}\n${String(r.texto).slice(0, Number(process.env.MAX ?? 6000))}`)
  }
} catch (e) { console.log('ERROR', (e as Error).message) }
c.cerrar()
process.exit(0)
