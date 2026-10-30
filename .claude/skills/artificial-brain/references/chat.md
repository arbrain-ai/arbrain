# El chat de Arbrain (durable, por conversación): cómo funciona y cómo se opera

> Aquí va lo que gobierna la operación del chat en tu instalación. El detalle vive en el código
> del daemon (`arbrain/server/src/chat-runtime/`) y de la web (`arbrain/src/features/chat/`).

## Identidad y durabilidad

- Una conversación es: tú (la identidad local «Tú», dueña de la instalación) + la cuenta del
  motor (tu Claude, con API key o con sesión) + el id de la conversación. El servidor resuelve
  la cuenta; el navegador nunca decide qué motor corre.
- Cada turno nace con su `turnId` en la app ANTES de tocar la red. El daemon lo acepta en un
  journal SQLite (`<datos>/daemon/store/`), lo ejecuta con supervisión y guarda los eventos con
  cursor. Al terminar, entrega el resultado a la base local de la web.
- **Un stream caído no mata el trabajo.** La app se reengancha al turno vivo (foto actual + lo
  que falta) y muestra «Sin conexión» o «Reconectando» como estado de la CONEXIÓN, separado de lo
  que está haciendo el agente. Si cerraste la app a media respuesta, recarga la conversación.
- Entregas a una conversación borrada se abandonan; el resultado queda en el journal.

## Sin llave no hay turno

Si no hay llave de Claude, el daemon no lanza el agente: el chat responde «Falta tu llave de
Claude. Abre Arbrain › Ajustes › Llaves e inicia sesión con Claude o pega tu API key de
Anthropic.» Los despertadores que venzan sin llave terminan con el mismo mensaje.

## Modelo, esfuerzo y comandos

- La selección efectiva (modelo, esfuerzo y modos) es POR CONVERSACIÓN. La app la congela al
  tocar Enviar y el daemon la revalida; si cambió en medio, el borrador pide confirmación en vez
  de mandar con otro modelo.
- Comandos locales (responden al instante, sin gastar un turno de modelo): `/status` (controles
  de esta conversación, contexto del último turno y cuota cuando el proveedor la expone),
  `/skills`, `/mcp`, `/memory`, `/usage`. Comandos de control: `/model`, `/effort`, `/fast`.
- `/status` no inventa: si el SDK no expone la cuota, lo dice. Nada de estimaciones globales.

## La superficie

- Preguntas del modelo (cuando Levy necesita que elijas) llegan como tarjeta; al responder, el
  turno se reanuda.
- Imágenes y archivos adjuntos van por el daemon; el modelo los ve y la ruta reaparece en el
  historial.
- Editar un mensaje crea una rama: el historial anterior se conserva con una nota de
  continuación.
- **Confirmaciones del freno:** si Levy intenta enviar, borrar, pagar o publicar, aparece
  «Permitir esta acción». Solo tu clic la aprueba; vence si nadie responde.

## Diagnóstico rápido

| Síntoma | Causa probable | Verificar |
|---|---|---|
| «Falta tu llave» | Sin llave o recién cambiada | Ajustes › Llaves; tras guardar, esperar el reinicio del daemon |
| Se queda en «Reconectando» | El daemon se reinició o cayó | `<datos>/logs/daemon.log`; la app lo relanza sola hasta 5 veces en 5 min |
| La respuesta no aparece en otra ventana | La base local no tiene tiempo real | Recargar |
| El modelo no es el que elegiste | Cambió la selección entre el toque y el envío | `/status` en esa conversación |
| Una acción quedó «negada» | Confirmación vencida o rechazada | Volver a pedirla y aprobarla a tiempo |

## Cambios al chat

Si modificas el código del chat en tu copia, valida con los tests de la web y del daemon antes de
reconstruir la app; los turnos en vuelo durante un reinicio quedan marcados como inciertos en el
journal y la app lo muestra.
