#!/usr/bin/env node
/**
 * Prueba de punta a punta de «Tu cerebro en el teléfono» (23 oct 2026; docs/builds/modo-espejo-2026-10-23/spec.md, N1).
 * La corren la CI (arbrain-ai/e2e-instalacion › e2e-telefono.yml) y cualquiera a mano:
 *
 *   node arbrain/scripts/servidor/prueba-telefono.mjs [--datos <carpeta>] [--repo-original] [--compilar] [--mantener] [--plazo-min <n>]
 *
 * Arranca Arbrain en modo servidor con un `tailscale` falso (tailscale-falso.mjs, anota sus argumentos) y simula lo que
 * hace `tailscale serve`: peticiones a 127.0.0.1:<web> con `Host: maquina.ejemplo.ts.net` y
 * `X-Forwarded-Proto: https`. Demuestra:
 *   1. Con el teléfono apagado, ese Host recibe 421 (también con sesión).
 *   2. `telefono encender` publica con `serve` (nunca `funnel`) y la web acepta el Host.
 *   3. Sin contraseña: página → /sin-sesion, API → 401; contraseña mala → rechazo.
 *   4. Con contraseña: cookie con `Secure`; con ella, una página y una API en 200.
 *   5. `manifest-cliente.json` («Tu Arbrain», con sus iconos) y `sw.js` válidos por ese Host.
 *   6. Código de un solo uso desde Ajustes: entra una vez; la segunda, no.
 *   7. En claro (sin X-Forwarded-Proto https) ese Host no entra; escrituras de otro origen, 403.
 *   8. `telefono apagar` quita la publicación y el Host vuelve a 421.
 * Con `--mantener` lo deja encendido y corriendo al final (para la captura de Ajustes en CI; luego `detener`).
 * Nunca imprime la contraseña ni el código. Usa su propia carpeta de datos: no toca la instalación de nadie.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../servidor.mjs', import.meta.url))
const FALSO = fileURLToPath(new URL('./tailscale-falso.mjs', import.meta.url))
const argv = process.argv.slice(2)
const opcion = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const DATOS = resolve(opcion('--datos') ?? join(tmpdir(), `arbrain-telefono-${process.pid}`))
const PLAZO_MS = Number(opcion('--plazo-min') ?? 30) * 60_000
const EXTRA = ['--repo-original', '--compilar'].filter((f) => argv.includes(f))
const HOST = '127.0.0.1'
const TS = 'maquina.ejemplo.ts.net'
const DIR_FALSO = join(DATOS, 'tailscale-falso')
const ENV = { ...process.env, ARBRAIN_SERVIDOR_DATOS: DATOS, ARBRAIN_TAILSCALE: FALSO, ARBRAIN_TAILSCALE_FALSO_DIR: DIR_FALSO }
const t0 = Date.now()
const log = (m) => console.log(`[prueba-telefono ${Math.round((Date.now() - t0) / 1000)} s] ${m}`)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const resultados = []
const ok = (m) => { resultados.push(`OK ${m}`); log(`OK ${m}`) }

function puertoLibre() {
  return new Promise((si, no) => { const s = net.createServer(); s.once('error', no); s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => si(port)) }) })
}

/** Petición cruda a la web con los encabezados que pone `tailscale serve` (o los que se pidan). */
function pedir(port, ruta, { metodo = 'GET', host = TS, proto = 'https', cookie, cuerpo, tipo, origen } = {}) {
  return new Promise((ok) => {
    const datos = cuerpo === undefined ? undefined : Buffer.from(cuerpo)
    const headers = { Host: host, ...(proto ? { 'X-Forwarded-Proto': proto, 'X-Forwarded-For': '100.64.0.0' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(origen ? { Origin: origen } : {}),
      ...(datos ? { 'Content-Type': tipo ?? 'application/json', 'Content-Length': datos.length } : {}) }
    const req = http.request({ host: HOST, port, path: ruta, method: metodo, timeout: 30_000, headers }, (res) => {
      const partes = []
      res.on('data', (c) => partes.push(c))
      res.on('end', () => {
        const b = Buffer.concat(partes)
        let json = null
        try { json = JSON.parse(b.toString('utf8')) } catch { /* */ }
        ok({ status: res.statusCode ?? 0, headers: res.headers, texto: b.toString('utf8'), bytes: b, json })
      })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => ok({ status: 0, headers: {}, texto: '', bytes: Buffer.alloc(0), json: null }))
    if (datos) req.write(datos)
    req.end()
  })
}

const proceso = () => { try { return JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'servidor.json'), 'utf8')) } catch { return null } }
const acceso = () => JSON.parse(readFileSync(join(DATOS, 'daemon', 'config', 'acceso.json'), 'utf8'))
const registro = () => { try { return readFileSync(join(DIR_FALSO, 'registro.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).args.join(' ')) } catch { return [] } }
const orden = (...a) => spawnSync(process.execPath, [SCRIPT, ...a, '--datos', DATOS], { encoding: 'utf8', timeout: 180_000, env: ENV })
const ultima = (s) => (s ?? '').trim().split(/\r?\n/).pop() ?? ''
/** Página con sesión: sigue redirecciones propias (la primera vez /chat lleva a /bienvenida). Devuelve la última respuesta y su ruta. */
async function pagina(port, ruta, op = {}) {
  let r, actual = ruta
  for (let i = 0; i < 4; i++) {
    r = await pedir(port, actual, op)
    const a = r.headers.location
    if (![301, 302, 303, 307, 308].includes(r.status) || !a) break
    actual = new URL(a, 'http://x').pathname
  }
  return { ...r, ruta: actual }
}
const cookieDe = (r) => String([].concat(r.headers['set-cookie'] ?? [])[0] ?? '')

let supervisor = null
let salida = null
async function fallar(msg) {
  console.error(`\n[prueba-telefono] FALLÓ: ${msg}\n`)
  const dir = join(DATOS, 'logs')
  if (existsSync(dir)) for (const f of readdirSync(dir)) console.log(`\n───── ${f} (últimas 60) ─────\n${readFileSync(join(dir, f), 'utf8').split(/\r?\n/).slice(-60).join('\n')}`)
  console.log(`\n───── tailscale falso ─────\n${registro().join('\n')}`)
  if (supervisor && salida === null) { orden('detener'); await dormir(2000); if (salida === null) try { supervisor.kill('SIGKILL') } catch { /* */ } }
  process.exit(1)
}

/** Espera a que la web responda y a que el Host del teléfono dé `esperado` en /sin-sesion (la web se relanza). */
async function esperarWeb(puerto, esperado, ms = 120_000) {
  const fin = Date.now() + ms
  let ultimo = 0
  while (Date.now() < fin) {
    if (salida !== null) return `el supervisor salió (código ${salida}).`
    const v = await pedir(puerto, '/api/version', { host: `127.0.0.1:${puerto}`, proto: null })
    if (v.status === 200) {
      ultimo = (await pedir(puerto, '/sin-sesion')).status
      if (ultimo === esperado) return null
    }
    await dormir(1000)
  }
  return `el Host del teléfono no llegó a ${esperado} (último ${ultimo}).`
}

async function main() {
  const puerto = await puertoLibre()
  log(`Node ${process.version} · ${process.platform}/${process.arch} · datos ${DATOS} · web ${puerto}`)
  supervisor = spawn(process.execPath, [SCRIPT, '--sin-navegador', '--puerto', String(puerto), '--datos', DATOS, ...EXTRA], { stdio: ['ignore', 'inherit', 'inherit'], env: ENV })
  supervisor.on('exit', (c, s) => { salida = c ?? s ?? '?' })
  const fin = Date.now() + PLAZO_MS
  let listo = false
  while (Date.now() < fin && !listo) {
    if (salida !== null) return fallar(`el supervisor salió antes de quedar listo (${salida}).`)
    const p = proceso()
    if (p?.puertoControl && (await pedir(puerto, '/api/version', { host: `127.0.0.1:${puerto}`, proto: null })).status === 200) listo = true
    else await dormir(2000)
  }
  if (!listo) return fallar(`no quedó listo en ${PLAZO_MS / 60_000} min.`)
  const a = acceso()
  const g = Number.isSafeInteger(Number(a.generacion)) ? Number(a.generacion) : 0
  const sesion = `arbrain_escritorio=s1.${createHmac('sha256', a.contrasena).update(`arbrain-sesion-servidor:${g}`).digest('hex')}`
  const local = { host: `127.0.0.1:${puerto}`, proto: null }
  const base = await pagina(puerto, '/chat', { ...local, cookie: sesion })
  if (base.status !== 200 || base.ruta === '/sin-sesion') return fallar(`la web local no abre /chat con sesión (la prueba no sirve): ${base.status} ${base.ruta}`)

  // 1. Apagado: el Host del teléfono no entra, ni con sesión.
  for (const [ruta, c] of [['/sin-sesion', undefined], ['/chat', sesion], ['/api/telefono', sesion], ['/api/desktop/entrar', undefined]]) {
    const r = await pedir(puerto, ruta, { cookie: c })
    if (r.status !== 421) return fallar(`apagado: ${ruta} por ${TS} dio ${r.status}, no 421.`)
  }
  ok(`apagado: ${TS} recibe 421 en página, API y entrada (también con sesión)`)
  const e0 = orden('telefono', 'estado')
  if (ultima(e0.stdout) !== 'TELEFONO_APAGADO') return fallar(`telefono estado: ${e0.stdout}${e0.stderr}`)
  ok('telefono estado → TELEFONO_APAGADO')

  // 2. Encender.
  const en = orden('telefono', 'encender')
  log(`telefono encender →\n${en.stdout.trim()}`)
  if (ultima(en.stdout) !== `TELEFONO_ENCENDIDO https://${TS}`) return fallar(`telefono encender: ${en.stdout}${en.stderr}`)
  const esp = await esperarWeb(puerto, 200)
  if (esp) return fallar(`tras encender: ${esp}`)
  if (!registro().includes(`serve --bg --yes --https=443 http://127.0.0.1:${puerto}`)) return fallar(`el tailscale falso no recibió el serve esperado:\n${registro().join('\n')}`)
  ok(`encender: tailscale serve --bg --yes --https=443 http://127.0.0.1:${puerto} y la web acepta ${TS}`)

  // 3. Sin contraseña.
  const sin = await pedir(puerto, '/sin-sesion')
  if (!sin.texto.includes('data-telefono="1"') || !sin.texto.includes('Código o contraseña')) return fallar('/sin-sesion por el teléfono no muestra la entrada con código.')
  const pag = await pedir(puerto, '/chat')
  if (![302, 303, 307, 308].includes(pag.status) || !String(pag.headers.location ?? '').includes('/sin-sesion')) return fallar(`/chat sin sesión dio ${pag.status} → ${pag.headers.location}`)
  const api = await pedir(puerto, '/api/telefono')
  if (api.status !== 401) return fallar(`/api/telefono sin sesión dio ${api.status}`)
  const mala = await pedir(puerto, '/api/desktop/entrar', { metodo: 'POST', cuerpo: 'contrasena=aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh', tipo: 'application/x-www-form-urlencoded', origen: `https://${TS}` })
  if (mala.status !== 303 || !String(mala.headers.location).includes('e=contrasena') || cookieDe(mala)) return fallar(`contraseña mala: ${mala.status} ${mala.headers.location}`)
  ok('sin contraseña: /chat → /sin-sesion, /api/telefono 401, contraseña mala → rechazo sin cookie')

  // 4. Con contraseña.
  const buena = await pedir(puerto, '/api/desktop/entrar', { metodo: 'POST', cuerpo: `contrasena=${encodeURIComponent(a.contrasena)}`, tipo: 'application/x-www-form-urlencoded', origen: `https://${TS}` })
  const c1 = cookieDe(buena)
  if (buena.status !== 200 || !/^arbrain_escritorio=s1\./.test(c1) || !/; Secure/.test(c1) || !/HttpOnly/.test(c1)) return fallar(`entrar con contraseña: ${buena.status} cookie «${c1.replace(/=s1\.[0-9a-f]+/, '=s1.…')}»`)
  const cookie = c1.split(';')[0]
  const chat = await pagina(puerto, '/chat', { cookie })
  if (chat.status !== 200 || chat.ruta === '/sin-sesion' || !chat.texto.includes('/manifest-cliente.json')) return fallar(`/chat con sesión por el teléfono: ${chat.status} ${chat.ruta} (manifest-cliente ${chat.texto.includes('/manifest-cliente.json')})`)
  const est = await pedir(puerto, '/api/telefono', { cookie })
  if (est.status !== 200 || est.json?.estado !== 'encendido' || est.json?.url !== `https://${TS}` || est.json?.desdeTelefono !== true) return fallar(`/api/telefono con sesión: ${est.status} ${est.texto.slice(0, 300)}`)
  const llaves = await pedir(puerto, '/api/llaves/servidor/estado', { cookie })
  if (llaves.status !== 200 || typeof llaves.json?.listo !== 'boolean') return fallar(`/api/llaves/servidor/estado con sesión: ${llaves.status}`)
  if ((await pedir(puerto, '/api/llaves/servidor/estado')).status !== 401) return fallar('/api/llaves/servidor/estado sin sesión no dio 401')
  ok(`con contraseña: cookie Secure+HttpOnly; /chat → ${chat.ruta} 200 (enlaza manifest-cliente.json); /api/telefono 200 encendido desde el teléfono; /api/llaves/servidor/estado 200 (401 sin sesión)`)

  // 5. PWA.
  const man = await pedir(puerto, '/manifest-cliente.json')
  const m = man.json
  if (man.status !== 200 || m?.name !== 'Tu Arbrain' || m?.short_name !== 'Tu Arbrain' || m?.display !== 'standalone' || m?.start_url !== '/chat' || !Array.isArray(m?.icons) || m.icons.length < 2) return fallar(`manifest-cliente.json: ${man.status} ${man.texto.slice(0, 200)}`)
  for (const ic of m.icons) {
    const r = await pedir(puerto, ic.src)
    if (r.status !== 200 || r.bytes.subarray(1, 4).toString() !== 'PNG') return fallar(`icono ${ic.src}: ${r.status}`)
  }
  const apple = await pedir(puerto, '/apple-touch-icon.png')
  if (apple.status !== 200 || !chat.texto.includes('apple-touch-icon.png') || !chat.texto.includes('Tu Arbrain')) return fallar('el icono de la marca y el título de iPhone («Tu Arbrain») no están en la página.')
  const sw = await pedir(puerto, '/sw.js')
  if (sw.status !== 200 || !/javascript/.test(String(sw.headers['content-type'])) || !sw.texto.includes("addEventListener('fetch'") || !sw.texto.includes('CACHE_NAME')) return fallar(`sw.js: ${sw.status} ${sw.headers['content-type']}`)
  ok(`PWA: manifest-cliente.json («${m.name}», ${m.icons.length} iconos PNG, standalone, /chat), icono de iPhone y sw.js (${sw.headers['content-type']}) por ${TS}`)

  // 6. Código de un solo uso pedido desde Ajustes (con la sesión del teléfono, como lo haría la computadora).
  const cod = await pedir(puerto, '/api/telefono', { metodo: 'POST', cookie, cuerpo: JSON.stringify({ accion: 'codigo' }), origen: `https://${TS}` })
  if (cod.status !== 200 || !/^[a-z2-9]{4}-[a-z2-9]{4}$/.test(cod.json?.codigo ?? '')) return fallar(`pedir código: ${cod.status} ${cod.texto.slice(0, 200)}`)
  const conCodigo = () => pedir(puerto, '/api/desktop/entrar', { metodo: 'POST', cuerpo: `contrasena=${cod.json.codigo.toUpperCase()}`, tipo: 'application/x-www-form-urlencoded', origen: `https://${TS}` })
  const u1 = await conCodigo()
  if (u1.status !== 200 || !/; Secure/.test(cookieDe(u1))) return fallar(`entrar con código: ${u1.status}`)
  const u2 = await conCodigo()
  if (u2.status !== 303 || !String(u2.headers.location).includes('e=codigo')) return fallar(`el código sirvió dos veces: ${u2.status}`)
  ok('código de un solo uso: entra la primera vez (cookie Secure), la segunda va a /sin-sesion?e=codigo')

  // 7. En claro y de otro origen.
  const claro = await pedir(puerto, '/chat', { cookie, proto: 'http' })
  if (claro.status !== 421) return fallar(`${TS} en claro dio ${claro.status}`)
  const sinProto = await pedir(puerto, '/chat', { cookie, proto: null })
  if (sinProto.status !== 421) return fallar(`${TS} sin X-Forwarded-Proto dio ${sinProto.status}`)
  const otro = await pedir(puerto, '/api/telefono', { metodo: 'POST', cookie, cuerpo: JSON.stringify({ accion: 'codigo' }), origen: 'https://evil.example' })
  if (otro.status !== 403) return fallar(`escritura de otro origen dio ${otro.status}`)
  const otroHost = await pedir(puerto, '/chat', { cookie, host: 'otra.ejemplo.ts.net' })
  if (otroHost.status !== 421) return fallar(`otro *.ts.net dio ${otroHost.status}`)
  ok(`${TS} en claro o sin X-Forwarded-Proto → 421; otro *.ts.net → 421; escritura de otro origen → 403`)

  // 8. Apagar.
  const ap = orden('telefono', 'apagar')
  if (ultima(ap.stdout) !== 'TELEFONO_APAGADO') return fallar(`telefono apagar: ${ap.stdout}${ap.stderr}`)
  const esp2 = await esperarWeb(puerto, 421)
  if (esp2) return fallar(`tras apagar: ${esp2}`)
  if ((await pedir(puerto, '/chat', { cookie })).status !== 421) return fallar('apagado, la cookie del teléfono todavía entra.')
  if (!registro().includes('serve --yes --https=443 off')) return fallar('apagar no quitó la publicación de Tailscale.')
  const tras = await pagina(puerto, '/chat', { ...local, cookie: sesion })
  if (tras.status !== 200 || tras.ruta === '/sin-sesion') return fallar('tras apagar, la web local dejó de abrir.')
  ok('apagar: tailscale serve --https=443 off y el Host vuelve a 421 (con la cookie del teléfono); la web local sigue igual')

  const llamadas = registro()
  if (llamadas.some((l) => l.includes('funnel'))) return fallar('se llamó a `tailscale funnel`.')
  ok(`tailscale falso: ${llamadas.length} llamadas, ninguna a funnel`)
  writeFileSync(join(DATOS, 'tailscale-llamadas.txt'), llamadas.join('\n') + '\n')

  if (argv.includes('--mantener')) {
    const otra = orden('telefono', 'encender')
    if (ultima(otra.stdout) !== `TELEFONO_ENCENDIDO https://${TS}`) return fallar(`re-encender: ${otra.stdout}`)
    const esp3 = await esperarWeb(puerto, 200)
    if (esp3) return fallar(`tras re-encender: ${esp3}`)
    writeFileSync(join(DATOS, 'prueba-telefono.json'), JSON.stringify({ puerto, host: TS }) + '\n')
    console.log(`\n${resultados.join('\n')}\nPRUEBA_TELEFONO_OK (se queda corriendo, encendido: ${DATOS})`)
    process.exit(0)
  }
  const det = orden('detener')
  if (det.status !== 0) return fallar(`detener: ${det.stdout}`)
  const finSalida = Date.now() + 30_000
  while (salida === null && Date.now() < finSalida) await dormir(500)
  if (salida === null) return fallar('el supervisor sigue vivo tras detener.')
  console.log(`\n${resultados.join('\n')}\nPRUEBA_TELEFONO_OK`)
}

main().catch((e) => fallar(e?.stack ?? String(e)))
