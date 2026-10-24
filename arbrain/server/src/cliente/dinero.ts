/**
 * Nada de dinero en la v1 del alumno (seguridad del alumno, 12 oct 2026; AUDITORIA punto 5). Regla dura de la política
 * de los agentes en la edición cliente: banca, pasarelas de pago, billeteras, envíos de dinero, casas de cambio de
 * criptomonedas e impuestos quedan fuera de su alcance, ni con clic. La persona lo hace ella misma en el sitio.
 *
 * Plataformas de pago que el alumno usa para CONSTRUIR (Stripe, PayPal, Mercado Pago…): se niega su panel, su API y su
 * checkout, pero se deja leer su documentación (`docs.`, `developer.`… y `stripe.com/docs`), que es lo que un alumno
 * que arma su SaaS necesita. Bancos, exchanges e impuestos: todo el dominio.
 *
 * Pura (sin red ni disco). No importa nada de `manos/` (computer use no viaja en la v1; su freno de navegación tiene su
 * propia lista en `manos/juicio-url.ts`).
 */
import { hostDe, parsearUrl } from './url.js'

/** Bancos (MX, LatAm, US, Europa), casas de bolsa, exchanges, impuestos: todo el dominio, también la documentación. */
export const DOMINIOS_DINERO_TOTAL = [
  // Bancos de México
  'bbva.mx', 'bbva.com', 'bancomer.com', 'banorte.com', 'santander.com.mx', 'santander.com', 'banamex.com', 'citibanamex.com', 'hsbc.com.mx', 'hsbc.com',
  'scotiabank.com.mx', 'scotiabank.com', 'inbursa.com', 'banregio.com', 'bancoazteca.com.mx', 'bancoazteca.com', 'heybanco.com', 'hey.inc', 'bancoppel.com',
  'afirme.com', 'banbajio.com', 'bancobase.com', 'multiva.com.mx', 'monex.com.mx', 'actinver.com', 'bx.com.mx', 'nu.com.mx', 'klar.mx', 'stori.mx',
  'storicard.com', 'spin.com.mx', 'ualabis.com.mx', 'uala.com.mx', 'vexi.mx', 'fondeadora.com', 'cuenca.com', 'albo.mx', 'bienestar.gob.mx',
  'bancodelbienestar.gob.mx', 'banxico.org.mx', 'spei.mx', 'cetesdirecto.com', 'gbm.com', 'gbm.com.mx', 'kuspit.com', 'fintual.mx', 'fintual.cl',
  'mifel.com.mx', 'compartamos.com.mx', 'bancamifel.com', 've-por-mas.com.mx', 'invex.com',
  // LatAm
  'nubank.com.br', 'nu.com.co', 'itau.com.br', 'itau.cl', 'itau.co', 'bradesco.com.br', 'bb.com.br', 'caixa.gov.br', 'inter.co', 'c6bank.com.br',
  'bancolombia.com', 'davivienda.com', 'bancodebogota.com', 'nequi.com.co', 'daviplata.com', 'bancoestado.cl', 'bancochile.cl', 'santander.cl',
  'bci.cl', 'galicia.ar', 'bancogalicia.com', 'bancomacro.com.ar', 'bna.com.ar', 'brubank.com', 'naranjax.com', 'uala.com.ar', 'viabcp.com',
  'interbank.pe', 'bbva.pe', 'yape.com.pe', 'plin.pe', 'pichincha.com', 'bancopichincha.com.ec', 'produbanco.com.ec', 'banreservas.com',
  'popularenlinea.com', 'bac.net', 'baccredomatic.com', 'bancoindustrial.com.gt', 'banistmo.com', 'bancogeneral.com',
  // Estados Unidos, Canadá y Europa
  'chase.com', 'jpmorgan.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'citibank.com', 'capitalone.com', 'usbank.com', 'pnc.com', 'truist.com',
  'ally.com', 'sofi.com', 'discover.com', 'americanexpress.com', 'amex.com', 'schwab.com', 'fidelity.com', 'vanguard.com', 'robinhood.com',
  'etrade.com', 'tdameritrade.com', 'interactivebrokers.com', 'chime.com', 'mercury.com', 'brex.com', 'ramp.com', 'relayfi.com', 'novo.co',
  'rbcroyalbank.com', 'td.com', 'bmo.com', 'scotiabank.ca', 'cibc.com', 'barclays.co.uk', 'hsbc.co.uk', 'lloydsbank.com', 'natwest.com', 'monzo.com',
  'starlingbank.com', 'revolut.com', 'n26.com', 'ing.es', 'ing.com', 'caixabank.es', 'bbva.es', 'bancosantander.es', 'bankinter.com', 'sabadell.com',
  'openbank.es', 'wise.com', 'transferwise.com', 'payoneer.com',
  // Criptomonedas
  'coinbase.com', 'binance.com', 'binance.us', 'kraken.com', 'bitso.com', 'crypto.com', 'okx.com', 'bybit.com', 'kucoin.com', 'gemini.com',
  'bitfinex.com', 'bitstamp.net', 'huobi.com', 'htx.com', 'gate.io', 'mexc.com', 'bitget.com', 'buenbit.com', 'lemon.me', 'ripio.com', 'mercadobitcoin.com.br',
  'metamask.io', 'phantom.app', 'trustwallet.com', 'exodus.com', 'ledger.com', 'trezor.io', 'blockchain.com', 'uniswap.org', 'app.uniswap.org',
  'pancakeswap.finance', 'opensea.io',
  // Casas de bolsa, brokers, derivados y mercados de predicción (operar valores, 23 oct 2026: ni con el freno quitado)
  'alpaca.markets', 'tradier.com', 'webull.com', 'tastytrade.com', 'tastyworks.com', 'oanda.com', 'etoro.com', 'degiro.com', 'degiro.es',
  'degiro.nl', 'plus500.com', 'ig.com', 'tradestation.com', 'firstrade.com', 'ibkr.com', 'trading212.com', 'xtb.com', 'saxotrader.com',
  'thinkorswim.com', 'merrilledge.com', 'public.com', 'stash.com', 'acorns.com', 'wealthfront.com', 'betterment.com', 'm1.com',
  'hapi.trade', 'flink.com.mx', 'bursanet.com.mx', 'metatrader4.com', 'metatrader5.com', 'polymarket.com', 'kalshi.com',
  // Cripto: más exchanges, DeFi y puentes
  'bingx.com', 'deribit.com', 'bitmex.com', 'hyperliquid.xyz', 'app.hyperliquid.xyz', 'dydx.exchange', 'dydx.trade', 'gmx.io', '1inch.io',
  'jup.ag', 'raydium.io', 'curve.fi', 'aave.com', 'lido.fi', 'compound.finance', 'pump.fun', 'sushi.com', 'balancer.fi', 'stargate.finance',
  // Impuestos y fisco
  'sat.gob.mx', 'irs.gov', 'agenciatributaria.gob.es', 'agenciatributaria.es', 'afip.gob.ar', 'arca.gob.ar', 'sii.cl', 'dian.gov.co', 'sunat.gob.pe',
  'receita.fazenda.gov.br', 'hmrc.gov.uk', 'cra-arc.gc.ca', 'imss.gob.mx', 'infonavit.org.mx',
  // Envíos de dinero
  'westernunion.com', 'remitly.com', 'xoom.com', 'moneygram.com', 'venmo.com', 'cash.app', 'zellepay.com', 'skrill.com', 'neteller.com',
]

