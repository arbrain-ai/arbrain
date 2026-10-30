import { describe, expect, it } from 'vitest'
import { subscriptionTokens } from './auth.js'
import { CUENTAS_CONSEJO } from './identidades.js'
import { CODEX_LOCKDOWN, assertOpenAIIsolation } from './runtime.js'
const auth = (email = CUENTAS_CONSEJO.openai, mode = 'chatgpt') => JSON.stringify({ auth_mode: mode, tokens: {
  id_token: `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.x`,
  access_token: 'synthetic-access', refresh_token: 'must-not-leave-host', account_id: 'synthetic-account',
} })
describe('Consejo subscription boundary', () => {
  // Sin src/daniel/consejo-identidades.json (copia del alumno) no hay cuenta que aceptar: esta prueba no aplica.
  it.skipIf(!CUENTAS_CONSEJO.openai)('passes only the requested subscription access credential and account ID', () => {
    expect(subscriptionTokens(auth())).toEqual({accessToken:'synthetic-access',chatgptAccountId:'synthetic-account'})
  })
  it.each(['otra.cuenta.yt@example.com', 'other@example.com'])('rejects %s without leaking credentials', email => {
    expect(() => subscriptionTokens(auth(email))).toThrow('credenciales distintas')
  })
  it('rejects paid API mode and malformed input', () => {
    expect(() => subscriptionTokens(auth(undefined,'apikey'))).toThrow()
    expect(() => subscriptionTokens('secret-malformed')).toThrow('Consejo requiere')
  })
  it('disables collaboration and the nested tool executor independently', () => {
    expect(CODEX_LOCKDOWN['agents.enabled']).toBe(false)
    expect(CODEX_LOCKDOWN['features.code_mode_host']).toBe(false)
  })
  it('refuses inference if the effective runtime ignores isolation flags', () => {
    const config={agents:{enabled:false},features:{code_mode_host:false,shell_tool:false,plugins:false,apps:false},cli_auth_credentials_store:'ephemeral'}
    expect(()=>assertOpenAIIsolation(config)).not.toThrow()
    expect(()=>assertOpenAIIsolation({...config,agents:{enabled:true}})).toThrow('aislamiento')
    expect(()=>assertOpenAIIsolation({...config,features:{...config.features,code_mode_host:true}})).toThrow('aislamiento')
    expect(()=>assertOpenAIIsolation({...config,cli_auth_credentials_store:'file'})).toThrow('aislamiento')
  })
  it('keeps authentication in memory only', () => expect(CODEX_LOCKDOWN.cli_auth_credentials_store).toBe('ephemeral'))
})
