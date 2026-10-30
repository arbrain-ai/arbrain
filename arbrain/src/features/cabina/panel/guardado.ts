/**
 * ¿Esta pestaña está en el archivero? (4 oct 2026, Daniel: «guardar ↔ quitar en sitio»). La verdad es la
 * lista del Studio, no la marca local de la pestaña: así lo que guardó Levy, otra ventana o el «+» se ve igual.
 * Una vista se reconoce por el id con que se reabrió (`guardada-<id>`), por su clave (la misma regla del
 * daemon) o, si era un documento de /tmp que se copió al guardarse, por su ruta de antes.
 */
import type { Entrada } from './archivero'
import { claveDe, type Fijada } from './fijadas'

const PREFIJO = 'guardada-'

export function entradaDe(entradas: Pick<Entrada, 'id' | 'input' | 'rutaOriginal'>[], f: Pick<Fijada, 'id' | 'input'>) {
  const id = f.id.startsWith(PREFIJO) ? f.id.slice(PREFIJO.length) : null
  const clave = claveDe(f.input)
  return (id ? entradas.find(e => e.id === id) : undefined)
    ?? entradas.find(e => claveDe(e.input) === clave || (!!f.input.ruta && e.rutaOriginal === f.input.ruta))
}
