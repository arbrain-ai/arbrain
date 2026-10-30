# Hábitos y ritual: el registro del carácter

Leer cuando el dueño diga: marca X, cómo voy con mi racha, agrega o quita un hábito, mi prioridad de
hoy, cierre del día. La regla raíz: lo que importa es la marca diaria, con la menor fricción posible.
El dueño no abre paneles: le dice a Levy «marca ejercicio y lectura» y Levy registra.

## Dónde viven

Un archivo local del repo, `.claude/plan/habitos.json`, con el catálogo y los registros. Se escribe
SOLO por `scripts/habit_record.py` (JSON por stdin, salida JSON). Nunca editar el archivo a mano:
la revisión y los recibos protegen contra duplicados y contra pisar correcciones.

```bash
H=.claude/skills/habit-system/scripts/habit_record.py
echo '{"action":"catalog"}' | python3 $H
```

## Catálogo: pocos hábitos, bien elegidos

El catálogo empieza vacío. Se arma conversando con el dueño: **pocos (3 a 6) y concretos**. Menos
hábitos = más durables. Cada uno tiene `clave` estable (no cambia nunca), `nombre` visible y
`seccion` (`ancla`, `cuerpo`, `mente`, `nutricion`, `trabajo` u `otro`).

```bash
echo '{"action":"habit-add","clave":"objetivo_dia","nombre":"Objetivo del día","seccion":"ancla"}' | python3 $H
echo '{"action":"habit-add","clave":"ejercicio","nombre":"Ejercicio","seccion":"cuerpo"}' | python3 $H
echo '{"action":"habit-archive","clave":"ejercicio"}' | python3 $H     # archiva; la historia queda
```

Sugerencia de ancla: `objetivo_dia` (¿cumplí el objetivo del día?). Conecta el hábito con el plan.

Archivar no borra: el hábito sale de la lista activa, sus registros quedan y se reactiva con
`habit-add` de la misma clave. Un hábito archivado puede recibir evidencia del diario, pero no se
marca por defecto.

## Marcar (leer, luego escribir)

```bash
echo '{"action":"read","date":"2026-10-12","clave":"ejercicio"}' | python3 $H
# -> {"record": ..., "expectedRevision": 0}

echo '{"action":"write","date":"2026-10-12","clave":"ejercicio","hecho":true,
       "requestId":"<UUID nuevo>","expectedRevision":0,"source":"conversation"}' | python3 $H
```

- `hecho`: `true` cumplido · `false` no cumplido explícito · `null` retirar la marca (la revisión se
  conserva). Sin `date`, usa la fecha local de hoy.
- **Revisión:** mandar la que devolvió `read`. Si responde 409, alguien escribió antes: revisar el
  conflicto con el dueño; no tomar a ciegas la revisión nueva.
- **Reintento:** si la respuesta fue incierta, repetir el JSON exacto con el mismo `requestId`; no
  duplica.
- **Diario:** `source:"diary"` y `evidence` con archivo, huella y pasaje (por ejemplo
  `".claude/diario/2026-10-12.md md5:e5c250eea8 «salí a correr 30 min»"`). La evidencia del diario
  nunca pisa una corrección manual del dueño: si la hay, el script responde 409 y se reporta.
- Un registro sin evidencia ni confirmación del dueño **no existe**. Jamás inventarlo.

## Racha y lectura

```bash
echo '{"action":"range","from":"2026-09-15","to":"2026-10-12"}' | python3 $H
```

Devuelve por hábito: días registrados, cumplidos y racha (días seguidos cumplidos hasta `to`; hoy sin
marcar no rompe la de ayer).

Reglas de lectura:

- **Un hueco es «sin registro», no incumplimiento.** No convertir nulo en falso ni calcular
  porcentajes como si cada día hubiera sido observado.
- Historia corta se dice tal cual («llevas 4 días medidos»), sin extrapolar.
- No calcular porcentajes del pasado con un catálogo distinto al que existía entonces.

## Las 2 preguntas del día (opcional)

Si el dueño quiere un ritual de apertura y cierre, Levy puede hacerle dos preguntas y registrar las
respuestas como notas en el bloque del día de `objetivos.md`:

- **Mañana:** «¿Qué bien voy a hacer hoy?» + la prioridad del día.
- **Noche:** «¿Avancé en lo importante, o me escondí en algo que se sentía productivo?»

Pocas palabras. Sin sermón. Si el dueño no quiere el ritual, no se insiste.

## Lo que esta referencia NO hace

- No diseña protocolos de salud, dieta o ejercicio: registra lo que el dueño decidió medir.
- No interpreta patrones profundos de conducta sin datos suficientes; con poca historia, lo dice.
