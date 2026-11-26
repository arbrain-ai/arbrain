# Listas: encontrar, calificar, verificar, diagnosticar

> **La lista es la palanca número uno.** Sube o baja la tasa de respuesta más que el texto y más que el canal, y es la
> que casi nadie trabaja porque es menos divertida que escribir. Del oficio: «el volumen es un amplificador; una lista
> mala amplifica el fracaso».

## 1. De dónde salen los negocios

| Fuente | Qué da | Para qué sirve |
|---|---|---|
| **Google Maps** | Nombre, teléfono, sitio, categoría, reseñas, calificación, si tiene o no sitio | La fuente principal para negocio local |
| **El sitio del propio negocio** | Correo de contacto, formulario, quién es el dueño | Enriquecer y diagnosticar |
| **Directorios del gremio** | Listados por sector, colegios profesionales | Nichos profesionales |
| **Fuentes creativas** | Ponentes de un congreso, expositores de una feria, autores de un directorio | Ver §6 |

**Por qué Maps y no una base comprada:**

1. **Intención declarada.** Todo negocio que está ahí quiere que lo encuentren. Una base comprada es gente que nunca
   pidió que la contactaran.
2. **Contesta el dueño.** En negocio local no hay filtro de por medio.
3. **Cobertura.** Los negocios locales casi no están en las bases para empresas.

**La pega:** Maps da correo pocas veces (del orden de 15 a 20%), y suele ser genérico (`hola@`, `contacto@`). Por eso
importa enriquecer desde el sitio.

**Cómo sacarlos sin infraestructura:** con la pantalla (computer use de Arbrain, `arbrain/cerebro/manuales/computer-use.md`)
leyendo resultados de búsqueda y sitios, o con una herramienta de extracción que el dueño elija y pague. Respeta los
términos de cada sitio y no fuerces volumen: en local, una lista de cientos se arma con calma.

## 2. Calificar: el paso que casi nadie da y que duplica la tasa

Sacar 5,000 negocios y escribirles a todos es el error caro. Calificar es descartar a propósito. Por cada negocio,
antes de que entre a la lista:

- ¿Tiene el problema que el dueño resuelve? Evidencia concreta, no supuesto.
- ¿Es de un tamaño donde el dueño decide? En local, menos de unos 50 empleados.
- ¿Puede pagar lo que vale? Si el valor de un cliente suyo es bajo, no hay negocio.
- ¿Está vivo? Reseñas o publicaciones recientes; un negocio muerto no contesta.

Duele: de 1,000 sacados, quedarse con 300 se siente como tirar dinero. Es al revés: los 700 descartados son los que
producen reportes de spam y tumban dominios.

### A quien firma

Escribirle a un gerente tiene dos salidas: lo reenvía y muere en otra bandeja, o lo borra porque no puede firmar. Al
dueño solo le quedan dos: contesta o no. **Se le escribe a quien firma.**

Ojo con las profesiones: médicos, dentistas, abogados o arquitectos dueños de su despacho casi nunca ponen «dueño»;
ponen su título. Filtrar por la palabra «dueño» los deja fuera a todos.

### La mejor señal: quién ya paga por resolverlo

Quien ya invierte en resolver el dolor (anuncia, paga un perfil en un directorio de pago, contrató una agencia) ya
demostró que lo considera un problema con presupuesto. Es el mejor filtro de lista que hay.

## 3. Verificar, antes de enviar, siempre

Un rebote arriba de 5% quema el dominio. Verificar es barato comparado con eso.

```
lista cruda → calificar → verificar solo los que pasaron → enviar
```

Verificar antes de calificar es pagar por validar correos que se van a tirar. Usa un verificador de correos (servicio
de pago, el que el dueño elija) y anota el resultado en el registro. Para teléfonos, WhatsApp dice si un número existe
o no (`mensajes-directos.md` §4).

## 4. Diagnosticar: de dónde sale el mensaje

No es «personalizar» (meter el nombre en una plantilla). Es leer el rastro público del negocio hasta encontrar el hueco
real. Es lo que separa una tasa de 1% de una de 5%.

| Señal | Qué revela |
|---|---|
| Reseñas negativas recientes | El problema que ya sabe que tiene y le duele |
| Su calificación contra la de sus competidores cercanos | Si va perdiendo la plaza |
| Sin sitio, o sitio roto, lento o que no se ve en el teléfono | Hueco obvio y demostrable |
| Última publicación hace meses | Nadie atiende su presencia |
| Sin horarios ni fotos en su ficha | Pierde clientes por algo trivial |

El diagnóstico se guarda en la columna `diagnostico` del registro: alimenta **el mensaje y el regalo**, que salen del
mismo hallazgo. Si el dueño ya usa la skill `radiografia` con sus clientes, la Radiografía es la versión profunda de
esto, para después del «sí».

## 5. La base propia, desde el primer lote

Sin registro propio se toca dos veces al mismo negocio, que es la forma más rápida de que te reporten. La lleva
`scripts/frio.py` en `contacto-en-frio/contactados.csv`, con lo mínimo:

```
negocio · categoria · ciudad · telefono · sitio · correo · verificado
diagnostico · canal · fecha_contacto · estado · resultado · notas
```

Con eso se responde lo único que importa al final: qué tipo de negocio contesta y cuál no. A los 30 días esa tabla vale
más que la lista original.

## 6. Fuentes creativas: la ventaja real

**Si usas la misma fuente que todos, compites con todos en la misma bandeja.** El mejor caso público del oficio: para
un producto que resolvía un problema de ingenieros de video, en vez de las bases de siempre se sacó a quienes
contribuían a los proyectos de código abierto que atacan ese mismo problema. Gente que escribe el código del dolor que
el producto cura. Decenas de oportunidades el primer mes en un nicho considerado imposible, porque nadie más miraba ahí.

La pregunta no es «¿dónde compro la lista?» sino **«¿dónde deja rastro público esta gente que nadie más está
mirando?»**: ponentes de congresos del gremio, quienes anuncian en el periódico local, quienes dejaron reseña en el
competidor, expositores de una feria, autores de un directorio profesional.

## 7. La lista dicta la infraestructura, no al revés

El error común: «compro 10 dominios con 20 buzones cada uno, esa es mi capacidad». La infraestructura se dimensiona por
el mercado servible (la lista calificada y verificada):

```
correos por día = (lista verificada ÷ 90) × 3
```

- **÷ 90** porque a los 90 días un negocio contactado sin respuesta vuelve a ser frío y se puede volver a contactar,
  registrándolo en la base, nunca a ciegas.
- **× 3** por los seguimientos (2 a 3 por prospecto). Sin ese factor la infraestructura se queda corta a mitad de la
  secuencia.
- De ahí salen buzones y dominios: unos 10 a 30 correos por día por buzón, pocos buzones por dominio y un 10% de
  buzones calientes de reserva (los bloqueos pasan; la reserva evita quedarse parado).

**Lo que revela en territorio local:** 100 negocios de un giro en una ciudad ÷ 90 × 3 ≈ 3 correos al día. Un solo
dominio sobra. En nichos locales el juego nunca es volumen: es precisión y regalo. Si la fórmula da un volumen
ridículo, la respuesta no son más buzones: es más lista (otro giro, otra ciudad) o mejor pieza por contacto.
