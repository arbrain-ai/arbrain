---
name: ideal-funnels
description: "Investiga los embudos de tus competidores y referentes (por dónde entra la gente, qué regalan, qué venden, cómo cobran y cómo hacen que vuelvan) y mantiene tu embudo ideal, el actual y la siguiente mejora, con evidencia fechada. Usar ante «estudia el embudo de X», «cómo vende X», «qué regala X en sus videos», «a dónde manda X a su gente», «compara mi embudo con el de X», «qué le copio a X», «mi embudo ideal», «qué mejoro de mi embudo», «qué hago con lo que vimos de X», «ponme a X en mi panel de estrategia». El contenido de un referente (citas, minutos, su canal a texto) va en intel; tu oferta, en oferta."
metadata:
  resumen: "Estudia cómo venden tus referentes y dice cuál es la siguiente mejora de tu embudo."
---

# Embudos: de lo que hacen otros a la siguiente mejora tuya

Convierte la evidencia de competidores en criterio operativo: **qué hacen → qué mecanismo podría explicar su función →
qué conviene probar en el negocio del dueño → cómo sabremos si sirve.** «Ideal» significa referente para estudiar; no
acredita que su embudo sea óptimo ni que podamos conocer sus resultados internos.

## Índice

| Necesidad | Abrir |
|---|---|
| Investigar un caso nuevo, ampliar uno o comparar evidencia | `references/metodo.md` |
| Armar o leer el expediente de un referente | `references/expediente.md` |
| Recoger evidencia por superficie (YouTube, páginas, comunidades, redes, correo) y el censo de un canal | `references/canales.md` |
| Patrones que suelen repetirse entre embudos y lo que no prueban | `references/patrones.md` |
| El embudo del dueño: ideal, actual, estándares por canal y comparador | `references/nuestro-embudo.md` |
| Poner a un referente en la pestaña Estrategia de su panel | `references/mercado-json.md` |
| Su canal a texto, citas y minutos de un referente | skill `intel` |

## Dónde vive todo

- **Expedientes:** `contenido/intel/embudos/<slug>/` (uno por referente) y `contenido/intel/embudos/PATRONES.md`
  (los patrones propios del dueño). El corpus de video del referente, en `contenido/intel/<slug>/` (skill `intel`).
- **Su embudo actual:** `.claude/memory/project/mi-negocio/embudo.json` (estándar en `arbrain/docs/embudo/README.md`).
- **Su embudo ideal y la bitácora del comparador:** `.claude/memory/project/mi-negocio/embudo-ideal.md`.
- **Resumen de competidores para el panel:** `.claude/memory/project/mi-negocio/mercado.json`.

## Antes de investigar: el contexto del dueño

Lee lo que ya existe: `.claude/memory/project/mi-negocio/` completo (oferta, embudo, embudo ideal, mercado),
`.claude/memory/RETRATO.md` y los expedientes de `contenido/intel/embudos/`. De ahí salen su oferta, su avatar, sus
canales y a quién ya estudió. Si no sabe a quién estudiar, propón de tres a cinco referentes con una línea de por qué
cada uno y que él elija. Lo que diga en esta conversación manda sobre lo escrito.

## Cómo trabajar

1. **La decisión primero.** Identifica qué quiere decidir el dueño. Abre el expediente y su cobertura antes de
   repetir investigación.
2. **Recorridos reales, con bifurcaciones.** Distingue enlace visible, destino abierto, registro completado, material
   recibido y compra comprobada. Una página de venta no prueba todo lo que hay después.
3. **Patrones con método.** Cada patrón conserva quién lo respalda, en qué muestra, qué explicación alternativa existe
   y qué efecto no está medido. Busca el contraejemplo.
4. **Recomendación concreta:** evidencia → adaptación → siguiente acción revisable → señal de resultado, con la ficha
   de propuesta del método. Sigue siendo propuesta hasta que el dueño la adopte.
5. **Al incorporar evidencia nueva,** actualiza el expediente y las comparaciones afectadas con fecha y corrección
   junto al hallazgo; conserva los originales. Si la pregunta exige estado actual, vuelve a abrir la fuente primaria.
6. **Para su embudo,** abre ideal, actual y la bitácora; carga los estándares del canal pertinente. Separa propuesta,
   adopción del dueño, implementación comprobada y resultado medido. Cierra cada revisión con **una** brecha
   prioritaria y una acción verificable.

## Contrato de evidencia

Cinco estados: **observado**, **declarado por el autor**, **inferencia**, **propuesta para el dueño** y
**desconocido**. Un anuncio de ingresos es una declaración observada, no facturación auditada. Un patrón repetido no
demuestra causalidad.

No calcular ingresos desde miembros × precio, ni conversión desde tamaños de grupos, ni horas de trabajo desde fechas
de publicación. No exportar un juicio sobre un competidor a otro. Los análisis viejos también se equivocan: manda el
registro de correcciones de cada expediente.

## Límites

- **Investigar no autoriza actuar.** Comprar, registrarse con los datos del dueño, escribirle a alguien, publicar,
  lanzar una campaña o cambiar su oferta espera su «va» sobre esa acción concreta.
- Lo privado de terceros (miembros, correos, enlaces personales) se queda en `evidencia/` y nunca se usa como
  audiencia del dueño.
- Una vista (HTML, lienzo, lámina) se genera cuando el dueño la pide, con fecha y fuentes; no sustituye al expediente.
- Sus números se leen de su fuente (pagos, analítica, su panel). Falta de dato no es cero: se dice «sin medir» y qué
  lo mediría.
