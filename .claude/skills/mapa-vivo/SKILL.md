---
name: mapa-vivo
description: "El mapa vivo de un negocio: convierte el negocio de tu cliente (o el tuyo) en un lienzo que se mueve, con cuatro capítulos y cámara: su norte, su sistema nervioso (piensa, siente y se mueve, con el cuello de botella marcado), su oferta (la escalera de valor y la hoja de 11 piezas) y su vehículo (qué se arregla primero y cuánto cuesta no hacerlo). Cada cosa lleva su estado (firmado, abierto, pendiente o idea) y se recorre como una clase con las flechas. Es el remate de la Radiografía («y ahora te lo muestro») y también sirve para verte a ti mismo. Usar ante «mapa vivo», «el mapa vivo de mi cliente», «hazme el mapa de su negocio», «muéstrale su negocio», «y ahora muéstraselo», «anima el mapa», «anima el lienzo», «mi mapa», «el mapa de mi negocio», «ponle sus colores al mapa», «el recorrido del mapa» o al terminar una Radiografía. Para cualquier otro lienzo con capítulos y piezas vivas (un panel, una clase, un proceso), el estándar está en `canvas/references/capitulos.md`."
metadata:
  resumen: "Convierte el negocio de tu cliente, o el tuyo, en un mapa que se mueve y se recorre como una clase."
---

# Mapa vivo: el negocio que cobra vida

Una Radiografía le dice al dueño dónde se le atora el dinero. El mapa vivo se lo **enseña**: su negocio entero en una
pantalla, con su gente entrando, su cuello dejando ir ventas, la información subiendo y la corrección bajando. Ese es
el momento que vende: no lo explicas, lo ve. Y lo que le haces a tu cliente, primero te lo haces a ti: tu propio mapa
es tu mejor demostración.

## Dónde vive

- **La fuente, un solo archivo:** `mapa.json` (esquema `arbrain.mapa/v1`; cada campo en `references/datos.md`, un caso
  completo inventado en `references/ejemplo.json`).
  - De un cliente: `.claude/memory/project/clientes/<slug>/mapa.json`, junto a su `radiografia.json`.
  - El tuyo: `.claude/memory/project/mi-negocio/mapa.json` (con `--propio`).
- **Lo que se genera** (no se edita; se vuelve a armar): `<carpeta>/mapa/*.html`, las cinco piezas vivas con sus datos
  adentro, y la página «Mapa vivo · <negocio>» en el Lienzo.
- **Los datos de un cliente son privados:** se quedan en tu cerebro. En clase o en contenido, solo con su permiso.

## La pluma

```bash
M=".claude/skills/mapa-vivo/scripts/mapa.py"
python3 $M nuevo <slug>            # siembra mapa.json con lo que ya midió la Radiografía
python3 $M nuevo --propio          # el tuyo: siembra con tu embudo.json y tu 02-oferta.md
python3 $M revisar <slug>          # qué falta preguntar, qué está por medir, avisos (no escribe nada)
python3 $M lienzo <slug>           # arma las piezas y dibuja o actualiza la página en el Lienzo
python3 $M lienzo <slug> --ensayo  # lo mismo, sin escribir: dice qué cambiaría
```

- En Windows usa `python` si `python3` no existe. Con `--propio` en lugar del slug, todo aplica a tu negocio.
- Código 2: faltan datos y la lista dice cuáles. Código 3 (`alto`): ya existe ese mapa; se continúa, no se reemplaza.
- `lienzo` solo corre dentro de la app Arbrain. Si dice `sin_app`, las piezas quedan armadas y se dibuja al correrlo
  desde la app. Devuelve `paginaId` y los `capitulos` con su `zona`.
- **Volver a correrlo es seguro:** actualiza lo suyo y respeta lo que una mano movió, editó o borró en el Lienzo
  (`de_la_mano`, `no_repuestos`). Si devuelve `bloqueados`, hay candados: pregunta antes de tocar (skill `canvas`, regla 6).
- Para enseñarla: `mostrar` del MCP `cabina` con `vista: "lienzo"`, su `paginaId` y, si quieres un capítulo, su `zona`.

## Las dos formas de usarla

| Dice | Hacer |
|---|---|
| Terminaste una Radiografía, o «muéstrale su negocio», «el mapa vivo de <cliente>» | `nuevo <slug>` (toma su `radiografia.json`), `revisar`, pregunta **solo lo que falta** de una en una, `lienzo`. Luego dile en cuatro líneas cómo enseñárselo (abajo) |
| «Mi mapa», «el mapa de mi negocio», antes de vender el primero | `nuevo --propio` (toma tu `embudo.json` y tu `02-oferta.md`), y lo mismo. Si no tienes embudo ni oferta, primero `oferta` |
| «Ponle sus colores», «con su logo», «que sea de su mundo» | `marca` en `mapa.json`: `acento`, `segundo` y `motivo` (`references/oficio.md`, «El mundo del cliente»). Vuelve a correr `lienzo` |
| «Cambió X», «ya firmó la garantía», «ya medimos» | Edita `mapa.json` (el dato y su `estado`) y `lienzo`. La página abierta se repinta sola en un par de segundos |
| «Anima esto otro», un mecanismo que las cinco piezas no cubren | Una pieza nueva: `references/oficio.md` («Una pieza nueva») y `canvas/references/pieza-viva.md` |
| Otro lienzo con capítulos que no es un negocio | `canvas/references/capitulos.md` y `canvas/scripts/lienzo_vivo.py` |

