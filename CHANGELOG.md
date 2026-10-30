# Cambios de Arbrain

Cada versión dice qué trae y qué tienes que hacer tú. Para actualizar, abre Claude Code en `~/Arbrain` y dile
«jala los últimos cambios». Las versiones siguen `MAYOR.MENOR.PARCHE`: un cambio en MENOR trae funciones
nuevas; uno en PARCHE, arreglos.

## v0.2.17 · 30 oct 2026 · Tu servidor en Ubuntu 24.04 vuelve a responder y entrar con Claude es un clic

**Qué trae**
- **Levy responde en tu servidor con Ubuntu 24.04.** En un servidor recién rentado (por ejemplo Hostinger), Ubuntu
  24.04 no dejaba arrancar el aislamiento de Claude Code y el chat y tus rutinas no respondían. La instalación de tu
  nube ahora le da a ese aislamiento solo el permiso que necesita, y sobrevive a los reinicios.
- **Tu servidor a tu hora.** Un servidor nace en hora universal (UTC) y tus rutinas corrían a deshoras. Al instalar se
  le pone tu zona horaria (por ejemplo, la de Ciudad de México).
- **Entrar con tu cuenta de Claude en tu servidor, sin pelearte con el enlace.** El enlace largo para entrar se repite
  solo, en su propio renglón y listo para abrir de un clic o copiar completo. En la terminal de Arbrain cualquier
  enlace se abre con un clic en tu navegador, aunque ocupe varios renglones.
- **Si la conexión se corta a mitad, retomas donde ibas.** El comando para conectar tu servidor mantiene viva la
  sesión mientras buscas tu llave, y si aun así se corta, volver a correrlo salta lo que ya quedó (tu cuenta de Claude,
  tu llave con tope) y sigue con lo que falta.
- **Actualizar en tu servidor, limpio.** «Actualiza mi Arbrain» en tu servidor deja que su servicio lo vuelva a
  arrancar con la versión nueva, en vez de arrancar otro aparte, y no intenta instalar la app de escritorio ahí.
- **El chat, más limpio.** Quitamos el botón «Resumen» de las respuestas largas: «Escuchar» sigue igual.

**Qué tienes que hacer**
- Dile a Levy «actualiza mi Arbrain».
- Si tu Arbrain vive en un servidor con Ubuntu 24.04 y el chat no te responde, pídele al Claude Code de tu computadora
  (el que instaló tu servidor) «vuelve a correr la instalación de mi servidor»: corre `nube.sh` otra vez, pone el
  permiso que faltaba y no toca tu sesión de Claude, tu llave ni tus datos.

## v0.2.16 · 30 oct 2026 · Subagentes, «Permitir siempre» en todo, actualizar en un paso y tu computadora a la vista

**Qué trae**
- **Levy delega en subagentes.** Cuando un trabajo es largo o tiene partes que van en paralelo, tu Levy lo reparte en
  subagentes. Trabajan bajo tus mismas reglas: tu modo de permisos, tus tarjetas y tu freno valen igual para ellos.
  Los ves en **Taller › Agentes**, con lo que hace cada uno; si todavía no delegaste nada, te lo dice. Un subagente
  vive mientras vive su conversación.
- **«Permitir siempre» en cada tarjeta rutinaria.** Ya no solo en comandos: también en PowerShell, en tus apps (las
  herramientas que conectaste), al guardar en tu memoria o en una carpeta tuya y al abrir páginas de un sitio. Lo ves y
  lo quitas en Ajustes › Permisos y seguridad. Enviar, borrar, publicar o pagar siempre te piden tu clic; en esas
  tarjetas aparece «Que no me pregunte» para llevarte al modo Autónomo.
- **Autónomo te entiende con una palabra.** Un «mándalo» o «envíalo» tuyo basta para que Levy envíe lo que le pediste:
  ya no hace falta una frase larga. Lo que dijiste que no («no lo envíes») sigue sin contar.
