/**
 * Procedencia de lo escrito tras leer contenido de afuera (seguridad noche 21→22 oct 2026, carril 2-APP-ALUMNO).
 *
 * La sesión contaminada (`guardia-agentes.ts`) frena las acciones con efecto, pero deja escribir notas dentro del
 * cerebro («resúmeme esta página en una nota»). Sin rastro, esa nota es una inyección de SEGUNDA ORDEN: mañana, en una
 * conversación limpia, Levy la lee como si fuera de la persona y la orden escondida vuelve a tener fuerza. Aquí queda
 * qué archivos del cerebro escribió una sesión contaminada y desde qué fuente; leerlos después contamina la sesión que
 * los lee (`fuenteExterna`), con el mismo freno de siempre.
 *
 * Vive en `<ARBRAIN_DATA_DIR>/procedencia-externa.json` (carpeta protegida: el agente no la lee ni la escribe). Sin
 * carpeta de datos, solo en memoria. Tope de entradas: las más viejas salen primero. Si la persona reescribe la nota a
 * mano, la marca sigue (preguntar de más es barato; obedecer una orden escondida, no).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MAX = 2000

export interface Procedencia {
  marcar(real: string, fuente: string): void
  de(real: string): string | null
  /** ¿Hay alguna nota marcada bajo esta carpeta (o igual a ella)? Para Grep/Glob/recorridos (hallazgo 2). */
  bajo(dir: string): string | null
}

export function crearProcedencia(archivo: string | null): Procedencia {
  let mapa: Map<string, { fuente: string; t: number }> | null = null
  const cargar = () => {
    if (mapa) return mapa
    mapa = new Map()
    if (archivo && existsSync(archivo)) {
      try {
        const j = JSON.parse(readFileSync(archivo, 'utf8')) as { archivos?: Record<string, { fuente?: string; t?: number }> }
        for (const [k, v] of Object.entries(j.archivos ?? {})) if (typeof v?.fuente === 'string') mapa.set(k, { fuente: v.fuente.slice(0, 200), t: Number(v.t) || 0 })
      } catch { /* archivo ilegible: se empieza de cero, sin romper el turno */ }
    }
    return mapa
  }
  const guardar = () => {
    if (!archivo || !mapa) return
    try {
      mkdirSync(dirname(archivo), { recursive: true, mode: 0o700 })
      const tmp = `${archivo}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ archivos: Object.fromEntries(mapa) }) + '\n', { mode: 0o600 })
      renameSync(tmp, archivo)
    } catch { /* la procedencia nunca rompe un turno */ }
  }
  return {
    marcar(real, fuente) {
      const m = cargar()
      m.delete(real)
      m.set(real, { fuente: fuente.slice(0, 200), t: Date.now() })
      while (m.size > MAX) m.delete(m.keys().next().value as string)
      guardar()
    },
    de(real) { return cargar().get(real)?.fuente ?? null },
    bajo(dir) {
      const m = cargar()
      if (!m.size) return null
      const pref = dir.endsWith('/') ? dir : dir + '/'
      for (const [ruta, v] of m) if (ruta === dir || ruta.startsWith(pref)) return v.fuente
      return null
    },
  }
}

let delDaemon: Procedencia | null = null
/** La del daemon (una por proceso), en su carpeta de datos. */
export function procedenciaDelDaemon(env: NodeJS.ProcessEnv = process.env): Procedencia {
  if (!delDaemon) delDaemon = crearProcedencia(env.ARBRAIN_DATA_DIR ? join(env.ARBRAIN_DATA_DIR, 'procedencia-externa.json') : null)
  return delDaemon
}

/** URLs de un texto (resultado de herramienta o mensaje de la persona), sin la puntuación que las cierra. */
export function extraerUrls(texto: string, max = 400): string[] {
  const fuera: string[] = []
  for (const m of texto.matchAll(/https?:\/\/[^\s"'<>`\\)\]}|]+/gi)) {
    fuera.push(m[0].replace(/[.,;:!?*_~]+$/, ''))
    if (fuera.length >= max) break
  }
  return fuera
}

/** Forma comparable de una URL: sin fragmento, host en minúsculas, sin `/` final. null si no es http(s). */
export function normalizarUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    return u.href.replace(/\/$/, '')
  } catch { return null }
}
