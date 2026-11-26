# El paquete de publicación: descripción, capítulos y enlaces

Un video no se entrega con el paquete vacío. Antes de que el dueño suba nada, en `publicacion/` del proyecto tiene que
haber: título elegido, miniatura elegida, descripción con capítulos del **corte final**, etiquetas y la lista de
abajo revisada. La grabación y el export viven en `edicion-de-video`; esto es lo que acompaña al video.

## La descripción, en este orden

```
1. REFERENCIAS      el regalo primero (si lo hay), luego las fuentes reales
                    formato: título descriptivo en una línea + la URL en la siguiente
2. CAPÍTULOS        minutos del corte FINAL, nunca del material crudo
3. EL ENLACE PROPIO una sola línea, al final, que dice dónde está algo, sin pedir nada
4. #etiquetas       4 a 6, para que lo encuentren
```

Reglas:

- **Sin párrafo de relleno.** Fuera el párrafo que anuncia de qué trata el video y fuera el teaser («y al final te
  cuento algo incómodo»). Lo que no ayuda a encontrar el video o a usar sus recursos, sobra.
- **Vender sin vender.** Nada de «GRATIS», flechas o «únete ya»: la gente ya los huele. El regalo se lista como un
  recurso más, descrito por lo que es. El enlace propio, en pasiva: «Las plantillas de este video están en
  <destino>».
- **Cada enlace se verifica en vivo antes de escribirlo** (`curl -sS -o /dev/null -w "%{http_code}" <url>`, o
  abrirlo). Nunca se inventa ni se completa una URL de memoria.
- La versión que el dueño edite manda: si corrige la descripción, se guarda la suya y se anota qué cambió
  (`aprender.md`).

## Capítulos: de 5 a 7, nunca 12

Un capítulo existe para que alguien **salte** ahí, no para narrar el video. Doce líneas se leen como índice de clase;
seis se leen como promesas. Uno por función:

| Función | Ejemplo |
|---|---|
| `00:00` el gancho (obligatorio) | Lo que reemplacé en mi negocio |
| El regalo | Cómo usar la plantilla |
| La promesa del título y los nombres que se buscan | Las 3 herramientas que uso |
| Lo contraintuitivo | Lo que NO funcionó |
| La tesis del video | Por qué esto cambia tu forma de vender |
| El gancho para quien ya te sigue | Lo que viene |

Se cortan primero el detalle técnico interno y los capítulos numerados («parte 2»): nadie salta a «parte 2». Si el
título del capítulo no funciona solo, fuera. Los minutos salen de la transcripción del **final exportado** (la que
deja `edicion-de-video`), nunca del crudo.

## El regalo del video

Si el video promete un recurso (plantilla, archivo, prompt, mini app), el recurso vive en **el lugar de regalos del
dueño** (`canal.md` › Dónde viven los regalos), no en un enlace suelto aunque funcione. Quien llega por el regalo ve
los otros recursos y el destino principal; quien llega a un archivo suelto lo baja y se va.

- El recurso tiene que existir y abrirse **antes** de grabar la mención (`ESTRUCTURA.md` lo revisa).
- Publicar el recurso en su sitio también es publicar: con su orden.

## Etiquetas y título final

Etiquetas: los nombres propios del video (herramientas, método), el tema en las palabras del avatar y 1 o 2 amplias.
El título final se revisa contra el corte: si el video cambió en la edición, el título y la miniatura se validan otra
vez contra lo que de verdad quedó.

## La lista antes de publicar

- [ ] El final exportado es la versión que el dueño eligió (nombre y fecha).
- [ ] Título, miniatura y descripción elegidos por él, no solo propuestos.
- [ ] La frase de la miniatura existe en la transcripción del final.
- [ ] Capítulos del final, de 5 a 7, el primero en `00:00`.
- [ ] Cada enlace verificado hoy con su código de respuesta.
- [ ] El regalo vive en su lugar de regalos y abre.
- [ ] Cero cifras sin fuente, cero clientes sin permiso, cero datos privados en pantalla (correos, llaves, notificaciones;
      `edicion-de-video` › verificación).
- [ ] El vertical, si lo hay, tiene su propio título y su descripción corta.

## Publicar

Publicar es **una orden aparte** del dueño, en ese mensaje, sobre ese video. Exportar o elegir no lo autoriza.

- Si el dueño sube a mano: dale el paquete en un solo lugar (`publicacion/`) y ábrelo en el visor.
- Si tiene una herramienta para subir (la API de YouTube con su propia autorización, u otra) y te pide subirlo:
  sube como **privado o programado** salvo que él diga público, y después **verifica en la plataforma** (por la API o
  abriendo la página) que el título, la miniatura, la descripción y la visibilidad quedaron. El «listo» de un
  programa de subida no es evidencia.
- Registra en `publicacion/publicado.md`: enlace, fecha, título, miniatura y visibilidad. Lo que pase después va a
  `aprender.md`.