- **Actualizar es un paso.** Dile a Levy «actualiza mi Arbrain», en el chat de la app o en Claude Code: comprueba la
  firma, te cuenta qué trae, guarda lo tuyo con una copia de respaldo y se pone al día. Si se lo pides en la app, se
  reinicia sola al terminar su respuesta y la ventana vuelve sola. Tu memoria, tus skills y tu marca se quedan como
  están.
- **Tus rutinas en la app.** En **Taller › Rutinas** ves, creas, pausas, pruebas y borras tus rutinas, con su horario en
  palabras («cada lunes a las 9:00»). Levy también las puede crear desde el chat: nacen en pausa y corren cuando pulsas
  «Activar».
- **Tu computadora a la vista.** **Taller › Computadora** te muestra la memoria con semáforo, el disco, si tu
  computadora se duerme y las apps que más consumen, con «Cerrar» y confirmación. Arbrain y tu sistema no se pueden
  cerrar desde ahí.
- **Los archivos que prepara Levy, a un clic.** Un PDF, Word, CSV o HTML que Levy dejó en tus carpetas se abre o se
  descarga desde el chat, también en tu teléfono.
- **Tu hora, no la de México.** Casillas, «hoy», despertadores y fechas van en la zona horaria de tu computadora.
- **Levy sabe tu día.** Tu meta, tus objetivos, tu calendario y tus hábitos se resumen solos cada 20 minutos para que
  Levy los tenga presentes, y tu retrato (quién eres y cómo decides) se llena con él.
- **Una sola ventana.** Abrir Arbrain abre la app, no el navegador. Si el servidor se cae, la app reintenta sola y el
  chat te ofrece «Reintentar».
- **«Pausar todo» discreto.** Solo el ícono, sin tapar el campo de escribir; eliges su esquina en Ajustes.
- **Windows a la par.** Los ganchos que guardan tus conversaciones, tu memoria y tu diario corren en Windows y cada uno
  se prueba en una computadora Windows de verdad antes de cada versión. Tu cerebro en el teléfono vuelve solo al
  encender tu PC, también probado en Windows.
- **Voz en Windows.** Si el dictado falla, te dice por qué y dónde se arregla (por ejemplo, el permiso de micrófono de
  Windows). «Escuchar» usa la mejor voz en español de tu computadora, primero la de tu país. En Ajustes › Voz ves qué
  voz suena y la pruebas con un botón.
- **Escuchar un resumen.** En las respuestas largas, junto a «Escuchar» aparece **Resumen**: lee el principio de la
  respuesta (cerca de un minuto), salta código, tablas y listas largas, y termina con «El resto está en pantalla». Usa
  la misma voz y el mismo resaltado, sin internet ni costo extra.

**Qué tienes que hacer**
- Dile a Levy «actualiza mi Arbrain». Esta vez la hace todavía con los pasos de tu versión anterior (en Autónomo, sin
  preguntarte; en los otros modos, con algunas tarjetas); desde aquí, cada actualización es un paso.

## v0.2.15 · 29 oct 2026 · Modo Autónomo: Levy hace lo que le pides sin pedirte un clic en cada paso

**Qué trae**
- **Modo Autónomo.** En la bienvenida (y en Ajustes › Permisos y seguridad) eliges cuánto te pregunta Levy: **Autónomo**
  (recomendado), **Automático en mi carpeta** o **Preguntar siempre**. En Autónomo, Levy hace lo que le pides sin
  pedirte un clic en cada paso: abre páginas, usa tus apps, escribe y envía lo que le pediste en el chat. Lo aceptas
  leyendo un texto y marcando dos casillas; queda registrado con fecha y versión, lo ves en Ajustes y lo retiras cuando
  quieras. Volver a que te pregunte está a un clic: en Ajustes, en la píldora «Autónomo» o en «Pausar todo».
- **La red mínima.** Ni en Autónomo Levy toca tu dinero (bancos, pagos, exchanges, impuestos), ni tus llaves y
  contraseñas, ni sus propios permisos, ni borra en masa. Mandar lo mismo a más de tres personas, a un grupo o a una
  lista te lo enseña antes; y si después de leer una página, un correo o tu pantalla quiere mandar algo a alguien que
  tú no nombraste, también te pregunta.
