/**
 * La cita tiene que nombrar la acción que autoriza (red team 3 A-3). Nació en el freno web (6 oct); desde 0.1.2 la usan
 * también el freno nativo, el de navegación y el de la edición cliente: un «Hola Levy» o un «ordena mi escritorio» ya
 * no desbloquea un «Enviar». Puro.
 */
import { esEdicionCliente } from '../edicion.js'

/** Palabras que una cita de Daniel debe traer para autorizar cada categoría: un «envíalo» no autoriza pagar ni borrar. */
export const CUBRE: Record<string, RegExp> = {
  // «agenda/reserva la cita» es enviar el formulario de reserva (6 oct, prueba de /aplicar)
  // «guarda/crea/actualiza/aplica/activa X» también nombra el envío del formulario de X (16 oct: «Crea el cupón…, guarda los dos eventos del webhook» lo bloqueaba)
  enviar: /\b(env[ií]\w*|mand\w*|submit\w*|send\w*|formulario|registr\w*|inscrib\w*|suscrib\w*|respond\w*|contest\w*|confirm\w*|agend\w*|reserv\w*|guard(a|ar|alo|ala|en|es|e)|cre(a|ar|alo|ala|en)|actualiz\w*|aplic(a|ar|alo|ala)|activ(a|ar|alo|ala)|save|create|update)\b/i,
  boton_sin_texto: /\b(env[ií]\w*|mand\w*|submit\w*|send\w*|respond\w*|contest\w*|confirm\w*|guard(a|ar|alo|ala)|cre(a|ar|alo|ala))\b/i,
  publicar: /\b(public\w*|post\w*|tuit\w*|tweet\w*|sub(e|ir|elo|ela|id[oa])\b|compart\w*)\b/i,
  pagar: /\b(p[aá]g(a|ar|o|ue|ues|amos|alo|ala|ado)|compr\w*|cobr\w*|pay\w*|buy\w*|checkout|suscrib\w*|transfi\w*|transfer\w*|don(a|ar|alo|ativo)|dep[oó]sit\w*)\b/i,
  borrar: /\b(borr\w*|elimin\w*|delet\w*|quit(a|ar|alo|ala)|remov\w*|vac[ií]\w*|papelera)\b/i,
  transmitir_datos: /\b(escrib\w*|llen\w*|pon(lo|la|le|er|go)?|usa(r|lo|la)?|ingres\w*|captur\w*|correo|mail|e-mail|tel[eé]fono|n[uú]mero|tarjeta|contrase[nñ]a|clave|datos?|rfc|curp|clabe|token|login|inicia(r)? sesi[oó]n|entra con)\b/i,
  salir: /\b(sal(te|ir|go|ga)?(?=\s|$)|quit\w*|cierr\w*|cerrar|logout|log out|desconect\w*)\b/i,
  descartar: /\b(descart\w*|no guard\w*|borrador)\b/i,
  // Edición cliente 0.1.2: abrir o ejecutar algo (freno-cliente.ts) y URLs que actúan al abrirse (juicio-url.ts).
  ejecutar: /\b(ejecut\w*|corr(e|er|elo|ela|an)|run\w*|abr(e|ir|elo|ela|an)|open\w*|instal\w*|lanz(a|ar|alo|ala)|escrib\w*|pega\w*|comando)\b/i,
  url_con_efecto: /\b(borr\w*|elimin\w*|delet\w*|p[aá]g(a|ar|o|ue)|compr\w*|env[ií]\w*|mand\w*|public\w*|compart\w*|sal(te|ir)|cierr\w*|cerrar|logout|desuscrib\w*|cancel\w*|confirm\w*)\b/i,
  confirmar_peligro: /\b(borr\w*|elimin\w*|delet\w*|p[aá]g(a|ar|o|ue)|compr\w*|env[ií]\w*|mand\w*|public\w*|sal(te|ir)|descart\w*|confirm\w*)\b/i,
}


/** Sin acentos: «mándale», «bórralo» y «públicalo» nombran la acción igual que sin tilde (`\w` no cubre la «á»). */
const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')

/** ¿La cita nombra la acción de esta categoría? (sin la regla de largo; la usa también el freno web). */
export function nombraAccion(categoria: string, cita: unknown): boolean {
  const re = CUBRE[categoria]
  if (!re) return true
  if (typeof cita !== 'string') return false
  // Red team 5 rt5-4: «no envíes nada» nombra el verbo para prohibirlo. Cuenta solo una mención que no esté negada.
  const t = sinAcentos(cita)
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  for (const m of t.matchAll(g)) {
    const antes = t.slice(Math.max(0, m.index! - 40), m.index!)
    if (!NEGACION.test(antes)) return true
  }
  return false
}
/** Negación justo antes del verbo («no», «nunca», «ni», «sin», «no le», «don't»…), hasta dos palabras en medio. */
const NEGACION = /(?:^|[^\p{L}])(no|nunca|jamas|ni|sin|tampoco|evita|dont|don't|do not|never|not)\s+(?:[\p{L}']+\s+){0,2}$/iu

/**
 * Largo mínimo de una cita en la edición cliente. Fue 8 y luego 12 (contra «Hola Levy»); desde 0.2.16 basta una frase
 * no vacía: lo que protege es que nombre la acción sin negarla (`nombraAccion`) y que sea texto real del chat. Un
 * «mándalo» o «envíalo» de la persona vale (Windows, fundador: «sin frases de 12 caracteres»).
 */
export const CITA_MIN_CLIENTE = 1

/**
 * ¿La cita nombra la acción de esta categoría? En la instalación de Daniel no cambia nada (true) salvo en la web, que
 * ya lo exigía con `CUBRE` directamente. Categorías sin vocabulario (ventanas, pestañas) tienen su propia regla.
 */
export function citaCubre(categoria: string | undefined, cita: unknown, cliente = esEdicionCliente()): boolean {
  if (!cliente) return true
  if (typeof cita !== 'string' || cita.trim().length < CITA_MIN_CLIENTE) return false
  return !categoria || nombraAccion(categoria, cita)
}
