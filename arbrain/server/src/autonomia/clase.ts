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

// ---------- Soporte técnico a la cohorte (4 nov 2026) ----------

/** La plataforma de la cohorte: su dominio y el repo público que se puede enlazar (de la instalación, nunca literal aquí). */
export interface PlataformaCohorte { dominio: string; repo?: string }

/** Lo que hace falta para decidir si una respuesta a un alumno es soporte: a dónde va, qué dice y qué preguntó. */
export interface SenalesSoporte {
  /** Dónde se publica: el hilo, comentario o DM de la plataforma. */
  url?: string
  /** El texto EXACTO que saldría. */
  texto: string
  /** Lo que escribió el alumno (si se sabe): un precio o una queja en la pregunta también la sacan de soporte. */
  pregunta?: string
}

/** Solo la plataforma (o un subdominio), por https, sin usuario ni puerto. */
export function esDePlataforma(url: string | undefined, dominio: string): boolean {
  try {
    const u = new URL(url ?? ''), d = dominio.toLowerCase().replace(/^\.+|\.+$/g, '')
    const host = u.hostname.toLowerCase()
    return !!d && u.protocol === 'https:' && !u.username && !u.password && !u.port && (host === d || host.endsWith(`.${d}`))
  } catch { return false }
}

/** Lo técnico o de uso que firmó el dueño el 24 oct: instalar, actualizar, permisos, teléfono, cómo funciona. */
const TECNICO = /\b(instal\w*|actualiz\w*|permis\w*|tel[eé]fono|celular|iphone|android|c[oó]mo (funciona|se usa|lo uso|uso|hago|le hago|cambio|activo|conecto|abro|configuro|entro)|llaves?|api|token|error\w*|falla\w*|no (me )?(abre|carga|funciona|responde|aparece|deja|conecta|arranca|sale)|claude( code)?|ajustes|configur\w*|reinici\w*|terminal|windows|mac(os)?|linux|versi[oó]n|bot[oó]n|pantalla|conect\w*|sesi[oó]n|contrase[ñn]a|carpeta|archivo|descarg\w*|navegador|extensi[oó]n|openrouter|anthropic|groq|suscripci[oó]n de claude|plan (pro|max) de claude|qr|tailscale|micr[oó]fono|c[aá]mara|notificaci\w*|dictar|voz|skill\w*)\b/i

/**
 * Lo que siempre es de la persona (SIEMPRE_SUYO), en lo que escribió el alumno o en la respuesta. El dinero que cuenta es
 * el del programa (precio, pagos, cobranza, reembolsos), no «con llave se cobra por uso» de un proveedor: eso es técnico.
 */
const SIEMPRE_SUYO_RE: { que: string; re: RegExp }[] = [
  { que: 'precios', re: /\b(precio\w*|cu[aá]nto (cuesta|vale|sale|cobras?)|descuento\w*|beca\w*|d[oó]lares|usd|mxn)\b|\$\s?\d/i },
  { que: 'cobranza', re: /\b(cobranza|cobro\w*|te cobr(o|amos|aremos|ar[eé])|pag(o|os|ar|aste|u[eé]|ue|ado|ada|ando)|mensualidad\w*|cuota\w*|parcialidad\w*|abono\w*|adeudo\w*|deb(o|es) (el|la|un)|factur\w*|polar|tarjeta de (cr[eé]dito|d[eé]bito)|datos de (la |tu )?tarjeta|transferencia\w*|cancelar (mi|el|tu|la) (programa|pago|suscripci[oó]n|acompa\w*)|dar(me|te|lo)? de baja)\b/i },
  { que: 'reembolsos', re: /\b(reembols\w*|devoluci[oó]n\w*|devu[eé]lv\w*|regres(a|e)n? (mi|el|tu) dinero)\b/i },
  { que: 'promesas a personas', re: /\b(promet\w*|garant\w*|te aseguro|te lo aseguro|sin falta|me comprometo|llamada|videollamada|uno a uno|1:1|agend\w*|demo day|te (va|van) a (llamar|marcar|escribir|contactar|confirmar)|(te|les) (llama|marca|escribe|contacta|confirma)\b|(va|van) a (llamarte|escribirte|marcarte|contactarte)|cu[aá]ndo (sale|habr[aá]|vas|va a|estar[aá])|(ma[ñn]ana|el (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)) (te|les|sale|queda|estar[aá]))\b/i },
  { que: 'mensajes delicados o personales', re: /\b(queja\w*|reclam\w*|molest\w*|frustr\w*|decepci\w*|enoj\w*|hart[oa]|estafa\w*|fraude|mal servicio|no sirve|no vale|abandon\w*|renunci\w*|me arrepient\w*|p[eé]rdida de tiempo|nadie (me )?responde|ansiedad|triste\w*|deprim\w*|me siento|salud|enferm\w*|familia\w*|divorci\w*|falleci\w*|duelo|(asunto|tema|algo) personal|contrato|abogad\w*|demanda)\b/i },
]

