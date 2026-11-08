/**
 * Business Intelligence · las gráficas con que nace el tablero (7 nov 2026): preguntas reales del negocio de Daniel, cada una
 * contra una consulta del catálogo. Siembra de `bi.json` y del banco `/bi-lab`; después manda el archivo.
 */
import { consultaDe, type Tipo, type Ventana } from './catalogo'
import type { Grafica } from './modelo'

const CREADA = '2026-11-07T17:00:00-06:00'
const g = (id: string, pregunta: string, consulta: string, ventana: Ventana, tipo?: Tipo): Grafica => {
  const c = consultaDe(consulta)!
  return { id, pregunta, consulta: { id: consulta, ventana }, tipo: tipo ?? c.tipo, fuente: c.fuente, creada: CREADA, por: 'Levy', estado: 'fijada' }
}

export const INICIALES: Grafica[] = [
  g('cuanto-entro-este-mes', '¿Cuánto dinero entró este mes y voy mejor que el pasado?', 'cobrado', 30),
  g('que-video-trajo-mas-pagos', '¿Qué video trajo más pagos en los últimos 30 días?', 'ventas-por-video', 30),
  g('cuanta-gente-llega', '¿Cuánta gente llega a la página de venta cada día?', 'visitas', 30),
  g('donde-se-cae-la-gente', '¿Dónde se cae la gente antes de pagar?', 'embudo-web', 30),
  g('cuantos-se-suscriben', '¿Cuántas suscripciones nuevas entran cada día?', 'altas', 30),
  g('cuantos-se-van', '¿Cuántos se dan de baja cada día?', 'bajas', 30),
  g('esta-viva-la-comunidad', '¿Está viva la comunidad?', 'comunidad', 30),
  g('telefono-o-computadora', '¿Me ven más en el teléfono o en la computadora?', 'dispositivo', 30),
]
