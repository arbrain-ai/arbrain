/* «alinear»: 120 trazos con rumbo propio (paso 0) se alinean (paso 1) y avanzan juntos con estela (paso 2). */
Enactivos.registrar("alinear",{w:1920,h:1080,
  nuevo:function(){var r=MK.rng(11),P=[];for(var k=0;k<120;k++)P.push({x:200+r()*1520,y:330+r()*440,a:r()*6.283,v:30+r()*30,f:r()*6.283});return{P:P,giro:0,rumbo:-.22}},
  cuadro:function(x,e,dt,paso,t){var c=MK.P;e.giro=MK.ir(e.giro,paso>=1?1:0,dt,.9);
    for(var k=0;k<e.P.length;k++){var p=e.P[k];
      if(paso===0)p.a+=Math.sin(t*1.3+p.f)*dt*2.4;else{var d=Math.atan2(Math.sin(e.rumbo-p.a),Math.cos(e.rumbo-p.a));p.a+=d*Math.min(1,dt*2.4)}
      var v=paso>=2?p.v*2.4:p.v;p.x+=Math.cos(p.a)*v*dt;p.y+=Math.sin(p.a)*v*dt;
      if(p.x<190)p.x=1730;if(p.x>1730)p.x=190;if(p.y<320)p.y=780;if(p.y>780)p.y=320;
      var L=paso>=2?30:16;x.globalAlpha=.5+.5*e.giro;x.strokeStyle=paso>=1?c.acento:c.tenue;x.lineWidth=2.4;x.lineCap="round";x.beginPath();x.moveTo(p.x-Math.cos(p.a)*L,p.y-Math.sin(p.a)*L);x.lineTo(p.x,p.y);x.stroke();
      x.globalAlpha=1;MK.bola(x,p.x,p.y,2.8,paso>=1?c.claro:c.suave,paso>=1?10:0)}}
});
