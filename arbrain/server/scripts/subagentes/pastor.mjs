#!/usr/bin/env node
/**
 * Pastor de un subagente sin pantalla con ENTRADA EN VIVO (6 oct 2026, ajuste de Levy al spec: «no se debe perder la
 * capacidad de mandarle un mensaje a un subagente mientras trabaja»).
 *
 * Corre desacoplado del agent-server (lo lanza `sin-pantalla.ts` con setsid) y es dueño de UN turno de trabajo:
 *  - Abre su FIFO (`<id>.in`) en r+: nunca ve EOF y quien escribe sin lector recibe ENXIO («ya no vive»).
 *  - Lanza el CLI con stdin por tubo y le pasa el encargo; cada línea de la FIFO es un puntero a un mensaje
 *    ({tipo:'mensaje', id, archivo}) o una orden ({tipo:'detener'}):
 *      claude-stream    → `{"type":"user",…}` en stdin de `claude -p --input-format stream-json`; detener =
 *                         `control_request` interrupt (corta el paso, la sesión queda).
 *      codex-appserver  → JSON-RPC de `codex app-server`: thread/start|resume, turn/start, turn/steer a mitad del
 *                         turno, turn/interrupt para detener.
 *  - Todo lo que el CLI emite va a la bitácora (sin los deltas de streaming) con marcas propias: `entrada` (acuse de
 *    cada mensaje: entregado o no), `detener`, `sesion`, `error` y, al final, `salida` con el código.
 *  - Terminar = el CLI cerró su turno y pasaron `ocioMs` sin entradas nuevas: se cierra su stdin, el CLI sale y el
 *    pastor deja la marca de salida. Así «el proceso sale» sigue siendo el fin, también con entrada en vivo.
 * Uso: node pastor.mjs arbrain-subagente <config.json>   (la marca en argv identifica el proceso en `ps`).
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'

const c = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const bit = fs.openSync(c.bitacora, 'a')
const anota = o => fs.writeSync(bit, JSON.stringify({ arbrain: o.arbrain, ...o, en: Date.now() }) + '\n')
const crudo = l => fs.writeSync(bit, l + '\n')

try { fs.unlinkSync(c.fifo) } catch { /* no había */ }
execFileSync('/usr/bin/mkfifo', ['-m', '600', c.fifo])
const fifo = fs.openSync(c.fifo, 'r+')

const hijo = spawn(c.bin, c.argv, { cwd: c.cwd, stdio: ['pipe', 'pipe', fs.openSync(c.err, 'a')] })
let ocupado = true, cerrado = false, detenido = false, ocio = null
const cerrarEntrada = () => { if (cerrado) return; cerrado = true; hijo.stdin.end() }
const programarCierre = () => { clearTimeout(ocio); ocio = setTimeout(() => { if (!ocupado) cerrarEntrada() }, c.ocioMs ?? 1500) }
const escribir = o => { if (!cerrado) hijo.stdin.write(JSON.stringify(o) + '\n') }
hijo.stdin.on('error', () => { /* el CLI ya salió */ })

function lineas(stream, fn) {
  let resto = ''
  stream.on('data', d => { const l = (resto + d).split('\n'); resto = l.pop() ?? ''; for (const x of l) if (x.trim()) fn(x) })
}
const leerMensaje = p => { try { return JSON.parse(fs.readFileSync(p.archivo, 'utf8')).texto } catch { return null } }

// ── claude -p --input-format stream-json ──
function claude() {
  const usuario = texto => ({ type: 'user', message: { role: 'user', content: texto } })
  escribir(usuario(c.texto))
  lineas(hijo.stdout, l => {
    crudo(l)
    let d; try { d = JSON.parse(l) } catch { return }
    if (d.type === 'result') { ocupado = false; programarCierre() }
  })
  return {
    mensaje(id, texto) { escribir(usuario(texto)); ocupado = true; clearTimeout(ocio); anota({ arbrain: 'entrada', id, texto, entregado: true }) },
    detener() { escribir({ type: 'control_request', request_id: `detener-${Date.now()}`, request: { subtype: 'interrupt' } }) },
  }
}

