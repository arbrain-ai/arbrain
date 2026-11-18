# Modo coche: habla con tu Arbrain sin tocar el micrófono

> **Para la persona.** El modo coche es un Orbe que te escucha, manda lo que dices al chat y te contesta en voz alta.
> Sirve para manejar con el celular en el soporte o para trabajar en la computadora mientras ves el chat. Lo que
> escribes en el chat sigue igual: es un complemento.
>
> **Qué necesitas**
> - Arbrain **v0.2.28 o más nuevo** en tu computadora (y, si quieres usarlo en el celular, «Tu cerebro en el teléfono»:
>   `TELEFONO.md`).
> - Tu llave de **Groq** (gratis), para que te escuche: **Ajustes › Voz › Llave de Groq**.
> - Opcional: tu llave de **LemonFox** (de pago, por uso), para una voz más humana: **Ajustes › Voz › Llave de
>   LemonFox**. Sin ella, contesta con la mejor voz en español de tu aparato.
>
> Cada quien usa sus propias llaves; nada sale de tu Arbrain hacia otra persona.
>
> **Instalarlo.** Abre Claude Code en tu carpeta de Arbrain (`~/Arbrain`) y pega:
>
> ```text
> Agrega el modo coche a mi Arbrain siguiendo https://github.com/danielsantacolomavalencia-lang/arbrain/blob/modo-coche/MODO-COCHE.md
> ```
>
> (Si el autor lo incluye en Arbrain, te llega solo con la siguiente actualización y no necesitas pegar nada.)
>
> **Encenderlo.** En el chat, junto al micrófono, aparece un botón redondo con un orbe chiquito. Tócalo:
> 1. Se abre el Orbe **en pausa**. Tócalo para que te escuche (suena un tilín).
> 2. Habla con calma. A los **3 segundos de silencio** se manda solo (una barrita se llena mientras callas). También
>    puedes terminar con «cambio», «dale», «terminé» o «te toca» para mandarlo al instante.
> 3. Mientras tu agente trabaja dice «Procesando · N s». Al terminar, su respuesta **suena dentro del Orbe** con
>    subtítulos, y el Orbe vuelve a escucharte solo.
> 4. Para pausar: di «terminamos», «pausa» o «paremos», o toca el Orbe. Para salir: la **✕**.
>
> Tocar el Orbe mientras habla lo calla y te escucha; mientras trabaja, te escucha para agregarle algo (va a la fila
> del chat, no lo frena). Una tos o un ruido no se mandan.
>
> **En la computadora** también hay **mini**: el botón de arriba a la izquierda (o Esc) lo vuelve un orbe flotante que
> arrastras y agrandas desde la esquina, para ver el chat mientras hablas. Se pausa solo si pasan 2 minutos sin oírte o
> si empiezas a escribir.
>
> **Tus colores.** El botón de la paleta (abajo a la derecha, o en los controles del mini) cambia los colores del Orbe:
> Grafito y oro, Esmeralda y lila, Violeta y rosa. Se recuerda en ese navegador. Para poner los tuyos, en la consola del
> navegador:
> `localStorage.setItem('arbrain-orbe-colores', JSON.stringify({ principal: '#10B981', acento: '#F59E0B' })); localStorage.setItem('arbrain-orbe-paleta', 'propia')`
>
> **En el celular (iPhone o iPad).** Usa tu Arbrain desde la pantalla de inicio, con la app al frente: iOS no deja
> escuchar ni hablar con el celular bloqueado o en otra app. La pantalla se queda encendida sola mientras el Orbe está
> abierto. La primera vez, el iPhone pide el micrófono: toca **Permitir** (Safari › aA › Configuración del sitio web ›
> Micrófono › Permitir, para que no vuelva a preguntar).
>
> **Esconder el botón:** en la consola del navegador, `localStorage.setItem('arbrain-modo-coche', 'no')`.
>
> **Con Claude Code y SFlow.** Si además quieres que Claude Code te hable en tu Mac (modo voz y modo demo), instala
> SFlow con voz: https://github.com/danielsantacolomavalencia-lang/sflow-voz. Es aparte: el modo coche de Arbrain no lo
> necesita.

## Problemas conocidos

- **Respuestas de voz muy largas en el iPhone** (más o menos un minuto seguido): en pruebas reales la pantalla se apagó
  o la página se recargó un par de veces. Si te pasa, vuelve a abrir el Orbe: la respuesta completa queda escrita en el
  chat. Pídele a tu agente respuestas cortas cuando vas manejando.
- **Conversaciones muy largas en el celular:** tras muchas vueltas seguidas el Orbe puede dejar de escuchar. Ciérralo
  con la ✕ y vuelve a abrirlo.
- **«Terminamos» en una frase larga:** se reconoce cuando va al final y suelto («…y eso es todo. Terminamos.»). Si va
  pegado a otras palabras («terminamos con lo del proyecto») se toma como mensaje, a propósito.
- Lo que agregas mientras tu agente trabaja entra a la fila del chat sin la nota del modo coche: esa respuesta puede
  salir más larga o con formato (igual se lee en voz, sin tablas ni código).

---

## Para Claude

Eres el guía de la persona para agregar el modo coche a su Arbrain. Explícale en una línea cada paso antes de hacerlo y
no toques nada fuera de `~/Arbrain`.

1. **Revisa la casa.** En `~/Arbrain`: `git status` debe estar limpio (si no, pregúntale qué hacer con esos cambios;
   nunca los descartes). `cat VERSION` debe decir 0.2.28 o más; si es menor, primero actualiza Arbrain con
   `Instala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md` y vuelve aquí.
2. **¿Ya lo trae?** Si existe `arbrain/src/features/modo-coche/ModoCoche.tsx`, el autor ya lo incluyó: salta al paso 5.
3. **Trae el modo coche** (sin cambiar de rama):
   ```bash
   cd ~/Arbrain
   git fetch https://github.com/danielsantacolomavalencia-lang/arbrain.git modo-coche
   git cherry-pick $(git merge-base HEAD FETCH_HEAD)..FETCH_HEAD
   ```
   Si choca algún archivo, aborta con `git cherry-pick --abort` y díselo a la persona: su Arbrain tiene cambios propios
   en el chat y conviene esperar a que el autor lo incluya.
4. **Comprueba:** `cd arbrain && npm test -- tests/modo-coche/modo-coche.test.ts` (todas en verde).
5. **Reinicia Arbrain** para que la app se vuelva a compilar: pídele a la persona que cierre la app Arbrain y la vuelva
   a abrir (si corre como servidor: `npm run servidor -- detener` y `npm run servidor` en `~/Arbrain/arbrain`).
6. **Llaves:** pregúntale si ya puso su llave de Groq en **Ajustes › Voz** (sin ella no la escucha) y si quiere la de
   LemonFox (opcional). Nunca le pidas que te pegue una llave en el chat: van en Ajustes, que las guarda en el llavero.
7. **Termina** con la sección «Encenderlo» de arriba en tus palabras, corta.
