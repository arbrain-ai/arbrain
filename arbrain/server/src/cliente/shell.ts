/**
 * Tokenizador de shell POSIX, conservador (red team C1, 11 oct 2026). Pura, sin dependencias.
 *
 * No intenta entender todo bash: entiende un subconjunto pequeño y dice «no lo entiendo» para el resto. La política de
 * agentes (`politica-agentes.ts`) solo deja correr sin preguntar comandos que este analizador entiende POR COMPLETO;
 * cualquier cosa que no entienda pasa a la confirmación humana con el comando literal. Así una variante nueva de bash
 * nunca se vuelve un permiso: se vuelve una pregunta a la persona.
 *
 * Entiende: palabras con comillas simples, comillas dobles sin `$`/`` ` ``, escapes con `\`, `~` y `~/…` al inicio,
 * comentarios `#`, operadores `|`, `&&`, `||`, `;` y salto de línea, redirecciones `<`, `>`, `>>`, `N>`, `N>>`, `&>`,
 * `N>&M`. Marca qué palabras llevan comodines sin comillas (`*`, `?`, `[`) para expandirlos contra el disco.
 *
 * No entiende (devuelve `ok: false` con el motivo): `$` fuera de comillas simples (variables, `$(…)`, `$((…))`,
 * `${…}`), `` ` ``, subshells `( )`, llaves `{ }`, `&` de fondo, `<(`/`>(`, here-docs `<<`, `~usuario`, asignaciones
 * `VAR=x cmd`, comillas sin cerrar.
 */

export interface Palabra {
  /** El texto tal como lo recibe el programa (sin comillas ni escapes; `~` ya expandida a `home`). */
  texto: string
  /** Lleva comodines sin comillas: el shell la expande contra el disco. */
  comodin: boolean
}

export interface Redireccion {
  /** `<`, `>`, `>>` (con o sin descriptor) o `>&` (duplicar descriptor). */
  op: '<' | '>' | '>>' | '>&'
  destino: string
}

export interface ComandoSimple {
  argv: Palabra[]
  redirecciones: Redireccion[]
}

export type Analisis = { ok: true; comandos: ComandoSimple[] } | { ok: false; motivo: string }

