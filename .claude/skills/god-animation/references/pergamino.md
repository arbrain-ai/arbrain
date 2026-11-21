# Pergamino · el documento de scroll que se explica solo

**Una presentación se pasa; un pergamino se desciende.** Una presentación acompaña a alguien que habla. Un pergamino habla
solo: por eso no puede ser una presentación apilada en vertical. Si quien lo lee solo desliza y mira, es un PDF caro. El
pergamino se gana su formato cuando el lector **toca el mecanismo y la ley emerge en sus manos**. Género de referencia:
los explicables interactivos de Bartosz Ciechanowski, los videos de 3Blue1Brown y los gráficos interactivos de los
grandes periódicos.

## Cuál elegir

| Pregunta | Presentación (`presentaciones`) | Pergamino |
|---|---|---|
| ¿Tu dueño va a hablar encima o a grabarlo? | sí | no: el documento se defiende solo |
| ¿La idea se entiende o se siente? | se siente, se afirma | se entiende manipulándola |
| ¿Hay un mecanismo con partes que interactúan? | no necesariamente | sí: es su razón de existir |
| ¿Se vuelve a consultar meses después? | rara vez | sí: es documento, no evento |

Si es puro texto e imagen sin mecanismo, no es pergamino: es un libro o un documento.

## La ley: demuestra, no decora

Los tres tests de [piezas-vivas.md](piezas-vivas.md) (tapa, después, control) aplican a cada mecanismo. Prohibido también
el acordeón disfrazado: si el clic solo intercambia párrafos ya escritos, es un `<details>` con maquillaje; o se vuelve
mecanismo real, o se convierte en prosa honesta. **El mejor mecanismo usa los datos y la historia reales del lector**,
no un ejemplo genérico: «el retraso de cobro de tu negocio» enseña más que «un sistema con retardo».

## La disciplina de la física (la lección más cara)

Si un mecanismo simula algo, **la simulación se calibra aparte, sin interfaz, antes de tocar el HTML.** No a ojo:
escribir el modelo y «que se vea que oscila» produce mentiras bonitas.
1. Escribe el modelo en un script suelto (Node o Python), sin UI.
2. Barre el espacio de parámetros e imprime una tabla (por ejemplo retardo × ganancia → amplitud).
3. Exige que la tabla muestre la ley **graduada**: el control debe enseñar. Si todo da 0 o salta de un extremo al otro,
   no sirve como instrumento aunque sea «correcto».
4. Recién entonces al HTML, con los números verificados en un comentario.

Trampas típicas, invisibles desde la interfaz:
- **El punto fijo mata la dinámica:** el modelo converge antes de que el efecto actúe. Necesita una perturbación
  permanente o condiciones asimétricas.
- **Los topes duros saltan de extremo a extremo:** con límites duros el control deja de graduar. Pon un límite de
  velocidad a la corrección y la respuesta crece de forma pareja.
- **La métrica equivocada esconde el costo:** si dos partes oscilan en contrafase, el total no cambia; el costo real está
  en otra medida.

**Cero constantes mágicas.** Si necesitas multiplicar por 0.62 para que dé la lección que querías, la lección no está en
el modelo: está en tu deseo. Modela el mecanismo de verdad y publica lo que salga; si el modelo te refuta, cambia la
tesis, no el modelo. Casi siempre la lección verdadera resulta mejor.

## Anatomía

```
portada (pantalla completa: plantea la idea con un mecanismo, una pregunta o un contraste)
acto I  (separador con número)
  escena
    texto       → etiqueta · título · entrada · prosa en columna de ~68 caracteres
    figura      → imagen + pie
    mecanismo   → cabecera (etiqueta + pista) · lienzo (SVG o canvas) · controles · pie que cambia
    tu caso     → el aterrizaje al caso real del lector
  escena…
cierre (fuente y fecha)
```

- **Actos** de 3 a 5 escenas: dan respiración y arco.
- **El pie del mecanismo cambia con su estado:** ahí vive la lección, reescrita según lo que el lector acaba de hacer.
  Sin esto, el mecanismo es un juguete.
- **«Tu caso» termina en algo operable**, no en absolución: «no fue tu culpa» es masaje; «la próxima vez que veas X, la
  acción es Y» es un mapa.
- Una barra de progreso fina arriba y un índice de puntos a la derecha (en pantallas anchas) orientan sin estorbar.

## Reglas duras

1. **En el teléfono el mecanismo no se encoge, se desliza.** Un dibujo de 900 de ancho en 375 px deja el texto
   ilegible. Deja que el lienzo se desplace en horizontal (`overflow-x: auto` y un ancho mínimo) y avisa en la pista
   «desliza el lienzo». La página nunca desborda en horizontal; solo el lienzo.
2. **Un solo archivo, cero dependencias:** sin CDN, sin frameworks, sin compilar. `index.html` más una carpeta de
   imágenes. Debe abrir con doble clic dentro de diez años. Fuentes del sistema: cero latencia.
3. **Reusa imágenes antes de generar** y optimízalas (unos 1400 px, JPEG de calidad 80).
4. **Tema oscuro y claro** con los colores de tu dueño: copia sus valores de `mi-marca/tema.css` dentro del HTML (no lo
   enlaces: el archivo tiene que abrir solo), y los dibujos leen el color del tema al pintarse.

## Se juzga por lo que hace

Un mapa que solo se contempla es un museo. Si el pergamino diagnostica algo, cierra con una sección de **lo que está
roto**, con el estado real, y cada punto termina en **dueño y siguiente paso**. Si describe datos vivos, **fecha
visible**: es una foto, no un feed.

## Datos

- Todo número sale de una fuente consultada en el momento o se rotula como ejemplo congelado con su fecha.
- Nunca mezclar ventanas: «hace 30 días era X» exige el dato de hace 30 días, no un promedio de 30 días.
- Vuelve a verificar justo antes de entregar: un dato correcto en la mañana puede ser falso una hora después.
- Los hechos históricos también se verifican.

**Revisión adversarial antes de entregar,** cuatro lentes en paralelo (vale cada centavo): fidelidad a la fuente,
honestidad de los datos, código y «¿hace lo que dice?».

## Revisión con navegador (siempre)

Ábrelo en un navegador sin pantalla (Chrome con `--headless`, o el que tenga tu dueño) servido con
`python3 -m http.server`, y comprueba:
- [ ] 0 errores de consola · 0 dibujos vacíos · 0 imágenes rotas · la página no desborda en horizontal
- [ ] cada mecanismo en todos sus estados (cada modo, los extremos de cada control)
- [ ] el texto de los dibujos legible a 375 px de ancho
- [ ] los números verificados hoy
- [ ] «lo que está roto» con dueño y siguiente paso, si aplica

Si un botón «no responde» en la prueba automática, confírmalo disparando el clic por código antes de buscar un error en
tu pieza: a veces es la herramienta, no el código.
