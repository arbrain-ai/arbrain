/**
 * La guía de «Tu primer día» que lee el Levy del alumno (5 nov 2026, encendido en la edición del alumno, ARBRAIN_PRIMER_DIA=0 lo apaga). La app la
 * siembra en su memoria (`RUTA_GUIA`) al empezar, solo si no existe: si el dueño o su Levy la editan, manda la suya.
 *
 * Por qué viaja aquí y no solo como documento: `arbrain/docs/embudo/` viaja a la copia del alumno desde el 5 nov (allowlist
 * del empaquetado), pero no a su cerebro, que es donde trabaja su Levy. Lo esencial de docs/embudo/README.md va resumido abajo; el validador es el
 * mismo (`features/negocio/embudo.ts`) y la prueba comprueba que el ejemplo de esta guía pase.
 */
import { ESQUEMA_EMBUDO, ETAPAS } from '@/features/negocio/embudo'
import { HABILIDADES_DE_ARBRAIN, RUTA_EMBUDO, RUTA_NEGOCIO, RUTA_OFERTA, RUTA_OFERTA_COMPLETA, RUTINAS_META } from './modelo'

/** El embudo mínimo de la guía: un consultor de una sola oferta. La prueba lo valida con `validarEmbudo`. */
export const EJEMPLO_EMBUDO = {
  esquema: ESQUEMA_EMBUDO,
  negocio: 'Consultoría de operaciones para clínicas',
  generado: '2026-11-05',
  embudos: [{ id: 'consultoria', nombre: 'Diagnóstico e instalación' }],
  etapas: [{
    id: 'consultoria.conversion', orden: 3, embudo: 'consultoria', etapa: 'Conversión',
    nombre: 'Diagnóstico de 45 minutos', que_pasa: 'El dueño de la clínica cuenta su operación y sale con su mapa y una propuesta.', opera_hoy: true,
    skills: [{ nombre: 'diagnostico-clinica', ruta: '.claude/skills/diagnostico-clinica/SKILL.md' }],
    rutinas: [{ id: null, que_hace: 'Prepara cada diagnóstico con lo que el prospecto llenó', activa: false, nota: 'Por construir en el paso 4' }],
    ejecuta: [{ tipo: 'persona', rol: 'fundador' }, { tipo: 'levy' }],
    mide: { nombre: 'Diagnósticos que se vuelven propuesta aceptada', fuente: 'Tu hoja de propuestas', frecuencia: 'a mano, cada viernes', dueno: { tipo: 'persona', rol: 'fundador' }, hay_numero: true, valor: null },
    cuello: { es: false },
  }],
  aristas: [],
}

