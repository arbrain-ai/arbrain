# Tareas y Todoist (opcional)

Leer cuando el dueño diga: apúntame X, qué tengo pendiente, conecta mi Todoist, no aparece mi tarea.

## La casa de las tareas: UNA

El dueño elige una casa para sus tareas y todas viven ahí. Nunca la misma tarea en dos lugares.

| Modo | Cuándo | Dónde viven |
|---|---|---|
| **Local (por defecto)** | Sin configurar nada | Casillas en `.claude/plan/objetivos.md` |
| **Todoist** | El dueño lo conecta (servidor oficial o token) | Su cuenta de Todoist |

### Modo local

- **Con fecha:** casilla `- [ ] <tarea>` bajo el `#### <Día> NN` de ese día. Aparece en `now.md`
  (Hitos → Hoy) el día que toca.
- **Sin fecha (backlog):** casilla en una sección `## Pendientes` al final de `objetivos.md`.
  `now.md` no la muestra; Levy la revisa en la revisión semanal y al planear.
- **Completar:** cambiar `- [ ]` por `- [x]`. **Reagendar:** mover la línea al día nuevo.
- Formato y reglas del archivo: `tiempo-y-calendario.md`.

### Modo Todoist

**Conectar:** lo hace el dueño, Levy guía con `arbrain/cerebro/manuales/todoist.md`. Dos vías:

- **Servidor oficial de Todoist** (recomendada; `https://ai.todoist.net/mcp`, inicio de sesión en el navegador, sin
  token). Levy usa sus herramientas MCP; crear, mover o cerrar sigue las reglas de abajo.
- **Token personal** en el llavero del sistema, expuesto como variable `TODOIST_API_TOKEN` (nunca en un archivo del
  repo). Levy usa la API v1 directa con los comandos de abajo.

**Cómo opera Levy con token:** escribe por la API v1 directa. El dueño no arma listas; le habla a Levy.

```bash
TD=https://api.todoist.com/api/v1
# El token llega como variable de entorno (manual todoist.md); nunca imprimirlo ni copiarlo a un archivo
TOKEN="$TODOIST_API_TOKEN"

curl -s "$TD/projects" -H "Authorization: Bearer $TOKEN"                    # proyectos y sus id
curl -s "$TD/tasks" -H "Authorization: Bearer $TOKEN"                       # activas (paginado)
curl -s -X POST "$TD/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"...","project_id":"<id>","due_date":"2026-10-14","priority":4}'
curl -s -X POST "$TD/tasks/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"due_date":"2026-10-15"}'                                             # reagendar
curl -s -X POST "$TD/tasks/<id>/close" -H "Authorization: Bearer $TOKEN"    # completar
```

**Proyectos = frentes del dueño.** Pocos (3 o 4), exclusivos: por ejemplo Clientes, Contenido,
Producto, Personal. Levy los lee con `/projects` y usa sus id; nunca los inventa. Proponer un
proyecto o etiqueta nueva exige pasar el test de `taxonomia.md`.

**Detalles de la API v1 que muerden:**

- Las listas llegan como `{results:[...]}` con paginación `next_cursor`.
- El filtro `?filter=@etiqueta` se ignora: filtrar del lado de Levy.
- **Prioridad invertida:** en la API 4 = p1 (urgente) … 1 = p4 (normal). En la conversación usar p1..p4.
- **Fechas:** mandar `due_date: "YYYY-MM-DD"` calculado localmente para cualquier fecha que importe.
  `due_string: "tomorrow"` se resuelve en la zona de la cuenta de Todoist, no en la del dueño, y puede
  caer un día después.
- `due.date` puede traer hora (`2026-10-14T18:00:00`) o solo fecha.
- Una tarea cerrada devuelve 200 con `checked:true`, no 404.
- Una tarea **sin fecha** no aparece en la vista Hoy de la app de Todoist. Si el dueño quiere verla
  hoy, ponerle fecha de hoy (o preguntarle cuál).

## Reglas que aplican en los dos modos

- **Solo se crean las tareas que el dueño pide** (dictadas, de su diario o «anótalo»). Lo detectado
  por Levy se conversa primero.
- **Nunca hay tareas pasadas.** Al ver una vencida, Levy la recuerda y propone: hoy, otra fecha o
  matarla. No se deja flotando como deuda.
- **Antes de crear, buscar si ya existe** (por contenido, aunque esté vencida). Si existe, actualizar.
- **Hito ≠ tarea.** El foco de la semana no se copia como tarea «para que aparezca».
- **Borrar** una tarea o un proyecto es irreversible: solo con pedido explícito del dueño.

## «No aparece mi tarea»

1. ¿En qué modo está? (¿conectó el servidor de Todoist o existe `TODOIST_API_TOKEN`? Verificación en el manual `todoist.md`.) No mezclar casas.
2. Modo local: ¿la casilla está bajo el `#### <Día> NN` correcto, dentro del `## <Mes Año>` correcto?
3. Todoist: ¿tiene fecha? Sin fecha no sale en Hoy. ¿La API respondió? Regenerar `now.md` y mirar.
4. `now.md` lo regenera Arbrain solo (al arrancar, cada 20 minutos y al cambiar `.claude/plan/`). Si no se
   mueve: ¿la primera línea dice `<!-- arbrain:now … -->`? Si no, alguien lo editó a mano y Arbrain lo respeta;
   bórralo para que vuelva a generarse.
