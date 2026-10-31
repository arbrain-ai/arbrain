#!/usr/bin/env node
/**
 * Del rastro de una pantalla de error al código (31 oct 2026, soporte de un fundador en Windows con «Cannot read
 * properties of undefined (reading 'id')»). La edición cliente deja cada caída en
 * `<datos>/web/logs/errores-pantalla.jsonl` (api/error-pantalla): mensaje, stack minificado, componentStack, ruta y build.
 * El build publicado no trae mapas de fuente, así que el stack se lee contra el MISMO paquete que corre la persona:
 * `arbrain-programa-v<versión>-<so>.tar.gz` del release (los chunks de Windows no son idénticos a los de Mac).
 *
 *   node scripts/soporte/rastro-a-codigo.mjs <errores-pantalla.jsonl | línea.json> --version 0.2.17 [--so win32-x64] [--n 1]
 *   node scripts/soporte/rastro-a-codigo.mjs <archivo> --programa <carpeta del programa ya extraído (la que tiene web/)>
 *
 * En la computadora del alumno, su propio programa ya está extraído: `--programa <datos>/programa/v<versión>-<so>`
 * (Windows: `%APPDATA%\ai.arbrain.servidor\programa\v0.2.17-win32-x64`), sin bajar nada.
 *
 * Por cada paso del stack imprime el código minificado alrededor de la columna, los textos literales cercanos y dónde
 * aparecen en `arbrain/src` (git grep): casi siempre basta para nombrar el componente y la línea. También confirma que
 * el build del log (`build`) es el del paquete. Reporte: docs/builds/soporte-pantalla-id-2026-10-31/REPORTE.md.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(AQUI, '..', '..')

/** Pasos `/_next/static/...:línea:columna` de un stack (Chrome/WebView2 y Safari). Pura. */
export function pasosDelStack(stack) {
  const out = []
  // Las rutas de Next llevan paréntesis (`app/(main)/chat/page-….js`): se corta en `.js`, no en `)`.
  for (const m of String(stack ?? '').matchAll(/(\/_next\/static\/[^\s?]+?\.js)(?:\?[^\s:]*)?:(\d+):(\d+)/g)) {
    out.push({ archivo: m[1], linea: Number(m[2]), columna: Number(m[3]) })
  }
  return out
}

/** El fragmento alrededor de la columna (1-based) con un marcador «⟦aquí⟧». Pura. */
export function fragmento(texto, linea, columna, radio = 160) {
  const l = String(texto).split('\n')[linea - 1] ?? ''
  const i = Math.max(0, columna - 1)
  return `${l.slice(Math.max(0, i - radio), i)}⟦aquí⟧${l.slice(i, i + radio)}`
}

/**
 * Textos literales cercanos que sirven para buscar en el código fuente, del más cercano a la columna al más lejano.
 * Solo los que parecen texto de interfaz o un nombre propio (con espacio, acento o 12+ caracteres); los atributos
 * genéricos (`aria-label`, `button`) no distinguen nada. Pura.
 */
export function literalesCerca(texto, linea, columna, radio = 2500) {
  const l = String(texto).split('\n')[linea - 1] ?? ''
  const i = Math.max(0, columna - 1)
  const desde = Math.max(0, i - radio)
  const zona = l.slice(desde, i + radio)
  const hallados = []
  for (const m of zona.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.){6,80})\1/g)) {
    const s = m[2]
    const util = /[a-záéíóúñ]{3}/i.test(s) && (/\s/.test(s) || /[áéíóúñ¿¡«»]/i.test(s) || s.length >= 12) && !/^(aria|data)-/.test(s) && !/[{}]/.test(s)
    if (util) hallados.push({ s, d: Math.abs(desde + (m.index ?? 0) - i) })
  }
  return [...new Map(hallados.sort((a, b) => a.d - b.d).map(h => [h.s, h])).keys()].slice(0, 8)
}

function arg(nombre) { const i = process.argv.indexOf(nombre); return i > 0 ? process.argv[i + 1] : undefined }

