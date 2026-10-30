/**
 * Versión del contrato del daemon empaquetado (docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md).
 * v2 (11 oct 2026, endurecimiento): secretos y llaves por stdin (`ARBRAIN_SECRETOS=stdin`), pase de agente.
 * v3 (11 oct 2026, red team C1/C2/M1): confirmaciones con el comando literal (`literal`, `avisos`, `creadaPor`);
 * `/confirmaciones/pedir` y `/consumir` solo aceptan la acción estructurada de manos; `GET /manos/estado`,
 * `GET|POST /manos/interruptor` (encender: solo la app). Lanzamiento y stdin sin cambios respecto a v2.
 */
export const CONTRATO_DAEMON = 3
