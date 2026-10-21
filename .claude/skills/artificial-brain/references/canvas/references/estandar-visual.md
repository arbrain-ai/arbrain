# Estándar visual de Arbrain (gramática de mapas sobre fondo titanio)

Este es el diseño default del lienzo. Aplica siempre, y en especial cuando el dueño diga:

- «usa nuestro diseño», «el default», «el estilo de la casa»
- «estilo Miro», «como un mapa de consultor»
- «biblia visual», «hazlo con nuestro lenguaje visual»

La intención no es hacer un póster bonito. Es convertir estrategia, procesos y evidencia real en un mapa operable,
navegable y memorable.

Regla madre: **robar la gramática, no la paleta.** De los buenos mapas tipo Miro se toma cómo organizan (bordes que
significan, cajas simples, anotaciones al margen), no sus colores.

## Cómo se aplica en el lienzo de Arbrain

El compilador del lienzo ya trae esta gramática: cuando declaras un nodo con `role`, él pone el borde, el relleno,
la tipografía y el tamaño que este estándar pide. Tu trabajo es elegir bien los roles, escribir títulos cortos,
mandar las descripciones a `caption`, declarar las aristas con su clase y leer el juez. Las medidas de abajo
sirven para tres cosas: entender por qué el compilador decide lo que decide, revisar el resultado con ojo
crítico, y retocar a mano lo que el compilador no cubre (lockup, leyenda, anotaciones sueltas).

| Gramática | Rol o clase en el spec |
|---|---|
| Formulario / input (sólido morado) | `form` |
| Módulo / contenido (dashed grueso) | `module` |
| Agente / IA (punteado) | `agent`; arista `agente` |
| Llamada humana numerada (mostaza) | `callout` con `index` |
| Entregable / artefacto (card clara con sombra) | `deliverable` |
| Disparador | `trigger` |
| Riesgo / guardarraíl | `risk` |
| Pieza neutra | `card` |
| Loop, dependencia frágil o hueco | aristas `fragil` y `hueco` |

## Principio madre

El mapa debe funcionar en tres niveles:

1. **Desde lejos:** se entiende la arquitectura completa.
2. **A media distancia:** se ven fases, territorios, loops y decisiones.
3. **De cerca:** aparecen procedimientos, contenido, responsables, disparadores, métricas y notas.

Si un mapa solo se entiende de cerca, falla. Si solo se ve bonito de lejos, falla.

## 0. Construir para el 100%

**El zoom 100% es el tamaño default de la experiencia.** La hoja completa debe verse casi entera a 100% en una
laptop, y el texto se lee acercando a 200-300%. Objetivos:

- Ajustar a todo ≈ 60-70%.
- 100% = vista general completa (el «póster»).
- 200-300% = zoom de lectura, texto nítido.

En el compilador esto se controla con `targetAspect` (pantalla ≈ 1.6, lámina ≈ 1.3) y separando temas en regiones,
no escalando a mano. **Nunca le pidas al dueño que escale a mano con selección múltiple:** el escalado de la UI no
escala letra y trazos de forma pareja y rompe proporciones. Si hay que reescalar, es trabajo del agente y por la
API.

## 1. La hoja

Cada concepto vive en UNA hoja autocontenida:

- Fondo titanio casi negro, borde apenas visible, esquinas redondeadas. Todo lo demás vive encima y dentro.
- Margen interno generoso. Nada toca el borde.
- Un mapa = un póster. No mezclar dos sistemas en una hoja (excepción controlada en §17).

## 2. Paleta de restricción (el secreto de que se vea hermoso)

**~90% del mapa es neutro + UN color estructural (mostaza `#ff9101`).** El color es raro, por eso significa. Prohibido
el arcoíris de bordes vivos por card.

| Token | Valor | Uso |
|---|---|---|
| SHEET | `rgba(10,11,16,0.97)` | hoja |
| TRAY | fill `rgba(255,255,255,0.035)` stroke `rgba(255,255,255,0.06)` | bandeja de fase o sección |
| CARD | fill `rgba(18,19,27,0.88)` | todas las cards |
| SOLID_STROKE | `rgba(255,255,255,0.35)` | sólido neutro |
| DASH_STROKE | `rgba(255,255,255,0.32)` dashed | módulo / contenido |
| DOT_STROKE | punteado | agente / IA |
| CALL | fill `rgba(255,145,1,0.13)` stroke `rgba(255,145,1,0.8)` | llamada |
| DELIV | fill `rgba(255,255,255,0.94)` (texto `#18181b`) con sombra | entregable / artefacto |
| RISK | fill `rgba(36,12,16,0.55)` stroke `rgba(185,28,28,0.7)` | guardarraíles / riesgo |
| Texto | HI `rgba(248,250,252,0.96)` / MED `0.72` / LOW `0.58` | jerarquía de 3 niveles |
| Conector | `rgba(255,255,255,0.55)` / loops dashed `0.32` | flechas |

