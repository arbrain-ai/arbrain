/**
 * Taller › Computadora del alumno (T16, 29 oct 2026). Lo que entrega `GET /computadora` de SU daemon
 * (server/src/cliente/computadora.ts) y cómo se dice en palabras simples. Pura: la comparten la vista y su ruta web.
 */

export type Semaforo = 'verde' | 'amarillo' | 'rojo'
export interface AppComputadora { id: string; nombre: string; memoriaMb: number; procesos: number; cerrable: boolean; motivo?: string }
export interface FotoComputadora {
  plataforma: 'mac' | 'windows' | 'otra'
  memoria: { total: number; disponible: number; usada: number; semaforo: Semaforo } | null
  discoLibre: number | null
  procesador: number | null
  sueno: { puedeDormirse: boolean | null; minutos: number | null; impidenAhora: string[] }
  apps: AppComputadora[]
  tieneRutinas: boolean
  consejos: string[]
}
export interface RespuestaCierre { ok?: boolean; cerrada?: boolean; puedeForzar?: boolean; mensaje?: string; error?: string }

const GB = 1024 ** 3

/** Bytes a «5.2 GB» (o «820 MB» si no llega a 1 GB). */
export function tamano(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1)} GB`
  return `${Math.max(0, Math.round(bytes / 1024 ** 2))} MB`
}
export const tamanoMb = (mb: number) => tamano(mb * 1024 ** 2)

export const FRASE_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Holgada',
  amarillo: 'Se está llenando',
  rojo: 'Casi llena: todo irá lento',
}

export function fraseMemoria(m: FotoComputadora['memoria']): string {
  if (!m) return 'No pude leer la memoria.'
  return `Usas ${tamano(m.usada)} de ${tamano(m.total)}`
}

export function fraseDisco(libre: number | null): string {
  return libre === null ? 'No pude leer el disco.' : `${tamano(libre)} libres`
}

export function fraseProcesador(p: number | null): { texto: string; tono: Semaforo } {
  if (p === null) return { texto: 'No pude medirlo.', tono: 'verde' }
  if (p >= 85) return { texto: `Al tope (${p} %)`, tono: 'rojo' }
  if (p >= 60) return { texto: `Ocupado (${p} %)`, tono: 'amarillo' }
  return { texto: `Tranquilo (${p} %)`, tono: 'verde' }
}

/** ¿Se puede dormir? En palabras, y si eso le importa a sus rutinas. */
export function fraseSueno(f: Pick<FotoComputadora, 'sueno' | 'plataforma' | 'tieneRutinas'>): { texto: string; tono: Semaforo } {
  const s = f.sueno
  const quien = f.plataforma === 'mac' ? 'Tu Mac' : 'Tu computadora'
  if (s.puedeDormirse === null) return { texto: 'No pude saber si se duerme sola.', tono: 'verde' }
  if (!s.puedeDormirse) return { texto: `${quien} no se duerme sola: tus rutinas pueden correr a cualquier hora.`, tono: 'verde' }
  const cuando = s.minutos ? ` tras ${s.minutos} min sin usarla` : ''
  return {
    texto: `${quien} se duerme sola${cuando}.${f.tieneRutinas ? ' Mientras duerme, tus rutinas no corren.' : ''}`,
    tono: f.tieneRutinas ? 'amarillo' : 'verde',
  }
}

/** El cuerpo que la ruta web acepta para cerrar o forzar. Pura. */
export function cuerpoCierre(v: unknown): { id: string; forzar: boolean } | { error: string } {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id || o.id.length > 400 || /[\0\r\n]/.test(o.id)) return { error: 'Falta qué app cerrar.' }
  return { id: o.id, forzar: o.forzar === true }
}
