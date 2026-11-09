# Business Intelligence · contrato de Levy

El dueño le pregunta en español a su negocio desde el panel (sección **Business Intelligence**, ruta `/bi`, menú «+») y
**Levy contesta con una gráfica**, no con un párrafo: elige una consulta de un **catálogo cerrado** y la escribe como
especificación. El panel la pinta, la recalcula cada vez que se abre, le pone su **corredor de lo normal**, decide si
enciende la **alarma** y enseña el **cuello** del embudo. Nada de SQL libre.

La pregunta llega al chat como un mensaje que empieza con `Pregunta para Business Intelligence: «…»`.

## El estándar (lo mismo en cualquier negocio)

1. **Pregunta → consulta cerrada → gráfica.** Una pregunta nunca corre código nuevo: cae en una consulta del catálogo,
   con sus ventanas (7, 30 o 90 días) y sus tipos de gráfica permitidos.
2. **Corredor de lo normal:** p10–p90 de los 28 días anteriores a cada punto (mínimo 14 medidos; con menos,
   «aprendiendo»). Lo normal sale de la historia de ese número, no de una meta.
3. **La alarma (Beer, algedónica):** salirse del corredor por medio ancho o más enciende la señal: **placer** (oro) si el
   número va hacia donde es bueno, **dolor** (rojo) si va en contra. Sube UNA excepción (el dolor pesa 1.25×) con qué
   pasó, por qué creemos (récord, el corredor, qué más se salió ese día) y qué propone Levy. «Hablarlo con Levy» le
   manda todo eso al chat.
4. **El cuello:** la etapa con `cuello.es` en `embudo.json` (el estándar `arbrain.embudo/v1`, [../embudo/README.md](../embudo/README.md)).
5. **Falta de dato no es cero.** Un día que la fuente no cubre es «sin medir»; un promedio sin ventas no existe; lo que
   no trae su canal o su producto se cuenta aparte.

## Dónde vive cada cosa (en el cerebro del dueño)

| Qué | Dónde |
|---|---|
| Las gráficas (lo que pregunta y lo fijado) | `.claude/memory/project/mi-negocio/bi.json` |
| De dónde salen los números | `.claude/memory/project/mi-negocio/bi-fuentes.json` |
| Las llaves de una base (URL con contraseña, api key) | `.claude/bi.env` o el entorno; **nunca en la memoria** (git ignora `*.env`) |
| Los archivos que exporta el negocio (CSV, Excel) | `mi-negocio/datos/…` (recomendado) |
| El embudo y su cuello | `.claude/memory/project/mi-negocio/embudo.json` |
| La voz del cliente (mente del comprador) | `.claude/memory/project/mi-negocio/voz-del-cliente.json` |

Las gráficas **no guardan cifras**: guardan la pregunta y la consulta. Los números los pone el panel al abrir.

## Cómo contesta Levy (tres pasos)

1. **Ver el catálogo** (qué se puede preguntar hoy y qué ya tiene fuente):
   `npm --prefix arbrain run bi -- catalogo`
2. **Mirar los números** para escribir la lectura: `npm --prefix arbrain run bi -- leer --consulta ventas --ventana 30`
   (dice la frase del panel, el corredor y los últimos días).
3. **Escribir la respuesta**:
   ```
   npm --prefix arbrain run bi -- responder \
     --pregunta "¿Qué es lo que más vendo?"   # tal cual la dijo el dueño
     --consulta lo-mas-vendido                # id del catálogo
     --ventana 30                             # 7 | 30 | 90 (las que permita la consulta)
     --tipo barras                            # opcional: uno de los tipos de la consulta
     --lectura "Lo que ves, en una o dos frases"
     --propone "Lo que harías"
   ```
   Queda como **respuesta**: aparece en el panel dibujándose, con «Fijar al tablero» y «Descartar». Con `--fijar` entra
   directo al tablero (solo si el dueño lo pidió). Una respuesta nueva reemplaza a la respuesta suelta anterior; lo fijado
   no se toca.

Si la pregunta **no cabe** en el catálogo, dilo en el chat. Si la consulta **no tiene fuente** todavía, el panel dice
«conecta tu fuente»: conéctala (abajo) antes de prometer el número.

`npm --prefix arbrain run bi -- validar` revisa los dos archivos y dice en palabras qué está mal; el panel también lo
muestra.

