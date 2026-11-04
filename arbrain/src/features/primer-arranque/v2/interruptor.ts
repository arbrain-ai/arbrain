/**
 * Interruptor del onboarding v2 «tu socio estratega» (3 nov 2026, docs/builds/onboarding-v2-2026-11-03/SPEC.md).
 *
 * Apagado por defecto. Solo `ARBRAIN_ONBOARDING_V2=1` en el proceso de la web abre las rutas de vista previa
 * (`/play-lab/bienvenida-v2`, `/inicio-v2` y `/api/primer-arranque-v2/negocio`); apagado, las tres responden 404. Encenderlo NO cambia
 * `/bienvenida` ni el shell: el primer arranque de hoy sigue siendo el único que ve un alumno. Pasar v2 a la bienvenida
 * real es una decisión aparte (SPEC › «Cómo se enciende»).
 *
 * Módulo puro: lo leen páginas y rutas del servidor y las pruebas (con un `env` sintético).
 */
export const INTERRUPTOR_V2 = 'ARBRAIN_ONBOARDING_V2'

type Entorno = Record<string, string | undefined>

export function onboardingV2Encendido(env: Entorno = typeof process === 'undefined' ? {} : process.env): boolean {
  return env[INTERRUPTOR_V2] === '1'
}
