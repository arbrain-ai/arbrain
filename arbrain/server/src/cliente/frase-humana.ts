/**
 * Qué hará un comando, dicho para alguien de 50 años que no es técnico (botón Play, 27 oct 2026). La tarjeta del hilo
 * pone esta frase arriba y el comando literal abajo: la frase orienta, el literal manda (es lo que de verdad corre).
 *
 * Reglas: nunca promete de más (si no reconoce el comando, lo dice: «un comando que no reconozco»); nombra lo que toca
 * (internet, archivos, borrar) en palabras de todos los días; cero jerga sin traducir. Pura.
 */
import { analizarShell } from './shell.js'
import { familiaDe, valeTrasAfuera, type FamiliaRegla } from './reglas-siempre.js'
import { tr, trMarca } from '../i18n/tr.js'

type Traductor = (args: string[]) => string | null

const nombreArchivo = (a: string | undefined) => a ? a.replace(/^.*[\\/]/, '') || a : ''
const posicionales = (args: string[]) => args.filter(a => !a.startsWith('-'))
/** «el archivo x.pdf», «x.pdf y y.pdf» o «14 archivos»: más de tres nombres no se leen, se cuentan. */
const cuantos = (archivos: string[]) => archivos.length === 0 ? tr('archivos') : archivos.length > 3 ? tr('{n} archivos', { n: archivos.length }) : archivos.map(nombreArchivo).join(', ')

const GIT: Record<string, string> = {
  status: trMarca('Ver qué archivos de tu proyecto cambiaron'),
  log: trMarca('Ver el historial de cambios de tu proyecto'),
  diff: trMarca('Ver exactamente qué cambió en tus archivos'),
  show: trMarca('Ver el detalle de un cambio guardado'),
  add: trMarca('Marcar archivos para guardarlos en el historial'),
  commit: trMarca('Guardar una versión de tu proyecto en su historial'),
  push: trMarca('Subir tus cambios a internet (GitHub)'),
  pull: trMarca('Bajar de internet los cambios más nuevos de tu proyecto'),
  fetch: trMarca('Revisar en internet si hay cambios nuevos (sin aplicarlos)'),
  clone: trMarca('Descargar una copia de un proyecto de internet'),
  checkout: trMarca('Cambiar de versión o de rama de tu proyecto'),
  switch: trMarca('Cambiar de rama de tu proyecto'),
  branch: trMarca('Ver o crear ramas (versiones paralelas) de tu proyecto'),
  merge: trMarca('Juntar una rama con otra'),
  stash: trMarca('Guardar a un lado cambios sin terminar'),
}

const PAQUETES: Record<string, (args: string[]) => string> = {
  install: a => posicionales(a).length > 0 ? tr('Descargar e instalar {piezas} en tu proyecto (usa internet)', { piezas: posicionales(a).join(', ') }) : tr('Descargar e instalar las piezas que tu proyecto necesita (usa internet)'),
  i: a => PAQUETES.install(a),
  add: a => PAQUETES.install(a),
  ci: () => tr('Reinstalar desde cero las piezas de tu proyecto (usa internet)'),
  test: () => tr('Correr las pruebas de tu proyecto para ver si todo funciona'),
  run: a => posicionales(a)[0] ? tr('Correr la tarea «{tarea}» de tu proyecto', { tarea: posicionales(a)[0] }) : tr('Ver las tareas que tiene tu proyecto'),
  start: () => tr('Arrancar tu proyecto'),
  build: () => tr('Preparar tu proyecto para publicarlo (no publica nada)'),
  dev: () => tr('Arrancar tu proyecto en modo de prueba'),
  publish: () => tr('Publicar tu paquete en internet para que otros lo descarguen'),
  uninstall: a => tr('Quitar {pieza} de tu proyecto', { pieza: posicionales(a).join(', ') || tr('una pieza') }),
  remove: a => PAQUETES.uninstall(a),
}

