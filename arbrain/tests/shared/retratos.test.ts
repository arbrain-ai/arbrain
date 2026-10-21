import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { srcsetRetrato } from '../../src/shared/components/Retrato'
import { redGratis } from '../../src/features/live/precarga'

const PUBLIC = join(__dirname, '../../public')

test('cada ancho del srcset existe en public/ y pesa menos de 20 KB', () => {
  for (const agente of ['levy', 'trinity', 'sensei'] as const) {
    for (const formato of ['avif', 'webp'] as const) {
      for (const parte of srcsetRetrato(agente, formato).split(', ')) {
        const [url, ancho] = parte.split(' ')
        assert.match(ancho, /^\d+w$/)
        const ruta = join(PUBLIC, url)
        assert.ok(existsSync(ruta), `falta ${url} (corre scripts/retratos.sh)`)
        assert.ok(statSync(ruta).size < 20_000, `${url} pesa ${statSync(ruta).size} B`)
      }
    }
  }
})

test('el arte del rig 2D existe en WebP junto a su PNG', () => {
  // Trinity y Sensei no viajan en la copia del alumno (solo Levy): se revisa el arte que exista en este checkout.
  for (const f of ['levy-face/assets/levy', 'agentes-2d/trinity/assets/trinity', 'agentes-2d/sensei/assets/sensei']) {
    if (!f.startsWith('levy') && !existsSync(join(PUBLIC, `${f}.png`))) continue
    assert.ok(existsSync(join(PUBLIC, `${f}.webp`)), `falta ${f}.webp`)
    assert.ok(statSync(join(PUBLIC, `${f}.webp`)).size < statSync(join(PUBLIC, `${f}.png`)).size)
  }
})

test('los retratos versionados y los glb se sirven inmutables; el rig 2D, un día', () => {
  const cfg = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')
  for (const fuente of ["'/retratos/:archivo*', headers: inmutable", "'/levy-3d/:archivo([^/]+\\\\.glb)', headers: inmutable", "'/levy-face/:ruta*', headers: unDia"]) {
    assert.ok(cfg.includes(fuente), `next.config.ts sin ${fuente}`)
  }
})

test('los avatares 3D solo se precalientan cuando la red no cuesta', () => {
  assert.equal(redGratis({ hostname: '127.0.0.1', protocol: 'http:' }), true)
  assert.equal(redGratis({ hostname: 'localhost', protocol: 'http:' }), true)
  assert.equal(redGratis({ hostname: 'estudio.ejemplo.ts.net', protocol: 'https:' }), false)
  assert.equal(redGratis({ hostname: '127.0.0.1', protocol: 'http:' }, true), false)
})

test('abrir el chat no baja ni parsea avatares 3D por su cuenta; en la máquina local solo calienta el código', () => {
  const chat = readFileSync(join(__dirname, '../../src/app/(main)/chat/page.tsx'), 'utf8')
  const efecto = chat.slice(chat.indexOf('Live se prepara por INTENCIÓN'), chat.indexOf('const [consejo'))
  assert.ok(efecto.includes("addEventListener('openclaw:prepare-live'"))
  const local = efecto.slice(efecto.indexOf('if (redGratis('))
  assert.match(local, /import\('@\/features\/live\/components\/LiveWorkspace'\)/)
  assert.doesNotMatch(local, /calentarAvatar|precargarAvatar/)
})
