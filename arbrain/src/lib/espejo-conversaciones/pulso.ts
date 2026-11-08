/**
 * El pulso de las conversaciones del espejo (5 nov 2026; docs/builds/espejo-conversaciones-2026-11-05/DISENO.md).
 *
 * La web lo llama desde el almacén de la base local (`base-local/archivos.ts`), el único lugar por donde pasan TODAS las
 * lecturas y escrituras del chat en la edición del alumno:
 *
 *   al leer chat     si llegó algo de la otra máquina, lo une a la base antes de responder; y si el último ciclo del
 *                    espejo tiene más de 20 s, pide otro (así abrir la lista o una conversación trae lo nuevo).
 *   al escribir chat pide un ciclo a los 3 s (se juntan los de un mismo turno): el turno llega a la otra en segundos.
 *
 * Un ciclo = exportar lo propio al diario → `espejo.mjs sincronizar` (git: guarda, recibe, sube; candado propio) →
 * importar lo ajeno. Corre en un proceso aparte y nunca bloquea una respuesta. También cubre la app de escritorio, que
 * no corre el ciclo de 5 min del modo servidor.
 *
 * Apagado (espejo inactivo, edición de Daniel o sin copia): no hace nada, cuesta un `stat` cada pocos segundos.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esEdicionCliente } from '@/lib/edicion'
import { dirDatosWeb } from '@/lib/rutas-instalacion'
import { exportar, hayNuevo, HOST_RE, importar, leerEstado, guardarEstado, TABLAS, type AlmacenCrudo, type Contexto } from './diario'

export interface Maquina { cerebro: string; host: string }

const TABLAS_CHAT = new Set<string>(TABLAS)
export const esTablaDeChat = (t: string) => TABLAS_CHAT.has(t)

/** Cada cuánto, como mucho, mirar si llegó algo (solo `stat`). */
const CADA_CHEQUEO_MS = 1_500
/** Abrir la lista o una conversación pide un ciclo si el último tiene más de esto. */
export const FRESCURA_LECTURA_MS = 20_000
/** Escribir pide un ciclo a los pocos segundos (junta las escrituras de un mismo turno). */
export const ESPERA_ESCRITURA_MS = 3_000

interface Pulso {
  almacen: AlmacenCrudo | null
  maquina: { valor: Maquina | null; hasta: number }
  ultimoChequeo: number
  ultimoCiclo: number
  corriendo: boolean
  pendiente: boolean
  timer: ReturnType<typeof setTimeout> | null
  timerPara: number
}

// Next empaqueta las rutas por separado: varias copias de este módulo viven en el mismo proceso. Un solo pulso.
const G = globalThis as typeof globalThis & { __arbrainPulsoConversaciones?: Pulso }
const pulso = (): Pulso => (G.__arbrainPulsoConversaciones ??= {
  almacen: null, maquina: { valor: null, hasta: 0 }, ultimoChequeo: 0, ultimoCiclo: 0, corriendo: false, pendiente: false, timer: null, timerPara: 0,
})

/** ¿Esta instalación está en el espejo? Solo la edición del alumno, con su copia y `.arbrain-espejo/maquina.json` activo. */
export function maquinaEnEspejo(env: Record<string, string | undefined> = process.env): Maquina | null {
  if (!esEdicionCliente(env)) return null
  const cerebro = env.ARBRAIN_HOME?.trim()
  if (!cerebro || !env.ARBRAIN_DATA_DIR?.trim()) return null
  try {
    const m = JSON.parse(readFileSync(join(cerebro, '.arbrain-espejo', 'maquina.json'), 'utf8')) as { activo?: unknown; host?: unknown }
    if (m?.activo !== true || typeof m.host !== 'string' || !HOST_RE.test(m.host)) return null
    return { cerebro, host: m.host }
  } catch { return null }
}

function maquina(): Maquina | null {
  const p = pulso()
  const ahora = Date.now()
  if (ahora < p.maquina.hasta) return p.maquina.valor
  p.maquina = { valor: maquinaEnEspejo(), hasta: ahora + 5_000 }
  return p.maquina.valor
}

export const archivoEstado = () => join(dirDatosWeb(), 'espejo-conversaciones.json')

function contexto(m: Maquina, almacen: AlmacenCrudo): Contexto {
  return { cerebro: m.cerebro, host: m.host, almacen, estadoArchivo: archivoEstado() }
}

/** Exporta lo propio y luego une lo ajeno: lo local sin exportar nunca lo pisa algo más viejo de la otra máquina. */
function unir(m: Maquina, almacen: AlmacenCrudo) {
  const ctx = contexto(m, almacen)
  exportar(ctx)
  return importar(ctx)
}

function registrar(texto: string) { console.error(`[espejo-conversaciones] ${texto}`) }

/** Antes de cada lectura del chat. Síncrono: si llegó algo, la lectura ya lo ve. */
export function alLeer(almacen: AlmacenCrudo): void {
  const m = maquina()
  if (!m) return
  const p = pulso()
  p.almacen = almacen
  const ahora = Date.now()
  if (ahora - p.ultimoChequeo < CADA_CHEQUEO_MS) return
  p.ultimoChequeo = ahora
  try {
    const ctx = contexto(m, almacen)
    if (hayNuevo(ctx)) unir(m, almacen)
  } catch (e) { registrar(`no pude unir lo de tu otra máquina: ${e instanceof Error ? e.message : e}`) }
  if (ahora - p.ultimoCiclo > FRESCURA_LECTURA_MS) pedirCiclo(ESPERA_ESCRITURA_MS / 3)
}

