# Tu retrato: que Levy te conozca y responda como tú lo harías

El retrato (`.claude/memory/RETRATO.md`) es la página que Levy lee en **cada** conversación para saber quién eres,
a dónde vas, cómo decides y qué ya firmaste, aunque tu mensaje no nombre el tema. Es la capa 0 de tu memoria: corta,
siempre cargada, y apunta a los archivos donde vive el detalle. Esta guía es para ti, Levy, y para el dueño.

> **Privacidad:** el retrato vive en tu computadora, dentro de tu cerebro. Se arma con tu expediente de arbrain.ai
> (que trae tu Arbrain con tu conexión) y con lo que le cuentas a Levy. No sale a ningún servidor. La conexión con
> arbrain.ai nunca pide un token en el chat.

## Para Levy: cuándo usar este manual

- La primera línea de `RETRATO.md` dice `arbrain:retrato pendiente` o `arbrain:retrato borrador`.
- Acaba de llegar su expediente (`user/expediente.md`, `project/meta-90-dias.md`).
- El dueño dice «conóceme», «revisa mi retrato», «¿qué sabes de mí?», «eso ya no es así».
- Firmó algo, te corrigió o cambió su meta: la línea del retrato se actualiza en el mismo turno que su archivo.

## Paso 1. De dónde sale

| Cómo llegó | Qué ves | Qué haces |
|---|---|---|
| Conectó su cerebro con arbrain.ai | `RETRATO.md` empieza con `<!-- arbrain:retrato borrador sha256=… -->` y la línea «_Borrador del…_» | Revisarlo con él (paso 3). Arbrain lo sembró con sus respuestas textuales; nada está firmado. |
| No ha conectado | `<!-- arbrain:retrato pendiente -->` y secciones con guía en cursiva | Pídele que conecte: **Ajustes › Privacidad › «Conectar con arbrain.ai»** (un clic: se abre su navegador, confirma un código y listo). Mientras tanto, llénalo conversando. |
| No es del programa o no tiene expediente | La semilla pendiente | Llénalo en el primer encuentro, una pregunta a la vez (paso 3). |

Nunca le pidas el token ni el código de conexión en el chat. Si pega uno por error, dile que lo revoque en su perfil
de arbrain.ai y conecte otra vez con el botón; no lo copies a ningún archivo.

## Paso 2. La forma

El retrato **describe; no ordena**. Las reglas de cómo trabajas viven en `CLAUDE.md` y `MEMORY.md`; aquí no se
repiten. Siete secciones, en este orden:

| Sección | Qué lleva |
|---|---|
| Cómo usar este retrato | Dos o tres reglas suyas de trato: qué tan corto, en qué registro, recomendación cerrada u opciones. |
| Quién es | Su oficio, su industria, con quién vive o trabaja; solo lo que cambia cómo le respondes. |
| Su meta y su porqué | Su número con su fecha y por qué lo quiere, en sus palabras. |
| Cómo decide | Sus reglas para decidir, cada una con su frase si la tiene. |
| Qué odia que Levy haga | Sus correcciones, cada una con su fecha y su enlace a `feedback/`. |
| Lo firmado | Lo que decidió en firme: cifra exacta y fecha. Se ejecuta, no se reabre. |
| Abierto | Lo que todavía no decide. No se da por resuelto en ningún sentido. |

Reglas de escritura:

1. **Textual entre «».** Lo que va entre comillas angulares existe tal cual en una fuente (su expediente, una
   memoria, sus palabras de hoy). Si es tu lectura, va marcada «(Levy)».
2. **Nunca inventes** una frase, una cifra, una edad o una fecha. Sin dato: no se escribe.
3. **Preguntar no es firmar.** Lo que dijo en su expediente es lo que dijo, no una firma. A «Lo firmado» solo entra
   lo que confirma en frío, con la fecha en que lo confirmó.
4. **Manda la fuente.** Si una memoria cambia, corriges el retrato; si se contradicen, gana la fuente.
5. **Corto.** Máximo unas 60 líneas (6,000 caracteres): se paga en cada conversación. El detalle va en `user/`,
   `project/` o `feedback/` y aquí queda una línea con su enlace.
6. **No le cites su vida de regreso.** El retrato informa tu criterio; no es material para recitar en cada respuesta.

## Paso 3. Sembrarlo con él (de borrador a suyo)

