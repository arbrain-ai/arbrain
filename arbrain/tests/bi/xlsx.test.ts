/**
 * Lector mínimo de .xlsx (fuentes/xlsx.ts) contra libros armados aquí mismo con un escritor ZIP de juguete: hojas, strings
 * compartidas con runs y fonética, inlineStr, booleanos, errores, huecos, entidades, `_xHHHH_`, prefijos de espacio de nombres
 * y las fechas de Excel (1900 con su 29 de febrero falso, y 1904).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib, { deflateRawSync } from 'node:zlib'
import { leerXlsx, serialAFecha, type CeldaXlsx } from '../../src/features/bi/fuentes/xlsx'

// ── Un escritor ZIP mínimo (deflate o stored, CRC-32 correcto) ──

const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = TABLA[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

interface Archivo { nombre: string; datos: string; metodo?: 0 | 8 | 12; extraLocal?: Buffer }

function zip(archivos: Archivo[], comentario = ''): Buffer {
  const locales: Buffer[] = [], centrales: Buffer[] = []
  let off = 0
  for (const a of archivos) {
    const crudo = Buffer.from(a.datos, 'utf8')
    const metodo = a.metodo ?? 8
    const comp = metodo === 8 ? deflateRawSync(crudo) : crudo
    const nombre = Buffer.from(a.nombre, 'utf8'), extra = a.extraLocal ?? Buffer.alloc(0), crc = crc32(crudo)
    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6); l.writeUInt16LE(metodo, 8)
    l.writeUInt16LE(0, 10); l.writeUInt16LE(0x5b68, 12); l.writeUInt32LE(crc, 14); l.writeUInt32LE(comp.length, 18)
    l.writeUInt32LE(crudo.length, 22); l.writeUInt16LE(nombre.length, 26); l.writeUInt16LE(extra.length, 28)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(metodo, 10)
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x5b68, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(crudo.length, 24)
    c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(off, 42) // extra y comentario del directorio central: 0
    locales.push(l, nombre, extra, comp); centrales.push(c, nombre)
    off += 30 + nombre.length + extra.length + comp.length
  }
  const cd = Buffer.concat(centrales), com = Buffer.from(comentario, 'utf8')
  const e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(archivos.length, 8); e.writeUInt16LE(archivos.length, 10)
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16); e.writeUInt16LE(com.length, 20)
  return Buffer.concat([...locales, cd, e, com])
}

// ── Un libro de dos hojas ──

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const workbook = (d1904: boolean) => `${DECL}<workbook xmlns="${NS}" xmlns:r="${REL}"><fileVersion appName="xl"/><workbookPr ${d1904 ? 'date1904="1" ' : ''}defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0"/></bookViews><sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/><sheet r:id="rId2" name="Notas &amp; más" sheetId="7" state="visible"/></sheets><calcPr calcId="191029"/></workbook>`

const rels = `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId4" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="/xl/worksheets/hoja-notas.xml"/><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`

const compartidas = `${DECL}<sst xmlns="${NS}" count="8" uniqueCount="7">`
  + '<si><t>Fecha</t></si>'
  + '<si><t>Cliente</t></si>'
  + '<si><r><rPr><b/><sz val="11"/></rPr><t>Mon</t></r><r><t xml:space="preserve">to </t></r><r><rPr><i/></rPr><t>USD</t></r><rPh sb="0" eb="3"><t>モント</t></rPh><phoneticPr fontId="1"/></si>'
  + '<si><t>Pan &amp; Café &lt;3&gt; &quot;VIP&quot; &apos;x&apos; &#233;l &#x1F600;</t></si>'
  + '<si><t xml:space="preserve">línea_x000D_\nsegunda</t></si>'
  + '<si><t>_x005F_x000D_ literal</t></si>'
  + '<si><t/></si>'
  + '</sst>'

const hojaVentas = `${DECL}<worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="A1:E900000"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="12"/></cols><sheetData>`
  + '<row r="1" spans="1:5"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="E1" t="inlineStr"><is><t>Nota</t></is></c></row>'
  + '<row r="2" spans="1:5"><c r="A2" s="1"><v>45000</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="n"><v>1500.5</v></c><c r="D2" t="b"><v>1</v></c><c r="E2" t="e"><v>#DIV/0!</v></c></row>'
  + '<row r="4"><c r="A4" s="1"><v>45000.75</v></c><c r="B4" t="str"><f>"calc "&amp;CHAR(34)&amp;"x"&amp;CHAR(34)</f><v>calc &quot;x&quot;</v></c><c r="C4" s="3"/><c r="D4" t="b"><v>0</v></c><c r="E4" t="s"><v>6</v></c></row>'
  + '<row r="6" s="2" customFormat="1"><c r="B6" s="2"/><c r="C6" s="2"></c></row>'
  + '<row r="900000" ht="20" customHeight="1"/>'
  + '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><pageMargins left="0.7"/></worksheet>'

// Sin atributo r (posición secuencial) y con prefijo de espacio de nombres, como escriben algunos generadores.
const hojaNotas = `${DECL}<x:worksheet xmlns:x="${NS}"><x:sheetData>`
  + '<x:row><x:c t="inlineStr"><x:is><x:r><x:t>uno</x:t></x:r><x:r><x:rPr><x:i/></x:rPr><x:t xml:space="preserve"> dos</x:t></x:r></x:is></x:c><x:c t="s"><x:v>4</x:v></x:c></x:row>'
  + '<x:row><x:c><x:v>7</x:v></x:c><x:c/><x:c t="s"><x:v>5</x:v></x:c></x:row>'
  + '</x:sheetData></x:worksheet>'

function libro({ d1904 = false, metodoLibro = 8 as 0 | 8 | 12 } = {}): Buffer {
  return zip([
    { nombre: '[Content_Types].xml', datos: `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>` },
    { nombre: '_rels/.rels', datos: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', datos: workbook(d1904), metodo: metodoLibro },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: rels },
    // Stored (sin comprimir) y con un campo extra solo en el encabezado local: el lector debe usar las longitudes locales.
    { nombre: 'xl/sharedStrings.xml', datos: compartidas, metodo: 0, extraLocal: Buffer.from([0xfe, 0xca, 4, 0, 1, 2, 3, 4]) },
    { nombre: 'xl/worksheets/sheet1.xml', datos: hojaVentas, extraLocal: Buffer.from([0x55, 0x54, 5, 0, 1, 0x80, 0x9a, 0x2a, 0x66]) },
    { nombre: 'xl/worksheets/hoja-notas.xml', datos: hojaNotas },
    { nombre: 'xl/styles.xml', datos: `${DECL}<styleSheet xmlns="${NS}"/>` },
  ], 'hecho a mano para la prueba')
}

const VENTAS: CeldaXlsx[][] = [
  ['Fecha', 'Cliente', 'Monto USD', null, 'Nota'],
  [45000, 'Pan & Café <3> "VIP" \'x\' él 😀', 1500.5, true, null],
  [null, null, null, null, null],
  [45000.75, 'calc "x"', null, false, ''],
]

// ── Las pruebas ──

test('el escritor de la prueba calcula bien el CRC-32', () => {
  const x = Buffer.from('Arbrain · ventas 2026')
  const nativo = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32
  if (nativo) assert.equal(crc32(x), nativo(x))
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
})

test('la primera hoja por defecto: strings compartidas, runs sin fonética, inlineStr, números, booleanos, error y huecos', () => {
  const l = leerXlsx(libro())
  assert.deepEqual(l.hojas, ['Ventas', 'Notas & más'])
  assert.equal(l.hoja, 'Ventas')
  assert.equal(l.fecha1904, false)
  // Rectangular desde A1 hasta la última celda con dato: las filas vacías con formato (6 y 900000) no la estiran.
  assert.deepEqual(l.filas, VENTAS)
})

test('hoja por nombre sin distinguir mayúsculas ni espacios; sin r las celdas van en orden; _xHHHH_ y _x005F_', () => {
  const l = leerXlsx(new Uint8Array(libro()), '  notas & MÁS ')
  assert.equal(l.hoja, 'Notas & más')
  assert.deepEqual(l.filas, [
    ['uno dos', 'línea\r\nsegunda', null],
    [7, null, '_x000D_ literal'],
  ])
})

test('hoja que no existe: el error lista las que sí hay', () => {
  assert.throws(() => leerXlsx(libro(), 'Gastos'), { message: 'No existe la hoja «Gastos». Hojas en este Excel: «Ventas», «Notas & más».' })
})

test('date1904 del libro', () => {
  assert.equal(leerXlsx(libro({ d1904: true })).fecha1904, true)
})

test('serialAFecha: sistema 1900 con su 29 de febrero falso, horas y sistema 1904', () => {
  assert.equal(serialAFecha(45000), '2023-03-15')
  assert.equal(serialAFecha(1), '1900-01-01')
  assert.equal(serialAFecha(59), '1900-02-28')
  assert.equal(serialAFecha(60), '1900-02-29')
  assert.equal(serialAFecha(61), '1900-03-01')
  assert.equal(serialAFecha(45000.75), '2023-03-15T18:00:00')
  assert.equal(serialAFecha(45000 + (13 * 3600 + 5 * 60 + 9) / 86400), '2023-03-15T13:05:09')
  assert.equal(serialAFecha(45000.9999999), '2023-03-16', 'redondea al segundo y pasa al día siguiente')
  assert.equal(serialAFecha(0, true), '1904-01-01')
  assert.equal(serialAFecha(45000 - 1462, true), '2023-03-15')
  assert.equal(serialAFecha(45000.5, true), '2027-03-16T12:00:00')
  assert.throws(() => serialAFecha(-1), /no es una fecha de Excel/)
})

test('lo que no es un .xlsx se dice en palabras', () => {
  assert.throws(() => leerXlsx(Buffer.from('fecha,monto\n2026-11-01,10\n')), { message: 'No es un archivo de Excel (.xlsx).' })
  assert.throws(() => leerXlsx(new Uint8Array(0)), { message: 'No es un archivo de Excel (.xlsx).' })
  // Un zip que no es Excel.
  assert.throws(() => leerXlsx(zip([{ nombre: 'hola.txt', datos: 'hola' }])), { message: 'No es un archivo de Excel (.xlsx).' })
  // .xls viejo o .xlsx con contraseña (contenedor OLE).
  assert.throws(() => leerXlsx(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)])), /^Error: No es un archivo de Excel \(\.xlsx\)\. Parece un Excel viejo \(\.xls\)/)
  // Compresión que no es stored ni deflate.
  assert.throws(() => leerXlsx(libro({ metodoLibro: 12 })), { message: 'El Excel usa un formato que no sé leer; guárdalo como .xlsx normal o como CSV.' })
})

test('más de 200 000 filas con dato: error en palabras', () => {
  const grande = zip([
    { nombre: 'xl/workbook.xml', datos: `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Todo" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', datos: `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="200001"><c r="A200001"><v>2</v></c></row></sheetData></worksheet>` },
  ])
  assert.throws(() => leerXlsx(grande), /La hoja «Todo» pasa de 200 000 filas/)
  // Sin sharedStrings ni _rels/.rels también se lee.
  const chico = zip([
    { nombre: 'xl/workbook.xml', datos: `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Todo" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', datos: `<worksheet xmlns="${NS}"><sheetData><row r="2"><c r="B2"><v>3.5</v></c></row></sheetData></worksheet>` },
  ])
  assert.deepEqual(leerXlsx(chico).filas, [[null, null], [null, 3.5]])
})
