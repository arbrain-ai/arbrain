/** La caja crece hasta ~8 renglones y luego scrollea por dentro (como claude.ai). */
export const COMPOSER_MAX_LINES=8
export function composerInputCap(height:number,mobile:boolean,lineHeight=24,padding=8) {
  const porRenglones=Math.ceil(lineHeight*COMPOSER_MAX_LINES+padding)
  // En pantallas bajas (teclado abierto) nunca ocupa más de la mitad.
  return Math.min(porRenglones,Math.max(mobile?80:112,Math.floor(height*(mobile?.36:.5))))
}
export function resizeComposer(el:HTMLTextAreaElement) {
  const height=window.visualViewport?.height??window.innerHeight
  const css=getComputedStyle(el)
  const fontSize=parseFloat(css.fontSize)||16
  const lineHeight=parseFloat(css.lineHeight)||fontSize*1.5
  const padding=(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)
  const cap=composerInputCap(height,window.innerWidth<768,lineHeight,padding)
  el.style.height='0px'
  const content=el.scrollHeight
  // Vacío = una línea; la caja crece solo con el texto.
  el.style.height=`${Math.min(cap,Math.max(34,content))}px`
  el.style.maxHeight=`${cap}px`
  el.style.overflowY=content>cap?'auto':'hidden'
}