/** Fuera de la plataforma: WhatsApp, correo, teléfono de alguien, o mandar al alumno a otro canal. */
const FUERA_DE_ARBRAIN = /\b(whatsapp|whats|wa\.me|telegram|instagram|facebook|messenger|sms|por (correo|e-?mail|mail|tel[eé]fono|privado)|te (mando|escribo|env[ií]o|paso) (un |una |por |al )?(correo|e-?mail|mail|mensaje privado|whats\w*)|te (marco|llamo)|esc?r[ií]beme|m[aá]ndame (un )?(correo|mensaje|whats\w*)|mi (correo|n[uú]mero|celular|whats\w*))\b/i
/** URLs: solo la plataforma y el repo público de la instalación. */
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+|\bwww\.[^\s<>"'`)\]]+/gi
const urlPermitida = (u: string, p: PlataformaCohorte) => {
  const https = u.replace(/^www\./i, 'https://www.').replace(/^http:/i, 'https:')
  return esDePlataforma(https, p.dominio) || (!!p.repo && https.toLowerCase().startsWith(`https://${p.repo.toLowerCase().replace(/^https?:\/\//, '')}`))
}
/** Lo que no se le pega a nadie sin revisar (la misma regla del cron de la comunidad, auditoría A3). */
const PELIGROSO = /\b(curl|wget|iex|irm|sudo|powershell|pwsh|invoke-(expression|webrequest|restmethod))\b|\|\s*(sudo\s+)?(ba|z|da|k)?sh\b|chmod\s+\+x|rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r|`/i
/** Una llave en la respuesta nunca sale (las llaves se pegan dentro de la app, nunca en la comunidad). */
const LLAVE = /\b(sk-[a-z0-9-]{12,}|sk_[a-z0-9]{12,}|gsk_[a-z0-9]{12,}|ghp_[a-z0-9]{12,}|eyJ[a-z0-9_-]{20,})\b/i
const LARGO_MAX = 1500

/**
 * ¿Esta respuesta a un alumno es soporte (Levy la publica sola si la persona lo encendió) o contactar (tarjeta)? Puro.
 * Soporte exige TODO a la vez: va a la plataforma de la cohorte, lo que preguntó y lo que se responde es técnico o de uso, nada de lo que
 * siempre es de la persona (precios, cobranza, reembolsos, promesas, mensajes delicados), nada fuera de la plataforma, sin
 * enlaces ajenos, comandos ni llaves, y corta. Ante la duda, contactar: `motivo` dice por qué, en palabras de la persona.
 */
export function claseDeSoporte(s: SenalesSoporte, p: PlataformaCohorte | null): { clase: 'soporte' | 'contactar'; motivo: string } {
  const texto = (s.texto ?? '').trim(), pregunta = (s.pregunta ?? '').trim()
  const contactar = (motivo: string) => ({ clase: 'contactar' as const, motivo })
  if (!texto) return contactar('no hay texto que revisar')
  if (!p || !esDePlataforma(s.url, p.dominio)) return contactar('no va dentro de la plataforma de la cohorte')
  if (texto.length > LARGO_MAX) return contactar('la respuesta es larga')
  const todo = `${pregunta}\n${texto}`
  for (const { que, re } of SIEMPRE_SUYO_RE) {
    const hit = re.exec(todo)
    if (hit) return contactar(`toca ${que} («${hit[0].trim().slice(0, 30)}»)`)
  }
  const fuera = FUERA_DE_ARBRAIN.exec(todo)
  if (fuera) return contactar(`sale de la plataforma («${fuera[0].trim()}»)`)
  const ajena = (texto.match(URL_RE) ?? []).map(u => u.replace(/[.,;:!?»]+$/, '')).find(u => !urlPermitida(u, p))
  if (ajena) return contactar(`trae un enlace fuera de la plataforma (${ajena.slice(0, 50)})`)
  const peligro = PELIGROSO.exec(todo)
  if (peligro) return contactar(`trae un comando que no se pega sin revisar («${peligro[0].trim()}»)`)
  if (LLAVE.test(todo)) return contactar('trae algo que parece una llave')
  if (!TECNICO.test(todo)) return contactar('no es una duda técnica o de uso')
  return { clase: 'soporte', motivo: 'duda técnica o de uso dentro de la plataforma' }
}
