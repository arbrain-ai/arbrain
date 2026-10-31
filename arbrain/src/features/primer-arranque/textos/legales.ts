/**
 * Textos legales del primer arranque: aviso de privacidad, términos de uso y licencia.
 *
 * Versión final del 31 oct 2026: revisión cláusula por cláusula contra la LFPDPPP (DOF 20-03-2025), la LFPC, el
 * Código de Comercio, el Código Civil Federal, el RGPD y la Apache-2.0, en docs/builds/legal-2026-10-31/REVISION.md.
 * Al cambiar una palabra, sube VERSION_TEXTOS: la app volverá a pedir la aceptación (la prueba de la huella lo exige).
 *
 * Formato: párrafos separados por línea en blanco; una línea que empieza con «## » es un subtítulo y «- » una viñeta.
 */

// «b» (11 oct 2026, noche): la v1 sale sin computer use (DECISIONES #11); los términos ya no lo ofrecen.
// 17 oct 2026 (0.1.2): computer use vuelve en macOS y Windows; los términos dicen cómo funciona y quién responde.
// 29 oct 2026 (0.2.15): la licencia dice lo que es (Apache-2.0, código abierto) y los términos nombran los tres niveles
// de permisos. El modo Autónomo tiene su propio texto y su propia aceptación (server/src/cliente/consentimiento-autonomia.ts).
// 31 oct 2026: versión final tras la revisión legal; deja de ser borrador.
export const VERSION_TEXTOS = '2026-10-31'
export const AVISO_VERSION = 'Versión del 31 de octubre de 2026. Si cambian, Arbrain te los vuelve a pedir.'

/**
 * El responsable (LFPDPPP art. 15-I) y titular de la marca. Domicilio y correo vacíos = aún no confirmados por el titular
 * (REVISION.md, «Lo que falta»); mientras tanto el contacto es el del programa. Llenarlos cambia el texto: sube la versión.
 */
export const RESPONSABLE = {
  nombre: 'Jorge Daniel Carreón Guzmán',
  domicilio: '',
  correo: '',
}

const CANAL = RESPONSABLE.correo || 'el correo o el chat con el que te atiende el Acompañamiento Arbrain'
const CONTACTO = RESPONSABLE.correo ? `escribiendo a ${CANAL}` : `escribiéndonos por ${CANAL}`
const ESCRIBENOS = RESPONSABLE.correo ? `escribe a ${CANAL}` : `escríbenos por ${CANAL}`

export interface DocumentoLegal { id: 'privacidad' | 'terminos' | 'licencia'; titulo: string; resumen: string; cuerpo: string }

