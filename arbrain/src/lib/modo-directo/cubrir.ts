/**
 * Modo directo, primer cuadro (7 nov 2026): el HTML del servidor llega antes que el velo (que necesita React). Si este
 * equipo recuerda el modo prendido, la página nace cubierta (`html[data-directo-cubre]` → globals.css) y ModoDirecto la
 * descubre en cuanto el velo está puesto, o si el servidor dice que está apagado. Red de seguridad: 6 s.
 */
export const CLAVE_DIRECTO = 'arbrain.modoDirecto'
export const ATRIBUTO_CUBRE = 'data-directo-cubre'
export const cubrirDirectoScript = `try{if(localStorage.getItem(${JSON.stringify(CLAVE_DIRECTO)})==='1'){var r=document.documentElement;r.setAttribute(${JSON.stringify(ATRIBUTO_CUBRE)},'');setTimeout(function(){r.removeAttribute(${JSON.stringify(ATRIBUTO_CUBRE)})},6000)}}catch(e){}`
export function descubrir() { if (typeof document !== 'undefined') document.documentElement.removeAttribute(ATRIBUTO_CUBRE) }
