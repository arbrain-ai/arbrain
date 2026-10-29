/**
 * Qué hará un comando, dicho para alguien de 50 años que no es técnico (botón Play, 27 oct 2026). La tarjeta del hilo
 * pone esta frase arriba y el comando literal abajo: la frase orienta, el literal manda (es lo que de verdad corre).
 *
 * Reglas: nunca promete de más (si no reconoce el comando, lo dice: «un comando que no reconozco»); nombra lo que toca
 * (internet, archivos, borrar) en palabras de todos los días; cero jerga sin traducir. Pura.
 */
import { analizarShell } from './shell.js'

type Traductor = (args: string[]) => string | null

const nombreArchivo = (a: string | undefined) => a ? a.replace(/^.*[\\/]/, '') || a : ''
const posicionales = (args: string[]) => args.filter(a => !a.startsWith('-'))
/** «el archivo x.pdf», «x.pdf y y.pdf» o «14 archivos»: más de tres nombres no se leen, se cuentan. */
const cuantos = (archivos: string[]) => archivos.length === 0 ? 'archivos' : archivos.length > 3 ? `${archivos.length} archivos` : archivos.map(nombreArchivo).join(', ')

const GIT: Record<string, string> = {
  status: 'Ver qué archivos de tu proyecto cambiaron',
  log: 'Ver el historial de cambios de tu proyecto',
  diff: 'Ver exactamente qué cambió en tus archivos',
  show: 'Ver el detalle de un cambio guardado',
  add: 'Marcar archivos para guardarlos en el historial',
  commit: 'Guardar una versión de tu proyecto en su historial',
  push: 'Subir tus cambios a internet (GitHub)',
  pull: 'Bajar de internet los cambios más nuevos de tu proyecto',
  fetch: 'Revisar en internet si hay cambios nuevos (sin aplicarlos)',
  clone: 'Descargar una copia de un proyecto de internet',
  checkout: 'Cambiar de versión o de rama de tu proyecto',
  switch: 'Cambiar de rama de tu proyecto',
  branch: 'Ver o crear ramas (versiones paralelas) de tu proyecto',
  merge: 'Juntar una rama con otra',
  stash: 'Guardar a un lado cambios sin terminar',
}

const PAQUETES: Record<string, (args: string[]) => string> = {
  install: a => posicionales(a).length > 0 ? `Descargar e instalar ${posicionales(a).join(', ')} en tu proyecto (usa internet)` : 'Descargar e instalar las piezas que tu proyecto necesita (usa internet)',
  i: a => PAQUETES.install(a),
  add: a => PAQUETES.install(a),
  ci: () => 'Reinstalar desde cero las piezas de tu proyecto (usa internet)',
  test: () => 'Correr las pruebas de tu proyecto para ver si todo funciona',
  run: a => posicionales(a)[0] ? `Correr la tarea «${posicionales(a)[0]}» de tu proyecto` : 'Ver las tareas que tiene tu proyecto',
  start: () => 'Arrancar tu proyecto',
  build: () => 'Preparar tu proyecto para publicarlo (no publica nada)',
  dev: () => 'Arrancar tu proyecto en modo de prueba',
  publish: () => 'Publicar tu paquete en internet para que otros lo descarguen',
  uninstall: a => `Quitar ${posicionales(a).join(', ') || 'una pieza'} de tu proyecto`,
  remove: a => PAQUETES.uninstall(a),
}

