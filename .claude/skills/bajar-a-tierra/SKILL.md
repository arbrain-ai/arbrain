---
name: bajar-a-tierra
description: "Ritual guiado para bajar la meta a tierra: primero el mes (la meta en número, desde el expediente), luego la semana (3 a 5 resultados) y luego el día (su objetivo y 3 tareas), escrito en objetivos.md, en el calendario local y en los lienzos «Mi plan» y «Calendario de 12 semanas». Si es del programa Cerebro Artificial, además le dice en qué parte exacta de su camino va y su siguiente paso, y le ofrece hacerlo con él (references/mi-camino.md, con el mapa del programa). Usar ante «buenos días», «¿qué sigo?», «¿en qué voy?», «qué me falta», «mi camino», «bájame a tierra el mes», «bájame a tierra la semana», «bájame a tierra el día», «baja mi meta a tierra», «llena mi plan», «planeemos el mes» o «qué hago hoy» sin plan escrito."
---

# Bajar a tierra: mes → semana → día

La meta a 90 días no se cumple de golpe: se baja a un número del mes, a 3 a 5 resultados de la semana y a un objetivo
de hoy con 3 tareas. Este ritual lo hace contigo cada mañana. Levy pregunta lo que falta, **una cosa a la vez y con su
recomendación**, y escribe solo lo que el dueño acordó.

## La pluma

Todo se escribe con un solo script (nunca a mano en este ritual): sabe el formato que leen el Calendario del panel,
el puente con arbrain.ai y los lienzos, y nunca pisa un objetivo distinto sin permiso.

```bash
P=".claude/skills/bajar-a-tierra/scripts/plan.py"
python3 $P estado                       # JSON: meta_90 (de su expediente), camino, mes, semana, dia y «falta»
python3 $P mes --texto "<meta del mes en número>"
python3 $P semana --resultado "<1>" --resultado "<2>" --resultado "<3>"     # de 3 a 5
python3 $P dia --objetivo "<objetivo de hoy>" --tarea "<1>" --tarea "<2>" --tarea "<3>" [--hora 09:00 --minutos 90]
python3 $P lienzos                      # redibuja «Mi plan» y «Calendario de 12 semanas»
```

- En Windows usa `python` si `python3` no existe. `--revisar` dice qué haría sin escribir.
- Si responde `{"alto": …}` (código 3), ya había otro objetivo en ese período: díselo con sus palabras y pregúntale
  si lo cambia. Solo con su sí, repite con `--reemplazar`. Código 2: el pedido no cumple la forma (3 a 5 resultados,
  3 tareas). Código 4: `calendario.json` no se puede leer; no lo toques y díselo.
- `dia` escribe el objetivo como casilla del día en `.claude/plan/objetivos.md` y como tarea de hoy con la etiqueta
  `objetivo` en `.claude/plan/calendario.json`, con sus 3 tareas como casillas: el Día del Calendario enseña el objetivo
  con sus 3 casillas. Con `--hora` además lo bloquea a esa hora.
- `lienzos` solo corre dentro de la app Arbrain. Si dice `sin_app` o `no_existe`, dilo tal cual; no recrees un lienzo
  que el dueño borró sin que te lo pida.

## Las fuentes (lee antes de preguntar)

1. `python3 $P estado`: lo que ya está escrito.
2. `.claude/memory/project/meta-90-dias.md`: su meta a 90 días, su escalera, sus horas y **su nicho natural** (la
   industria que conoce por dentro), sacados de su expediente de arbrain.ai. El expediente completo, literal, está en
   `.claude/memory/user/expediente.md`. Si dice «pendiente» o no existe, busca un `meta-90-dias-AAAA-MM-DD.md`.
3. `.claude/memory/project/mi-camino.md` (si es del programa): dónde va (día N de 90, semana, etapa), sus casillas, su
   siguiente paso, el siguiente hito y la lección actual. `estado` lo resume en `camino`. Cómo usarlo y el mapa del
   programa: `references/mi-camino.md`.
4. Lo que dijo en esta conversación. Lo que él diga hoy manda sobre todo lo demás.

**Nunca inventes datos.** Si no hay meta a 90 días, no la supongas: pregúntasela («¿cuánto quieres que te entre al
mes y para qué fecha?») o, si es del programa Cerebro Artificial, dile que su expediente llega solo cuando conecta su
cerebro en Ajustes › Privacidad › Conectar con arbrain.ai. Falta de dato no es cero.

## El ritual (en este orden; salta lo que ya esté)

### 1 · El mes: la meta en número

