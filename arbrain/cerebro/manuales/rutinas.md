# Rutinas: lo que Levy hace solo, a la hora que digas

Una rutina es un encargo que Levy repite sin que se lo pidas cada vez: «cada mañana a las 7 resúmeme mi día», «cada
lunes revisa mis metas de la semana», «cada hora mira si llegó algo importante». Esta guía es para ti, Levy, y para el
dueño.

> **Privacidad:** las rutinas viven en la base local de la app Arbrain, en esta computadora. Lo que hace cada una lo
> decide su texto; corre con las mismas reglas y frenos que el chat. No sale nada a ningún servidor de Arbrain.

## Dónde se ven

En la app: panel derecho › **Taller › Rutinas**. Ahí el dueño ve cada rutina (qué hace, cuándo corre en palabras, la
próxima vez, la última y cómo le fue), la crea con un formulario de dos preguntas, la pausa, la reanuda, la prueba
(«Probar ahora») o la borra.

Dos condiciones para que corran (dilas una vez, cuando creen la primera):

1. **La computadora encendida** a esa hora. Si estaba apagada, la rutina corre una vez en cuanto Arbrain vuelva a
   arrancar.
2. **Con qué paga el modelo.** Si el chat corre con la suscripción de Claude (Pro o Max), las rutinas no corren solas:
   la suscripción es para uso directo. Hace falta una llave (Ajustes › Llaves). La pestaña lo avisa arriba cuando aplica.

## Cuando el dueño te pide una rutina

1. **Escribe el encargo completo.** La rutina corre sin esta conversación: nada de «lo de arriba» o «como te dije».
   Di qué leer, qué hacer y dónde dejar el resultado. Si debe quedar algo para leer después, que lo escriba en un
   archivo de su cerebro (por ejemplo `reportes/AAAA-MM-DD-resumen-del-dia.md`). El último resultado también se ve en
   la pestaña.
2. **Traduce el «cuándo» a cron** (minuto hora día mes día-de-la-semana; 0 = domingo). Lo más seguido es cada 15 min.

   | Él dice | Cron |
   |---|---|
   | cada día a las 7 | `0 7 * * *` |
   | de lunes a viernes a las 18:30 | `30 18 * * 1-5` |
   | cada lunes a las 9 | `0 9 * * 1` |
   | cada hora | `0 * * * *` |
   | el día 1 de cada mes a las 8 | `0 8 1 * *` |

3. **Dile en una frase qué hará y cuándo**, y créala (el cuerpo va en JSON; el heredoc evita líos de comillas):

   ```bash
   curl -s -X POST "http://127.0.0.1:$MC_SERVER_PORT/schedule" \
     -H "Authorization: Bearer $ARBRAIN_PASE_AGENTE" -H "Content-Type: application/json" \
     --data-binary @- <<'JSON'
   {"prompt": "Lee mi calendario de hoy y mis pendientes y escríbeme en reportes/ un resumen de 5 líneas con lo más importante.", "schedule": "0 7 * * *"}
   JSON
   ```

   Según su modo de permisos, la app puede pedirle un clic para ese comando. No imprimas el pase.
4. **Nace en pausa.** Lo que tú creas no corre hasta que el dueño lo revisa: dile «Ábrela en Taller › Rutinas y pulsa
   **Activar**». Tú no puedes activarla, pausarla, correrla ni borrarla: eso lo hace él desde la app.
5. **No inventes otros programadores** (crontab, launchd, el Programador de tareas de Windows). Las rutinas viven aquí.
   Para algo que solo toca esta conversación («recuérdame en 30 minutos»), usa `despertador`.

## Verificación

Lista las rutinas y confirma que la nueva está ahí, con su horario:

```bash
curl -s "http://127.0.0.1:$MC_SERVER_PORT/schedule" -H "Authorization: Bearer $ARBRAIN_PASE_AGENTE"
```

Cada tarea trae `prompt`, `schedule`, `status` (`paused` hasta que la active), `next_run` y, después de correr,
`last_run` y `last_result`. Si `aviso` no viene vacío, díselo tal cual: es por qué no correría ahora. Cuéntale al dueño
el resultado en palabras, no el JSON.

## Si falla

| Respuesta | Qué significa | Qué hacer |
|---|---|---|
| 400 con un error | El texto o el horario no valen (vacío, más de 2000 caracteres, cron inválido o más seguido que cada 15 min) | Corrige y vuelve a intentar; el error dice qué |
| 409 | Ya hay 30 rutinas | Que el dueño borre alguna en la pestaña |
| 401 o 403 | Falta el pase o esa acción es solo de la app | Usa `$ARBRAIN_PASE_AGENTE`; activar, pausar o borrar lo hace él en la pestaña |
| No conecta | No estás dentro de la app Arbrain (por ejemplo, Claude Code en esta carpeta) | Las rutinas viven en la app: que la abra y te lo pida desde su chat, o que la cree él en Taller › Rutinas |
| La rutina «falló» | La pestaña muestra «Qué pasó» | Léelo con él; si es la suscripción, ve a Ajustes › Llaves |
