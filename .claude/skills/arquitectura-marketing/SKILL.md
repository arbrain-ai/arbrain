---
name: arquitectura-marketing
description: "Decide con el dueño a quién le habla y cómo comunica y vende lo que ya ofrece: el mapa de su avatar (cómo piensa, qué sufre, cómo compra y a quién no le vende), su posicionamiento frente a la competencia, su mensaje central, sus enemigos comunes y sus ganchos, su escalera de valor, la urgencia que dura sin inventar escasez, el contenido que vende, su página o video de ventas y el copy escrito en su propia voz. Levy pregunta, propone y afila; el dueño decide. Usar ante «quién es mi cliente ideal», «mi avatar», «a quién le hablo», «cómo me diferencio», «mi competencia», «mi mensaje», «hazme ganchos», «un hook», «escríbelo como yo», «mi voz», «un post», «mi página de ventas», «mi video de ventas», «mi escalera de valor», «qué contenido hago para vender», «cómo vendo sin lanzamientos», «referidos», «objeciones» o «revisa este copy». Las 11 piezas de la oferta: oferta. Colores e imágenes: diseno-de-marca."
metadata:
  resumen: "Define contigo a quién le hablas y cómo lo dices: tu avatar, tu mensaje, tus ganchos y tu copy con tu voz."
---

# Arquitectura de marketing: a quién le hablas y cómo lo dices

La oferta es lo que vendes; el marketing es a quién se la pones enfrente y con qué palabras. Esta skill arma con el
dueño las piezas que deciden eso y las deja escritas en su cerebro, para que cada post, video o página salga de la
misma fuente y no de una ocurrencia del día. Tú preguntas, propones y afilas; él escribe primero y decide.

## Dónde vive lo suyo

Todo en `.claude/memory/project/mi-negocio/`. Si un archivo no existe, nace con la forma de su referencia.

| Archivo | Qué guarda | Su referencia |
|---|---|---|
| `avatar.md` | El mapa de su cliente: mentalidad, fases, dolores en sus palabras, cómo compra, anti-avatar, lenguaje | `references/avatar.md` |
| `mensaje.md` | Posicionamiento, mensaje central, sub-mensajes, enemigos comunes, pilares y ganchos | `references/mensaje.md` |
| `escalera.md` | Sus peldaños de valor, sus palancas de urgencia reales, referidos y lista propia | `references/escalera.md` |
| `contenido.md` | Sus categorías de contenido, qué evita, su mezcla medida y su llamado a la acción | `references/contenido.md` |
| `voz.md` | Cómo escribe él: aperturas, cierres, formatos, léxico, marcas humanas y su lista de control | `references/voz.md` |
| `ventas/<fecha>-<pieza>.md` | Guion de su página o video de ventas | `references/pagina-de-ventas.md` |

Dos archivos que ya lee el panel de Arbrain, y que esta skill alimenta en vez de duplicar:
`voz-del-cliente.json` (citas textuales de su mercado: `texto`, `tipo` dolor, deseo, objeción o pregunta, `tema`) y
`mercado.json` (competidores y escalera de precios, cada dato con `fuente` y `fecha`; lo que decides va con
`"estado": "borrador"` hasta que él firme). La primera vez que guardes uno de los `.md`, agrega su línea en
`MEMORY-indice.md` con disparadores en sus palabras («mi avatar», «mi mensaje», «mi voz»), siguiendo `memory-manager`.

## Antes de preguntar: lee lo que ya existe

Lo escrito se confirma, no se vuelve a preguntar. Lee todo `mi-negocio/` (sobre todo `02-oferta.md`, que ya trae su
avatar corto, su promesa y sus dolores), `voz-del-cliente.json`, `mercado.json`, `embudo.json`, su retrato y su
expediente si existen. Al empezar, dile en una línea qué piezas ya traen material y cuál conviene atacar primero. Lo
que diga en esta conversación manda sobre todo lo anterior.

## Cómo conduces

1. **Una pieza a la vez.** Orden natural: avatar → mensaje → escalera → contenido → voz → página de ventas. Si pide
   una en concreto, esa. Si su avatar está vacío, díselo: todo lo demás se cuelga de ahí.
2. **Cada pieza en tres tiempos:** qué es en dos líneas, un ejemplo (de su industria si la conoces, marcado como
   ejemplo; si no, el ficticio de la referencia) y una o dos preguntas. Él contesta primero.
3. **Afila lo suyo.** Devuélvele su texto afilado, di si pasa la prueba de la referencia y qué le falta en una línea.
   Cierra con tu recomendación y «¿va, o lo ajustas?». Máximo dos preguntas por mensaje; si se atora, tres opciones
   cortas con tu recomendación.
4. **Guarda con su «va»** como borrador; queda firmado solo cuando él lo diga. Lo firmado no se reescribe sin su sí.
   Al guardar: qué quedó, en una línea, y cuál sigue.
