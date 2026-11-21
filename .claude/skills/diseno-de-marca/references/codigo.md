# Código en pantalla, con su marca

Cuando aparece código en una lámina, un video o una página, también es marca. Se deriva de `guia.md` una vez y se anota
en su sección 9 para no reinventarlo cada vez.

## La tabla (derivada de su paleta)

La palabra que manda (la palabra clave del lenguaje) lleva su color protagonista; lo demás se calma alrededor. Ejemplo
con la paleta ficticia de `nucleo.md` (cobre y verde bosque sobre tinta):

| Pieza del código | Color | Estilo |
|---|---|---|
| Palabra clave | su principal (`#C8743A`) | semi negrita |
| Texto entre comillas | un verde o el tono frío de su paleta | normal |
| Comentario | blanco al 32 % | itálica |
| Función | una luz de su principal (más clara) | normal |
| Número | un azul claro o su secundario aclarado | normal |
| Puntuación | blanco al 75 % | normal |
| Cursor que parpadea | su principal | dos veces por segundo |

Si su principal es verde o rojo, cambia el color de los textos entre comillas para no confundir con estado.

## El contenedor

- Fondo: un degradado sutil del fondo oscuro de su paleta (dos tonos casi iguales), no negro plano.
- Barra superior estilo ventana con el nombre del archivo; la parte importante del nombre en su principal.
- Letra monoespaciada del sistema (SF Mono, Menlo, Consolas o su equivalente), grande para que se lea compartido en
  pantalla, con renglones aireados (1.5) y sin cortar líneas a la mitad de una palabra.

## Cuándo es mejor HTML que imagen

Terminales, bloques de código, tablas de precios y listas de especificaciones van en HTML, no generados como imagen:
salen exactos, se corrigen sin regenerar, no tienen errores de letras y se pueden animar (el cursor, una línea que se
escribe sola). Para animarlo, `code-animation` o el dibujo de una lámina de `presentaciones`.
