/**
 * Vista HTML del chat en la edición cliente (seguridad noche 21→22 oct 2026, carril 2-APP-ALUMNO). El iframe ya va con
 * `sandbox="allow-scripts"` (sin mismo origen, formularios, popups ni navegación de la página) y hereda la CSP de la web
 * (`img-src`/`connect-src` propios). Lo que esa CSP no cubre y una inyección podría usar para sacar datos escritos en el
 * HTML: WebRTC (STUN/TURN a un host que lleva los datos en el nombre) y la resolución DNS anticipada de enlaces
 * (`dns-prefetch`/`preconnect`). Aquí se cierran desde DENTRO del documento: una CSP propia más estricta al principio del
 * `<head>` (se suma a la heredada; nunca la afloja), `webrtc 'block'` donde el navegador la entienda, el prefetch apagado
 * y, antes que cualquier script de la vista, los constructores de WebRTC fuera. Puro.
 */
export const CSP_VISTA = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "webrtc 'block'",
].join('; ')

const SIN_WEBRTC = '<script>(function(){try{for(var k of ["RTCPeerConnection","webkitRTCPeerConnection","RTCDataChannel","RTCSessionDescription","RTCIceCandidate"]){try{Object.defineProperty(window,k,{value:undefined,configurable:false,writable:false})}catch(e){}}}catch(e){}})()</script>'

export const CABEZA_BLINDADA = `<meta http-equiv="Content-Security-Policy" content="${CSP_VISTA}"><meta http-equiv="x-dns-prefetch-control" content="off">${SIN_WEBRTC}`

/** Inserta la cabeza blindada como lo PRIMERO del documento que el navegador procesa (tras `<head>` o `<html>`). */
export function blindarSrcDoc(doc: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(doc)
  if (head) return doc.slice(0, head.index + head[0].length) + CABEZA_BLINDADA + doc.slice(head.index + head[0].length)
  const html = /<html(\s[^>]*)?>/i.exec(doc)
  if (html) return doc.slice(0, html.index + html[0].length) + `<head>${CABEZA_BLINDADA}</head>` + doc.slice(html.index + html[0].length)
  const tipo = /^\s*<!doctype[^>]*>/i.exec(doc)
  if (tipo) return tipo[0] + `<head>${CABEZA_BLINDADA}</head>` + doc.slice(tipo[0].length)
  return `<head>${CABEZA_BLINDADA}</head>` + doc
}
