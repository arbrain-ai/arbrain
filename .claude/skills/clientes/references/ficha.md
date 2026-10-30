# Plantilla de ficha de cliente

Copia esto a `.claude/memory/project/clientes/<slug>.md` y llénalo con lo que el dueño sabe. Lo que no se sabe se
escribe «sin dato», nunca se inventa. Las secciones de abajo de «Estado» se actualizan con cada contacto. Lo de arriba
cambia poco.

```markdown
# <Nombre> · <empresa o rol>

**Contacto:** <correo> · <teléfono> · **Desde:** AAAA-MM-DD · **Cómo llegó:** <referido, contenido, frío…>

## Quién es
<Su negocio, su industria, tamaño, quién decide. Dos a cuatro líneas.>

## Qué le duele y qué quiere
- Dolor: <en sus palabras, entre «» si es textual>
- Meta: <qué quiere lograr y para cuándo, con número si lo dio>
- Si no lo logra: <qué pierde>

## Oferta y acuerdo
<Qué se le ofreció o vendió, precio, forma de pago, alcance. «sin dato» si aún no hay.>

## Estado
**AAAA-MM-DD:** <prospecto | diagnóstico | propuesta enviada | cliente activo | en pausa | cerrado> · <una línea de dónde va>

## Promesas abiertas
- [ ] Yo: <qué prometió el dueño> · desde AAAA-MM-DD
- [ ] Cliente: <qué prometió el cliente> · desde AAAA-MM-DD

## Espera respuesta de
- <el dueño | el cliente>: <qué> · desde AAAA-MM-DD

## Siguiente paso
<Una acción concreta, con fecha si la hay.>

## Línea de tiempo
<La más reciente arriba. Cada entrada con fecha y fuente.>
- AAAA-MM-DD · <llamada | correo | WhatsApp | nota del dueño> · <qué pasó en una línea>
```

## Línea en `INDICE.md`

```markdown
- `clientes/<slug>.md` · <Nombre> (<empresa>) · <estado> · siguiente: <paso> (AAAA-MM-DD)
```
