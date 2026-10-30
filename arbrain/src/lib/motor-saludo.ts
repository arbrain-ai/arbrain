/**
 * Saludo al motor de terminales (red team 4 M4-3). En la edición cliente el motor exige el token de esta apertura, que
 * la app le da a la web en su línea de secretos por stdin (`ARBRAIN_MOTOR_TOKEN`, solo en la memoria de Next; sus hijos
 * no lo heredan). Sin token (instalación de Daniel), el saludo de siempre: el cable de SFTerm no cambia. Pura.
 */
export function saludo(cliente: string, token = process.env.ARBRAIN_MOTOR_TOKEN): Record<string, unknown> {
  return token ? { op: 'hello', proto: 1, client: cliente, token } : { op: 'hello', proto: 1, client: cliente }
}
