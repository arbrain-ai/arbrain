/**
 * Los principios de Atomic Habits de la fila «Hábitos de hoy» (22 oct 2026): la identidad en una línea («Soy alguien que…») y,
 * por hábito, la señal (hora sugerida) y la versión de 2 minutos. `sistema_habitos` no tiene dónde guardarlos, así que viven en
 * un documento aparte: `app_config` (clave `habitos_atomicos:<dueño>`) en la instalación original y
 * `.claude/plan/habitos-atomicos.json` en la edición cliente. Lo que no se ha editado sale de la propuesta de la instalación.
 */
/** El nombre neutro de un hábito privado sin alias propio. `posicion` empieza en 1. */
export const aliasPorDefecto = (posicion: number) => `🔒 Hábito ${posicion}`
/** El nombre que se pinta: el real, o el alias si el hábito es privado y no se está revelando. */
export function nombrePublico(nombre: string, p: PrincipioHabito | undefined, posicion: number, revelado = false): string {
  if (!p?.privado || revelado) return nombre
  return p.alias?.trim() || aliasPorDefecto(posicion)
}
export interface PrincipioHabito {
  senal: string; dosMinutos: string
  /** Privado (22 oct 2026, Daniel comparte pantalla con la cohorte): se muestra con `alias` y su nombre real solo con un toque o
   *  al pasar el cursor; en modo presentación no se muestra. `alias` vacío = «🔒 Hábito N» (N = su lugar en la fila). */
  privado?: boolean; alias?: string
}
export interface Atomicos { identidad: string; habitos: Record<string, PrincipioHabito>; actualizado: string | null }

export const LIMITE_TEXTO = 140
export const claveAtomicos = (owner: string) => `habitos_atomicos:${owner}`

const texto = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, LIMITE_TEXTO) : null

/** Lo guardado encima de la propuesta: un campo guardado (aunque sea vacío) manda sobre el sugerido. */
export function conPropuesta(guardado: Partial<Atomicos> | null, propuesta?: { identidad: string; habitos: Readonly<Record<string, PrincipioHabito>> }): Atomicos {
  const habitos: Record<string, PrincipioHabito> = {}
  for (const [k, v] of Object.entries(propuesta?.habitos ?? {})) habitos[k] = { ...v }
  for (const [k, v] of Object.entries(guardado?.habitos ?? {})) {
    const base = habitos[k]
    habitos[k] = { senal: v?.senal ?? base?.senal ?? '', dosMinutos: v?.dosMinutos ?? base?.dosMinutos ?? '' }
    const privado = v?.privado ?? base?.privado, alias = v?.alias ?? base?.alias
    if (privado !== undefined) habitos[k].privado = privado
    if (alias !== undefined) habitos[k].alias = alias
  }
  return { identidad: guardado?.identidad ?? propuesta?.identidad ?? '', habitos, actualizado: guardado?.actualizado ?? null }
}

/** Valida un cambio que llega del cliente: `{identidad?}` o `{clave, senal?, dosMinutos?}`. Devuelve el documento nuevo o un error. */
export function aplicarCambio(actual: Atomicos, body: Record<string, unknown>, ahora = new Date().toISOString()): Atomicos | string {
  const siguiente: Atomicos = { identidad: actual.identidad, habitos: { ...actual.habitos }, actualizado: ahora }
  let algo = false
  if ('identidad' in body) {
    const t = texto(body.identidad)
    if (t === null) return 'La identidad debe ser texto.'
    siguiente.identidad = t; algo = true
  }
  if ('clave' in body) {
    const clave = body.clave
    if (typeof clave !== 'string' || !/^[a-z0-9_]{1,60}$/.test(clave)) return 'Hábito inválido.'
    const previo = siguiente.habitos[clave] ?? { senal: '', dosMinutos: '' }, nuevo = { ...previo }
    for (const campo of ['senal', 'dosMinutos'] as const) if (campo in body) {
      const t = texto(body[campo])
      if (t === null) return 'La señal y la versión de 2 minutos deben ser texto.'
      nuevo[campo] = t; algo = true
    }
    if ('alias' in body) {
      const t = texto(body.alias)
      if (t === null) return 'El nombre visible debe ser texto.'
      nuevo.alias = t; algo = true
    }
    if ('privado' in body) {
      if (typeof body.privado !== 'boolean') return 'Privado debe ser sí o no.'
      nuevo.privado = body.privado; algo = true
    }
    siguiente.habitos[clave] = nuevo
  }
  return algo ? siguiente : 'Nada que guardar.'
}