- **Tus datos para mandarte mensajes.** En Ajustes guardas tu número y tu correo: cuando le pides a Levy que te mande
  algo a ti, ya no te pregunta.
- **Las rutinas en Autónomo dejan borradores.** Lo que una rutina quiera enviar o publicar sin ti delante queda en
  «Mientras no estabas», listo para salir con tu clic.
- **Menos clics, en cualquier modo.** Levy toma tu pedido de lo que ya escribiste: ya no te pide que repitas tu
  mensaje. Un sitio que nombraste («mándame un WhatsApp») ya no te pide el clic de «sitio nuevo». Usar tu pantalla o
  una nota que Levy escribió antes ya no hace que todo lo demás te pregunte.
- **Las preguntas no caducan.** Si no contestas a tiempo, la pregunta de Levy (también las de computer use) pasa a tu
  cola en vez de vencer, y tu clic de después sirve para que la haga. Si Arbrain está tapada, te llega un aviso del
  sistema. Escape cierra el diálogo sin rechazar, y el botón dice lo que hace («Abrir web.whatsapp.com»).
- **Computer use en Autónomo queda como lo dejes** entre aperturas (en los otros modos sigue naciendo apagado).
- **Windows sin Python.** Si falta Python, Ajustes › Permisos y seguridad te lo dice (los ganchos de memoria y diario
  no corren; la guardia sí).
- **Licencia.** El texto de «Licencia» del primer arranque ya dice lo que es: Apache-2.0, código abierto. Al actualizar,
  la app te pide aceptar los textos otra vez.

**Lo que todavía es borrador o falta probar**
- **El texto que aceptas para el modo Autónomo es un borrador.** Cuando quede su versión final, la app te lo enseña otra
  vez y te pide aceptarlo de nuevo; tu modo no cambia mientras tanto.
- **Windows real.** El modo Autónomo se probó en Mac y en simulación de Windows. En una computadora con Windows falta
  probar que Levy pulse Enter en WhatsApp Web; si no se envía solo, envíalo tú y avísanos en el grupo.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain». Al abrirla, elige tu nivel una vez. Si tenías «Sin preguntar» o el freno
  quitado, Arbrain te ofrece Autónomo con su texto; si no decides, quedas en «Automático en mi carpeta».

## v0.2.14 · 29 oct 2026 · Tu marca, tu primera skill y un lector que sigue la voz

**Qué trae**
- **Arbrain con tu marca.** Tus colores, tu logo y el nombre de tu negocio viven en tu carpeta `mi-marca/`. Pídeselo a
  Levy («cambia mis colores a verde», «pon este logo», «que se llame Acme») y lo ves al recargar la ventana. Como está
  en tu parte, actualizar ya no choca con tus colores y Arbrain sigue usando el programa ya compilado de cada versión.
- **Tu primera skill, de un proceso tuyo.** Dile a Levy «crea una skill» y convierte tu proceso más odiado en una receta:
  te hace como mucho cinco preguntas y la deja en tu carpeta con tu prefijo (`mi-…`), lista para usarse.
- **Dos guías para tu Levy.** `docs/PERSONALIZAR.md` dice dónde va cada cosa tuya para que nada choque al actualizar, y
  `docs/ACTUALIZAR-EXPLICADO.md` explica qué pasa cuando actualizas (tus dos líneas, qué hacer si tocaste algo de
  Arbrain y cómo vuelves atrás). No tienes que leerlas: Levy las consulta cuando le preguntas.
- **El resaltado sigue la voz palabra por palabra.** Si escuchas las respuestas con LemonFox y tienes tu llave gratis de
  Groq en Ajustes › Voz (la misma con la que dictas), el resaltado ya no se estima: sigue la voz exacto, también a 1.5x
  y 3x, y es una sola caja que se mueve sin dejar rastro. Sin esa llave, Arbrain te lo dice una sola vez y todo sigue
  como antes.
