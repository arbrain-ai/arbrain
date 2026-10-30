// Cuentas alternas de suscripción (red team 3, A-7): en la edición cliente no existen; en la original sus carpetas son
// dato de la instalación (instalacion.json), con nombres neutros si no lo declara.
import { describe, it, expect } from 'vitest'
import { carpetaClaudeAlterna, carpetasClaude, dirClaudeAlterna, dirClaudeAlternaO, dirCodexAlterna, CUENTA_ALTERNA_NO_DISPONIBLE } from './cuentas-alternas.js'
import { carpetaOriginal, instalacionOriginal } from './dueno.js'

const CLIENTE = { ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv
const ORIGINAL = { ARBRAIN_EDICION: 'original' } as NodeJS.ProcessEnv

describe('cuentas alternas', () => {
  it('edición cliente: ninguna carpeta, ninguna ruta; pedir la cuenta alterna lanza', () => {
    expect(carpetaClaudeAlterna(CLIENTE)).toBeNull()
    expect(dirClaudeAlterna(CLIENTE, '/h')).toBeNull()
    expect(dirCodexAlterna(CLIENTE, '/h')).toBeNull()
    expect(carpetasClaude(CLIENTE)).toEqual(['.claude'])
    expect(() => dirClaudeAlternaO(CLIENTE)).toThrow(CUENTA_ALTERNA_NO_DISPONIBLE)
  })

  it('original: la carpeta sale de instalacion.json; sin él, nombres neutros', () => {
    const declaradas = (instalacionOriginal() as { cuentas_alternas?: { claude?: string; codex?: string } }).cuentas_alternas
    const claude = declaradas?.claude ?? '.claude-alterna'
    const codex = declaradas?.codex ?? '.codex-alterna'
    expect(dirClaudeAlterna(ORIGINAL, '/h')).toBe(`/h/${claude}`)
    expect(dirCodexAlterna(ORIGINAL, '/h')).toBe(`/h/${codex}`)
    expect(carpetasClaude(ORIGINAL).slice(0, 2)).toEqual(['.claude', claude])
    if (!carpetaOriginal()) expect(claude).toBe('.claude-alterna')
  })
})