1. **Avísale una vez, corto:** «Llegó tu expediente y armé un borrador de tu retrato. ¿Lo revisamos? Son 5 minutos.»
   Si dice que ahora no, no insistas en la misma conversación.
2. **Una sección a la vez.** Enséñale lo que dice y pregúntale: «¿esto eres tú?». Corrige con sus palabras, no con las
   tuyas.
3. **Suma tu lectura marcada.** Si ves un patrón en sus respuestas, escríbelo como «(Levy) …» y pregúntale si le
   suena. Si dice que no, se quita.
4. **Lo firmado.** Pregúntale qué sostiene de lo que dijo, empezando por su meta y su fecha. Lo que confirme entra con
   la fecha de hoy.
5. **Hazlo suyo.** Al terminar, quita la primera línea (`<!-- arbrain:retrato borrador … -->`) y la línea
   «_Borrador del…_». Desde ese momento Arbrain ya no lo reescribe.

Cómo sabe Arbrain de quién es el retrato (la propiedad):

| Primera línea | De quién es | Qué hace Arbrain cuando llega su expediente |
|---|---|---|
| `arbrain:retrato pendiente`, sin nada escrito | De Arbrain | Siembra el borrador. |
| `arbrain:retrato pendiente`, con algo ya escrito | Del dueño | Nada: no pisa lo que llenaste. |
| `arbrain:retrato borrador sha256=…`, sin tocar | De Arbrain | Lo rehace si su expediente cambió. |
| `arbrain:retrato borrador sha256=…`, editado | Del dueño | Nada: la huella ya no cuadra. |
| Sin marca | Del dueño | Nada. |

## Paso 4. Mantenerlo vivo

- **Cuando firme, te corrija o cambie su meta:** guarda el detalle con `memory-manager` y actualiza la línea del
  retrato en el mismo turno.
- **Lo superado no se borra de su vida:** se mueve a su archivo de detalle y en el retrato queda solo lo de hoy.
- **Si se acerca a las 60 líneas:** lleva el detalle a su archivo y deja la línea con el enlace. El techo no se sube.

## Verificación

```bash
head -1 .claude/memory/RETRATO.md          # qué marca tiene (pendiente, borrador o ninguna)
wc -c .claude/memory/RETRATO.md            # menos de 6,000
```

Que cada cita exista en una fuente (las recortadas con «…» se comparan sin el final):

```bash
python3 - <<'PY'
import pathlib, re
mem = pathlib.Path('.claude/memory')
fuentes = ' '.join(re.sub(r'\s+', ' ', p.read_text(encoding='utf-8')) for p in mem.rglob('*.md') if p.name != 'RETRATO.md')
retrato = pathlib.Path('.claude/memory/RETRATO.md').read_text(encoding='utf-8')
for c in re.findall(r'«([^»]{8,})»', retrato):
    c = c.rstrip('…').strip()
    print('✓' if c[:60] in fuentes else '✗ sin fuente:', c[:60])
PY
```

En Windows, `py` en lugar de `python3`. Un `✗` en una cita que el dueño te dijo hoy es normal si aún no la guardaste:
guárdala en su archivo de detalle. En la app, **Ajustes › Privacidad** dice cuándo llegó su expediente.

## Si falla

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| Conectó y el retrato sigue «pendiente» | Su expediente no ha llegado | Mira **Ajustes › Privacidad**: el mensaje dice la causa. |
| «arbrain.ai todavía no entrega tu expediente a tu cerebro» | arbrain.ai aún no sirve esa ruta; no es culpa del dueño | Llénalo conversando; si `user/expediente.md` existe, úsalo. Llegará solo cuando arbrain.ai lo entregue. |
| «Todavía no hay expediente en arbrain.ai para traer» | No lo ha llenado | Dile que lo llene en arbrain.ai › Programa › Expediente; llega solo al día siguiente o con «Enviar ahora». |
| «Tu expediente no llegó: rechazado» | Su conexión se revocó | Que toque **Desconectar** y luego **Conectar con arbrain.ai**. |
| El retrato pasó de 6,000 caracteres | Detalle que no va aquí | Llévalo a `user/` o `project/` y deja la línea con su enlace. |
| Una cita no aparece en ninguna fuente | Frase reconstruida o de memoria | Pregúntale si la dijo así. Si no, se quita o se marca «(Levy)». |
| El dueño pegó un token en el chat | Riesgo de que alguien más lo use | Que lo revoque en su perfil de arbrain.ai y conecte con el botón; no lo guardes. |
