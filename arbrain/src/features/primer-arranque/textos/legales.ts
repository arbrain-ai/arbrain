/**
 * Textos legales del primer arranque: aviso de privacidad, términos de uso y licencia.
 *
 * ⚠️ BORRADOR — PENDIENTE DE REVISIÓN LEGAL. Los escribió Levy el 11 oct 2026 a partir de la orientación de
 * docs/builds/seguridad-empaquetado-2026-10-09/AUDITORIA.md §4 (no es consejo legal). Antes de repartir la app a
 * terceros, un abogado debe revisarlos y completar lo marcado con [COMPLETAR]. Al cambiarlos, sube VERSION_TEXTOS:
 * la app volverá a pedir la aceptación.
 *
 * Formato: párrafos separados por línea en blanco; una línea que empieza con «## » es un subtítulo y «- » una viñeta.
 */

// «b» (11 oct 2026, noche): la v1 sale sin computer use (DECISIONES #11); los términos ya no lo ofrecen.
// 17 oct 2026 (0.1.2): computer use vuelve en macOS y Windows; los términos dicen cómo funciona y quién responde.
// 29 oct 2026 (0.2.15): la licencia dice lo que es (Apache-2.0, código abierto: antes decía «no es una venta del código…
// no puedes redistribuirlo», que contradecía el LICENSE.txt empaquetado) y los términos nombran los tres niveles de
// permisos. El modo Autónomo tiene su propio texto y su propia aceptación (server/src/cliente/consentimiento-autonomia.ts).
export const VERSION_TEXTOS = 'borrador-2026-10-29'
export const AVISO_BORRADOR = 'Borrador pendiente de revisión legal. Puede cambiar antes de la versión final.'

export interface DocumentoLegal { id: 'privacidad' | 'terminos' | 'licencia'; titulo: string; resumen: string; cuerpo: string }

export const PRIVACIDAD: DocumentoLegal = {
  id: 'privacidad',
  titulo: 'Aviso de privacidad',
  resumen: 'Tu cerebro vive en tu computadora. Sin tu permiso explícito no sale nada.',
  cuerpo: `## Quién es responsable
[COMPLETAR: nombre o razón social y domicilio del responsable] («nosotros») es responsable del tratamiento de los datos personales descritos en este aviso, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente en México.

## Qué datos se quedan en tu computadora
Arbrain funciona en tu máquina. Tus conversaciones, tu memoria, tus archivos, tus lienzos y tu configuración se guardan en carpetas de tu computadora. Nosotros no tenemos acceso a ellos.

Tus llaves de acceso a modelos de IA (Anthropic, OpenRouter) se guardan en el llavero de tu sistema operativo y solo se usan para hablar con esos proveedores en tu nombre.

## Qué viaja a terceros por tu decisión
Cuando hablas con tu Levy, el texto de cada turno viaja al proveedor del modelo que elegiste (por ejemplo Anthropic u OpenRouter) con tu propia llave y bajo los términos de ese proveedor. Nosotros no vemos ese tráfico.

Si enciendes computer use (macOS y Windows), las capturas de tu pantalla que tu Levy necesita para trabajar viajan igual: a ese proveedor, con tu llave. Lo que esté a la vista en tu pantalla puede ir en ellas.

## Monitoreo de cohorte (opcional, apagado por defecto)
Si lo activas, Arbrain envía una vez al día solo cifras agregadas para acompañarte en el programa:
- cuántas sesiones tuviste cada día,
- cuántas acciones de venta y cierres registraste,
- el monto total facturado por día y moneda.
Nunca se envía el texto de tus conversaciones, ni nombres, correos o datos de tus clientes o de otras personas. Puedes ver exactamente qué se enviaría antes de activarlo y apagarlo cuando quieras en Ajustes. Los datos financieros se tratan con tu consentimiento expreso, que das al activar el interruptor.

## Finalidades
Necesaria: dar seguimiento a tu avance dentro del programa (solo si activas el monitoreo).
Secundarias: ninguna. No usamos tus datos para publicidad ni los vendemos.

## Derechos ARCO y revocación
Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos, y revocar tu consentimiento, escribiendo a [COMPLETAR: correo de privacidad]. Apagar el monitoreo detiene los envíos al instante.

## Conservación y seguridad
[COMPLETAR: plazo de conservación, p. ej. 12 meses después de terminar el programa]. Los datos recibidos se guardan cifrados y solo los consulta el responsable.

## Cambios a este aviso
Si cambia, Arbrain te mostrará la versión nueva y te pedirá aceptarla de nuevo.`,
}