export const PRIVACIDAD: DocumentoLegal = {
  id: 'privacidad',
  titulo: 'Aviso de privacidad',
  resumen: 'Tu cerebro vive en tu computadora. Sin tu permiso explícito no sale nada.',
  cuerpo: `## Quién es responsable
${RESPONSABLE.nombre}, persona física${RESPONSABLE.domicilio ? `, con domicilio en ${RESPONSABLE.domicilio}` : ''} («nosotros»), es responsable de los datos personales que Arbrain nos envía por tu decisión, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (publicada en el Diario Oficial de la Federación el 20 de marzo de 2025).

Este aviso cubre la app Arbrain. Lo que das al inscribirte y pagar el Acompañamiento Arbrain se trata en arbrain.ai conforme al acuerdo de ese programa.

## Lo que se queda contigo
Arbrain corre en tu computadora o en el servidor que tú contrates. Tus conversaciones, tu memoria, tus archivos, tus lienzos, tu configuración, el registro de lo que hizo tu Levy y tu aceptación del modo autónomo se guardan ahí. Nosotros no los recibimos ni tenemos acceso a ellos.

Tus llaves de acceso a modelos de IA (Anthropic, OpenRouter u otras) se guardan en el llavero de tu sistema operativo y solo se usan para hablar con esos proveedores en tu nombre.

## Lo que tú mandas a otros proveedores
Cuando hablas con tu Levy, el texto de cada turno y lo que tu Levy lee para responderte viajan al proveedor del modelo que elegiste, con tu propia llave y bajo los términos de ese proveedor. Si enciendes computer use (macOS y Windows), también las capturas de tu pantalla que tu Levy necesita: lo que esté a la vista puede ir en ellas.

Lo mismo con los servicios tuyos que conectes (tu correo, tu calendario, tu servidor, tu repositorio de respaldo): la información viaja a esas cuentas, bajo sus términos. Ese envío lo haces tú con tus cuentas; nosotros no lo vemos ni lo recibimos.

Si guardas en tu cerebro datos de tus clientes o de otras personas, el responsable de esos datos ante la ley eres tú. Arbrain no nos los envía.

## Lo que sí nos llega, solo si lo activas
Conectar con arbrain.ai (apagado por defecto). Si pegas en Ajustes › Privacidad el código de tu cuenta de arbrain.ai, Arbrain envía una vez al día (y cuando pulsas «Enviar ahora») una señal de avance ligada a esa cuenta:
- la versión de Arbrain que tienes instalada;
- si tienes meta del mes, de la semana y del día (el texto, solo si marcas compartirlo);
- cuántos hábitos activos tienes y cuántos días los cumpliste en los últimos 7 (sus nombres, solo si marcas compartirlos);
- cuántas conversaciones tuviste con tu Levy en 7 días y cuántos eventos tiene tu calendario (solo números);
- cuántas ofertas, conversaciones de venta y cierres anotaste tú (solo números).
Además, Arbrain trae de arbrain.ai tu expediente y tu camino del programa para ponerlos en tu cerebro. Como en toda conexión por internet, arbrain.ai recibe la dirección IP y la hora de cada envío. Antes de conectar ves exactamente lo que se enviaría.

Monitoreo del programa (versión anterior, apagado por defecto). Si tu copia de Arbrain lo trae y lo activas, envía una vez al día solo cifras por día: cuántas sesiones tuviste, cuántas acciones de venta y cierres registraste y el monto total facturado por moneda. El monto es un dato patrimonial: lo tratamos solo con tu consentimiento expreso, que das al activar el interruptor.

Nunca sale el texto de tus conversaciones, tu memoria, tus archivos, ni nombres, correos o datos de tus clientes o de otras personas.

## Datos sensibles
No te pedimos datos sensibles (salud, religión, opiniones políticas, vida sexual, origen étnico). Si decides compartir el texto de tus metas o los nombres de tus hábitos, no los incluyas ahí.

## Para qué los usamos
Finalidad necesaria: acompañarte dentro del programa: ver tu avance, preparar tus sesiones y, si tu acuerdo lo prevé, revisar las condiciones de tu garantía.

Finalidades secundarias: ninguna. No usamos tus datos para publicidad ni los vendemos. Si un día quisiéramos usarlos para algo distinto, te pediríamos tu consentimiento antes.

## Con quién se comparten
No transferimos tus datos a terceros. Los guardan proveedores de alojamiento que contratamos para operar arbrain.ai, que solo los tratan por cuenta nuestra y cuyos servidores pueden estar fuera de México. Solo los entregaríamos a una autoridad que lo ordene conforme a la ley.

## Cómo limitar su uso
No conectar es la primera opción: Arbrain funciona completo sin conectarse. Si ya conectaste, desconectar en Ajustes › Privacidad detiene los envíos al instante, y puedes desmarcar en cualquier momento compartir textos y nombres.

## Tus derechos y cómo revocar tu consentimiento
Puedes pedir el acceso, la rectificación o la cancelación de tus datos, oponerte a su tratamiento o revocar tu consentimiento ${CONTACTO}. Dinos tu nombre, la cuenta de arbrain.ai con la que te identificamos, el derecho que quieres ejercer y sobre qué datos. Te respondemos en un máximo de 20 días hábiles y, si procede, lo hacemos efectivo en los 15 días hábiles siguientes. Es gratis. Si no estás conforme con la respuesta, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno.

## Si vives en la Unión Europea
También aplica el Reglamento General de Protección de Datos. Tratamos la señal de avance con tu consentimiento, que puedes retirar cuando quieras, y lo necesario para darte el programa que contrataste. Además de los derechos anteriores tienes los de limitación del tratamiento y portabilidad, y puedes reclamar ante tu autoridad de protección de datos (en España, la Agencia Española de Protección de Datos). Tus datos se tratan en México y en servidores que pueden estar fuera del Espacio Económico Europeo.

## Conservación y seguridad
Guardamos la señal de avance mientras estés en el programa y hasta 12 meses después de que termine o de que desconectes; después se borra. Si pides la cancelación antes, se bloquea y se borra al vencer el plazo que la ley fija para responder por su tratamiento.

Viaja cifrada (HTTPS), se guarda en servidores con acceso restringido y solo la consultan el responsable y quienes le ayudan a dar el programa, con obligación de confidencialidad. Si ocurre una vulneración de seguridad que afecte de forma significativa tus derechos, te avisamos de inmediato.

## Cambios a este aviso
Si cambia, Arbrain te muestra la versión nueva y te pide aceptarla antes de seguir. La versión que aceptaste está siempre en Ajustes › Privacidad.`,
}

