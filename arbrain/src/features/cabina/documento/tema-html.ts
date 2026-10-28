/**
 * Convención «los documentos HTML del panel siguen el tema» (4 oct 2026, Daniel).
 *
 *  · El HTML NO implementa nada de transporte: lee `html[data-tema="claro"|"oscuro"]` en su CSS.
 *      html[data-tema=claro] { --fondo: #fff; --texto: #111 }
 *  · Al servirlo, el visor inyecta un script mínimo que fija `data-tema` (y `color-scheme`) desde `?tema=` y lo
 *    mantiene al día con `postMessage({ tipo: 'arbrain-tema', tema })` desde la app cuando cambia (a mano o por hora).
 *  · Zoom (⌘+rueda, ⌘+ ⌘− ⌘0): la rueda no llega de un iframe aislado al padre, así que el mismo script inyectado
 *    reenvía `postMessage({ tipo: 'arbrain-rueda', dy })` y `({ tipo: 'arbrain-tecla', tecla })`, y aplica
 *    `{ tipo: 'arbrain-pinza', fase: 'ini'|'mov'|'fin', ratio }` (el pellizco de dos dedos en el teléfono) y aplica
 *    `{ tipo: 'arbrain-zoom', zoom }` como `zoom` CSS del <html>: el documento reflowea a su ancho, sin scroll horizontal.
 *  · Ctrl+D/X/W/M/Q (5 oct 2026, atajos globales de `useAtajosCtrl`) tampoco salen del iframe: se reenvían como
 *    `{ tipo: 'arbrain-ctrl', code }`. Ctrl+D en un campo del documento sigue siendo suyo.
 *  · «Escuchar» (7 oct 2026): el mismo servidor inyecta el agente del lector (lector-agente.ts), que extrae los bloques del
 *    documento y pinta la palabra que suena cuando la app se lo pide por `postMessage`. El HTML tampoco sabe nada de esto.
 *  · Pantalla completa (28 oct 2026, Daniel: «un botón para expandir todo viendo horizontal para poder estudiarla bien»):
 *    con `{ tipo: 'arbrain-pantalla', on }` el documento que cabe en su ventana (un deck, sin scroll) se pasa con toque
 *    (mitad derecha avanza, izquierda retrocede) y swipe horizontal, como flechas ← →; `{ tipo: 'arbrain-nav', paso }` es
 *    la flecha desde la app y Escape avisa `{ tipo: 'arbrain-salir' }`. Botones y enlaces del documento siguen siendo suyos.
 *  · Un HTML que no sabe nada del tema queda con canvas/texto por defecto del color-scheme correcto; el que quiera
 *    control fino usa el selector. Ejemplo: docs/guardados/plan-octubre-2026/index.html.
 */
import { SCRIPT_LECTOR } from './lector-agente'

export type TemaDoc = 'claro' | 'oscuro'
export const temaDoc = (t: string | null | undefined): TemaDoc => (t === 'claro' ? 'claro' : 'oscuro')

const SCRIPT = (t: TemaDoc) => `<script>(function(){var r=document.documentElement,P=false,N=function(){};function a(t){t=t==='claro'?'claro':'oscuro';r.setAttribute('data-tema',t);r.style.colorScheme=t==='claro'?'light':'dark'}a(${JSON.stringify(t)});addEventListener('message',function(e){var d=e.data;if(!d)return;if(d.tipo==='arbrain-tema')a(d.tema);else if(d.tipo==='arbrain-zoom'&&typeof d.zoom==='number')r.style.zoom=String(d.zoom);else if(d.tipo==='arbrain-pantalla')P=!!d.on;else if(d.tipo==='arbrain-nav')N(d.paso>0?1:-1)});addEventListener('wheel',function(e){if(e.metaKey||e.ctrlKey){e.preventDefault();parent.postMessage({tipo:'arbrain-rueda',dy:e.deltaY},'*')}},{passive:false});(function(){var d0=0;function D(e){return Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)}addEventListener('touchstart',function(e){if(e.touches.length===2){d0=D(e);parent.postMessage({tipo:'arbrain-pinza',fase:'ini'},'*')}},{passive:true});addEventListener('touchmove',function(e){if(e.touches.length===2&&d0>0){e.preventDefault();parent.postMessage({tipo:'arbrain-pinza',fase:'mov',ratio:D(e)/d0},'*')}},{passive:false});function F(e){if(d0>0&&e.touches.length<2){d0=0;parent.postMessage({tipo:'arbrain-pinza',fase:'fin',ratio:1},'*')}}addEventListener('touchend',F);addEventListener('touchcancel',F)})();(function(){var I='a,button,input,textarea,select,label,summary,video,audio,[contenteditable],[role=button],[onclick]';function G(){var e=document.scrollingElement||r;return e.scrollHeight<=innerHeight+4}N=function(s){var k=s>0?'ArrowRight':'ArrowLeft';document.dispatchEvent(new KeyboardEvent('keydown',{key:k,code:k,bubbles:true,cancelable:true}))};addEventListener('click',function(e){if(!P||!G())return;var t=e.target;if(t&&t.closest&&t.closest(I))return;e.preventDefault();e.stopImmediatePropagation();N(e.clientX<innerWidth/2?-1:1)},true);var x=0,y=0,v=0;addEventListener('touchstart',function(e){v=e.touches.length===1;if(v){x=e.touches[0].clientX;y=e.touches[0].clientY}},{passive:true});addEventListener('touchend',function(e){if(!v||!P||!G())return;v=0;var t=e.changedTouches[0],dx=t.clientX-x,dy=t.clientY-y;if(Math.abs(dx)>40&&Math.abs(dx)>1.5*Math.abs(dy)){e.preventDefault();N(dx<0?1:-1)}},{passive:false});addEventListener('keydown',function(e){if(P&&e.key==='Escape')parent.postMessage({tipo:'arbrain-salir'},'*')})})();addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&!e.altKey){var k=e.key==='='||e.key==='+'?'+':e.key==='-'||e.key==='_'?'-':e.key==='0'?'0':null;if(k){e.preventDefault();parent.postMessage({tipo:'arbrain-tecla',tecla:k},'*')}}if(e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&/^Key[DXWMQ]$/.test(e.code)){var f=document.activeElement;if(e.code==='KeyD'&&f&&(f.tagName==='INPUT'||f.tagName==='TEXTAREA'||f.isContentEditable))return;e.preventDefault();parent.postMessage({tipo:'arbrain-ctrl',code:e.code},'*')}})})()</script>`

/** Inyecta el script al inicio del documento (tras <head>, o tras <html>, o al principio). */
export function inyectarTema(html: string, tema: string | null | undefined): string {
  const tag = SCRIPT(temaDoc(tema)) + SCRIPT_LECTOR
  const m = /<head[^>]*>/i.exec(html) ?? /<html[^>]*>/i.exec(html)
  if (!m) return tag + html
  const i = m.index + m[0].length
  return html.slice(0, i) + tag + html.slice(i)
}
