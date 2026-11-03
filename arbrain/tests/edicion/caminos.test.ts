// Los tres caminos (29 oct 2026): computadora, solo servidor y espejo. Los prompts del primer arranque son, letra por
// letra, los de las guías; las guías dicen el plan recomendado y separan el chat (su cuenta de Claude) de las rutinas
// (OpenRouter con tope). En el repo original las guías viven en empaquetado/plantillas; en la copia, en la raíz.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { CAMINOS, caminoActual, GUIA_INSTALAR, GUIA_NUBE, ORDEN_CAMINOS, SERVIDOR_EJEMPLO } from '../../src/features/primer-arranque/lib/caminos'
import { mensajeBienvenida, VIVO_EN_SERVIDOR } from '../../src/features/primer-arranque/textos/bienvenida'

const guia = (nombre: string) => {
  const enRepo = new URL(`../../empaquetado/plantillas/${nombre}.plantilla.md`, import.meta.url)
  return readFileSync(existsSync(enRepo) ? enRepo : new URL(`../../../${nombre}.md`, import.meta.url), 'utf8')
}
/** Quita el «> » de las citas de Markdown para comparar texto corrido. */
const plano = (md: string) => md.split('\n').map(l => l.replace(/^> ?/, '')).join('\n')

test('tres caminos, en orden, cada uno con su paso a paso y un prompt que apunta solo a arbrain-ai/arbrain', () => {
  assert.deepEqual([...ORDEN_CAMINOS], ['computadora', 'servidor', 'espejo'])
  for (const id of ORDEN_CAMINOS) {
    const c = CAMINOS[id]
    assert.ok(c.pasos.length >= 3, id)
    for (const p of [c.prompt, ...c.despues.map(d => d.prompt)]) {
      for (const url of p.match(/https?:\/\/\S+/g) ?? []) assert.ok(url === GUIA_INSTALAR || url === GUIA_NUBE, `${id}: ${url}`)
      assert.doesNotMatch(p, /funnel|setup-token|sk-or-|sk-ant-/i)
    }
  }
  assert.equal(caminoActual(true), 'servidor')
  assert.equal(caminoActual(false), 'computadora')
  assert.match(CAMINOS.servidor.prompt, new RegExp(`^Instala Arbrain solo en mi servidor siguiendo ${GUIA_INSTALAR.replace(/[.]/g, '\\.')}\\nMi servidor: ${SERVIDOR_EJEMPLO}$`))
  assert.match(CAMINOS.espejo.prompt, /modo espejo[\s\S]*Que mande: /)
})

test('los prompts del primer arranque están, letra por letra, en INSTALAR.md e INSTALAR-NUBE.md', () => {
  const instalar = plano(guia('INSTALAR'))
  const nube = plano(guia('INSTALAR-NUBE'))
  for (const id of ORDEN_CAMINOS) assert.ok(instalar.includes(CAMINOS[id].prompt), `INSTALAR.md sin el prompt de «${id}»`)
  for (const d of CAMINOS.servidor.despues) assert.ok(nube.includes(d.prompt), `INSTALAR-NUBE.md sin «${d.prompt.split('\n')[0]}»`)
  for (const id of ['servidor', 'espejo'] as const) assert.ok(nube.includes(CAMINOS[id].prompt), `INSTALAR-NUBE.md sin el prompt de «${id}»`)
  // Los pasos que ve la persona en la guía son los mismos del primer arranque.
  for (const id of ORDEN_CAMINOS) for (const p of CAMINOS[id].pasos) assert.ok(instalar.replace(/\n\s+/g, ' ').includes(p.replace(/\n\s+/g, ' ')), `INSTALAR.md sin el paso «${p.slice(0, 50)}…» de «${id}»`)
})

test('INSTALAR.md: una sola pregunta al inicio y cada camino a su guion', () => {
  const i = guia('INSTALAR')
  assert.match(i, /## Antes de todo · ¿Dónde vive su Arbrain\? \(una sola pregunta\)/)
  assert.match(i, /MODO=solo/)
  assert.match(i, /MODO=espejo/)
  assert.ok(i.indexOf('¿Dónde vive su Arbrain?') < i.indexOf('## PASO 0'), 'la pregunta va antes del PASO 0')
})

test('INSTALAR-NUBE.md: plan recomendado con «revisa el precio», chat con su cuenta y rutinas con tope, nunca funnel', () => {
  const n = plano(guia('INSTALAR-NUBE'))
  assert.match(n, /Hostinger KVM 2/)
  assert.match(n, /2 vCPU, 8 GB de RAM, 100 GB/)
  assert.match(n, /US\$8\.79 al mes[\s\S]*24 meses[\s\S]*US\$14\.99/)
  assert.match(n, /revisa el precio el día que compres/i)
  assert.match(n, /code\.claude\.com\/docs\/en\/legal-and-compliance/)
  assert.match(n, /anthropic\.com\/legal\/consumer-terms/)
  assert.match(n, /Haiku 5\.5/)
  assert.match(n, /nube\.sh conectar/)
  assert.match(n, /nunca `claude setup-token`/)
  assert.match(n, /nunca `funnel`|Nunca `tailscale funnel`/)
  assert.doesNotMatch(n.replace(/[Nn]unca `?tailscale funnel`?|nunca `funnel`/g, ''), /tailscale funnel/)
})

test('INSTALAR-NUBE.md: «solo en tu servidor» ofrece su respaldo en GitHub y el servidor se llama arbrain en su red (VPS, 1 nov 2026)', () => {
  const n = plano(guia('INSTALAR-NUBE'))
  const n3 = n.slice(n.indexOf('### N3'), n.indexOf('### N4'))
  assert.match(n3, /Con `MODO=solo`, pregúntale una sola vez: «¿Quieres que tu servidor se respalde solo en tu GitHub/)
  assert.match(n3, /gh repo create <usuario>\/mi-arbrain --private/)
  assert.match(n3, /\*\*vacío\*\*/, 'el respaldo de un servidor nuevo va a un repo vacío (nube.sh no pisa una rama mi-arbrain ajena)')
  assert.match(n3, /--espejo --rol lider --cita "\$CITA"/, 'el espejo de un solo servidor sube el respaldo; al mando para que corran las rutinas')
  assert.match(n, /«respalda mi servidor en GitHub»/)
  assert.match(n, /tailscale up --hostname=arbrain /)
  assert.match(n, /Respaldo: <tu GitHub privado/)
})

test('en el servidor, Levy dice dónde vive y dónde están las llaves', () => {
  const m = mensajeBienvenida('Fulano de Tal', { servidor: true })
  assert.ok(m.includes(VIVO_EN_SERVIDOR))
  assert.doesNotMatch(m, /Vivo en tu computadora|llavero de tu sistema/)
  assert.match(mensajeBienvenida('Fulano de Tal'), /Vivo en tu computadora/)
})
