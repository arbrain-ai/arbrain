/**
 * Taller › Habilidades: qué dice cada habilidad y de dónde viene (16 nov 2026, un alumno: «en habilidades tampoco me
 * aparece ninguna, entonces no sé si las que vienen incorporadas con el cerebro no son parte»).
 *
 * Las rutas con «/» en Windows viven en archivos-cerebro.ts (rama de Windows). Aquí, lo que quedaba en cualquier sistema:
 *   - La raíz: en la copia del alumno exigía `.claude/memory/MEMORY.md`; con la memoria sin sembrar (sembrar.py falló o
 *     la borró) todo el Taller salía vacío aunque sus habilidades estuvieran. En cliente la raíz es su ARBRAIN_HOME.
 *   - «Para qué sirve»: el frontmatter se leía con una regex de una línea; las descripciones `description: >` salían
 *     como «>», las demás con sus disparadores («Usar ante…», en inglés en canvas) y con CRLF (git en Windows) ninguna.
 *     Ahora: `metadata.resumen` si la skill lo trae (las 20 del cerebro), si no la descripción sin disparadores (las que
 *     el alumno crea).
 *   - Origen: «Viene con Arbrain» o «Tuya», según `skills_del_autor` de CAPAS.json de su copia.
 * Puro salvo `skillsDelAutor`, que lee un archivo.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type Origen = 'arbrain' | 'tuya'

const sinComillas = (v: string) => v.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim()

/**
 * Frontmatter YAML mínimo: `clave: valor`, bloques `>`/`|` (doblados en una línea), comillas y un nivel anidado
 * (`metadata.resumen`). Tolera CRLF y BOM. Sin frontmatter cerrado devuelve {}.
 */
export function frontmatter(texto: string): Record<string, string> {
  const t = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const cuerpo = /^---\n([\s\S]*?)\n---(\n|$)/.exec(t)?.[1]
  const out: Record<string, string> = {}
  if (!cuerpo) return out
  const lineas = cuerpo.split('\n')
  let padre: string | null = null
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(lineas[i])
    if (!m) continue
    const sangria = m[1].length
    if (sangria === 0) padre = null
    else if (!padre) continue
    const clave = padre ? `${padre}.${m[2]}` : m[2]
    let valor = m[3].trim()
    if (/^[>|][+-]?$/.test(valor)) {
      const bloque: string[] = []
      while (i + 1 < lineas.length) {
        const sig = lineas[i + 1]
        if (sig.trim() !== '' && /^\s*/.exec(sig)![0].length <= sangria) break
        bloque.push(sig.trim()); i++
      }
      valor = bloque.filter(Boolean).join(' ')
    } else if (valor === '' && sangria === 0) { padre = m[2]; continue }
    out[clave] = sinComillas(valor)
  }
  return out
}

/** La parte de la descripción que dice para qué sirve, sin los disparadores («Usar ante…», «Triggers:», «NO:»). */
export function paraQueSirve(descripcion: string): string {
  const d = descripcion.replace(/\s+/g, ' ').trim()
  const corte = /\s(Usar|Úsala|Úsalo|Use when|Use this|Triggers?:|Disparadores:|NO:)/.exec(d)
  return (corte && corte.index >= 20 ? d.slice(0, corte.index) : d).trim()
}

const recortar = (s: string, n: number) => s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`

/** Título y detalle de una fila del Taller (memoria, habilidad o documento). Ruta relativa con «/». */
export function tituloDe(texto: string, ruta: string) {
  const fm = frontmatter(texto)
  const nombre = fm.name || undefined
  const desc = fm.description || undefined
  const h1 = /^#\s+(.+)$/m.exec(texto.replace(/\r\n?/g, '\n'))?.[1]?.trim()
  const skill = ruta.endsWith('/SKILL.md') ? ruta.split('/').at(-2)! : null
  const detalle = skill ? (fm['metadata.resumen'] || (desc ? paraQueSirve(desc) : null)) : (desc ?? null)
  return { titulo: (skill ?? nombre ?? h1 ?? path.posix.basename(ruta, '.md')).slice(0, 140), detalle: detalle ? recortar(detalle, 220) : null }
}

/** Skills del autor según CAPAS.json de la copia del alumno; null fuera de ella (la instalación original no lo tiene). */
export async function skillsDelAutor(base: string, leer: (p: string) => Promise<string> = p => readFile(p, 'utf8')): Promise<Set<string> | null> {
  try {
    const capas = JSON.parse(await leer(path.join(base, 'CAPAS.json'))) as { skills_del_autor?: unknown }
    return Array.isArray(capas.skills_del_autor) ? new Set(capas.skills_del_autor.filter((x): x is string => typeof x === 'string')) : null
  } catch { return null }
}

/** «Viene con Arbrain» o «Tuya» para `.claude/skills/<nombre>/SKILL.md`; nada fuera de la copia del alumno. */
export const origenDe = (delAutor: Set<string> | null, ruta: string): Origen | undefined =>
  delAutor ? (delAutor.has(ruta.split('/')[2]) ? 'arbrain' : 'tuya') : undefined

/**
 * Raíz del Taller. Edición cliente: el workspace del alumno en cuanto existe, aunque su memoria no esté sembrada.
 * Instalación original: la primera candidata con `.claude/memory/MEMORY.md`, como siempre.
 */
export function raizTaller(candidatas: string[], cliente: boolean, existe: (p: string) => boolean): string | null {
  if (cliente) return candidatas.find(r => existe(r)) ?? null
  return candidatas.find(r => existe(path.join(r, '.claude', 'memory', 'MEMORY.md'))) ?? null
}
