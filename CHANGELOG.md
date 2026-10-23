# Cambios de Arbrain

Cada versión dice qué trae y qué tienes que hacer tú. Para actualizar, abre Claude Code en `~/Arbrain` y dile
«jala los últimos cambios». Las versiones siguen `MAYOR.MENOR.PARCHE`: un cambio en MENOR trae funciones
nuevas; uno en PARCHE, arreglos.

## v0.2.9 · 23 oct 2026 · Tu Levy te conoce y baja tu meta a tierra

**Qué trae**
- **Tu expediente llega solo a la memoria de tu Levy.** Si conectas tu cerebro con arbrain.ai (Ajustes › Privacidad ›
  «Conectar con arbrain.ai»), Arbrain trae tu expediente al conectar, cada vez que arranca o se actualiza y una vez al
  día, y lo guarda en tu memoria: `user/expediente.md` (tus respuestas, literales) y `project/meta-90-dias.md` (tu meta a
  90 días, tu escalera, tus horas y tu nicho natural). Levy lee tu meta al empezar cada conversación y no te vuelve a
  preguntar lo que ya contestaste. Si editas esos archivos a mano, ya no se reescriben. Solo baja tu expediente; no sube
  nada nuevo.
- **Tu Levy sabe en qué parte de tu camino vas.** Con la misma conexión llega también tu camino en el programa (en qué
  día de 90, semana y etapa vas, tus cinco casillas, tu siguiente paso, el siguiente hito y tu lección) a
  `project/mi-camino.md`: al conectar, al arrancar y cada mañana. Escríbele «buenos días», «¿qué sigo?» o «¿en qué voy?»
  y te dice dónde vas («Día 3 de 90, semana 1: te falta la casilla 4»), tu siguiente paso concreto y te ofrece hacerlo
  con él ahí mismo, como tu ritual o tus tres encargos. Conoce el mapa del programa: las 5 etapas, las 7 lecciones del
  módulo 1, qué significa cada casilla y tus uno a uno. Si arbrain.ai no responde, usa lo último que guardó.
- **Si ya sembraste tu expediente con el prompt «Levy, siembra mi cerebro»,** Arbrain lo adopta solo al arrancar.
- **Nuevo ritual «bajar a tierra».** Escríbele a Levy «buenos días» o «bájame a tierra el mes, la semana o el día»: te
  pregunta lo que falta, una cosa a la vez y con su recomendación, y nunca inventa datos. Primero el mes (tu meta en
  número), luego la semana (de 3 a 5 resultados) y luego el día (tu objetivo y 3 tareas). Lo escribe en tu plan
  (`.claude/plan/objetivos.md`), en tu calendario (el objetivo de hoy con sus 3 casillas en el Día) y en tus lienzos
  «Mi plan» y «Calendario de 12 semanas».
- **Levy recuerda tu industria como tu nicho natural:** cuando hablen de tu oferta o tus clientes, parte de lo que ya
  conoces por dentro.
- **Instalar empieza por lo que ya tienes.** El README y la guía preguntan primero «¿ya tienes Claude Code?» y, si no,
  te mandan a la app de Claude (pestaña **Code**), sin terminal. Ya no piden instalar Git, Node ni Python antes.
- **Actualizar ya no se detiene a preguntarte.** Tu Claude Code revisa lo que cambia, te lo cuenta en una línea y
  sigue; solo se detiene si algo no cuadra con lo que dice la versión. Si tu copia es vieja, el prompt de instalación
  termina la actualización con las instrucciones nuevas (y te deja la app de escritorio), sin otro prompt.
- **Desinstalar o empezar desde cero, sin perder nada.** Pega «Desinstala Arbrain siguiendo …/INSTALAR.md»: guarda tu
  Arbrain, tus conversaciones, tus llaves y la app en `~/Arbrain-respaldos` y apaga todo. Luego el prompt de
  instalación lo deja como nuevo.
- **Reinstalar con Arbrain todavía encendido ya no se queda en la versión vieja:** la instalación nueva apaga la
  anterior y arranca la suya.

