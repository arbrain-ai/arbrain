# El embudo del dueño: ideal, actual y la siguiente mejora

Tres cosas separadas que no se mezclan: **lo que quiere** (ideal), **lo que hace y está comprobado** (actual) y **la
brecha que se ataca ahora** (comparador). Un referente nuevo puede cambiar una propuesta; no cambia solo lo que el
dueño adoptó.

## Dónde vive cada una

| Qué | Archivo | Quién lo escribe |
|---|---|---|
| **Actual:** pisos, ofertas, etapas, skills, rutinas, número con fuente y cuello | `.claude/memory/project/mi-negocio/embudo.json` (estándar en `arbrain/docs/embudo/README.md`; lo pinta *Tu negocio › El sistema*) | Levy, con evidencia de ejecución y fecha |
| **Ideal:** dirección, líneas editoriales, filtro de ideas, estándares por canal con estado | `.claude/memory/project/mi-negocio/embudo-ideal.md` | Levy propone; el dueño adopta |
| **Comparador:** bitácora de revisiones (fecha, tramo, brecha, acción, señal, resultado) | al final de `embudo-ideal.md`, sección «Bitácora» | Levy |

Si `embudo.json` no existe, ármalo primero siguiendo su README (lee su oferta, sus clientes, sus canales; lo que no
esté, pregúntalo). La primera vez que crees `embudo-ideal.md`, agrega una línea en `.claude/memory/MEMORY-indice.md`
con sus palabras («mi embudo», «mi embudo ideal», «qué mejoro de mi embudo»), siguiendo `memory-manager`.

## `embudo-ideal.md`

```markdown
# Mi embudo ideal

Actualizado: <fecha>. Estado de cada parte: propuesta · adoptada por el dueño (<fecha y sus palabras>).

## Dirección vigente
- Canal principal y para qué (crecer qué, llevar a qué oferta). Avatar: (de su oferta).
- Referentes elegidos por el dueño y qué se toma de cada uno (enlace a su expediente).
- Lo que NO se adoptó por investigar (cadencias, duraciones, minutos de llamado, canales nuevos).

## Líneas editoriales
(dos como máximo para empezar; por cada una: qué es, intensidad de la invitación, qué va primero en la descripción)

## Filtro para una idea candidata
1. ¿Qué pregunta de su cliente responde?
2. ¿Qué prueba, experiencia o lectura propia aporta el dueño?
3. ¿Qué siguiente paso pertinente existe en su catálogo o su comunidad?
4. ¿Qué hay que preparar y comprobar antes de grabar?

## Ficha por pieza
a qué vino → resultado que verá → prueba → acción pedida → entrega al llegar → siguiente pieza si aporta → señal después

## Estándares por canal
(ID · estado · referente y fuente · adaptación · criterio de aceptación · evidencia propia)

## Bitácora
| Fecha | Tramo | Brecha | Acción | Señal y ventana | Resultado |
```

## Estándares: cómo nace y crece uno

Estados: **candidato → adoptado por el dueño → implementado → evaluado** (conservar, ajustar o retirar). Implementado
puede funcionar mal; evaluado no significa ganador. Cada estándar conserva su ID, su fuente, la adaptación concreta y
un criterio de aceptación verificable. Candidatos de base, para adaptar a su caso:

- **B1 · Una construcción, varias piezas.** Un resultado con su prueba, material fuente, requisitos y un recurso
  versionado; de ahí se derivan formatos con apertura propia. Acepta si cada afirmación es rastreable a la prueba y el
  recurso coincide con lo mostrado. No supongas que todo clip sale solo del video largo.
- **B2 · Continuidad de promesa y destino.** La invitación nombra un recurso concreto y el destino lo muestra
  claramente. Acepta solo con el recorrido probado desde el enlace real, con el acceso de quien lo recibe.
- **Video largo · demostración reproducible.** Mostrar el resultado, enseñar el recorrido y ofrecer el material en el
  momento pertinente. Video, recurso y destino cuentan la misma promesa. Sin minutos fijos de llamado ni duración.
