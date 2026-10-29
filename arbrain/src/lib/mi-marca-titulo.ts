/**
 * Nombre de `mi-marca/marca.json` en el título de la ventana (lib/mi-marca.ts). Aparte y sin node:fs: lo usa el
 * componente de cliente components/MiMarca.tsx.
 *
 * «Panel · Arbrain» → «Panel · Acme»; «Tu Arbrain» → «Acme». Pura.
 */
export function tituloConMarca(titulo: string, nombre: string | null): string {
  if (!nombre) return titulo
  return titulo.replace(/\bTu Arbrain\b/g, nombre).replace(/\bArbrain\b/g, nombre)
}
