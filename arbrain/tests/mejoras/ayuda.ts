// Ayudas de las pruebas de Ajustes › Mejoras.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Un localStorage de mentira. */
export const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }
export const fuente = (ruta: string) => readFileSync(join(__dirname, '..', '..', ruta), 'utf8')