export const TERMINOS: DocumentoLegal = {
  id: 'terminos',
  titulo: 'Términos de uso',
  resumen: 'Tú controlas a tus agentes y eres responsable de lo que autorizas.',
  cuerpo: `## El servicio
Arbrain es software que se instala y corre en tu computadora. Te permite trabajar con agentes de IA («tu Levy») que leen y escriben en la carpeta de tu cerebro, trabajan contigo en el chat y, si tú lo enciendes en macOS o Windows, operan tu computadora.

## Tus llaves y tus costos
Usas tus propias llaves (Anthropic, OpenRouter u otras). Eres responsable de su costo, de guardarlas y de cumplir los términos de cada proveedor. Si usas una suscripción personal en lugar de una llave de API, revisa que los términos de ese proveedor lo permitan.

## Agentes y computer use
Los agentes actúan en tu computadora. Tú eliges cuánto te preguntan antes de actuar: «Preguntar siempre», «Automático en mi carpeta» (te pide confirmar con un clic antes de enviar, pagar, borrar o publicar y antes de lo que sale de tu computadora) o «Autónomo», que actúa sin pedirte un clic en cada paso y que aceptas aparte, con su propio texto, sus dos casillas y un registro que puedes retirar. En cualquier nivel, Arbrain no mueve dinero ni entra a tu banco, no toca tus llaves ni contraseñas y no borra en masa. Tú decides qué autorizas y eres responsable de ello.

Computer use (que un agente mire tu pantalla, haga clic y escriba en tus apps) existe en macOS y Windows, no en Linux. Viene apagado y se apaga cada vez que cierras la app (en «Autónomo» queda como lo dejaste); solo tú lo enciendes, desde la app. Mientras está encendido, el agente toma capturas de tu pantalla que se envían al proveedor del modelo que elegiste. No lo uses con tu banco, pagos, impuestos ni cripto: Arbrain bloquea esos sitios, pero ningún bloqueo es perfecto.

## Usos prohibidos
No uses Arbrain para enviar spam, extraer datos contra los términos de terceros, acceder sin autorización a sistemas o cuentas, ni vigilar a otras personas.

## Sin garantía
Arbrain se entrega «tal cual», sin garantía de resultados. Respalda tu información importante.

## Limitación de responsabilidad
En la medida que la ley lo permita, nuestra responsabilidad total se limita a [COMPLETAR: p. ej. lo pagado en los últimos 12 meses] y no cubre daños indirectos, pérdida de datos o de ganancias.

## Monitoreo y garantía del programa
El monitoreo de cohorte es opcional. Si la garantía de tu programa depende de medir tu uso, el contrato del programa lo dice; apagarlo no afecta tu licencia de uso.

## Ley y contacto
Estos términos se rigen por las leyes de México. [COMPLETAR: jurisdicción]. Incidentes de seguridad: [COMPLETAR: correo].`,
}

export const LICENCIA: DocumentoLegal = {
  id: 'licencia',
  titulo: 'Licencia',
  resumen: 'Código abierto bajo Apache-2.0: úsalo, modifícalo y compártelo. La marca Arbrain no va incluida.',
  cuerpo: `## Lo que recibes
Arbrain es software de código abierto bajo la licencia Apache License 2.0 (el archivo LICENSE.txt que viaja con la app). Recibes el código y el derecho a usarlo, copiarlo, modificarlo y distribuirlo, también con fines comerciales, en los términos de esa licencia.

## Lo que puedes hacer
- Usar Arbrain en tus computadoras para tu propio trabajo y el de tu negocio.
- Modificarlo, adaptarlo y redistribuirlo, con o sin cambios, conservando los avisos de copyright y de licencia y señalando lo que cambiaste.

## Lo que la licencia no incluye
- La marca Arbrain, el nombre Levy y los logotipos no se licencian: no presentes una copia modificada como si fuera Arbrain ni uses la marca para tu producto sin permiso.
- El Acompañamiento Arbrain es un servicio aparte, con sus propios términos; la licencia del código no lo cubre.

## Marca
Arbrain es una marca [COMPLETAR: titular y estado del registro ante el IMPI].

## Sin garantía
Como dice la Apache-2.0 (secciones 7 y 8), el software se entrega «tal cual», sin garantías, y los autores no responden por daños derivados de su uso. Lo que guardaste en tu computadora es tuyo.`,
}

export const DOCUMENTOS_LEGALES: readonly DocumentoLegal[] = [PRIVACIDAD, TERMINOS, LICENCIA]