- Recomienda un número para este mes a partir de su meta a 90 días, con la cuenta a la vista. Ejemplo de forma: «Tu
  meta es 3,000 USD al mes para el 20 de enero. Para llegar, este mes yo pondría: tu primer cliente cobrado, 1,000
  USD. ¿Va, o lo ajustas?». Si la cuenta no cierra con sus horas, díselo de frente y propón el ajuste; él decide.
- Un solo objetivo, comprobable el último día del mes (un monto cobrado, un número de clientes, un entregable).
- Con su «va»: `plan.py mes --texto "…"`.

### 2 · La semana: de 3 a 5 resultados

- Recomienda de 3 a 5 resultados que, cumplidos, acercan el número del mes. Resultados, no actividades: «10
  conversaciones de venta» y no «hacer prospección». Parte de su nicho natural (su industria) y de sus horas reales.
- Pregunta uno a la vez si hace falta; muestra la lista completa antes de escribir y espera su «va».
- Con su «va»: `plan.py semana --resultado … (3 a 5)`.

### 3 · El día: el objetivo de hoy y 3 tareas

- Recomienda el objetivo de hoy (lo único que, si sale, hace bueno el día) y 3 tareas concretas que lo cumplen, sacadas
  de los resultados de la semana. Pregunta si quiere bloquearlo a una hora (opcional).
- Con su «va»: `plan.py dia --objetivo … --tarea … --tarea … --tarea … [--hora HH:MM]`.

### 4 · Que lo vea

- `plan.py lienzos` y luego `mostrar` (MCP `cabina`) con `vista: "calendario"`, `alcance: "dia"` y la fecha de hoy.
  Si quiere ver el mes completo, `mostrar` el lienzo «Mi plan» (`vista: "lienzo"`, su `paginaId`).
- Cierra en tres líneas: el número del mes, los resultados de la semana y el objetivo de hoy con sus tareas.

## «Buenos días» (el ritual de cada mañana)

1. Corre `plan.py estado` en silencio.
2. **Su camino primero (si es del programa, `camino.presente`):** abre `references/mi-camino.md` y dile en una línea
   dónde va y su siguiente paso («Día 3 de 90, semana 1: te falta la casilla 4, tu ritual y tres encargos») y ofrécele
   hacerlo con él. Si su siguiente paso es la casilla 3 o la 4, este ritual es la forma de hacerlo: dilo y sigue.
3. Si `falta` es `mes`, `semana` o `dia`: salúdalo en una línea y ofrécele bajar a tierra **solo lo que falta**,
   empezando por ese nivel («Te falta el objetivo de esta semana. Te propongo estos 3 resultados: …»).
4. Si no falta nada: en 5 líneas como máximo, el foco de la semana, el objetivo de hoy y sus 3 tareas, lo que tiene en
   el calendario hoy, y **una** pregunta («¿con cuál empiezas?» o la que más mueva su semana).
5. Si un objetivo de ayer quedó sin cumplir, menciónalo una vez y pregúntale: hoy, otra fecha o soltarlo.

No programes despertadores, recordatorios ni hábitos que no te pidió. No marques nada como hecho por él.

## «¿Qué sigo?» y «¿en qué voy?»

Sigue `references/mi-camino.md` › «Cómo guías»: dónde va con sus números, su siguiente paso concreto y una oferta para
hacerlo ahí mismo. Sin `mi-camino.md` no adivines: pregúntale y ofrécele conectar su cerebro. Si lo que sigue es bajar
a tierra (mes, semana o día), sigue con el ritual de arriba.

## Reglas

- **Una pregunta a la vez, siempre con tu recomendación.** Él responde «va», ajusta o cambia.
- **Aprobación antes de escribir.** Un permiso general no aprueba un plan concreto.
- **Pocos por nivel:** mes, uno; semana, de 3 a 5 resultados; día, su objetivo y 3 tareas.
- **Lo que él escribió a mano se respeta.** El script nunca reemplaza sin `--reemplazar`, y ese solo va con su sí.
- **Su nicho natural es su industria.** Su vehículo es ser consultor de negocios con IA en lo que ya conoce por dentro:
  diagnostica, implementa y capacita al equipo; la IA no es la oferta. No le propongas otro nicho sin que lo pida.
- **El freno sigue igual:** preparar sí; enviar, publicar, pagar o borrar solo con su pedido explícito.

## Qué NO hace esta skill

- Hábitos y racha → `habit-system` (`references/habitos-y-ritual.md`).
- Revisión semanal completa o «cómo me fue» → `habit-system` (`references/planning.md`).
- Agendar eventos sueltos («agéndame…») → `habit-system` (`references/tiempo-y-calendario.md`).
- Guardar su meta nueva en la memoria → `memory-manager` (si cambió su meta a 90 días, pregúntale si la actualizas
  en arbrain.ai: su expediente manda y llega solo a `meta-90-dias.md`).
