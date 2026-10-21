# El pizarrón

Donde Levy enseña conversando, en el panel derecho de Arbrain. Oficio que Levy lee al abrir cada sesión:
[OFICIO.md](OFICIO.md).

- `sesiones/<id>/` · una sesión = un registro. `sesion.json` (los pasos de Levy; lo escribe la herramienta `pizarron`
  del MCP cabina), `eventos.jsonl` (lo que la persona tocó, predijo y dijo; lo escribe la app), `fotos/` (sus predicciones
  dibujadas), `imagenes/` (láminas Sunburst en JPG), `voz/` (caché del audio con su alineamiento; fuera de Git, se
  regenera del texto).
- `biblioteca/<objeto>/` · objetos vivos reusables: `objeto.js` (`export default function montar(pz)`) y `ficha.json`
  (qué enseña, parámetros, asas, anclas, métodos, usos).
- `alumnos/<alumno>.md` · lo que cada quien ya domina, por tema. Lo escribe el pizarrón al cerrar; se corrige a mano.

Abrir: pídele a Levy «enséñame…», o «+ › Pizarrón» en el panel (sesiones y biblioteca). Una sesión se guarda en
«+ › Guardadas» con el marcador de su pestaña.

## Pruebas

Toda prueba (agentes, QA) abre con `alumno: "prueba"`: escribe en `alumnos/prueba.md`, nunca en el mapa de tu dueño, y su tema
lleva «· prueba». Sin sonido: Chrome headless con `speechSynthesis` neutralizado y audio en volumen 0 ; la voz del sistema sale por los altavoces aunque Chrome esté
silenciado. Nunca abrir sesiones en la app de la persona mientras la usa.
