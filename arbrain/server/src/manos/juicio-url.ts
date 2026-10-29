/**
 * Freno de navegación (red team 2 A-2, 11 oct 2026; I7, I8, contrato §5): el mismo juicio para `navegar` (ventana propia
 * por comando) y para `web_abrir`/`web_navegar` (extensión, en el Chrome de la persona, con sus sesiones abiertas).
 *
 *   negar       (edición cliente) banca, pasarelas de pago, impuestos (SAT y equivalentes) y casas de cambio de
 *               criptomonedas: ahí Arbrain no navega ni con clic; la persona lo hace ella misma.
 *   cita + clic URL que hace algo con solo abrirla (`URL_CON_EFECTO`: salir, borrar, pagar, publicar, enviar): la cita
 *               textual de la persona (como siempre) y, en cliente, además su clic en la app (I8).
 *   clic        (edición cliente) posible exfiltración: query o fragmento de más de 64 caracteres, o datos que parecen
 *               base64/hex largos, hacia un dominio que la persona no aprobó en esta sesión. Al aprobarlo, ese dominio
 *               queda aprobado para la sesión del proceso de manos.
 *
 * Edición cliente 0.1.2 (red team 3 A-1, computer use encendido): ya no hay heurística de contenido que decida si una
 * URL «parece» exfiltrar. Toda navegación a un host que la persona no aprobó con su clic en esta sesión pide su clic
 * (el diálogo muestra la URL completa). Con el host aprobado, solo pasa sin clic una URL corta (ruta + query +
 * fragmento ≤ 256) sin señales de datos codificados y dentro de un presupuesto de 2 KB por host y sesión; al gastarlo,
 * otra vez clic. URLs de más de 2 048 caracteres, esquemas que no son http(s), credenciales en la URL y hosts de la
 * red local (localhost, IPs privadas, .local) se niegan. Cada etiqueta DNS nueva es un host nuevo: codificar datos en
 * subdominios cuesta un clic por intento.
 *
 * Instalación de Daniel: `navegar` conserva su freno de siempre (URL con efecto exige la cita); las herramientas web no
 * cambian (sin freno de navegación, como hasta hoy). Puro salvo `confirmacionHumana` (HTTP al daemon, solo en cliente).
 */
import { esEdicionCliente } from '../edicion.js'
import { confirmacionHumana, categoriaDe } from './confirmacion-humana.js'
import { URL_CON_EFECTO } from './navegador.js'
import { citaDelChat, modoManos, verificarCita, vozReciente, type ModoManos } from './politica.js'
import { citaCubre } from './cubre.js'
import { hostDe as host, hostNombradoEnVoz, parsearUrl as parsear, senalExfiltracion } from '../cliente/url.js'
import { sitioSensible } from '../cabina/chrome-guard.js'

/**
 * Dominios donde un agente nunca navega en la edición cliente (sufijos de host, sin `www.`), además de los sitios de
 * banca, pagos y cobros de la guardia de Chrome (`cabina/chrome-guard.ts › sitioSensible`, la lista genérica) y de
 * cualquier host con «bank», «banco» o «banca» en el nombre.
 */
export const DOMINIOS_PROTEGIDOS = [
  // Impuestos y gobierno fiscal
  'sat.gob.mx', 'irs.gov', 'agenciatributaria.gob.es', 'agenciatributaria.es', 'afip.gob.ar', 'arca.gob.ar', 'sii.cl', 'dian.gov.co',
  'sunat.gob.pe', 'receita.fazenda.gov.br', 'hmrc.gov.uk', 'cra-arc.gc.ca', 'imss.gob.mx', 'infonavit.org.mx',
  // Pasarelas de pago, billeteras y envíos de dinero
  'payoneer.com', 'venmo.com', 'cash.app', 'pay.google.com', 'wallet.google.com', 'squareup.com', 'checkout.com', 'adyen.com',
  'klarna.com', 'afterpay.com', 'skrill.com', 'westernunion.com', 'remitly.com', 'xoom.com', 'paddle.com', 'hotmart.com',
  'clip.mx', 'conekta.com', 'openpay.mx', 'spei.mx', 'banxico.org.mx',
  // Criptomonedas
  'coinbase.com', 'binance.com', 'kraken.com', 'bitso.com', 'crypto.com', 'okx.com', 'bybit.com', 'kucoin.com', 'metamask.io',
  // Bancos y casas de bolsa (además de la guardia de Chrome y la regla genérica)
  'nubank.com.br', 'caixabank.es', 'bancolombia.com', 'itau.com.br', 'bradesco.com.br', 'amex.com', 'discover.com',
  'schwab.com', 'fidelity.com', 'vanguard.com', 'robinhood.com', 'gbm.com', 'cetesdirecto.com', 'ing.es', 'ing.com', 'n26.com',
  'monzo.com',
  // Red team 3 (Bajo): faltaban
  'banorte.com.mx', 'mercadopago.com.ar', 'mercadopago.com.co', 'mercadopago.cl', 'mercadopago.com.br',
  'uniswap.org', 'ledger.com', 'trezor.io', 'paypal.com', 'paypal.me', 'stripe.com', 'wise.com', 'revolut.com', 'dineromail.com', 'spinbyoxxo.com.mx',
]
/** Hosts de banca por nombre (bank, banco, banca…): mejor negar de más que entrar a un banco. */
const HOST_BANCARIO = /(^|[.-])(?:[a-z0-9-]*bank[a-z0-9-]*|banco[a-z0-9-]*|banca[a-z0-9-]*|bancomer|banbajio|afirme)(\.|$)/i

