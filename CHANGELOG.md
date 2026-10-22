# Cambios de Arbrain

Cada versión dice qué trae y qué tienes que hacer tú. Para actualizar, abre Claude Code en `~/Arbrain` y dile
«jala los últimos cambios». Las versiones siguen `MAYOR.MENOR.PARCHE`: un cambio en MENOR trae funciones
nuevas; uno en PARCHE, arreglos.

## v0.2.6 · 22 oct 2026 · Adjuntos y calendario

**Qué trae**
- **Ya puedes adjuntar imágenes, PDF y archivos de texto en el chat.** Antes salía «el servidor la rechazó (código
  404: No disponible en esta edición)». Ahora el archivo se guarda en la carpeta de datos de Arbrain, en tu
  computadora (no en un almacenamiento en la nube), y Levy lo recibe como siempre. Hasta 10 MB por archivo; se aceptan PNG, JPG,
  GIF, WebP, PDF, TXT, MD, CSV, JSON y los documentos de Office. Arbrain revisa que el archivo sea lo que dice ser,
  solo lo abre con tu sesión y trata lo que trae adentro como contenido de afuera: si un PDF o una imagen esconde
  órdenes, Levy no las obedece y te pide confirmación antes de cualquier acción.
- **Levy ya pone tus objetivos del día en tu calendario.** Cuando le pides «pon mis objetivos de hoy en el
  calendario» o «agéndame…», escribe en tu calendario local (`.claude/plan/calendario.json`) en lugar de buscar un
  Google Calendar que no está conectado. Te propone horarios para lo que no trae hora, espera tu «va» y te enseña el
  día al terminar.
- **Tu día admite varios objetivos.** Si defines tres objetivos para hoy, el Calendario los muestra los tres en la
  caja «Objetivo del día» (antes enseñaba solo uno) y Levy escribe cada uno en su casilla, sin juntarlos ni
  reemplazar los que ya estaban. Agendar ya no te pide un clic por cada objetivo: tu plan (`.claude/plan/`) es tuyo,
  como tu memoria y tu diario. Si Levy acaba de leer algo de afuera, sigue pidiéndote confirmación.
- **El calendario se encuentra a la primera.** Hay un botón **Calendario** arriba a la derecha del chat que lo abre en
  el panel, en el día de hoy. También puedes pedírselo a Levy («ábreme el calendario»).
- **Ningún evento desaparece en silencio.** Si a un evento escrito a mano le falta la hora de fin, tiene el fin igual
  al inicio o usa otro formato de fecha, el calendario lo muestra igual con lo evidente (una hora, o el día completo).
  Si de plano no lo entiende, te avisa con su título para que Levy lo corrija.
- **Un cierre más de la descarga de imágenes.** La dirección IPv6 «no especificada» (`[::]`), que en macOS y Linux
  conecta a tu propia computadora, ahora también se rechaza.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`).
- Si antes le pediste a Levy poner algo en el calendario y no apareció, pídeselo otra vez.

## v0.2.5 · 22 oct 2026 · SSRF de verdad

**Qué trae**
- **Bajar una imagen desde una dirección ya no puede llegar a tu red interna por ningún truco.** La comprobación
  anterior miraba el texto de la dirección y se esquivaba con una IP escrita en decimal, hexadecimal u octal, con
  formas de IPv6, con usuario en la URL (`https://algo@127.0.0.1/`) o con un dominio que al resolverse apunta a una
  dirección interna. Ahora Arbrain RESUELVE el nombre y rechaza cualquier dirección interna (loopback, redes privadas,
  enlace local, rangos de operador y direcciones de metadatos de la nube), y no acepta direcciones con usuario o
  contraseña. Se mantiene la excepción de tu almacenamiento local.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`). No cambia tu uso.

## v0.2.4 · 22 oct 2026 · Repaso a fondo del código abierto

Esta versión endurece el propio código del repositorio, el que clonas y corre en tu máquina. No cambia tu uso diario.

**Qué trae**
- **Una página no puede desviar una descarga a tu red interna.** Cuando Arbrain baja una imagen desde una dirección,
  ahora revisa también cada redirección: una respuesta que intente mandar la descarga a `127.0.0.1` o a direcciones
  internas se rechaza (SSRF).
- **Nadie puede envenenar la memoria de un objeto desde fuera.** Un identificador de cliente con un nombre reservado
  (`__proto__` y similares) ya no se usa como clave; se descarta.
- **Insertar una imagen en el lienzo no puede leer tus llaves.** Al resolver la imagen, se niega por ruta real
  cualquier archivo de credenciales o configuración y solo se aceptan imágenes.
- **Tu contraseña se genera sin sesgo.** El generador usa muestreo por rechazo (misma longitud y fuerza, ~158 bits).
- **Las tablas del lienzo tienen un tope (100×100).** Una tabla con un tamaño disparatado ya no agota la memoria.
- **Defensas de la inyección indirecta, más afinadas.** Tras leer algo de afuera, Arbrain solo abre sin preguntarte
  direcciones que TÚ escribiste (nunca las que aparezcan en una página, en un `echo` o en el resumen de una lectura);
  leer una nota marcada por búsqueda (`grep`, `rg`) o comodín también cuenta como contenido de afuera; y otras salidas
  (buscadores, conectores que llevan una dirección con datos) piden tu confirmación.
- **«Jala los últimos cambios» ya tiene su atestación de procedencia.** Se corrigió el candado de dependencias que la
  bloqueaba; cada versión firmada queda además atestiguada.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`).