Acentos funcionales SOLO en microsímbolos: verde `#34d399` = ok o responsable externo, rojo = riesgo. Nunca como
borde de una card normal.

**Morado de marca** como SEGUNDA familia funcional: formularios e inputs llevan borde `rgba(139,92,246,0.85)` con
fill `rgba(139,92,246,0.08)`. Presencia de marca sutil sin romper la restricción: sigue siendo color = significado.

En tema `claro` el compilador traduce la misma gramática a fondo claro: mismos roles, misma mostaza y mismo morado.

## 3. Gramática de bordes (la leyenda)

El ESTILO del borde codifica el TIPO de nodo (funciona hasta en blanco y negro):

- **sólido morado** = formulario / input
- **dashed blanco grueso** = módulo / contenido
- **punteado** = agente / skill / IA
- **fill mostaza + borde mostaza grueso** = llamada (humana, numerada)
- **card clara con sombra** = entregable / artefacto
- **bandeja sutil** = fase / territorio

**Bordes gruesos.** Dashed y llamadas más gruesos que todo lo demás; sólidos y entregables un poco menos; chips y
bandejas finos. Que se note, sin verse pesado.

**Cards simples: el recuadro SOLO lleva el título.** Toda descripción, contenido, condición o detalle va FUERA del
recuadro:

- Contenido de un módulo: lista `→ lección` junto a la caja, sin cruzarse con la línea de flujo.
- Descripción de formulario, llamada o entregable: itálica chica y tenue, centrada DEBAJO de la caja
  (en el spec: `caption`).
- Criterios secundarios de un disparador: debajo; adentro solo el criterio principal corto y un chip.
- Así todas las cajas quedan estandarizadas y el mapa respira. **Caja con párrafo adentro = antipatrón.**

**Leyenda obligatoria** arriba a la derecha de todo mapa: una mini figura de cada tipo usado y su etiqueta. Sin
leyenda, la gramática no se decodifica.

## 4. Lockup de título (firma, repetir siempre)

1. Insignia circular arriba al centro (círculo con borde mostaza y las iniciales del sistema).
2. Eyebrow: `NOMBRE DEL NEGOCIO · ÁREA` en mayúsculas, peso 800, mostaza, centrado.
3. Título: serif muy negra y grande, blanco, centrado.
4. **Barra de marcador:** rectángulo mostaza semitransparente detrás del tercio inferior del título, del ancho
   aproximado del texto.
5. Subtítulo en itálica, tono medio: la promesa en una línea.
6. Línea de datos en mostaza: datos duros (precio, plazas, fechas).

## 5. Tipografía (3 voces y una capa de anotación)

| Voz | Fuente del lienzo | Uso |
|---|---|---|
| Títulos y coordenadas | Serif negra (`CanvasSlab`) | hoja, fase, sección |
| Operativa | Sans (`CanvasSans`) 600-800 | títulos de card, cuerpo, chips |
| **Anotación** | Sans en itálica, tono bajo | márgenes, paréntesis, notas al pie, estado emocional |
| Manuscrita | `CanvasHand` | nota humana puntual |
| Código | `CanvasMono` | fragmentos técnicos |

La capa itálica es la voz del mentor al margen: estados del cliente, condiciones, notas `(...)`, plantillas
`PLANTILLA · ...` al pie de los módulos. Sin ella el mapa se siente plano.

**Letra grande relativa a la caja, caja angosta que abraza el título.** Sin aire muerto alrededor del título. Los
mapas premium se ven premium porque el texto llena sus componentes; cajas anchas con letra chica bajan la calidad
percibida. Si dudas del tamaño, sube un punto.

## 6. Microsímbolos (el detalle que da vida)

- **Círculo numerado:** borde mostaza y número en serif mostaza, en la esquina superior izquierda de cada llamada
  (secuencia 1, 2, 3...). En el spec: `callout` con `index`.
- **Chip de responsable** DENTRO de la card: `DUEÑO` en mostaza, `EQUIPO` o externo en verde, `AGENTES` en el
  color de agente. En el spec: `chips`.