export function dominioProtegido(url: string): string | null {
  const u = parsear(url)
  if (!u) return null
  const h = host(u)
  const d = DOMINIOS_PROTEGIDOS.find(x => h === x || h.endsWith('.' + x))
  if (d) return d
  const g = sitioSensible(url)
  if (g && ['banco', 'pagos', 'cobros'].includes(g.tipo)) return g.host
  return HOST_BANCARIO.test(h) ? h : null
}

/** Dominios que la persona aprobó con su clic en esta sesión del proceso de manos. */
const aprobados = new Set<string>()
export function dominioAprobado(url: string): boolean { const u = parsear(url); return !!u && aprobados.has(host(u)) }
/** Bytes de ruta + query + fragmento que cada host aprobado ya recibió sin clic en esta sesión (A-1). */
const gastado = new Map<string, number>()
export function _dominiosNavegacionParaPruebas(): Set<string> { gastado.clear(); return aprobados }

/** Topes de la edición cliente (A-1). */
export const URL_MAX = 2048
export const DATOS_SIN_CLIC = 256
export const PRESUPUESTO_HOST = 2048

const datosDe = (u: URL) => `${u.pathname}${u.search}${u.hash}`.length
/** Host de la red local: el navegador de la persona no es un túnel a su router, a su NAS ni al daemon. */
function hostLocal(h: string): boolean {
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) { const [a, b] = [Number(m[1]), Number(m[2])]; return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) }
  const v6 = h.replace(/^\[|\]$/g, '')
  if (v6.includes(':')) {
    // Red team 5 rt5-2: IPv4 dentro de IPv6 (::ffff:127.0.0.1, que la URL normaliza a ::ffff:7f00:1) y NAT64.
    const m4 = v6.match(/^(?:0*:)*:?ffff:(?:0*:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
    if (m4) { const n = (parseInt(m4[1], 16) << 16 | parseInt(m4[2], 16)) >>> 0; return hostLocal(`${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`) }
    const d4 = v6.match(/(\d+\.\d+\.\d+\.\d+)$/)
    if (d4) return hostLocal(d4[1])
    return v6 === '::1' || /^(fe80|fc|fd|::ffff)/i.test(v6) || v6 === '::' || /^0*:(0*:)*0*1$/.test(v6)
  }
  // Red team 5 rt5-2: servicios de DNS comodín que resuelven a la IP escrita en el nombre (rebinding a la red local).
  if (/(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me|vcap\.me|lacolhost\.com|localhost\.run|1u\.ms|rbndr\.us|ip6\.name|nip\.direct)$/.test(h)) return true
  return /(^|[.-])(127|10|0)[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3}([.-]|$)|(^|[.-])192[.-]168[.-]\d{1,3}[.-]\d{1,3}([.-]|$)|(^|[.-])172[.-](1[6-9]|2\d|3[01])[.-]\d{1,3}[.-]\d{1,3}([.-]|$)|(^|[.-])169[.-]254[.-]/.test(h)
}

/** A5 (0.2.15): ¿la persona nombró este sitio en el chat? (`cliente/url.ts › hostNombradoEnVoz`, con la voz del daemon). */
export function hostNombradoPorLaPersona(h: string, voz: readonly string[] = vozReciente()): boolean {
  return hostNombradoEnVoz(h, voz)
}

/** Juicio de la edición cliente para una URL ya parseada (sin tocar nada). */
function juzgarUrlCliente(url: string, modo: ModoManos = modoManos()): JuicioUrl {
  const u = parsear(url)
  if (!u) return { tipo: 'negar', categoria: 'url_invalida', motivo: `«${url.slice(0, 80)}» no es una URL` }
  if (!/^https?:$/.test(u.protocol)) return { tipo: 'negar', categoria: 'esquema', motivo: `el esquema ${u.protocol} no se abre (solo http y https)` }
  if (url.length > URL_MAX) return { tipo: 'negar', categoria: 'posible_exfiltracion', motivo: `la URL mide ${url.length} caracteres (tope ${URL_MAX})` }
  if (u.username || u.password) return { tipo: 'negar', categoria: 'posible_exfiltracion', motivo: 'la URL lleva usuario o contraseña' }
  const h = host(u)
  if (hostLocal(h)) return { tipo: 'negar', categoria: 'red_local', motivo: `${h} es de la red local (localhost, IP privada o .local)` }
  const d = dominioProtegido(url)
  if (d) return { tipo: 'negar', categoria: 'dominio_protegido', motivo: `${d} es banca, pagos, impuestos o criptomonedas: Arbrain no navega ahí` }
  if (URL_CON_EFECTO.test(url)) return { tipo: 'cita_y_clic', categoria: 'url_con_efecto', motivo: `abrir ${url} hace algo (salir, borrar, pagar, publicar o enviar)` }
  // Autónomo (0.2.15): las páginas nuevas no preguntan. En los demás modos, un sitio que la persona nombró en el chat
  // cuenta como aprobado (A5); el resto pide su clic con la URL completa.
  if (!aprobados.has(h) && (modo === 'autonomo' || hostNombradoPorLaPersona(h))) aprobados.add(h)
  if (!aprobados.has(h)) return { tipo: 'clic', categoria: 'dominio_nuevo', motivo: `abrir ${h}, un sitio que no aprobaste en esta sesión` }
  const s = senalExfiltracion(url)
  if (s) return { tipo: 'clic', categoria: 'posible_exfiltracion', motivo: `${s} hacia ${h}` }
  const n = datosDe(u)
  if (n > DATOS_SIN_CLIC) return { tipo: 'clic', categoria: 'posible_exfiltracion', motivo: `la URL lleva ${n} caracteres de ruta y datos hacia ${h}` }
  if ((gastado.get(h) ?? 0) + n > PRESUPUESTO_HOST) return { tipo: 'clic', categoria: 'posible_exfiltracion', motivo: `ya van ${(gastado.get(h) ?? 0) + n} caracteres de ruta y datos hacia ${h} en esta sesión` }
  return { tipo: 'pasa' }
}

export type HerramientaNavegar = 'navegar' | 'web_abrir' | 'web_navegar'
export type JuicioUrl =
  | { tipo: 'pasa' }
  | { tipo: 'negar'; categoria: string; motivo: string }
  | { tipo: 'cita_y_clic'; categoria: string; motivo: string }
  | { tipo: 'clic'; categoria: string; motivo: string }

/** Juicio puro de una navegación (sin tocar nada). */
export function juzgarUrl(url: string, herramienta: HerramientaNavegar, cliente = esEdicionCliente(), modo?: ModoManos): JuicioUrl {
  if (cliente) return juzgarUrlCliente(url, modo)
  if (herramienta !== 'navegar') return { tipo: 'pasa' } // instalación original: las web no cambian
  if (URL_CON_EFECTO.test(url)) return { tipo: 'cita_y_clic', categoria: 'url_con_efecto', motivo: `abrir ${url} hace algo (salir, borrar, pagar, publicar o enviar)` }
  return { tipo: 'pasa' }
}

/**
 * Freno de navegación completo: juicio + cita + clic humano (I8). `{ ok: true }` o el texto del bloqueo para el modelo.
 * Al pasar con el clic de la persona, el dominio queda aprobado para la sesión.
 */
export async function frenarNavegacion(url: string, herramienta: HerramientaNavegar, confirmacion: unknown, extra: unknown[] = []): Promise<{ ok: true } | { ok: false; categoria: string; texto: string }> {
  const j = juzgarUrl(url, herramienta)
  if (j.tipo === 'pasa') {
    if (esEdicionCliente()) { const u = parsear(url); if (u) gastado.set(host(u), (gastado.get(host(u)) ?? 0) + datosDe(u)) }
    return { ok: true }
  }
  if (j.tipo === 'negar') return { ok: false, categoria: j.categoria, texto: `FRENO (${j.categoria}): ${j.motivo}. No se abrió nada; no busques otra vía. Pídele a la persona que lo haga ella misma.` }
  const autonomo = esEdicionCliente() && modoManos() === 'autonomo'
  if (j.tipo === 'cita_y_clic') {
    // La cita del modelo (validada) o, en cliente, la que la persona ya escribió en el chat (A5).
    const cita = (typeof confirmacion === 'string' && confirmacion.trim().length >= 8 && verificarCita(confirmacion) && citaCubre('url_con_efecto', confirmacion)) || (esEdicionCliente() && !!citaDelChat('url_con_efecto'))
    // Autónomo: con el pedido de la persona corre solo; sin él, tarjeta (I8) en vez de rebotar al modelo.
    if (cita && autonomo) { const u = parsear(url); if (u) { aprobados.add(host(u)); gastado.set(host(u), 0) } return { ok: true } }
    if (!cita && !autonomo) return { ok: false, categoria: j.categoria, texto: `FRENO (url_con_efecto): ${j.motivo}. ${esEdicionCliente() ? 'Dile a la persona en una línea qué quieres abrir y espera su respuesta en el chat (sus palabras cuentan solas como cita).' : 'Pide el pedido explícito de la persona y repite con confirmacion = su cita textual.'}` }
  }
  const humana = await confirmacionHumana({
    categoria: categoriaDe(j.categoria, j.motivo), resumen: `${herramienta}: ${j.motivo}`.slice(0, 280),
    herramienta: `${herramienta === 'navegar' ? 'manos' : 'web'}:${herramienta}`, partes: [url, ...extra],
  })
  if (!humana.ok) return { ok: false, categoria: j.categoria, texto: humana.detalle }
  if (esEdicionCliente()) { const u = parsear(url); if (u) { aprobados.add(host(u)); gastado.set(host(u), 0) } }
  return { ok: true }
}
