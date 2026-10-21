/**
 * Cuentas que Consejo exige (suscripciones de la instalación original). Viven fuera del código, en `consejo-identidades.json`
 * de la carpeta de la instalación original (11 oct 2026, empaquetado del alumno): la copia del alumno no lleva esa carpeta, así que ahí quedan vacías y Consejo
 * rechaza cualquier identidad. Se lee desde src/ (tsx) o desde dist/ (dos niveles arriba está src/).
 */
import { jsonOriginal } from '../dueno.js'

function leer(): { claude: string; openai: string } {
  const j = jsonOriginal<{ claude?: unknown; openai?: unknown }>('consejo-identidades.json')
  return typeof j?.claude === 'string' && typeof j?.openai === 'string' ? { claude: j.claude, openai: j.openai } : { claude: '', openai: '' }
}

export const CUENTAS_CONSEJO = leer()
