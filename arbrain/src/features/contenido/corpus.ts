/**
 * Cuartel de Contenido · herramientas del servidor que NO dependen del PATH (cuartel v2, 15 nov 2026).
 *
 * El servidor instalado (next-server en :3300) lo lanza launchd con PATH mínimo (/usr/bin:/bin:/usr/sbin:/sbin): ni `rg`
 * ni el python3/yt-dlp de Homebrew existen ahí. Por eso el transcript de nQwJVHCtDDY «no se pudo traer» aunque el archivo
 * existía. Aquí: python por ruta absoluta, PATH completo para sus hijos (yt-dlp) y un índice propio del corpus en Node.
 * Sin `server-only` a propósito: lo prueba `tests/cuartel/corpus-transcript.test.ts` con PATH mínimo.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const BINARIOS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

export function entornoHerramientas(base: Record<string, string | undefined> = process.env): NodeJS.ProcessEnv {
  const actual = (base.PATH ?? '').split(':').filter(Boolean)
  return { ...base, PATH: [...new Set([...BINARIOS, ...actual])].join(':') } as unknown as NodeJS.ProcessEnv
}

export function python3(): string {
  return ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'].find(p => existsSync(p)) ?? 'python3'
}

const ID_EN_NOMBRE = /(?:^|_)([\w-]{11})\.md$/
let indice: { corpus: string; hecho: number; mapa: Map<string, string> } | null = null

/** video_id → archivo, de todo `contenido/youtube/intel/**` (hasta 5 niveles). Una pasada de readdir (~6,600 .md). */
export async function indexarCorpus(corpus: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  async function andar(dir: string, nivel: number) {
    const hijos = await readdir(dir, { withFileTypes: true }).catch(() => [])
    await Promise.all(hijos.map(async h => {
      const ruta = path.join(dir, h.name)
      if (h.isDirectory()) { if (nivel < 5 && !h.name.startsWith('.')) await andar(ruta, nivel + 1); return }
      if (!h.name.endsWith('.md')) return
      const id = h.name.match(ID_EN_NOMBRE)?.[1] ?? h.name.match(/^([\w-]{11})\./)?.[1] ?? null
      // `<fecha>_<id>.md` (el del sensor) manda sobre otras variantes del mismo id
      if (id && (!mapa.has(id) || /^\d{8}_/.test(h.name))) mapa.set(id, ruta)
    }))
  }
  await andar(corpus, 0)
  return mapa
}

async function rutaEnVista(R: string, dirCuartel: string, nombre: string, videoId: string): Promise<string | null> {
  try {
    const v = JSON.parse(await readFile(path.join(dirCuartel, 'vistas', nombre), 'utf8')) as { videos?: unknown[]; outliers?: unknown[] }
    const x = (v.videos ?? v.outliers ?? []).find(y => (y as { video_id?: string })?.video_id === videoId) as { transcript?: { ruta?: string | null } } | undefined
    const ruta = x?.transcript?.ruta
    return ruta && existsSync(path.join(R, ruta)) ? path.join(R, ruta) : null
  } catch { return null }
}

/** Dónde está el transcript de un video: lo que dicen las vistas del sensor y, si no, el índice del corpus. */
export async function rutaTranscript(R: string, videoId: string, dirCuartel: string): Promise<string | null> {
  for (const nombre of ['videos.json', 'outliers.json']) {
    const r = await rutaEnVista(R, dirCuartel, nombre, videoId)
    if (r) return r
  }
  const corpus = path.join(R, 'contenido', 'youtube', 'intel')
  // si no está, se rehace (un transcript recién bajado) como mucho cada 20 s
  if (!indice || indice.corpus !== corpus || (!indice.mapa.has(videoId) && Date.now() - indice.hecho > 20_000)) {
    indice = { corpus, hecho: Date.now(), mapa: await indexarCorpus(corpus) }
  }
  const hallado = indice.mapa.get(videoId) ?? null
  return hallado && existsSync(hallado) ? hallado : null
}
