# Recoger evidencia por superficie

Cómo mirar cada superficie de un referente sin confundir lo visto con lo que pasa después. Todo va a
`contenido/intel/embudos/<slug>/evidencia/` con fecha en el nombre, y cada hallazgo a `fuentes.md` con su ID.

## YouTube: descripciones, llamados y su evolución

1. Baja el canal con la skill `intel` (guarda descripción y metadatos, y el habla si hay subtítulos):
   ```bash
   python3 .claude/skills/intel/scripts/corpus.py bajar "https://www.youtube.com/@canal/videos" \
     --corpus contenido/intel/<slug>/youtube --idioma en --desde 20250101
   ```
2. Cuenta qué enlaza y qué pide, mes a mes:
   ```bash
   python3 .claude/skills/ideal-funnels/scripts/censo.py contenido/intel/<slug>/youtube \
     --llamado "comunidad=skool|community" --llamado "regalo=free (guide|template)|link in the description" \
     --salida contenido/intel/embudos/<slug>/evidencia/censo-<fecha>.md
   ```
   Da, por mes: videos, dominios enlazados en la descripción y, por llamado, en cuántos videos aparece y en qué punto
   del video sale por primera vez (porcentaje de su duración). Los patrones son expresiones regulares; ármalos con
   las palabras que usa ese referente.
3. Lee completos los transcripts que importen (los que más rinden, los que cambian de llamado).

**Límites del censo:** cuenta menciones en el habla (subtítulos) y enlaces en la descripción **tal como estaba el día
que se bajó**; no ve tarjetas en pantalla, comentarios fijados ni ediciones anteriores. Subtítulos automáticos fallan
con nombres propios: revisa una muestra antes de confiar en un conteo.

## Páginas: landing, about, checkout

- Abre cada destino con el navegador que el dueño tenga conectado, en una ventana propia. Guarda el texto y una
  captura con fecha. Sigue los redireccionamientos hasta el destino final y anótalo.
- Precio: tal como se ve, con moneda, forma de cobro y fecha. Una oferta visible no es precio realizado.
- **No envíes formularios, no compres, no te registres con los datos del dueño** sin su «va». Si hace falta ver lo que
  hay detrás de un registro, pídeselo en una línea con lo que se ganaría.

## Comunidades (Skool, Discord, Circle…)

- Lo público: about, precio, número de miembros que muestra (declaración, con fecha), calendario visible, reglas.
- Si el dueño ya es miembro y te pide mirar adentro: bienvenida, estructura de cursos, cadencia de eventos, cómo se
  responde a las preguntas. Se documenta el **mecanismo**; nombres, mensajes y datos de miembros no salen de
  `evidencia/` ni se usan para nada más.

## Instagram, X, LinkedIn, TikTok

Texto, portada, llamado («comenta X») y enlace del perfil, con fecha. Ver un llamado por palabra no prueba que la
respuesta automática funcione: para saberlo hay que pedirlo, y eso es escribirle a alguien (espera el «va» del dueño).
Una muestra puntual no es la secuencia de distribución del mes.

## Correo

Solo correos que el dueño recibió en su propia cuenta y te pide revisar. Es lo que llegó a **una** cuenta, no la
secuencia universal. Tokens, enlaces personales y direcciones se quedan en `evidencia/`; el expediente usa asunto,
fecha, mecanismo y enlaces públicos. Proveedor de envío o de cobro: solo si se ve en el correo o el checkout.

## Lo que nunca

- Calcular ingresos de miembros × precio, conversión desde tamaños de grupos u horas de trabajo desde fechas de
  publicación.
- Exportar un juicio sobre un competidor a otro.
- Tratar un anuncio de ingresos como facturación: es una declaración observada.
