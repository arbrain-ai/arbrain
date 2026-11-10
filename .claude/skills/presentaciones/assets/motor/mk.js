/* MK · el vocabulario para dibujar enactivos y universos. Todo lee los colores del tema: si cambia la marca, cambia el dibujo.
   Es vocabulario, no plantilla: las piezas las inventas tú para cada idea. Referencia: references/enactivos.md */
window.Enactivos=window.Enactivos||{_reg:{},registrar:function(n,m){this._reg[n]=m}};
window.Universo=window.Universo||{_reg:{},registrar:function(n,m){this._reg[n]=m}};
window.MK=(function(){
"use strict";
var raiz=getComputedStyle(document.documentElement);
function v(n,def){var c=raiz.getPropertyValue(n).trim();return c||def}
var _P=null;
function P(){if(_P)return _P;_P={
  acento:v("--acento","#ff9101"),claro:v("--acento-claro","#ffb64d"),rgb:v("--acento-rgb","255,145,1"),
  acento2:v("--acento-2","#8c27f1"),claro2:v("--acento-2-claro","#c79cff"),rgb2:v("--acento-2-rgb","140,39,241"),
  tinta:v("--tinta","#f7f8f8"),suave:v("--tinta-suave","#d4d4d8"),tenue:v("--tinta-tenue","#a1a1aa"),linea:v("--linea","rgba(255,255,255,.09)"),base:v("--base","#09090b"),
  titulo:v("--letra-titulo","Georgia,serif"),texto:v("--letra-texto","system-ui,sans-serif"),mono:v("--letra-mono","Menlo,monospace")};return _P}
/* azar con semilla: el mismo dibujo cada vez */
function rng(s){return function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function cl(x){return x<0?0:x>1?1:x}
function mezcla(a,b,t){return a+(b-a)*t}
function eio(t){t=cl(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
function eo(t){t=cl(t);return 1-Math.pow(1-t,3)}
/* acerca v hacia obj a vel unidades por segundo: la forma de que cada clic cambie un estado y el dibujo llegue solo (también al ir hacia atrás) */
function ir(v,obj,dt,vel){return v<obj?Math.min(obj,v+dt*vel):Math.max(obj,v-dt*vel)}
/* f(peso,px,familia): familia "t" título, "m" mono, cualquier otra texto */
function f(peso,px,fam){var p=P();return peso+" "+px+"px "+(fam==="t"?p.titulo:fam==="m"?p.mono:p.texto)}
function texto(x,t,px,py,o){o=o||{};var p=P();x.font=o.font||f(700,28);x.fillStyle=o.color||p.suave;x.textAlign=o.al||"center";x.textBaseline=o.base||"middle";x.globalAlpha=o.a==null?1:o.a;x.fillText(t,px,py);x.globalAlpha=1}
function bola(x,cx,cy,r,color,brillo,a){x.globalAlpha=a==null?1:a;x.fillStyle=color||P().acento;if(brillo){x.shadowColor=P().acento;x.shadowBlur=brillo}x.beginPath();x.arc(cx,cy,r,0,6.2832);x.fill();x.shadowBlur=0;x.globalAlpha=1}
function halo(x,cx,cy,r,a,rgb){if(a<=0)return;var c=rgb||P().rgb,g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,"rgba("+c+","+(.42*a)+")");g.addColorStop(1,"rgba("+c+",0)");x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,6.2832);x.fill()}
function estrella(x,cx,cy,r,a,giro){if(a<=0)return;var p=P();halo(x,cx,cy,r*3.2,a);x.save();x.globalAlpha=a;x.translate(cx,cy);x.rotate(giro||0);x.fillStyle=p.claro;x.shadowColor=p.acento;x.shadowBlur=26;x.beginPath();var b=r*.26;
  for(var k=0;k<8;k++){var ang=k*Math.PI/4,R=k%2?b:r;x.lineTo(Math.cos(ang)*R,Math.sin(ang)*R)}x.closePath();x.fill();x.restore();x.shadowBlur=0;x.globalAlpha=1}
function rrect(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()}
/* placa de vidrio; acentuada=true la tiñe del color de la marca */
function vidrio(x,a,b,w,h,r,acentuada,al){var p=P();x.globalAlpha=al==null?1:al;var g=x.createLinearGradient(0,b,0,b+h);
  if(acentuada){g.addColorStop(0,"rgba("+p.rgb+",.20)");g.addColorStop(1,"rgba("+p.rgb+",.05)")}else{g.addColorStop(0,"rgba(255,255,255,.075)");g.addColorStop(1,"rgba(255,255,255,.02)")}
  x.fillStyle=g;rrect(x,a,b,w,h,r);x.fill();x.strokeStyle=acentuada?"rgba("+p.rgb+",.45)":p.linea;x.lineWidth=1.5;x.stroke();x.globalAlpha=1}
function bez(p0,p1,p2,t){var u=1-t;return{x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x,y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y}}
/* cola: estela que se desvanece hacia atrás, de una lista de puntos */
function cola(x,pts,color,ancho){var n=pts.length;if(n<2)return;x.lineCap="round";x.strokeStyle=color||P().acento;x.lineWidth=ancho||3;
  for(var t=0;t<8;t++){var a=Math.floor(n*t/8),b=Math.min(n-1,Math.floor(n*(t+1)/8)+1);x.globalAlpha=Math.pow((t+1)/8,1.7);x.beginPath();x.moveTo(pts[a].x,pts[a].y);for(var j=a+1;j<=b;j++)x.lineTo(pts[j].x,pts[j].y);x.stroke()}x.globalAlpha=1}
var imgs={};function imagen(src){if(!imgs[src]){imgs[src]=new Image();imgs[src].src=src}return imgs[src]}
var mk={rng:rng,cl:cl,mezcla:mezcla,eio:eio,eo:eo,ir:ir,f:f,texto:texto,bola:bola,halo:halo,estrella:estrella,rrect:rrect,vidrio:vidrio,bez:bez,cola:cola,imagen:imagen};
Object.defineProperty(mk,"P",{get:P});
return mk;
})();

/* Universos de fábrica. El mejor deck inventa el suyo (references/oficio.md); estos son el piso. */
Universo.registrar("polvo",{
  nuevo:function(){var r=MK.rng(7),P=[];for(var k=0;k<90;k++)P.push({x:r()*1920,y:r()*1080,v:6+r()*16,a:r()*6.28,w:.4+r()*1.4,s:.6+r()*1.9,m:r()<.22});return{P:P,r:r}},
  cuadro:function(x,e,dt){var c=MK.P;for(var k=0;k<e.P.length;k++){var p=e.P[k];p.y-=p.v*dt;p.a+=p.w*dt;p.x+=Math.sin(p.a)*4*dt;if(p.y<-10){p.y=1090;p.x=e.r()*1920}
      var al=.18+.32*(.5+.5*Math.sin(p.a*1.7));x.globalAlpha=al;x.fillStyle=p.m?c.claro2:c.claro;x.beginPath();x.arc(p.x,p.y,p.s,0,6.2832);x.fill();
      if(p.s>2){x.globalAlpha=al*.25;x.beginPath();x.arc(p.x,p.y,p.s*4,0,6.2832);x.fill()}}x.globalAlpha=1}
});
/* cada lámina enciende una estrella más y las une: al final de la clase se ve el camino recorrido */
Universo.registrar("constelacion",{
  nuevo:function(){var r=MK.rng(21),F=[],C=[];for(var k=0;k<130;k++)F.push({x:r()*1920,y:r()*1080,s:.5+r()*1.4,f:r()*6.28});
    for(var j=0;j<40;j++){var t=j/39;C.push({x:120+t*1680+(r()-.5)*90,y:900-Math.pow(t,1.25)*760+(r()-.5)*120,luz:0})}return{F:F,C:C}},
  cuadro:function(x,e,dt,info){var c=MK.P,n=Math.round(info.avance*(e.C.length-1)),k;
    for(k=0;k<e.F.length;k++){var p=e.F[k];x.globalAlpha=.12+.2*(.5+.5*Math.sin(info.t*.7+p.f));x.fillStyle=c.suave;x.beginPath();x.arc(p.x,p.y,p.s,0,6.2832);x.fill()}
    x.strokeStyle="rgba("+c.rgb+",.35)";x.lineWidth=1.5;x.globalAlpha=1;x.beginPath();
    for(k=0;k<e.C.length;k++){var s=e.C[k];s.luz=MK.ir(s.luz,k<=n?1:0,dt,1.4);if(k>0&&k<=n){x.moveTo(e.C[k-1].x,e.C[k-1].y);x.lineTo(s.x,s.y)}}x.stroke();
    for(k=0;k<e.C.length;k++){var q=e.C[k];if(q.luz>0)MK.bola(x,q.x,q.y,2.6,c.claro,12,.45*q.luz)}x.globalAlpha=1}
});
Universo.registrar("ninguno",{cuadro:function(){}});
