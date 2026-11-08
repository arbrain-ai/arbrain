/**
 * Cambiar de vía en vez de repetir (5 nov 2026, canal «Levy Arbrain»). En la bitácora 20261106013100-08e8 el cerebro
 * mandó ⌘⇧G, la ruta y Return al panel «Abrir» de macOS siete veces entre dos intentos de Sonnet y uno de Opus, con el
 * mismo resultado cada vez, hasta error_max_turns; en la 20261106004517-94fb Opus leyó cuatro veces el mismo panel sin
 * que cambiara nada y se quedó sin turnos. La regla de insistencia ya pedía cambiar de camino; esto la cumple en código:
 *
 *   - Un paso (misma herramienta y mismos argumentos) que termina dos veces con el mismo resultado y ese resultado no
 *     prueba avance (falló, lo frenaron o quedó sin verificar) recibe el aviso «cambia de vía»; la tercera vez no se
 *     corre y el modelo recibe un error con nombre.
 *   - Una lectura idéntica a la anterior avisa «nada cambió», pero leer nunca se niega.
 *   - Lo confirmado y lo que cambia (un scroll que trae más) nunca cuenta.
 *
 * Vive por pedido (no por intento): el reintento de Sonnet y el escalado a Opus heredan lo que ya no sirvió.
 */

const LECTURAS = new Set(['observar', 'web_observar', 'ventanas', 'apps', 'verificar', 'web_verificar', 'leer_ajuste', 'listar_recetas', 'web_pestanas'])

/** El resultado sin lo que cambia en cada corrida aunque nada haya cambiado (tiempos, sellos). */
export function normalizarResultado(texto: string): string {
  return texto
    .replace(/"(ms|t|asentar_ms|ms_ax|espera_ms)"\s*:\s*\d+(\.\d+)?/g, '"$1":N')
    .replace(/\d+(\.\d+)?\s*ms\b/g, 'N ms')
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'T')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Los argumentos en orden estable (el modelo puede mandar las claves en otro orden). */
function firma(nombre: string, args: unknown): string {
  const orden = (v: any): any => Array.isArray(v) ? v.map(orden) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => k !== 'pedido').sort().map(k => [k, orden(v[k])])) : v
  return `${nombre}|${JSON.stringify(orden(args ?? {}))}`
}

/** ¿El resultado prueba que algo avanzó? Lo confirmado sí; lo fallido, frenado o sin verificar, no. */
const sinAvance = (texto: string, error: boolean) =>
  error || /"ok"\s*:\s*false|"efecto"\s*:\s*"(fallo|bloqueado|sin_verificar)"|bloqueado|falló|LA PÁGINA NO SE MOVIÓ|CAMBIOS \(0 líneas/.test(texto)

export class Repeticiones {
  private readonly ultimo = new Map<string, { res: string; veces: number; sinAvance: boolean }>()

  /** Antes de correr un paso: la tercera repetición de algo que ya falló dos veces igual no se corre. */
  antes(nombre: string, args: unknown): { correr: true } | { correr: false; texto: string } {
    if (LECTURAS.has(nombre)) return { correr: true }
    const u = this.ultimo.get(firma(nombre, args))
    if (u && u.veces >= 2 && u.sinAvance) {
      return { correr: false, texto: `NO SE CORRIÓ: ya hiciste exactamente esto ${u.veces} veces y terminó igual (${u.res.slice(0, 140)}). Repetirlo no va a cambiar nada: cambia de vía (otro elemento u otro índice, texto_visible, la URL directa, otra herramienta; para subir un archivo, web_actuar con accion «archivo») o llama terminar con lo que probaste y lo que leíste.` }
    }
    return { correr: true }
  }

  /** Después de correr: anota el resultado y devuelve el aviso que se suma a la respuesta del modelo (o ''). */
  despues(nombre: string, args: unknown, texto: string, error: boolean): string {
    const k = firma(nombre, args)
    const res = normalizarResultado(texto)
    const u = this.ultimo.get(k)
    const veces = u && u.res === res ? u.veces + 1 : 1
    const lectura = LECTURAS.has(nombre)
    const nada = lectura || sinAvance(texto, error)
    this.ultimo.set(k, { res, veces, sinAvance: nada })
    if (veces < 2 || !nada) return ''
    if (lectura) return `\n(AVISO: la misma lectura que la anterior: nada cambió. No vuelvas a leer igual; actúa distinto o cambia de vía.)`
    return `\n(AVISO: es la ${veces}.ª vez que haces exactamente esto con el mismo resultado: no avanza. No lo repitas: cambia de vía. Una vez más igual y no se corre.)`
  }
}

/** Cuando quedan pocos turnos: que el modelo cierre con `terminar` y diga qué probó, en vez de morir en error_max_turns sin nada. */
export function avisoTurnos(usados: number, maximo: number): string {
  const quedan = maximo - usados
  if (!Number.isFinite(maximo) || quedan > 5) return ''
  return `\n(QUEDAN ${Math.max(0, quedan)} TURNOS de ${maximo}: si el objetivo no está a uno o dos pasos, llama terminar YA con estado fallo o aclaracion, qué caminos probaste y qué leíste. Sin terminar se pierde todo lo que hiciste.)`
}
