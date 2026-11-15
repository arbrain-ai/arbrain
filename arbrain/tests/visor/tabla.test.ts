// Visor de tablas (14 nov 2026): CSV, .xlsx y el modelo que ordena, filtra y resume. Puro, sin DOM.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { strToU8, zipSync } from 'fflate'
import { decodificar, detectarSeparador, leerCsv, parsearCsv } from '../../src/features/cabina/documento/tabla/csv'
import { esFormatoFecha, formatearNumero, general, serialAMs } from '../../src/features/cabina/documento/tabla/formato'
import { leerXlsx, letraColumna, referencia } from '../../src/features/cabina/documento/tabla/xlsx'
import { columnaDeTextos, filtrar, frecuentes, histograma, interpretarFecha, interpretarNumero, ordenar, resumir, tablaDeFilas, tablaDeHoja } from '../../src/features/cabina/documento/tabla/modelo'

const f = (v: number, c: string) => formatearNumero(v, c).texto

test('CSV: comillas, comillas escapadas, saltos dentro del campo, CRLF y sin filas vacías', () => {
  assert.deepEqual(parsearCsv('a,b,c\r\n1,"dos, tres","di ""hola"""\n\n4,"línea\nnueva",\n'), [['a', 'b', 'c'], ['1', 'dos, tres', 'di "hola"'], ['4', 'línea\nnueva', '']])
  assert.deepEqual(parsearCsv(''), [])
  assert.deepEqual(parsearCsv('x'), [['x']])
  assert.deepEqual(parsearCsv('a;b\n1;2', ';'), [['a', 'b'], ['1', '2']])
})

test('CSV: el separador se adivina (coma, punto y coma, tabulador) y el TSV lo dice su nombre', () => {
  assert.equal(detectarSeparador('nombre;monto;fecha\nAna;1.234,50;01/02/2026\nLuis;99,00;02/02/2026\n'), ';')
  assert.equal(detectarSeparador('a\tb\tc\n1\t2\t3\n'), '\t')
  assert.equal(detectarSeparador('nombre,"monto; neto"\nAna,"1;2"\nLuis,3\n'), ',')
  assert.equal(leerCsv(strToU8('a,b\n1,2'), 'x.tsv').separador, '\t')
})

test('CSV: codificación (BOM, UTF-8 y Windows-1252 de Excel en español)', () => {
  assert.equal(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xb1])), 'añ')
  assert.equal(decodificar(new Uint8Array([0x61, 0xf1, 0x6f])), 'año')
})

test('formatos de Excel: números, moneda, porcentaje, negativos en rojo y General', () => {
  assert.equal(f(1234.5, '#,##0.00'), '1,234.50')
  assert.equal(f(-1234.5, '#,##0.00'), '-1,234.50')
  assert.equal(f(1234.567, '0'), '1235')
  assert.equal(f(0.256, '0.0%'), '25.6%')
  assert.equal(f(1.005, '0.00'), '1.01')
  assert.equal(f(1500, '"$"#,##0.00'), '$1,500.00')
  assert.equal(f(-1500, '"$"#,##0.00_);[Red]("$"#,##0.00)'), '($1,500.00)')
  assert.equal(formatearNumero(-1500, '#,##0;[Red]-#,##0').rojo, true)
  assert.equal(f(0, '#,##0.00;-#,##0.00;"—"'), '—')
  assert.equal(f(1234567, '#,##0,"k"'), '1,235k')
  assert.equal(f(1500, '[$€-x-euro2] #,##0.00'), '€ 1,500.00')
  assert.equal(f(123456789, '0.00E+00'), '1.23E+08')
  assert.equal(f(42, '@'), '42')
  assert.equal(general(0.1 + 0.2), '0.3')
  assert.equal(general(123456789012), '1.23457E+11')
  assert.equal(general(7), '7')
})

test('formatos de Excel: fechas y horas (sistema 1900 con su 29 de febrero falso, y 1904)', () => {
  assert.equal(esFormatoFecha('dd/mm/yyyy'), true)
  assert.equal(esFormatoFecha('#,##0.00'), false)
  assert.equal(esFormatoFecha('"Día" 0'), false)
  assert.equal(esFormatoFecha('[h]:mm:ss'), true)
  assert.equal(f(46340, 'dd/mm/yyyy'), '14/11/2026')
  assert.equal(f(46340, 'd mmm yyyy'), '14 nov 2026')
  assert.equal(f(46340, 'dddd d "de" mmmm'), 'sábado 14 de noviembre')
  assert.equal(f(46340.75, 'dd/mm/yyyy h:mm'), '14/11/2026 18:00')
  assert.equal(f(0.5625, 'h:mm AM/PM'), '1:30 p. m.')
  assert.equal(f(1.5, '[h]:mm'), '36:00')
  assert.equal(f(46340, 'yyyy-mm-dd'), '2026-11-14')
  assert.equal(new Date(serialAMs(1)).toISOString().slice(0, 10), '1900-01-01')
  assert.equal(new Date(serialAMs(61)).toISOString().slice(0, 10), '1900-03-01')
  assert.equal(new Date(serialAMs(44878, true)).toISOString().slice(0, 10), '2026-11-14')
})

