/**
 * Código de un solo uso para entrar desde el teléfono (23 oct 2026): 8 caracteres del alfabeto de la contraseña
 * (sin 0/o, 1/l/i) en dos grupos, `abcd-efgh`. Lo genera el supervisor (scripts/servidor/telefono.mjs › codigoNuevo);
 * aquí solo se reconoce su forma para no gastar un canje con algo que no lo es. Puro.
 */
export function pareceCodigo(t: string | null | undefined): boolean {
  return /^[a-hjkmnp-z2-9]{8}$/.test(String(t ?? '').toLowerCase().replace(/[\s-]/g, ''))
}
