/**
 * Encargos de las manos en vivo, en el chat (5 nov 2026). Daniel, viendo a las manos tardar minutos en subir un banner a
 * YouTube sin saber cuánto llevaban: «te tardas algo mas de lo que me gustaria incluso si pudieras poner un temporizador».
 *
 * El servidor de manos (`server/src/manos/encargar.ts › guardarEstado`) reescribe entero `<encargos>/<id>.json` en cada
 * avance. Aquí vive la parte pura (sin disco ni red; la usan la ruta `/api/manos/encargos`, el chat y las pruebas):
 * qué campos salen del archivo, cuáles se ven, con qué llamada del chat empata cada uno, su reloj y la validación de la
 * orden de la franja («detener» o «control»; la lee `encargar.ts › ordenEnDisco`).
 */
import { reloj } from '@/features/chat/lib/duracion-turno'

/** Forma del id que genera `encargar.ts` (`enc-<base36>-<6 hex>`). Nada fuera de ella llega a una ruta en disco. */
export const ID_ENCARGO = /^enc-[a-z0-9]+-[0-9a-f]{6}$/

export const ORDENES = ['detener', 'control'] as const
export type OrdenEncargo = (typeof ORDENES)[number]

/** Un encargo corre mientras está `en_curso` o `cerrando`; el resto son estados finales. */
const VIVOS = new Set(['en_curso', 'cerrando'])
export const estaVivo = (e: Pick<EncargoVivo, 'estado'>) => VIVOS.has(e.estado)

/** Un terminado se sigue viendo este rato (el archivo suele cerrar antes de que la herramienta vuelva al chat). */
export const TERMINADO_VISIBLE_MS = 15_000
/** Solo se leen los archivos tocados en esta ventana (el tope de un encargo es 600 s). */
export const VENTANA_LECTURA_MS = 10 * 60_000
/** El archivo guarda `pedido.slice(0, 200)` del input de la herramienta. */
export const LARGO_PEDIDO = 200

/** Lo único que sale del archivo hacia la app: sin resultado, capturas, últimos pasos ni quién llamó. */
export interface EncargoVivo {
  id: string
  estado: string
  pedido: string
  /** ISO del arranque (lo agrega el servidor; puede faltar en archivos viejos). */
  inicio: string | null
  /** ISO de la última escritura. */
  actualizado: string | null
  ms: number | null
  /** Frase humana del paso actual; si falta, el mensaje técnico del último avance. */
  paso: string | null
  pasos: number | null
  /** Órdenes que la franja acepta ahora. */
  valores: OrdenEncargo[]
}

const texto = (v: unknown, max = 300): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const numero = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const fecha = (v: unknown): string | null => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null
const msDe = (iso: string | null): number | null => { if (!iso) return null; const n = Date.parse(iso); return Number.isFinite(n) ? n : null }

/** El contenido de `<id>.json`, reducido a los campos de la línea viva. `null` si no tiene forma de encargo. */
export function resumirEncargo(crudo: unknown): EncargoVivo | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  const o = crudo as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : ''
  const estado = texto(o.estado, 40)
  if (!ID_ENCARGO.test(id) || !estado) return null
  const franja = o.franja && typeof o.franja === 'object' ? o.franja as Record<string, unknown> : null
  const valores = Array.isArray(franja?.valores) ? ORDENES.filter(v => (franja!.valores as unknown[]).includes(v)) : []
  return {
    id, estado,
    pedido: typeof o.pedido === 'string' ? o.pedido.slice(0, LARGO_PEDIDO) : '',
    inicio: fecha(o.inicio),
    actualizado: fecha(o.actualizado),
    ms: numero(o.ms),
    paso: texto(o.paso) ?? texto(o.mensaje),
    // Corriendo es un número; el estado final guarda el resumen de pasos (lista).
    pasos: numero(o.pasos) ?? (Array.isArray(o.pasos) ? o.pasos.length : null),
    valores,
  }
}

/** ¿Se pinta? Los vivos siempre; los terminados hace ≤ 15 s (por `actualizado`, o por el mtime si falta). */
export function visible(e: EncargoVivo, ahora: number, mtimeMs?: number): boolean {
  if (estaVivo(e)) return true
  const fin = msDe(e.actualizado) ?? mtimeMs ?? null
  return fin !== null && ahora - fin <= TERMINADO_VISIBLE_MS
}

/** Arranque en ms epoch: `inicio`; si falta, `actualizado − ms`; sin datos, `null`. */
export function inicioEncargo(e: Pick<EncargoVivo, 'inicio' | 'actualizado' | 'ms'>): number | null {
  const inicio = msDe(e.inicio)
  if (inicio !== null) return inicio
  const act = msDe(e.actualizado)
  return act !== null && e.ms !== null ? act - e.ms : null
}