**Qué tienes que hacer**
- Actualiza con el prompt de instalación (o «actualiza mi Arbrain»). Si todavía no tienes la app de escritorio, usa
  el prompt de instalación: termina la actualización y te la deja abierta.
- Si eres del programa Cerebro Artificial: en arbrain.ai › tu perfil › «Conectar mi cerebro», genera tu token y pégalo
  tú en Arbrain › Ajustes › Privacidad › «Conectar con arbrain.ai». Nunca lo pegues en el chat.
- Mañana, al abrir Arbrain, escríbele «buenos días» (o «¿qué sigo?» cuando quieras).

## v0.2.8 · 23 oct 2026 · Arbrain como app de escritorio

**Qué trae**
- **Arbrain ya es una app de escritorio.** Se abre desde el Launchpad o Spotlight en Mac, el menú Inicio o el acceso
  del Escritorio en Windows, o el menú de aplicaciones en Linux. Enciende Arbrain sola si estaba apagado y te deja
  adentro con tu sesión, sin contraseña ni navegador.
- **Cerrar la ventana no apaga Arbrain:** Levy y tus recordatorios siguen vivos. Si Arbrain se está actualizando, la
  ventana espera y vuelve a entrar sola cuando termina.
- **La app viene verificada con la misma firma de la versión.** Apple y Microsoft todavía no la conocen (el autor no
  paga aún su certificado), así que el instalador comprueba que es la que firmó el autor y solo a ella le quita el
  aviso del sistema. No la bajes a mano desde la página: instálala con el prompt.
- **Instalar deja la app abierta al final**, con el mismo prompt de siempre. Si la app no se puede instalar,
  Arbrain se abre en tu navegador como antes.

**Qué tienes que hacer**
- Si ya tienes Arbrain: actualiza como siempre («actualiza mi Arbrain» o el prompt de instalación) y después dile a
  Claude Code «instala la app de Arbrain». Desde esta versión, las siguientes actualizaciones la cambian solas.
- Si tenías la app vieja de Arbrain (0.1.x), el instalador te pregunta antes de cambiarla y guarda la vieja en
  `~/Arbrain-respaldos`. Tus datos no se tocan.

## v0.2.7 · 23 oct 2026 · Instalar y actualizar sin fricción

**Qué trae**
- **Instalar es pegar un solo prompt.** Claude Code instala lo que falte en tu computadora (Git, Node y Python) sin
  pedirte comandos, sigue en la misma sesión sin que lo cierres y lo vuelvas a abrir, y verifica la firma de Arbrain
  por dentro. Solo te toca aceptar el permiso del sistema si Windows o macOS lo piden.
- **Arbrain ya no se compila en tu computadora.** Cada versión trae el programa listo para tu sistema (Mac, Windows o
  Linux). Se baja y se verifica con la misma firma de la versión antes de usarse. Arrancar la primera vez pasa de
  varios minutos a menos de uno, más lo que tarde la descarga. Si algo no cuadra, compila como antes.
- **Actualizar es pegar el mismo prompt** (o decirle a Claude Code «actualiza mi Arbrain»): trae la versión nueva
  verificada, la integra sin tocar lo tuyo y reinicia Arbrain con el programa nuevo, sin recompilar.
- **Si ya tenías una carpeta de trabajo con Claude Code**, el instalador te pregunta una sola vez si quieres copiarla
  a Arbrain (la original queda igual) o unificarla (Arbrain pasa a ser tu carpeta principal).
- **Tu respaldo en tu propio GitHub privado**, ofrecido al final de la instalación en un paso.
- **Si ya pagas Claude Pro o Max, Arbrain usa tu Claude Code solo, sin pedirte nada.** Si no has iniciado sesión, un
  botón abre tu navegador para entrar.
- **Sin cuenta conectada, Levy ya no da un error:** te dice cómo conectarte.
- **El calendario vive en el panel** y sus botones Día, Semana y Mes ya no se cortan en pantallas angostas.
- **Nuevo botón «Abrir carpeta» en Archivos**, que la abre en tu Explorador, Finder o gestor de archivos.

**Qué tienes que hacer**
- Nada distinto: pega el prompt de actualización. Desde esta versión, las siguientes ya llegan compiladas.

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
