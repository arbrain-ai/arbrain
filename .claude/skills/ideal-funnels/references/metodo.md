# Método de investigación y comparación

## La unidad de análisis es un recorrido

Para cada caso pregunta: quién llega, qué busca, qué ve, qué acción se le pide, qué recibe y qué hace que vuelva o
compre. Documenta las rutas paralelas tal como existen. Una persona puede ir de YouTube al producto de pago, de
Instagram a un recurso o de Google a la comunidad; no fuerces todas por el mismo formulario.

Un expediente por referente (`references/expediente.md`). Divide en más archivos solo cuando mejore la consulta. Un
referente muestra una implementación; no obliga a otros casos a tener sus mismos productos o redes.

## Qué conservar de cada hallazgo

| Campo | Qué permite decidir |
|---|---|
| Fuente primaria y respaldo local | Volver al post, video, página o archivo exacto |
| Fecha de observación y de publicación | Distinguir una versión nueva de una promesa antigua |
| Cobertura | Metadatos, descripción, transcript, pantalla, navegación o entrega real |
| Público y entrada | Para quién funciona esa ruta y desde dónde llega |
| Promesa y prueba | Qué ofrece y qué muestra para sostenerlo |
| Acción y destino | Llamado, enlace final, acceso libre, registro o pago |
| Siguiente paso | Qué se observó después; si no se recorrió, anotarlo |
| Etiqueta | Observado · declarado por el autor · inferencia · propuesta para el dueño · desconocido |
| Límite | Qué conclusión no permite obtener esa evidencia |

Un enlace con UTM permite atribuir; no prueba que el creador concilie ventas. Un kit publicado no demuestra que todos
lo usen. «Sin llamado en los primeros diez minutos» no significa «no vende en el video».

## Búsqueda que mejora una decisión

Empieza por los archivos existentes y sus revisiones. Abre las fuentes primarias para resolver la incertidumbre
concreta: precio vigente, destino de un enlace, contenido de un recurso, secuencia real. No amplíes el inventario si
no cambia la decisión.

- **Video:** fechas, duración y descripción (`intel`, `corpus.py bajar`, las guarda). Transcripts cuando el argumento
  dependa del habla. Declara cuántos se leyeron completos y cuántos solo tienen metadatos. No rellenes huecos con lo
  que sugiere el título. Los capítulos describen lo que el canal anuncia, no una inspección del bloque.
- **Correo y comunidades:** separa «mensaje recibido en una cuenta» de «secuencia universal». Tokens, direcciones y
  enlaces privados se quedan en la evidencia protegida (`evidencia/`, fuera de lo que se comparte); el expediente usa
  el mecanismo y enlaces públicos. Una base de miembros ajena nunca se exporta ni se trata como audiencia del dueño.
- **Censos:** para contar enlaces de descripciones o llamados en el habla a lo largo del tiempo, usa
  `scripts/censo.py` sobre el corpus del referente (`references/canales.md`).

## De observaciones a patrones

Una comparación útil enfrenta el mismo problema, no estéticas parecidas: cómo entregan el recurso, cómo conectan
contenido con registro, cómo muestran prueba, qué recibe el que paga y qué trabajo exige la entrega.

- **Patrón dentro de un caso:** repetido en varias piezas del mismo autor, con muestra declarada.
- **Patrón entre casos:** aparece en dos o más referentes con evidencia propia. Anota las diferencias que cambian su
  función.
- **Hipótesis de efecto:** por qué podría ayudar a registro, activación, retorno, compra o menos soporte. La evidencia
  descriptiva sola no confirma el efecto.
- **Contraejemplo:** una ruta que logra lo mismo de otra forma. Evita convertir «X hace esto» en «todos debemos».

No promedies tasas con denominadores distintos ni ventanas incompatibles. Si un autor pone el llamado temprano y otro
al final, puede haber diferencias de formato, intención o madurez de audiencia; no inventes un minuto universal.

## De patrón a acción para el dueño

Lee su decisión vigente (`references/nuestro-embudo.md`) y responde con una acción cuyo resultado se pueda observar:

> **Propuesta:** acción concreta. **Base:** fuentes y casos. **Encaje:** activo o preferencia real del dueño.
> **Entrega:** qué existe al terminar. **Señal:** evento observable, cohorte y ventana. **Reconsiderar si:** dato que
> debilitaría la hipótesis. **Estado:** propuesta · adoptada · en prueba · con resultado.

Prioriza por relación con su objetivo actual, evidencia disponible y trabajo para probarla. No fabriques un ranking
decimal de impacto ni objetivos de registros o ventas fingiendo que vienen del competidor.

Consumo de recursos y preguntas dan pistas de necesidades. **Encaje producto-mercado exige además uso persistente y,
en una oferta pagada, disposición real a pagar.** Un chat curioso no es demanda comercial.

## Actualizaciones y representación

Una captura nueva se agrega con su fecha; no convierte la anterior en mentira. Si una afirmación resulta incorrecta,
corrígela en el expediente y en las comparaciones que dependían de ella, con procedencia. Los crudos se preservan.

Si el dueño pide verlo (HTML, lienzo, lámina): representa rutas, ofertas, mecanismos, incertidumbres y acciones desde
estos mismos archivos, con cada afirmación importante enlazada a su evidencia. La vista lleva fecha y no sustituye al
expediente; nunca debe hacer parecer observado un recorrido que solo se infirió.
