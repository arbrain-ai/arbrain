import {describe,it,expect} from 'vitest'
import {cronEnvironment} from './cron-account.js'
import {dirClaudeAlterna} from './cuentas-alternas.js'
describe('isolated cron account',()=>{
 it('uses bro OAuth without borrowing active chat or API credentials',()=>{
  const base={CLAUDE_CONFIG_DIR:'/different/chat',ANTHROPIC_API_KEY:'not-real',CLAUDE_CODE_OAUTH_TOKEN:'not-real',PATH:'/bin'}
  const env=cronEnvironment('bro',base)
  expect(env.CLAUDE_CONFIG_DIR).toBe(dirClaudeAlterna())
  expect(env.CLAUDE_CONFIG_DIR).toBeTruthy()
  expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  expect(base.CLAUDE_CONFIG_DIR).toBe('/different/chat')
  expect(env.PATH).toBe('/bin')
 })
 it('default never inherits another config dir and uses the CLI default login',()=>{
  expect(cronEnvironment('default',{CLAUDE_CONFIG_DIR:'/bro'}).CLAUDE_CONFIG_DIR).toBeUndefined()
 })
 it('rejects an unknown account instead of silently billing another',()=>{expect(()=>cronEnvironment('unknown')).toThrow()})
})