- **Tu cerebro en el teléfono vuelve solo.** Al encenderlo, Arbrain queda listo para arrancar cuando prendas o reinicies
  tu computadora, y espera a que Tailscale se conecte. Antes, tras un reinicio, el teléfono se quedaba sin conexión.
- **Las zonas de tu día, de color.** En el Calendario, engrane › «Zonas de mi vida»: tu mañana, el trabajo profundo, el
  gym, la comida, la rutina de noche y el sueño se pintan de fondo en el Día y la Semana. Ajustas sus horas y su color.
- **Calendario más claro.** El objetivo de la semana queda fijo arriba aunque bajes, hoy se marca en dorado y en el Mes
  cada semana muestra su objetivo con un resumen que abres cuando quieres.
- **Tus agentes, por conversación.** En el Taller, los trabajos que Levy delega se agrupan por la conversación de la que
  salieron, con un resumen de una línea y su línea de tiempo. Puedes plegar cada grupo.
- **Presentaciones en el teléfono.** Una presentación abierta en el teléfono llena la pantalla, se acomoda al girarlo y
  siempre tiene una X clara para salir.
- **Sale el pizarrón.** Para aprender algo, pídeselo a Levy en el chat: te lo explica en texto y lo puedes escuchar.
- **Tres caminos para instalar, con una sola pregunta.** Al pegar el prompt de instalación, Claude te pregunta una vez
  dónde quieres tu Arbrain: **en tu computadora**, **solo en tu servidor (beta)** o **en los dos (espejo, beta)**. Si ya
  lo dijiste en el prompt, no pregunta. Los dos caminos con servidor están en beta: funcionan, pero todavía no se
  prueban en un servidor real de un alumno.
- **Solo en tu servidor (beta).** Arbrain vive en un servidor tuyo en la nube, prendido siempre, y lo abres desde el
  navegador de cualquier computadora o desde tu teléfono por tu red privada de Tailscale, aunque tu computadora esté
  apagada. Nada queda abierto a internet. El chat usa tu cuenta de Claude; las rutinas que corren solas van por tu
  llave de OpenRouter con tope de gasto. Tu cuenta, tu llave y tu código para entrar se hacen en una sola terminal
  tuya; nada de eso pasa por el chat. Plan recomendado y por qué: `INSTALAR-NUBE.md`.
- **El paso a paso en tu primer arranque.** Arbrain te muestra los tres caminos con sus pasos y sus prompts, con
  «Copiar», y te marca dónde estás.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain».
- Si ya usas tu cerebro en el teléfono, después de actualizar dile a Levy «revisa que mi teléfono vuelva solo al
  reiniciar»: deja activado el arranque automático.
- Si cambiaste colores en el código de Arbrain antes de esta versión, pídele a Levy que los pase a `mi-marca/`.
- Si quieres probar tu servidor (beta), renta uno y pega en Claude Code el prompt de «Solo en tu servidor» de
  `INSTALAR.md`.

## v0.2.13 · 28 oct 2026 · Levy te pregunta menos y puedes deshacer lo que cambió

**Qué trae**
- **Las preguntas de Levy llegan dentro de la conversación.** Cuando Levy necesita tu permiso para un comando, aparece
  una tarjeta en el mismo hilo: arriba, en una frase, qué quiere hacer; el comando exacto, a un clic. Eliges **Una vez**,
  **Permitir siempre** o **No**. Si dices que no, puedes escribir por qué y Levy lo lee y sigue por otro camino.
- **Te pregunta menos.** Lo rutinario (por ejemplo, consultar la versión de una herramienta) lo puede resolver solo, y
  si eliges «Permitir siempre», ese tipo de comando ya no te pregunta. Esas reglas se ven en Ajustes › Permisos y
  seguridad › «Comandos que ya no te preguntan», donde las quitas con un clic. Lo que cuida tu seguridad no cambia: lo
  de fuera de tu carpeta se sigue negando, y enviar, borrar, publicar o pagar siempre te pide tu clic.
