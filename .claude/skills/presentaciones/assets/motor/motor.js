/* Motor de láminas · skill «presentaciones» de Arbrain (Apache-2.0).
   Escena fija de 1920×1080 que se escala a la pantalla. Una <section class="lamina"> por lámina.
   - Builds: cualquier elemento con data-p="N" aparece en el clic N (data-hasta="M" lo apaga después del M).
     La lámina además recibe las clases .p1, .p2… para que el CSS anime por paso.
   - Notas: <aside class="notas"> dentro de cada lámina; <p data-p="N"> = lo que dices en el clic N.
   - Enactivos 2D: <canvas class="enactivo" data-enactivo="nombre"> + Enactivos.registrar(nombre, {...}).
     Solo corre el de la lámina visible.
   Teclas: → espacio clic = siguiente paso · ← clic derecho = atrás · F pantalla completa · P presentador
   N notas aquí · D zona de la cara · ? ayuda · Inicio/Fin · número + Enter salta a esa lámina.
   URL: index.html#3.2 = lámina 3, paso 2 (sirve para capturas y para volver tras recargar). */
(function(){
"use strict";
var escena=document.getElementById("escena");
var L=[].slice.call(document.querySelectorAll("#escena > section.lamina"));
var MINI=/[?&]mini/.test(location.search); /* miniatura dentro del presentador: solo pinta */
var CAPTURA=/[?&]captura/.test(location.search);
var REDUCIDO=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
var i=0,paso=0,presentador=null,bc=null;
try{bc=new BroadcastChannel("presentaciones-"+location.pathname)}catch(e){}

L.forEach(function(s,k){var m=0;
  [].forEach.call(s.querySelectorAll("[data-p]"),function(e){if(!e.closest("aside.notas"))m=Math.max(m,+e.dataset.p||0)});
  if(s.dataset.pasos)m=Math.max(m,+s.dataset.pasos);
  s._pasos=m;s._n=k});

function escala(){var k=Math.min(innerWidth/1920,innerHeight/1080);
  escena.style.transform="translate("+((innerWidth-1920*k)/2)+"px,"+((innerHeight-1080*k)/2)+"px) scale("+k+")";window.__k=k}
addEventListener("resize",escala);escala();

function notasDe(s){var a=s.querySelector("aside.notas");return a?a.innerHTML:""}
function estado(){var s=L[i];return{tipo:"pres-estado",i:i,paso:paso,total:L.length,pasos:s._pasos,
  titulo:s.dataset.titulo||"",notas:notasDe(s),sig:L[i+1]?(L[i+1].dataset.titulo||("Lámina "+(i+1))):""}}
function avisa(){if(MINI)return;var m=estado();
  try{presentador&&!presentador.closed&&presentador.postMessage(m,"*")}catch(e){}
  try{bc&&bc.postMessage(m)}catch(e){}}

function pinta(){
  L.forEach(function(s,k){s.classList.toggle("on",k===i)});
  var s=L[i];
  [].forEach.call(s.querySelectorAll("[data-p]"),function(e){var a=+e.dataset.p,h=e.dataset.hasta!=null?+e.dataset.hasta:1e9;
    e.classList.toggle("ver",paso>=a&&paso<=h)});
  for(var q=1;q<=12;q++)s.classList.toggle("p"+q,paso>=q);
  var bar=document.getElementById("avance");if(bar)bar.style.width=(L.length>1?i/(L.length-1)*100:0)+"%";
  var np=document.getElementById("notas-panel");if(np)np.innerHTML="<b>"+i+" · "+(s.dataset.titulo||"")+" · paso "+paso+"/"+s._pasos+"</b>"+notasDe(s);
  document.body.dataset.lamina=i;document.body.dataset.paso=paso;
  if(!MINI)try{history.replaceState(null,"","#"+i+"."+paso)}catch(e){}
  avisa();
}
function ir(n,p){n=Math.max(0,Math.min(L.length-1,n|0));i=n;paso=Math.max(0,Math.min(p|0,L[i]._pasos));pinta()}
function sig(){if(paso<L[i]._pasos){paso++;pinta()}else if(i<L.length-1)ir(i+1,0)}
function ant(){if(paso>0){paso--;pinta()}else if(i>0)ir(i-1,L[i-1]._pasos)}
window.pres={ir:ir,sig:sig,ant:ant,pos:function(){return{i:i,paso:paso}},reducido:REDUCIDO};

function abrePresentador(){try{presentador=window.open("presentador.html","presentador-"+location.pathname,"width=1280,height=800");setTimeout(avisa,600)}catch(e){}}
function orden(d){if(!d)return;if(d.cmd==="sig")sig();else if(d.cmd==="ant")ant();else if(d.cmd==="ir")ir(d.i,d.paso);else if(d.cmd==="hola")avisa()}
addEventListener("message",function(e){var d=e.data||{};if(MINI&&d.tipo==="pres-ir")ir(d.i,d.paso);else if(d.tipo==="pres-orden"){if(e.source&&e.source!==window)presentador=e.source;orden(d)}});
if(bc)bc.onmessage=function(m){var d=m.data||{};if(d.tipo==="pres-orden"&&!MINI)orden(d)};

var buf="";
addEventListener("keydown",function(e){if(MINI||e.ctrlKey||e.metaKey||e.altKey)return;var k=e.key;
  if(k==="ArrowRight"||k===" "||k==="PageDown"||k==="ArrowDown"){e.preventDefault();sig()}
  else if(k==="ArrowLeft"||k==="PageUp"||k==="ArrowUp"){e.preventDefault();ant()}
  else if(k==="Home")ir(0,0);else if(k==="End")ir(L.length-1,0);
  else if(k==="f"||k==="F"){if(!document.fullscreenElement)document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();else document.exitFullscreen()}
  else if(k==="p"||k==="P")abrePresentador();
  else if(k==="n"||k==="N")document.body.classList.toggle("ver-notas");
  else if(k==="d"||k==="D")document.body.classList.toggle("ver-cara");
  else if(k==="?")document.body.classList.toggle("ver-ayuda");
  else if(/^[0-9]$/.test(k)){buf+=k;clearTimeout(window.__bt);window.__bt=setTimeout(function(){buf=""},1500)}
  else if(k==="Enter"&&buf){ir(+buf,0);buf=""}
  else if(k==="Escape")document.body.classList.remove("ver-ayuda","ver-notas")});
escena.addEventListener("click",function(e){if(MINI||e.target.closest("[data-toca]"))return;if(e.shiftKey)ant();else sig()});
escena.addEventListener("contextmenu",function(e){e.preventDefault();if(!MINI)ant()});
var tOc;addEventListener("mousemove",function(){document.body.classList.remove("oculto");clearTimeout(tOc);tOc=setTimeout(function(){document.body.classList.add("oculto")},2000)});

/* ═ Enactivos 2D ═ registrar(nombre,{w,h,nuevo:()=>estado,cuadro:(ctx,estado,dt,paso,t)=>{}})
   El lienzo se dibuja en coordenadas w×h nítidas a cualquier escala. Con movimiento reducido, cuadro() recibe dt grande una vez. */
var REG=(window.Enactivos&&window.Enactivos._reg)||{};
function lienzo(c,m){var k=(window.__k||1)*(window.devicePixelRatio||1),W=Math.round(m.w*k),H=Math.round(m.h*k);
  if(c.width!==W||c.height!==H){c.width=W;c.height=H}var x=c.getContext("2d");x.setTransform(k,0,0,k,0,0);return x}
var activo=null,est=null,ult=0,t=0;
function bucle(ts){requestAnimationFrame(bucle);var s=L[i];var c=s&&s.querySelector("canvas.enactivo");if(!c)return;
  var m=REG[c.dataset.enactivo];if(!m)return;
  if(activo!==c){activo=c;est=m.nuevo?m.nuevo():{};ult=ts;t=0}
  var dt=Math.min(.1,(ts-ult)/1000);ult=ts;t+=dt;
  if(REDUCIDO&&est.__quieto)return;
  var x=lienzo(c,m);
  if(CAPTURA&&!est.__sim){est.__sim=1;for(var q=0;q<150;q++){x.clearRect(0,0,m.w,m.h);t+=1/30;m.cuadro(x,est,1/30,paso,t)}} /* captura: simula 5 s antes de pintar */
  x.clearRect(0,0,m.w,m.h);
  try{m.cuadro(x,est,REDUCIDO?10:dt,paso,t)}catch(err){document.body.dataset.error=String(err&&err.message||err);throw err}
  if(REDUCIDO)est.__quieto=true}
requestAnimationFrame(bucle);
var ultPaso=-1;setInterval(function(){if(paso!==ultPaso&&est){est.__quieto=false;ultPaso=paso}},100);

if(MINI)document.body.classList.add("mini");
if(/[?&]captura/.test(location.search))document.body.classList.add("captura"); /* verificar.py: sin transiciones */
var h=location.hash.slice(1).split(".");
addEventListener("load",function(){ir(parseInt(h[0],10)||0,parseInt(h[1],10)||0);document.body.dataset.listo=L.length})
})();
