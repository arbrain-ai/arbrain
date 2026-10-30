# Anatomía de una skill

## La carpeta

```
.claude/skills/mi-<nombre>/
├── SKILL.md        # obligatorio: encabezado + receta
├── references/     # opcional: lo largo que se abre solo cuando hace falta
├── scripts/        # opcional: código que hace siempre lo mismo (calcular, convertir, revisar)
└── assets/         # opcional: plantillas, imágenes o archivos que la skill copia o llena
```

## Cómo la lee tu cerebro (por capas)

1. **Encabezado** (`name` y `description`): siempre a la vista, en cada conversación. Por eso decide si la skill se
   enciende. Unas 100 palabras.
2. **El cuerpo del `SKILL.md`:** se lee cuando la skill se enciende. Ideal: menos de 500 renglones.
3. **`references/`, `scripts/`, `assets/`:** solo cuando el `SKILL.md` lo indica. Un script se puede correr sin leerlo.

Si el `SKILL.md` crece, pártelo: deja en el cuerpo los pasos y los candados, y manda lo demás a `references/` con una
línea que diga cuándo abrir cada archivo («Para propuestas de más de 10,000, lee `references/propuesta-grande.md`»).
Si un archivo de referencia pasa de 300 renglones, ponle un índice arriba.

## El encabezado

```yaml
---
name: mi-seguimiento-cobros
description: "Qué hace y cuándo usarla, con las frases reales del dueño entre comillas."
---
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `name` | sí | Igual al nombre de la carpeta. Minúsculas, números y guiones; sin guion al inicio, al final ni doble. Máximo 64. |
| `description` | sí | Qué hace + cuándo usarla + frases que la disparan + cuándo NO (si hay una vecina). Máximo 1024, sin `<` ni `>`. |
| `metadata` | no | Datos libres para ti (versión, de dónde salió). |
| `allowed-tools` | no | Herramientas que la skill puede usar sin preguntar. Déjalo fuera si no lo necesitas. |

Si la descripción lleva dos puntos, comillas o `#`, enciérrala entre comillas dobles (como en el ejemplo) para que el
encabezado no se rompa.

## Descripción: tímida contra buena

Tímida (casi nunca se enciende):

> Ayuda con cobros.

Buena:

> "Arma el seguimiento semanal de cobros pendientes: lee mi hoja de clientes, cruza quién no ha pagado y deja un
> borrador de recordatorio por cliente, sin enviar nada. Usar siempre que diga «quién me debe», «seguimiento de
> cobros», «cobranza», «manda los recordatorios» o pregunte por pagos atrasados, aunque no diga la palabra skill."

## Ejemplo completo

```markdown
---
name: mi-seguimiento-cobros
description: "Arma el seguimiento semanal de cobros pendientes: lee mi-negocio/clientes.csv, cruza quién no ha pagado y deja un borrador de recordatorio por cliente, sin enviar nada. Usar ante «quién me debe», «seguimiento de cobros», «cobranza» o «manda los recordatorios»."
---

# Seguimiento de cobros

## Candados
- Nunca envíes un recordatorio: déjalos en borrador. Se manda solo con mi «va» sobre ese texto.
- Si un cliente aparece dos veces en la hoja, avísame antes de sumar: una vez cobré doble por eso.
- Si falta el monto o la fecha, escribe «sin dato»; no lo adivines.

## Pasos
1. Lee `mi-negocio/clientes.csv` (columnas: cliente, monto, vence, pagado).
2. Filtra los que tienen `pagado = no` y `vence` ya pasó.
3. Arma una tabla: cliente, monto, días de atraso. Ordénala por días de atraso.
4. Para cada uno, escribe un recordatorio corto y amable con el tono de `references/tono.md`.
5. Guarda todo en `mi-negocio/cobros/AAAA-MM-DD.md` y dime el total pendiente en una línea.

## Aprendizajes
- El banco tarda dos días en reflejar transferencias: un atraso de 1 o 2 días no lleva recordatorio.
```

## Errores comunes

- **La skill no se enciende:** la descripción no tiene las palabras con las que el dueño pide la tarea. Agrégalas
  textuales.
- **Se enciende cuando no debe:** la descripción es demasiado amplia; di cuándo NO usarla.
- **Dejó de aparecer:** el `name` no coincide con la carpeta, o el encabezado se rompió (corre `quick_validate.py`).
- **Choca al actualizar Arbrain:** la skill no tiene prefijo propio. Renómbrala a `mi-…` (carpeta y `name`).
- **Hace cosas raras con casos nuevos:** reglas sin porqué. Explica la razón de cada una.