- **Si no estabas, la pregunta te espera.** Si Levy te pregunta algo y no contestas, no lo hace: sigue con lo demás y
  la pregunta queda en «Mientras no estabas». Cuando vuelves y decides, Levy retoma esa parte solo.
- **Lo que necesita tus manos.** Cuando algo pide tu contraseña de administrador o iniciar sesión, Levy no lo intenta:
  en la app de escritorio te ofrece correrlo tú en una terminal ahí mismo, y Levy solo ve lo que salga. Si abres
  Arbrain desde el navegador (`npm run servidor`), te pide que lo corras en tu propia Terminal.
- **Ves lo que Levy cambió y lo puedes deshacer.** Cada respuesta en la que Levy tocó tus archivos termina con una línea
  como «Levy cambió 1 memoria · Ver cambios». Ahí ves cada cambio en palabras, y con **Deshacer desde aquí** tus
  archivos vuelven a como estaban antes de ese mensaje. Si te arrepientes, **Rehacer** los devuelve. Lo que se cambió
  con comandos no se deshace; el aviso te lo dice antes.
- **La respuesta primero.** En el chat ves primero lo que Levy te responde; los pasos que dio quedan plegados en
  «Razonamiento», en el orden en que pasaron. Las imágenes que Levy lee también se ven ahí.
- **Una meta ya no entierra la respuesta.** Si le pones a Levy una meta con `/goal`, su respuesta ya no queda debajo de
  vueltas repetidas: cuando las vueltas no avanzan, se detiene y te lo dice.
- **Tus agentes, por estado.** En el Taller, los trabajos que Levy delega se agrupan en Te espera, Trabajando y Listo,
  cada uno con su último paso dicho en español y un solo botón según su estado: Responder, Detener o Retomar.
- **Tus hábitos en una tabla.** En el Calendario, la vista Hábitos (tecla H) es una sola tabla de días por hábitos que
  llenas con un toque.
- **Tu semana ideal detrás de la real.** Pídele a Levy que arme tu Semana Perfecta y la Semana la
  pinta tenue detrás de tus eventos (se enciende en el engrane › DRIP). El Mes trae la caja «Año precargado» para tus
  piedras grandes (premios, viajes, lanzamientos), y la revisión del domingo suma cuántas veces te interrumpieron por
  algo que se podía delegar.
- **Levy carga menos texto en cada mensaje.** Sus instrucciones de herramientas pesan menos de un tercio que antes y lo
  largo lo consulta solo cuando le hace falta: te responde con más contexto libre para lo tuyo.
- **Arreglos.** Tras actualizar, una pestaña que quedó abierta ya no truena la app; el lector en voz ya no te regresa
  el texto mientras te mueves por la conversación; y el Día ya no te pide «Acepto mi día» cada mañana.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain». No tienes que configurar nada: la próxima vez que Levy necesite tu permiso,
  verás la tarjeta en la conversación.

## v0.2.12 · 27 oct 2026 · Arreglos que reportaron los fundadores

Esta versión trae también todo lo de v0.2.11 (abajo), que no salió por separado.

**Qué trae**
- **Tus ganchos vuelven a encender después de actualizar.** Desde v0.2.9, al actualizar, Arbrain apagaba los ganchos de
  tu cerebro (memoria, captura de conversaciones y contexto de tu agenda) sin avisarte. Ahora, si tus ganchos son
  idénticos a los de una versión publicada y firmada, se aceptan solos. Si alguien cambió uno, siguen apagados, como
  antes.
- **Tus conversaciones se guardan en Windows.** El gancho que guarda lo que hablas con Levy fallaba en Windows y no
  dejaba nada en tu diario de conversaciones. Ya funciona, usa la zona horaria de tu equipo y guarda bien los acentos.
- **Lo que hablas en la app de Arbrain también se guarda.** Antes solo se guardaba lo que hablabas en Claude Code; el
  chat de la app ahora también llega a tu diario de conversaciones.
