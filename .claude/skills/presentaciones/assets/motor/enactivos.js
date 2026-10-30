/* Enactivos del deck. Uno por concepto: el dibujo ES la idea, no la decora.
   Contrato: Enactivos.registrar(nombre,{w,h,nuevo,cuadro}). cuadro(ctx,estado,dt,paso,t) dibuja un cuadro en w×h.
   El paso llega del motor: cada clic cambia el estado del sistema, no solo la opacidad.
   Lee colores del tema para que el enactivo cambie con tu marca. Semilla fija: mismo dibujo cada vez. */
window.Enactivos=window.Enactivos||{_reg:{},registrar:function(n,m){this._reg[n]=m}};
(function(){
"use strict";
function color(v,def){var c=getComputedStyle(document.documentElement).getPropertyValue(v).trim();return c||def}
function azar(s){return function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* «alinear»: 120 flechas con rumbo propio (paso 0) se alinean (paso 1) y avanzan juntas dejando estela (paso 2). */
Enactivos.registrar("alinear",{w:940,h:760,
  nuevo:function(){var r=azar(11),P=[];for(var k=0;k<120;k++)P.push({x:60+r()*820,y:60+r()*640,a:r()*6.283,v:30+r()*30,f:r()*6.283});return{P:P,rumbo:-0.35}},
  cuadro:function(x,e,dt,paso,t){var ac=color("--acento","#f2a03d"),tinta=color("--tinta","#eee"),lin=color("--linea","rgba(255,255,255,.15)");
    x.strokeStyle=lin;x.lineWidth=1;x.strokeRect(.5,.5,939,759);
    var meta=e.rumbo,ten=paso>=1?Math.min(1,dt*2.2):0;
    for(var k=0;k<e.P.length;k++){var p=e.P[k];
      if(paso===0){p.a+=Math.sin(t*1.3+p.f)*dt*2.4}
      else{var d=Math.atan2(Math.sin(meta-p.a),Math.cos(meta-p.a));p.a+=d*ten}
      var v=paso>=2?p.v*2.2:p.v;p.x+=Math.cos(p.a)*v*dt;p.y+=Math.sin(p.a)*v*dt;
      if(p.x<20)p.x=920;if(p.x>920)p.x=20;if(p.y<20)p.y=740;if(p.y>740)p.y=20;
      var al=paso>=1?1:.55;x.globalAlpha=al;x.strokeStyle=paso>=1?ac:tinta;x.lineWidth=2.2;
      var L=paso>=2?26:14;x.beginPath();x.moveTo(p.x-Math.cos(p.a)*L,p.y-Math.sin(p.a)*L);x.lineTo(p.x,p.y);x.stroke();
      x.beginPath();x.arc(p.x,p.y,2.6,0,6.283);x.fillStyle=x.strokeStyle;x.fill()}
    x.globalAlpha=1;
    if(paso>=2){x.save();x.translate(470,380);x.rotate(meta);x.strokeStyle=ac;x.globalAlpha=.9;x.lineWidth=6;
      x.beginPath();x.moveTo(-200,0);x.lineTo(200,0);x.moveTo(170,-26);x.lineTo(205,0);x.lineTo(170,26);x.stroke();x.restore();x.globalAlpha=1}}
});
})();
