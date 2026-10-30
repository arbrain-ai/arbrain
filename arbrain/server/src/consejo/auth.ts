import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CUENTAS_CONSEJO } from './identidades.js'

const EXPECTED = CUENTAS_CONSEJO.openai
export interface SubscriptionTokens { accessToken: string; chatgptAccountId: string }
/** Local claims only select a candidate. account/read and a real inference verify it. */
export function subscriptionTokens(raw: string): SubscriptionTokens {
  try {
    const auth = JSON.parse(raw)
    const claims = JSON.parse(Buffer.from(auth.tokens.id_token.split('.')[1], 'base64url').toString())
    if (!EXPECTED || auth.auth_mode !== 'chatgpt' || claims.email !== EXPECTED ||
      typeof auth.tokens.access_token !== 'string' || !auth.tokens.access_token ||
      typeof auth.tokens.account_id !== 'string' || !auth.tokens.account_id) throw new Error()
    return { accessToken: auth.tokens.access_token, chatgptAccountId: auth.tokens.account_id }
  } catch { throw new Error(`Consejo requiere la suscripción de ${EXPECTED}; credenciales distintas o incompletas rechazadas.`) }
}
/** Read only; never copy refresh tokens, change logins or inherit a user's tool config. */
export async function readSubscriptionTokens(): Promise<SubscriptionTokens> {
  for (const profile of ['.codex-gz', '.codex']) {
    try { return subscriptionTokens(await readFile(join(homedir(), profile, 'auth.json'), 'utf8')) }
    catch { /* A different account is never used. */ }
  }
  throw new Error(`Falta autenticar ${EXPECTED} en ~/.codex-gz o ~/.codex de este host. No se sustituyen cuentas ni se usan API keys.`)
}