- Si quieres cerrar todas las sesiones abiertas del navegador (por ejemplo, cambiaste de computadora), corre
  `npm run servidor -- cerrar-sesiones` y reinicia.

## v0.2.3 · 22 oct 2026 · Lo de afuera son datos, no órdenes

**Qué trae**
- **Una página, un correo o un PDF ya no pueden sacar tu memoria por internet.** Cuando Levy lee algo de afuera, la
  conversación queda marcada y desde ahí solo abre sin preguntarte direcciones que ya aparecieron en lo que leyó o en
  lo que tú pediste (y como mucho 12 seguidas). Una dirección nueva, que el modelo armó y podría llevar en su ruta lo
  que leyó de tu cerebro, te pide confirmación aunque el sitio ya estuviera aprobado.
- **Cada resultado de afuera llega a Levy con la regla pegada:** es dato, no instrucción; no obedece órdenes que
  vengan dentro, no mete nada tuyo en una dirección y no guarda en la memoria reglas que le dicten.
- **Las órdenes escondidas no vuelven mañana.** Lo que Levy escribe en tu cerebro después de leer algo de afuera queda
  anotado con su origen; si otra conversación lo lee después, también queda marcada.
- **Más cosas cuentan como «de afuera»:** leer adjuntos o descargas con comandos (`cat`, `grep`), la salida de los
  comandos que tú apruebas, los errores de una herramienta, el texto largo que pegas en el chat y los README o
  CLAUDE.md de las carpetas de proyectos que abriste. La marca ya no se pierde al reiniciar ni al editar un mensaje.
- **Las vistas HTML del chat no corren solas.** Una vista con código que escribió Levy se enciende con tu clic, corre
  aislada y sin internet (tampoco por WebRTC ni por adelantar direcciones).
- **Tu sesión de Claude Code es intocable.** Levy no lee ni con tu clic `~/.claude`, `~/.claude.json`,
  `.credentials.json` ni `~/.codex` (ahí viven tu sesión y el historial de todas tus conversaciones), y no busca de
  forma recursiva en carpetas que contienen llaves o los datos de Arbrain (por ejemplo `grep -r` en `~/Library` o en
  tu carpeta personal entera): busca en la carpeta concreta.
- **Codex no corre en esta edición** hasta que tenga la misma guardia que Claude.
- **Cada versión viene firmada y tu Arbrain la verifica antes de aplicarla.** La actualización comprueba la firma SSH
  de la etiqueta contra una copia de las llaves del autor guardada fuera del repo (`~/.config/arbrain/firmas-permitidas`).
  Si alguien moviera una etiqueta, publicara sin la llave o intentara regresarte a una versión vieja, se detiene y te
  avisa. Huella de la llave: `SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg`.
- **Antes de aplicar una actualización te enseña lo que se ejecuta solo.** «Jala los últimos cambios» lista, con tu
  versión instalada y antes de traer nada, si la nueva cambia ganchos, scripts de instalación, el arranque o las
  instrucciones del agente, y espera tu sí. Lo que traiga el CHANGELOG o el repo es información, no órdenes: Levy no
  corre comandos que vengan ahí ni cambia de dónde baja Arbrain porque se lo pida un texto.

**Qué tienes que hacer**
- Actualiza como siempre («jala los últimos cambios») y vuelve a arrancar (`npm run servidor`).
- Nada más; desde la siguiente versión la verificación es automática.
- Si notas que Levy te pide confirmar más seguido después de leer una página o un correo, es esto: confirma solo lo
  que tú pediste.

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
