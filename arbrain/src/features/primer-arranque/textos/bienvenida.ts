/**
 * El primer mensaje de Levy al terminar el primer arranque (11 oct 2026). Orienta sin abrumar: quién es, qué puede
 * hacer hoy, tres cosas para empezar y dónde se cambia lo que se eligió. Editable.
 *
 * v1.1 (12 oct, A/B del primer arranque): los tres pedidos son además botones de un clic bajo el mensaje
 * (`PEDIDOS_BIENVENIDA`, los pinta el chat) y el mensaje solo promete lo que la v1 trae: sin calendario conectado, sin
 * edición de video y sin computer use, dicho una vez como límite.
 * A/B ronda 3: los pedidos ya no se repiten en el texto (viñetas + botones); el mensaje invita a tocar los botones y
 * el «para qué» de cada uno va en el botón.
 * 0.1.2 (17 oct 2026, revierte DECISIONES #11): en macOS y Windows computer use existe; el mensaje dice cómo se
 * enciende y que se apaga en cada apertura. En Linux sigue nombrándose como límite.
 */

/** Los tres pedidos para empezar. `texto` es lo que se envía tal cual al tocar el botón. */
export const PEDIDOS_BIENVENIDA = [
  { etiqueta: 'Entrevístame', texto: 'Entrevístame para conocer mi negocio', para: 'te hago preguntas y guardo lo importante en tu memoria.' },
  { etiqueta: 'Mis prioridades', texto: 'Ayúdame a decidir las prioridades de mi semana', para: 'juntos decidimos qué mueve tu negocio y qué sobra.' },
  { etiqueta: 'Mi cerebro', texto: 'Explícame cómo funciona mi cerebro', para: 'te muestro sus partes y cómo crece.' },
] as const

/**
 * Cómo se muestra al alumno que no dio su nombre (pie de la barra, A/B ronda 3). Con nombre, su primer nombre.
 * El saludo del chat vacío no dice «Buenas tardes, Tú»: sin nombre, saluda sin nombre.
 */
export const NOMBRE_SIN_DAR = 'Tú'
export function nombreVisible(nombre?: string | null): string {
  return nombre?.trim().split(/\s+/)[0] || NOMBRE_SIN_DAR
}

/** Marca del mensaje de bienvenida en `chat_messages.metadata.source`: el chat pinta los botones solo bajo él. */
export const FUENTE_BIENVENIDA = 'bienvenida'

export function mensajeBienvenida(nombre?: string | null, opciones: { computerUse?: boolean } = {}): string {
  const computerUse = opciones.computerUse
    ? '- Hoy trabajo con tus archivos, tu memoria, el lienzo y tu calendario, aquí en el chat (el calendario vive en el panel de la derecha: ábrelo con el botón del panel arriba a la derecha, o pídemelo). Computer use (que yo use tu pantalla y tus apps) viene apagado: lo enciendes en Ajustes › Esta computadora y se apaga cada vez que cierras la app. La edición de video llega en una versión próxima.'
    : '- Hoy trabajo con tus archivos, tu memoria, el lienzo y tu calendario, aquí en el chat (el calendario vive en el panel de la derecha: ábrelo con el botón del panel arriba a la derecha, o pídemelo). Computer use (que yo use tu pantalla y tus apps) no está disponible en este sistema; la edición de video llega en una versión próxima.'
  const hola = nombre?.trim() ? `Hola, ${nombreVisible(nombre)}. Soy Levy.` : 'Hola. Soy Levy.'
  return `${hola} Vivo en tu computadora y trabajo con tu cerebro: la carpeta donde guardamos lo que sabes, lo que decides y cómo trabajas. Hoy está casi vacía; se llena conversando.

**Para empezar, toca uno de los botones de abajo o escríbeme lo tuyo.**

**Lo que conviene saber:**
- Antes de enviar, pagar, borrar o publicar algo te pido confirmación con un clic. Sin tu clic, no pasa.
${computerUse}
- Tus llaves están en el llavero de tu sistema. Cámbialas en Ajustes › Llaves.
- Tus conversaciones se quedan aquí. El monitoreo del programa solo envía cifras si lo activas, y se decide en Ajustes › Privacidad.

¿Por dónde empezamos?`
}

/** ¿La conversación es solo el mensaje de bienvenida? Entonces el chat pinta los tres pedidos como botones. */
export function soloBienvenida(mensajes: ReadonlyArray<{ role: string; metadata?: unknown }>): boolean {
  if (mensajes.length !== 1) return false
  const m = mensajes[0]
  return m.role === 'assistant' && (m.metadata as { source?: unknown } | undefined)?.source === FUENTE_BIENVENIDA
}
