// Visor de video que no se congela en silencio (8 nov 2026, Daniel: «se quedó así congelada, le regreso pero no cambia, se regresa al
// segundo 13»; «¿es posible ver la miniatura del frame abajo, justo como YT?»).
// Lo medido ese día: una captura mostraba el reloj en 0:16 con el fotograma del ~0:30 (la imagen del video real en ese instante).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { textoFallaVideo } from '../../src/features/cabina/documento/medio'

const leer = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')
const visor = leer('src/features/cabina/vistas/visor/VisorVideo.tsx')
const css = leer('src/features/cabina/vistas/visor/visor.module.css')
const documento = leer('src/features/cabina/vistas/Documento.tsx')
const ruta = leer('src/app/api/cabina/documento/crudo/[token]/[...ruta]/route.ts')

test('qué se le dice cuando el <video> falla', () => {
  assert.match(textoFallaVideo(2), /conexión/)
  assert.match(textoFallaVideo(3), /decodificar/)
  assert.match(textoFallaVideo(4), /enlace/)
  assert.match(textoFallaVideo(undefined), /dejó de responder/)
  assert.match(textoFallaVideo(null), /dejó de responder/)
})

test('ningún desenfoque (backdrop-filter) encima del video que se reproduce: congela la imagen en WebKit', () => {
  // Solo las reglas del reproductor (el escenario, la barra de controles, la vista previa, el compositor de marcas); `.jugar` es el
  // botón de las tarjetas de la carpeta de entrega y no va sobre un video en reproducción.
  const reglas = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), cuerpo: m[2] }))
  const delReproductor = reglas.filter(r => /\.video\b|\.mando\b|\.composer\b|\.vista|\.espera\b|\.falla\b|\.escena\b|\.cuadro\b|\.pantalla\b/.test(r.selector))
  assert.ok(delReproductor.length > 10, 'no se encontraron las reglas del reproductor')
  for (const r of delReproductor) assert.doesNotMatch(r.cuerpo, /backdrop-filter/, `${r.selector} lleva backdrop-filter`)
})

test('el reloj y la barra no dependen solo de requestAnimationFrame', () => {
  // Los eventos del propio video (se oyen aunque la ventana esté tapada) y un temporizador de respaldo.
  assert.match(visor, /onTimeUpdate=\{\(\) => \{ if \(i === a\) sincronizar\(\) \}\}/)
  assert.match(visor, /onSeeked=\{\(\) => \{ if \(i === a\) \{ sincronizar\(\)/)
  assert.match(visor, /window\.setInterval\(\(\) => \{ if \(performance\.now\(\) - ultimoCuadro\.current > 700\) sincronizar\(\) \}, 500\)/)
  assert.match(visor, /window\.clearInterval\(guardia\)/)
})

test('si el servidor firma otro enlace, el video vuelve a su segundo y a su play (no a 0 en pausa)', () => {
  assert.match(visor, /useLayoutEffect\(\(\) => \{\s*lista\.forEach/)
  assert.match(visor, /previa === x\.url/)
  assert.match(visor, /addEventListener\('loadedmetadata', \(\) => \{ try \{ el\.currentTime = guardado \}/)
  assert.match(visor, /pos\.current = \{ t: ct, corria: !m\.paused \}/)
})

test('cargando y fallas se ven: Cargando…, el motivo y Reintentar (que además vuelve a pedir el documento)', () => {
  assert.match(visor, /onWaiting=\{\(\) => \{ if \(i === a\) alEmpezarEspera\(\) \}\}/)
  assert.match(visor, /onError=\{e => \{ if \(i === a\) alFallar\(e\.currentTarget\) \}\}/)
  assert.match(visor, /Cargando…/)
  assert.match(visor, /onClick=\{recuperar\}>Reintentar/)
  assert.match(visor, /alReintentar\?\.\(\)/)
  assert.match(documento, /alReintentar=\{\(\) => \{ void releer\(url\) \}\}/)
})

test('la miniatura va bajo el cursor sobre la barra, sin re-renderizar el visor', () => {
  assert.match(visor, /const moverVista = \(clientX: number\)/)
  assert.match(visor, /const alMover = \(e: React\.PointerEvent\) => \{ if \(arrastre\.current\) irA\(posicion\(e\.clientX\)\); moverVista\(e\.clientX\) \}/)
  assert.match(visor, /useMiniaturas\(dur > 30 \? actual\?\.url : undefined\)/)
  assert.match(visor, /celdaDeMiniatura\(hoja, seg\)/)
  assert.match(css, /\.vista\[data-visible\] \{ opacity: 1; \}/)
})

test('la ruta firmada del video sirve las miniaturas con el mismo token y los mismos permisos (después de ellos)', () => {
  const i = ruta.indexOf("searchParams.get('miniaturas')")
  assert.ok(i > 0, 'falta el manejo de ?miniaturas')
  for (const guarda of ['verificar(token)', 'rutaPermitida(real', 'estadoDirecto()', 'info?.isFile()']) assert.ok(ruta.indexOf(guarda) > 0 && ruta.indexOf(guarda) < i, `${guarda} debe ir antes de servir miniaturas`)
})
