#!/usr/bin/env node
/**
 * Revisión de una actualización ANTES de traerla (seguridad noche 21→22 oct 2026, carril 2-APP-ALUMNO).
 *
 *   node arbrain/scripts/revisar-actualizacion.mjs <desde> <hasta>      # p. ej. main dani/main
 *   node arbrain/scripts/revisar-actualizacion.mjs <desde> <hasta> --json
 *
 * «Jala los últimos cambios» trae código que después corre en la máquina de la persona: ganchos que Claude Code ejecuta
 * solo, scripts de npm que corren al instalar, el supervisor del modo servidor, la semilla, las instrucciones que el
 * agente obedece. Si alguien empuja algo malicioso al repo del autor (cuenta robada, PR colado), ahí es donde lo pone.
 * Este script lista, en lenguaje simple, QUÉ de eso cambia entre dos versiones, para que la persona lo vea y dé su OK
 * antes del merge. No decide por ella ni bloquea: informa. Sale con 0 si no hay nada sensible y con 3 si lo hay.
 *
 * Importante: se corre con el script de la versión INSTALADA (la carpeta de trabajo), nunca con el que viene en la
 * actualización (ese lo controla quien la escribió). Solo lee git: no ejecuta nada de la versión nueva.
 */
import { spawnSync } from 'node:child_process'

