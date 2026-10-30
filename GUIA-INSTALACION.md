# Instala Arbrain con un solo mensaje

Arbrain es tu cerebro artificial: tu propio agente, **Levy**, que vive en tu computadora y se abre como cualquier app.
Esta guía es para la persona. Las instrucciones para tu Claude Code están en [`INSTALAR.md`](INSTALAR.md): no
tienes que leerlas, él las sigue solo.

**Lo único que necesitas:** una computadora con macOS, Windows o Linux, internet y tu cuenta de Claude (Pro o Max).
Si no tienes Pro o Max, Levy también puede pensar con OpenRouter (se conecta con un clic dentro de Arbrain).

## Elige dónde vive tu Arbrain

1. **En tu computadora** (si dudas, este): usa tus apps y tu voz; funciona con tu computadora prendida. Son los tres
   pasos de abajo.
2. **Solo en tu servidor (beta):** un servidor tuyo en la nube, prendido siempre; entras desde el navegador de cualquier
   computadora o desde tu teléfono por tu red privada de Tailscale, con tu computadora apagada. Recomendado: Hostinger
   KVM 2 (revisa el precio el día que compres). En Claude Code de tu computadora, con la IP de tu servidor:

   ```text
   Instala Arbrain solo en mi servidor siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
   Mi servidor: root@IP-DE-TU-SERVIDOR
   ```

3. **Los dos (espejo, beta):** la misma memoria y el mismo plan en tu computadora y en tu servidor:

   ```text
   Instala Arbrain en mi computadora y en mi servidor, en modo espejo, siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
   Mi servidor: root@IP-DE-TU-SERVIDOR
   Que mande: mi servidor
   ```

Los caminos 2 y 3 están en beta: funcionan, pero todavía no se prueban en un servidor real. Su paso a paso (rentar
el servidor, Tailscale, tu cuenta de Claude para el chat y tu llave con tope para las rutinas, qué cambia frente a tu
computadora) está en [`INSTALAR-NUBE.md`](INSTALAR-NUBE.md). Arbrain
también te lo muestra en su primer arranque, con «Copiar» en cada prompt.

## Los tres pasos