const PROGRAMAS: Record<string, Traductor> = {
  ls: a => `Ver qué archivos hay en ${posicionales(a)[0] ? `la carpeta ${posicionales(a)[0]}` : 'esta carpeta'}`,
  cat: a => posicionales(a).length ? `Leer el archivo ${posicionales(a).map(nombreArchivo).join(', ')}` : null,
  head: a => posicionales(a).length ? `Leer el principio de ${nombreArchivo(posicionales(a)[0])}` : null,
  tail: a => posicionales(a).length ? `Leer el final de ${nombreArchivo(posicionales(a)[0])}` : null,
  grep: () => 'Buscar un texto dentro de tus archivos',
  rg: () => 'Buscar un texto dentro de tus archivos',
  find: () => 'Buscar archivos por nombre',
  pwd: () => 'Ver en qué carpeta está trabajando',
  mkdir: a => `Crear la carpeta ${posicionales(a).join(', ')}`,
  touch: a => `Crear el archivo vacío ${posicionales(a).map(nombreArchivo).join(', ')}`,
  cp: a => `Copiar ${nombreArchivo(posicionales(a)[0])} a ${posicionales(a)[1] ?? 'otro lugar'}`,
  mv: a => `Mover o renombrar ${nombreArchivo(posicionales(a)[0])}`,
  rm: a => `Borrar ${cuantos(posicionales(a))} (no van a la papelera)`,
  curl: () => 'Consultar una dirección de internet',
  wget: () => 'Descargar algo de internet',
  brew: a => a[0] === 'install' ? `Instalar el programa ${posicionales(a.slice(1)).join(', ')} en tu computadora (usa internet)` : 'Usar Homebrew, el instalador de programas de tu Mac',
  apt: a => a[0] === 'install' ? `Instalar el programa ${posicionales(a.slice(1)).join(', ')} en tu computadora (usa internet)` : 'Usar el instalador de programas del sistema',
  'apt-get': a => PROGRAMAS.apt(a),
  pip: a => a[0] === 'install' ? `Instalar ${posicionales(a.slice(1)).join(', ')} para Python (usa internet)` : 'Usar el instalador de Python',
  pip3: a => PROGRAMAS.pip(a),
  python: a => posicionales(a)[0] ? `Correr el programa ${nombreArchivo(posicionales(a)[0])}` : 'Correr código de Python',
  python3: a => PROGRAMAS.python(a),
  node: a => posicionales(a)[0] ? `Correr el programa ${nombreArchivo(posicionales(a)[0])}` : 'Correr código de JavaScript',
  open: a => `Abrir ${nombreArchivo(posicionales(a)[0]) || 'algo'} en otra app de tu computadora`,
  zip: () => 'Comprimir archivos en un .zip',
  unzip: () => 'Descomprimir un .zip',
  echo: () => 'Escribir un texto',
  date: () => 'Ver la fecha y la hora',
  which: () => 'Ver si un programa está instalado',
  gh: a => a[0] === 'auth' ? 'Iniciar sesión en GitHub' : a[0] === 'pr' ? 'Trabajar con una propuesta de cambios en GitHub' : 'Usar GitHub desde la terminal (usa internet)',
}

const LOGIN = /\blogin\b/

/** Frase para un comando de Bash. */
export function fraseComando(cmd: string): string {
  const texto = cmd.trim()
  if (!texto) return 'Correr un comando vacío'
  const a = analizarShell(texto, '')
  if (!a.ok) return 'Correr un comando que Arbrain no puede leer por completo: revisa el texto exacto antes de decidir'
  const frases = a.comandos.map(c => fraseSimple(c.argv.map(w => w.texto))).filter(Boolean) as string[]
  if (!frases.length) return 'Correr un comando que no reconozco: revisa el texto exacto antes de decidir'
  if (frases.length === 1) return frases[0]
  const [primera, ...resto] = frases
  return `${primera}, y luego ${resto.length === 1 ? resto[0].charAt(0).toLowerCase() + resto[0].slice(1) : `${resto.length} pasos más`}`
}

