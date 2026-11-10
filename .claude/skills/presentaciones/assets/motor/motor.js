/* Motor de láminas v2 · skill «presentaciones» de Arbrain (Apache-2.0).
   Escena fija de 1920×1080 que se escala a la pantalla. Una <section class="lamina"> por lámina.
   Gramática completa: references/gramatica.md de la skill.
   Teclas: → espacio clic = siguiente paso · ← clic derecho = atrás · F pantalla completa · P presentador
   N notas aquí · D zona de la cara · V play y pausa del video · ? ayuda · Inicio/Fin · número + Enter salta.
   URL: index.html#3.2 = lámina 3, paso 2. ?captura y ?auditar los usa verificar.py. */
(function(){
"use strict";
var escena=document.getElementById("escena");
var L=[].slice.call(document.querySelectorAll("#escena > section.lamina"));
var Q=location.search;
var MINI=/[?&]mini/.test(Q);       /* miniatura dentro del presentador: solo pinta */
var AUDITAR=/[?&]auditar/.test(Q);
var CAPTURA=/[?&]captura/.test(Q)||AUDITAR;
var REDUCIDO=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
var i=0,paso=0,presentador=null,bc=null;
try{bc=new BroadcastChannel("presentaciones-"+location.pathname)}catch(e){}

/* pasos, bloque y minutos: bloque y minutos se heredan de la última lámina que los declaró */
var bloque="",minutos="";
L.forEach(function(s,k){var m=0;
  [].forEach.call(s.querySelectorAll("[data-p]"),function(e){if(!e.closest("aside.notas"))m=Math.max(m,+e.dataset.p||0)});
  [].forEach.call(s.querySelectorAll("video[data-play-en]"),function(v){m=Math.max(m,+v.dataset.playEn||0)});
  if(s.dataset.pasos)m=Math.max(m,+s.dataset.pasos);
  if(s.dataset.b){bloque=s.dataset.b;minutos=""}
  if(s.dataset.min)minutos=s.dataset.min;
  s._pasos=m;s._n=k;s._b=bloque;s._min=minutos});

function escala(){var k=Math.min(innerWidth/1920,innerHeight/1080);
  escena.style.transform="translate("+((innerWidth-1920*k)/2)+"px,"+((innerHeight-1080*k)/2)+"px) scale("+k+")";window.__k=k}
addEventListener("resize",escala);escala();

function notasDe(s){var a=s.querySelector("aside.notas");return a?a.innerHTML:""}
function estado(){var s=L[i],n=L[i+1];return{tipo:"pres-estado",i:i,paso:paso,total:L.length,pasos:s._pasos,
  titulo:s.dataset.titulo||"",notas:notasDe(s),sig:n?(n.dataset.titulo||("Lámina "+(i+1))):"",
  bloque:s._b,min:s._min,minutosTotal:+document.body.dataset.minutos||0}}
function avisa(){if(MINI||CAPTURA)return;var m=estado();
  try{presentador&&!presentador.closed&&presentador.postMessage(m,"*")}catch(e){}
  try{bc&&bc.postMessage(m)}catch(e){}}

function videos(s){if(MINI||CAPTURA)return;
  L.forEach(function(o){if(o===s)return;[].forEach.call(o.querySelectorAll("video"),function(v){if(!v.paused)v.pause()})});
  [].forEach.call(s.querySelectorAll("video[data-play-en]"),function(v){var n=+v.dataset.playEn;
    var caja=v.closest(".vcaja");
    if(paso>=n){if(v.paused&&!v._yaCorrio){v._yaCorrio=true;var p=v.play();if(p&&p.catch)p.catch(function(){})}}
    else{if(!v.paused)v.pause();v.currentTime=0;v._yaCorrio=false}
    if(caja)caja.classList.toggle("corre",!v.paused)})}
function videoPlayPausa(){var v=L[i].querySelector("video");if(!v)return;if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause();
  var c=v.closest(".vcaja");if(c)c.classList.toggle("corre",!v.paused)}

function pinta(){
  L.forEach(function(s,k){s.classList.toggle("on",k===i)});
  var s=L[i];
  [].forEach.call(s.querySelectorAll("[data-p]"),function(e){var a=+e.dataset.p,h=e.dataset.hasta!=null?+e.dataset.hasta:1e9;
    e.classList.toggle("ver",paso>=a&&paso<=h)});
  for(var q=1;q<=12;q++)s.classList.toggle("p"+q,paso>=q);
  var f=L.length>1?i/(L.length-1):0,r=document.getElementById("rumbo");
  if(r){r.querySelector(".hecho").style.width="calc((100% - 12px) * "+f+")";r.querySelector(".punto").style.left="calc((100% - 12px) * "+f+")"}
  var a=document.getElementById("avance");if(a)a.style.width=(f*100)+"%"; /* decks hechos con la versión anterior */
  escena.classList.toggle("sin-rumbo",s.hasAttribute("data-sin-rumbo"));
  var np=document.getElementById("notas-panel");if(np)np.innerHTML="<b>"+i+" · "+(s.dataset.titulo||"")+" · paso "+paso+"/"+s._pasos+"</b>"+notasDe(s);
  document.body.dataset.lamina=i;document.body.dataset.paso=paso;
  videos(s);
  if(!MINI&&!CAPTURA){try{history.replaceState(null,"","#"+i+"."+paso)}catch(e){}try{window.name="pres-pos:"+i+"."+paso}catch(e){}}
  avisa();
}
function ir(n,p){n=Math.max(0,Math.min(L.length-1,n|0));
  if(n!==i)reinicia(L[i]);
  i=n;paso=Math.max(0,Math.min(p|0,L[i]._pasos));pinta()}
function sig(){if(paso<L[i]._pasos){paso++;pinta()}else if(i<L.length-1)ir(i+1,0)}
function ant(){if(paso>0){paso--;pinta()}else if(i>0)ir(i-1,L[i-1]._pasos)}
window.pres={ir:ir,sig:sig,ant:ant,pos:function(){return{i:i,paso:paso}},reducido:REDUCIDO,L:L};

function abrePresentador(){var w=null;try{w=window.open("presentador.html","presentador-"+location.pathname,"width=1280,height=800")}catch(e){}
  if(w){presentador=w;setTimeout(avisa,600);setTimeout(avisa,1500)}
  else document.body.classList.toggle("ver-notas")} /* dentro de un visor que no deja abrir ventanas: notas aquí mismo */
var ultimaOrden=null;
function orden(d){if(!d)return;if(d.id){if(d.id===ultimaOrden)return;ultimaOrden=d.id} /* la misma orden llega por postMessage y por BroadcastChannel */
  if(d.cmd==="sig")sig();else if(d.cmd==="ant")ant();else if(d.cmd==="ir")ir(d.i,d.paso);else if(d.cmd==="hola")avisa()}
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
  else if(k==="v"||k==="V")videoPlayPausa();
  else if(k==="?")document.body.classList.toggle("ver-ayuda");
  else if(/^[0-9]$/.test(k)){buf+=k;clearTimeout(window.__bt);window.__bt=setTimeout(function(){buf=""},1500)}
  else if(k==="Enter"&&buf){ir(+buf,0);buf=""}
  else if(k==="Escape")document.body.classList.remove("ver-ayuda","ver-notas")});

