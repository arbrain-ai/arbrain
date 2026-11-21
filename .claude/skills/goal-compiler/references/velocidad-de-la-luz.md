# La velocidad de la luz: medir cada goal contra su límite físico


## El principio

Cada tarea se mide contra su **límite físico**, no contra cuánto tardó la vez pasada ni contra lo que tarda la
competencia. El pasado y la competencia ya traen fricción adentro; compararse con ellos la vuelve invisible.

- **Origen.** La métrica *Speed of Light* (SOL) de NVIDIA Nsight Compute: el rendimiento de un kernel se expresa como
  porcentaje del máximo teórico del hardware (cómputo y memoria), no como mejora sobre la versión anterior. Jensen Huang
  lo convirtió en filosofía de empresa (*The Nvidia Way*, Tae Kim): preguntar cuánto tardaría algo si solo existiera lo
  físicamente inevitable. El ejemplo del libro: un proceso que tomaba 74 días se rediseña contra su límite y queda en 6.
  No se mejoró 10 %; se quitó lo que no era física.
- **Para trabajo con IA.** El límite ≈ **los tokens que el modelo necesita para pensar y escribir** + **el tiempo
  físico inevitable** (compilar, correr pruebas, transferir archivos, un render, un CI). Todo lo demás es fricción:
  esperar una decisión, un permiso, una cuota, una máquina libre, descubrir tarde un bug, rehacer por una política,
  verificar lo que no se verificó.

La pregunta de cada goal grande deja de ser «¿lo terminamos?» y pasa a ser «¿qué tan lejos quedamos de la velocidad de
la luz y en qué se fue la diferencia?».

## Chequeo previo (antes de soltar el primer agente)

Se corre en la Fase 4, al compilar, y su resultado entra al `spec.md` como sección `## CHEQUEO PREVIO`. Cada punto es
un HECHO que se averigua, salvo el último, que es la lista de DECISIONES.

| Punto | Qué se comprueba | Ejemplo de fricción que evita |
|---|---|---|
| Permisos y scopes | Que cada credencial que el plan va a usar ya tenga el alcance (p. ej. `gh auth status` muestra `workflow` si habrá GitHub Actions) | Un scope que se pide a mitad del goal cuesta horas de espera |
| Cuotas | Límite semanal de Opus, crédito de las APIs de pago (OpenRouter, generación de imagen/voz), tope de turno del chat | Agentes parados a mitad del trabajo |
| Máquina | Disco libre, carga actual, otros builds/renders en curso; un build pesado a la vez | Carga que tumba servicios compartidos |
| Política del proveedor | Términos de uso de lo que el producto va a ofrecer (p. ej. Anthropic prohíbe ofrecer el login o los límites de claude.ai dentro de productos de terceros sin aprobación) | Diseñar algo que luego no se puede repartir |
| Dónde se prueba | La plataforma real de destino: máquina limpia o CI real del sistema operativo, no una emulación | Un verde en emulación que esconde un bug real |
| Decisiones del dueño | Lista de lo que solo él puede decidir, pedida **en lote al inicio**, cada una con respuesta recomendada | Agentes esperando una frase suya, uno por uno |

Si un punto no se puede resolver antes de arrancar, se declara en el spec como riesgo con su sustituto (p. ej. «sin
scope `workflow`: Windows por compilación cruzada; falta la prueba en Windows real») y no se finge cerrado.

## Medición (por encargo)

Al cerrar cada goal, el post-mortem de la Fase 5 suma tres números:

1. **Tiempo real** (reloj, de la orden al entregable verificado).
2. **Límite estimado** (tokens de pensar y escribir + tiempo físico inevitable).
3. **La diferencia, repartida en categorías:**

| Categoría | Ejemplo |
|---|---|
| decisión | agentes esperando una respuesta del dueño |
| permiso | scope, credencial o código de autorización que faltaba |
| cuota | límite semanal del modelo, crédito agotado |
| máquina | carga, disco, builds en paralelo, servicio compartido caído |
| bug descubierto tarde | algo que una prueba en la plataforma real habría mostrado al inicio |
| política | rediseño porque los términos de un proveedor no lo permitían |
| verificación faltante | se confió en un `exit 0` o en un mensaje y el efecto no había ocurrido |

Sin medición no hay mejora: una diferencia sin repartir se registra como «sin medir», no como cero.

## Bucle semanal de mejora (el RSI del sistema)

1. **Instrumentar:** cada goal grande deja su tabla real / límite / diferencia por categoría.
2. **Clasificar:** sumar la semana por categoría.
3. **Atacar la mayor** con una sola cosa durable: una regla (memoria o skill), una automatización (script, hook,
   vigilante) o un punto nuevo del chequeo previo.
4. **Medir la semana siguiente** si esa categoría bajó. Si no bajó, la regla no sirvió: se cambia, no se acumula.

Para optimizar una skill concreta con evals (por ejemplo esta misma), usar la skill `autoresearch`.

## Caso real: empaquetado del alumno y resiliencia, 11–12 oct 2026

Fuentes: `docs/builds/empaquetado-2026-10-11/REPORTE-FINAL.md`, `docs/builds/resiliencia-2026-10-12/CAUSA-RAIZ.md`,
`.claude/memory/project/empaquetado-alumno-v1-2026-10-11.md` y la conversación del 12 oct. Fricciones que separaron el
goal de su límite:

| Fricción | Categoría | Qué pasó | Chequeo o regla que la evita |
|---|---|---|---|
| Techo de 2 h por turno del chat | máquina (límite inventado) | El chat cortaba los turnos a las 2 h aunque el trabajo siguiera vivo; se quitó (solo corta 30 min sin eventos) | Límites que no protegen nada se quitan |
| Límite semanal de Opus | cuota | Sin Opus de 12:24 a 17:00 (~4.5 h) | Revisar la cuota antes de arrancar |
| Scope `workflow` de GitHub | permiso | Pedirlo a mitad tardó horas (3 códigos de autorización vencidos); el reporte final salió sin runs de Actions | Scopes listos antes del primer agente |
| Carga 755 en el Studio | máquina | Un render de otra conversación (195 Chrome + 21 ffmpeg) ahogó la Mac; arrastró a PostgREST a una caída de 8 h 30 min | Un build/render a la vez, con límites de CPU y memoria |
| Windows probado bajo Wine | bug descubierto tarde | Wine dio verde y ocultó un bug real de ruta verbatim; hicieron falta 5 runs de CI en Windows real | Probar donde va a correr |
| Override de PostgREST ignorado | verificación faltante | El `.env` fija `COMPOSE_FILE`, así que `docker-compose.override.yml` no se cargaba y el comando salía bien sin aplicar nada (commit `27f29ccb`) | Verificar el efecto, no el `exit 0` |
| REST caído disfrazado de «Forbidden» | verificación faltante | `getUserRole` convertía la base caída en un 403; el silencio duró 8 h (commit `ab8f9caf`) | Errores honestos |
