// Fundador en Windows (29 oct 2026, v0.2.15): «Taller › Agentes muestra "El Studio no respondió · No disponible en esta
// edición"». La fuente de trabajos no estaba en la lista blanca, así que `datos.ts` la cortaba en el navegador sin
// consultar nada, y el texto nombraba el Studio de Daniel. Este sensor fija que Taller › Agentes de la edición cliente
// consulte de verdad a su daemon (lista blanca), que vacío diga «Aún no has delegado nada» y que nada nombre el Studio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiPermitidaEnCliente, sinRespuestaDelServidor } from '../../src/lib/edicion'
import { fuenteEnPalabras, urlSalida, urlTrabajos, type Trabajos } from '../../src/features/cabina/trabajos-modelo'
import { textoTallerVacio } from '../../src/features/cabina/panel/taller-vacio'

const fuente = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8')
const ruta = (url: string) => new URL(url, 'http://x').pathname

test('Taller › Agentes: sus fuentes están en la lista blanca (datos.ts ya no las corta)', () => {
  for (const url of [urlTrabajos(), urlTrabajos(30), urlSalida('a1b2c3')]) assert.equal(apiPermitidaEnCliente(ruta(url)), true, url)
  // Lo del Studio sigue fuera: servidores, actividad de subagentes de delegar y las acciones del tablero.
  for (const r of ['/api/cabina/servidores', '/api/cabina/actividad', '/api/cabina/detener', '/api/cabina/responder', '/api/cabina/apagar', '/api/cabina/negocio']) {
    assert.equal(apiPermitidaEnCliente(r), false, r)
  }
  // datos.ts corta solo lo que la lista no tiene: esa es la condición que hoy deja pasar a trabajos.
  assert.match(fuente('src/features/cabina/datos.ts'), /esEdicionCliente\(\) && !apiPermitidaEnCliente\(/)
})

test('vacío en cliente: «Aún no has delegado nada»; en la instalación de Daniel, como siempre', () => {
  const vacio: Pick<Trabajos, 'internas' | 'terminales'> = { internas: [], terminales: [] }
  assert.equal(textoTallerVacio(true, vacio).titulo, 'Aún no has delegado nada.')
  assert.match(textoTallerVacio(true, vacio).cuerpo, /Levy/)
  assert.equal(textoTallerVacio(true, undefined).titulo, 'Aún no has delegado nada.')
  assert.equal(textoTallerVacio(false, vacio).titulo, 'Nadie trabaja ahora.')
  const conHistorial = { internas: [{ id: 'x', tipo: 'subagente', descripcion: 'd', estado: 'completada', desde: '', actualizado: '', conversacion: 'c', turno: 't' }], terminales: [] } as unknown as Trabajos
  assert.equal(textoTallerVacio(true, conHistorial).titulo, 'Nadie trabaja ahora.')
})

test('en cliente ningún texto de Taller › Agentes nombra el Studio', () => {
  assert.doesNotMatch(sinRespuestaDelServidor(true), /Studio/)
  assert.match(sinRespuestaDelServidor(false), /Studio/)
  const d = { fuente: 'ninguna', sfterm: false, internas: [], terminales: [], servidores: [], servicios: [], leidoEn: '' } as Trabajos
  assert.doesNotMatch(fuenteEnPalabras(d, true), /Studio|motor|terminal/i)
  for (const r of ['src/app/api/cabina/[que]/route.ts', 'src/features/cabina/panel/TableroAgentes.tsx', 'src/features/cabina/panel/PanelDerecho.tsx']) {
    assert.doesNotMatch(fuente(r), /['"]El Studio no respondió/, `${r} todavía tiene el texto fijo del Studio`)
  }
  assert.match(fuente('src/features/cabina/panel/Taller.tsx'), /esEdicionCliente\(\) \? 'Mirando tu Arbrain…'/)
})
