// Edición alumno contra la del autor (30 oct 2026). Cada
// hueco cerrado deja su sensor aquí: en cliente nada de lo que se ve llama a una API que no existe en la edición.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')

test('Calendario: en cliente no hay vista «Rutinas» (crons del Studio, `/api/planning/crons` fuera)', () => {
  assert.equal(apiPermitidaEnCliente('/api/planning/crons'), false)
  const cal = fuente('src/features/planning/PlanningCalendar.tsx')
  assert.match(cal, /const MODOS_CALENDARIO = EDICION_CLIENTE \? MODES\.filter\(m => m\.id !== 'crons'\) : MODES/)
  // El menú «Más vistas» y la preferencia guardada usan la lista filtrada; la tecla 7 no entra a crons.
  assert.match(cal, /\{MODOS_CALENDARIO\.filter\(m => !ESCALAS_BARRA\.includes\(m\.id\)\)\.map\(/)
  assert.match(cal, /guardado && MODOS_CALENDARIO\.some\(/)
  assert.match(cal, /if \(EDICION_CLIENTE && pedido === 'crons'\) return/)
  assert.doesNotMatch(cal, /\{MODES\.filter\(m => !ESCALAS_BARRA/)
})

test('Documento: en cliente «Comentar» deja el lote como borrador en su chat con Levy (no en `/api/cabina/comentarios`)', () => {
  assert.equal(apiPermitidaEnCliente('/api/cabina/comentarios'), false)
  const b = fuente('src/features/cabina/documento/ComentariosEntregable.tsx')
  assert.match(b, /if \(esEdicionCliente\(\) && !demo\) return/)
  assert.match(b, /comentariosAlChat\(lista/)
  assert.match(fuente('src/features/chat/components/ChatPanel.tsx'), /window\.addEventListener\(EVENTO_BORRADOR_CHAT/)
})

test('Lienzo: en cliente las miniaturas van a su carpeta de datos (`/api/canvas/miniatura`), no a `/api/draw3` (Supabase)', () => {
  assert.equal(apiPermitidaEnCliente('/api/draw3/abc/thumbnail'), false)
  assert.equal(apiPermitidaEnCliente('/api/canvas/miniatura/abc'), true)
  const m = fuente('src/features/canvas/state/miniaturas.ts')
  assert.match(m, /esEdicionCliente\(\) \? `\/api\/canvas\/miniatura\/\$\{paginaId\}` : `\/api\/draw3\/\$\{paginaId\}\/thumbnail`/)
  const r = fuente('src/app/api/canvas/miniatura/[id]/route.ts')
  assert.match(r, /dirDatosWeb/)
  assert.doesNotMatch(r, /storage\.from/)
  assert.equal((r.match(/if \(!esEdicionCliente\(\)\) return no\(404/g) ?? []).length, 2)
})

test('«Esta pantalla tuvo un problema» y el hilo que no se pintó dejan su línea en la carpeta de datos del alumno', () => {
  assert.equal(apiPermitidaEnCliente('/api/error-pantalla'), true)
  assert.equal(apiPermitidaEnCliente('/api/chat/hilo-error'), true)
  const r = fuente('src/app/api/error-pantalla/route.ts')
  assert.doesNotMatch(r, /supabase|homedir/i)
  assert.match(r, /requireChatPrincipal/)
  assert.match(r, /dirLogs\(\)/)
  // El hilo: en cliente no toca Supabase (sale antes de createServiceClient).
  const h = fuente('src/app/api/chat/hilo-error/route.ts')
  assert.ok(h.indexOf('if (esEdicionCliente())') > 0 && h.indexOf('if (esEdicionCliente())') < h.indexOf('registrar(createServiceClient()'))
})

test('el lote de comentarios para Levy: un solo mensaje con archivo, línea, cita y lo que pide', async () => {
  const { mensajeParaLevy, textoBotonLevy } = await import('../../src/features/cabina/documento/comentarios')
  const m = mensajeParaLevy([
    { id: 'a', ruta: 'entregas/propuesta.md', linea: 12, cita: 'El precio   del diagnóstico', texto: 'Súbelo a 900', creado: 1 },
    { id: 'b', ruta: 'entregas/propuesta.md', texto: 'Quita el último párrafo', creado: 2 },
  ])
  assert.match(m, /^2 comentarios sobre lo que me entregaste\. Aplícalos en una sola pasada/)
  assert.match(m, /1\. `entregas\/propuesta\.md:12` · «El precio del diagnóstico»\n   Súbelo a 900/)
  assert.match(m, /2\. `entregas\/propuesta\.md`\n   Quita el último párrafo/)
  assert.equal(textoBotonLevy(1), 'Mandar 1 comentario a Levy')
})
