/**
 * Recetas aprendidas solas tras el 2.º uso (nodo C, noche del 2 oct).
 *
 * Cada pedido que un modelo resolvió y verificó en UNA app nativa deja una huella: la plantilla del pedido (las
 * citas «…» pasan a {{p1}}, {{p2}}…) y la forma de sus pasos (acción, rol y etiqueta de cada elemento). Cuando la
 * misma plantilla vuelve a resolverse con la misma forma, la tarea ya no es nueva: se graba como receta y la
 * tercera vez corre sin modelo (atajos.ts la encuentra por su disparador).
 *
 * Solo se aprende lo verificable sin el modelo: el último paso escribe (el verificador lee el valor de vuelta) o
 * el modelo dejó expectativas de pantalla en `terminar`. Nada sensible: si algún paso envía, borra, paga o
 * publica, no se aprende (lo decide `esSensible`, igual que al grabar a mano).
 *
 * Huellas en `<recetas>/aprendiendo/<clave>.json`: locales, sin texto de las apps (solo rol y etiqueta de
 * controles, como una receta).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AlmacenRecetas, esSensible, grabarReceta, type Grabadora, type Verificador } from '../recetas.js'
import { citas } from './atajos.js'

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Plantilla del pedido: las citas pasan a {{p1}}…; el resto normalizado. */
export function plantilla(pedido: string): { texto: string; parametros: Record<string, string> } {
  const cs = citas(pedido)
  let texto = pedido
  const parametros: Record<string, string> = {}
  cs.forEach((c, i) => { parametros[`p${i + 1}`] = c; texto = texto.replace(c, `{{p${i + 1}}}`) })
  return { texto: norm(texto), parametros }
}

export interface Huella { clave: string; plantilla: string; app: string; firma: string; veces: number; ultima: string }

export type Aprendizaje =
  | { estado: 'nada'; motivo: string }
  | { estado: 'huella'; veces: number }
  | { estado: 'receta'; nombre: string; ruta: string }

/**
 * Llamar tras un pedido verificado. `desde` = largo del historial de la Grabadora al empezar el pedido.
 * `espera` = expectativas de pantalla que dejó el modelo en terminar (opcional).
 */
export async function aprender(g: Grabadora, almacen: AlmacenRecetas, pedido: string, desde: number, espera?: Verificador[]): Promise<Aprendizaje> {
  const acciones = g.historial.slice(desde)
  if (!acciones.length) return { estado: 'nada', motivo: 'sin acciones nativas' }
  if (acciones.some(a => a.pid !== acciones[0].pid)) return { estado: 'nada', motivo: 'más de una app' }
  if (acciones.some(a => a.pedido.ref && !a.elemento)) return { estado: 'nada', motivo: 'un paso sin descriptor' }
  if (acciones.some(a => esSensible({ elemento: a.elemento, accion: a.pedido.accion, tecla: a.pedido.tecla, modificadores: a.pedido.modificadores, texto: a.pedido.texto }))) return { estado: 'nada', motivo: 'un paso es sensible' }
  const { texto, parametros } = plantilla(pedido)
  // Cada parámetro tiene que usarse en algún paso. Si el contacto «Ana» no aparece en ningún paso, el chat ya
  // estaba abierto: la receta escribiría en el chat equivocado con otro contacto. Eso no se aprende.
  const usados = (v: string) => acciones.some(a => [a.pedido.texto, a.pedido.valor, a.elemento?.etiqueta].some(x => x != null && norm(String(x)).includes(norm(v))))
  const sinUso = Object.entries(parametros).filter(([, v]) => !usados(v)).map(([k]) => k)
  if (sinUso.length) return { estado: 'nada', motivo: `parámetros sin paso que los use (${sinUso.join(', ')}): la tarea dependía de un estado previo` }
  // Verificador: el que dejó el modelo, o leer de vuelta lo último que se escribió.
  const ult = acciones[acciones.length - 1]
  const escrito = ult.pedido.accion === 'escribir' ? ult.pedido.texto : ult.pedido.accion === 'valor' ? ult.pedido.valor : undefined
  // Lo leído de vuelta manda; las expectativas del modelo solo si no hubo escritura (y sin su rol traducido: «campo»).
  const delModelo = espera?.map(v => v.tipo === 'pantalla' ? { ...v, espera: v.espera.map(x => (x.rol && !x.rol.startsWith('AX') ? (({ rol: _r, ...resto }) => resto)(x) : x)) } : v)
  const verificador: Verificador[] | null = escrito && ult.elemento ? [{ tipo: 'pantalla', espera: [{ rol: ult.elemento.rol, valor_contiene: escrito }] }]
    : delModelo?.length ? delModelo
    : null
  if (!verificador) return { estado: 'nada', motivo: 'sin verificador posible' }
  const firma = acciones.map(a => `${a.pedido.accion}:${a.elemento?.rol ?? ''}:${a.elemento?.etiqueta ?? a.pedido.tecla ?? ''}`).join('|')
  // La firma se compara con los parámetros sustituidos (un contacto distinto no cambia la forma).
  let firmaPlantilla = firma
  for (const [k, v] of Object.entries(parametros)) if (v.length >= 3) firmaPlantilla = firmaPlantilla.split(v).join(`{{${k}}}`)
  const clave = createHash('sha1').update(texto).digest('hex').slice(0, 12)
  const dir = join(almacen.dir, 'aprendiendo')
  mkdirSync(dir, { recursive: true })
  const ruta = join(dir, `${clave}.json`)
  const previa: Huella | null = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null
  const app = (await g.apps()).find(a => a.pid === acciones[0].pid)?.bundle ?? String(acciones[0].pid)
  const veces = previa && previa.firma === firmaPlantilla && previa.app === app ? previa.veces + 1 : 1
  writeFileSync(ruta, JSON.stringify({ clave, plantilla: texto, app, firma: firmaPlantilla, veces, ultima: new Date().toISOString() } satisfies Huella, null, 2) + '\n')
  if (veces < 2) return { estado: 'huella', veces }
  const nombre = `auto-${clave}`
  const { ruta: rutaReceta, receta } = await grabarReceta(g, almacen, {
    nombre, reemplazar: true, ultimas: acciones.length,
    descripcion: texto, parametros, verificador,
  })
  ;(receta as any).disparadores = [texto.replace(/\{\{p\d+\}\}/g, ' ')]
  ;(receta as any).aprendida = { de: clave, veces }
  almacen.guardar(receta)
  return { estado: 'receta', nombre, ruta: rutaReceta }
}
