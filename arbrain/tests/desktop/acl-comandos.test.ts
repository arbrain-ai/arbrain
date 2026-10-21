// El ACL de la app de escritorio (9 oct 2026). La UI llega a Tauri como origen REMOTO (la web del Studio en 127.0.0.1),
// así que todo comando que la web invoca debe estar concedido en `src-tauri/permissions/*.toml`; si falta, Tauri lo
// rechaza y la web, que suele tragarse el error, se queda sin la función sin decir nada. Así vivió `fantasma` del 5 al
// 9 oct: el fantasma que cruza monitores nunca apareció en la app (Daniel: «no se ve cuando la paso al otro monitor»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const raiz = resolve(__dirname, '../..')
const tauri = join(raiz, 'src-tauri')

/** Lo que nunca debe tocar la web: los secretos del llavero se quedan del lado nativo. */
const SOLO_NATIVOS = new Set(['set_keychain_secret', 'get_keychain_secret', 'delete_keychain_secret'])

function registrados(): string[] {
  const lib = readFileSync(join(tauri, 'src/lib.rs'), 'utf8')
  const bloque = lib.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? ''
  return bloque.split(',').map(c => c.trim().split('::').pop() ?? '').filter(Boolean)
}

function concedidos(): Set<string> {
  const dir = join(tauri, 'permissions')
  const todos = new Set<string>()
  for (const f of readdirSync(dir).filter(n => n.endsWith('.toml'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/commands\.allow\s*=\s*\[([\s\S]*?)\]/g)) {
      for (const c of m[1].matchAll(/"([a-z_]+)"/g)) todos.add(c[1])
    }
  }
  return todos
}

test('cada comando registrado que usa la web está concedido en el ACL', () => {
  const ok = concedidos()
  const faltan = registrados().filter(c => !SOLO_NATIVOS.has(c) && !ok.has(c))
  assert.deepEqual(faltan, [], `comandos sin permiso (la web los verá rechazados): ${faltan.join(', ')}`)
})

test('el fantasma del arrastre está concedido', () => {
  assert.ok(registrados().includes('fantasma'))
  assert.ok(concedidos().has('fantasma'))
})
