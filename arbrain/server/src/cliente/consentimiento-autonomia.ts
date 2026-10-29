/**
 * El texto que la persona acepta para el modo «Autónomo» (0.2.15, 29 oct 2026; docs/builds/autonomia-alumno-2026-10-29).
 *
 * Fuente única: la app lo pide al daemon (`GET /permisos` › `texto`) y lo muestra tal cual; al aceptar manda la versión y
 * la huella, y el daemon solo registra la aceptación si coinciden con lo que tiene empaquetado (nadie acepta un texto que
 * no leyó). Cambiar una palabra sube `VERSION_AUTONOMIA`: quien tenga una versión anterior vuelve a «Automático en mi
 * carpeta» hasta que acepte la nueva.
 *
 * ⚠️ BORRADOR PENDIENTE DE REVISIÓN LEGAL (decisión 4 de la SPEC, Daniel 29 oct): sale marcado como borrador, como los
 * textos legales del primer arranque (`AVISO_BORRADOR`). Los puntos para el abogado viven en TERMINOS-borrador.md.
 *
 * Formato: párrafos separados por línea en blanco; «## » subtítulo; «- » viñeta.
 */
import { createHash } from 'node:crypto'

export const VERSION_AUTONOMIA = 'autonomia-v1-borrador-2026-10-29'
export const AVISO_BORRADOR_AUTONOMIA = 'Borrador pendiente de revisión legal. Puede cambiar antes de la versión final; si cambia, te lo volveremos a pedir.'

export const TITULO_AUTONOMIA = 'Qué significa el modo autónomo'

/** Las dos casillas (clickwrap): nacen vacías; sin las dos, no se acepta. */
export const CASILLAS_AUTONOMIA = [
  'He leído esto y entiendo que en modo autónomo mi cerebro actúa sin pedirme un clic en cada paso.',
  'Acepto que soy responsable de lo que le pido y de lo que hace en mi nombre.',
] as const

export const TEXTO_AUTONOMIA = `Arbrain es un programa de código abierto que corre en tu computadora. Tu cerebro (Levy o el nombre que le pongas) usa un modelo de inteligencia artificial con tu llave y actúa en tu computadora: lee y escribe archivos, corre comandos, abre páginas, usa tus aplicaciones y, si se lo pides, manda mensajes en tu nombre.

## 1. Qué hace en modo autónomo
En modo autónomo tu cerebro hace lo que le pides sin pedirte un clic en cada paso. Eso incluye:
- crear, cambiar y borrar archivos dentro de las carpetas a las que le diste acceso;
- correr comandos y programas en tu computadora;
- abrir páginas web y usar aplicaciones con su propio cursor;
- escribir y enviar mensajes, correos y publicaciones cuando tú se lo pides en la conversación.

## 2. Lo que no hace ni en modo autónomo (la red mínima)
- Dinero: no paga, no transfiere, no compra ni entra a tu banco, casa de bolsa, exchange o portal de impuestos. Esto no se puede quitar en esta versión.
- Tus secretos: no lee tus llaves, contraseñas guardadas, llaveros ni perfiles del navegador.
- Sus propios permisos: no cambia los ajustes ni los ganchos de tu cerebro; eso lo haces tú en Ajustes.
- Borrados grandes: no borra tu carpeta entera, ni muchos archivos de un golpe, ni fuera de tus carpetas. Si hace falta, te explica cómo hacerlo tú.
- Envíos a muchas personas: mandar el mismo mensaje a un grupo o a varias personas a la vez te muestra a quién y qué antes de salir.
- Lo que no pediste: si después de leer una página, un correo o tu pantalla quiere mandar algo a una persona, número, correo o dirección que tú no nombraste, te pregunta.
- Rutinas: lo que corre sin ti delante deja todo envío a terceros como borrador, listo para salir con tu clic.

## 3. Los riesgos, dichos claro
- La IA se equivoca. Puede entender mal lo que pediste, mandar un mensaje a la persona equivocada, cambiar un archivo que no querías o borrar algo. Lo que sale de tu computadora (un mensaje enviado, un correo, un post) no se puede deshacer.
- Lo de afuera puede engañarla. Una página, un correo o un documento puede traer instrucciones escondidas («inyección de instrucciones»). Tu cerebro las trata como datos, pero ningún sistema lo evita al cien por ciento.
- Gasta tu saldo. Cada tarea consume créditos de tu llave de IA. Pon un tope de gasto en tu proveedor.
- Actúa como tú. Lo que tu cerebro envía o publica sale desde tus cuentas y con tu nombre.
- En Windows no hay caja de arena: los comandos corren directo en tu computadora.

## 4. Lo que tienes de tu lado
- Pausar todo, a un clic, detiene de inmediato todo lo que esté haciendo.
- Lo que hizo Levy (Ajustes › Permisos y seguridad) guarda cada acción con su hora, para que revises.
- Ver cambios y Deshacer devuelve tus archivos a como estaban antes de un mensaje (lo hecho con comandos y lo enviado afuera no se deshace).
- Puedes volver a un modo más cuidadoso cuando quieras, en Ajustes › Permisos y seguridad, en la píldora «Autónomo» o desde «Pausar todo».

## 5. Tu responsabilidad y la nuestra
Al elegir el modo autónomo:
- Entiendes que tu cerebro actuará en tu computadora y en tus cuentas sin pedirte confirmación en cada paso, con las excepciones de la sección 2.
- Aceptas que tú eres responsable de lo que le pides y de revisar lo que hace, y de las consecuencias de las acciones que realiza a partir de tus pedidos, incluidos mensajes enviados, archivos cambiados o borrados y gasto en tu proveedor de IA.
- Entiendes que Arbrain se entrega «tal cual» (AS IS), sin garantías de ningún tipo, como dice su licencia Apache-2.0, y que puede tener errores.
- En la medida que permita la ley aplicable, [NOMBRE LEGAL DEL PRESTADOR], el fundador de Arbrain y quienes contribuyen a Arbrain no responden por daños directos, indirectos, pérdida de datos, de ingresos, de reputación o de oportunidades que resulten del uso del modo autónomo.
- Nada de esto limita los derechos que la ley te da y que no se pueden renunciar.
- Te comprometes a no usar tu cerebro para enviar spam, suplantar a otros, acceder a sistemas sin permiso ni nada ilegal.

## 6. Cómo lo aceptas y cómo lo retiras
Marcas las dos casillas y pulsas «Empezar en modo autónomo». Se guarda en tu computadora la fecha y hora, la versión de este texto, su huella, el modo elegido y la versión de Arbrain. Puedes ver tu aceptación y retirarla en Ajustes › Permisos y seguridad.`

export const HUELLA_AUTONOMIA = createHash('sha256').update(`${VERSION_AUTONOMIA}\n${TEXTO_AUTONOMIA}`).digest('hex')

export interface TextoAutonomia { version: string; sha256: string; titulo: string; cuerpo: string; casillas: readonly string[]; aviso: string }
export const textoAutonomia = (): TextoAutonomia => ({ version: VERSION_AUTONOMIA, sha256: HUELLA_AUTONOMIA, titulo: TITULO_AUTONOMIA, cuerpo: TEXTO_AUTONOMIA, casillas: CASILLAS_AUTONOMIA, aviso: AVISO_BORRADOR_AUTONOMIA })

/** ¿Lo que la persona aceptó es exactamente el texto empaquetado? */
export const aceptacionCoincide = (version: unknown, sha256: unknown): boolean => version === VERSION_AUTONOMIA && sha256 === HUELLA_AUTONOMIA
