# Fichas: de una pregunta en español al minuto exacto

Una ficha por video, encima del verbatim. Le dice a cualquier agente que llega en frío **si este video responde su
pregunta y en qué minuto**, para abrir el verbatim justo ahí. Una ficha que suena bien pero ancla mal es peor que no
tener ficha.

## La ruta (lee lo mínimo)

```
L0  contenido/intel/INDICE.md            corpus, cobertura, cómo entrar
    contenido/intel/_temas/<tema>.md     opcional: el tema en todos los corpus
L1  <corpus>/INDICE.md                   por mes: título → ficha, tesis en una línea, temas
L2  <corpus>/fichas/<archivo>.md         para qué abrirlo, ideas con minuto, tramos, marcos, citas, cifras atribuidas
L3  <corpus>/transcripts/<archivo>.md    el verbatim intacto
```

La ficha usa el mismo formato de marca que el transcript (`[12:30]`, o `[01:02:03]` pasada la hora), así que del
ancla al verbatim es un `rg -n "\[12:3" <transcript>`.

## Fichar

```bash
S=.claude/skills/intel/scripts/corpus.py
python3 $S pendientes contenido/intel/<slug>/youtube        # sin ficha o con ficha vieja
python3 $S ficha contenido/intel/<slug>/youtube <video_id>  # crea el esqueleto con la huella del verbatim
#   … el fichador lee el transcript COMPLETO y llena la ficha …
python3 $S buscar <transcript.md> "la frase exacta"         # comprueba cada cita antes de escribirla
python3 $S validar contenido/intel/<slug>/youtube           # citas que existen y anclas a ≤150 s
python3 $S indice contenido/intel/<slug>/youtube            # sube la tesis al INDICE
```

Para muchos videos, reparte lotes sin repetir entre subagentes (uno por lote) con las instrucciones de abajo, y al
final corre `validar` e `indice` tú. Nunca des una ficha por buena sin `validar` en verde.

## Instrucciones del fichador (pásalas tal cual a un subagente)

1. Lee el transcript **completo** antes de escribir. Si es largo, en trozos hasta el final. No abras otras fichas.
2. Llena el esqueleto en español; solo las citas y evidencias van en el idioma original, entre «».
3. **En una línea** (6 a 32 palabras): la tesis o el valor, específica. Mal: «habla de negocios y ventas». Bien: «Subir
   precios a clientes actuales con aviso de 30 días retiene a la mayoría; cómo anunciarlo sin perder confianza».
4. **Para qué abrirlo:** preguntas concretas que un dueño haría en español y que este video responde mejor que otros.
5. **Ideas, marcos y cifras** llevan evidencia: una frase exacta de 3 a 25 palabras, copiada letra por letra, del
   lugar donde se dice. El validador la busca y exige que esté a menos de 150 s de su ancla.
6. **Una ancla por momento:** el segundo donde empieza ese dicho. Si el mismo momento sale en varias secciones, usa la
   misma ancla en todas.
7. **Mapa por tramos:** de qué va cada bloque, cubriendo el video sin huecos grandes.
8. **Temas:** de uno a cinco, solo los centrales, del vocabulario del dueño (abajo).
9. Copia sin omitir muletillas ni usar «…»; si una frase no aparece con `buscar`, usa un tramo más corto o contiguo.
10. **Hablantes:** identificados por el contenido; si no se sabe, «anfitrión (sin identificar)». No adivines nombres.
11. Subtítulos malos: dilo en la ficha y no inventes lo que no se entiende. Video sin subtítulos: ficha mínima con
    `sin_verbatim: true` (hueco declarado), sin ideas ni citas.

## Vocabulario de temas

Vive en `contenido/intel/_temas/TEMAS.md`, uno por línea (`precios`, `oferta`, `contratar`, `sueno`…). Nace de las
preguntas reales del dueño y de su negocio, no de una lista genérica: arma la primera versión con 15 a 30 temas desde
su oferta y sus campos, enséñasela en una línea y crece cuando una ficha no encaje. Un tema nuevo se agrega ahí antes
de usarlo.

## Reglas del contrato

- El verbatim nunca se edita. Si cambia (subtítulos corregidos), la huella `sha_transcript` delata la ficha vieja y
  `pendientes` la lista.
- Cada cita existe palabra por palabra en el verbatim, cerca de su ancla (lo comprueba `validar`).
- Cifras siempre atribuidas («dice que…»). Se cita el verbatim con link al minuto, nunca la ficha.
