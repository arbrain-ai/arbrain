/**
 * Estado vivo del sistema nervioso del lienzo (14 oct 2026): lo que un nodo declara como fuente (`launchd`, `json`)
 * medido en el Studio, con caché y en lote. El lienzo pregunta cada minuto como mucho y solo con la pestaña a la
 * vista (ui/useNervio.ts); aquí cada fuente se mide UNA vez por ventana de caché aunque la pidan diez nodos o tres
 * ventanas, y dos pedidos simultáneos comparten la misma medición.
 *
 * Honestidad: lo que no se puede medir es gris («sin dato»), nunca verde ni cero. Un cron cargado no prueba que corra:
 * manda su log (ver `evaluarLaunchd`).
 */
import { execFile } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  claveFuente, evaluarLaunchd, formatear, leerLaunchctl, leerRuta,
  type EstadoVivo, type FuenteEstado, type LecturaLaunchd,
} from '@/features/canvas/model/nervio'

const TTL: Record<FuenteEstado['tipo'], number> = { launchd: 15_000, json: 30_000 }
const cache = new Map<string, { t: number; v: Promise<EstadoVivo> }>()

export interface OpcionesEstado {
  /** Hosts a los que se permite preguntar (los dominios propios de la instalación). Nada más sale del Studio. */
  hosts: readonly string[]
  /** launchd solo existe en la Mac de Daniel; la edición del alumno y otros sistemas lo marcan sin dato. */
  launchd: boolean
  ahora?: () => number
}

const correr = (cmd: string, args: string[], timeout = 3000) => new Promise<{ ok: boolean; out: string }>(resolve => {
  execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, out) => resolve({ ok: !err, out: String(out ?? '') }))
})

/** Las últimas líneas de un log (4 KB): la que contiene `resumen` o la última no vacía. */
async function ultimaLinea(ruta: string, resumen?: string): Promise<string | null> {
  let fh
  try {
    fh = await open(ruta, 'r')
    const { size } = await fh.stat()
    const n = Math.min(size, 4096)
    const buf = Buffer.alloc(n)
    await fh.read(buf, 0, n, size - n)
    const lineas = buf.toString('utf8').split('\n').map(l => l.trim()).filter(Boolean)
    const l = resumen ? [...lineas].reverse().find(x => x.includes(resumen)) : lineas[lineas.length - 1]
    return l ? l.slice(0, 160) : null
  } catch { return null } finally { await fh?.close().catch(() => {}) }
}

interface Plist { StandardOutPath?: string; StandardErrorPath?: string }
const plists = new Map<string, { t: number; v: Plist | null }>()
async function leerPlist(label: string): Promise<Plist | null> {
  const ya = plists.get(label)
  if (ya && Date.now() - ya.t < 5 * 60_000) return ya.v
  const r = await correr('plutil', ['-convert', 'json', '-o', '-', path.join(homedir(), 'Library/LaunchAgents', `${label}.plist`)])
  let v: Plist | null = null
  try { v = r.ok ? JSON.parse(r.out) as Plist : null } catch { v = null }
  plists.set(label, { t: Date.now(), v })
  return v
}

async function medirLaunchd(f: Extract<FuenteEstado, { tipo: 'launchd' }>, ahora: number): Promise<Omit<EstadoVivo, 'medidoEn'>> {
  const [lista, pl] = await Promise.all([correr('launchctl', ['list', f.label]), leerPlist(f.label)])
  const { codigo, pid } = lista.ok ? leerLaunchctl(lista.out) : { codigo: null, pid: null }
  const out = pl?.StandardOutPath, err = pl?.StandardErrorPath
  const [so, se] = await Promise.all([out ? stat(out).catch(() => null) : null, err ? stat(err).catch(() => null) : null])
  const lectura: LecturaLaunchd = {
    cargado: lista.ok, codigo, corriendo: pid != null,
    atrasoS: f.atraso ?? null,
    ultima: so ? so.mtimeMs : null, error: se ? se.mtimeMs : null, bytesError: se?.size ?? 0,
    linea: out ? await ultimaLinea(out, f.resumen) : null,
  }
  return evaluarLaunchd(lectura, ahora)
}

async function medirJson(f: Extract<FuenteEstado, { tipo: 'json' }>, hosts: readonly string[]): Promise<Omit<EstadoVivo, 'medidoEn'>> {
  const u = new URL(f.url)
  if (!hosts.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) return { semaforo: 'gris', texto: 'fuente no permitida', detalle: `${u.hostname} no es un dominio propio` }
  try {
    const r = await fetch(u.href, { signal: AbortSignal.timeout(4000), cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!r.ok) return { semaforo: 'rojo', texto: `responde ${r.status}`, detalle: u.href }
    const j = await r.json() as unknown
    const texto = formatear(f, leerRuta(j, f.valor), f.total ? leerRuta(j, f.total) : undefined)
    if (texto == null) return { semaforo: 'gris', texto: 'sin dato', detalle: `la respuesta no trae «${f.valor}»` }
    return { semaforo: 'verde', texto, detalle: u.host + u.pathname }
  } catch (e) {
    return { semaforo: 'rojo', texto: 'no responde', detalle: e instanceof Error ? e.message.slice(0, 120) : null }
  }
}

export async function medirFuente(f: FuenteEstado, o: OpcionesEstado): Promise<EstadoVivo> {
  const ahora = o.ahora ?? Date.now
  const clave = claveFuente(f)
  const ya = cache.get(clave)
  if (ya && ahora() - ya.t < TTL[f.tipo]) return ya.v
  const v = (async (): Promise<EstadoVivo> => {
    const t = ahora()
    const r = f.tipo === 'launchd'
      ? (o.launchd ? await medirLaunchd(f, t) : { semaforo: 'gris' as const, texto: 'sin dato aquí', detalle: 'launchd solo se lee en el Studio' })
      : await medirJson(f, o.hosts)
    return { ...r, medidoEn: new Date(t).toISOString() }
  })()
  cache.set(clave, { t: ahora(), v })
  if (cache.size > 300) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k)
  return v
}

/** Borra la caché (pruebas). */
export const olvidarEstados = () => { cache.clear(); plists.clear() }
