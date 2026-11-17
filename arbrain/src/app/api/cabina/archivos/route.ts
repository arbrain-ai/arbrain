import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { planningOwner, planningError } from '@/lib/planning/server'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
import { raizWorkspace } from '@/lib/rutas-instalacion'
import { tr, trMarca } from '@/shared/i18n'
import { esEntradaSkill, limpiarPedida, unirRel, VETADO } from '@/features/cabina/archivos-cerebro'
import { debajoDe } from '@/lib/ruta-portable'
import { origenDe, raizTaller, skillsDelAutor, tituloDe } from '@/features/cabina/habilidades-cerebro'

// Taller del panel derecho (1 oct 2026): los archivos del cerebro, no todo el
// repo. Memoria, skills y documentos del negocio, de solo lectura y desde el
// filesystem del Studio (en la web sin repo montado responde vacío).

export const runtime = 'nodejs'

// Edición cliente: solo el workspace del alumno. Daniel: su repo (variable o respaldo de config/instalacion.ts).
const RAICES = () => esEdicionCliente() ? [raizWorkspace()] : [process.env.BUSINESS_OS_ROOT, instalacion().raizRepoRespaldo, path.join(process.cwd(), '..')].filter(Boolean) as string[]
// Cliente: su ARBRAIN_HOME aunque la memoria no esté sembrada (16 nov 2026; features/cabina/habilidades-cerebro.ts).
const raiz = () => raizTaller(RAICES(), esEdicionCliente(), existsSync)

type Grupo = 'memoria' | 'skills' | 'documentos'
interface Archivo { ruta: string; titulo: string; detalle: string | null; grupo: Grupo; editado: string; origen?: 'arbrain' | 'tuya' }

/** Solo estas carpetas y solo Markdown: nada de .env, código ni credenciales. */
const PERMITIDAS: { grupo: Grupo; dir: string; profundo: boolean }[] = [
  { grupo: 'memoria', dir: '.claude/memory', profundo: true },
  { grupo: 'skills', dir: '.claude/skills', profundo: true },
  { grupo: 'documentos', dir: 'docs/business-os', profundo: false },
]
/** «Instrucciones que tengo detrás» (5 oct 2026): lo que entra en CADA conversación, en lectura. Solo estos tres. */
const INSTRUCCIONES: { ruta: string; titulo: string; detalle: string }[] = [
  { ruta: 'CLAUDE.md', titulo: trMarca('Las reglas que gobiernan siempre'), detalle: trMarca('Quién soy, cómo trabajo contigo y las reglas que no se rompen') },
  { ruta: '.claude/memory/MEMORY.md', titulo: trMarca('La esencia de lo que sé de ti'), detalle: trMarca('Tu forma de decidir y las reglas vivas que aprendí contigo') },
  { ruta: '.claude/now.md', titulo: trMarca('Tu agenda de ahora'), detalle: trMarca('Hitos, el día, la semana y tus tareas; se genera sola') },
]
const SEMANA_MS = 7 * 86_400_000

async function caminar(base: string, dir: string, profundo: boolean, out: string[], nivel = 0) {
  let entradas: import('node:fs').Dirent[] = []
  try { entradas = await readdir(path.join(base, dir), { withFileTypes: true }) } catch { return }
  for (const e of entradas) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    // Siempre con `/` (Windows: `path.join` ponía `\` y Habilidades salía vacío; features/cabina/archivos-cerebro.ts).
    const rel = unirRel(dir, e.name)
    if (e.isDirectory() && profundo && nivel < 3) await caminar(base, rel, profundo, out, nivel + 1)
    else if (e.isFile() && e.name.endsWith('.md') && !VETADO.test(rel)) out.push(rel)
  }
}

// Título y «para qué sirve»: features/cabina/habilidades-cerebro.ts (frontmatter con `>`, CRLF y metadata.resumen).

export async function GET(request: Request) {
  try {
    await planningOwner()
    const base = raiz()
    if (!base) return Response.json({ archivos: [], raiz: null }, { headers: { 'Cache-Control': 'no-store' } })
    const pedida = new URL(request.url).searchParams.get('ruta')

    if (pedida) {
      const limpia = limpiarPedida(pedida)
      const ok = limpia.endsWith('.md') && !VETADO.test(limpia) && (PERMITIDAS.some(p => limpia.startsWith(p.dir + '/')) || INSTRUCCIONES.some(x => x.ruta === limpia))
      const abs = path.join(base, limpia)
      if (!ok || !debajoDe(abs, path.resolve(base))) return Response.json({ error: tr('Ese archivo no es del cerebro.') }, { status: 403 })
      const [texto, info] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
      return Response.json({ ruta: limpia, texto: texto.slice(0, 200_000), editado: info.mtime.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const archivos: Archivo[] = []
    // El conteo es el real (el crecimiento del cerebro), aunque la lista se corte en 40/80 por grupo.
    const totales: Record<Grupo, number> = { memoria: 0, skills: 0, documentos: 0 }, semana: Record<Grupo, number> = { memoria: 0, skills: 0, documentos: 0 }
    const ahora = Date.now()
    const delAutor = await skillsDelAutor(base)
    for (const p of PERMITIDAS) {
      const rutas: string[] = []
      await caminar(base, p.dir, p.profundo, rutas)
      // Skills: solo su entrada; las referencias cuelgan de ella.
      const propias = p.grupo === 'skills' ? rutas.filter(esEntradaSkill) : rutas
      const conFecha = await Promise.all(propias.map(async r => ({ r, m: (await stat(path.join(base, r))).mtime })))
      conFecha.sort((a, b) => b.m.getTime() - a.m.getTime())
      totales[p.grupo] = conFecha.length
      semana[p.grupo] = conFecha.filter(x => ahora - x.m.getTime() < SEMANA_MS).length
      for (const { r, m } of conFecha.slice(0, p.grupo === 'skills' ? 80 : 40)) {
        const cabeza = (await readFile(path.join(base, r), 'utf8')).slice(0, 6000)
        const origen = p.grupo === 'skills' ? origenDe(delAutor, r) : undefined
        archivos.push({ ruta: r, grupo: p.grupo, editado: m.toISOString(), ...tituloDe(cabeza, r), ...(origen ? { origen } : {}) })
      }
    }
    const instrucciones = (await Promise.all(INSTRUCCIONES.map(async x => {
      const info = await stat(path.join(base, x.ruta)).catch(() => null)
      return info ? { ...x, titulo: tr(x.titulo), detalle: tr(x.detalle), editado: info.mtime.toISOString(), bytes: info.size } : null
    }))).filter(Boolean)
    return Response.json({ archivos, raiz: path.basename(base), totales, semana, instrucciones }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return planningError(error) }
}
