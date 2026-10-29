/**
 * Avisos de Permisos y seguridad que la persona tiene que ver (0.2.15, A10 del diagnóstico del 29 oct 2026).
 *
 * En Windows, los ganchos del proyecto corren con `py.sh`, que sin un Python 3.8+ en el PATH salía con 0 sin decir nada:
 * el recuerdo de memoria, la captura de conversaciones y el candado de envíos no corrían y nadie lo sabía. La red real
 * del alumno es la guardia del daemon (TypeScript), así que no es un hueco de seguridad; pero sí hay que avisarle. El
 * daemon lo comprueba al pedir `/permisos` (una vez por proceso, con caché) y la app lo pinta en Ajustes › Permisos y
 * seguridad. Los ganchos, por su lado, dejan `.claude/hooks/tmp/sin-python.json` cuando no encuentran intérprete.
 * Instalación de Daniel y macOS/Linux: sin avisos.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esEdicionCliente } from '../edicion.js'

export interface AvisoPermisos { id: 'sin-python'; texto: string; como: string }

export const AVISO_SIN_PYTHON: AvisoPermisos = {
  id: 'sin-python',
  texto: 'En esta computadora no encontré Python 3.8 o más nuevo, así que los ganchos de tu cerebro (recuerdo de memoria, captura de conversaciones, candado de envíos) no corren. La guardia de Arbrain sigue protegiéndote igual; lo que pierdes es memoria y diario.',
  como: 'Instala Python desde python.org (marca «Add python.exe to PATH») o con «winget install Python.Python.3.12», y vuelve a abrir Arbrain.',
}

/** ¿Hay un Python que sirva en el PATH? (Windows: python3 suele ser el alias de la tienda, que no corre nada.) */
export function hayPython(plataforma = process.platform, correr: (cmd: string, args: string[]) => { status: number | null } = (c, a) => spawnSync(c, a, { timeout: 8_000, windowsHide: true, stdio: 'ignore' })): boolean {
  const prueba = ['-I', '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)']
  for (const p of plataforma === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    try { if (correr(p, prueba).status === 0) return true } catch { /* no está */ }
  }
  if (plataforma === 'win32') { try { if (correr('py', ['-3', ...prueba]).status === 0) return true } catch { /* no está */ } }
  return false
}

let cache: { en: number; avisos: AvisoPermisos[] } | null = null
const VIGENCIA_MS = 10 * 60_000

/** Marca que deja `py.sh` cuando no encuentra Python: `<cerebro>/.claude/hooks/tmp/sin-python.json` (últimas 24 h). */
function marcaDeLosGanchos(home: string | undefined): boolean {
  if (!home) return false
  const p = join(home, '.claude', 'hooks', 'tmp', 'sin-python.json')
  if (!existsSync(p)) return false
  try { const j = JSON.parse(readFileSync(p, 'utf8')) as { t?: unknown }; return typeof j.t === 'number' && Date.now() - j.t < 24 * 3600_000 } catch { return true }
}

export function avisosPermisos(env: NodeJS.ProcessEnv = process.env, plataforma = process.platform): AvisoPermisos[] {
  if (!esEdicionCliente()) return []
  if (cache && Date.now() - cache.en < VIGENCIA_MS) return cache.avisos
  const avisos: AvisoPermisos[] = []
  if (plataforma === 'win32' && (marcaDeLosGanchos(env.ARBRAIN_HOME) || !hayPython(plataforma))) avisos.push(AVISO_SIN_PYTHON)
  cache = { en: Date.now(), avisos }
  return avisos
}

/** Solo pruebas. */
export function _avisosParaPruebas(): void { cache = null }
