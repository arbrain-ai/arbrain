# El expediente de un referente

Un referente, una carpeta: `contenido/intel/embudos/<slug>/`. Se arma con el método (`references/metodo.md`) y se
abre siempre antes de repetir investigación.

```
contenido/intel/embudos/<slug>/
  index.md                 qué explica el caso, cobertura real, lectura práctica (abajo)
  embudo.md                rutas R1…Rn, ofertas con precio y fecha, qué vende la descripción
  recursos.md              qué regala de verdad, qué está bloqueado, cómo se empieza
  contenido-y-operacion.md cómo organiza las piezas, cadencia, equipo, herramientas declaradas
  correo-y-cobros.md       correos recibidos (en una cuenta), proveedor de cobro observado
  acciones.md              lo que el dueño podría probar, en fichas de propuesta
  fuentes.md               F01…Fn con URL, fecha, cobertura; correcciones fechadas al final
  evidencia/               capturas, textos crudos, JSON; lo privado no sale de aquí
```

Si el corpus de video del referente ya existe en `contenido/intel/<slug>/youtube/` (skill `intel`), se enlaza; no se
duplica.

## `index.md`

```markdown
# <Referente> · expediente de embudo

**Consolidación:** <fecha>. **Ventana:** <desde>–<hasta>, ambas incluidas. Superficies reabiertas el <fecha>.

## Qué explica el caso
(dos o tres frases: cómo conecta la atención con la venta; qué no revela la evidencia)

## Leer según la pregunta
| Quiero entender… | Archivo |
|---|---|
| Por dónde llega alguien, qué se le ofrece y a dónde va | [embudo](embudo.md) |
| Qué regala realmente y cómo se empieza | [recursos](recursos.md) |
| Cómo produce y opera | [contenido y operación](contenido-y-operacion.md) |
| Qué haríamos con esto | [acciones](acciones.md) |
| De dónde sale cada hallazgo | [fuentes](fuentes.md) |

## Cobertura real
| Superficie | Inspección completada | Límite |
|---|---|---|
| YouTube | <n> descripciones, <n> transcripts completos | No <n> videos leídos palabra por palabra |
| Comunidad gratuita | About, bienvenida, recursos visibles | Sin alta nueva; no todos los cursos |
| Instagram / X / otras | <n> publicaciones con llamado | Sin pedir el material por mensaje |
| Correo | <n> correos en una cuenta | No es la secuencia universal |
| Ofertas | Páginas públicas con precio y fecha | Sin compras ni entrega comprobada |
| Economía | Promesas públicas archivadas como declaraciones | Sin cuentas auditadas ni márgenes |

## Lectura práctica
(la unidad operativa que se aprende, como propuesta: demostración → recurso → entrada → primer uso → motivo para volver)
```

## `embudo.md`: las rutas

| Ruta | Recorrido observado | Dónde termina nuestra evidencia |
|---|---|---|
| **R1 · Recurso desde YouTube** | Descripción → página con identificador de pieza → recurso | Sin alta nueva ni comportamiento de quien llega |
| **R2 · Oferta desde YouTube** | Descripción → página de venta → formulario | Formulario no enviado |
| **R3 · …** | | |

Cada fila cita sus fuentes `[F03, F07]`. Una ruta vista en dos superficies no prueba que todos las recorran en ese
orden. Precios: **oferta visible en una fecha**, no ingreso medio ni precio realizado.

## `acciones.md`: fichas de propuesta

Una por acción, con la ficha mínima del método (propuesta, base, encaje, entrega, señal, reconsiderar si, estado).
Para opinar sobre el negocio del dueño, abre su contexto vigente (`references/nuestro-embudo.md`); una instrucción
reciente suya manda sobre lo escrito.

## `fuentes.md`

```markdown
| ID | Fuente | URL o archivo | Observado | Cobertura |
|---|---|---|---|---|
| F01 | Descripciones de YouTube | contenido/intel/<slug>/youtube/_index.json | 2026-01-15 | 33 de 33, metadatos |

## Correcciones
- 2026-01-20: F04 decía precio mensual; la página muestra pago único. Corregido en embudo.md y en patrones.
```

## El resumen para su panel

Al cerrar o actualizar un expediente, resume al referente en `.claude/memory/project/mi-negocio/mercado.json`
(`references/mercado-json.md`) para que aparezca en la pestaña Estrategia. Solo lo público, con fuente y fecha.
