/**
 * Contacto de WhatsApp de las pruebas en vivo de manos (evidencias de la noche A y medición de velocidad). Ficticio por
 * defecto (red team 3 A-7: el código no lleva contactos reales); quien corre esas pruebas en su Mac pone el suyo en
 * `MANOS_CONTACTO_PRUEBA` (p. ej. el nombre con su emoji, tal como aparece en la lista de chats). Sin efectos.
 */
export const CONTACTO_PRUEBA = process.env.MANOS_CONTACTO_PRUEBA?.trim() || 'Contacto de prueba'

/** El nombre sin emojis ni símbolos: lo que se busca en las etiquetas de accesibilidad. */
export const NOMBRE_CONTACTO = CONTACTO_PRUEBA.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Expresión que encuentra el contacto en una etiqueta (`antes` = texto fijo delante, p. ej. «^» o «Mensajes en el chat con »). */
export const reContacto = (antes = ''): RegExp => new RegExp(`${antes}${escapar(NOMBRE_CONTACTO)}`)
