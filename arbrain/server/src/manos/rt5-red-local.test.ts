/**
 * Red team 5 (0.1.2, 17 oct 2026) · RED LOCAL por la puerta de atrás de `navegar`.
 *
 * `juicio-url.ts` niega DURO («negar», ni con clic) los hosts de la red local para que el navegador no sea un túnel al
 * router, al NAS o al propio daemon (`hostLocal`). El WHATWG URL de Node normaliza las formas octal/decimal/hex de una
 * IPv4 (`0177.0.0.1`, `2130706433`, `0x7f000001` → `127.0.0.1`), así que esas caen bien en «negar» (ver controles).
 *
 * Pero `hostLocal` NO cubre dos formas que igual llegan a localhost / IP privada:
 *   1. IPv4 embebida en IPv6 (`[::ffff:127.0.0.1]`, `[::ffff:a9fe:...]`): la rama v6 solo mira `::1`, `fe80|fc|fd` y `::`.
 *   2. Hostnames de rebinding con comodín DNS que resuelven a una IP privada (`127.0.0.1.nip.io`, `10.0.0.1.sslip.io`,
 *      `localtest.me`): no son IP literal, así que pasan como «dominio nuevo».
 * En ambos casos la protección DURA (negar) se degrada a «clic»: un host que debería ser inalcanzable pasa a ser
 * alcanzable con un solo clic de la persona (fácil de conseguir con una URL de aspecto críptico) y, una vez aprobado,
 * el daemon/el router quedan abiertos para el resto de la sesión.
 *
 * HALLAZGO rt5-2 (Medio). Las pruebas EXPLOIT afirman la conducta segura (negar) y hoy FALLAN; los controles pasan.
 */
import { describe, expect, it } from 'vitest'
import { juzgarUrl } from './juicio-url.js'

const j = (url: string) => juzgarUrl(url, 'navegar', /* cliente */ true)

describe('rt5-2 (Medio): hostLocal no cubre IPv4-en-IPv6 ni hostnames de rebinding', () => {
  it('control: localhost, IP privada y las formas octal/decimal/hex (que Node normaliza) se niegan DURO', () => {
    for (const u of ['http://127.0.0.1/', 'http://localhost/', 'http://10.0.0.5/', 'http://192.168.1.1/admin',
      'http://169.254.1.1/', 'http://nas.local/', 'http://daemon.internal/',
      'http://0177.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://012.0.0.1/']) {
      expect(j(u), u).toMatchObject({ tipo: 'negar', categoria: 'red_local' })
    }
  })

  it('EXPLOIT: IPv4 embebida en IPv6 llega a 127.0.0.1 pero solo pide «clic» (debería ser «negar»)', () => {
    for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:10.0.0.1]/']) {
      expect(j(u), u).toMatchObject({ tipo: 'negar', categoria: 'red_local' })
    }
  })

  it('EXPLOIT: hostnames de rebinding con comodín DNS a IP privada solo piden «clic» (deberían ser «negar»)', () => {
    for (const u of ['http://127.0.0.1.nip.io/', 'http://10.0.0.1.sslip.io/', 'http://localtest.me/', 'http://127.0.0.1.xip.io/']) {
      expect(j(u), u).toMatchObject({ tipo: 'negar', categoria: 'red_local' })
    }
  })
})
