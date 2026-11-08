# El embudo de tu negocio · `arbrain.embudo/v1`

Un archivo que dice cómo se mueve el dinero en un negocio: de qué pisos llega la gente, por qué etapas pasa, qué skill y
qué rutina opera cada una, quién la mueve, con qué número se mide (de dónde sale, cada cuánto y quién lo mueve) y dónde
está el cuello. Lo escribe el Levy de cada dueño;
lo pinta el panel **Tu negocio › El sistema** de Arbrain como grafo. Nació de un lienzo «Mi negocio, el sistema
completo» (4 nov 2026): el mismo contenido, pero como datos para que cada dueño tenga el suyo. Desde el 5 nov el panel
es la **única** vista; el lienzo quedó archivado y el estándar ya no lleva uno.

- **Esquema:** [`embudo.schema.json`](embudo.schema.json) (JSON Schema 2020-12).
- **Dónde vive:** `.claude/memory/project/mi-negocio/embudo.json`, en la memoria del dueño. Una ruta para todos:
  el panel la busca ahí y en ningún otro lado.
- **Una sola dirección:** el archivo es la fuente y el panel su vista. Se edita con Levy, nunca a mano en un dibujo:
  no hay un segundo lugar desde el cual regenerar el archivo.
- **Ejemplo mínimo:** el bloque JSON de abajo (una oferta); las plantillas traen el caso completo.
- **Plantillas vacías:** [`plantillas/consultor.embudo.json`](plantillas/consultor.embudo.json) (el negocio del
  consultor que enseña Arbrain) y [`plantillas/cliente.embudo.json`](plantillas/cliente.embudo.json) (el negocio de su
  cliente). Ver «Plantillas» abajo.
- **Validador del panel:** `src/features/negocio/embudo.ts` (`validarEmbudo`); la prueba
  `tests/negocio/embudo.test.ts` mantiene al esquema, al validador y al ejemplo de acuerdo.

## Cómo lo arma Levy (para el Levy del alumno)

1. **Lee antes de escribir:** su oferta, sus clientes, sus canales, sus skills (`.claude/skills/*/SKILL.md`) y sus
   rutinas. Lo que no esté en su cerebro se le pregunta al dueño; no se inventa.
2. **Seis etapas por oferta,** siempre en este orden: Adquisición → Nutrición → Conversión → Bienvenida → Entrega →
   Expansión. Lo que pasa después del pago también es embudo. Dos ofertas (una de entrada y otra mayor) son dos
   embudos: declara ambos en `embudos` (la entrada primero) y une la expansión del primero con la adquisición del
   segundo con una arista `upsell`.
3. **Pisos arriba.** Lo que trae gente sin venderle nada (un canal, un lead magnet, una comunidad gratuita) es un embudo
   con `"tipo": "piso"`, y va antes de las ofertas en `embudos`. Un piso lleva **solo las etapas que de verdad tiene**,
   en el mismo orden (un canal: Adquisición y Nutrición; una comunidad gratuita: Bienvenida, Entrega y Expansión). Si el
   piso todavía no existe como sistema, `"estado": "por construir"`. **La escalera de valor son las aristas `upsell`**
   entre embudos: del canal al lead magnet, del lead magnet a la comunidad, de la comunidad a cada oferta. Un piso puede
   subir a varios.
4. **Por etapa:**
   - `skills`: el nombre real de la carpeta y su ruta. Una skill puede colgar de varias etapas. **La etapa de cada skill
     vive aquí, no en su SKILL.md.** La skill que a propósito no cuelga de ninguna (memoria, auditoría, datos crudos,
     algo de la vida del dueño) va en `skills_sin_etapa` con `tipo` (`sistema` o `personal`) y `por_que`; una skill va
     en un solo lado. La que no esté en ningún lado, el panel la marca «sin revisar»: es la señal de una skill nueva
     que nadie ha ubicado.
   - `rutinas`: el id real (el del scheduler de Arbrain, o la etiqueta si es launchd) y su `motor`. Con eso el
     panel lee la última corrida. Si la rutina aún no existe: `id: null`, `activa: false` y una `nota`.
   - `ejecuta`: `levy`, `rutina` o `persona` (con `rol`; `rol: "fundador"` es el dueño y se muestra «Tú»).
   - `mide`: el número bajado a tierra. Cuatro cosas obligatorias, en palabras del dueño:
     - `fuente`: de dónde sale («Polar», «tu canal de YouTube», «GitHub del repo», «la base de la comunidad»).
     - `frecuencia`: cada cuánto se refresca y qué lo refresca («en vivo», «cada noche (polar-sync)», «cada domingo»,
       «a mano»).
     - `dueno`: quién mueve ese número, uno solo (mismo formato que `ejecuta`).
     - `valor: null` mientras no lo leas de la fuente; si lo escribes, con `medido_en` y `ventana`. Nunca 0 por falta
       de dato.
     Sin forma de medirlo todavía: `hay_numero: false` y `como_medirlo` con lo que lo mediría (el panel lo enseña
     debajo de «sin número todavía»). `consulta` dice cómo leerlo: base, tabla o endpoint, y el lector.
   - `cuello`: `es: true` en **una sola** etapa, y solo con evidencia (`frase` + `evidencia.ruta` y `fecha`).