export const TERMINOS: DocumentoLegal = {
  id: 'terminos',
  titulo: 'Términos de uso',
  resumen: 'Tú controlas a tus agentes y eres responsable de lo que autorizas.',
  cuerpo: `## Quién te da Arbrain
Arbrain es software de código abierto publicado por ${RESPONSABLE.nombre} («nosotros»). Estos términos regulan el uso de la app. El Acompañamiento Arbrain es un servicio aparte, con su propio acuerdo; en lo que ese acuerdo regule, manda el acuerdo.

## Quién puede usarlo
Debes ser mayor de edad y poder obligarte legalmente. Si usas Arbrain para una empresa, aceptas estos términos también en su nombre.

## El servicio
Arbrain es software que se instala y corre en tu computadora o en tu servidor. Te permite trabajar con agentes de IA («tu Levy») que leen y escriben en la carpeta de tu cerebro, trabajan contigo en el chat y, si tú lo enciendes en macOS o Windows, operan tu computadora.

## Tus llaves y tus costos
Usas tus propias llaves (Anthropic, OpenRouter u otras). Eres responsable de su costo, de guardarlas y de cumplir los términos de cada proveedor. Si usas una suscripción personal en lugar de una llave de API, revisa que los términos de ese proveedor lo permitan.

## Agentes y computer use
Los agentes actúan en tu computadora. Tú eliges cuánto te preguntan antes de actuar: «Preguntar siempre», «Automático en mi carpeta» (te pide confirmar con un clic antes de enviar, pagar, borrar o publicar y antes de lo que sale de tu computadora) o «Autónomo», que actúa sin pedirte un clic en cada paso y que aceptas aparte, con su propio texto, sus dos casillas y un registro que puedes retirar. En cualquier nivel, Arbrain no mueve dinero ni entra a tu banco, no toca tus llaves ni contraseñas y no borra en masa. Tú decides qué autorizas y eres responsable de ello.

Computer use (que un agente mire tu pantalla, haga clic y escriba en tus apps) existe en macOS y Windows, no en Linux. Viene apagado y se apaga cada vez que cierras la app (en «Autónomo» queda como lo dejaste); solo tú lo enciendes, desde la app. Mientras está encendido, el agente toma capturas de tu pantalla que se envían al proveedor del modelo que elegiste. No lo uses con tu banco, pagos, impuestos ni cripto: Arbrain bloquea esos sitios, pero ningún bloqueo es perfecto.

## Datos de otras personas
Si con Arbrain tratas datos de tus clientes o de otras personas, tú eres su responsable: cumple la ley de protección de datos que te aplique y avísales cómo los usas.

## Usos prohibidos
No uses Arbrain para enviar spam, suplantar a otras personas, extraer datos contra los términos de terceros, acceder sin autorización a sistemas o cuentas, vigilar a otras personas ni para nada ilegal.

## Sin garantía
Arbrain se entrega gratis y «tal cual», sin garantía de resultados ni de que funcione sin errores, como dice su licencia Apache-2.0. Respalda tu información importante.

## Limitación de responsabilidad
En la medida que la ley aplicable lo permita, no respondemos por daños indirectos, pérdida de datos, de ingresos o de ganancias, ni por las consecuencias de lo que tus agentes hacen a partir de tus pedidos. Nada de esto limita nuestra responsabilidad por dolo o culpa grave, ni los derechos que la ley te da y que no se pueden renunciar, incluidos los de la Ley Federal de Protección al Consumidor si eres consumidor.

## Monitoreo y garantía del programa
Conectar con arbrain.ai y el monitoreo del programa son opcionales. Si la garantía de tu programa depende de medir tu avance, el acuerdo del programa lo dice; apagarlos no afecta tu licencia de uso.

## Cambios a estos términos
Si cambian, Arbrain te muestra la versión nueva y te pide aceptarla antes de seguir. Nada cambia para ti sin tu aceptación.

## Ley aplicable y contacto
Estos términos se rigen por las leyes federales de los Estados Unidos Mexicanos. Si eres consumidor, conservas los derechos que te da la Ley Federal de Protección al Consumidor y puedes acudir a la Procuraduría Federal del Consumidor; si vives en otro país, conservas además los que las leyes de tu país no permiten renunciar. Cualquier controversia se resolverá ante los tribunales competentes conforme a esas leyes.

Dudas y aclaraciones: ${ESCRIBENOS}. Para reportar una falla de seguridad, sigue la política de seguridad de Arbrain (archivo SECURITY.md del repositorio): reporte privado en GitHub y respuesta en 72 horas.`,
}