/**
 * Pasarelas de pago y plataformas de cobro: se niega todo salvo su documentación pública (hosts `docs.`, `developer.`,
 * `developers.`, `dev.`, `support.`, `help.`, `status.`, `blog.`; y en el dominio raíz, rutas `/docs`).
 */
export const DOMINIOS_PAGOS = [
  'stripe.com', 'stripe.network', 'paypal.com', 'paypal.me', 'paypalobjects.com', 'braintreegateway.com', 'mercadopago.com', 'mercadopago.com.mx',
  'mercadopago.com.ar', 'mercadopago.com.br', 'mercadopago.cl', 'mercadopago.com.co', 'mercadopago.com.pe',
  'polar.sh', 'lemonsqueezy.com', 'paddle.com', 'gumroad.com', 'whop.com', 'hotmart.com', 'conekta.com', 'openpay.mx', 'clip.mx', 'kushki.com',
  'payu.com', 'payulatam.com', 'dlocal.com', 'ebanx.com', 'squareup.com', 'square.com', 'adyen.com', 'checkout.com', 'klarna.com', 'afterpay.com',
  'pay.google.com', 'wallet.google.com', 'pay.amazon.com', 'shopify.com', 'shop.app', 'kueski.com', 'aplazo.mx', 'oxxopay.com', 'pagofacil.com',
]

const DOCUMENTACION = /^(docs|developer|developers|dev|support|help|status|blog|community|ayuda)\./

const coincide = (h: string, d: string) => h === d || h.endsWith('.' + d)
/** Hosts de banca por nombre (bank, banco, banca…): mejor negar de más que entrar a un banco. */
const HOST_BANCARIO = /(^|[.-])(?:[a-z0-9-]*bank[a-z0-9-]*|banco[a-z0-9-]*|banca[a-z0-9-]*|bancomer|banbajio|afirme)(\.|$)/i

/** ¿Esta URL (o host) es banca, pagos, impuestos o cripto? Devuelve el host que la hace prohibida, o null. Pura. */
export function destinoDeDinero(url: string): string | null {
  const u = parsearUrl(url.trim())
  if (!u) return null
  const h = hostDe(u)
  if (!h.includes('.')) return null
  if (DOMINIOS_DINERO_TOTAL.some(d => coincide(h, d))) return h
  const pago = DOMINIOS_PAGOS.find(d => coincide(h, d))
  if (pago) {
    const sub = h.slice(0, Math.max(0, h.length - pago.length))
    if (DOCUMENTACION.test(sub)) return null
    if (h === pago && /^\/(docs|developers?|guides|api-reference)(\/|$)/i.test(u.pathname)) return null
    return h
  }
  return HOST_BANCARIO.test(h) ? h : null
}

