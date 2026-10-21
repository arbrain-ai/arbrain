/** Version del esquema del documento de canvas.
 *
 * Vive AQUI y no en `api/canvas/pages/route.ts` porque Next 16 solo admite
 * un juego cerrado de exports en un route handler (GET, POST, runtime,
 * dynamic...). Exportar una constante desde ahi compila con Turbopack pero
 * REVIENTA el type check de `next build --webpack`, que es el que corre
 * Vercel:
 *
 *   Type 'OmitWithTag<typeof route, ...>' does not satisfy the constraint
 *   '{ [x: string]: never; }' — Property 'SCHEMA_V4' is incompatible.
 *
 * Es el mismo genero de fallo que tumbo los deploys de dias del 19-22 ago:
 * verde en local, rojo solo en Vercel.
 */
export const SCHEMA_V4 = 4