- **Chip de progreso o momento:** verde tenue («100%», «DÍA 7»).
- **Chip de evidencia:** texto mostaza `📸 CASO #N · ...` bajo el entregable.
- **Chip de días** en el riel: «DÍA X-Y».
- **Notas al pie:** `(...)` en itálica tenue; asterisco si refiere a otra pieza.
- Emoji escaso e intencional (📸 ↺ ★ ◆ ▸). Nunca decorativo.

## 7. Bandejas anidadas (jerarquía por contraste de fondo)

hoja → **bandeja** por fase o sección → cards → chips y listas. La bandeja agrupa una fase completa; el ojo entiende
pertenencia sin leer. No uses marcos de color para esto: la bandeja sutil ES el territorio. En el lienzo, cada
territorio puede ser su propia `regionId`.

## 8. El riel de fase (a la izquierda de cada bandeja)

```
◆  F2                       <- diamante mostaza + código en serif grande
Instalación del sistema     <- nombre, peso 800
[DÍA 22-45]                 <- chip de días
CLÍMAX: dejo de ser         <- 2 líneas en itálica tenue:
el cuello de botella           el ESTADO EMOCIONAL del cliente en esa fase
```

La capa emocional del riel vende la transformación, no solo el proceso. El bloque del riel va **centrado
verticalmente en su banda**, con el código a la altura del eje de flujo.

## 9. Flujo dentro de cada banda (patrón serpentina)

Columnas fijas y repetidas por banda: riel · módulo · formulario · llamada · disparador · entregable · anotaciones.
Formulario, llamada, disparador y entregable centrados en un mismo eje horizontal; el módulo, anclado arriba.

- El módulo lista su contenido real (`→ lección` por línea). Densidad de valor.
- Card de disparador: encabezado `DISPARADOR PARA AVANZAR ✓` en mostaza + criterios.
- Conectores dentro de la banda: rectos, blancos, con flecha.
- Entre bandas: la serpentina baja del entregable al corredor entre bandas y entra al módulo siguiente (§10).

## 10. Conectores

- **Rectas = secuencia. Codos = serpentina o bifurcación. Dashed = loop o retroalimentación.** En el spec:
  `flujo` para la secuencia, `fragil` o `hueco` para lo que no está probado.
- Las rutas largas no cruzan el mapa en diagonal: van por corredores libres, con codos. Si el compilador marca
  `cruce` o `cruce-texto`, cambia `targetAspect`, `layout.direction` o parte el tema en regiones.
- Etiqueta de flecha larga: texto corto en itálica (`▸ disparador`) sobre el tramo horizontal.
- Loops de retroalimentación: dashed tenue, ruteados por los márgenes, con etiqueta `↺ ...`.

## 11. El envoltorio comercial (el mapa muestra el NEGOCIO, no solo la entrega)

- **Entrada** (fila bajo el lockup): INVITACIÓN (dashed) → PAGO (sólido) → CONTRATO + FORMULARIO → ESPACIO →
  ONBOARDING (estilo llamada). Conectados.
- **Salida** (última banda): RESULTADO → bifurcación con codos a `MENOS de la meta` (dashed, loop de regreso) y
  `MÁS de la meta` (estilo llamada) → entregable final.
- **Máquina de productización:** bandeja propia con flujo BLOQUEO → chips dashed (Módulo / SOP / Prompt / Skill)
  → BIBLIOTECA (card clara) + loop dashed de regreso al inicio.
- **Cinta de la estrella polar:** franja mostaza tenue a todo lo ancho con `★ ESTRELLA POLAR ·` en serif y un
  subtítulo en itálica.
- **Guardarraíles** (card de riesgo) y **garantía** (card normal, título mostaza) al pie.
- Pie de marca: `●  NOMBRE DEL NEGOCIO  ●` en mostaza tenue, centrado.

## 12. Patrones canónicos (la geometría es significado)

1. **Serpentina:** recorridos y programas por fases (el default de un blueprint).
2. **Escalera:** escaleras de valor; la posición vertical es el valor y cada escalón repite el motivo.
3. **Espejo bilateral:** comparaciones; dos columnas idénticas que convergen.
4. **Paleta + hoja de trabajo:** ejercicios guiados; biblioteca de chips a la izquierda y plantilla con zonas
   vacías a la derecha (el cliente llena SU lienzo).
5. Hoja de ruta vertical · 6. Volante o loop · 7. Doble embudo o reloj de arena · 8. Matriz de fases ·
   9. Tira de evidencia (capturas con etiqueta y flecha).

## 13. Reglas de composición

