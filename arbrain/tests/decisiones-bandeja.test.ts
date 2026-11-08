import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agruparPorPersona, deshacible, enOrden, tituloEnGrupo, estadoDecidida, fraseEspera, lineaRecomendacion, minutos, recomendadas, urlVistaPrevia, type Tarjeta, type VistaBandeja } from '../src/features/decisiones/lib/bandeja'
import { seQuedaAlReabrir } from '../src/features/cabina/panel/telefono-logica'

const t = (o: Partial<Tarjeta>): Tarjeta => ({ id: 'cf_000000000001', estado: 'en_cola', tipo: 'decision', categoria: 'enviar', origen: 'agente', titulo: 'x', creada: 1, irreversible: true, ...o })

test('en orden: la que más lleva esperando primero; en lote solo las que Levy recomienda con Sí', () => {
  const lista = [t({ id: 'b', creada: 20, recomienda: 'si', categoria: 'otra' }), t({ id: 'a', creada: 10, recomienda: 'no' }), t({ id: 'c', creada: 30, recomienda: 'si', tipo: 'manos' })]
  assert.deepEqual(enOrden(lista).map(x => x.id), ['a', 'b', 'c'])
  assert.deepEqual(recomendadas(lista).map(x => x.id), ['b'])   // «Córrelo tú» nunca va en lote
})

test('la recomendación se dice en voz de Levy, sin repetir el sí o el no', () => {
  assert.equal(lineaRecomendacion(t({ recomienda: 'si', recomendacion: 'Sí: es parte de lo que pediste' })), 'Recomiendo que sí: es parte de lo que pediste')
  assert.equal(lineaRecomendacion(t({ recomienda: 'no', recomendacion: 'todavía no llega la factura' })), 'Recomiendo que no: todavía no llega la factura')
  assert.equal(lineaRecomendacion(t({})), null)
})

test('la métrica del día en una frase', () => {
  assert.equal(minutos(42), '42 min')
  assert.equal(minutos(125), '2 h 5 min')
  assert.equal(fraseEspera({ dia: '2026-11-03', minutos: 42, tarjetas: 2, abiertas: 1 }), 'Hoy el sistema esperó 42 min por ti (2 decisiones, 1 abierta).')
  assert.match(fraseEspera({ dia: '2026-11-03', minutos: 0, tarjetas: 0, abiertas: 0 }), /no ha esperado/)
})

test('estado de lo decidido y qué se puede deshacer', () => {
  assert.equal(estadoDecidida(t({ respuesta: 'otro', comentario: 'por correo' })), 'Otro: «por correo»')
  assert.equal(estadoDecidida(t({ estado: 'usada' })), 'Sí')
  assert.equal(deshacible({ ts: 'x', clase: 'configurar', que: 'y', sesion: 's' }), true)
  assert.equal(deshacible({ ts: 'x', clase: 'configurar', que: 'y' }), false)
})

test('volver a la bandeja del teléfono tras mirar otra app no te manda al chat', () => {
  assert.equal(seQuedaAlReabrir('/telefono/decisiones'), true)
})

test('«Sí a todas» (3 nov 2026): nunca agrupa contactar ni pagar; esas van una por una', () => {
  const lista = [t({ id: 'a', recomienda: 'si', categoria: 'otra' }), t({ id: 'b', recomienda: 'si', categoria: 'enviar' }), t({ id: 'c', recomienda: 'si', categoria: 'pagar' }),
    t({ id: 'd', recomienda: 'si', categoria: 'borrar' }), t({ id: 'e', recomienda: 'si', categoria: 'otra', unaPorUna: true }), t({ id: 'f', recomienda: 'no', categoria: 'otra' })]
  assert.deepEqual(recomendadas(lista).map(x => x.id), ['a', 'd'])
})

