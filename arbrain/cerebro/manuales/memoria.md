# Tu memoria: cómo recuerda Levy sin engordar

Levy no recuerda por magia: recuerda lo que está escrito en `.claude/memory/`, dentro de tu cerebro. Esta guía dice
qué se carga siempre, qué llega solo cuando hace falta, cómo se guarda una memoria para que vuelva a aparecer y cómo
se mantiene corta. Es para ti, Levy, y para el dueño. La skill que escribe la memoria es `memory-manager`.

> **Privacidad:** la memoria vive en tu computadora, en archivos Markdown de tu cerebro, versionados con git si lo
> usas. Nada de esto sale a un servidor de Arbrain. Las llaves, contraseñas y tokens nunca entran a la memoria.

## Para Levy: cuándo usar este manual

- El dueño dice «recuerda», «guarda esto», «¿te acuerdas de…?», «¿qué sabes de…?» (y entonces, `memory-manager`).
- El sensor de memoria marca ⚠ o ✗, o una respuesta tuya olvidó algo que ya estaba guardado.
- El dueño pregunta cómo funciona su memoria o por qué no recordaste algo.

## Paso 1. Las capas

| Archivo | Cuándo se carga | Qué lleva | Techo |
|---|---|---|---|
| `MEMORY.md` (la esencia) | Siempre | Quién es en dos o tres líneas y sus reglas vivas, una línea cada una con su enlace | 6,000 caracteres |
| `RETRATO.md` | Siempre | Quién es, su meta, cómo decide, lo firmado y lo abierto ([retrato.md](retrato.md)) | 6,000 caracteres |
| `project/meta-90-dias.md`, `project/mi-camino.md` | Siempre | Su meta y dónde va en el programa; los escribe Arbrain desde arbrain.ai | cortos |
| `MEMORY-indice.md` | Nunca entero | Una línea por archivo de `project/`, `feedback/` y `reference/`, con disparadores | 400 por línea |
| `MEMORY-user.md` | Nunca entero | Lo mismo para `user/` | 400 por línea |
| `MEMORY-archivo.md` | Nunca entero | Líneas rotadas del índice (proyectos de más de 90 días), íntegras | sin techo |
| `user/`, `feedback/`, `project/`, `reference/` | A demanda | El detalle: un archivo por tema | el que haga falta |

`CLAUDE.md` es el contrato de Arbrain: llega con cada versión. No se usa para guardar memoria.

El índice apunta; el archivo manda. Antes de opinar sobre un tema que el índice trajo, abre su archivo completo.

## Paso 2. Los disparadores (`**T:**`)

El índice no se carga entero: con cada mensaje del dueño, el gancho `.claude/hooks/memory-recall.py` compara sus
palabras con los disparadores del índice, de `MEMORY-user.md` y de `MEMORY-archivo.md` (sin importar acentos ni
mayúsculas) y te trae hasta seis líneas que coinciden. Sin coincidencia, no trae nada y no cuesta nada. Por eso los
disparadores **son** el recuerdo:

```
- `feedback/una-recomendacion-cerrada-2026-11-01.md`: quiere una sola recomendación, no opciones. **T:** opciones, qué me recomiendas, cuál elijo, recomendación, decide tú.
```

- **Una línea por archivo**, máximo 400 caracteres.
- **De 8 a 12 disparadores en su vocabulario:** las palabras con las que él hablaría del tema, no las tuyas.
- **En el índice no van** citas suyas, cifras, porcentajes ni la historia del hallazgo: eso va en el archivo.
- Si una memoria gobierna tu conducta sin abrir el archivo («no me sermonees con X»), va **además** como regla viva
  en `MEMORY.md`, en una línea con su enlace.

Si no llegó nada y sospechas que existe, búscalo a mano:
`rg -i "<tema>" .claude/memory/MEMORY-indice.md .claude/memory/MEMORY-user.md .claude/memory/MEMORY-archivo.md`.
Si no está, di «no lo tengo en memoria»; no lo reconstruyas.

## Paso 3. Guardar

Con la skill `memory-manager`:

1. **¿Ya existe?** Busca en los índices. Si hay un archivo del tema, se actualiza; no se crea otro.
2. **Escribe el archivo** en la carpeta de su tipo (`user/` sobre él, `feedback/` sus correcciones, `project/` lo que
   está en curso, `reference/` dónde encontrar cosas), con fechas absolutas («2026-11-01», nunca «el jueves»).
3. **Su línea en el índice** con disparadores (`MEMORY-user.md` para `user/`, `MEMORY-indice.md` para lo demás).
4. **Dile qué guardaste y dónde**, en una línea. Si firmó algo o cambió su meta, actualiza también su retrato.

No se guarda: lo que ya dice el código o `CLAUDE.md`, el estado de esta conversación, ni secretos.

## Paso 4. Rotar sin engordar

Lo que se carga siempre se paga en cada conversación. El techo **no se sube: se rota**.

1. Corre el sensor: `bash .claude/hooks/memory-budget.sh`.
2. Si `MEMORY.md` pasa de su techo: lleva el detalle a su archivo y deja la línea con el enlace.
3. Si el índice marca ⚠ o ✗: mira qué rotaría y luego aplícalo:

   ```bash
   python3 .claude/skills/memory-manager/scripts/rotar-indice.py            # solo muestra
   python3 .claude/skills/memory-manager/scripts/rotar-indice.py --aplicar  # lo escribe
   ```

   Mueve las líneas de `project/` con fecha de más de 90 días a `MEMORY-archivo.md`, íntegras: el recall las sigue
   encontrando. No mueve ni borra ningún archivo de memoria.
4. Si sigue alto: consolida dos archivos del mismo tema en uno (con el dueño). Nadie borra memorias sin que él lo pida.

## Verificación

```bash
bash .claude/hooks/memory-budget.sh                      # todo en · (⚠ o ✗ se arregla en el mismo turno)
python3 .claude/hooks/memory-recall.py --selftest        # el recall funciona
echo '{"prompt":"<una frase con un disparador>"}' | python3 .claude/hooks/memory-recall.py   # trae su línea
```

En Windows, `py` en lugar de `python3` (el sensor corre en Git Bash). La memoria quedó bien guardada cuando la última
prueba, con las palabras del dueño, trae la línea del archivo nuevo.

## Si falla

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| Levy no recordó algo guardado | Sus palabras no tocan ningún disparador | Agrega a esa línea los disparadores que él usó hoy. |
| El recall trae líneas que no vienen al caso | Disparadores demasiado genéricos («hoy», «cosa») | Cámbialos por palabras propias del tema. |
| `memory-budget.sh` marca ✗ en `MEMORY.md` | La esencia engordó | Lleva detalle a su archivo; deja la línea con el enlace. |
| ✗ en una entrada del índice | Una línea pasó de 400 caracteres | Recórtala: el detalle va en el archivo, los disparadores se quedan. |
| `rotar-indice.py` no rota nada | No hay líneas de `project/` con fecha vieja | Consolida o recorta; no subas el techo. |
| `python3` no existe (Windows) | Python con otro nombre | Usa `py` o `python`; si no hay ninguno, [preparar-tu-computadora.md](preparar-tu-computadora.md). |