- **El chat desde el navegador o el teléfono vuelve a mostrar dónde escribir.** Al abrir Arbrain fuera de tu compu (por
  ejemplo, desde el teléfono), el chat se veía sin mensajes y sin campo para escribir. Ya aparece completo.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain». No tienes que hacer nada más: los ganchos se encienden solos en tu siguiente
  conversación.

## v0.2.11 · 24 oct 2026 · Tu calendario gobierna tu tiempo

**Qué trae**
- **Todo a la vista en pantalla ancha.** En una pantalla grande, Día, Semana y Mes se ven en dos columnas y sin hacer
  scroll: lo importante a la izquierda (tu temporada, el objetivo, el ahora, tus tareas y hábitos) y el calendario a la
  derecha. En el teléfono o una ventana angosta, todo sigue en el orden de siempre.
- **De la temporada al día, en cascada.** Tu calendario baja en cuatro escalones: temporada → mes → semana → día. Cada
  uno tiene un objetivo y un solo contador: la temporada dice «Día N de X», el mes «Semana N de M», la semana cuántos
  entregables llevas y el día tus 3 casillas. El Mes muestra solo lo que no se mueve (fases, hitos, viajes, llamadas
  importantes), sin tus rutinas diarias; la Semana las muestra atenuadas para que resalte lo único de esa semana.
- **Cada bloque con su color DRIP.** Levy clasifica cada evento en Producir, Invertir, Reemplazar o Delegar (de *Buy
  Back Your Time*) y lo colorea. Si no le atinó, lo corriges con un toque y lo recuerda para toda la serie. Lo que se
  puede sacar de tu agenda aparece con la etiqueta «delegable».
- **La revisión del domingo, en una pantalla.** Plan contra lo real de tu semana, horas en Producir, horas recompradas,
  qué asesino del tiempo apareció y **una sola propuesta** para la semana que viene, que apruebas con un toque (y se
  puede deshacer). Se abre sola los domingos y, cualquier día, con «Revisión del domingo» en el Calendario.
- **Tres números y nada más.** Arriba de todo: el día de tu temporada, tus horas en Producir esta semana y tus horas
  recompradas. Lo que no se ha medido se ve como «—», nunca como un cero inventado. Si fijas tu tarifa de recompra (lo
  que te paga tu negocio al año ÷ 8,000), las horas recompradas también te dicen cuánto valen.
- **Un toque cada mañana.** Levy te propone el día según tu semana y tu objetivo; lo confirmas o lo corriges con un
  toque.
- **Tu Levy te guía a armar tu temporada.** Tu Arbrain nace sin temporada: la franja de arriba te invita, «Arma tu
  temporada con Levy». Dile «armemos mi temporada» y te hace las preguntas (meta, premio, fechas que no se mueven, qué
  tiene que estar cumplido) y después te ayuda a bajarla al mes, a tu semana perfecta y a tu día. Al guardarla ves «Día N
  de X» en la franja y la cuadrícula de la temporada en «Hábitos de hoy».
- **Modo espejo (beta, viene apagado).** Tu cerebro puede vivir en dos máquinas: tu compu y un servidor en la nube a tu
  nombre, que sigue corriendo tus rutinas con la compu apagada. Las dos comparten tu memoria y tu plan por tu GitHub
  privado; una sola manda (la eliges tú, por ejemplo «que la nube mande») y la otra es ventana. Nadie toma el mando
  solo: si la que manda deja de dar señales, la otra te avisa y te pregunta. Viene **apagado**: si no lo enciendes, tu
  Arbrain funciona exactamente igual que antes.
- **Tus llaves nunca viajan.** Lo que parece una llave o una contraseña no se sube a tu GitHub; se queda en su máquina
  y te avisa. Si las dos máquinas cambian lo mismo, no se pierde nada: queda tu versión y la otra al lado, con el
  nombre de la máquina y la fecha.
- **Rutinas de la nube con tope de gasto.** En el servidor, tus rutinas corren con una llave de OpenRouter que tiene
  tope de gasto (nunca con tu suscripción de Claude); sin tope no corren y te lo dicen. Cada envío sale una sola vez,
  aunque las dos máquinas estén prendidas.
