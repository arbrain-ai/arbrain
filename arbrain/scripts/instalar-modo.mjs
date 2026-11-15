/**
 * Cómo se instala la app de escritorio nueva (14 nov 2026). La regla: NUNCA se reemplaza la app al momento si está abierta,
 * salvo con `--ahora` explícito. Con la app abierta la versión queda pendiente al lado y la app la aplica sola en reposo
 * (sin turno en curso y tras 2 min sin tocarla, al pulsar «Reiniciar» o al cerrarla).
 *
 * La trampa que esto cierra: hasta hoy la condición del camino «pendiente» pedía también `shouldOpen`, así que
 * `desktop:install --no-open` (que solo quiere decir «no la abras al terminar») reemplazaba la app abierta en caliente.
 * Ninguna bandera distinta de `--ahora` cambia el modo.
 *
 *   reemplazar  la app está cerrada (no hay nada que cortar) o se pidió `--ahora`
 *   pendiente   la app está abierta y sabe aplicar versiones pendientes
 *   esperar     la app está abierta y es anterior al mecanismo: no se toca; ciérrala o repite con `--ahora`
 *
 * Puro (tests/desktop/instalar-modo.test.ts).
 */
export function modoDeInstalar(argv, { abierta, sabeAplicar }) {
  if (argv.includes('--ahora')) return 'reemplazar';
  if (!abierta) return 'reemplazar';
  return sabeAplicar ? 'pendiente' : 'esperar';
}