## El catálogo genérico (doce preguntas de cualquier negocio)

| id | Pregunta | Forma | Necesita en `bi-fuentes.json` |
|---|---|---|---|
| `ventas` | Ventas por día | contar filas | `fuente` (y `unico` si una venta ocupa varias filas) |
| `ingresos` | Lo que entró por día | sumar | `fuente`, `valor` |
| `lo-que-entro` | Lo que entró este mes contra el pasado | acumular el mes | `fuente`, `valor` |
| `ticket-promedio` | Cuánto deja cada venta | promediar | `fuente`, `valor` (y `unico`) |
| `clientes-nuevos` | Clientes que se dieron de alta | contar filas | `fuente` |
| `interesados` | Personas que preguntaron o dejaron sus datos | contar filas | `fuente` |
| `entregas` | Pedidos, servicios o sesiones entregadas | contar filas | `fuente` |
| `gastos` | Lo que salió por día (subir es dolor) | sumar | `fuente`, `valor` |
| `bajas` | Clientes que cancelaron (subir es dolor) | contar filas | `fuente` |
| `lo-mas-vendido` | Qué producto deja más | agrupar | `fuente`, `por` (y `valor` para verlo en dinero) |
| `de-donde-llegan` | Por qué canal llegó la gente | agrupar | `fuente`, `por` |
| `embudo` | Del interesado al cliente | pasos | `pasos` (2 a 8) |

Las series diarias (todas menos `lo-que-entro`, `lo-mas-vendido`, `de-donde-llegan` y `embudo`) llevan corredor y alarma.

## Conectar tus fuentes (`bi-fuentes.json`)

Lo escribe Levy con el dueño, nunca a mano en el panel. Antes, `bi -- fuentes` dice qué tiene fuente y qué falta.

```json
{
  "esquema": "arbrain.bi-fuentes/v1",
  "negocio": "Clínica Dental Ruiz",
  "moneda": "MXN",
  "zona": "America/Mexico_City",
  "fuentes": [
    { "id": "ventas", "tipo": "csv", "nombre": "Ventas del punto de venta", "ruta": "mi-negocio/datos/ventas.csv", "fecha": "Fecha" },
    { "id": "agenda", "tipo": "excel", "ruta": "mi-negocio/datos/agenda.xlsx", "hoja": "Citas", "fecha": "Fecha" },
    { "id": "pagos", "tipo": "postgres", "conexion": "BI_POSTGRES_URL", "tabla": "public.pagos", "fecha": "pagado_en" },
    { "id": "pedidos", "tipo": "supabase", "url": "BI_SUPABASE_URL", "llave": "BI_SUPABASE_LLAVE", "tabla": "pedidos", "fecha": "created_at" }
  ],
  "consultas": {
    "ventas": { "fuente": "ventas", "unico": "Folio" },
    "ingresos": { "fuente": "ventas", "valor": "Total" },
    "interesados": { "fuente": "agenda", "nombre": "Citas nuevas", "palabras": ["cita", "citas"] },
    "embudo": { "pasos": [
      { "etiqueta": "Pidieron cita", "fuente": "agenda" },
      { "etiqueta": "Asistieron", "fuente": "agenda", "donde": { "columna": "Estado", "es": ["asistió"] } },
      { "etiqueta": "Compraron", "fuente": "ventas" }
    ] }
  }
}
```

**Cada fuente** dice qué es (`tipo`), dónde está y cuál es la columna de la fecha (`fecha`):

- `csv`: `ruta` relativa a la raíz del cerebro (o absoluta) que termina en `.csv`, `.tsv` o `.txt`. Comas, punto y coma o
  tabuladores (se adivina; `separador` lo fija). `decimal: ","` si los importes vienen como `1.234,50`.
- `excel`: `ruta` a un `.xlsx` y, si no es la primera, `hoja`. Las fechas de Excel se leen solas.
- `postgres`: `conexion` es el **nombre** de la llave que trae la URL (`postgres://usuario:contraseña@host:5432/base?sslmode=require`).
  Se lee en una transacción `READ ONLY` con tiempo límite, solo las columnas que pide la consulta y solo el rango de días.
  Recomendado: un usuario de solo lectura (`CREATE ROLE bi_lector LOGIN PASSWORD '…'; GRANT SELECT ON pagos TO bi_lector;`).
  Sirve para cualquier Postgres, también el de un proyecto de Supabase (su cadena de conexión).
