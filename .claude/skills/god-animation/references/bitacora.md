# La bitácora · cómo esta skill aprende el gusto de tu dueño

El oficio de esta skill no salió de un libro: salió de anotar cada pieza (qué se pidió, qué salió, qué dijo el dueño) y
de subir a regla solo lo que se repitió. La bitácora es el método; sin ella, cada pieza empieza de cero y los comentarios
se pierden o, peor, se vuelven reglas de golpe.

## Dónde vive (en la capa de tu dueño, nunca dentro de la skill)

```
mi-negocio/animaciones/
├── BITACORA.md        # una entrada por pieza, la más reciente arriba
├── MI-OFICIO.md       # lo que ya se repitió dos veces o tu dueño firmó: su gusto medido
├── galeria.md         # referencias que él trajo (opcional)
├── estilos/           # sus fichas de estilo (opcional, ver estilos.md)
└── <fecha>-<nombre>/  # la carpeta de cada pieza, con nombre neutro
```

Todo esto es suyo: las actualizaciones de Arbrain no lo tocan. Los archivos de la skill sí se actualizan, por eso lo
aprendido de tu dueño no se escribe en ellos. Si la carpeta no existe, créala en la primera pieza.

## Preparar la carpeta (una sola vez)

1. `mi-negocio/animaciones/.gitignore`, para que su repositorio guarde el oficio y el código pero no lo que pesa:
   ```
   .venv/
   */work/
   */build/
   *.mp4
   *.mov
   *.webm
   *.wav
   ```
   Los videos se quedan en su computadora; si quiere respaldarlos, que elija él dónde.
2. El entorno de Python para medir y analizar audio, con su permiso (descarga paquetes):
   `python3 -m venv mi-negocio/animaciones/.venv` y luego `mi-negocio/animaciones/.venv/bin/pip install numpy librosa`
   (en Windows, `python -m venv …` y `…\.venv\Scripts\pip`). Ahí mismo va lo que pida una pieza (por ejemplo un
   transcriptor para alinear una voz narrada palabra por palabra). Nunca en el Python del sistema.
3. Si una pieza deja herramientas que sirven a otras (ver «Devolver al kit» en `video-por-codigo.md`), viven en
   `mi-negocio/animaciones/kit/` con su manual `KIT.md`.

## La entrada

```markdown
## <fecha> · «<nombre de la pieza>» · <duración o tipo>

**Lo que pidió (sus palabras):** «…»
**Prompt exacto:** (el encargo tal cual se mandó al modelo o a los editores)
**Rondas:** cuántas y qué cambió en cada una, con sus medidas (cortes por minuto, sincronía, duración).
**Qué asombró:** lo que funcionó, con evidencia (el cuadro, el segundo, la medida).
**Qué falló:** lo que no, y por qué crees que pasó.
**Lo que dijo:** su juicio, literal.
**Qué palabra funcionó:** la frase del encargo que más rindió, si se notó.
**Para la familia:** forma, motivo, orientación y cierre (si es un video de una serie).
```

## Cómo sube a regla

- **Un comentario se aplica a esa pieza** (su versión 2). No se vuelve regla todavía: un comentario convertido al
  instante en regla alimenta el péndulo (se va al extremo contrario).
- **Sube a `MI-OFICIO.md` cuando se repite en dos piezas o tu dueño lo firma** («así lo quiero siempre»). Cada regla con
  su fecha, sus palabras y, si se puede, su rango de dos lados (por ejemplo «8 a 20 cambios por minuto», no «menos
  cambios»).
- **Un prompt nuevo que rindió** se anota en `MI-OFICIO.md` como palabra que funciona.
- **Lo que eligió como su mejor pieza** se marca en la bitácora como vara: la siguiente se mide contra ella.

## Ejemplo de entrada (inventado)

```markdown
## 2026-12-03 · «Por qué tu cliente no regresa» · explicativo de 6:10

**Lo que pidió:** «hazme un video de por qué los clientes no vuelven, que lo entienda cualquiera»
**Prompt exacto:** plantilla de invocacion.md con el tema, 5 a 7 minutos, voz narrada.
**Rondas:** 3. La v1 duró 8:40 (guion largo: se midió a 13.5 caracteres por segundo y se recortó). La v2 subió la luz
en el teléfono. La v3 cambió el cierre: no aterrizaba en el caso del espectador.
**Qué asombró:** la cubeta con agujeros que se llena mientras habla; se entiende sin audio.
**Qué falló:** 40 % del tiempo en láminas con el mismo acercamiento lento.
**Lo que dijo:** «la cubeta sí, pero se me hizo lento en medio».
**Qué palabra funcionó:** «que lo entienda un niño y no aburra al que lleva 20 años».
**Para la familia:** forma = cubeta que se vacía; motivo = tres notas que se cortan; orientación = contador de clientes;
cierre = la cubeta llena.
```