- Alinear por columnas y filas; repetir tamaños exactos (el ritmo ES la belleza).
- Espacio negativo generoso; corredores libres para las flechas (no cruzar cards).
- Lo macro primero, el detalle después. El texto largo va en anotación, no en el nodo.
- Las cards compuestas (caja + textos + chips) se mueven como unidad.
- Cada bandeja responde: qué entra, qué pasa, qué sale, cómo se mide, quién opera.
- Capturas solo como evidencia, de tamaño contenido, con etiqueta y flecha.

## 14. Antipatrones

- Borde vivo de color distinto en cada card (arcoíris: nada destaca).
- Flechas largas en diagonal cruzando el mapa.
- Texto grande en cajas chicas; cards altas con el texto arriba y aire muerto abajo.
- Chips o responsables flotando FUERA de su card.
- Un diagrama frío y genérico cuando el dueño pidió un mapa con la gramática de la casa.
- Sin leyenda, sin capa itálica, sin responsables, sin números = mapa plano.
- Crear una página nueva cuando el dueño estaba trabajando en una existente.
- Mandar coordenadas, tamaños o colores en el spec.

## 15. QA visual (generar → verificar → validar)

1. Míralo como lo verá el dueño: `mostrar {vista: 'lienzo', paginaId}` del MCP `cabina`, o la exportación a
   imagen desde la sección Lienzo. No confíes solo en el JSON.
2. Revisa de cerca: lockup, una banda, la última banda, los loops, el pie.
3. Verifica: conectores visibles, textos sin cortar, chips adentro, alturas pegadas al contenido, etiquetas
   legibles, corredores limpios.
4. Itera hasta que pase el listón: ¿se lee de lejos, a media distancia y de cerca? ¿la paleta está restringida?
   ¿el flujo tiene dirección?

## 16. Validación geométrica antes de entregar (obligatoria)

El QA visual llega tarde si la geometría nació rota. El juez del compilador (`judge` en cada respuesta) detecta
solapamientos, desbordes, cruces, contraste y legibilidad **antes** de que el dueño vea nada:

1. Cada `fail` se corrige antes de entregar: ajusta el spec y recompila hasta CERO.
2. Los `warn` se revisan; si no los corriges, dilo.
3. Después, el QA visual de §15.

Si armas una pieza a mano fuera del compilador (lockup, leyenda, una nota), aplica el mismo principio: ningún
elemento de una unidad lógica puede solaparse con otra unidad lógica.

## 17. Patrón «mapa maestro de varios territorios»

Para mapas de TODO el negocio (excepción controlada a «un mapa = un póster»):

- **Bandejas apiladas a todo lo ancho** por territorio grande (por ejemplo: Contenido / Oferta de entrada /
  Servicio premium / Motor), cada una con su riel (◆ + nombre en serif + estado emocional en itálica). En el
  lienzo: una `regionId` por territorio.
- Subflujos DENTRO de cada bandeja como filas de nodos, con su etiqueta en serif chica a la izquierda.
- **Reloj de arena** entre dos territorios cuando uno madura hacia el otro (triángulos de baja opacidad, cintura
  mostaza, flecha dashed de maduración).
- **Documentos como card-artefacto:** un one-pager u oferta puede ir como card clara grande CON texto interno
  (excepción a cards-solo-título: es un documento, no un nodo), con barra mostaza arriba y secciones con etiquetas
  naranjas.
- **Franjas de notas en itálica** al pie de un territorio: título en peso 800 + columnas de etiqueta naranja y nota
  tenue.
- Las flechas grandes entre territorios van por corredores, con codos (§10). Nunca en diagonal.

## 18. Legibilidad de lejos

**(a) Cards a la medida del texto.** El recuadro no es un contenedor con relleno generoso: es el texto con el
relleno mínimo indispensable. Alto ≈ altura de la letra más un relleno vertical corto; ancho = texto exacto más un
relleno horizontal corto. Letra grande en cards operativas; jerarquía clara entre centros, cards y subetiquetas.
**QA de legibilidad = alejarse a ~40%:** si el título de una card no se lee ahí, la letra es chica o la caja tiene
aire muerto. Corregir antes de entregar.

**(b) Horarios y metadatos temporales van FUERA de la card.** Una hora, una fecha, la última corrida o una versión
no son parte del título: van como texto chico y tenue, pegado abajo a la derecha, justo fuera del borde inferior.
El título adentro manda.

**(c) Agentes con nombre propio en el color de agente, distinguibles de la automatización genérica.** Cuando un
nodo representa una identidad de IA que el dueño percibe como «alguien» (Levy u otro agente con nombre), usa el
rol `agent` y dale su propia entrada en la leyenda («Agente IA»), separada de «Rutina automatizada».