- **Tu cerebro en la nube, instalado por Claude.** Con la guía «Tu cerebro en la nube» (`INSTALAR-NUBE.md`) rentas el
  servidor, pegas un prompt en Claude Code y él lo deja listo y protegido: arranca solo, se levanta si se cae, entra
  solo con tu llave y no abre nada a internet.
- **Tus rutinas ya no se atoran.** Una rutina que actualiza tu «Ahora» (`now.md`) o deja un reporte ya no se queda
  esperando un clic que nadie da. Si una rutina intenta algo que sí necesita tu permiso, no se queda esperando: la
  acción no se hace, te queda pendiente en Arbrain y la rutina sigue con lo demás. Y una rutina lenta ya no detiene a
  las otras. Enviar, borrar, publicar y pagar te siguen pidiendo tu clic como siempre, y tus llaves siguen intocables.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain» (o el prompt de instalación).
- Dile a tu Levy «armemos mi temporada». Si ya sabes tu ingreso anual, pídele también que fije tu tarifa de recompra
  (o fíjala tú en el engrane del Calendario › DRIP).
- El domingo, abre la revisión y aprueba (o no) la propuesta de la semana.
- Para probar el modo espejo (beta, opcional): sigue los pasos de «Tu cerebro en la nube» (`INSTALAR-NUBE.md`) y agrega
  al prompt «Enciende el modo espejo: que la nube mande». Si no lo haces, no cambia nada.

## v0.2.10 · 24 oct 2026 · Tú decides cuánto te pregunta Levy

**Qué trae**
- **Menos confirmaciones, y tú eliges cuántas.** Nuevo en Arbrain › Ajustes › **Permisos y seguridad**: «Cuánto te
  pregunta Levy», con tres modos:
  - **Preguntar siempre:** como hasta hoy.
  - **Automático en mi carpeta** (el nuevo de fábrica): dentro de tu cerebro y de las carpetas que agregues, Levy lee,
    busca, crea y edita archivos, y ajusta sus instrucciones y skills, sin pedirte clic. Te pregunta para lo que sale de
    ahí (comandos que instalan o usan internet, páginas nuevas, otras carpetas). En Windows ya no te pide clic para cada
    comando que solo lee.
  - **Sin preguntar:** comandos, otras carpetas, páginas y tus herramientas conectadas corren sin clic.
  En cualquier modo, **enviar, borrar, publicar o pagar siempre te pide tu clic**, tus llaves y contraseñas nunca se
  tocan, y si Levy acaba de leer algo de internet, un correo o un archivo de afuera, vuelve a preguntarte antes de
  actuar. Las rutinas automáticas siempre preguntan. Todo lo que Levy hace sin preguntar queda en «Lo que hizo Levy».
- **Quitar también el freno, si tú lo decides.** Dentro de «Sin preguntar» hay un interruptor opcional, «Quitar
  también el freno (bajo mi responsabilidad)»: enviar, borrar y publicar dejan de pedirte clic. Antes de activarlo ves
  el riesgo y escribes la frase «quito el freno bajo mi responsabilidad». Mientras esté activo lo ves arriba de Permisos
  y seguridad y junto a «Pausar todo» en toda la app; se apaga con un clic y se apaga solo si cambias de modo. Cuándo lo
  activaste y lo apagaste queda en «Lo que hizo Levy». Aun así, mover dinero, comprar, operar acciones o cripto y tocar
  tus llaves siguen bloqueados; tras leer algo de afuera vuelve a preguntarte, y las rutinas no lo usan.
- **Más bloqueos de dinero y secretos, en todos los modos.** Levy tampoco opera valores: brokers, exchanges y
  carteras (comprar, vender, órdenes, swaps, transferencias de cripto) quedan fuera, igual que los bancos y los pagos. Y
  ninguna herramienta conectada recibe la ruta de un archivo secreto (por ejemplo, adjuntar tu `.env` a un correo).