## Los cuatro capítulos

Cada capítulo es una pantalla (16:9): al volar a él cabe entero, proyectado o compartido. Detalle de cada pieza y de
lo que pide: `references/datos.md`.

1. **El norte** (a dónde va): la luz del porqué enciende sistemas cada vez más grandes hasta la meta, dibujada a escala
   contra hoy; sus tres frases (porqué, meta, juego), sus principios y el enfoque. Las frases son texto del Lienzo: el
   dueño las edita con su mano.
2. **El sistema nervioso** (cómo se mueve): **piensa** (el timonel: la meta menos hoy, igual al empuje), **siente**
   (cuatro órganos, cada uno con su número y su fecha) y **se mueve** (las seis etapas, con quién las opera y las horas
   a mano). En el cuello casi todo se escapa; lo que no existe hoy corta el nervio.
3. **La oferta** (qué vende): la escalera de valor (el escalón ancho es el que se empuja) y la hoja de 11 piezas, con
   la regla de arriba que dice cuántas están firmadas.
4. **El vehículo** (cómo llega): los pasos en orden, cada uno con su hilo de oro a lo que arregla o llena; abajo, lo
   que cuesta no hacerlo, a escala contra lo que falta para la meta.

## Los estados: nada se pinta como hecho si no lo es

| Estado | Se dibuja | Cuándo |
|---|---|---|
| `firmado` | lleno, borde continuo, oro | El dueño lo decidió o se midió con fuente y fecha |
| `opera` | lleno, borde continuo, morado | Funciona hoy, aunque nadie lo haya «firmado» |
| `abierto` | guiones, oro | Se está decidiendo; hay un borrador |
| `pendiente` | guiones, gris, encogido | Falta: por construir, por escribir, **por medir** |
| `idea` | puntos, tenue | Algún día; nadie camina todavía por ahí |

Un número sin fuente no entra: va `valor: null` y el mapa dice «por medir». Un cuello sin evidencia no es cuello: es
medir. `revisar` avisa de números sin fecha.

## Cómo se lo enseñas (el momento que vende)

1. Abre la página y quédate **de lejos** diez segundos: «este es tu negocio». Que lea los cuatro nombres.
2. Entra al **recorrido**: `⇧P` (o el ▶ del índice de capítulos, abajo a la derecha). `→` avanza: primero revela las
   partes de cada pieza y luego vuela al siguiente capítulo. `←` regresa. `Esc` sale.
3. En el sistema nervioso, **cállate en el cuello**: deja que vea cuántos se le van. Luego `→`: la información sube, y
   `→`: la corrección baja justo ahí.
4. Termina en el vehículo: el hilo grueso es el primer arreglo, y la barra roja contra la punteada es lo que hoy se le
   va contra lo que le falta. Tu siguiente paso sale de tu `02-oferta.md`, no se inventa.

Fuera del recorrido: los capítulos están en el índice de la derecha y en la barra de abajo; `1` a `4` vuelan a cada
uno. Acercarte a una pieza la despierta.

## Reglas

- **Nada inventado.** Lo que no dijo el dueño ni salió de una fuente queda `pendiente`. Mejor un hueco honesto que un
  mapa bonito y falso: el hueco es tu siguiente conversación.
- **Sus palabras.** El porqué, la meta y lo que duele, como lo dijo. Las personas, por su rol; sin nombres en el mapa.
- **Al dueño no se le habla de IA.** Se le habla de su negocio y de su número (`revisar` avisa si el mapa la nombra).
- **La fuente es `mapa.json`.** Lo que vive dentro de una pieza se cambia ahí y se vuelve a armar. Lo nativo (títulos,
  frases, principios) lo puede editar el dueño en el Lienzo y se respeta.
- **El freno sigue igual.** No envías, no publicas y no contactas a nadie. Tú decides cuándo y a quién se lo enseñas.
- **Hasta dónde llega hoy:** el mapa vive en tu Lienzo; el dueño lo ve en tu pantalla (en persona o compartida). No
  genera un archivo suelto para mandarle.

## Qué NO hace

- Las preguntas y los números del diagnóstico → `radiografia`. La oferta, pieza por pieza → `oferta`. La ficha y el
  seguimiento del cliente → `clientes`. Un deck para presentar → `presentaciones`.
- Un diagrama rápido de cajas y flechas → `canvas` (sus dos puertas). El mapa vivo es para cuando hay que **mostrar**.