const PROGRAMAS: Record<string, Traductor> = {
  ls: a => posicionales(a)[0] ? tr('Ver qué archivos hay en la carpeta {carpeta}', { carpeta: posicionales(a)[0] }) : tr('Ver qué archivos hay en esta carpeta'),
  cat: a => posicionales(a).length ? tr('Leer el archivo {archivo}', { archivo: posicionales(a).map(nombreArchivo).join(', ') }) : null,
  head: a => posicionales(a).length ? tr('Leer el principio de {archivo}', { archivo: nombreArchivo(posicionales(a)[0]) }) : null,
  tail: a => posicionales(a).length ? tr('Leer el final de {archivo}', { archivo: nombreArchivo(posicionales(a)[0]) }) : null,
  grep: () => tr('Buscar un texto dentro de tus archivos'),
  rg: () => tr('Buscar un texto dentro de tus archivos'),
  find: () => tr('Buscar archivos por nombre'),
  pwd: () => tr('Ver en qué carpeta está trabajando'),
  mkdir: a => tr('Crear la carpeta {carpeta}', { carpeta: posicionales(a).join(', ') }),
  touch: a => tr('Crear el archivo vacío {archivo}', { archivo: posicionales(a).map(nombreArchivo).join(', ') }),
  cp: a => tr('Copiar {origen} a {destino}', { origen: nombreArchivo(posicionales(a)[0]), destino: posicionales(a)[1] ?? tr('otro lugar') }),
  mv: a => tr('Mover o renombrar {archivo}', { archivo: nombreArchivo(posicionales(a)[0]) }),
  rm: a => tr('Borrar {archivos} (no van a la papelera)', { archivos: cuantos(posicionales(a)) }),
  curl: () => tr('Consultar una dirección de internet'),
  wget: () => tr('Descargar algo de internet'),
  brew: a => a[0] === 'install' ? tr('Instalar el programa {programa} en tu computadora (usa internet)', { programa: posicionales(a.slice(1)).join(', ') }) : tr('Usar Homebrew, el instalador de programas de tu Mac'),
  apt: a => a[0] === 'install' ? tr('Instalar el programa {programa} en tu computadora (usa internet)', { programa: posicionales(a.slice(1)).join(', ') }) : tr('Usar el instalador de programas del sistema'),
  'apt-get': a => PROGRAMAS.apt(a),
  pip: a => a[0] === 'install' ? tr('Instalar {paquete} para Python (usa internet)', { paquete: posicionales(a.slice(1)).join(', ') }) : tr('Usar el instalador de Python'),
  pip3: a => PROGRAMAS.pip(a),
  python: a => posicionales(a)[0] ? tr('Correr el programa {programa}', { programa: nombreArchivo(posicionales(a)[0]) }) : tr('Correr código de Python'),
  python3: a => PROGRAMAS.python(a),
  node: a => posicionales(a)[0] ? tr('Correr el programa {programa}', { programa: nombreArchivo(posicionales(a)[0]) }) : tr('Correr código de JavaScript'),
  open: a => tr('Abrir {que} en otra app de tu computadora', { que: nombreArchivo(posicionales(a)[0]) || tr('algo') }),
  zip: () => tr('Comprimir archivos en un .zip'),
  unzip: () => tr('Descomprimir un .zip'),
  echo: () => tr('Escribir un texto'),
  date: () => tr('Ver la fecha y la hora'),
  which: () => tr('Ver si un programa está instalado'),
  gh: a => a[0] === 'auth' ? tr('Iniciar sesión en GitHub') : a[0] === 'pr' ? tr('Trabajar con una propuesta de cambios en GitHub') : tr('Usar GitHub desde la terminal (usa internet)'),
}

const LOGIN = /\blogin\b/

/** Frase para un comando de Bash. */
export function fraseComando(cmd: string): string {
  const texto = cmd.trim()
  if (!texto) return tr('Correr un comando vacío')
  const a = analizarShell(texto, '')
  if (!a.ok) return tr('Correr un comando que Arbrain no puede leer por completo: revisa el texto exacto antes de decidir')
  const frases = a.comandos.map(c => fraseSimple(c.argv.map(w => w.texto))).filter(Boolean) as string[]
  if (!frases.length) return tr('Correr un comando que no reconozco: revisa el texto exacto antes de decidir')
  if (frases.length === 1) return frases[0]
  const [primera, ...resto] = frases
  return resto.length === 1 ? tr('{primera}, y luego {siguiente}', { primera, siguiente: resto[0].charAt(0).toLowerCase() + resto[0].slice(1) }) : tr('{primera}, y luego {n} pasos más', { primera, n: resto.length })
}

