/**
 * SSRF de la descarga de imágenes (noche de seguridad 21→22 oct 2026, verificación de 6-AZUL): la validación resuelve el
 * host y niega IPs internas, no se queda en un filtro de texto. Cubre los bypasses conocidos.
 */
import { describe, it, expect } from 'vitest'
import { motivoUrlInterna, esStorageConfiable } from './security.js'

describe('motivoUrlInterna: SSRF por DNS/IP, no por texto', () => {
  it('bloquea los bypasses de 6-AZUL (IP decimal/hex, IPv6, userinfo, mapeadas, metadatos de nube)', async () => {
    for (const u of [
      'https://a@127.0.0.1:3099/health', 'http://2130706433/', 'http://0x7f000001/',
      'http://[::ffff:127.0.0.1]/', 'http://[0:0:0:0:0:0:0:1]/', 'http://127.0.0.1/', 'http://localhost/',
      'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::1]/',
      'http://100.64.0.0/', 'http://0.0.0.0/',
    ]) expect(await motivoUrlInterna(u), u).toBeTruthy()
  })
  it('rechaza usuario/contraseña aunque el host sea público', async () => {
    expect(await motivoUrlInterna('https://user:pass@example.com/')).toMatch(/usuario o contraseña/)
  })
  it('una IP pública literal pasa', async () => {
    expect(await motivoUrlInterna('https://1.1.1.1/x.png')).toBeNull() // IP pública literal (sin depender del DNS del entorno)
  })
  it('esStorageConfiable solo acepta el prefijo del storage local, no cualquier loopback', () => {
    expect(esStorageConfiable('http://127.0.0.1:3099/health')).toBe(false)
  })
})
