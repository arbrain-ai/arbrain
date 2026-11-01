// Daemon falso para la prueba de humo de la web en edición cliente: responde el contrato mínimo (CONTRATO-DAEMON.md v3).
import http from 'node:http'
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN, CONF = process.env.ARBRAIN_TOKEN_CONFIRMAR
let pendientes = [{ id: 'cf_0123456789ab', estado: 'pendiente', categoria: 'publicar', origen: 'agente', resumen: 'Publicar: git push origin main', detalle: 'git push origin main', literal: 'git push origin main', avisos: ['puede usar internet o abrir otras apps'], creadaPor: 'guardia', herramienta: 'Bash', creada: Date.now(), expira: Date.now() + 600000 }]
let consentimiento = null
let interruptor = null // §6.2: vive en la memoria del daemon
// Permisos de Levy (0.2.15) y la re-aceptación corta (0.2.18): el texto de Autónomo viene por entorno (las capturas pasan
// el real) o es uno de ejemplo; `/prueba/permisos` fija el escenario (p. ej. Autónomo con el texto viejo → reaceptar).
const TEXTO = process.env.PERMISOS_TEXTO ? JSON.parse(process.env.PERMISOS_TEXTO) : { version: 'autonomia-prueba', sha256: 'a'.repeat(64), titulo: 'Qué significa el modo autónomo', aviso: 'Texto de prueba.', casillas: ['He leído esto.', 'Acepto que soy responsable.'], cuerpo: 'Texto de prueba del modo autónomo.' }
let permisos = { modo: 'carpeta', consentimiento: null, reaceptar: false, migracion: null }
const vistaPermisos = () => ({ ...permisos, modos: ['preguntar', 'carpeta', 'autonomo'], sandbox: true, texto: TEXTO, historialModo: [], avisos: [], misDatos: { telefono: '', correo: '' } })
const vigente = () => permisos.consentimiento?.version === TEXTO.version && permisos.consentimiento?.sha256 === TEXTO.sha256
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
    if (req.url === '/prueba/permisos') { permisos = { ...permisos, ...b }; return json(res, 200, vistaPermisos()) }
    if (req.url === '/permisos' && req.method === 'GET') return json(res, 200, vistaPermisos())
    if (req.url === '/permisos' && req.method === 'POST') {
      if (b.decidirDespues === true) { permisos = { modo: 'carpeta', consentimiento: permisos.reaceptar ? null : permisos.consentimiento, reaceptar: false, migracion: null }; return json(res, 200, vistaPermisos()) }
      if (!['preguntar', 'carpeta', 'autonomo'].includes(b.modo)) return json(res, 400, { error: 'modo' })
      if (b.modo !== 'preguntar' && req.headers['x-arbrain-confirmar'] !== CONF) return json(res, 403, { error: 'Solo la persona, desde la app, puede cambiar los permisos de Levy.' })
      if (b.modo === 'autonomo') {
        if (b.acepto) {
          if (b.acepto.version !== TEXTO.version || b.acepto.sha256 !== TEXTO.sha256) return json(res, 409, { error: 'otra versión', code: 'version', texto: TEXTO })
          permisos.consentimiento = { ts: Date.now(), version: TEXTO.version, sha256: TEXTO.sha256, app: '', so: process.platform, via: b.via }
        } else if (!vigente()) return json(res, 409, { error: 'falta aceptar', code: 'consentimiento', texto: TEXTO })
      }
      // Como el daemon real: elegir un nivel ya decide la re-aceptación o la migración pendiente.
      permisos = { ...permisos, modo: b.modo, reaceptar: false, migracion: null }
      return json(res, 200, vistaPermisos())
    }
    // Rutinas (`GET /schedule`, T8): las de las capturas vienen por entorno (las precargadas nacen en pausa); sin entorno, ninguna.
    if (req.url === '/schedule' && req.method === 'GET') return json(res, 200, { tasks: process.env.RUTINAS ? JSON.parse(process.env.RUTINAS) : [], tz: 'America/Mexico_City', aviso: null })
    if (req.url === '/llaves/probar') return json(res, 200, { ok: false, ms: 5, code: 'falta_llave', error: 'Falta tu llave de Claude.' })
    json(res, 404, { error: 'no' })
  })
}).listen(Number(process.env.PUERTO), '127.0.0.1', () => console.log('daemon falso en', process.env.PUERTO))
