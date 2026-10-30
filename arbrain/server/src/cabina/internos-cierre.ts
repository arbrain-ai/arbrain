/**
 * Cierres que el SDK no emite como evento (3 oct 2026, Daniel: un shell en segundo plano muerto
 * seguía «Trabajando 17 min»).
 *
 * Causa: cuando una sesión de Claude se retoma, los comandos en segundo plano de la sesión anterior
 * se cierran con un mensaje de USUARIO sintético (`<task-notification>…<status>stopped</status>`),
 * no con `system/task_notification`; `observarSDK` nunca lo ve. Y el `pid` guardado es el del
 * corredor del chat, que sigue vivo, así que la regla «murió su proceso» tampoco lo atrapa.
 * Lo mismo con un comando en primer plano cuyo turno se cortó antes de reportarlo.
 *
 * Fuente: la transcripción de la sesión (`~/.claude/projects/<proyecto>/<sesión>.jsonl`), leída
 * de forma incremental (solo los bytes nuevos) y solo la de los últimos dos días.
 */
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { carpetasClaude } from '../cuentas-alternas.js'

export interface Cierres {
  /** id de tarea → estado con el que la sesión la cerró (completed, failed, stopped, killed). */
  notificadas: Map<string, string>
  /** tool_use_id → su tool_result ya llegó; `fondo` = era el aviso «corre en segundo plano», no el fin. */
  resultados: Map<string, { fondo: boolean }>
}

interface Lectura { offset: number; ino: number }
const leidas = new Map<string, Lectura>()
const cierres: Cierres = { notificadas: new Map(), resultados: new Map() }
const VENTANA_MS = 2 * 24 * 3600_000
const MAX_LECTURA = 48 * 1024 * 1024
const NOTIF = /<task-id>([A-Za-z0-9_-]{1,64})<\/task-id>[\s\S]{0,400}?<status>([a-z_]{1,20})<\/status>/g
const RESULTADO = /"tool_use_id":"(toolu_[A-Za-z0-9_-]{1,80})"/g
const FONDO = /in (the )?background|background (shell|task|command)|segundo plano|\/tasks\/[A-Za-z0-9_.-]+\.output/i

/** Procesa líneas completas de una transcripción (separado para probarlo sin disco). */
export function absorber(texto: string, c: Cierres = cierres) {
  for (const linea of texto.split('\n')) {
    if (linea.includes('<task-id>')) for (const m of linea.matchAll(NOTIF)) c.notificadas.set(m[1], m[2])
    if (linea.includes('"tool_use_id"')) {
      const fondo = FONDO.test(linea)
      for (const m of linea.matchAll(RESULTADO)) { const prev = c.resultados.get(m[1]); c.resultados.set(m[1], { fondo: fondo || !!prev?.fondo }) }
    }
  }
}

async function leerNuevo(ruta: string) {
  const info = await stat(ruta)
  let l = leidas.get(ruta)
  if (!l || l.ino !== info.ino || info.size < l.offset) l = { offset: Math.max(0, info.size - MAX_LECTURA), ino: info.ino }
  if (info.size <= l.offset) { leidas.set(ruta, l); return }
  const fh = await open(ruta, 'r')
  try {
    const buf = Buffer.alloc(info.size - l.offset)
    await fh.read(buf, 0, buf.length, l.offset)
    const fin = buf.lastIndexOf(0x0a) // solo líneas completas; la cola se relee la próxima vez
    if (fin < 0) { leidas.set(ruta, l); return }
    absorber(buf.subarray(0, fin).toString('utf8'))
    leidas.set(ruta, { offset: l.offset + fin + 1, ino: info.ino })
  } finally { await fh.close() }
}

/** Lee lo nuevo de las transcripciones recientes y devuelve los cierres conocidos. */
/** `desdeMs`: la tarea abierta más vieja; una transcripción que no se tocó desde entonces no puede cerrarla. */
export async function cierresRecientes(desdeMs: number, raices = carpetasClaude().slice(0, 2).map(c => join(homedir(), c, 'projects'))): Promise<Cierres> {
  const corte = Math.max(Date.now() - VENTANA_MS, desdeMs - 60_000)
  for (const raiz of raices) {
    let proyectos: string[] = []
    try { proyectos = await readdir(raiz) } catch { continue }
    for (const p of proyectos) {
      let archivos: string[] = []
      try { archivos = (await readdir(join(raiz, p))).filter(a => a.endsWith('.jsonl')) } catch { continue }
      for (const a of archivos) {
        const ruta = join(raiz, p, a)
        try { if ((await stat(ruta)).mtimeMs >= corte) await leerNuevo(ruta) } catch { /* se fue mientras leía */ }
      }
    }
  }
  return cierres
}
