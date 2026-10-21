# Oficio de edición

Lo que separa una edición buena de una correcta. Son criterios de oficio, no recetas: el agente decide con la grabación delante.

## Corte limpio: por significado, no por regla
- Se corta por lo que **dice** la frase, no por lo que parece repetido. Una repetición que es énfasis («es simple, muy simple») se queda; un falso arranque («hoy quiero hablarte de… hoy quiero contarte cómo…») se va, y se conserva **la última** versión completa.
- **Respiración e intención.** Un silencio corto antes de una idea importante es parte del mensaje. Los silencios largos se acortan a un respiro (alrededor de 0.6 s), nunca se eliminan: sin aire el video suena a máquina.
- Se conserva lo que demuestra (una pantalla, un ejemplo), lo que matiza y la función de la llamada a la acción. Si una autocorrección cambia el sentido, gana lo que el dueño quería decir al final.
- Cortes siempre **en el hueco entre palabras** y en el punto de menor energía del audio, con un fundido de 20 ms en cada unión: sin clics, sin sílabas comidas. Si Whisper marca mal una frontera, el ajuste fino de energía la corrige hasta ±70 ms; más que eso es un error de transcripción y se revisa a oído (extrae un fragmento corto).
- Duda real sobre si algo es énfasis o error: se le pregunta al dueño con la frase y su minuto, en una línea.
- Verifica antes de diseñar: lee `corte-limpio.txt` entero. No debe haber duplicados ni frases cortadas, y debe seguir contando la misma historia.

## Ritmo
- Un video hablado se sostiene con **cambios**, no con efectos: un zoom suave de énfasis, un subtítulo en la frase que importa, un corte de pausa. Cada 8 a 12 segundos pasa algo; entre eso, la voz manda.
- Velocidad: 1.0 a 1.15 se oye natural; por encima de 1.25 la voz cansa. Acelera tramos de relleno, nunca la frase clave.
- Tarjeta de frase clave: 2 a 4 por video, 1.2 a 2 s, solo para la idea que debe quedar. Más que eso deja de ser énfasis.
- Alternancia plano medio / acercamiento: el acercamiento se sostiene toda una idea (4 s o más) y vuelve al plano medio; zoom que parpadea cada frase cansa.
- Zoom de énfasis: 1.08 a 1.15, entrada y salida suaves (0.5 s), foco en el rostro o el objeto. Más de 1.2 se siente brusco.

## Pausas
- Tope de pausa: **sobrio ~0.5 s, dinámico ~0.3 s** (se miden en el audio real, no en la transcripción), siempre conservando el respiro: una pausa de 0.3 s todavía se oye como aire; menos suena a máquina. El tope se aplica a pausas entre frases, no dentro de una palabra.

## Subtítulos
- `frases_clave`: una frase corta cada ~9 s, la que el espectador debería recordar (cifras, reglas, el giro). Es el modo sobrio.
- `por_frase`: cada frase en trozos de máximo 7 palabras. Es el modo de ritmo rápido y de redes.
- Tamaño y peso constantes en todo el video (solo cambia el número de líneas), recuadro opaco, siempre fuera de la cara y el cuello. En horizontal el borde inferior queda al 95 %; en vertical, laterales de 8 % o más y fuera del último 14 % (interfaz de las plataformas).
- Legibles antes que bonitos: contraste alto, máximo 2 líneas, nunca encima de la boca. En vertical respeta las zonas seguras: ni el borde inferior (interfaz de la plataforma) ni los costados.
- El estilo sale de la ficha de marca: colores de `paleta` y tipografía de `tipografia.subtitulos`.

## Tres editores, un criterio
- Cada editor trabaja **solo**, sin ver a los otros, con un tratamiento distinto. La diversidad real es lo que le da al dueño algo que comparar; tres variantes de lo mismo no sirven.
- Tratamientos que funcionan como punto de partida: **sobrio** (cortes limpios, casi sin efectos, subtítulos en frases clave), **dinámico** (ritmo apretado, zooms en las frases clave, subtítulos por frase), **editorial** (pausas con intención, un solo zoom por idea, subtítulos en cifras y reglas).
- La ficha de marca y los videos referentes del dueño son la **vara de gusto**: se leen al final, como barra de calidad, nunca como plantilla a copiar.
- Nombres neutros para carpetas y archivos (`video-01`, `v1`): hasta el nombre filtra tema.

## Feedback como ingredientes con dosis
- Cada comentario del dueño es un **ingrediente con dosis**, no una orden que se lleva al extremo. «Más rápido» es 1.08 o 1.15, no 2.0. «Más dinámico» es un zoom más y un corte de pausa, no un video distinto.
- Una corrección va al **mismo editor** que hizo esa versión (ya conoce su `edicion.json`); se guarda como la siguiente revisión y la anterior se conserva. Si dos comentarios chocan, dilo y propón la dosis.
- Lo que valga para siempre (una preferencia que el dueño repite) se agrega a su ficha de marca, no a esta skill.

## Cerrar la pieza
- Cuando el dueño eligió y la ronda de correcciones terminó, ofrece limpiar **solo** los intermedios que el propio pipeline generó (borradores descartados, `.trabajo/`), con la lista a la vista. Nunca borres fuentes, `palabras.json`, `edicion.json`, finales ni nada que no hayas generado, y nunca con comodines recursivos.
- Una exportación no autoriza publicar. Publicar es una orden aparte del dueño.