export const LICENCIA: DocumentoLegal = {
  id: 'licencia',
  titulo: 'Licencia',
  resumen: 'Código abierto bajo Apache-2.0: úsalo, modifícalo y compártelo. La marca Arbrain no va incluida.',
  cuerpo: `## Lo que recibes
Arbrain es software de código abierto bajo la licencia Apache License 2.0 (el archivo LICENSE.txt que viaja con la app). Recibes el código y el derecho a usarlo, copiarlo, modificarlo y distribuirlo, también con fines comerciales, en los términos de esa licencia. Los componentes de terceros que incluye conservan sus propias licencias (archivo NOTICE).

## Lo que puedes hacer
- Usar Arbrain en tus computadoras y servidores para tu propio trabajo y el de tu negocio.
- Modificarlo, adaptarlo y redistribuirlo, con o sin cambios, siempre que entregues una copia de la licencia, conserves los avisos de copyright, de licencia y el archivo NOTICE, y señales en los archivos que cambiaste que los cambiaste.

## Lo que la licencia no incluye
- La marca Arbrain, el nombre Levy y los logotipos no se licencian: no presentes una copia modificada como si fuera Arbrain ni uses la marca para tu producto sin permiso. Sí puedes decir, de buena fe, que tu trabajo se basa en Arbrain.
- El Acompañamiento Arbrain es un servicio aparte, con su propio acuerdo; la licencia del código no lo cubre.

## Marca
Arbrain, Levy y sus logotipos son signos distintivos de ${RESPONSABLE.nombre}.

## Sin garantía
Como dice la Apache-2.0 (secciones 7 y 8), el software se entrega «tal cual», sin garantías, y quienes lo escriben no responden por daños derivados de su uso, salvo lo que la ley aplicable no permita excluir. Lo que guardaste en tu computadora es tuyo.`,
}

export const DOCUMENTOS_LEGALES: readonly DocumentoLegal[] = [PRIVACIDAD, TERMINOS, LICENCIA]
