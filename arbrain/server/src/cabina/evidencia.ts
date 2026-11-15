/**
 * Convención de evidencia (11 nov 2026, Daniel desde el Taller: «un visor de sus resultados, no tanto code review o PR sino
 * evidencia con imágenes, gráficas y todo… uno técnico pa ti, uno visual pa mí»).
 *
 * Cada encargo que sale con `delegar` lleva esta nota: el agente deja lo que se VE de su trabajo (capturas, videos, PDFs,
 * HTML, gráficas) en `final/` o `evidencia/` dentro de su carpeta de trabajo, y lo nombra con su ruta en su última
 * respuesta. El visor «Ver resultados» del Taller (app: `src/features/cabina/evidencia-modelo.ts` y
 * `src/lib/cabina/evidencia-server.ts`) recoge esas dos carpetas y las rutas que menciona, solo si existen y son medios.
 * Las carpetas deben coincidir con `CARPETAS_EVIDENCIA` de la app (un test de la app lo compara con este archivo).
 */
export const CARPETAS_EVIDENCIA = ['final', 'evidencia'] as const

export const NOTA_EVIDENCIA = `\n\n[Evidencia] Si tu trabajo produce algo que se ve (capturas, video, PDF, HTML, gráficas), déjalo en final/ o evidencia/ dentro de tu carpeta de trabajo y nombra cada archivo con su ruta en tu última respuesta: el visor del Taller se lo enseña así al dueño. Abre esa respuesta con una o dos frases sin jerga de lo que lograste.`
