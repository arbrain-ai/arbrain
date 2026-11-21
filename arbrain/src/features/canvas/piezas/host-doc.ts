/**
 * Lienzo v17 · el DOCUMENTO del host compartido de las piezas libres (15 nov 2026). Puro (tests/canvas/piezas-formato.test.ts).
 *
 * El host corre con `sandbox="allow-scripts"` (origen opaco: sin la sesión ni la API de la app) y esta CSP: sin red de
 * ningún tipo (`connect-src`, imágenes y letras solo `data:`/`blob:` que le entrega el lienzo), sin marcos, sin
 * formularios. Sin `unsafe-eval`: el script de cada pieza corre como `<script>` en línea envuelto en su función.
 */
export const CSP_HOST = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; " +
  "font-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; child-src 'none'; " +
  "form-action 'none'; base-uri 'none'"

/** El `srcdoc` del host (puro: lo prueba tests/canvas/piezas-host.test.ts). `</script` dentro del runtime no rompe nada. */
export function documentoHost(runtime: string, kit: string): string {
  const seguro = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP_HOST}">` +
    `<style data-kit>${seguro(kit)}</style>` +
    `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style>` +
    `<script>${seguro(runtime)}</script></head><body></body></html>`
}
