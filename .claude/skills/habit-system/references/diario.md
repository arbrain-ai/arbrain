# El diario a mano: protocolo de PROCESAMIENTO

Para el dueño que escribe un diario en papel (por ejemplo, en su rutina nocturna) y manda la foto
por la mañana. Este protocolo garantiza que cada repetición sea idéntica: el diario se guarda
literal y se baja al sistema, nunca se resume.

Si el dueño no lleva diario, esta referencia no aplica. No se le impone.

## El trigger: con esto BASTA

Cualquiera de estas entra aquí y dispara el pipeline COMPLETO, sin preguntar qué hacer:

- «te subí el diario» · «ahí está la nota» · «nueva entrada» · «ya te la pasé»
- «lee mi última nota» · «léelo» · «checa el diario». **Leer NO es el entregable**: es el paso 2 de 8.
- «está en descargas» · «te la mandé» · sin decir dónde → buscar solo con el guard (paso 0).
- una **foto de cuaderno** sin texto acompañante.

**Regla dura: transcribir y comentar NO es procesar.** Si el tiempo aprieta, se corren los 8 pasos
igual (son unos minutos de herramientas); lo que se recorta es la conversación del paso 8, nunca
las escrituras.

## PASO 0: el candado anti doble proceso

**Antes de escribir NADA:**

```bash
python3 .claude/skills/habit-system/scripts/diario_guard.py              # autodetecta ~/Downloads (36 h)
python3 .claude/skills/habit-system/scripts/diario_guard.py <foto>...    # o explícito
python3 .claude/skills/habit-system/scripts/diario_guard.py --carpeta <dir>  # otra carpeta de entrada
```

(En Windows el intérprete suele llamarse `python` o `py`.)

La huella es el **md5 del archivo original**, estampado en el encabezado del texto literal
(`IMG_1234.HEIC \`md5:e5c250eea8\``). El nombre y la fecha mienten (el teléfono renumera, el chat
vuelve a guardar, el dueño reenvía la misma foto); el md5 no. **Estampar SIEMPRE el md5 al escribir
el encabezado**: sin eso el candado no cierra la próxima vez.

| Veredicto | Qué hacer |
|---|---|
| `NUEVA` | correr los 8 pasos completos |
| `YA_PROCESADA` | **cero escrituras.** Responder con lo que ya quedó («esa la bajé ayer: objetivo X, N tareas») y conversar. Reprocesar solo con un «sí» explícito |
| `PARCIAL` | procesar SOLO las fotos `NUEVA` → **añadir** al archivo de esa noche y bajar únicamente el delta |
| `IGNORADA` | hoja vieja o captura: no es entrada. Se registra en `.claude/diario/.ignoradas` (`<md5> <motivo>`) para no volver a preguntar |
| `SIN_FOTOS` | preguntar dónde está, no adivinar |

**Guardias por destino** (por si el texto quedó escrito pero el resto se cortó; cada escritura se
verifica, no se confía en «ya lo hice»):

- **`objetivos.md`:** buscar el bloque `#### <Día> NN` de esa fecha. Si existe, editarlo; no insertar otro.
- **Calendario (si está conectado):** consultar el día antes de crear. Si ya hay un evento con
  `[habit-system]`, actualizarlo; jamás un segundo.
- **Tareas:** comparar por contenido con las abiertas antes de crear. Si existe la equivalente
  (aunque esté vencida), reagendar o actualizar; nunca duplicar.
- **Hábitos:** `habit_record.py` es idempotente por (fecha, hábito) y por `requestId`.

**Y decirlo en la confirmación:** qué modo corrió (`nueva` / `ya estaba` / `delta de la hoja 2`).
Un candado silencioso no se distingue de uno que no existe.

## El flujo (8 pasos, en orden)

```
foto → leer con zoom → texto literal a .claude/diario/ → extraer lo agendable
  → objetivos.md + tareas (+ calendario si existe) → CERRAR EL LAZO (plan vs real + hábitos)
  → regenerar now.md y VERIFICAR → confirmar en 1 línea → conversar
```