- **Carpetas a las que tu cerebro puede entrar.** En la misma sección agregas o quitas las carpetas donde Levy puede
  trabajar (un proyecto, los documentos de tus clientes). Ya no hace falta abrir Claude Code para quitar nada.
- **Levy te guía a cambiar sus permisos.** Si le dices «me preguntas demasiado», «lee mi carpeta de Documentos» o
  «cambia tu configuración», te lleva en dos pasos a Ajustes. Él no puede cambiar sus propios permisos: solo tú.
- **Una voz mejor para «Escuchar».** En Windows (y Linux), Arbrain elige la mejor voz en español de tu computadora: si
  tienes una voz «Natural» de Microsoft, la usa, y ya no cae en una voz en inglés. Si quieres una voz más humana, pega
  tu llave de LemonFox (opcional, de pago) en Ajustes › Voz › «Voz de las respuestas».
- **Actualizar respeta tu Arbrain personalizado.** Si cambiaste marca, colores, skills o código, «actualiza mi Arbrain»
  trae lo nuevo sin pisar lo tuyo (lo probamos con una copia personalizada de verdad). Si una skill tuya se llama igual
  que una nueva del autor, la tuya se renombra a `<nombre>-mia` antes de fusionar, para que no se mezclen. Nuevo
  manual: `arbrain/cerebro/manuales/cirujano-del-cerebro.md`, cómo modificar tu copia con una sesión aparte de Claude
  Code sin romper las actualizaciones.
- **El mapa del programa con las fechas de tu cohorte.** Tu Levy sabe que Tu cerebro va de la Semana 0 a la 1 (21 oct
  al 1 nov, con tu uno a uno del 29 oct al 1 nov), Supernova de la 2 a la 3 (2 al 15 nov) y Primer cliente desde el 16
  nov, hasta Escala y el día 90 (23 ene), igual que Mi camino en arbrain.ai.
- **Seguridad:** la web de Arbrain sube a Next 16.4.3 (corrige una falla crítica del optimizador de imágenes) y
  DOMPurify a 3.4.17.
- **Tu cerebro en el teléfono.** Dile a Claude Code «Pon mi cerebro en mi teléfono» y tu Arbrain queda como app («Tu
  Arbrain», con su propio icono) en tu iPhone o Android. Lo sirve tu propia computadora a través de tu red privada de
  Tailscale (gratis): nada queda abierto a internet, solo tus equipos lo ven, y entras con tu contraseña de siempre o con
  un «Código para entrar» de un solo uso. **Funciona mientras tu computadora esté prendida y conectada**; si la apagas o
  se duerme, el teléfono no la alcanza. Que tu cerebro siga disponible con la compu apagada llega después.
- **Ajustes › Tu cerebro en el teléfono:** ves si está encendido, la dirección con su QR, el «Código para entrar» y el
  paso a paso para iPhone y Android. Lo enciendes y lo apagas con un botón; al apagarlo, el teléfono deja de entrar
  aunque ya tuviera la sesión abierta.

**Qué tienes que hacer**
- Actualiza con «actualiza mi Arbrain» (o el prompt de instalación).
- Abre Ajustes › Permisos y seguridad y revisa el modo: viene en «Automático en mi carpeta». Si prefieres que te
  pregunte todo, elige «Preguntar siempre».
- Si Levy necesita otra carpeta, agrégala ahí mismo, en «Carpetas a las que tu cerebro puede entrar».
- Si quieres tu cerebro en el teléfono: dile a Claude Code «Pon mi cerebro en mi teléfono». Lo único que haces tú es
  iniciar sesión en Tailscale en tu computadora y en tu teléfono con la misma cuenta.

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
- **El freno de seguridad y tu memoria corren siempre.** En Windows, los ganchos de Claude Code buscaban `python3`,
  que suele ser un acceso falso de la Microsoft Store; ahora encuentran el Python real y escriben los acentos bien. En
  una Mac con el Python que trae Apple, el freno de «enviar, borrar, pagar» fallaba al cargar y no frenaba; ya frena.

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
