/** Datos y titular de la vista Servidores (4 oct 2026), sin React: lo prueba tests/cabina/servidores.test.ts. */
export type Semaforo = 'ok' | 'lento' | 'caido' | 'sin-dato'
export type Grupo = 'miembros' | 'cerebro' | 'maquinas'
export interface FilaServidor { id: string; grupo: Grupo; nombre: string; que: string; abrir?: string; endpoint?: string | null; estado: Semaforo; frase: string | null; dato: string | null; revisado: string; racha: number; desde: string | null; detalle: Record<string, string | number | null> }
export interface FotoServidores { revisadoEn: string; siguienteEn: string; cadenciaMin: number; filas: FilaServidor[]; alarmas: { id: string; nombre: string; desde: string; avisado: string }[]; duracionMs: number }

/** El titular: lo primero que Daniel lee. Nunca dice «todo bien» si algo de los miembros no tiene dato. */
export function veredicto(filas: FilaServidor[]): { texto: string; tono: Semaforo } {
  const m = filas.filter(f => f.grupo === 'miembros')
  const caidos = m.filter(f => f.estado === 'caido'), sinDato = m.filter(f => f.estado === 'sin-dato'), lentos = m.filter(f => f.estado === 'lento')
  const resto = filas.filter(f => f.grupo !== 'miembros' && (f.estado === 'caido' || f.estado === 'lento'))
  const lista = (xs: FilaServidor[]) => xs.length === 1 ? xs[0].nombre : `${xs.slice(0, -1).map(x => x.nombre).join(', ')} y ${xs[xs.length - 1].nombre}`
  if (caidos.length) return { tono: 'caido', texto: `${lista(caidos)} no ${caidos.length === 1 ? 'abre' : 'abren'} para tus miembros.` }
  if (sinDato.length) return { tono: 'sin-dato', texto: `No pude comprobar ${sinDato.length === 1 ? sinDato[0].nombre : `${sinDato.length} cosas de tus miembros`}: no lo doy por bueno.` }
  if (lentos.length) return { tono: 'lento', texto: `Todo abre para tus miembros; ${lentos.length === 1 ? `${lentos[0].nombre} pide atención` : `${lentos.length} cosas piden atención`}.` }
  if (resto.some(f => f.estado === 'caido')) return { tono: 'caido', texto: 'Tus miembros entran bien, pero algo de tu cerebro está caído.' }
  if (resto.length) return { tono: 'lento', texto: `Todo abre para tus miembros. ${resto.length === 1 ? 'Una cosa' : `${resto.length} cosas`} de casa ${resto.length === 1 ? 'pide' : 'piden'} atención.` }
  return { tono: 'ok', texto: 'Todo lo que usan tus miembros abre.' }
}