- **Video corto · resultado y kit, sistema en uso, mejora con su paso, comparación breve, error y solución.** La
  pieza vertical se compone para el teléfono (texto legible, apertura, audio), no se recorta al centro de un tutorial.
- **Texto (X, LinkedIn, boletín) · idea desarrollada con pruebas.** Se lee completa por sí sola; enlaza al tutorial
  cuando ayuda a profundizar.
- **Comunidad · recurso encontrable y primer uso.** Ficha con resultado esperado, requisitos, instrucciones, versión y
  cómo saber que salió. Acepta con una prueba como destinatario y ayuda localizable.
- **Comunidad · aviso con motivo para volver.** Avisar cuando hay algo útil nuevo, con destino directo y preferencias
  respetadas. Separa envío, entrega, apertura, uso y retorno.

«Comenta X y te lo mando» es una táctica candidata, no una integración lista: verifica el mecanismo y lo que de verdad
recibe la persona antes de usarla. Ver un llamado en un referente no prueba que su automatización funcione.

## El lazo

| Función | Quién y con qué evidencia |
|---|---|
| Referencia | El dueño define dirección y adopta compromisos; `embudo-ideal.md` conserva objetivo y candidatos |
| Sensor | Publicaciones, enlaces, recorridos probados, resultados y datos de origen. Levy los obtiene y verifica; no sustituye datos ausentes por criterio |
| Comparador | Levy contrasta un tramo del actual con el ideal y localiza **una** brecha accionable |
| Actuador | Levy prepara, adapta y corrige artefactos; el dueño graba, decide y da su «va» para publicar, enviar o cambiar la oferta |
| Cierre | Verificar el recorrido que recibe la persona, observar el resultado, actualizar el actual y decidir conservar, ajustar o retirar |

**Prueba de utilidad:** cada revisión produce una corrección concreta o una razón respaldada para mantener el
recorrido. Si solo engorda el expediente sin cambiar decisiones, reduce la revisión al siguiente tramo verificable.

## Comparar sin puntajes inventados

| Deseado | Actual documentado | Brecha y siguiente comprobación |
|---|---|---|
| (del ideal) | (de `embudo.json`, con fecha de la evidencia) | (una acción verificable) |

Cada tramo del actual se fecha por su evidencia; nunca se vuelve actual solo cambiando la cabecera. «No comprobado» no
significa «no existe».

## Señales de un ensayo

| Señal | Qué cuenta y qué no |
|---|---|
| Entrada | Registros únicos atribuibles al origen; desconocido si falta atribución |
| Uso | Una acción verificable o la confirmación explícita de la persona, distinguiendo ambas. Abrir o descargar no es usar |
| Retorno | Vuelve otro día de su ventana para una acción útil definida; refrescar una página no cuenta |
| Esfuerzo | Tiempo extra de adaptación y soporte realmente registrado |
| Efecto comercial | Cobros conciliados con su fuente de pagos y cohortes comparables |

Ventana explícita (por ejemplo siete días completos desde el registro) y cohortes sin ventana completa marcadas como
inmaduras. No sumes espectadores de varias plataformas como personas únicas. El primer ensayo construye la línea base;
no hay umbral de éxito hasta que el dueño firme uno.

## Cómo leer el error y actuar

- **Llegan pero no encuentran:** corregir promesa, destino o navegación y volver a recorrerlo.
- **Encuentran pero no consiguen usar:** revisar requisitos, instrucciones o dificultad antes de meter más tráfico.
- **Usan pero no vuelven:** ver si ese recurso necesita retorno y qué siguiente necesidad existe; uno de uso único no
  fracasa solo por eso.
- **Adaptar cuesta demasiado:** simplificar formato, reutilizar lo probado o reducir variantes antes de subir cadencia.

Con nueva evidencia: fecha → tramo → cambio → razón → siguiente observación, en la bitácora. No hay vigilancia
automática: se revisa cuando el dueño lo pide o al cerrar una pieza en la que se esté trabajando. Si quiere una
revisión periódica, se le propone una rutina (nace en pausa y él la activa).
