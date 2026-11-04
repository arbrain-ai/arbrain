// Ajustes › Teléfono y Máquinas sin Tailscale (3 nov 2026): textos del estado, máquinas y la hoja de instalación.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { estadoDeMaquina, pasosInstalar, plataformaDe, textoEstadoConectar, tipoDeMaquina } from '../../src/features/telefono/conectar-ui'

const raiz = join(import.meta.dirname, '..', '..')

test('estado: «Listo desde las…», conectando con su motivo, apagado', () => {
  const ahora = new Date('2026-11-03T15:30:00Z')
  const listo = textoEstadoConectar({ estado: 'listo', desde: '2026-11-03T15:14:00Z' }, ahora)
  assert.equal(listo.tono, 'ok')
  assert.match(listo.titulo, /^Listo desde las \d{1,2}:14/)
  assert.deepEqual(textoEstadoConectar({ estado: 'conectando', ultimoError: 'Sin conexión con el relay.' }, ahora), { titulo: 'Conectando…', detalle: 'Sin conexión con el relay.', tono: 'alerta' })
  assert.equal(textoEstadoConectar({ estado: 'apagado' }).titulo, 'Apagado')
})

test('máquinas: tipo y estado legibles', () => {
  assert.equal(tipoDeMaquina('servidor'), 'Tu servidor')
  assert.equal(tipoDeMaquina('mac'), 'Mac')
  const ahora = new Date('2026-11-03T15:30:00Z')
  assert.match(estadoDeMaquina({ handle: 'x', nombre: 'n', tipo: 'mac', url: '', esta: true, conectada: true, desde: Date.parse('2026-11-03T15:14:00Z'), vista: null }, ahora), /^Lista desde las/)
  assert.equal(estadoDeMaquina({ handle: 'x', nombre: 'n', tipo: 'mac', url: '', esta: false, conectada: false, desde: null, vista: null }, ahora), 'Sin conexión todavía')
})

test('hoja de instalación: pasos en español por teléfono', () => {
  assert.equal(plataformaDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'), 'ios')
  assert.equal(plataformaDe('Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile'), 'android')
  assert.equal(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0'), 'otro')
  assert.match(pasosInstalar('ios').join(' '), /Agregar a pantalla de inicio/)
  assert.match(pasosInstalar('android').join(' '), /Instalar app/)
})

test('cableado: Ajustes › Teléfono y Máquinas, la ruta en la lista blanca, iconos de lucide', () => {
  const sec = readFileSync(join(raiz, 'src/features/configuracion/secciones.ts'), 'utf8')
  assert.match(sec, /id: 'maquinas', nombre: 'Máquinas'/)
  assert.match(sec, /secciones: \['llaves', 'voz', 'telefono', 'maquinas'/)
  assert.match(readFileSync(join(raiz, 'src/lib/edicion.ts'), 'utf8'), /'\/api\/conectar'/)
  const tarjeta = readFileSync(join(raiz, 'src/features/telefono/TarjetaConectar.tsx'), 'utf8')
  for (const t of ['Cerrar sesión en todos los teléfonos', 'Dirección privada', 'Copiar', 'Abrir', 'Escanéalo con tu teléfono']) assert.ok(tarjeta.includes(t), t)
  assert.match(tarjeta, /from 'lucide-react'/)
  assert.match(readFileSync(join(raiz, 'src/app/layout.tsx'), 'utf8'), /CLIENTE && <HojaInstalar \/>/)
})
