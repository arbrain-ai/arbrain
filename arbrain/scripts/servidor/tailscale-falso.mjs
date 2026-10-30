#!/usr/bin/env node
/**
 * `tailscale` falso para las pruebas del teléfono (tests/servidor/telefono.test.ts, prueba-telefono.mjs y la CI
 * e2e-telefono.yml). Anota cada llamada en `<dir>/registro.jsonl` y guarda la publicación de `serve` en `<dir>/serve.json`.
 *
 *   ARBRAIN_TAILSCALE=<ruta a este archivo>          (telefono.mjs lo corre con el mismo Node)
 *   ARBRAIN_TAILSCALE_FALSO_DIR=<carpeta>            dónde anota (obligatoria)
 *   ARBRAIN_TAILSCALE_FALSO_ESTADO=Running|NeedsLogin|Stopped   (por defecto Running)
 *   ARBRAIN_TAILSCALE_FALSO_HTTPS=0                  la red no tiene HTTPS: `serve` imprime el enlace y se queda esperando
 *   ARBRAIN_TAILSCALE_FALSO_HOST=<nombre MagicDNS> (por defecto maquina.ejemplo.ts.net)
 *
 * `funnel` siempre falla con código 3 (el teléfono nunca debe pedirlo; la prueba lo exige en el registro).
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.ARBRAIN_TAILSCALE_FALSO_DIR
if (!dir) { console.error('falta ARBRAIN_TAILSCALE_FALSO_DIR'); process.exit(9) }
mkdirSync(dir, { recursive: true })
const args = process.argv.slice(2).filter((a) => !a.startsWith('--socket='))
appendFileSync(join(dir, 'registro.jsonl'), JSON.stringify({ t: new Date().toISOString(), args: process.argv.slice(2) }) + '\n')

const estado = process.env.ARBRAIN_TAILSCALE_FALSO_ESTADO || 'Running'
const host = process.env.ARBRAIN_TAILSCALE_FALSO_HOST || 'maquina.ejemplo.ts.net'
const https = process.env.ARBRAIN_TAILSCALE_FALSO_HTTPS !== '0'
const rutaServe = join(dir, 'serve.json')
const leerServe = () => { try { return JSON.parse(readFileSync(rutaServe, 'utf8')) } catch { return {} } }
const esperar = () => setInterval(() => {}, 1000)

const [orden, ...resto] = args
if (orden === 'status' && resto.includes('--json')) {
  const base = { Version: '1.90.0-falso', BackendState: estado, AuthURL: '', CertDomains: https ? [host] : null, CurrentTailnet: { Name: 'prueba@ejemplo.com', MagicDNSSuffix: 'ejemplo.ts.net', MagicDNSEnabled: true } }
  const self = estado === 'Running' ? { DNSName: `${host}.`, HostName: 'maquina', CapMap: https ? { https: null } : {} } : { DNSName: '' }
  console.log(JSON.stringify({ ...base, Self: self }, null, 2))
  process.exit(0)
}
if (orden === 'login' || orden === 'up') {
  console.log('\nTo authenticate, visit:\n\n\thttps://login.tailscale.com/a/falso0123456789\n')
  esperar()
} else if (orden === 'funnel') {
  console.error('tailscale-falso: funnel no se usa en Arbrain')
  process.exit(3)
} else if (orden === 'serve' && resto[0] === 'status') {
  console.log(JSON.stringify(leerServe(), null, 2))
  process.exit(0)
} else if (orden === 'serve') {
  if (estado !== 'Running') { console.error('serve: not connected'); process.exit(1) }
  const puerto = Number((resto.find((a) => a.startsWith('--https=')) ?? '--https=443').slice(8))
  const destino = resto.filter((a) => !a.startsWith('--')).pop()
  const sc = leerServe()
  const clave = `${host}:${puerto}`
  if (destino === 'off') {
    if (sc.Web) delete sc.Web[clave]
    if (sc.TCP) delete sc.TCP[String(puerto)]
    writeFileSync(rutaServe, JSON.stringify(sc))
    process.exit(0)
  }
  if (!https) {
    console.log('\nServe is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/serve?node=falso\n')
    esperar()
  } else {
    sc.TCP = { ...(sc.TCP ?? {}), [String(puerto)]: { HTTPS: true } }
    sc.Web = { ...(sc.Web ?? {}), [clave]: { Handlers: { '/': { Proxy: destino } } } }
    writeFileSync(rutaServe, JSON.stringify(sc))
    console.log(`Available within your tailnet:\n\nhttps://${host}${puerto === 443 ? '' : `:${puerto}`}/\n|-- proxy ${destino}\n\nServe started and running in the background.`)
    process.exit(0)
  }
} else {
  console.error(`tailscale-falso: orden no simulada: ${args.join(' ')}`)
  process.exit(2)
}
