#!/usr/bin/env node
/**
 * Simulación de «tu red privada de Tailscale» para las pruebas de «solo en tu servidor» (29 oct 2026;
 * scripts/instalar/nube-solo-prueba.sh y la CI e2e-solo-servidor.yml). En un VPS real, `tailscale serve` (lo pide
 * `nube.sh telefono`) publica `https://<servidor>.<tu-red>.ts.net` SOLO dentro de la tailnet, termina el TLS con el
 * certificado de la red y reenvía a la web en 127.0.0.1 con `X-Forwarded-Proto: https`. En la CI no hay tailnet (no
 * se inicia sesión en ninguna cuenta), así que este proceso hace esa parte:
 *
 *   - Lee lo que el `tailscale` falso guardó al publicar (`<dir>/serve.json`, el mismo formato de `tailscale serve
 *     status --json`): si no hay publicación hacia 127.0.0.1, responde 502, como una tailnet sin `serve`.
 *   - Escucha HTTPS en 127.0.0.1:<puerto> con un certificado propio para `<host>` (la prueba lo crea con openssl y
 *     curl lo verifica con `--cacert` y `--resolve`, sin `-k`).
 *   - Reenvía a ese destino conservando `Host`, con `X-Forwarded-Proto: https` y `X-Forwarded-For` de la tailnet.
 *
 *   node tailnet-falso.mjs --dir <carpeta del tailscale falso> --host <nombre .ts.net> --puerto <n> --cert <pem> --llave <pem>
 *
 * Lo que NO prueba (queda para el VPS real, docs/builds/nube-primero-2026-10-29/REPORTE.md): el login de Tailscale, el
 * certificado real de la red, MagicDNS ni la conexión del teléfono.
 */
import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const op = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const DIR = op('--dir'), HOST = op('--host'), PUERTO = Number(op('--puerto') ?? 8443)
if (!DIR || !HOST || !op('--cert') || !op('--llave')) { console.error('uso: --dir --host --puerto --cert --llave'); process.exit(2) }

/** Destino publicado para `<host>:443` en la raíz, o null. */
function destino() {
  try {
    const sc = JSON.parse(readFileSync(join(DIR, 'serve.json'), 'utf8'))
    const p = sc?.Web?.[`${HOST}:443`]?.Handlers?.['/']?.Proxy
    const u = typeof p === 'string' ? new URL(p.includes('://') ? p : `http://${p}`) : null
    return u && u.hostname === '127.0.0.1' ? u : null
  } catch { return null }
}

const srv = https.createServer({ cert: readFileSync(op('--cert')), key: readFileSync(op('--llave')) }, (req, res) => {
  const d = destino()
  if (!d) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('tailnet-falso: nada publicado con tailscale serve\n'); return }
  const headers = { ...req.headers, host: HOST, 'x-forwarded-proto': 'https', 'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1' }
  const sale = http.request({ host: '127.0.0.1', port: Number(d.port), path: req.url, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  sale.on('error', (e) => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`tailnet-falso: ${e.message}\n`) })
  req.pipe(sale)
})
srv.listen(PUERTO, '127.0.0.1', () => console.log(`TAILNET_FALSO https://${HOST}:${PUERTO} → serve.json de ${DIR}`))