test('interpretar texto: números con moneda, paréntesis, coma decimal y fechas', () => {
  assert.equal(interpretarNumero('$1,234.50')?.n, 1234.5)
  assert.equal(interpretarNumero('(1,234)')?.n, -1234)
  assert.equal(interpretarNumero('-12.5%')?.porcentaje, true)
  assert.equal(interpretarNumero('1.234,56 €', ',')?.n, 1234.56)
  assert.equal(interpretarNumero('12 abc'), null)
  assert.equal(interpretarNumero('2026-11-14'), null)
  assert.equal(interpretarFecha('2026-11-14')?.ms, Date.UTC(2026, 10, 14))
  assert.equal(interpretarFecha('14/11/2026')?.ms, Date.UTC(2026, 10, 14))
  assert.equal(interpretarFecha('11/14/2026', 'mda')?.ms, Date.UTC(2026, 10, 14))
  assert.equal(interpretarFecha('31/02/2026x'), null)
})

test('columnas: tipo, decimales alineados, negativos y lo que no se agrupa (años, folios, ceros a la izquierda)', () => {
  const montos = columnaDeTextos('Monto', 0, ['1200', '-35.5', '', '$9,999.99'])
  assert.equal(montos.tipo, 'numero')
  assert.deepEqual(montos.textos, ['$1,200.00', '-$35.50', '', '$9,999.99'])
  assert.equal(montos.rojos[1], 1)
  assert.equal(columnaDeTextos('Año', 1, ['2024', '2025']).textos[0], '2024')
  assert.equal(columnaDeTextos('Folio', 1, ['123456', '123457']).textos[0], '123456')
  assert.equal(columnaDeTextos('CP', 1, ['01234', '58000']).tipo, 'texto')
  assert.equal(columnaDeTextos('Fecha', 2, ['2026-11-14', '2026-01-02']).tipo, 'fecha')
  assert.equal(columnaDeTextos('Fecha', 2, ['13/01/2026', '02/03/2026']).valores[1], Date.UTC(2026, 2, 2))
  assert.equal(columnaDeTextos('Nombre', 3, ['Fulano', 'Mengano']).tipo, 'texto')
  assert.equal(columnaDeTextos('Neto', 4, ['1.234,50', '99,00']).valores[0], 1234.5)
})

test('tabla de un CSV: encabezado, ordenar (vacíos al final), filtrar sin acentos, resumen e histograma', () => {
  const t = tablaDeFilas([['Cliente', 'Ciudad', 'Monto'], ['Fúlano', 'Puebla', '300'], ['Mengano', 'CDMX', ''], ['Zutano', 'Puebla', '100'], ['Perengano', 'León', '200']])
  assert.equal(t.encabezado, true)
  assert.equal(t.filas, 4)
  assert.deepEqual(t.numeroFila, [2, 3, 4, 5])
  const todos = [0, 1, 2, 3]
  assert.deepEqual(ordenar(t, todos, 2, 1), [2, 3, 0, 1])
  assert.deepEqual(ordenar(t, todos, 2, -1), [0, 3, 2, 1])
  assert.deepEqual(ordenar(t, todos, 0, -1), [2, 3, 1, 0]) // Zutano, Perengano, Mengano, Fúlano
  assert.deepEqual(filtrar(t, new Map(), 'fulano'), [0])
  assert.deepEqual(filtrar(t, new Map(), 'leon'), [3])
  assert.deepEqual(filtrar(t, new Map([[1, { valores: new Set(['Puebla']) }]]), ''), [0, 2])
  assert.deepEqual(filtrar(t, new Map([[2, { min: 150 }]]), ''), [0, 3])
  const r = resumir(t.columnas[2], todos)
  assert.deepEqual([r.llenas, r.suma, r.promedio, r.min, r.max], [3, 600, 200, 100, 300])
  assert.deepEqual(frecuentes(t.columnas[1], todos)[0], { texto: 'Puebla', n: 2 })
  assert.equal(histograma(t.columnas[2], todos, 2)?.cuentas.reduce((a, b) => a + b), 3)
  assert.equal(tablaDeFilas([['1', '2'], ['3', '4']]).encabezado, false)
})