function fraseSimple(argv: string[]): string | null {
  if (!argv.length) return null
  let [programa, ...args] = argv
  programa = programa.replace(/^.*[\\/]/, '')
  if (programa === 'sudo') {
    const interior = fraseSimple(args)
    return `Con tu contraseña de administrador: ${interior ? interior.charAt(0).toLowerCase() + interior.slice(1) : 'cambiar algo del sistema'}`
  }
  if (LOGIN.test(argv.join(' ')) && programa !== 'git') return `Iniciar sesión en ${programa === 'gh' ? 'GitHub' : programa} (abre el navegador o pide tu contraseña)`
  if (programa === 'git') {
    const sub = args.find(x => !x.startsWith('-'))
    return sub && GIT[sub] ? GIT[sub] : 'Usar git, el historial de cambios de tu proyecto'
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(programa)) {
    const sub = args[0]
    if (!sub) return programa === 'yarn' ? PAQUETES.install([]) : null
    const t = PAQUETES[sub]
    return t ? t(args.slice(1)) : `Usar ${programa}, el administrador de piezas de tu proyecto`
  }
  if (programa === 'npx') return `Descargar (si hace falta) y correr la herramienta ${args.find(x => !x.startsWith('-')) ?? ''} (usa internet)`.replace(/\s+\(/, ' (')
  const t = PROGRAMAS[programa]
  return t ? t(args) : null
}

/** Frase para cualquier confirmación (comando, archivo, herramienta conectada). */
export function fraseHumana(herramienta: string | undefined, literal: string | undefined, resumen: string): string {
  if (herramienta === 'Bash' && literal) return fraseComando(literal)
  if (herramienta === 'Write') return 'Escribir un archivo en tu computadora'
  if (herramienta === 'Edit' || herramienta === 'MultiEdit') return 'Cambiar el contenido de un archivo'
  if (herramienta === 'WebFetch') return 'Abrir una página de internet para leerla'
  return resumen
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/**
 * «Siempre este patrón» dicho para la persona (ronda 2: «Siempre `npm test *`» era jerga). El patrón literal se sigue
 * viendo en la tarjeta (en un detalle) y en Ajustes; el botón dice la frase. Las reglas valen en todas tus carpetas.
 */
export function frasePatron(patron: string): string {
  const p = patron.trim().split(/[ \t]+/)
  const comodin = p[p.length - 1] === '*'
  if (!comodin) return 'Permitir siempre este mismo comando'
  const [programa, sub] = p
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(programa)) {
    if (sub === 'test') return 'Permitir siempre las pruebas de tus proyectos'
    if (sub === 'run') return 'Permitir siempre las tareas de tus proyectos'
    if (['install', 'i', 'add', 'ci'].includes(sub)) return 'Permitir siempre instalar piezas en tus proyectos'
  }
  const f = fraseSimple([programa, sub])
  return f ? `Permitir siempre: ${minuscula(f.replace(/ \(usa internet\)$/, ''))}` : `Permitir siempre «${programa} ${sub}»`
}

const SI_FRENO: Record<string, string> = { enviar: 'Sí, enviarlo', publicar: 'Sí, publicarlo', pagar: 'Sí, pagar', borrar: 'Sí, borrar' }

/**
 * En una acción del freno el botón del sí dice la consecuencia («Borrar 14 archivos»), no «Una vez» (ronda 2, crítico
 * ciego: el ámbar sobre un borrado contradecía la regla de color). Pura.
 */
export function botonConsecuencia(categoria: string, herramienta: string | undefined, literal: string | undefined): string {
  // A8 (0.2.15): abrir una página dice «Abrir web.whatsapp.com», no «Sí, enviarlo» (lo que vio un fundador en la tarjeta de navegar).
  if (/navegar|WebFetch|web_abrir|web_navegar/.test(herramienta ?? '') && literal) {
    const host = /https?:\/\/([^/\s"'\]\\]+)/.exec(literal)?.[1]
    if (host) return `Abrir ${host.toLowerCase().replace(/^www\./, '')}`
  }
  if (categoria === 'borrar' && herramienta === 'Bash' && literal) {
    const a = analizarShell(literal.trim(), '')
    if (a.ok) {
      const archivos = a.comandos.flatMap(c => {
        const argv = c.argv.map(w => w.texto)
        const prog = (argv[0] ?? '').replace(/^.*[\\/]/, '')
        return prog === 'rm' || prog === 'unlink' || prog === 'trash' ? posicionales(argv.slice(1)) : []
      })
      if (archivos.length === 1) return `Borrar ${nombreArchivo(archivos[0])}`
      if (archivos.length > 1) return `Borrar ${archivos.length} archivos`
    }
  }
  return SI_FRENO[categoria] ?? 'Sí, hacerlo'
}
