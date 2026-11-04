/**
 * ¿En qué clase de la política cae una acción que el freno marcó como irreversible? (autonomía v2, 3 nov 2026). Puro.
 *
 * El freno sigue decidiendo QUÉ es irreversible por su vocabulario y su contexto; aquí solo se separa, dentro de
 * «enviar un formulario», lo que es configurar un servicio (crear una llave, una cuenta, guardar un ajuste) de lo que
 * contacta a una persona. Ante la duda, contactar: la clase reversible exige TODAS las señales a favor.
 *
 * Configurar exige: el botón dice crear/guardar/generar/agregar/actualizar… (no «enviar», «publicar», «pagar» ni
 * «borrar»), la página no es un chat, correo o red social, ni el botón, ni su formulario, ni su diálogo hablan de
 * mensajes, invitaciones, miembros, contacto o dinero, y la URL no es de cobro.
 */
import type { Clase } from './politica.js'

/** Lo que hace falta del elemento (sale de la extensión: `InfoElemento`, o del árbol AX). */
export interface SenalesAccion {
  /** Texto del botón o control. */
  etiqueta?: string
  /** Etiqueta y texto visible del formulario que se envía. */
  formulario?: string
  /** Texto del diálogo donde vive el botón. */
  dialogo?: string
  /** Ruta de ancestros legibles. */
  ancestros?: string[]
  /** A dónde va el formulario (`action`). */
  accion?: string
  url?: string
}

/** Chats, correo y redes: ahí un formulario casi siempre llega a una persona. */
export const SITIO_DE_PERSONAS = /^https?:\/\/([a-z0-9-]+\.)*(web\.whatsapp\.com|whatsapp\.com|mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|proton\.me|x\.com|twitter\.com|linkedin\.com|instagram\.com|messenger\.com|facebook\.com|threads\.net|tiktok\.com|youtube\.com|reddit\.com|slack\.com|discord\.com|telegram\.org|t\.me|skool\.com|calendly\.com|cal\.com)\b/i

/**
 * Verbos de configurar: el botón crea o ajusta algo propio. «Siguiente», «Continuar» o «Listo» no cuentan: en un
 * formulario de varios pasos no dicen qué sale al final.
 */
const CONFIGURAR = /^\s*(\+\s*)?(create|crear|crea|generate|generar|genera|new|nueva|nuevo|add|agregar|añadir|anadir|save|guardar|guarda|update|actualizar|apply|aplicar|enable|activar|habilitar|disable|desactivar|connect|conectar|rename|renombrar|set ?up|configure|configurar|sign ?up|registr(arme|arse|ar)|create account|crear cuenta|copy|copiar|regenerate|regenerar|reveal|mostrar|verify|verificar)\b/i

/** Señales de que lo que sale llega a una persona. */
const PERSONAS = /\b(mensajes?|messages?|chat|dm|reply|respond\w*|respuesta|comment\w*|comentari\w*|invit\w*|share|compart\w*|contact\w*|cont[aá]ct\w*|destinatari\w*|recipients?|notif\w*|whatsapp|sms|llamad\w*|call|menci[oó]n|mention|members?|miembros?|colaborador\w*|collaborators?|users?|usuarios?|equipo|team|invitad\w*|guests?|attendees?|participantes?|soporte|support|ticket|feedback|newsletter|suscrib\w*|subscribe\w*|followers?|seguidores?|para:|to:|cc:)\b/i

/** Si el botón además envía, publica, paga, borra o comparte («Crear y enviar»), no es solo configurar. */
const SALIDA = /\b(env[ií]\w*|reenv[ií]\w*|reply\w*|respond\w*|forward\w*|send\w*|submit\w*|mand\w*|public\w*|publish\w*|post\w*|tuit\w*|tweet\w*|pag\w*|pay\w*|compr\w*|buy|borr\w*|elimin\w*|delet\w*|remov\w*|invit\w*|compart\w*|share\w*)\b/i