- `supabase`: `url` y `llave` son los **nombres** de las llaves con la URL del proyecto y su api key; lee por su API REST.
  Usa una llave que solo pueda leer esa tabla (la `anon` con una política de lectura); la de servicio lo puede todo.
- `tabla` es `tabla` o `esquema.tabla`; una vista sirve igual (útil si la tabla trae millones de filas: una vista que
  agrupe por día).

Las llaves van en `.claude/bi.env`, una por línea, y su nombre empieza con `BI_`:
```
BI_POSTGRES_URL=postgres://bi_lector:…@db.ejemplo.com:5432/negocio?sslmode=require
```

**Cada consulta** dice de qué fuente sale y qué columnas usa: `valor` (el importe), `por` (por qué se agrupa), `unico` (el
folio cuando una venta ocupa varias filas: se cuenta una vez por día), `donde` (un filtro de igualdad:
`{ "columna": "Canal", "es": ["Domicilio"] }`) o `pasos` (el embudo; los pasos se nombran en pasado: «Preguntaron»,
«Compraron»). Con `nombre`, `que` y `palabras` la consulta se dice como la dice el dueño («Citas nuevas», «cita»).

**Fechas y números:** «08/11/2026» es día/mes (Latinoamérica) salvo `"formato_fecha": "mm/dd/aaaa"`; una fecha con zona
(`…Z`, `…-06:00`) se cuenta en el día de `zona`. Un importe ilegible no suma ni resta. Un archivo cubre de su primer a su
último registro (lo de después es «sin medir»); una base cubre hasta ayer.

Antes de decirle al dueño que quedó: `bi -- leer --consulta <id>` con su fuente nueva y `bi -- validar`.

## Tu negocio › El pulso

Los seis órganos leen el mismo motor: **marketing** = `interesados`, **venta** = `ventas`, **entrega** = `entregas`,
**finanzas** = `ingresos` (y `gastos` debajo), **mente del comprador** = `voz-del-cliente.json`, **sistemas** = las
rutinas del dueño. Sin fuente, la tarjeta dice «Conecta tu fuente» y qué la conectaría. Nunca una cifra inventada.

## Practicar antes del primer cliente

`npm --prefix arbrain run bi -- ejemplo` siembra un café ficticio (ventas por producto, pedidos para eventos y gastos,
130 días): copia los CSV a `mi-negocio/datos/ejemplo/` y escribe `bi-fuentes.json`, `bi.json`, `embudo.json` y
`voz-del-cliente.json` solo si no existen. El último día las ventas se desploman: así se ve la alarma. Los archivos viven
en [`ejemplo/`](ejemplo/) y se regeneran con `node arbrain/docs/bi/ejemplo/generar.mjs`.

## Archivos

| Qué | Dónde |
|---|---|
| La forma de una consulta | `arbrain/src/features/bi/catalogo.ts` |
| El catálogo genérico y `bi-fuentes.json` | `arbrain/src/features/bi/generico.ts` |
| La cuenta (fechas, importes, cobertura) | `arbrain/src/features/bi/calculo.ts` |
| Los adaptadores (CSV, Excel, Postgres, Supabase) | `arbrain/src/features/bi/fuentes/` |
| El motor (lee las fuentes y corre una consulta) | `arbrain/src/features/bi/motor.ts` |
| Qué catálogo rige y la raíz del cerebro | `arbrain/src/features/bi/servidor.ts` |
| Lectura pura (corredor, señal, frase, excepción) | `arbrain/src/features/bi/modelo.ts` |
| API | `arbrain/src/app/api/bi/route.ts`, `arbrain/src/app/api/bi/consulta/route.ts` |
| Vista | `arbrain/src/features/bi/BusinessIntelligence.tsx` |
| El pulso del alumno | `arbrain/src/features/negocio/pulso-cliente.ts` |
| CLI de Levy | `arbrain/scripts/bi.ts` |
| Pruebas | `arbrain/tests/bi/` |

Si `bi -- catalogo` lista consultas que no son estas doce, la instalación usa un catálogo propio del autor: sus reglas
viven junto a él (`autor.md`).