function xlsxDePrueba(): Uint8Array {
  const hoja1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="20" customWidth="1"/></cols><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>Monto</t></is></c><c r="D2" t="s"><v>3</v></c></row>
<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" s="1"><v>46340</v></c><c r="C3" s="2"><v>1500.5</v></c><c r="D3" t="b"><v>1</v></c></row>
<row r="4"><c r="A4" t="str"><f>UPPER("zutano")</f><v>ZUTANO</v></c><c r="B4" s="1"><v>46341</v></c><c r="C4" s="2"><f>C3*-2</f><v>-3001</v></c><c r="D4" t="e"><v>#N/A</v></c></row>
</sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells></worksheet>`
  const hoja2 = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c><v>1</v></c><c><v>2</v></c></row><row><c><v>3</v></c><c><v>4</v></c></row></sheetData></worksheet>`
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets><sheet name="Ventas &amp; gastos" sheetId="1" r:id="rId1"/><sheet name="Resumen" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<sst><si><t>Gastos de noviembre</t></si><si><t>Cliente</t></si><si><r><rPr><b/></rPr><t>Fe</t></r><r><t>cha</t></r></si><si><t>Pagado</t></si><si><t xml:space="preserve">Fulano</t><rPh><t>fulano</t></rPh></si></sst>`),
    'xl/styles.xml': strToU8(`<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\\-&quot;$&quot;#,##0.00"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(hoja1),
    'xl/worksheets/sheet2.xml': strToU8(hoja2),
  })
}

test('xlsx: hojas, cadenas compartidas y ricas, fórmulas, formatos, booleanos, errores, combinadas y paneles', () => {
  const libro = leerXlsx(xlsxDePrueba())
  assert.deepEqual(libro.hojas.map(h => h.nombre), ['Ventas & gastos', 'Resumen'])
  const h = libro.hojas[0]
  assert.equal(h.filas[1][1]!.t, 'Fecha')
  assert.equal(h.filas[2][1]!.t, '14/11/2026')
  assert.equal(h.filas[2][1]!.fecha, true)
  assert.equal(h.filas[2][2]!.t, '$1,500.50')
  assert.equal(h.filas[3][2]!.t, '-$3,001.00')
  assert.equal(h.filas[3][2]!.rojo, true)
  assert.equal(h.filas[3][2]!.f, 'C3*-2')
  assert.equal(h.filas[2][3]!.t, 'VERDADERO')
  assert.equal(h.filas[3][3]!.error, true)
  assert.equal(h.filas[3][0]!.t, 'ZUTANO')
  assert.equal(h.filas[2][0]!.t, 'Fulano')
  assert.deepEqual(h.combinadas, [{ r0: 0, c0: 0, r1: 0, c1: 3 }])
  assert.deepEqual(h.fijas, { filas: 2, columnas: 0 })
  assert.equal(h.anchos[0], 145)
  // Sin `r` en filas y celdas: se cuentan en orden.
  assert.deepEqual(libro.hojas[1].filas.map(f => f.map(c => c?.t)), [['1', '2'], ['3', '4']])
  // De hoja a tabla: el título queda como preámbulo y la fila 2 como encabezado.
  const t = tablaDeHoja(h)
  assert.deepEqual(t.preambulo, ['Gastos de noviembre'])
  assert.deepEqual(t.columnas.map(c => c.nombre), ['Cliente', 'Fecha', 'Monto', 'Pagado'])
  assert.deepEqual(t.columnas.map(c => c.tipo), ['texto', 'fecha', 'numero', 'texto'])
  assert.deepEqual(t.numeroFila, [3, 4])
  assert.throws(() => leerXlsx(strToU8('no soy un zip')), /xlsx válido/)
})

test('referencias de celda y letras de columna', () => {
  assert.deepEqual(referencia('AB12'), { c: 27, r: 11 })
  assert.deepEqual(referencia('$C$3'), { c: 2, r: 2 })
  assert.deepEqual([0, 25, 26, 701, 702].map(letraColumna), ['A', 'Z', 'AA', 'ZZ', 'AAA'])
})

test('rinde: 100 mil filas de CSV se leen, ordenan y filtran en menos de lo que tarda un parpadeo largo', () => {
  const lineas = ['id,fecha,cliente,monto,estado']
  for (let i = 0; i < 100_000; i++) lineas.push(`${i},2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')},Cliente ${i % 977},${(i * 37 % 10007) / 7},${i % 3 ? 'pagado' : 'pendiente'}`)
  const t0 = performance.now()
  const { filas } = leerCsv(strToU8(lineas.join('\n')), 'x.csv')
  const t = tablaDeFilas(filas)
  const leer = performance.now() - t0
  const indices = Array.from({ length: t.filas }, (_, i) => i)
  const t1 = performance.now(); ordenar(t, indices, 3, -1); const orden = performance.now() - t1
  const t2 = performance.now(); filtrar(t, new Map(), 'cliente 97'); const filtro = performance.now() - t2
  assert.equal(t.filas, 100_000)
  assert.equal(t.columnas[3].tipo, 'numero')
  assert.ok(leer < 4000 && orden < 1500 && filtro < 1500, `leer ${leer.toFixed(0)} ms · ordenar ${orden.toFixed(0)} ms · filtrar ${filtro.toFixed(0)} ms`)
})
