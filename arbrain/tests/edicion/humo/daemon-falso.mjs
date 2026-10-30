// Daemon falso para la prueba de humo de la web en edición cliente: responde el contrato mínimo (CONTRATO-DAEMON.md v3).
import http from 'node:http'
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN, CONF = process.env.ARBRAIN_TOKEN_CONFIRMAR
let pendientes = [{ id: 'cf_0123456789ab', estado: 'pendiente', categoria: 'publicar', origen: 'agente', resumen: 'Publicar: git push origin main', detalle: 'git push origin main', literal: 'git push origin main', avisos: ['puede usar internet o abrir otras apps'], creadaPor: 'guardia', herramienta: 'Bash', creada: Date.now(), expira: Date.now() + 600000 }]
let consentimiento = null
let interruptor = null // §6.2: vive en la memoria del daemon
const json = (res, s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: 'token' })
  let cuerpo = ''; req.on('data', c => cuerpo += c); req.on('end', () => {
    const b = cuerpo ? JSON.parse(cuerpo) : {}
    if (req.url === '/health') return json(res, 200, { ok: true, edicion: 'cliente', contrato: 3, llaves: { anthropic: false, oauth: false, openrouter: false, chat: false }, workspace: true })
    if (req.url === '/confirmaciones') return json(res, 200, { pendientes: pendientes.filter(p => p.estado === 'pendiente') })
    if (req.url === '/confirmaciones/resolver') {
      if (req.headers['x-arbrain-confirmar'] !== CONF) return json(res, 403, { error: 'sin secreto' })
      const p = pendientes.find(x => x.id === b.id); if (!p) return json(res, 404, { error: 'no existe' })
      p.estado = b.decision === 'permitir' ? 'permitida' : 'rechazada'; return json(res, 200, p)
    }
    if (req.url === '/cohorte') return json(res, 200, { consentimiento, endpoint_configurado: false, ultimo_envio: null, vista_previa: { version: 1, instalacion: 'i_abc', generado: new Date().toISOString(), dias: [{ dia: '2026-10-11', sesiones: 2, acciones_venta: 1, cierres: 0, facturacion: {} }] } })
    if (req.url === '/cohorte/consentimiento') {
      if (b.acepto && req.headers['x-arbrain-confirmar'] !== CONF) return json(res, 403, { error: 'sin secreto' })
      consentimiento = b.acepto ? { acepto: true, fecha: new Date().toISOString(), version: 1 } : null
      return json(res, 200, { consentimiento, endpoint_configurado: false, ultimo_envio: null, vista_previa: { version: 1, instalacion: 'i_abc', generado: '', dias: [] } })
    }
    if (req.url === '/manos/interruptor' && req.method === 'GET') return json(res, 200, { encendido: interruptor?.encendido === true, decision: interruptor })
    if (req.url === '/manos/interruptor' && req.method === 'POST') {
      if (typeof b.encendido !== 'boolean') return json(res, 400, { error: 'encendido (boolean) requerido.' })
      if (b.encendido && req.headers['x-arbrain-confirmar'] !== CONF) return json(res, 403, { error: 'Solo la persona, desde la app, puede encender computer use.' })
      interruptor = { encendido: b.encendido, decidido_en: new Date().toISOString(), por: 'app' }
      return json(res, 200, { encendido: b.encendido })
    }
    if (req.url === '/llaves/probar') return json(res, 200, { ok: false, ms: 5, code: 'falta_llave', error: 'Falta tu llave de Claude.' })
    json(res, 404, { error: 'no' })
  })
}).listen(Number(process.env.PUERTO), '127.0.0.1', () => console.log('daemon falso en', process.env.PUERTO))
