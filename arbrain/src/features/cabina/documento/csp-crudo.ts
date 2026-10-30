/**
 * Cabecera CSP de la ruta `crudo` (red team M5, 11 oct 2026). HTML y SVG pueden ejecutar scripts si alguien abre la URL
 * a nivel superior (enlace, «abrir en ventana»): ahí ya no los aísla el `sandbox` del iframe y correrían en el origen de
 * la app, con su cookie. `sandbox` sin `allow-same-origin` los deja siempre en origen opaco, igual que `/api/reporte`;
 * dentro del iframe (`sandbox="allow-scripts"`) no cambia nada. Los assets inertes (CSS, imágenes, video) no la llevan.
 */
export const SANDBOX_CRUDO = 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals'
const ACTIVOS = new Set(['html', 'htm', 'xhtml', 'svg', 'xml'])

export function cspCrudo(ext: string): string | null {
  return ACTIVOS.has(ext.toLowerCase()) ? SANDBOX_CRUDO : null
}