5. **Honesto con el trazo:** `opera_hoy: false` (etapa), `activa: false` (rutina) y `estado: "por construir"`
   (embudo) se pintan punteados.
6. **Sin datos privados de terceros:** nada de nombres de clientes ni cifras personales; las personas, por su rol.
7. **Valida** contra el esquema antes de guardar y pon `generado` con la fecha de la revisión.

## Mínimo válido

```json
{
  "esquema": "arbrain.embudo/v1",
  "negocio": "Clínica Dental Ruiz",
  "generado": "2026-11-04",
  "embudos": [{ "id": "consulta", "nombre": "Primera consulta" }],
  "etapas": [{
    "id": "consulta.adquisicion", "orden": 1, "embudo": "consulta", "etapa": "Adquisición",
    "nombre": "Atraer", "que_pasa": "Anuncios locales y reseñas en Google.", "opera_hoy": true,
    "skills": [{ "nombre": "contenido", "ruta": ".claude/skills/contenido/SKILL.md" }],
    "rutinas": [], "ejecuta": [{ "tipo": "persona", "rol": "fundador" }],
    "mide": {
      "nombre": "Citas nuevas por semana", "fuente": "Agenda de la clínica", "frecuencia": "en vivo",
      "dueno": { "tipo": "persona", "rol": "recepción" }, "hay_numero": true, "valor": null
    },
    "cuello": { "es": false }
  }],
  "aristas": []
}
```

## Qué hace el panel con cada campo

El panel tiene dos pestañas. **El grafo** (React Flow + dagre): cada embudo es un marco, cada etapa un nodo que se toca
para abrir su ficha, y las aristas son el flujo y la escalera de valor. Los embudos se acomodan solos por sus aristas
`upsell` (lo que trae gente arriba, cada oferta debajo de lo que sube a ella); en escritorio van en filas y en el
teléfono o el panel angosto en columnas, con el grafo entero a lo ancho y la página bajando con el dedo. **Skills por
etapa**: cada etapa con sus skills y, abajo, las que no cuelgan de ninguna (las de `skills_sin_etapa` con su porqué y
las «sin revisar»).

| Campo | En pantalla |
|---|---|
| `embudos[].nombre`, `kicker`, `frase` | La cabeza de cada marco; la frase, en su ficha al tocarla |
| `embudos[].tipo`, `estado` | «4 pisos y 2 embudos» en la cabeza; un embudo «por construir» va punteado con su etiqueta |
| `etapas[].nombre`, `etapa`, `que_pasa` | El nodo de la etapa y su ficha |
| `skills` | Botones que abren la skill en Habilidades; Habilidades, a su vez, dice de qué etapa cuelga cada skill |
| `rutinas` | Qué hace y cada cuándo; la última corrida si el motor la reporta (scheduler o launchd del Studio); si no, «sin dato aquí» |
| `ejecuta` | Quién la mueve: Levy, una rutina, una persona por su rol, o «Tú» |
| `mide` | El número con su fuente, cada cuánto se actualiza y quién lo mueve; «sin dato» cuando `valor` es null; «qué lo mediría» si aún no hay número |
| `cuello` | La etapa marcada, con la frase y la fecha de su evidencia |
| `aristas` `upsell` / `volante` | Aristas del grafo con su `accion` como etiqueta: la escalera de valor baja de piso en piso y el giro de vuelta rodea el dibujo; punteadas si están por construir. En la ficha: «Sube a», «Llega de», «Vuelve a» |
| `skills_sin_etapa` | Skills por etapa › «No cuelgan de ninguna etapa»: «Sostienen todo el sistema» y «Fuera del negocio», cada una con su porqué |

## Plantillas

Para el consultor que enseña Arbrain, el estándar es recursivo: arma el embudo de **su** negocio y, con la misma forma,
el de **cada cliente**. Las dos plantillas validan contra el esquema y no traen datos: cada texto entre `‹…›` se cambia
por lo que diga el dueño, cada `valor` queda en `null` hasta leerlo de su fuente, y lo que todavía no existe se deja
`opera_hoy: false` o `estado: "por construir"`.

- [`plantillas/consultor.embudo.json`](plantillas/consultor.embudo.json): dos pisos (su canal, con su propio agente, y
  su lead magnet), la oferta de entrada (el diagnóstico) y la mayor (instalar el cerebro y operarlo cada mes), con la
  escalera como aristas.
- [`plantillas/cliente.embudo.json`](plantillas/cliente.embudo.json): un negocio de una oferta con sus seis etapas. Es
  lo que el consultor llena en el diagnóstico de su cliente.

Para usarla: copiar la plantilla a `.claude/memory/project/mi-negocio/embudo.json` del cerebro que corresponda (el del
consultor, o el del cliente cuando tenga el suyo), llenar, borrar los pisos o etapas que no apliquen y validar.

## Encendido

Prototipo apagado por defecto: el panel aparece solo con `ARBRAIN_PANEL_NEGOCIO=1` en el entorno del servidor de
Arbrain. Apagado, la vista «Tu negocio» y Habilidades quedan exactamente como estaban.