1. **¿Ya tienes Claude Code?** Si sí, ábrelo. Si no: descarga la app de Claude de
   [claude.ai/download](https://claude.ai/download), ábrela, entra con tu cuenta y pulsa la pestaña **Code**. Eso es
   Claude Code: no necesitas abrir una terminal.
2. **Pega este mensaje** y envíalo:

   ```text
   Instala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md
   ```

3. **Acepta lo que te pida.** Claude Code te pide permiso para correr comandos (si te ofrece «no volver a preguntar»,
   elígelo) y tu computadora puede mostrar su propia ventana de permiso (Windows: «¿Quieres permitir…?»; Mac:
   «Instalar herramientas»). Acéptalas. Si tu navegador se abre para entrar a tu cuenta de Claude, entra y autoriza.

Tarda entre 2 y 15 minutos según tu internet. Claude Code instala lo que falte (Git, Node y Python), comprueba que
Arbrain es el que firmó su autor, baja el programa ya compilado para tu sistema y al final abre la app **Arbrain** con
Levy listo. Solo te hace una pregunta si encuentra una carpeta de trabajo anterior (tu Business OS o la app vieja):
si la copia o la unifica. Si dudas, «copiar» no cambia nada de lo tuyo.

> **Antes de pegar cualquier prompt, revisa de dónde viene.** Un prompt le da órdenes a un agente que puede usar tu
> computadora. Este sale de arbrain.ai y apunta solo a `github.com/arbrain-ai/arbrain`. Si alguien te pasa uno
> parecido con otra dirección, no lo pegues.

## Después de instalar

- **Abrir Arbrain:** Mac, Launchpad o Spotlight («Arbrain»); Windows, el menú Inicio o el acceso del Escritorio; Linux,
  el menú de aplicaciones. Cerrar la ventana no lo apaga, y arranca solo al prender tu computadora.
- **Habla con Levy:** escríbele «buenos días». Te dice en qué vas y baja contigo tu mes, tu semana y tu día.
- **Tu expediente** (si eres del programa Cerebro Artificial): en arbrain.ai › tu perfil › «Conectar mi cerebro»
  generas tu token y lo pegas **tú** en Arbrain › Ajustes › Privacidad › «Conectar con arbrain.ai». Nunca en el chat.
- **Dictar por voz:** Arbrain › Ajustes › Voz, con una llave gratis de [console.groq.com/keys](https://console.groq.com/keys).
- **Tu respaldo:** al terminar, Claude Code te ofrece guardar tu Arbrain en un repositorio privado de tu GitHub.

## Actualizar

Pega el mismo mensaje de instalación, o abre Claude Code en tu carpeta `Arbrain` y dile **«actualiza mi Arbrain»**.
Comprueba la firma de la versión nueva, guarda lo tuyo en una rama de respaldo, te cuenta en cinco líneas qué trae y
reinicia Arbrain y su app. Solo te pregunta algo si un archivo que tú editaste choca con uno del autor.

## Desinstalar o empezar desde cero

Pega `Desinstala Arbrain siguiendo https://github.com/arbrain-ai/arbrain/blob/main/INSTALAR.md`. No borra nada: mueve
Arbrain, tus conversaciones, tu contraseña, tus llaves y la app a la carpeta `Arbrain-respaldos` de tu carpeta personal.
Node, Python, Git y Claude Code se quedan. Para volver a instalarlo, pega el mensaje de instalación.

## Problemas comunes

| Lo que ves | Qué hacer |
|---|---|
| Claude Code dice que no puede abrir la página de `INSTALAR.md` o la resume | Pídele: «léelo literal con `curl -fsSL https://raw.githubusercontent.com/arbrain-ai/arbrain/main/INSTALAR.md`» |
| Te pide escribir comandos en una terminal | No hace falta: dile «corre tú los comandos, sigue INSTALAR.md» |
| Mac: se abrió una ventana de Apple para instalar herramientas | Pulsa **Instalar** y espera (5 a 15 minutos); Claude Code sigue solo |
| Windows: «¿Quieres permitir que esta aplicación haga cambios?» | Es el instalador de Git o de Python: acepta |
| Dice que la copia «no está firmada por Arbrain» | Detente y avísalo en el grupo con el texto exacto. No instales por otro camino |
| En Arbrain, Levy dice que no está conectado a un modelo | Ajustes › Llaves › **Iniciar sesión con Claude** (Pro o Max) o **Conectar con OpenRouter** |
| La app no abre | Pídele a Claude Code «abre Arbrain»; si tampoco, «ábrelo en el navegador» |
| Algo más | Copia el mensaje exacto del error y pégalo en el grupo del programa |

## Dónde viven tus cosas

- **Tu cerebro** (memoria, plan, skills): la carpeta `Arbrain` de tu carpeta personal. Es tuya, en tu propia rama.
- **Tus conversaciones, lienzos, contraseña y llaves:** Mac `~/Library/Application Support/ai.arbrain.servidor/`;
  Windows `%APPDATA%\ai.arbrain.servidor\`; Linux `~/.local/share/ai.arbrain.servidor/`. Las llaves viven en un
  archivo privado que tus agentes no pueden leer.
- **Registros** (si soporte te los pide): la carpeta `logs/` dentro de la anterior.

## Privacidad en cinco líneas

1. Tu cerebro, tus conversaciones y tus archivos viven en tu computadora; nadie más tiene acceso.
2. Lo que le escribes a Levy viaja solo al modelo que tú elegiste: tu Claude Code con tu cuenta, u OpenRouter con tu
   llave.
3. Arbrain nunca pide, ve ni guarda las credenciales de tu cuenta de Claude: el inicio de sesión es el de Anthropic.
4. Arbrain solo escucha dentro de tu computadora (`127.0.0.1`): no abre puertas a internet ni túneles.
5. El monitoreo del programa viene apagado; si lo enciendes, solo salen cifras y lo apagas en **Ajustes › Privacidad**.