/** Hosts y URLs que aparecen en un texto (comando de shell, argumentos). */
const CANDIDATO_HOST = /(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s'"`|;&<>)]*)?/gi

/** Primer destino de dinero que aparece en un texto, o null. Pura. */
export function dineroEnTexto(texto: string): string | null {
  const plano = texto.replace(/["'\\]/g, '')
  for (const m of plano.matchAll(CANDIDATO_HOST)) {
    const cand = m[0]
    // Archivos con extensión (notas.md, app.ts) no son hosts: solo cuentan si el TLD no es una extensión de código.
    if (!/:\/\//.test(cand) && /\.(md|ts|tsx|js|mjs|cjs|json|py|txt|sh|yml|yaml|toml|lock|css|html|png|jpg|jpeg|gif|svg|pdf|csv|log|sql|rs|go|rb|php)(\/|$)/i.test(cand)) continue
    const d = destinoDeDinero(cand)
    if (d) return d
  }
  return null
}

/** Servidores MCP de dinero: cualquier acción que no sea de lectura se niega. */
export const MCP_DINERO = /^(stripe|paypal|mercado[-_]?pago|mercadopago|polar|lemon[-_]?squeezy|paddle|gumroad|square|adyen|plaid|wise|revolut|coinbase|binance|kraken|bitso|conekta|openpay|clip|shopify|bank|banco|banking|wallet|crypto)/i

export const MENSAJE_DINERO = (donde: string) =>
  `Arbrain no maneja dinero en esta versión: ${donde} es banca, pagos, cobros, impuestos o criptomonedas. Ni con permiso: la persona lo hace ella misma, directo en el sitio o en la app de su banco`

/**
 * Operar valores (23 oct 2026, con el interruptor «Quitar también el freno»): comprar, vender u operar acciones,
 * derivados o cripto queda fuera, en cualquier modo. Servidores MCP de brokers, exchanges y cadenas: toda acción que no
 * sea de lectura; y en CUALQUIER servidor, acciones cuyo nombre es operar (comprar, vender, orden, swap, stake…).
 */
export const MCP_VALORES = /^(alpaca|robinhood|ibkr|interactive[-_]?brokers|schwab|etrade|e[-_]trade|tradier|webull|tastytrade|tastyworks|oanda|metatrader|mt[45]|etoro|degiro|trading212|tradestation|broker|brokerage|trading|trader|stocks?|forex|crypto|cripto|defi|dex|hyperliquid|dydx|polymarket|kalshi|uniswap|jupiter|solana|ethereum|evm|web3|onchain|metamask|phantom|ledger|trezor|wallet|gbm|bitso|binance|coinbase|kraken|bybit|okx|kucoin)(?:$|[-_])/i
/** Nombres de acción que son operar valores o mover fondos, en cualquier servidor (sin «order» suelto ni «margin»: CSS). */
const ACCION_VALORES = /(?:^|_)(?:buy|sell|comprar|vender|trade|trading|stake|unstake|withdraw|deposit|retirar|depositar|leverage|liquidate|mint|short_sell|swap_tokens?|swap_assets|execute_swap|token_swap|bridge_tokens?|bridge_assets|(?:place|submit|create|market|limit|cancel|modify|replace)_orders?|(?:open|close)_positions?|send_(?:crypto|tokens?|eth|sol|btc|usdc|usdt))(?:_|$)/i

/** ¿Esta herramienta MCP opera valores o mueve fondos? Devuelve el motivo para `MENSAJE_DINERO`, o null. Pura. */
export function valoresEnMcp(servidor: string, accion: string, deLectura: boolean): string | null {
  if (deLectura) return null
  const a = accion.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  if (MCP_VALORES.test(servidor)) return `el servidor ${servidor} (operar valores o cripto)`
  if (ACCION_VALORES.test(a)) return `${servidor} · ${accion} (comprar, vender u operar valores, o mover fondos)`
  return null
}

/** Programas de línea de comandos que mueven fondos de una cartera o envían órdenes. Pura. */
const BASH_VALORES = /\b(?:solana\s+(?:transfer|pay)|spl-token\s+(?:transfer|mint)|cast\s+(?:send|publish)|bitcoin-cli\b[^|;&]*\bsend\w*|electrum\b[^|;&]*\b(?:payto|broadcast)|lncli\s+(?:sendpayment|payinvoice|sendcoins)|near\s+send|sui\s+client\s+(?:transfer|pay)|aptos\s+account\s+transfer|ccxt\b|freqtrade\b[^|;&]*\btrade\b)/i
export function valoresEnBash(cmd: string): string | null {
  return BASH_VALORES.test(cmd) ? 'el comando (mover fondos de una cartera u operar valores)' : null
}