test('lo que venció (4 nov 2026, 19:31): sale de la lista en el acto y vive solo en el historial de la bandeja', () => {
  const f = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')
  assert.equal(estadoDecidida(t({ estado: 'vencida' })), 'ya no aplica')
  const franja = f('features/decisiones/FranjaDecisiones.tsx')
  // La sección solo pinta lo que espera: ni renglón tachado ni «ya no aplica».
  assert.match(franja, /const hay = pendientes\.length > 0/)
  assert.doesNotMatch(franja, /vencidas|data-vencida|ya no aplica<\/em>/)
  // El historial sí lo cuenta: «Decidiste hoy · N ya no aplica».
  assert.match(f('features/decisiones/Bandeja.tsx'), /v\.vencidasHoy\?\.length \? ` · \$\{v\.vencidasHoy\.length\} ya no aplica/)
})

test('«Esperan tu toque» vive DENTRO de la tarjeta HOY (4 nov 2026), junto a las tareas; es el único lugar con «N te esperan»', () => {
  const f = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')
  const dia = f('features/planning/DiaVivo.tsx')
  assert.match(dia, /const conBandeja = esHoy && !snapshot\?\.perfil/)
  assert.match(dia, /const decisiones = conBandeja && bandeja\.vista \? <SeccionDecisiones b=\{bandeja\} \/> : null/)
  // En el detalle de la tarjeta, después de la lista del día; nunca como bloque aparte arriba.
  const detalle = dia.slice(dia.indexOf('const objetivoDetalle'), dia.indexOf('const gobierno'))
  assert.ok(detalle.indexOf('<ListaDia') < detalle.indexOf('{decisiones}'), 'tareas → decisiones, en el detalle de HOY')
  assert.doesNotMatch(dia.slice(dia.indexOf('if (dosColumnas)')), /\{decisiones\}/)
  // Plegada: la línea dice cuántas esperan y la abre.
  assert.match(dia, /aviso=\{<AvisoDecisiones n=\{esperan\} \/>\} abrirSenal=\{abrirHoy\}/)
  assert.match(f('features/decisiones/FranjaDecisiones.tsx'), /const pendientes = enOrden\(b\.vista\?\.pendientes \?\? \[\]\)/)
  // 19:31 (Daniel: «quita eso de 5 te esperan… debería solo aparecer en la vista de mi hoy»): fuera del encabezado del chat y fuera de
  // la franja propia de /telefono. La píldora conserva subagentes y «N pregunta».
  const pildora = f('features/cabina/panel/AgentesTrabajando.tsx')
  assert.doesNotMatch(pildora, /te-espera|useBandeja|irADecisiones/)
  assert.match(pildora, /data-testid="agentes-trabajando"/)
  assert.match(pildora, /data-testid="te-pregunta"/)
  assert.doesNotMatch(f('features/cabina/panel/PanelTelefono.tsx'), /FranjaDecisiones/)
  assert.doesNotMatch(f('features/decisiones/FranjaDecisiones.tsx'), /export function FranjaDecisiones/)
})

test('el teléfono igual que el escritorio (4 nov 2026): HOY nace plegada, el aviso la abre sin guardarlo y el push llega a la decisión', () => {
  const f = (r: string) => readFileSync(new URL(`../src/${r}`, import.meta.url), 'utf8')
  const dia = f('features/planning/DiaVivo.tsx')
  // En el teléfono la tarjeta no recuerda que quedó abierta: nace plegada y la línea del tiempo a la vista.
  assert.match(dia, /: \{ recordar: !telefono \}\)\} \/>/)
  const plan = f('features/planning/FranjaPlan.tsx')
  // La señal (aviso, push) abre solo esta vez: nunca escribe la preferencia.
  assert.match(plan, /useEffect\(\(\) => \{ if \(abrirSenal\) setPorSenal\(true\) \}, \[abrirSenal\]\)/)
  assert.doesNotMatch(plan, /if \(abrirSenal && !preferida\) alternar\(\)/)
  // El push (/telefono/decisiones?id=…): si sigue esperando, al Día de hoy en esa decisión.
  const pagina = f('app/(main)/telefono/decisiones/page.tsx')
  assert.match(pagina, /pedirEnfocarDecisiones\(id\)\n    abrirHoyEnTelefono\(\)\n    router\.replace\('\/telefono'\)/)
  assert.match(pagina, /vista\?\.pendientes\.some\(t => t\.id === id\)/)
  const tel = f('features/cabina/panel/telefono-pestanas.ts')
  assert.match(tel, /f\.actualizar\(cal\.id, \{ \.\.\.resto, alcance: 'dia' \}\)/)
  // La sección abre la decisión pedida y la trae a la vista.
  assert.match(f('features/decisiones/FranjaDecisiones.tsx'), /if \(fila\) setAbierta\(id\)/)
})

test('agrupar por persona (4 nov 2026): dos de Mengano = una tarjeta con dos acciones, en el lugar de la más vieja', () => {
  const lista = [
    t({ id: 'fulano', creada: 1, persona: 'Fulano', titulo: 'WhatsApp a Fulano: mover el diagnóstico' }),
    t({ id: 'm1', creada: 2, persona: 'Mengano', titulo: 'WhatsApp a Mengano: adelantar su uno a uno' }),
    t({ id: 'compra', creada: 3, categoria: 'pagar', titulo: 'Comprar midominio.app' }),
    t({ id: 'm2', creada: 4, persona: 'Mengano Pérez', titulo: 'Comentario a Mengano en el resumen fijado' }),
  ]
  const g = agruparPorPersona(lista)
  assert.deepEqual(g.map(x => x.tarjetas.map(y => y.id)), [['fulano'], ['m1', 'm2'], ['compra']])
  assert.equal(g[1].persona, 'Mengano')
  assert.equal(tituloEnGrupo(lista[1]), 'WhatsApp · adelantar su uno a uno')
  assert.equal(tituloEnGrupo(lista[3]), 'Comentario a Mengano en el resumen fijado')
  assert.equal(tituloEnGrupo(lista[2]), 'Comprar midominio.app')
})

test('Sí y No son la tecla del compositor: la recomendada encendida, la otra apagada', () => {
  const franja = readFileSync(new URL('../src/features/decisiones/FranjaDecisiones.tsx', import.meta.url), 'utf8')
  assert.match(franja, /import tecla from '@\/features\/chat\/components\/boton-enviar\.module\.css'/)
  assert.equal((franja.match(/className=\{`\$\{tecla\.enviar\} \$\{s\.tecla\}`\} data-apagada=/g) ?? []).length, 2)
})

test('Ajustes › Autonomía: lo irreversible no ofrece «lo hace solo»; cambiar una clase conserva lo demás que cambiaste', async () => {
  const { ajustesCon, modosDe, NOMBRE_MODO } = await import('../src/features/decisiones/lib/bandeja')
  assert.deepEqual(modosDe({ irreversible: true }), ['tocar', 'nunca'])
  assert.deepEqual(modosDe({ irreversible: false }), ['hacer', 'tocar', 'nunca'])
  assert.equal(NOMBRE_MODO.hacer, 'Lo hace solo')
  const p = { preset: 'piloto' as const, ajustes: { pagar: 'nunca' as const }, vigente: {} as never, presets: [], clases: [], siempreTuyo: [] }
  assert.deepEqual(ajustesCon(p, 'soporte', 'hacer'), { pagar: 'nunca', soporte: 'hacer' })
  assert.deepEqual(ajustesCon({ ...p, ajustes: undefined }, 'soporte', 'hacer'), { soporte: 'hacer' })
})

test('vista previa (7 nov 2026, cola de publicación): la tarjeta enseña la miniatura de lo que se publicaría, por /api/local-image', () => {
  assert.equal(urlVistaPrevia(t({ imagen: '/Users/x/final/miniaturas/miniatura a.png' })), '/api/local-image?path=%2FUsers%2Fx%2Ffinal%2Fminiaturas%2Fminiatura%20a.png&w=640')
  assert.equal(urlVistaPrevia(t({})), null)
  for (const archivo of ['Bandeja.tsx', 'FranjaDecisiones.tsx']) {
    const src = readFileSync(new URL(`../src/features/decisiones/${archivo}`, import.meta.url), 'utf8')
    assert.match(src, /vista && <img className=\{s\.vista\} src=\{vista\}/, `${archivo} pinta la vista previa`)
  }
})
