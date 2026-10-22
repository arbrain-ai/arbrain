# Cambios de Arbrain

Cada versión dice qué trae y qué tienes que hacer tú. Para actualizar, abre Claude Code en `~/Arbrain` y dile
«jala los últimos cambios». Las versiones siguen `MAYOR.MENOR.PARCHE`: un cambio en MENOR trae funciones
nuevas; uno en PARCHE, arreglos.

## v0.2.2 · 21 oct 2026 · Seguridad del modo servidor

**Qué trae**
- **Otra página de tu máquina ya no puede escribir en tu Arbrain.** En modo servidor, una página abierta en otro
  puerto de `127.0.0.1` (un servidor de desarrollo, Jupyter, un HTML descargado servido con `python -m http.server`)
  podía mandarle mensajes a Levy, crear lienzos o escribir en tu memoria con tu sesión, sin que hicieras clic. Ahora
  toda escritura a `/api/` exige que venga de la misma dirección de Arbrain (`Origin` y `Sec-Fetch-Site`) y responde
  403 si no.
- **Nadie puede dejarte fuera quemando los intentos de contraseña.** La entrada con contraseña rechaza peticiones con
  `Origin: null` (iframes con sandbox o archivos locales) antes de contar el intento.
- **La contraseña ya no viaja en la URL.** En modo servidor, `/api/desktop/sesion?t=…` responde 404: se entra solo con
  el formulario o con el pase de un solo uso, así la contraseña no queda en el historial del navegador.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`). No cambia nada de tu
  uso diario.

## v0.2.1 · 21 oct 2026 · El chat con tu suscripción de Claude

**Qué trae**
- **«Mi Claude Code» en el chat.** Si pagas Claude Pro o Max, el chat de Arbrain corre a través de tu propio Claude
  Code, con la sesión que iniciaste en tu terminal. Sin llaves y sin pagar aparte. Lo eliges en el primer arranque o
  en Ajustes › Llaves («Usar mi Claude Code»); si Arbrain detecta tu sesión, es la opción recomendada.
- **Arbrain no toca tu sesión.** No la pide, no la ve y no la guarda: solo pregunta a tu `claude` si tiene sesión
  (`claude auth status`) y lo lanza tal cual lo publica Anthropic.
- **Sin cobros por API por accidente.** Con este motor, Claude Code no recibe tu `ANTHROPIC_API_KEY` ni tu llave de
  OpenRouter aunque estén en tu sistema o en el llavero, y cada conversación confirma que corre con tu plan antes de
  enviar nada.
- Tus ajustes personales de `~/.claude` (ganchos, permisos) no entran al chat de Arbrain; solo los de tu cerebro.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`).
- Si tienes Pro o Max: abre una terminal, escribe `claude` e inicia sesión con tu cuenta (si no lo has hecho). Luego
  en Arbrain, Ajustes › Llaves › «Usar mi Claude Code».
- Las rutinas automáticas no corren con tu plan (es para tu uso directo). Si las quieres, deja también una llave y
  elige «Usar una llave en su lugar».

## v0.2.0 · 21 oct 2026 · Arbrain por GitHub

La primera versión de Arbrain como repositorio público con el código completo, en lugar de un archivo descargable.
Código abierto con licencia Apache-2.0: lo clonas, lo usas, lo modificas y recibes cada mejora con un prompt.

**Qué trae**
- **Código abierto (Apache-2.0).** `LICENSE` y `NOTICE` en la raíz. El código es tuyo: tu clon y tu capa se quedan
  contigo pase lo que pase.
- **Repositorio en lugar de descargable.** Clonas una vez en `~/Arbrain` y actualizas con «jala los últimos
  cambios».
- **Modo servidor.** `npm run servidor` corre Arbrain desde el código en macOS, Windows y Linux, sin app de
  escritorio: instala, compila, arranca y abre tu navegador con sesión. Probado en la CI de los tres sistemas.
- **Calendario, hábitos y lienzos locales.** Tu calendario (`.claude/plan/calendario.json`) y tus hábitos
  (`.claude/plan/habitos.json`) nacen de la semilla; el primer arranque crea los lienzos «Mi plan» y «Calendario de
  12 semanas».
- **Voz.** Dictado con tu llave gratuita de Groq (Ajustes › Voz) y «Escuchar» con la voz de tu dispositivo.
- **Tu capa separada de la del autor.** Tu memoria, tu plan, tu diario y tus skills propias ya no vienen en el repo:
  nacen de la semilla (`arbrain/cerebro/semilla/`) y viven en tu rama `mi-arbrain`. Las actualizaciones nunca las
  pisan. La lista exacta está en `CAPAS.json`.
- **Todas las mejoras de la plataforma desde la 0.1.x**: calendario, lienzos, chat y paneles con lo construido
  estas semanas.
- **Tu plan de Claude, solo en tu Claude Code.** Arbrain ya no ofrece ni guarda credenciales de tu plan Pro o
  Max: lo usas en TU Claude Code, con tu sesión. El chat de la
  app usa tu propia llave (OpenRouter o API de Anthropic). Así lo piden las condiciones de Anthropic.

**Qué tienes que hacer**
- Si ya tenías la app 0.1.x: pega el prompt de instalación nuevo. Respalda tu cerebro de la app, copia tu memoria a
  `~/Arbrain` y deja intacta la instalación anterior.
- Si es tu primera vez: pega el mismo prompt. Siembra tu capa vacía y te pregunta tus objetivos.
