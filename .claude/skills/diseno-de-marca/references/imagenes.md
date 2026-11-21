# Imágenes de marca: qué medio, qué estilo y cómo pedirla

La llamada al modelo, la llave, la calidad y el registro de costo viven en `image-generation`. Aquí vive el oficio de
marca: decidir qué tipo de pieza hace falta, en qué estilo, y escribir un prompt que no se equivoque.

## 1. Primero el medio (la imagen siente, el movimiento demuestra)

| Si lo que quieres comunicar… | El medio | Dónde |
|---|---|---|
| Es un proceso, una curva o una cantidad que se entiende al **moverse** | Animación o dibujo por código | `presentaciones` (lámina con dibujo) o `code-animation` |
| Se **enseña quieto**: un mecanismo por sus partes, una comparación, un antes y después | Lámina didáctica | Estilo didáctico (abajo) |
| Se **siente**: portada, apertura, cierre, una frase que se queda | Lámina de golpe | Estilo de golpe (abajo) |
| Es un **dato duro** suelto, una tabla de precios, una terminal | Componente en HTML, no imagen | `presentaciones` |

El error más caro no es de estilo: es pedirle a una imagen quieta el trabajo de una demostración en movimiento.

**La pregunta que decide entre didáctica y de golpe:** ¿la imagen tiene **partes que hay que nombrar**? Si sí,
didáctica, con pocas etiquetas grandes. Si no, de golpe: un solo sujeto, mucho espacio, como mucho un título.

## 2. Los estilos de su marca

La mayoría de los dueños necesitan dos estilos, a veces tres. Se definen con él, se prueban y se fijan con una imagen
ancla. Los nombres son suyos; estos son los papeles:

- **Didáctico (claro):** enseña. Fondo claro de su paleta, objetos sólidos con volumen, pocas etiquetas grandes y
  legibles, el color de marca entra por la luz y la sombra. Cada elemento tiene una función.
- **De golpe (oscuro):** hace sentir. Fondo oscuro de su paleta que domina el lienzo, **una sola fuente de luz** de su
  color protagonista bañando solo a lo que importa, todo lo demás en sombra de su color secundario. La frontera entre
  luz y sombra cuenta la historia: decide primero qué recibe la luz (la tesis, lo que gana) y qué queda en sombra (lo
  viejo, lo que se deja). Ese reparto es contenido, no decoración.
- **Dato (opcional):** una tarjeta limpia para un número o una comparación corta. Con moderación: nunca el armazón de
  una presentación.

**Cómo se fija un estilo:** genera dos o tres variantes de la misma escena (con `image-generation`, calidad baja),
enséñalas juntas, él elige. La elegida va a `mi-marca/referencias/estilos/` y sus cláusulas a la sección 8 de
`guia.md`. El estilo viaja por la imagen ancla más que por el prompt: si el estilo evoluciona, actualiza el ancla, o
una referencia vieja seguirá produciendo el estilo viejo aunque el prompt sea perfecto.

## 3. Antes de escribir el prompt

1. **Escribe qué debe entender quien vea la imagen.** Una frase. Si no la puedes escribir, la imagen no sabe qué
   enseñar. Una metáfora que requiere más explicación que el concepto, se cambia.
2. **Elige el héroe.** Un protagonista visual claro, del 40 al 60 % del lienzo; lo demás es escenario. Varios elementos
   iguales compitiendo confunden al modelo.
3. **Lista blanca de textos.** Escribe exactamente qué palabras y cifras van en la imagen. Ninguna fuera de la lista.
4. **Mira cada referencia antes de pasarla.** El nombre del archivo no dice qué contiene: ábrela y descríbela tal cual
   en el prompt («la mascota roja cuadrada de píxeles», no «el logo de X»). Si el prompt contradice la referencia, el
   modelo inventa una mezcla.
5. **De una a tres referencias.** Con más de cinco se confunde y mezcla. Si una pieza necesita muchos logos, pártela en
   dos imágenes o compón los logos encima después.

## 4. Las reglas del prompt (cada una cuesta una regeneración si se olvida)

- **El prompt es puramente visual.** El modelo trata cualquier palabra como candidata a pintarse. Describe objetos,
  nunca conceptos de diseño. Fuera del prompt: valores de color, las palabras marca, firma, logo, estilo, etiqueta,
  rótulo, y los nombres de los estilos. El color se pide como objetos («unas válvulas de cristal verde bosque»,
  «una luz cálida de cobre») o entra por la referencia.
- **No prohíbas enumerando.** Escribir «sin etiquetas, sin flechas, sin símbolos» suele multiplicarlos. Quita la
  cláusula que los pide en vez de añadir una que los niegue.
- **Cada etiqueta una sola vez y en un solo lugar.**
- **Nombres propios exactos, sin traducir:** «son nombres propios y se escriben exactos: X, Y».
- **Sin marco:** «la escena llena todo el lienzo de borde a borde». Las referencias con marco heredan su marco.
- **Idioma:** el prompt completo en el idioma del público y cerrado con «todo el texto visible en [idioma]; formato
  16:9» (o el que toque). Excepción: siglas y nombres que su público usa así.
- **Corto gana.** De cuatro a seis líneas de contenido. Un prompt de doscientas palabras llena la imagen de texto basura.
- **Logos grandes, por referencia, o encima después.** Como protagonistas salen fieles; chicos salen inventados. Un
  logo pequeño se pone sobre la imagen ya generada. Nunca dejes que el modelo invente logos, sellos ni firmas.
- **Palabras que activan filtros:** armas, soldados, cortes anatómicos. Busca una analogía equivalente.

## 5. Revisar antes de entregar

- Todo el texto visible está en su idioma, bien escrito, sin palabras de más.
- El logo, si va, es el aprobado y se ve igual.
- Si sale el dueño, se parece a sus fotos.
- La paleta es la suya; no derivó hacia un prohibido.
- **¿Enseña lo que tenía que enseñar?** El buen aspecto no basta.

Si falla algo de esto, se regenera o se corrige antes de que la vea.

## 6. Un paquete visual (varias imágenes para una clase o un video)

1. Lee el guion o sus notas y elige de 6 a 12 momentos que de verdad necesiten imagen.
2. Para cada uno: medio, estilo, la frase de qué debe entender, el héroe y la lista de textos. Enséñale esa lista en un
   mensaje corto antes de generar.
3. Alterna didáctico y de golpe según el momento; un paquete de un solo estilo se vuelve monótono.
4. Guarda en la carpeta del proyecto: `plan-visual.md`, `prompts/NN-nombre.json`, `generadas/NN-nombre.png` y
   `referencias/` con lo exclusivo de ese proyecto. Lo que se reusa en todos va a `mi-marca/referencias/`.