// ── codex app-server (JSON-RPC por stdio) ──
const GUARDAR = new Set(['thread/started', 'turn/started', 'turn/completed', 'item/completed', 'thread/tokenUsage/updated', 'error'])
function codex() {
  let n = 0, hilo = null, turno = null
  const pendientes = new Map()
  const rpc = (method, params) => new Promise((ok, mal) => { const id = ++n; pendientes.set(id, { ok, mal }); escribir({ id, method, params }) })
  const entrada = texto => [{ type: 'text', text: texto }]
  lineas(hijo.stdout, l => {
    let d; try { d = JSON.parse(l) } catch { crudo(l); return }
    if (d.id != null && (d.result !== undefined || d.error) && pendientes.has(d.id)) {
      const p = pendientes.get(d.id); pendientes.delete(d.id)
      d.error ? p.mal(new Error(d.error.message ?? JSON.stringify(d.error))) : p.ok(d.result)
      return
    }
    if (typeof d.method !== 'string') return
    // solo lo que la bitácora usa: nada de deltas ni del estado de MCPs, cuenta o control remoto (18 líneas por turno)
    if (!GUARDAR.has(d.method)) return
    crudo(l)
    if (d.method === 'turn/started') { turno = d.params?.turn?.id ?? turno; ocupado = true; clearTimeout(ocio) }
    if (d.method === 'turn/completed') { ocupado = false; programarCierre() }
  })
  const iniciarTurno = texto => rpc('turn/start', { threadId: hilo, input: entrada(texto), ...(c.codex.turno ?? {}) }).then(r => { turno = r.turn.id; ocupado = true })
  void (async () => {
    await rpc('initialize', { clientInfo: { name: 'arbrain-subagente', title: 'Arbrain · subagente', version: '1.0.0' } })
    escribir({ method: 'initialized', params: {} })
    const r = c.codex.hilo ? await rpc('thread/resume', { threadId: c.codex.hilo, ...c.codex.hiloParams }) : await rpc('thread/start', c.codex.hiloParams)
    hilo = r.thread.id
    // lo que el app-server dice que corre: thread/resume no emite thread/started, así que se anota de su respuesta
    const modelo = r.model ?? r.thread.model, esfuerzo = r.reasoningEffort ?? r.thread.reasoningEffort
    anota({ arbrain: 'sesion', id: hilo, ...(typeof modelo === 'string' ? { modelo } : {}), ...(typeof esfuerzo === 'string' ? { esfuerzo } : {}) })
    await iniciarTurno(c.texto)
  })().catch(e => { anota({ arbrain: 'error', mensaje: String(e?.message ?? e) }); ocupado = false; cerrarEntrada() })
  return {
    mensaje(id, texto) {
      clearTimeout(ocio)
      const pegar = ocupado && turno ? rpc('turn/steer', { threadId: hilo, expectedTurnId: turno, input: entrada(texto) }).catch(() => iniciarTurno(texto)) : iniciarTurno(texto)
      ocupado = true
      pegar.then(() => anota({ arbrain: 'entrada', id, texto, entregado: true }), e => { anota({ arbrain: 'entrada', id, entregado: false, motivo: String(e?.message ?? e) }); programarCierre() })
    },
    detener() { if (hilo && turno) rpc('turn/interrupt', { threadId: hilo, turnId: turno }).catch(() => {}) },
  }
}

const proto = c.protocolo === 'codex-appserver' ? codex() : claude()

// net.Socket (no fs.createReadStream): un read() bloqueante sobre la FIFO deja un hilo del pool colgado y process.exit
// no termina nunca (6 oct, el pastor quedaba vivo tras escribir su salida).
lineas(new net.Socket({ fd: fifo, readable: true, writable: false }), l => {
  let p; try { p = JSON.parse(l) } catch { return }
  if (p.tipo === 'mensaje') {
    const texto = leerMensaje(p)
    if (cerrado || texto == null) { anota({ arbrain: 'entrada', id: p.id, entregado: false, motivo: cerrado ? 'el turno ya cerraba' : 'mensaje ilegible' }); return }
    proto.mensaje(p.id, texto)
  } else if (p.tipo === 'detener') {
    if (cerrado || !ocupado) { anota({ arbrain: 'detener', ok: false, motivo: 'no estaba en medio de un paso' }); return }
    detenido = true
    anota({ arbrain: 'detener', ok: true })
    proto.detener()
  }
})

hijo.on('exit', (code, signal) => {
  clearTimeout(ocio)
  anota({ arbrain: 'salida', codigo: code ?? 128 + (signal === 'SIGKILL' ? 9 : signal === 'SIGINT' ? 2 : 15), ...(detenido ? { detenido: true } : {}) })
  try { fs.unlinkSync(c.fifo) } catch { /* ya no está */ }
  process.exit(code ?? 1)
})
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { if (hijo.exitCode != null || hijo.signalCode) process.exit(1); try { hijo.kill(s) } catch { process.exit(1) } })