function repoAlumno() {
  const conf = readFileSync(join(WEB, 'empaquetado', 'distribucion', 'destino.conf'), 'utf8')
  return /^REPO_ALUMNO=(.+)$/m.exec(conf)?.[1]?.trim() ?? 'arbrain-ai/arbrain'
}

function programaDe(version, so) {
  const dir = join(tmpdir(), `arbrain-programa-v${version}-${so}`)
  if (existsSync(join(dir, 'web'))) return dir
  mkdirSync(dir, { recursive: true })
  const nombre = `arbrain-programa-v${version}-${so}.tar.gz`
  console.error(`Bajando ${nombre} de ${repoAlumno()}…`)
  execFileSync('gh', ['release', 'download', `v${version}`, '-R', repoAlumno(), '-p', nombre, '-D', dir, '--clobber'], { stdio: 'inherit' })
  execFileSync('tar', ['-xzf', join(dir, nombre), '-C', dir], { stdio: 'inherit' })
  return dir
}

function buildDelPaquete(web) {
  // El build va inlinado en los chunks (NEXT_PUBLIC_ARBRAIN_BUILD): se busca en el de global-error, que es chico.
  const app = join(web, '.next', 'static', 'chunks', 'app')
  const f = existsSync(app) ? readdirSync(app).find(n => n.startsWith('global-error-')) : null
  const t = f ? readFileSync(join(app, f), 'utf8') : ''
  return /buildMio:"([a-z0-9]+)"/.exec(t)?.[1] ?? /\bbuild:"([a-z0-9]+)"/.exec(t)?.[1] ?? null
}

function enElCodigo(literal) {
  try {
    return execFileSync('git', ['grep', '-n', '-F', '--', literal, 'src'], { cwd: WEB, encoding: 'utf8' }).split('\n').filter(Boolean).slice(0, 3)
  } catch { return [] }
}

function main() {
  const entrada = process.argv[2]
  if (!entrada || entrada.startsWith('--')) {
    console.error('Uso: node scripts/soporte/rastro-a-codigo.mjs <errores-pantalla.jsonl> --version 0.2.17 [--so win32-x64] [--n 1] | --programa <dir>')
    process.exit(2)
  }
  const lineas = readFileSync(entrada, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().startsWith('{'))
  const n = Number(arg('--n') ?? 1)
  const raiz = arg('--programa') ?? programaDe(arg('--version') ?? readFileSync(join(WEB, 'empaquetado', 'distribucion', 'VERSION'), 'utf8').trim(), arg('--so') ?? 'win32-x64')
  const web = existsSync(join(raiz, 'web', '.next')) ? join(raiz, 'web') : raiz
  const buildPaquete = buildDelPaquete(web)
  for (const crudo of lineas.slice(-n)) {
    const r = JSON.parse(crudo)
    console.log(`\n══ ${r.en} · ${r.donde} · ${r.ruta}\n${r.mensaje}`)
    console.log(`build del log: ${r.build} · servidor: ${r.buildServidor} · paquete: ${buildPaquete ?? '¿?'}${r.build && buildPaquete && r.build !== buildPaquete ? '  ⚠ NO es el mismo build: las columnas no van a cuadrar' : ''}`)
    if (r.componentes) console.log(`componentes:\n${String(r.componentes).split('\n').filter(Boolean).slice(0, 15).join('\n')}`)
    for (const m of pasosDelStack(r.stack).slice(0, 6)) {
      const f = join(web, '.next', m.archivo.replace(/^\/_next\//, ''))
      if (!existsSync(f)) { console.log(`\n· ${m.archivo}:${m.linea}:${m.columna} (no está en este paquete)`); continue }
      const t = readFileSync(f, 'utf8')
      console.log(`\n· ${m.archivo}:${m.linea}:${m.columna}\n  ${fragmento(t, m.linea, m.columna)}`)
      for (const lit of literalesCerca(t, m.linea, m.columna)) {
        const donde = enElCodigo(lit)
        if (donde.length) console.log(`  «${lit.slice(0, 60)}» → ${donde.join(' | ')}`)
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