/** Analiza `cmd`. `home` sirve para expandir `~`. */
export function analizarShell(cmd: string, home: string): Analisis {
  const comandos: ComandoSimple[] = []
  let actual: ComandoSimple = { argv: [], redirecciones: [] }
  let i = 0
  const n = cmd.length
  let redirPendiente: Redireccion['op'] | null = null

  const cerrarComando = (): string | null => {
    if (redirPendiente) return 'redirección sin destino'
    if (actual.argv.length || actual.redirecciones.length) comandos.push(actual)
    actual = { argv: [], redirecciones: [] }
    return null
  }

  while (i < n) {
    const c = cmd[i]
    // Espacios
    if (c === ' ' || c === '\t') { i++; continue }
    // Separadores de comando
    if (c === '\n' || c === ';') { const e = cerrarComando(); if (e) return { ok: false, motivo: e }; i++; continue }
    if (c === '|') {
      if (cmd[i + 1] === '&') return { ok: false, motivo: 'tubería |& no soportada' }
      const e = cerrarComando(); if (e) return { ok: false, motivo: e }
      i += cmd[i + 1] === '|' ? 2 : 1
      continue
    }
    if (c === '&') {
      if (cmd[i + 1] === '&') { const e = cerrarComando(); if (e) return { ok: false, motivo: e }; i += 2; continue }
      if (cmd[i + 1] === '>') { // &> archivo  (stdout y stderr)
        i += 2
        const op = cmd[i] === '>' ? (i++, '>>' as const) : '>' as const
        redirPendiente = op
        continue
      }
      return { ok: false, motivo: 'ejecución en segundo plano (&)' }
    }
    if (c === '(' || c === ')') return { ok: false, motivo: 'subshell o agrupación ( )' }
    if (c === '`') return { ok: false, motivo: 'sustitución de comando con ``' }
    // Redirecciones (con descriptor opcional delante: 2>, 1>>, 2>&1)
    const mRedir = /^(\d*)(>>|>&|>|<<|<&|<>|<)/.exec(cmd.slice(i))
    if (mRedir && (mRedir[1] === '' || /\d/.test(c))) {
      const op = mRedir[2]
      if (op === '<<' || op === '<&' || op === '<>') return { ok: false, motivo: `redirección ${op} no soportada` }
      if (redirPendiente) return { ok: false, motivo: 'redirección sin destino' }
      if ((op === '>' || op === '<') && cmd[i + mRedir[0].length] === '(') return { ok: false, motivo: 'sustitución de proceso <( )' }
      i += mRedir[0].length
      if (op === '>&') {
        const m = /^\s*(\d+|-)(?=$|[\s;|&])/.exec(cmd.slice(i))
        if (!m) return { ok: false, motivo: 'redirección >& no soportada' }
        actual.redirecciones.push({ op: '>&', destino: m[1] })
        i += m[0].length
        continue
      }
      redirPendiente = op as Redireccion['op']
      continue
    }
    // Comentario: # al inicio de una palabra
    if (c === '#') { while (i < n && cmd[i] !== '\n') i++; continue }

    // Palabra
    let texto = ''
    let comodin = false
    const inicio = i
    while (i < n) {
      const d = cmd[i]
      if (d === ' ' || d === '\t' || d === '\n' || d === ';' || d === '|' || d === '&' || d === '<' || d === '>' || d === '(' || d === ')') break
      if (d === '`') return { ok: false, motivo: 'sustitución de comando con ``' }
      if (d === '$') return { ok: false, motivo: 'variables o sustituciones con $' }
      if (d === '{' || d === '}') return { ok: false, motivo: 'llaves { } (expansión o grupo)' }
      if (d === '\\') {
        if (i + 1 >= n) return { ok: false, motivo: 'escape al final' }
        if (cmd[i + 1] === '\n') { i += 2; continue } // continuación de línea
        texto += cmd[i + 1]; i += 2; continue
      }
      if (d === "'") {
        const fin = cmd.indexOf("'", i + 1)
        if (fin < 0) return { ok: false, motivo: 'comilla simple sin cerrar' }
        texto += cmd.slice(i + 1, fin); i = fin + 1; continue
      }
      if (d === '"') {
        let j = i + 1
        let dentro = ''
        for (; j < n && cmd[j] !== '"'; j++) {
          const e = cmd[j]
          if (e === '$' || e === '`') return { ok: false, motivo: 'variables o sustituciones dentro de comillas dobles' }
          if (e === '\\' && j + 1 < n && /["\\$`\n]/.test(cmd[j + 1])) { if (cmd[j + 1] !== '\n') dentro += cmd[j + 1]; j++; continue }
          if (e === '!') return { ok: false, motivo: 'expansión de historial (!) dentro de comillas dobles' }
          dentro += e
        }
        if (j >= n) return { ok: false, motivo: 'comilla doble sin cerrar' }
        texto += dentro; i = j + 1; continue
      }
      if (d === '*' || d === '?' || d === '[') comodin = true
      if (d === '~' && i === inicio) {
        // ~ solo o ~/… al inicio de la palabra; ~usuario, ~+ y ~- no.
        const sig = cmd[i + 1]
        if (sig === undefined || sig === '/' || sig === ' ' || sig === '\t' || sig === '\n' || sig === ';' || sig === '|' || sig === '&' || sig === '<' || sig === '>') { texto += home; i++; continue }
        return { ok: false, motivo: '~usuario o ~+/~- no soportado' }
      }
      texto += d; i++
    }
    if (redirPendiente) {
      if (comodin) return { ok: false, motivo: 'comodín en el destino de una redirección' }
      actual.redirecciones.push({ op: redirPendiente, destino: texto })
      redirPendiente = null
      continue
    }
    // Asignación al inicio del comando (VAR=x cmd): cambia el entorno del programa.
    if (actual.argv.length === 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd.slice(inicio, i))) return { ok: false, motivo: 'asignación de variable de entorno antes del comando' }
    actual.argv.push({ texto, comodin })
  }
  const e = cerrarComando(); if (e) return { ok: false, motivo: e }
  // Un operador al final (`ls |`) deja un comando vacío: lo tratamos como no entendido.
  if (/(\|\||&&|\|)\s*$/.test(cmd.trim())) return { ok: false, motivo: 'operador al final del comando' }
  return { ok: true, comandos }
}
