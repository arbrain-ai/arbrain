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
 * 1 nov 2026 (integración del tour): el recorrido de Levy viene justo debajo y explica la app, el freno y la privacidad;
 * este mensaje queda en lo esencial y ya no anuncia la edición de video «en una versión próxima».
 */
import { tr, trMarca } from '@/shared/i18n'
import { FUENTE_TOUR } from '../lib/tour'

/** Los tres pedidos para empezar. `texto` es lo que se envía tal cual al tocar el botón. */
export const PEDIDOS_BIENVENIDA = [
  { etiqueta: trMarca('Entrevístame'), texto: trMarca('Entrevístame para conocer mi negocio'), para: trMarca('te hago preguntas y guardo lo importante en tu memoria.') },
  { etiqueta: trMarca('Mis prioridades'), texto: trMarca('Ayúdame a decidir las prioridades de mi semana'), para: trMarca('juntos decidimos qué mueve tu negocio y qué sobra.') },
  { etiqueta: trMarca('Mi cerebro'), texto: trMarca('Explícame cómo funciona mi cerebro'), para: trMarca('te muestro sus partes y cómo crece.') },
] as const

/**
 * Cómo se muestra al alumno que no dio su nombre (pie de la barra, A/B ronda 3). Con nombre, su primer nombre.
 * El saludo del chat vacío no dice «Buenas tardes, Tú»: sin nombre, saluda sin nombre.
 */
export const NOMBRE_SIN_DAR = trMarca('Tú')
export function nombreVisible(nombre?: string | null): string {
  return nombre?.trim().split(/\s+/)[0] || NOMBRE_SIN_DAR
}

/** Marca del mensaje de bienvenida en `chat_messages.metadata.source`: el chat pinta los botones solo bajo él. */
export const FUENTE_BIENVENIDA = 'bienvenida'

/** Línea de «dónde vivo» del primer mensaje. En el servidor (29 oct 2026) no hay apps ni voz del sistema que usar. */
export const VIVO_EN_SERVIDOR = trMarca('Vivo en tu servidor, prendido siempre: me abres desde el navegador de cualquier computadora o desde tu teléfono con Tailscale, aunque tu computadora esté apagada.')

/** El nivel de permisos que eligió (0.2.15): cambia la línea de «cuánto te pregunto» y la de computer use. */
export type ModoBienvenida = 'preguntar' | 'carpeta' | 'autonomo'

export function mensajeBienvenida(nombre?: string | null, opciones: { computerUse?: boolean; servidor?: boolean; modo?: ModoBienvenida } = {}): string {
  const autonomo = opciones.modo === 'autonomo'
  const computerUse = opciones.computerUse
    ? (autonomo
      ? tr('- Trabajo con tus archivos, tu memoria, el lienzo y tu calendario (en el panel de la derecha). Computer use (que use tu pantalla y tus apps) viene apagado: lo enciendes en Ajustes › Esta computadora y en modo Autónomo queda como lo dejes.')
      : tr('- Trabajo con tus archivos, tu memoria, el lienzo y tu calendario (en el panel de la derecha). Computer use (que use tu pantalla y tus apps) viene apagado: lo enciendes en Ajustes › Esta computadora y se apaga cada vez que cierras la app.'))
    : tr('- Trabajo con tus archivos, tu memoria, el lienzo y tu calendario (en el panel de la derecha). Computer use (que use tu pantalla y tus apps) no está disponible en este sistema.')
  const permisos = autonomo
    ? tr('- Elegiste el modo Autónomo: hago lo que me pides sin pedirte un clic en cada paso. Nunca toco tu dinero ni tus contraseñas, no borro en masa y te enseño antes lo que vaya a muchas personas o a alguien que no nombraste. En el botón del modelo, junto a donde escribes, lo cambias y está «Pausar todo».')
    : opciones.modo === 'carpeta'
      ? tr('- Elegiste «Automático en mi carpeta»: dentro de tu cerebro trabajo sin preguntar; antes de enviar, pagar, borrar, publicar o salir a internet te pido un clic. Para que deje de preguntar, toca el botón del modelo y elige «Autónomo».')
      : tr('- Antes de enviar, pagar, borrar o publicar algo te pido confirmación con un clic. Sin tu clic, no pasa.')
  const hola = nombre?.trim() ? tr('Hola, {nombre}. Soy Levy.', { nombre: nombreVisible(nombre) }) : tr('Hola. Soy Levy.')
  const vivo = opciones.servidor
    ? tr('{vivo} Trabajo con tu cerebro: la carpeta donde guardamos lo que sabes, lo que decides y cómo trabajas. Hoy está casi vacía; se llena conversando.', { vivo: tr(VIVO_EN_SERVIDOR) })
    : tr('Vivo en tu computadora y trabajo con tu cerebro: la carpeta donde guardamos lo que sabes, lo que decides y cómo trabajas. Hoy está casi vacía; se llena conversando.')
  return `${hola} ${vivo}

${tr('**Para empezar, toca uno de los botones de abajo o escríbeme lo tuyo.**')}

${permisos}
${computerUse}
${opciones.servidor ? tr('- Tus llaves viven en tu servidor, en un archivo que solo lee Arbrain; nunca viajan a GitHub.') : tr('- Tus llaves están en el llavero de tu sistema y tus conversaciones se quedan aquí; el programa solo recibe cifras si lo activas en Ajustes › Privacidad.')}`
}

const fuenteDe = (m: { metadata?: unknown }) => (m.metadata as { source?: unknown } | undefined)?.source

/**
 * ¿La conversación es solo el mensaje de bienvenida (y, desde el 1 nov 2026, los capítulos del tour de Levy)? Entonces el
 * chat pinta los tres pedidos como botones. En cuanto la persona escribe, desaparecen.
 */
export function soloBienvenida(mensajes: ReadonlyArray<{ role: string; metadata?: unknown }>): boolean {
  if (!mensajes.length || mensajes[0].role !== 'assistant' || fuenteDe(mensajes[0]) !== FUENTE_BIENVENIDA) return false
  return mensajes.slice(1).every(m => m.role === 'assistant' && fuenteDe(m) === FUENTE_TOUR)
}