/** Dinero: aunque el botón diga «guardar», no es configurar. */
const DINERO = /\b(pag\w*|pay\w*|billing|factur\w*|invoice\w*|checkout|card|tarjeta|cr[eé]dit\w*|credits?|top.?up|recarg\w*|subscription|suscripci[oó]n|upgrade|purchase|compr\w*|precio|price|pricing|plan(es)? de pago|wallet|cartera|cobr\w*|charge|fondos|funds|cvv|cvc)\b/i
const URL_DINERO = /\/(billing|checkout|payments?|pay|pagos?|subscribe|subscription|upgrade|pricing|plans?|credits?|wallet|invoices?|factura\w*)(\b|\/|\?|$)/i

/** Términos legales: aceptar o firmar. */
const LEGAL = /\b(acepto|aceptar (los )?t[eé]rminos|accept (the )?terms|i agree|agree|estoy de acuerdo|firmar|sign (the )?(contract|agreement)|contrato|t[eé]rminos y condiciones|terms of service)\b/i

/**
 * Clase de un envío de formulario (o de un botón que el freno marcó como «enviar»). Devuelve `configurar` solo con todas
 * las señales a favor; si no, `contactar` (lo que el freno ya pedía). `legal` si el botón acepta términos.
 */
export function claseDeEnvio(s: SenalesAccion): Clase {
  const etiqueta = (s.etiqueta ?? '').trim()
  if (LEGAL.test(etiqueta)) return 'legal'
  if (!etiqueta || !CONFIGURAR.test(etiqueta) || SALIDA.test(etiqueta)) return 'contactar'
  if (s.url && SITIO_DE_PERSONAS.test(s.url)) return 'contactar'
  const contexto = [etiqueta, s.formulario, s.dialogo, ...(s.ancestros ?? []).slice(0, 6), s.accion, s.url ? rutaDe(s.url) : ''].filter(Boolean).join(' · ').replace(/[/_-]+/g, ' ')
  if (PERSONAS.test(contexto)) return 'contactar'
  if (DINERO.test(contexto)) return 'pagar'
  if (s.url && URL_DINERO.test(rutaDe(s.url))) return 'pagar'
  return 'configurar'
}

const rutaDe = (url: string) => { try { return new URL(url).pathname } catch { return url } }

/** Clase de una categoría del freno que no es un envío (pagar, borrar, publicar). null = la política no la cubre. */
export function claseDeCategoria(categoria: string): Clase | null {
  if (categoria === 'pagar') return 'pagar'
  if (categoria === 'borrar') return 'borrar'
  if (categoria === 'publicar') return 'publicar'
  if (categoria === 'enviar' || categoria === 'boton_sin_texto') return 'contactar'
  return null
}

/** Campos donde una app guarda una credencial de servicio (no una contraseña de persona ni datos de pago). */
const CAMPO_CREDENCIAL = /\b(api.?key|api.?token|token|secret|secreto|clave de api|llave( de api)?|access.?key|webhook)\b/i

/**
 * Freno nativo (autonomía v2, punto 4): ¿escribir una llave en el campo de ajustes de una app que la persona pidió
 * configurar es configurar? Solo si es una llave o token (nunca contraseñas, tarjetas, CLABE, CURP ni RFC), el campo dice
 * que es una credencial y NO es una app de chat, una página web ni un compositor.
 */
export function esCredencialEnAjustes(s: { motivo: string; pistasCampo: string; enChat: boolean; web: boolean; compositor: boolean }): boolean {
  if (s.enChat || s.web || s.compositor) return false
  if (!/llave o token|campo de/.test(s.motivo) || /contrase|tarjeta|clabe|curp|rfc|password|pin|cvv|cvc/i.test(s.motivo)) return false
  return CAMPO_CREDENCIAL.test(s.pistasCampo)
}

/** El dominio de una URL para «Lo que hice solo» (sin ruta ni parámetros: pueden traer datos). */
export function dominioDe(url?: string): string | undefined {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : undefined } catch { return undefined }
}
