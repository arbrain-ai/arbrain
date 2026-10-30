// Adjuntos del chat en la edición cliente (v0.2.6; un fundador: «el servidor la rechazó (código 404: No disponible en esta
// edición)»). Se guardan en la carpeta de datos de la web con tope, tipos comprobados por sus bytes y nombre del servidor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AdjuntoRechazado, MAX_ADJUNTO_BYTES, guardarAdjuntoLocal, leerAdjuntoLocal, nombreAdjuntoValido, tipoDeAdjunto } from '../../src/lib/adjuntos-locales'
import { rutaVisibleDeAdjunto, separarAdjuntos } from '../../src/features/chat/lib/adjuntos'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const bytes = (s: string) => new TextEncoder().encode(s)
const rechazo = (code: string) => (e: unknown) => e instanceof AdjuntoRechazado && e.code === code

function carpeta() { return mkdtempSync(join(tmpdir(), 'arbrain-adj-web-')) }

test('imagen, PDF y texto se guardan con nombre del servidor y se leen con su tipo', () => {
  const dir = carpeta()
  try {
    const img = guardarAdjuntoLocal({ nombre: 'captura.png', bytes: PNG }, dir)
    assert.match(img, /^chat-\d+-[0-9a-f]{6}\.png$/)
    assert.equal(leerAdjuntoLocal(img, dir)?.tipo, 'image/png')
    // La extensión la decide el contenido, no el nombre que manda el navegador.
    assert.match(guardarAdjuntoLocal({ nombre: 'foto.png', bytes: JPG }, dir), /\.jpg$/)
    const pdf = guardarAdjuntoLocal({ nombre: 'Estado de cuenta — Octubre.pdf', bytes: bytes('%PDF-1.7\n...') }, dir)
    assert.match(pdf, /^chat-\d+-[0-9a-f]{6}-Estado-de-cuenta-Octubre\.pdf$/)
    assert.equal(leerAdjuntoLocal(pdf, dir)?.tipo, 'application/pdf')
    for (const n of ['notas.md', 'datos.csv', 'a.txt', 'b.json']) assert.ok(nombreAdjuntoValido(guardarAdjuntoLocal({ nombre: n, bytes: bytes('hola, ñandú') }, dir)), n)
    if (process.platform !== 'win32') {
      assert.equal(statSync(join(dir, img)).mode & 0o777, 0o600)
      assert.equal(statSync(dir).mode & 0o777, 0o700)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('tipos fuera de la lista o con bytes que no coinciden se rechazan', () => {
  const dir = carpeta()
  try {
    for (const [nombre, b] of [
      ['pagina.html', bytes('<script>alert(1)</script>')],
      ['logo.svg', bytes('<svg onload=alert(1)>')],
      ['falso.pdf', bytes('<html>no soy pdf</html>')],
      ['binario.txt', new Uint8Array([0x61, 0, 0x62])],
      ['latin1.md', new Uint8Array([0xe9, 0xe9])],
      ['falso.docx', bytes('no es zip')],
      ['programa.exe', new Uint8Array([0x4d, 0x5a])],
    ] as const) assert.throws(() => guardarAdjuntoLocal({ nombre, bytes: b }, dir), rechazo('tipo_invalido'), nombre)
    assert.throws(() => guardarAdjuntoLocal({ nombre: 'vacio.png', bytes: new Uint8Array() }, dir), rechazo('sin_archivo'))
    const grande = new Uint8Array(MAX_ADJUNTO_BYTES + 1); grande.set(PNG)
    assert.throws(() => guardarAdjuntoLocal({ nombre: 'grande.png', bytes: grande }, dir), rechazo('demasiado_grande'))
    assert.deepEqual(readdirSync(dir), [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('nombres con rutas se sanean; la lectura no sale de la carpeta', () => {
  const dir = carpeta()
  try {
    const n = guardarAdjuntoLocal({ nombre: '../../daemon/config/acceso.json', bytes: bytes('{}') }, dir)
    assert.match(n, /^chat-\d+-[0-9a-f]{6}-daemon-config-acceso\.json$/)
    for (const malo of ['../acceso.json', '..%2Facceso.json', 'chat-1761150000000-a1b2c3/../../x.png', 'acceso.json', 'chat-1761150000000-a1b2c3.html', '']) {
      assert.equal(leerAdjuntoLocal(malo, dir), null, malo)
    }
    writeFileSync(join(tmpdir(), 'arbrain-fuera.png'), PNG)
    if (process.platform !== 'win32') {
      symlinkSync(join(tmpdir(), 'arbrain-fuera.png'), join(dir, 'chat-1761150000000-ffffff.png'))
      assert.equal(leerAdjuntoLocal('chat-1761150000000-ffffff.png', dir), null)
      linkSync(join(tmpdir(), 'arbrain-fuera.png'), join(dir, 'chat-1761150000000-eeeeee.png'))
      assert.equal(leerAdjuntoLocal('chat-1761150000000-eeeeee.png', dir), null, 'enlace duro')
    }
    // Un nombre con «..» se guarda (colapsado), no se rechaza con un error engañoso.
    assert.match(guardarAdjuntoLocal({ nombre: 'v1..2.pdf', bytes: bytes('%PDF-1.7') }, dir), /-v1\.2\.pdf$/)
    assert.equal(tipoDeAdjunto('chat-1761150000000-a1b2c3.svg'), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('el chat pinta el adjunto local por ruta relativa (sobrevive a un cambio de puerto)', () => {
  const url = 'http://127.0.0.1:4310/api/storage/adjunto/chat-1761150000000-a1b2c3.png'
  assert.equal(rutaVisibleDeAdjunto(url), '/api/storage/adjunto/chat-1761150000000-a1b2c3.png')
  const doc = 'http://127.0.0.1:4310/api/storage/adjunto/chat-1761150000000-a1b2c3-Contrato.pdf'
  const { imagenes, documentos } = separarAdjuntos(`${url}\n${doc}`)
  assert.deepEqual(imagenes, ['/api/storage/adjunto/chat-1761150000000-a1b2c3.png'])
  assert.deepEqual(documentos, ['/api/storage/adjunto/chat-1761150000000-a1b2c3-Contrato.pdf'])
  assert.equal(rutaVisibleDeAdjunto('https://ejemplo.com/foto.png'), 'https://ejemplo.com/foto.png')
})
