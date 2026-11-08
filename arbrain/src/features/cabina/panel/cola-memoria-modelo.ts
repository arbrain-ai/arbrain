/**
 * Taller › Agentes › En cola por memoria (5 nov 2026). Modelo puro del bloque: la forma que da el daemon
 * (`server/src/cliente/cola-memoria.ts › VistaCola`), las frases para alguien que no es técnico y un demo para capturas
 * (`?demo-cola=1`).
 */

export interface EncargoEnCola {
  id: string
  tipo: 'rutina' | 'subagente'
  titulo: string
  creado: number
  forzar: boolean
  /** 1, 2, 3… entre lo que espera; 0 si ya está saliendo (admitido). */
  posicion: number
  conversacion: string | null
  estado: 'esperando' | 'admitido'
}

export interface SalidaReciente { id: string; tipo: 'rutina' | 'subagente'; titulo: string; estado: string; motivo: string | null; derivadoA: string | null; cuando: number }

export interface VistaCola {
  activa: boolean
  libreBytes: number | null
  totalBytes: number | null
  umbralBytes: number | null
  esperando: EncargoEnCola[]
  recientes: SalidaReciente[]
}

export const URL_COLA_MEMORIA = '/api/taller/cola-memoria'
const GB = 1024 ** 3

export const enGb = (b: number | null | undefined) => b == null ? '—' : `${(b / GB).toFixed(1)} GB`

/** «hace 4 min», «hace 1 h 10 min». */
export function haceCuanto(desde: number, ahora: number): string {
  const min = Math.max(Math.floor((ahora - desde) / 60_000), 0)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`
}

/** La frase de arriba: cuánta memoria hay contra la que hace falta, y qué pasa con lo que espera. */
export function fraseCola(v: VistaCola): string {
  const n = v.esperando.filter(e => e.estado === 'esperando').length
  const cuantos = n === 1 ? '1 encargo espera' : `${n} encargos esperan`
  if (v.libreBytes == null || v.umbralBytes == null) return `${cuantos} a que tu computadora tenga aire.`
  return `${cuantos}: tu computadora tiene ${enGb(v.libreBytes)} libres y cada agente sale con ${enGb(v.umbralBytes)}. Salen solos, en este orden.`
}

/** Qué tan lleno va el aire hacia el umbral, de 0 a 1 (para la barrita). */
export const aireHaciaUmbral = (v: VistaCola) => v.libreBytes == null || !v.umbralBytes ? 0 : Math.min(Math.max(v.libreBytes / v.umbralBytes, 0), 1)

export function metaEncargo(e: EncargoEnCola, ahora: number): string {
  const que = e.tipo === 'rutina' ? 'Rutina' : 'Subagente'
  if (e.estado === 'admitido') return `${que} · saliendo ahora`
  if (e.forzar) return `${que} · lo lanzaste ya, sale en segundos`
  return `${que} · esperando ${haceCuanto(e.creado, ahora).replace(/^hace /, '')}`
}

export function fraseReciente(r: SalidaReciente, ahora: number): string {
  const cuando = haceCuanto(r.cuando, ahora)
  if (r.estado === 'derivado') return `La corrió ${r.derivadoA ?? 'tu otra máquina'} (aquí no había aire) · ${cuando}`
  if (r.motivo === 'forzado') return `Salió porque lo lanzaste ya · ${cuando}`
  if (r.motivo === 'espera_larga') return `Salió tras esperar mucho, aunque faltaba aire · ${cuando}`
  return `Salió cuando hubo aire · ${cuando}`
}

/** ¿Se muestra el bloque? Solo si la cola está prendida y algo espera (o salió hace poco de la cola). */
export const hayQueMostrar = (v: VistaCola | undefined) => !!v?.activa && (v.esperando.length > 0 || v.recientes.length > 0)

/** Demo para capturas y revisión visual: una MacBook Air de 8 GB con tres encargos formados. */
export function demoCola(ahora = Date.now()): VistaCola {
  return {
    activa: true, libreBytes: 1.1 * GB, totalBytes: 8 * GB, umbralBytes: 1.8 * GB,
    esperando: [
      { id: 'cm_000000000001', tipo: 'subagente', titulo: 'Arma la propuesta para tu cliente nuevo', creado: ahora - 6 * 60_000, forzar: false, posicion: 1, conversacion: 'c1', estado: 'esperando' },
      { id: 'cm_000000000002', tipo: 'rutina', titulo: 'Reporte semanal de clientes', creado: ahora - 4 * 60_000, forzar: false, posicion: 2, conversacion: null, estado: 'esperando' },
      { id: 'cm_000000000003', tipo: 'subagente', titulo: 'Revisa las facturas pendientes del mes', creado: ahora - 90_000, forzar: false, posicion: 3, conversacion: 'c2', estado: 'esperando' },
    ],
    recientes: [
      { id: 'cm_000000000004', tipo: 'rutina', titulo: 'Prepárame el día', estado: 'lanzado', motivo: 'aire', derivadoA: null, cuando: ahora - 12 * 60_000 },
    ],
  }
}