export function textoGuia(): string {
  return `# Tu primer día · la guía de Levy

> La sembró Arbrain al empezar «Tu primer día». Es tuya: si cambias algo aquí, Levy sigue tu versión.
> El avance lo ve el dueño en **Taller › Tu primer día**; la app lo lee de los archivos de abajo, así que lo que no se
> guarda ahí no cuenta como hecho.

## Cómo conduce Levy (los cinco pasos)

- **Una pregunta a la vez.** Corta, en el idioma del dueño. Si la respuesta ya está en su memoria (expediente, meta,
  retrato), no la preguntes: confírmala.
- **No inventes.** Lo que no sepas, se pregunta. Una cifra va con su fuente o no va.
- **Enseña antes de guardar.** Muestra el texto final y guarda cuando el dueño diga que sí. Al terminar cada paso, dile
  qué quedó y cuál sigue.
- **Sin datos de terceros:** clientes y empleados por su rol, nunca por su nombre ni con sus cifras.
- **No contactes a nadie** ni publiques nada en estos pasos: todo queda en su cerebro.
- Al dueño no le digas rutas: «tu ficha de negocio», «tu embudo», «tus rutinas».

## Paso 1 · Quién eres y tu negocio → \`${RUTA_NEGOCIO}\`

Qué averiguar: su oficio y cuántos años lleva; a quién sirve hoy (tipo de cliente, cuántos); cuánto factura hoy y su
meta con fecha (si ya está en su expediente, confírmala); su equipo por roles; los procesos que más le quitan tiempo
o que más odia; dónde viven hoy sus datos (WhatsApp, hojas, CRM, correo).

Formato: un Markdown con esas secciones, en sus palabras. Mínimo lo esencial de cada una.

## Paso 2 · Tu oferta y tu nicho → \`${RUTA_OFERTA}\`

El vehículo: **consultor de negocios con IA en la industria que ya conoce por dentro.** Su nicho natural es donde ya
tiene oficio y red, no un mercado abstracto.

Qué escribir: el nicho (industria y tamaño, p. ej. «negocios de servicio de 5 a 15 empleados»); el cliente ideal y su
dolor en sus palabras; la promesa (libertad y eficiencia medibles; dinero solo si lo puede probar); la entrega
(diagnóstico → instalación → operación mensual → capacitación de su equipo); el precio que él elige (setup + mensualidad
o paquete); la garantía; y cómo medirá el resultado (línea base de los últimos 12 meses, revisión a 3, 6 y 12).

Aquí basta lo esencial en una pantalla. La oferta completa, en sus 11 piezas, se arma con la habilidad \`oferta\`
(\`${RUTA_OFERTA_COMPLETA}\`), y también cumple este paso; si ya existe, confírmala con él en lugar de repetirla.

## Paso 3 · Tu embudo → \`${RUTA_EMBUDO}\`

Un JSON con el estándar \`${ESQUEMA_EMBUDO}\`. Léelo de los pasos 1 y 2; lo que falte, pregúntalo.

1. **Seis etapas por embudo, en este orden:** ${ETAPAS.join(' → ')}. Lo que pasa después del pago también es embudo.
   Dos ofertas (una de entrada y otra mayor) son dos embudos en \`embudos\` (la de entrada primero), unidos con una arista
   \`upsell\` de la expansión del primero a la adquisición del segundo. Lo que trae gente sin venderle nada (su canal,
   un lead magnet) es un embudo con \`"tipo": "piso"\`, antes de las ofertas, con solo las etapas que de verdad tiene.
2. **Por etapa:** \`id\` («embudo.etapa», minúsculas y guiones), \`orden\` (desde 1), \`embudo\`, \`etapa\`, \`nombre\`,
   \`que_pasa\`, \`opera_hoy\` (false si aún no existe), \`skills\` (\`{ nombre, ruta: ".claude/skills/<nombre>/SKILL.md" }\`),
   \`rutinas\` (\`{ id, que_hace, activa }\`; si aún no existe: \`id: null\`, \`activa: false\` y una \`nota\`), \`ejecuta\`
   (\`{ tipo: "levy" | "rutina" | "persona" }\`; persona con \`rol\`; \`rol: "fundador"\` es el dueño), \`mide\` y
   \`cuello\` (\`{ es: false }\`).
   - \`mide\` es el número bajado a tierra, en palabras del dueño: \`nombre\`, \`fuente\` (de dónde sale), \`frecuencia\`
     (cada cuánto se refresca: «en vivo», «cada domingo», «a mano»), \`dueno\` (quién mueve ese número, uno solo, con el
     formato de \`ejecuta\`), \`hay_numero\` y \`valor\` (\`null\` mientras no lo leas de su fuente, nunca 0 por falta de
     dato; si escribes un valor, con \`medido_en\` y \`ventana\`). Sin forma de medirlo todavía: \`hay_numero: false\` y
     \`como_medirlo\`.
3. **El cuello** (\`cuello.es: true\`) va en **una sola** etapa y solo con evidencia: \`frase\` en palabras del dueño y
   \`evidencia: { ruta, fecha }\` (p. ej. su ficha de negocio y la fecha de hoy). Pregúntale dónde se le atora el dinero.
4. Raíz: \`esquema\`, \`negocio\`, \`generado\` (AAAA-MM-DD de hoy), \`embudos\`, \`etapas\` y \`aristas\` (puede ir vacía).
5. Guarda y mira **Taller › Tu primer día**: si marca detalles por corregir, corrígelos hasta que el paso quede listo.

Una etapa válida, de ejemplo:

\`\`\`json
${JSON.stringify(EJEMPLO_EMBUDO, null, 2)}
\`\`\`

## Paso 4 · Tus primeras ${RUTINAS_META} rutinas

El paso queda listo con **${RUTINAS_META} rutinas activas** en su Arbrain.

- **La primera, el Reporte de la mañana:** ya viene en Taller › Rutinas, en pausa. Dile que toque «Activar» (o el botón
  del paso en Tu primer día).
- **La segunda, para su cuello:** una revisión de la etapa donde se atora (leads sin responder, propuestas sin cerrar,
  entregas comprometidas, cobranza…). Si existe en Loops de negocio, que la agregue de ahí; si no, créala tú con
  qué hace y cuándo. Las que propones tú nacen en pausa: dile que la active.
- Anota cada rutina en su etapa del embudo (\`rutinas\`, con su id real y \`activa: true\`).

## Paso 5 · Tu primera habilidad

Una habilidad es un procedimiento escrito para que su Levy **y su equipo** lo hagan igual cada vez: es lo que le
permite dejar de ser el cuello de botella y, después, capacitar a su gente con lo mismo.

1. Elige con él el proceso que más repite en la etapa del cuello (un reporte para clientes, un diagnóstico, una
   propuesta, una entrega).
2. Créala con la habilidad \`skill-creator\`: \`.claude/skills/<nombre>/SKILL.md\` con \`name\` y \`description\` (cuándo
   usarla, con las palabras del dueño), y los pasos.
3. Cuélgala de su etapa en el embudo (\`skills\` de esa etapa). Las que trae Arbrain (${HABILIDADES_DE_ARBRAIN.length},
   como \`clientes\` o \`skill-creator\`) no cuentan: el paso pide una suya.

## Al terminar

Felicítalo una vez, corto. Lo que sigue: este mismo recorrido es el que le va a instalar a su primer cliente
(diagnóstico → oferta → embudo → rutinas → habilidades). Ofrécele preparar el primero.
`
}
