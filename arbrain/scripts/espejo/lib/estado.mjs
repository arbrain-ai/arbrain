/**
 * Estado local del espejo, propio de cada máquina y fuera de git: `<cerebro>/.arbrain-espejo/` (excluido en
 * `.git/info/exclude` y en la lista NUNCA). Un clon nuevo de mi-arbrain no lo trae: cada máquina genera su identidad.
 *
 *   maquina.json   { activo, host, rama, desde }    lo escribe `activar`; sin él el espejo está apagado (beta)
 *   estado.json    última sincronización, rol, última confirmación del líder, avisos recientes
 *   avisos.jsonl   bitácora de avisos (choques, secretos rechazados, líder sin latido…)
 *   apartados/     lo que una máquina que no manda intentó escribir en archivos del líder (nada se pierde)
 *   candado/       un solo ciclo de git a la vez (sincronizar y cerca)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dirGit } from './git.mjs'
import { ESTADO_DIR, RAMA_POR_DEFECTO } from './viaja.mjs'

/**
 * Reloj: `ARBRAIN_ESPEJO_AHORA` (ISO) lo fija en pruebas. Reloj acelerado del prototipo (N4): las máquinas de prueba
 * corren bajo libfaketime y la cerca, que el daemon lanza con un entorno mínimo (sin LD_PRELOAD), lee el mismo desfase
 * de `ARBRAIN_ESPEJO_RELOJ_ARCHIVO` (formato de libfaketime: `+<segundos>`). Un proceso que ya corre bajo libfaketime
 * no lo suma dos veces. Sin esas variables (siempre, fuera de pruebas): la hora de la máquina.
 */
export function desfaseMs(env = process.env) {
  const archivo = env.ARBRAIN_ESPEJO_RELOJ_ARCHIVO?.trim()
  if (!archivo || /faketime/i.test(env.LD_PRELOAD ?? '')) return 0
  try {
    const m = /^([+-]\d+)\s*$/.exec(readFileSync(archivo, 'utf8').trim())
    return m ? Number(m[1]) * 1000 : 0
  } catch { return 0 }
}
export function ahora(env = process.env) {
  const f = env.ARBRAIN_ESPEJO_AHORA?.trim()
  const d = f ? new Date(f) : new Date(Date.now() + desfaseMs(env))
  return Number.isNaN(d.getTime()) ? new Date() : d
}
const dos = (n) => String(n).padStart(2, '0')
/** Fecha local de la máquina: `2026-10-23`. */
export const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
/** Sello para nombres de archivo: `2026-10-23-1530`. */
export const sello = (d) => `${fechaLocal(d)}-${dos(d.getHours())}${dos(d.getMinutes())}`

export const dirEstado = (cerebro) => join(cerebro, ESTADO_DIR)
const leer = (ruta) => { try { return JSON.parse(readFileSync(ruta, 'utf8')) } catch { return null } }
function escribir(ruta, obj) {
  mkdirSync(join(ruta, '..'), { recursive: true })
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n', { mode: 0o600 })
  renameSync(tmp, ruta)
}

export function leerMaquina(cerebro) {
  const m = leer(join(dirEstado(cerebro), 'maquina.json'))
  if (!m || typeof m !== 'object') return { activo: false }
  return { activo: m.activo === true, host: m.host, rama: m.rama || RAMA_POR_DEFECTO, desde: m.desde }
}
export const guardarMaquina = (cerebro, m) => escribir(join(dirEstado(cerebro), 'maquina.json'), m)

export const leerEstado = (cerebro) => leer(join(dirEstado(cerebro), 'estado.json')) ?? {}
export function guardarEstado(cerebro, cambios) {
  const e = { ...leerEstado(cerebro), ...cambios }
  escribir(join(dirEstado(cerebro), 'estado.json'), e)
  return e
}

/** Avisos de este proceso (un ciclo = un proceso): el ciclo los devuelve para que el modo servidor los registre. */
export const avisosDelProceso = []

/** Aviso para la persona (Levy lo cuenta en la siguiente conversación). Sin secretos: solo tipo, ruta y texto. */
export function avisar(cerebro, tipo, texto, extra = {}) {
  const a = { en: ahora().toISOString(), tipo, texto, ...extra }
  avisosDelProceso.push({ tipo, texto })
  mkdirSync(dirEstado(cerebro), { recursive: true })
  appendFileSync(join(dirEstado(cerebro), 'avisos.jsonl'), JSON.stringify(a) + '\n', { mode: 0o600 })
  const e = leerEstado(cerebro)
  guardarEstado(cerebro, { avisos: [...(e.avisos ?? []), a].slice(-30) })
  return a
}

/** El estado local nunca entra a git: lo excluye en `.git/info/exclude` (local, no toca el .gitignore del autor). */
export function asegurarExclusion(cerebro) {
  const g = dirGit(cerebro)
  if (!g) return
  const ruta = join(g, 'info', 'exclude')
  let t = ''
  try { t = readFileSync(ruta, 'utf8') } catch { mkdirSync(join(g, 'info'), { recursive: true }) }
  if (!t.split('\n').includes(`/${ESTADO_DIR}/`)) appendFileSync(ruta, `${t && !t.endsWith('\n') ? '\n' : ''}/${ESTADO_DIR}/\n`)
}

/** Candado por carpeta (mkdir es atómico). Viejo de más de 10 min = de un proceso muerto: se libera. */
export async function conCandado(cerebro, fn, { esperaMs = 90_000 } = {}) {
  const dir = join(dirEstado(cerebro), 'candado')
  mkdirSync(dirEstado(cerebro), { recursive: true })
  const fin = Date.now() + esperaMs
  for (;;) {
    try { mkdirSync(dir); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - statSync(dir).mtimeMs > 10 * 60_000) { rmdirSync(dir); continue } } catch { continue }
      if (Date.now() > fin) return { ok: false, codigo: 'ocupado', motivo: 'Otro ciclo del espejo sigue corriendo en esta máquina.' }
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  try { return await fn() } finally { try { rmdirSync(dir) } catch { /* ya liberado */ } }
}

export const existeEstado = (cerebro) => existsSync(join(dirEstado(cerebro), 'maquina.json'))
