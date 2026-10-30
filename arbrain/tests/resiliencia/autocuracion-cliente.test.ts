// Autocuración de la edición cliente (resiliencia, 12 oct 2026): el alumno no tiene a nadie mirando logs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { explicarEspera, ESPERA_SIN_EXPLICAR_MS } from '../../src/features/chat/lib/espera-explicada'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

test('«Preparando respuesta» explica la espera a los 25 s según la salud real', () => {
  assert.equal(ESPERA_SIN_EXPLICAR_MS, 25_000)
  assert.match(explicarEspera(null, 30), /No hay conexión con Arbrain ahora; se está reparando sola/)
  assert.match(explicarEspera({ ok: true, etapas: { daemon: { ok: false }, supabase: { ok: true } } }, 30), /motor de Arbrain no responde; se está reiniciando solo/)
  assert.match(explicarEspera({ ok: true, etapas: { daemon: { ok: true }, supabase: { ok: false } } }, 30), /base de Arbrain no responde/)
  assert.match(explicarEspera({ ok: true, etapas: { daemon: { ok: true }, supabase: { ok: true } } }, 42), /Lleva 42 s preparándose\. El motor de Arbrain está activo/)
  // En el alumno la ruta de salud está permitida (si no, la explicación siempre diría «sin conexión»).
  assert.equal(apiPermitidaEnCliente('/api/salud/chat'), true)
  assert.match(src('src/features/chat/components/MarkdownMessage.tsx'), /useEsperaExplicada\(streaming && !waiting && !text && !label\)/)
})

test('el web del alumno tiene supervisor: muerto se relanza, colgado tras 3 sondas, freno 5 en 5 min', () => {
  const lib = src('src-tauri/src/lib.rs')
  assert.match(lib, /if !desktop_env::EDICION_CLIENTE \{\s*servidor::vigilar\(handle\.clone\(\)\);\s*\} else \{\s*vigilar_web_cliente\(handle\.clone\(\)\);/)
  assert.match(lib, /http_status\(port, "\/api\/version", salud_cliente::PLAZO_SONDA\)/)
  assert.match(lib, /salud_cliente::Paso::Reiniciar => \{[\s\S]{0,400}relanzar_web_cliente\(&app, port/)
  // Al cerrar la app el supervisor no relanza lo que se apaga.
  assert.match(lib, /fn stop_local_server[\s\S]{0,300}apagando\.store\(true/)
  const s = src('src-tauri/src/salud_cliente.rs')
  assert.match(s, /pub const FALLOS_PARA_REINICIAR: u32 = 3;/)
  assert.match(s, /pub const MAX_REINICIOS: usize = 5;/)
})

test('estado visible: comandos expuestos solo al alumno y la barra se monta en su edición', () => {
  assert.match(src('src-tauri/permissions/cliente.toml'), /"salud_app", "salud_reintentar"/)
  const lib = src('src-tauri/src/lib.rs')
  assert.match(lib, /fn salud_app\(app: AppHandle\)[\s\S]{0,120}if !desktop_env::EDICION_CLIENTE/)
  const shell = src('src/app/(main)/dashboard-shell.tsx')
  assert.match(shell, /\{EDICION_CLIENTE && <EstadoArbrain \/>\}/)
  const barra = src('src/shared/components/EstadoArbrain.tsx')
  assert.match(barra, /invocar<SaludApp>\('salud_app'\)/)
  assert.match(barra, /dataset\.arbrainVivo = '1'/)
})

test('el daemon en pausa ya no queda mudo: pausado viaja a la UI y «Reintentar» devuelve los intentos', () => {
  const d = src('src-tauri/src/daemon.rs')
  assert.match(d, /pub pausado: bool,/)
  assert.match(d, /if r\.len\(\) >= MAX_REINICIOS \{\s*actualizar\(&app, \|i\| \{\s*i\.pausado = true;/)
  assert.match(d, /pub fn reintentar_tras_pausa[\s\S]{0,200}r\.clear\(\)/)
})
