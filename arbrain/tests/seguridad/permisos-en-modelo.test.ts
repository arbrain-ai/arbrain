// Chat limpio (30 oct 2026). Daniel, viendo su Arbrain en el teléfono: «quita los botones de "autonomo" vuelve a
// preguntar y el boton de pausa… deja la ui limpia… el modo autonomo deberia poder cambiarlo dando clic al modelo
// button». La píldora y el botón flotante se van; el menú del modelo trae Autónomo/Preguntar y «Pausar todo» por el
// mismo camino de API; la franja de pausa (estado, no botón) sigue completa con «Reanudar».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { accionAlElegirLado, DONDE_PAUSAR, ladoDelModo, LINEA_MODO, type EstadoPermisosLevy, type TextoAutonomia } from '../../src/features/seguridad/lib/seguridad'
import { mensajeBienvenida } from '../../src/features/primer-arranque/textos/bienvenida'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const texto: TextoAutonomia = { version: 'v1', sha256: 'abc', titulo: 't', cuerpo: 'c', casillas: ['a', 'b'], aviso: '' }
const consentimiento = { ts: 1, version: 'v1', sha256: 'abc', app: '0.2.16', so: 'darwin', via: 'bienvenida' }
const estado = (e: Partial<EstadoPermisosLevy>): EstadoPermisosLevy => ({ modo: 'carpeta', modos: ['preguntar', 'carpeta', 'autonomo'], sandbox: true, texto, ...e })

test('dos lados: «Preguntar siempre» y «Automático en mi carpeta» cuentan como Preguntar', () => {
  assert.equal(ladoDelModo('autonomo'), 'autonomo')
  assert.equal(ladoDelModo('carpeta'), 'preguntar')
  assert.equal(ladoDelModo('preguntar'), 'preguntar')
  for (const m of ['autonomo', 'carpeta', 'preguntar'] as const) assert.ok(LINEA_MODO[m])
})

test('elegir un lado: lo mismo no hace nada; Preguntar baja a carpeta; Autónomo con consentimiento vigente es un clic, sin él abre Ajustes', () => {
  assert.deepEqual(accionAlElegirLado('autonomo', estado({ modo: 'autonomo', consentimiento })), { tipo: 'nada' })
  assert.deepEqual(accionAlElegirLado('preguntar', estado({ modo: 'preguntar' })), { tipo: 'nada' })
  assert.deepEqual(accionAlElegirLado('preguntar', estado({ modo: 'autonomo', consentimiento })), { tipo: 'mandar', cuerpo: { modo: 'carpeta', via: 'modelo' } })
  assert.deepEqual(accionAlElegirLado('autonomo', estado({ modo: 'carpeta', consentimiento })), { tipo: 'mandar', cuerpo: { modo: 'autonomo', via: 'modelo' } })
  // Sin consentimiento, o con el de otra versión del texto: la app no lo da por aceptado.
  assert.deepEqual(accionAlElegirLado('autonomo', estado({ modo: 'carpeta', consentimiento: null })), { tipo: 'ajustes' })
  assert.deepEqual(accionAlElegirLado('autonomo', estado({ modo: 'carpeta', consentimiento: { ...consentimiento, version: 'v0' } })), { tipo: 'ajustes' })
})

test('la vía «modelo» la aceptan la ruta y el daemon (el historial dice por dónde se cambió)', () => {
  assert.match(fuente('src/app/api/seguridad/permisos/route.ts'), /'version', 'modelo'\]/)
  assert.match(fuente('server/src/cliente/modo-permisos.ts'), /'version', 'modelo', 'api'\]\.includes\(v\)/)
})

test('fuera del chat: sin píldora ni botón flotante; la franja de pausa sigue con «Reanudar»', () => {
  const ui = fuente('src/features/seguridad/components/Seguridad.tsx')
  assert.ok(!existsSync(new URL('../../src/features/seguridad/lib/boton-pausa.ts', import.meta.url)))
  assert.ok(!/data-pildora-autonomo|data-boton-pausa|aria-label="Pausar todo"|colocarBotonPausa|Posición del botón/.test(ui))
  assert.match(ui, /data-franja-pausa/)
  assert.match(ui, /Levy está en pausa: no corre ningún turno, rutina ni herramienta/)
  assert.match(ui, /void fijar\(false\)\} disabled=\{ocupado\}[^>]*>\s*\{ocupado \? <Loader2[^}]*\} Reanudar/)
  assert.match(ui, /volver\('pausa'\)/)
  // Ajustes › Permisos y seguridad sigue con su «Pausar todo» y dice dónde está ahora.
  assert.match(ui, /data-donde-pausa>\{DONDE_PAUSAR\}/)
  assert.match(DONDE_PAUSAR, /botón del modelo/)
  for (const r of ['src/components/ActualizacionDesktop.tsx', 'src/shared/components/ColumnaConversaciones.tsx']) assert.ok(!/data-evita-pausa/.test(fuente(r)), r)
})

test('el menú del modelo trae Autónomo/Preguntar y «Pausar todo» por las mismas rutas; Enter ahí no elige modelo', () => {
  const m = fuente('src/features/seguridad/components/PermisosEnModelo.tsx')
  assert.match(m, /role="radiogroup"/)
  assert.match(m, /accionAlElegirLado\(l, estado\)/)
  assert.match(m, /useAjustes\.getState\(\)\.abrir\('seguridad'\)/)
  assert.match(m, /fijar\(true\)/)
  assert.match(m, /Pausar todo/)
  assert.match(m, /Reanudar/)
  const h = fuente('src/features/seguridad/components/estado-seguridad.ts')
  assert.match(h, /'\/api\/seguridad\/permisos', \{ method: 'POST'/)
  assert.match(h, /'\/api\/seguridad\/pausa', \{ method: 'POST'/)
  const picker = fuente('src/features/chat/components/ModelPicker.tsx')
  assert.match(picker, /EDICION_CLIENTE && <PermisosEnModelo onClose=\{onClose\} \/>/)
  assert.match(picker, /closest\('\[data-permisos-modelo\]'\)\) return/)
  const chat = fuente('src/features/chat/components/ChatPanel.tsx')
  assert.match(chat, /EDICION_CLIENTE && <PuntoAutonomo \/>/)
})

test('los textos dicen dónde está ahora (bienvenida y primer arranque)', () => {
  assert.match(mensajeBienvenida('Fulano', { modo: 'autonomo' }), /botón del modelo[^.]*Pausar todo/)
  assert.ok(!/Volver a preguntar/.test(mensajeBienvenida('Fulano', { modo: 'autonomo' })))
  assert.match(mensajeBienvenida('Fulano', { modo: 'carpeta' }), /botón del modelo/)
  const pa = fuente('src/features/primer-arranque/components/PrimerArranque.tsx')
  assert.ok(!/Pausar todo siempre está a un clic/.test(pa))
  assert.match(pa, /pausar todo, toca el botón del modelo/)
})
