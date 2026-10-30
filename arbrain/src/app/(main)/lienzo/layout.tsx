/**
 * Lienzo — sección de la barra izquierda (3 oct 2026). Las @font-face del canvas v4 apuntan a los MISMOS
 * .ttf que mide el compilador del servidor: sin este link el layout nace torcido (ver app/canvas-lab/layout.tsx).
 */
export default function LienzoLayout({ children }: { children: React.ReactNode }) {
  return <>
    <link rel="stylesheet" href="/fonts/v4/fonts.css" precedence="default" />
    {children}
  </>
}