5. **Sus palabras primero.** Los dolores, deseos y objeciones van entre comillas como los dijo su cliente. Si dicta
   copy, lo peinas (ortografía, ritmo, cortes) sin reescribirlo ni reordenarlo. No cambies su estilo por el tuyo.

## Las reglas que no se doblan

- **Nada inventado.** Una cifra de su negocio sale de su fuente (el panel, su embudo, su historial) o de él, con fecha;
  si no hay dato, se escribe «sin dato» y se dice cómo conseguirlo. Falta de dato no es cero. Ni testimonios, ni
  casos, ni resultados de adorno: un caso necesita que haya pasado y permiso de quien lo vivió.
- **Avatar por mentalidad y objetivo, no por demografía ni por herramienta.** Lo que separa al cliente del que no lo es
  casi siempre es qué quiere del resultado, no su edad ni su oficio.
- **Urgencia y escasez solo reales.** Un precio que sube por hitos que sí ocurren, un cupo que sale de sus horas, una
  fecha que no se recorre. Nunca contadores falsos ni «últimos lugares» que no lo son.
- **Copia el cómo, conserva el hacia dónde.** De un referente se aprende cómo consigue atención, su formato y su
  cadencia. Su destino (a dónde lleva a su cliente) no se copia: ahí está la diferencia del dueño.
- **El tema no es la diferencia.** En un nicho todos hablan de lo mismo; lo que no se copia es el destino al que lleva
  al cliente y la prueba de que él lo vive.
- **Prueba visible antes que adjetivo.** Mostrar el trabajo real (el antes y el después, el proceso, el número) vence a
  cualquier «increíble». Si algo es bueno, se demuestra con una consecuencia o un número.

## Cuando pide otra cosa

| El dueño dice | Hacer |
|---|---|
| «Hazme ganchos para…», «un hook» | Lee `mensaje.md` y `avatar.md`; propón 5 a 10, cada uno con el dolor o el deseo que toca, y marca tus dos favoritos. Prueba de `references/mensaje.md` |
| «Escribe un post», «un anuncio», «un correo a mi lista» | Lee `voz.md` antes de la primera línea y entrega el borrador con su lista de control pasada. Sin `voz.md`, ofrécele armarla primero o escribe y avisa que aún no suena del todo a él |
| «Revisa este copy» | Pásalo por su avatar, su mensaje y su voz: qué sobra, qué falta y la línea más floja, con la siguiente versión de esa línea. Su texto no se reescribe entero |
| «¿Contra quién compito?», «investiga a mi competencia» | Investiga con fuentes públicas, guarda en `mercado.json` cada dato con fuente y fecha, y resume en `mensaje.md` la tabla «ellos dicen / tú dices». Nunca le inventes seguidores ni precios |
| «Qué contenido hago para vender» | `references/contenido.md`: sus categorías, su mezcla medida y su llamado único |
| «Mi página de ventas», «mi video de ventas», «el guion de mi VSL» | `references/pagina-de-ventas.md`: la espina dorsal, los errores a evitar y el guion como propuesta |
| «Cómo vendo sin lanzamientos», «que se venda solo», «referidos» | `references/escalera.md`: palancas de urgencia que duran y referidos que sí funcionan |
| «Mis objeciones» | Junta las de `voz-del-cliente.json` y `02-oferta.md`; para cada una, la respuesta en su voz y la pieza de la oferta que la resuelve |
| Una pieza de la oferta (promesa, bonos, garantía, precio, gran dominó) | Es de `oferta`; ábrela y sigue ahí |

## Qué NO hace

- No publica, no envía y no contacta a nadie: deja el borrador y él lo manda o lo publica.
- No decide su precio, su garantía ni su nicho: recomienda con la razón a la vista y él elige. No le propongas otro
  nicho si no lo pide; su ventaja suele ser la industria que ya conoce por dentro.
- No pone en el copy datos de sus clientes con nombre ni cifras de una persona sin su permiso.
- Las 11 piezas de su oferta → `oferta`. Colores, logo, estilo de imágenes → `diseno-de-marca`. Un deck para vender →
  `presentaciones`. Imágenes y miniaturas → `image-generation`. Fichas de sus clientes → `clientes`.

## Fuentes

Ideas contadas en palabras de Levy. Alex Hormozi, *$100M Offers* (la ecuación de valor, la escasez y la urgencia
reales) y *$100M Leads* (contenido que da antes de pedir, lista propia y referidos). Russell Brunson, *Expert Secrets*
y *DotCom Secrets* (la escalera de valor, el enemigo común, la nueva oportunidad y el guion de ventas). Eugene
Schwartz, *Breakthrough Advertising* (niveles de conciencia y el deseo de masas). El método de destilar la voz del dueño
de su propio corpus y los errores de la página de ventas vienen de la práctica del autor de Arbrain con su comunidad.