/* Botón «copiar» (data-copia="#id" del elemento cuyo texto se copia): para el prompt o el ejercicio que el público se lleva. */
function copia(btn){var o=document.querySelector(btn.dataset.copia),t=o?o.innerText:"",ok=function(){var a=btn.textContent;btn.textContent="¡Copiado!";setTimeout(function(){btn.textContent=a},1600)};
  function atajo(){var ta=document.createElement("textarea");ta.value=t;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");ok()}catch(e){}ta.remove()}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,atajo);else atajo()}
var NO_AVANZA="[data-toca],[data-copia],a,button,video,.vcaja";
escena.addEventListener("click",function(e){if(MINI)return;
  var b=e.target.closest("[data-copia]");if(b){copia(b);return}
  if(e.target.closest("video,.vcaja")){videoPlayPausa();return}
  if(e.target.closest(NO_AVANZA))return;
  if(e.shiftKey)ant();else sig()});
escena.addEventListener("contextmenu",function(e){e.preventDefault();if(!MINI)ant()});
var tOc;addEventListener("mousemove",function(){document.body.classList.remove("oculto");clearTimeout(tOc);tOc=setTimeout(function(){document.body.classList.add("oculto")},2000)});

/* ═ Enactivos y universo ═
   Enactivos.registrar(nombre,{w,h,nuevo:()=>estado,cuadro:(ctx,estado,dt,paso,t)=>{}}) · dibuja en coordenadas w×h, nítidas a cualquier escala.
   Universo.registrar(nombre,{nuevo:()=>estado,cuadro:(ctx,estado,dt,info)=>{}}) · el fondo vivo de TODO el deck (1920×1080);
   info={i,total,paso,avance,t}: puede reaccionar al avance de la clase. Se elige con "universo" en deck.json. */
var REG=(window.Enactivos&&window.Enactivos._reg)||{};
var UNI=(window.Universo&&window.Universo._reg)||{};
function lienzo(c,m){var k=Math.min(2.5,(window.__k||1)*(window.devicePixelRatio||1)),W=Math.round(m.w*k),H=Math.round(m.h*k);
  if(c.width!==W||c.height!==H){c.width=W;c.height=H}var x=c.getContext("2d");x.setTransform(k,0,0,k,0,0);return x}
function reinicia(s){[].forEach.call(s.querySelectorAll("canvas.enactivo"),function(c){c._est=null;c._t=0})}
function pasoEnactivo(c,ts){var m=REG[c.dataset.enactivo];if(!m)return;
  if(!c._est){c._est=m.nuevo?m.nuevo():{};c._ult=ts;c._t=0}
  var dt=Math.min(.1,(ts-c._ult)/1000);c._ult=ts;c._t+=dt;
  if(REDUCIDO&&c._quieto===paso)return;
  var x=lienzo(c,m);
  try{
    if(CAPTURA&&c._sim!==paso){c._sim=paso;for(var q=0;q<180;q++){c._t+=1/30;x.clearRect(0,0,m.w,m.h);m.cuadro(x,c._est,1/30,paso,c._t)}} /* captura: simula 6 s antes de pintar */
    x.clearRect(0,0,m.w,m.h);m.cuadro(x,c._est,REDUCIDO?10:dt,paso,c._t);
  }catch(err){document.body.dataset.error=String(err&&err.message||err);throw err}
  if(REDUCIDO)c._quieto=paso}
var cu=document.getElementById("universo"),uni=null,uniEst=null,uniUlt=0,uniT=0,uniHecho=false;
if(cu&&!MINI){uni=UNI[document.body.dataset.universo||""]||null}
if(cu&&!uni)cu.style.display="none";
function pasoUniverso(ts){if(!uni)return;if(CAPTURA&&uniHecho)return;if(!CAPTURA&&ts-uniUlt<33)return;
  var dt=Math.min(.1,(ts-uniUlt)/1000);uniUlt=ts;uniT+=dt;
  var x=cu.getContext("2d");if(!uniEst)uniEst=uni.nuevo?uni.nuevo():{};
  var info={i:i,total:L.length,paso:paso,avance:L.length>1?i/(L.length-1):0,t:uniT};
  try{if(CAPTURA){for(var q=0;q<90;q++){uniT+=1/30;x.clearRect(0,0,1920,1080);uni.cuadro(x,uniEst,1/30,info)}uniHecho=true}
    x.clearRect(0,0,1920,1080);uni.cuadro(x,uniEst,REDUCIDO?0:dt,info)
  }catch(err){document.body.dataset.error=String(err&&err.message||err);throw err}}
function bucle(ts){requestAnimationFrame(bucle);var s=L[i];if(!s)return;
  [].forEach.call(s.querySelectorAll("canvas.enactivo"),function(c){pasoEnactivo(c,ts)});pasoUniverso(ts)}
requestAnimationFrame(bucle);

/* ═ Auditoría (verificar.py): en cada paso de cada lámina busca texto que se sale, que no cabe, muy chico o encimado. ═ */
function desc(e){var t=(e.textContent||"").trim().replace(/\s+/g," ");return e.tagName.toLowerCase()+(e.className&&e.className.baseVal===undefined?"."+String(e.className).trim().split(/\s+/).join("."):"")+" «"+t.slice(0,48)+"»"}
function opacidad(e,hasta){var o=1;for(var n=e;n&&n!==hasta.parentNode;n=n.parentNode){var cs=getComputedStyle(n);if(cs.display==="none"||cs.visibility==="hidden")return 0;o*=+cs.opacity}return o}
function tieneTexto(e){return[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim()})}
function auditaAqui(s,k,p,vistos,out){var E=escena.getBoundingClientRect(),z=E.width/1920,hojas=[];
  [].forEach.call(s.querySelectorAll("*"),function(e){
    if(e.closest("aside.notas")||/^(SCRIPT|STYLE|CANVAS)$/.test(e.tagName)||e.hasAttribute("data-libre"))return;
    if(!tieneTexto(e)||opacidad(e,s)<.05)return;
    var r=e.getBoundingClientRect();if(!r.width||!r.height)return;
    var b={l:(r.left-E.left)/z,t:(r.top-E.top)/z,r:(r.right-E.left)/z,b:(r.bottom-E.top)/z},cs=getComputedStyle(e),px=parseFloat(cs.fontSize);
    function nota(tipo,ex){var c=tipo+"|"+desc(e);if(vistos[c])return;vistos[c]=1;out.push({lamina:k,paso:p,tipo:tipo,donde:desc(e),detalle:ex||""})}
    if(b.l<-1||b.t<-1||b.r>1921||b.b>1081)nota("se sale del cuadro",Math.round(b.l)+","+Math.round(b.t)+" a "+Math.round(b.r)+","+Math.round(b.b));
    if(e.scrollWidth>e.clientWidth+3&&e.clientWidth>0&&cs.display!=="inline")nota("el texto no cabe en su caja",e.scrollWidth+" > "+e.clientWidth);
    if(px<24)nota("letra chica",Math.round(px)+" px (mínimo 24)");
    hojas.push({e:e,b:b})});
  for(var a=0;a<hojas.length;a++)for(var c=a+1;c<hojas.length;c++){var A=hojas[a],B=hojas[c];
    if(A.e.contains(B.e)||B.e.contains(A.e))continue;
    var w=Math.min(A.b.r,B.b.r)-Math.max(A.b.l,B.b.l),h=Math.min(A.b.b,B.b.b)-Math.max(A.b.t,B.b.t);
    if(w>4&&h>4&&w*h>.15*Math.min((A.b.r-A.b.l)*(A.b.b-A.b.t),(B.b.r-B.b.l)*(B.b.b-B.b.t))){
      var cl="encimado|"+desc(A.e)+"|"+desc(B.e);if(!vistos[cl]){vistos[cl]=1;out.push({lamina:k,paso:p,tipo:"texto encimado",donde:desc(A.e),detalle:"con "+desc(B.e)})}}}}
function auditar(){var out=[],vistos={};L.forEach(function(s,k){for(var p=0;p<=s._pasos;p++){ir(k,p);auditaAqui(s,k,p,vistos,out)}});
  document.body.dataset.auditoria=JSON.stringify(out)}

if(MINI)document.body.classList.add("mini");
if(CAPTURA)document.body.classList.add("captura"); /* verificar.py: sin transiciones */
var mem=location.hash.slice(1);
if(!/^\d/.test(mem)&&!MINI){try{var wn=window.name||"";if(wn.indexOf("pres-pos:")===0)mem=wn.slice(9)}catch(e){}}
var h=mem.split(".");
addEventListener("load",function(){ir(parseInt(h[0],10)||0,parseInt(h[1],10)||0);document.body.dataset.listo=L.length;
  if(AUDITAR){var fin=function(){auditar();ir(0,0)};if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fin);else fin()}})
})();