/** Categorías, de más a menos peligrosa. `re` sobre la ruta relativa a la raíz del repo. */
export const CATEGORIAS = [
  { id: 'ganchos', titulo: 'Ganchos y ajustes del agente (Claude Code los ejecuta solo, con tus permisos)', re: /(^|\/)\.claude\/(settings(\.local)?\.json|hooks\/)|(^|\/)\.mcp\.json$|(^|\/)\.codex\// },
  { id: 'git', titulo: 'Configuración de git que ejecuta programas (filtros, submódulos, ganchos)', re: /(^|\/)\.git(attributes|modules)$|(^|\/)\.husky\/|(^|\/)\.githooks\// },
  { id: 'instalar', titulo: 'Lo que corre al instalar o arrancar (npm, supervisor, semilla, scripts)', re: /(^|\/)package\.json$|(^|\/)\.npmrc$|^arbrain\/scripts\/servidor(\.mjs|\/)|^arbrain\/cerebro\/sembrar\.py$|\.(sh|ps1|bat|cmd)$|(^|\/)(Makefile|justfile)$/ },
  { id: 'instrucciones', titulo: 'Instrucciones que el agente obedece (CLAUDE.md, AGENTS.md, skills, agentes, comandos)', re: /(^|\/)(CLAUDE|AGENTS)(\.local)?\.md$|(^|\/)\.claude\/(skills|agents|commands|output-styles|rules)\// },
  // Corren en GitHub, no en tu máquina: se listan para que se vean, pero no piden tu OK.
  { id: 'ci', titulo: 'Automatizaciones de GitHub (corren en GitHub, no en tu máquina)', re: /^\.github\//, informativa: true },
]

/** Scripts de npm que corren solos al instalar (npm los ejecuta sin preguntar). */
export const CICLO_NPM = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'preprepare', 'postprepare', 'prepublish', 'preuninstall', 'uninstall', 'postuninstall'])

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`)
  return r.stdout
}

/** Cambios con su estado (A/M/D/R) entre dos refs, sin seguir lo que el repo configure (sin textconv ni filtros). */
export function cambios(desde, hasta, cwd = process.cwd()) {
  const salida = git(['-c', 'core.quotepath=off', 'diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '-M', `${desde}`, `${hasta}`, '--'], cwd)
  const partes = salida.split('\0').filter(Boolean)
  const lista = []
  for (let i = 0; i < partes.length; i++) {
    const estado = partes[i]
    if (/^[RC]/.test(estado)) { lista.push({ estado: estado[0], ruta: partes[i + 2], antes: partes[i + 1] }); i += 2 }
    else { lista.push({ estado: estado[0], ruta: partes[i + 1] }); i += 1 }
  }
  return lista
}

const leerEn = (ref, ruta, cwd) => { try { return git(['show', `${ref}:${ruta}`], cwd) } catch { return null } }

/** Scripts de npm que aparecen o cambian (los del ciclo de instalación, marcados). */
export function scriptsNpm(antes, despues) {
  const s = (t) => { try { const j = JSON.parse(t ?? '{}'); return j && typeof j.scripts === 'object' && j.scripts ? j.scripts : {} } catch { return {} } }
  const a = s(antes), d = s(despues)
  const fuera = []
  for (const [k, v] of Object.entries(d)) if (a[k] !== v) fuera.push({ script: k, comando: String(v), nuevo: !(k in a), alInstalar: CICLO_NPM.has(k) })
  return fuera
}

/** Filtros de `.gitattributes` (filter=/diff=/merge= ejecutan el programa que diga la config). */
export const atributosQueEjecutan = (texto) => (texto ?? '').split('\n').filter(l => /\b(filter|diff|merge)=/.test(l) && !/^\s*#/.test(l))

export function revisar(desde, hasta, cwd = process.cwd()) {
  const lista = cambios(desde, hasta, cwd)
  const grupos = CATEGORIAS.map(c => ({ ...c, archivos: lista.filter(x => c.re.test(x.ruta) || (x.antes && c.re.test(x.antes))) }))
  const npm = []
  for (const x of lista) if (/(^|\/)package\.json$/.test(x.ruta)) {
    for (const s of scriptsNpm(leerEn(desde, x.antes ?? x.ruta, cwd), leerEn(hasta, x.ruta, cwd))) npm.push({ archivo: x.ruta, ...s })
  }
  const atributos = lista.filter(x => /(^|\/)\.gitattributes$/.test(x.ruta)).flatMap(x => atributosQueEjecutan(leerEn(hasta, x.ruta, cwd)).map(l => ({ archivo: x.ruta, linea: l })))
  const sensibles = grupos.some(g => !g.informativa && g.archivos.length) || npm.length > 0
  return { desde, hasta, total: lista.length, grupos: grupos.map(({ re, ...g }) => g), npm, atributos, sensibles }
}

export function texto(r) {
  const l = [`Revisión de la actualización ${r.desde} → ${r.hasta}: ${r.total} archivo(s) cambian.`]
  if (!r.sensibles) l.push('Nada de lo que cambia se ejecuta solo ni cambia las instrucciones del agente.')
  else l.push('Esto cambia cosas que corren en tu máquina o que el agente obedece. Revísalo antes de aceptar:')
  for (const g of r.grupos) if (g.archivos.length && (r.sensibles || g.informativa)) {
    l.push('', `• ${g.titulo}:`)
    for (const a of g.archivos.slice(0, 40)) l.push(`    ${{ A: 'nuevo', M: 'cambia', D: 'se borra', R: 'se mueve', C: 'se copia', T: 'cambia de tipo' }[a.estado] ?? a.estado}  ${a.antes ? `${a.antes} → ` : ''}${a.ruta}`)
    if (g.archivos.length > 40) l.push(`    … y ${g.archivos.length - 40} más`)
  }
  if (r.npm.length) {
    l.push('', '• Scripts de npm nuevos o cambiados:')
    for (const s of r.npm) l.push(`    ${s.alInstalar ? '[CORRE SOLO AL INSTALAR] ' : ''}${s.archivo} › ${s.script}${s.nuevo ? ' (nuevo)' : ''}: ${s.comando.slice(0, 300)}`)
  }
  if (r.atributos.length) {
    l.push('', '• .gitattributes con filtros que ejecutan programas (no es normal en Arbrain):')
    for (const a of r.atributos) l.push(`    ${a.archivo}: ${a.linea.slice(0, 200)}`)
  }
  l.push('', 'Para ver el detalle de un archivo: git diff --no-ext-diff --no-textconv ' + `${r.desde} ${r.hasta} -- <archivo>`)
  return l.join('\n')
}

const esPrincipal = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('revisar-actualizacion.mjs')
if (esPrincipal) {
  const [desde, hasta] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  if (!desde || !hasta) { console.error('Uso: node arbrain/scripts/revisar-actualizacion.mjs <desde> <hasta> [--json]'); process.exit(2) }
  try {
    const r = revisar(desde, hasta)
    console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 1) : texto(r))
    process.exit(r.sensibles ? 3 : 0)
  } catch (e) { console.error(`[revisar-actualizacion] ${e.message}`); process.exit(2) }
}