1. **Llega la foto.** Normalmente a `~/Downloads` o como ruta de imagen en el chat de Arbrain.
2. **Leer con ZOOM, nunca adivinar.** Si la imagen viene en HEIC, convertirla a JPG en una carpeta
   temporal (macOS: `sips -s format jpeg in.HEIC --out out.jpg`; Linux: `heif-convert`; si no hay
   herramienta, pedirle al dueño que mande JPG). Rotar si viene de lado y recortar por mitades si la
   letra es chica. Palabra dudosa = `[?]` · tachón = `~~[tachado]~~`. Si una palabra CLAVE (fecha,
   hora, monto, nombre) queda ilegible, preguntar; jamás inventarla.
3. **UNA entrada = UN archivo:** `.claude/diario/YYYY-MM-DD.md`, con la fecha de **la noche en que
   se escribió**, no la de la foto. Si las fotos traen varias noches, un archivo por noche; si no
   está claro dónde corta, preguntar. LITERAL estricto: ni resumir, ni corregir ortografía, ni
   «limpiar». Encabezado de 2 líneas: fecha escrita + fuente (**nombre de cada foto + su
   `md5:xxxxxxxxxx`**). El texto literal vive SOLO ahí.
4. **Extraer lo agendable**, cada cosa a su pluma:
   - **Objetivo del día →** bloque `#### <Día> NN` en `.claude/plan/objetivos.md` (formato en
     `tiempo-y-calendario.md`). `now-snapshot.py` pinta el hito de Hoy desde ese archivo.
   - **Horario del día →** si hay calendario conectado, mover los eventos existentes de hoy en vez de
     crear duplicados (`gog calendar update`). Sin calendario, anotar las horas como líneas `* 10:00 …`
     en el bloque del día.
   - **Contexto de un bloque** (qué grabar, qué escribir, a quién llamar) → en la descripción del
     evento de hoy, o como nota `*` bajo el día. Si el diario no dice nada de un bloque, no tocarlo.
   - **Tareas, compras, pendientes →** a la casa de tareas del dueño (casillas o Todoist, ver
     `automatizaciones-y-todoist.md`). Si ya existe una relacionada, se actualiza; no se duplica.
   - **Ideas** → se conversan o se capturan como tarea sin fecha, según pida el dueño.
5. **Cerrar el lazo: el diario es el SENSOR del plan.** Leer lo que el plan tenía para la noche
   escrita (bloque del día en `objetivos.md` y, si existe, el calendario) y contrastar con lo que el
   diario narra: qué pasó, qué se movió, qué no ocurrió. Con esa evidencia, registrar los hábitos con
   `scripts/habit_record.py` (`source:"diary"` y `evidence` con archivo, huella y pasaje; contrato en
   `habitos-y-ritual.md`). SOLO hábitos que el diario evidencia o el dueño confirmó: **un registro sin
   evidencia no existe; jamás inventarlo.** Un conflicto con una corrección manual posterior se
   reporta, nunca se fuerza.
6. **Regenerar `now.md`** (`python3 arbrain/server/scripts/calendar/now-snapshot.py`) y **VERIFICAR**
   que el objetivo aparezca en Hitos → Hoy. Una escritura sin verificación no cuenta.
7. **Confirmar en UNA línea:** qué se transcribió, qué se movió, qué cayó a tareas y la adherencia de
   la noche (N de M cosas del plan cumplidas). **Chequeo de continuidad:** listar `.claude/diario/`;
   si falta la noche anterior (o la entrada arranca a media frase, señal de una hoja faltante),
   decirlo en la confirmación. Un hueco silencioso en un sensor diario es un sensor roto.
8. **Conversar.** El diario casi siempre trae reflexión además de logística. Levy responde a ESO
   también: es la voz del dueño de anoche, no un formulario.

## Reglas duras

- **El papel manda.** Si una casilla de la app y el diario difieren, gana el diario como evidencia.
- **El diario NO es memoria curada.** Es registro crudo. Si algo merece ser memoria durable, se
  PROPONE (skill `memory-manager`); nunca se asciende solo.
- **Entradas pasadas jamás se editan** (solo corregir la transcripción contra la foto si el dueño lo pide).
- **Las fotos NO se guardan en el repo.** El texto literal es el registro; los originales viven en
  el teléfono del dueño. Se procesan en una carpeta temporal.
- **Cero fricción para el dueño:** acepta las fotos como salgan (de lado, con sombra, con el dedo).