/** Reloj del encargo («0:42», «12:03», «1:02:03»). Terminado: congelado en su última escritura. Sin datos: `null`. */
export function relojEncargo(e: EncargoVivo, ahora: number): string | null {
  const inicio = inicioEncargo(e)
  if (inicio === null) return null
  const fin = estaVivo(e) ? ahora : (msDe(e.actualizado) ?? ahora)
  return reloj(Math.max(0, fin - inicio))
}

const FINALES: Record<string, string> = {
  hecho: 'Terminó', fallo: 'No pudo terminar', requiere_confirmacion: 'Espera tu toque', aclaracion: 'Necesita una aclaración',
}

/** Qué hace ahora: el paso; terminado, cómo acabó. */
export function textoPaso(e: EncargoVivo): string | null {
  if (!estaVivo(e)) return FINALES[e.estado] ?? 'Terminó'
  return e.paso
}

/** El pedido como lo guarda el archivo: sin espacios a los lados y recortado a 200. */
const clavePedido = (p: string) => p.trim().slice(0, LARGO_PEDIDO).trim()

/** Más reciente primero (por arranque; si no, por última escritura). */
export const porReciente = (a: EncargoVivo, b: EncargoVivo) =>
  (inicioEncargo(b) ?? msDe(b.actualizado) ?? 0) - (inicioEncargo(a) ?? msDe(a.actualizado) ?? 0)

/**
 * El encargo de cada llamada en curso del chat: el que guardó el mismo pedido (el más reciente si se repitió); si ninguno
 * empata, el vivo más reciente que no tomó otra llamada. Primero se asignan los que empatan, luego los de descarte. Un
 * terminado solo se muestra si su pedido es el de la llamada.
 */
export function emparejarLlamadas(encargos: EncargoVivo[], pedidos: (string | null | undefined)[]): (EncargoVivo | null)[] {
  const orden = [...encargos].sort(porReciente)
  const usados = new Set<string>()
  const tomar = (e: EncargoVivo | undefined) => { if (!e) return null; usados.add(e.id); return e }
  const r = pedidos.map(p => {
    const clave = p ? clavePedido(p) : ''
    return clave ? tomar(orden.find(e => !usados.has(e.id) && e.pedido.trim() === clave)) : null
  })
  return r.map(e => e ?? tomar(orden.find(x => !usados.has(x.id) && estaVivo(x))))
}

/** El encargo de una sola llamada (ver `emparejarLlamadas`). */
export function emparejarEncargo(encargos: EncargoVivo[], pedido: string | null | undefined): EncargoVivo | null {
  return emparejarLlamadas(encargos, [pedido])[0]
}

/** El `pedido` del input de `encargar` (JSON completo o, mientras llega, a medias). */
export function pedidoDeInput(crudo: string | undefined): string | null {
  if (!crudo) return null
  try {
    const v = JSON.parse(crudo) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return texto((v as Record<string, unknown>).pedido, 4_000)
  } catch { /* parcial */ }
  const m = /"pedido"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(crudo)
  if (!m) return null
  try { return texto(JSON.parse(`"${m[1]}"`), 4_000) } catch { return null }
}

export type OrdenValidada = { ok: true; id: string; orden: OrdenEncargo } | { ok: false; status: number; error: string }

/**
 * El cuerpo del POST `{ id, orden }`: id con la forma de un encargo, orden «detener» o «control», y el encargo existe,
 * sigue corriendo y su franja acepta esa orden. `leer` trae el encargo por id (ya validado).
 */
export function validarOrden(cuerpo: unknown, leer: (id: string) => EncargoVivo | null): OrdenValidada {
  const o = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo as Record<string, unknown> : null
  if (!o) return { ok: false, status: 400, error: 'Falta { id, orden }.' }
  const id = typeof o.id === 'string' ? o.id : ''
  if (!ID_ENCARGO.test(id)) return { ok: false, status: 400, error: 'Encargo inválido.' }
  const orden = (ORDENES as readonly unknown[]).includes(o.orden) ? o.orden as OrdenEncargo : null
  if (!orden) return { ok: false, status: 400, error: 'Orden inválida: detener o control.' }
  const e = leer(id)
  if (!e) return { ok: false, status: 404, error: 'Ese encargo ya no existe.' }
  if (!estaVivo(e)) return { ok: false, status: 409, error: 'Ese encargo ya terminó.' }
  if (e.valores.length && !e.valores.includes(orden)) return { ok: false, status: 409, error: 'Ese encargo no acepta esa orden ahora.' }
  return { ok: true, id, orden }
}
