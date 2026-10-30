import os from 'node:os'
import path from 'node:path'
import { readEnvFile } from './env.js'
import { esEdicionCliente } from './edicion.js'
import { dirClaudeAlternaO } from './cuentas-alternas.js'
import { entornoClaude } from './cliente/cofre.js'
import { entornoRutinaConLlave, rutinasConLlaveTope } from './cliente/rutinas-llave.js'

/** Cron identity is explicit and never borrowed from a chat/session lookup. */
export function cronEnvironment(account: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if(account!=='default'&&account!=='bro')throw new Error('CLAUDECLAW_CRON_ACCOUNT must be default or bro')
  const env={...base}
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  // 'default' NO fija CLAUDE_CONFIG_DIR: con la variable explícita, Claude Code busca otra
  // entrada del llavero (sufijo por hash) sin sesión y responde «Not logged in» (27-28 sep 2026).
  // Sin la variable usa ~/.claude y la credencial que Daniel mantiene viva al usar Claude Code.
  if(account==='bro')env.CLAUDE_CONFIG_DIR=dirClaudeAlternaO()
  else delete env.CLAUDE_CONFIG_DIR
  env.CLAUDECLAW_DAEMON='1'
  env.CLAUDECLAW_SOURCE='cron' // los hooks de contexto (p. ej. el ritual de bajar a tierra) no inyectan en crons
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1'
  return env
}
export function configuredCronEnvironment():NodeJS.ProcessEnv {
  // Edición cliente (empaquetado, 11 oct 2026): las tareas del alumno usan SU llave (BYOK) y su carpeta aislada del CLI;
  // no hay cuentas 'default'/'bro' de Daniel ni llavero que borrar.
  // Con el chat en su suscripción, la rutina va por su llave de OpenRouter CON TOPE (cliente/rutinas-llave.ts), nunca por el plan.
  if(esEdicionCliente())return{...(rutinasConLlaveTope()?entornoRutinaConLlave(process.env):entornoClaude(process.env)),CLAUDECLAW_DAEMON:'1',CLAUDECLAW_SOURCE:'cron',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}
  return cronEnvironment(readEnvFile(['CLAUDECLAW_CRON_ACCOUNT']).CLAUDECLAW_CRON_ACCOUNT??'default')
}