/** Después de cada escritura del chat. */
export function alEscribir(almacen: AlmacenCrudo): void {
  if (!maquina()) return
  pulso().almacen = almacen
  pedirCiclo(ESPERA_ESCRITURA_MS)
}

function pedirCiclo(enMs: number) {
  const p = pulso()
  if (p.corriendo) { p.pendiente = true; return }
  const para = Date.now() + enMs
  if (p.timer && p.timerPara <= para) return
  if (p.timer) clearTimeout(p.timer)
  p.timerPara = para
  p.timer = setTimeout(() => { p.timer = null; void ciclo() }, enMs)
  p.timer.unref?.()
}

/** node y espejo.mjs: el node que corre esta web y el motor de la copia del alumno. */
function motor(m: Maquina): string | null {
  const ruta = join(m.cerebro, 'arbrain', 'scripts', 'espejo', 'espejo.mjs')
  return existsSync(ruta) ? ruta : null
}

export async function ciclo(): Promise<{ codigo: string; motivo: string } | null> {
  const p = pulso()
  const m = maquina()
  if (!m || !p.almacen || p.corriendo) return null
  const espejo = motor(m)
  if (!espejo) return null
  p.corriendo = true
  p.ultimoCiclo = Date.now()
  const almacen = p.almacen
  try {
    try { exportar(contexto(m, almacen)) } catch (e) { registrar(`no pude exportar: ${e instanceof Error ? e.message : e}`) }
    const r = await new Promise<{ codigo: string; motivo: string }>((resolve) => {
      execFile(process.execPath, [espejo, 'sincronizar', '--json', '--cerebro', m.cerebro], { cwd: m.cerebro, timeout: 3 * 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        let j: { codigo?: string; motivo?: string } | null = null
        try { j = JSON.parse(String(stdout).trim().split('\n').pop() || 'null') } catch { /* sin salida */ }
        resolve({ codigo: j?.codigo ?? (err ? 'error' : 'ok'), motivo: j?.motivo ?? (err ? String(err.message).slice(0, 200) : '') })
      })
    })
    try {
      unir(m, almacen)
      const archivo = archivoEstado()
      const e = leerEstado(archivo)
      e.ultimaSync = { en: new Date().toISOString(), codigo: r.codigo, motivo: r.motivo }
      guardarEstado(archivo, e)
    } catch (e) { registrar(`no pude unir lo de tu otra máquina: ${e instanceof Error ? e.message : e}`) }
    if (r.codigo !== 'ok') registrar(`ciclo del espejo: ${r.codigo} · ${r.motivo}`)
    return r
  } finally {
    p.corriendo = false
    p.ultimoCiclo = Date.now()
    if (p.pendiente) { p.pendiente = false; pedirCiclo(ESPERA_ESCRITURA_MS) }
  }
}

/** Cada cuánto corre un ciclo aunque nadie use esta máquina (un VPS desatendido, el historial al encender el espejo). */
export function intervaloPeriodico(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.ARBRAIN_ESPEJO_INTERVALO_MS)
  return Number.isFinite(n) && n >= 5_000 ? n : 5 * 60_000
}

/**
 * Lo arma la web al arrancar (src/instrumentation.ts), una vez por proceso. Si el espejo está encendido y el último ciclo
 * tiene más de un intervalo, corre uno: exporta lo propio (también el historial que había antes de encenderlo) y une lo
 * ajeno, sin esperar a que alguien abra la app. Apagado: cada vuelta cuesta un `stat`.
 */
export function arrancarPeriodico(almacen: () => AlmacenCrudo, env: Record<string, string | undefined> = process.env): boolean {
  const g = globalThis as typeof globalThis & { __arbrainPeriodicoConversaciones?: boolean }
  if (g.__arbrainPeriodicoConversaciones || !esEdicionCliente(env)) return false
  g.__arbrainPeriodicoConversaciones = true
  const cada = intervaloPeriodico(env)
  const vuelta = () => {
    if (!maquina()) return
    const p = pulso()
    p.almacen ??= almacen()
    if (Date.now() - p.ultimoCiclo >= cada) void ciclo()
  }
  setTimeout(vuelta, 15_000).unref?.()
  setInterval(vuelta, Math.min(cada, 60_000)).unref?.()
  return true
}

/** Para Ajustes › Máquinas y las pruebas. */
export function estadoConversaciones(): { activo: false } | { activo: true; host: string; ultimaSync: { en: string; codigo: string; motivo: string } | null; ultimaImportacion: { en: string; operaciones: number; de: string[] } | null; aviso: string | null } {
  const m = maquinaEnEspejo()
  if (!m) return { activo: false }
  const e = leerEstado(archivoEstado())
  return { activo: true, host: m.host, ultimaSync: e.ultimaSync ?? null, ultimaImportacion: e.ultimaImportacion ?? null, aviso: e.aviso?.texto ?? null }
}
