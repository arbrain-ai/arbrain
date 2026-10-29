---
name: skill-creator
description: "Convierte un proceso del dueño en una skill propia de su cerebro: lo entrevista (máximo 5 preguntas), escribe la receta con los errores y aprendizajes de la primera vez, la guarda en .claude/skills/ con prefijo mi- y la valida. Usar ante «crea una skill», «hazme una skill», «convierte esto en una skill», «documenta este proceso», «que la próxima vez salga bien», «guarda cómo lo hicimos», «ya lo hicimos dos veces», «mi proceso más odiado» o al terminar por segunda vez la misma tarea. NO: mejorar con evaluaciones una skill que ya funciona (autoresearch)."
metadata:
  basada_en: "skill-creator de Anthropic (Apache-2.0), adaptada al dueño de Arbrain"
---

# Crear tu skill a partir de un proceso

Una skill es una receta que tu cerebro lee antes de hacer una tarea. Vive en una carpeta con un `SKILL.md`; arriba
lleva un nombre y una descripción, y la descripción es lo que hace que Levy la use sola cuando la tarea aparece.

Esta skill es el paso 3 del método para soltar un proceso:

1. Identifica el proceso (completo o una parte): el que más dinero u horas te cuesta.
2. Hazlo una vez con IA, en una conversación y en solo lectura.
3. **Documenta los errores y aprendizajes en una skill, para que la segunda vez salga bien.** ← aquí
4. Mapea qué partes necesitan la pantalla (computer use) y cuáles tienen comando o API.
5. Si hace falta, una rutina programada o una persona.

La regla de la videocámara: **lo que repites dos veces se vuelve skill.** Lo haces una vez en voz alta y tu cerebro
escribe el manual.

## Cuándo ofrecerla sin que la pidan

Si en la conversación el dueño terminó una tarea que ya había hecho antes (mismos pasos, mismas fuentes), ofrécelo
una vez y en una línea: «Esto ya lo hicimos dos veces. ¿Lo guardo como skill para que la próxima salga solo?». Si dice
que no, no insistas.

## Paso 1 · Entender el proceso

Primero saca lo que ya está en la conversación: los pasos que se dieron, qué herramientas se usaron, qué salió mal y
cómo se corrigió, y cómo quedó el resultado. Solo pregunta lo que falte, **una pregunta a la vez y con tu propuesta**,
máximo 5 en total:

1. ¿Qué resultado quieres al final? (un archivo, un borrador, un reporte, una tabla).
2. ¿De dónde salen los datos? (un archivo, una app, una página, tu correo).
3. ¿Qué frases vas a usar para pedirlo? (son los disparadores de la descripción).
4. ¿Qué salió mal la primera vez o qué no debe pasar nunca? (cada respuesta es una regla).
5. ¿Hay algo que solo puedes decidir tú? (enviar, publicar, pagar, borrar: eso siempre espera su «va»).

Si el dueño dicta el proceso caminando o de corrido, no lo interrumpas: escucha completo y luego pregunta solo lo que
quedó en duda.

## Paso 2 · Crear la carpeta

Las skills del dueño llevan el prefijo `mi-` (o el nombre de su negocio). Así nunca chocan con una skill que traiga una
versión nueva de Arbrain, y actualizar no las toca.

```bash
python3 .claude/skills/skill-creator/scripts/crear_skill.py mi-seguimiento-cobros
```

- En Windows usa `python` si `python3` no existe.
- Crea `.claude/skills/mi-seguimiento-cobros/SKILL.md` con la plantilla. Nunca pisa una carpeta que ya existe.
- Si el nombre es de una skill del autor (la lista vive en `CAPAS.json`), se niega: elige otro.
- Nombre: minúsculas, números y guiones, máximo 64 caracteres. Que diga qué hace: `mi-propuestas`, no `mi-cosa`.
- `--sin-prefijo` existe para un nombre de negocio (`acme-propuestas`); úsalo solo si el dueño lo pidió así.

## Paso 3 · Escribir la receta

Llena la plantilla con lo del paso 1. Lo que hace buena a una skill:

- **La descripción hace el trabajo de encenderla.** Di qué hace y cuándo usarla, con las frases reales del dueño entre
  comillas. Levy tiende a no usar una skill si la descripción es tímida: sé concreto y un poco insistente («Usar
  siempre que…», «aunque no diga la palabra skill»). Si hay una skill vecina, di cuándo NO usar esta. Máximo 1024
  caracteres y sin los signos `<` ni `>`.
- **Pasos en orden, en imperativo:** «Lee el archivo X», «Arma la tabla con estas columnas».
- **Explica el porqué de cada regla.** «Revisa si la factura ya existe, porque una vez se duplicó» sirve más que
  «NUNCA dupliques». Con el porqué, Levy acierta también en casos que la regla no previó.
- **Cada error de la primera vez se vuelve una línea.** Ese es el valor de la skill: lo que salió mal ya no se repite.
- **Candados primero.** Lo que nunca debe pasar (duplicar, enviar sin permiso, adivinar un dato) va arriba, antes de
  los pasos.
- **Freno:** enviar, publicar, pagar o borrar quedan en borrador hasta que el dueño diga «va» sobre ese texto.
- **Un ejemplo de entrada y salida** cuando el formato importa.
- **Corta.** Menos de 500 renglones. Lo largo (plantillas, listas de precios, guías) va en `references/` y el
  `SKILL.md` dice cuándo abrir cada archivo. Lo que se hace siempre igual con código va en `scripts/`.
- **Rutas relativas** a la carpeta de Arbrain y nada de llaves ni contraseñas en el texto: las llaves viven en el
  llavero de la app.

Anatomía completa, campos del encabezado y un ejemplo terminado: `references/anatomia.md`.

## Paso 4 · Validar

```bash
python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/mi-seguimiento-cobros
```

Revisa el encabezado, que `name` coincida con la carpeta y la longitud de la descripción, y avisa si el texto menciona
un archivo de `references/` o `scripts/` que no existe. Código 0 = lista; 1 = algo que arreglar (lo dice en español). Los
avisos no bloquean, pero léelos. `--todas` revisa todas las skills de `.claude/skills/`.

## Paso 5 · Probarla de verdad

1. Abre una conversación nueva (la skill se lee al empezar).
2. Pide la tarea con una de las frases del dueño, sin decir «usa la skill».
3. Mira si Levy la abrió y siguió los pasos. Si no la abrió, la descripción necesita las frases reales; si la abrió y
   se equivocó, falta una regla o un paso.
4. Corrige, vuelve a validar y prueba otra vez. Dos vueltas suelen bastar.

Al terminar, dile al dueño en dos líneas: cómo se llama la skill, con qué frase la pide y cuánto tiempo le ahorra a la
semana (su estimación, no inventada). Si quiere guardarla en su historial: `git add .claude/skills/mi-… && git commit`
en su rama `mi-arbrain`.

## Después

- **¿Va solo a una hora?** Eso ya es el paso 5 del método: una rutina programada que llama a la skill.
- **¿La quiere más fina?** Con varias pruebas y criterios de sí o no, `autoresearch` la mejora en ciclos.
- **¿Se parece a una que ya existe?** Antes de crear otra, revisa si cabe como un archivo en `references/` de una skill
  suya. Menos skills, mejor elegidas, se encienden mejor.
