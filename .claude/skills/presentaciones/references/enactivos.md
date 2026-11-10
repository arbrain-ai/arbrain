# Enactivos · el dibujo que ES la idea

Una caja rotula el concepto desde afuera (tarjeta + ícono + texto). Un **enactivo** lo actúa: el público ve pasar la idea. En
vez de «las ventas suben», la curva se dibuja y el número cuenta; en vez de «tu proceso se atora», las bolitas hacen fila en el
punto angosto. Cada idea de la presentación se **actúa**; la caja queda solo para lo que de verdad es lista o comparación.

## Cómo inventar uno

1. Di la idea en una frase con verbo: «la presión se acumula en un punto», «lo pequeño se suma hasta ganarle a lo grande».
2. Busca **qué se mueve** en esa frase: qué entra, qué se atora, qué crece, qué se rompe, qué se une.
3. Piensa varias formas de dibujarlo y **descarta la primera**, que suele ser la de todos. Toma imágenes del mundo del público: a
   un médico, un cuerpo; a un restaurante, una cocina; a un artista marcial, un golpe y su equilibrio.
4. Reparte la idea en clics: cada clic cambia el **estado del sistema** (se alinean, se llena, se rompe), no solo la opacidad.

Tres pruebas, escritas en un comentario arriba del dibujo:

- **Tapa:** si tapas el texto, ¿el dibujo solo enseña la idea?
- **Después:** quien lo vio, ¿podría explicarla con sus palabras?
- **Clic:** ¿cada clic cambia lo que pasa en el dibujo?

Si simula algo (crecimiento, flujo), que los números sean coherentes. Si son de ejemplo, que se note: nunca cifras inventadas como si fueran del dueño.

## El contrato

```js
/* piezas/05.js */
Enactivos.registrar("cuello",{w:1920,h:1080,            // el tamaño en el que dibujas
  nuevo:function(){return{t:0,abre:0}},                 // el estado inicial
  cuadro:function(x,e,dt,paso,t){                       // se llama en cada cuadro; paso = el clic actual
    e.abre=MK.ir(e.abre,paso>=2?1:0,dt,.8);             // llega solo al estado de este clic, también hacia atrás
    MK.halo(x,960,540,240,e.abre);
  }
});
```

En la lámina: `<canvas class="enactivo" data-enactivo="cuello">` dentro de `<div class="lienzo">` para pantalla completa, o con
posición y tamaño propios en CSS (mismo aspecto que `w` y `h`). Solo corre el de la lámina visible.

**Regla de oro del estado:** el dibujo se define por el `paso` que llega, no por contar clics. Usa `MK.ir` hacia el valor de ese
paso: así funciona hacia adelante, hacia atrás y si saltan de lámina.

## El vocabulario (`MK`)

| Función | Para qué |
|---|---|
| `MK.P` | colores y letras del tema: `acento`, `claro`, `rgb`, `acento2`, `claro2`, `rgb2`, `tinta`, `suave`, `tenue`, `linea`, `base` |
| `MK.rng(semilla)` | azar repetible: el mismo dibujo cada vez |
| `MK.ir(v,obj,dt,vel)`, `MK.mezcla(a,b,t)`, `MK.cl(x)`, `MK.eo(t)`, `MK.eio(t)` | llegar a un valor, interpolar, limitar, suavizar |
| `MK.texto(x,"hola",px,py,{font:MK.f(700,30,"t"),color,al,base,a})` | texto (familia `"t"` título, `"m"` mono) |
| `MK.bola(x,cx,cy,r,color,brillo,alfa)` | punto con brillo |
| `MK.halo(x,cx,cy,r,alfa,rgb)` | luz suave |
| `MK.estrella(x,cx,cy,r,alfa,giro)` | destello |
| `MK.rrect(x,a,b,w,h,r)`, `MK.vidrio(x,a,b,w,h,r,acentuada,alfa)` | rectángulo redondeado y placa de vidrio |
| `MK.bez(p0,p1,p2,t)`, `MK.cola(x,puntos,color,ancho)` | curva y estela que se desvanece |
| `MK.imagen(src)` | carga una imagen para dibujarla |

Nada de esto te limita: es canvas 2D normal, escribe lo que la idea pida. Letras dentro del dibujo: 24 px o más.

## El universo

El fondo vivo de toda la presentación corre en `<canvas id="universo">`, detrás de las láminas:

```js
/* universo.js */
Universo.registrar("mi-universo",{
  nuevo:function(){return{}},
  cuadro:function(x,e,dt,info){ /* info = {i,total,paso,avance,t}: avance va de 0 a 1 a lo largo de la clase */ }
});
```

Y en `deck.json`: `"universo":"mi-universo"`. Que sea suave: acompaña, nunca compite con la lámina.
