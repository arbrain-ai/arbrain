/** La caja crece hasta ~8 renglones y luego scrollea por dentro (como claude.ai). */
export const COMPOSER_MAX_LINES=8
export function composerInputCap(height:number,mobile:boolean,lineHeight=24,padding=8) {
  const porRenglones=Math.ceil(lineHeight*COMPOSER_MAX_LINES+padding)
  // En pantallas bajas (teclado abierto) nunca ocupa más de la mitad.
  return Math.min(porRenglones,Math.max(mobile?80:112,Math.floor(height*(mobile?.36:.5))))
}

// Medir sin mover la página (31 oct 2026, Daniel: «cada tecla como que hace parpadear la pantalla, sube y baja»).
// Antes se medía colapsando la caja real (height 0 → scrollHeight → alto final): en WebKit ese instante agranda el
// hilo, el navegador le recorta el scroll al fondo y el ResizeObserver lo vuelve a clavar, así que el hilo bajaba y
// subía en cada tecla (73–242 px, medido en tests/visual/composer-teclear). Ahora mide un gemelo invisible de alto 0
// junto a la caja: misma clase, mismo estilo heredado, mismo zoom. La caja real solo cambia de alto si el texto cambió
// de renglones.
const gemelos=new WeakMap<HTMLTextAreaElement,HTMLTextAreaElement>()
const ESTILO_GEMELO:Partial<CSSStyleDeclaration>={position:'absolute',top:'0',left:'0',height:'0',minHeight:'0',maxHeight:'none',overflow:'hidden',visibility:'hidden',pointerEvents:'none',zIndex:'-1'}
export function gemeloDe(el:HTMLTextAreaElement):HTMLTextAreaElement {
  let g=gemelos.get(el)
  if(!g) {
    g=document.createElement('textarea')
    g.setAttribute('aria-hidden','true'); g.tabIndex=-1; g.readOnly=true; g.dataset.composerGemelo=''
    gemelos.set(el,g)
  }
  if(g.parentNode!==el.parentNode||g.previousSibling!==el) el.after(g)
  g.className=el.className; g.rows=el.rows
  g.style.cssText=el.style.cssText
  Object.assign(g.style,ESTILO_GEMELO)
  g.style.width=getComputedStyle(el).width
  return g
}
export function resizeComposer(el:HTMLTextAreaElement) {
  const height=window.visualViewport?.height??window.innerHeight
  const css=getComputedStyle(el)
  const fontSize=parseFloat(css.fontSize)||16
  const lineHeight=parseFloat(css.lineHeight)||fontSize*1.5
  const padding=(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)
  const cap=composerInputCap(height,window.innerWidth<768,lineHeight,padding)
  const gemelo=gemeloDe(el)
  gemelo.value=el.value
  const content=gemelo.scrollHeight
  // Vacío = una línea; la caja crece solo con el texto.
  const alto=`${Math.min(cap,Math.max(34,content))}px`
  if(el.style.height!==alto) el.style.height=alto
  if(el.style.maxHeight!==`${cap}px`) el.style.maxHeight=`${cap}px`
  const overflow=content>cap?'auto':'hidden'
  if(el.style.overflowY!==overflow) el.style.overflowY=overflow
}