function fraseSimple(argv: string[]): string | null {
  if (!argv.length) return null
  let [programa, ...args] = argv
  programa = programa.replace(/^.*[\\/]/, '')
  if (programa === 'sudo') {
    const interior = fraseSimple(args)
    return tr('Con tu contraseña de administrador: {accion}', { accion: interior ? interior.charAt(0).toLowerCase() + interior.slice(1) : tr('cambiar algo del sistema') })
  }
  if (LOGIN.test(argv.join(' ')) && programa !== 'git') return tr('Iniciar sesión en {servicio} (abre el navegador o pide tu contraseña)', { servicio: programa === 'gh' ? 'GitHub' : programa })
  if (programa === 'git') {
    const sub = args.find(x => !x.startsWith('-'))
    return sub && GIT[sub] ? tr(GIT[sub]) : tr('Usar git, el historial de cambios de tu proyecto')
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(programa)) {
    const sub = args[0]
    if (!sub) return programa === 'yarn' ? PAQUETES.install([]) : null
    const t = PAQUETES[sub]
    return t ? t(args.slice(1)) : tr('Usar {programa}, el administrador de piezas de tu proyecto', { programa })
  }
  if (programa === 'npx') return tr('Descargar (si hace falta) y correr la herramienta {herramienta} (usa internet)', { herramienta: args.find(x => !x.startsWith('-')) ?? '' }).replace(/\s+\(/, ' (')
  const t = PROGRAMAS[programa]
  return t ? t(args) : null
}

/** Frase para cualquier confirmación (comando, archivo, herramienta conectada). */
export function fraseHumana(herramienta: string | undefined, literal: string | undefined, resumen: string): string {
  if (herramienta === 'Bash' && literal) return fraseComando(literal)
  if (herramienta === 'Write') return tr('Escribir un archivo en tu computadora')
  if (herramienta === 'Edit' || herramienta === 'MultiEdit') return tr('Cambiar el contenido de un archivo')
  if (herramienta === 'WebFetch') return tr('Abrir una página de internet para leerla')
  return resumen
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

const FAMILIAS_FRASE = new Set(['Bash', 'PowerShell', 'MCP', 'Escribir', 'WebFetch'])
const familiaFrase = (h: string | undefined): FamiliaRegla => FAMILIAS_FRASE.has(h ?? '') ? h as FamiliaRegla : familiaDe(h) ?? 'Bash'

const CARPETAS_MEMORIA: Record<string, string> = {
  memory: trMarca('Permitir siempre guardar en tu memoria'),
  knowledge: trMarca('Permitir siempre guardar en tu conocimiento'),
  daily: trMarca('Permitir siempre escribir en tu diario'),
  diario: trMarca('Permitir siempre escribir en tu diario'),
  plan: trMarca('Permitir siempre cambiar tu plan'),
}

/**
 * «Siempre este patrón» dicho para la persona (ronda 2: «Siempre `npm test *`» era jerga). El patrón literal se sigue
 * viendo en la tarjeta (en un detalle) y en Ajustes; el botón dice la frase. Las reglas valen en todas tus carpetas.
 * `herramienta`: la de la tarjeta (`Write`, `mcp__x__y`) o la familia de la regla (`Escribir`); sin ella, un comando.
 */
export function frasePatron(patron: string, herramienta?: string): string {
  const familia = familiaFrase(herramienta)
  if (familia === 'Escribir') {
    const m = /^\.claude\/(memory|knowledge|daily|diario|plan)\/\*\*$/.exec(patron)
    if (m) return tr(CARPETAS_MEMORIA[m[1]])
    const s = /^\.claude\/skills\/([^/]+)\/\*\*$/.exec(patron)
    if (s) return tr('Permitir siempre cambiar la habilidad «{habilidad}»', { habilidad: s[1] })
    const carpeta = patron.replace(/\/\*\*$/, '').split('/').filter(Boolean).pop() ?? patron
    return tr('Permitir siempre escribir en la carpeta «{carpeta}»', { carpeta })
  }
  if (familia === 'WebFetch') return tr('Permitir siempre leer páginas de {dominio}', { dominio: patron })
  if (familia === 'MCP') {
    const [, servidor = '', ...accion] = patron.split('__')
    return tr('Permitir siempre «{accion}» de {servidor}', { accion: accion.join('__').replace(/[_-]+/g, ' '), servidor })
  }
  const p = patron.trim().split(/[ \t]+/)
  const comodin = p[p.length - 1] === '*'
  if (!comodin) return tr('Permitir siempre este mismo comando')
  const [programa, sub] = p
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(programa)) {
    if (sub === 'test') return tr('Permitir siempre las pruebas de tus proyectos')
    if (sub === 'run') return tr('Permitir siempre las tareas de tus proyectos')
    if (['install', 'i', 'add', 'ci'].includes(sub)) return tr('Permitir siempre instalar piezas en tus proyectos')
  }
  const f = fraseSimple([programa, sub])
  return f ? tr('Permitir siempre: {accion}', { accion: minuscula(f.replace(/ \(usa internet\)$/, '').replace(/ \(uses the internet\)$/, '')) }) : tr('Permitir siempre «{comando}»', { comando: `${programa} ${sub}` })
}

/**
 * Lo que la tarjeta dice junto a «Permitir siempre» cuando la regla vale también tras leer afuera (la de tu memoria,
 * `valeTrasAfuera`): que la persona sepa lo que elige. null si no hace falta decir nada.
 */
export function avisoPatron(patron: string, herramienta?: string): string | null {
  const familia = familiaFrase(herramienta)
  return valeTrasAfuera({ herramienta: familia, patron })
    ? tr('Esta regla vale también cuando Levy acaba de leer algo de afuera (una página, un correo, WhatsApp): lo que guarde en tu memoria vuelve en cada conversación. Elígela solo si confías en lo que está guardando; la quitas en Ajustes › Permisos y seguridad.')
    : null
}

const SI_FRENO: Record<string, string> = { enviar: trMarca('Sí, enviarlo'), publicar: trMarca('Sí, publicarlo'), pagar: trMarca('Sí, pagar'), borrar: trMarca('Sí, borrar') }

/**
 * En una acción del freno el botón del sí dice la consecuencia («Borrar 14 archivos»), no «Una vez» (ronda 2, crítico
 * ciego: el ámbar sobre un borrado contradecía la regla de color). Pura.
 */
export function botonConsecuencia(categoria: string, herramienta: string | undefined, literal: string | undefined): string {
  // A8 (0.2.15): abrir una página dice «Abrir web.whatsapp.com», no «Sí, enviarlo» (lo que vio un fundador en la tarjeta de navegar).
  if (/navegar|WebFetch|web_abrir|web_navegar/.test(herramienta ?? '') && literal) {
    const host = /https?:\/\/([^/\s"'\]\\]+)/.exec(literal)?.[1]
    if (host) return tr('Abrir {sitio}', { sitio: host.toLowerCase().replace(/^www\./, '') })
  }
  if (categoria === 'borrar' && herramienta === 'Bash' && literal) {
    const a = analizarShell(literal.trim(), '')
    if (a.ok) {
      const archivos = a.comandos.flatMap(c => {
        const argv = c.argv.map(w => w.texto)
        const prog = (argv[0] ?? '').replace(/^.*[\\/]/, '')
        return prog === 'rm' || prog === 'unlink' || prog === 'trash' ? posicionales(argv.slice(1)) : []
      })
      if (archivos.length === 1) return tr('Borrar {archivo}', { archivo: nombreArchivo(archivos[0]) })
      if (archivos.length > 1) return tr('Borrar {n} archivos', { n: archivos.length })
    }
  }
  return SI_FRENO[categoria] ? tr(SI_FRENO[categoria]) : tr('Sí, hacerlo')
}
