// Segundo Cerebro — construcción del prompt de síntesis.
// El artefacto se genera con la infra que ya existe (claudeclaw / claude CLI),
// aterrizado EXCLUSIVAMENTE en los nodos del slice. El grafo es el mapa;
// esto produce el destino: un artefacto accionable.
import type { SynthesisMode } from '../types'
import { NOMBRE_DUENO } from '@/config'

interface SliceDoc {
  id: string
  title: string
  content: string
}

const MODE_SPECS: Record<SynthesisMode, { label: string; spec: string }> = {
  brief: {
    label: 'Brief de decisión',
    spec: `un BRIEF DE DECISIÓN en markdown con esta estructura exacta:
## Contexto — 3-5 bullets con lo esencial
## La decisión — qué se está decidiendo realmente (una frase)
## Opciones — tabla corta (opción | a favor | en contra)
## Recomendación — UNA, clara, con el porqué anclado al material
## Riesgos — qué podría salir mal y cómo se detecta
## Siguiente acción — 1-3 pasos concretos ejecutables esta semana`,
  },
  simple: {
    label: 'Explicado simple (HTML)',
    spec: `un documento HTML COMPLETO y self-contained (empieza con <!doctype html>) que explique este material de forma que un principiante lo entienda: analogías simples, secciones cortas, glosario si hace falta, y al final una sección "¿Y ahora qué?" con acciones concretas.
Estilos inline en un <style>: fondo #09090b, texto #f7f8f8, tipografía Montserrat con fallback sans-serif, acentos #8B5CF6 (morado) y #ff9101 (oro), cards con border 1px #2a2a30 y border-radius 16px, max-width 760px centrado, padding generoso. CERO librerías o recursos externos.
Responde SOLO el HTML, sin markdown alrededor.`,
  },
  journey: {
    label: 'Journey',
    spec: `una HISTORIA/JOURNEY cronológica en markdown: línea de tiempo con las fechas reales que aparecen en el material, qué cambió en cada etapa y por qué, el arco completo (de dónde venía → dónde está → hacia dónde apunta), y cierra con "Siguiente acción" (1-3 pasos).`,
  },
  contenido: {
    label: 'Ángulo de contenido',
    spec: `un ÁNGULO DE CONTENIDO para el canal de YouTube de ${NOMBRE_DUENO()} (IA/SaaS en español, build in public, avatar: el Arquitecto Ambicioso):
## Título — 3 variantes
## Hook — los primeros 15 segundos, palabra por palabra
## Tesis — la idea central en 2 frases
## Estructura — los beats del video en orden
## Evidencia del cerebro — qué material real respalda cada beat (con fuente)
## CTA y Siguiente acción`,
  },
}

export function buildSynthesisPrompt(
  mode: SynthesisMode,
  question: string,
  docs: SliceDoc[],
): string {
  const { label, spec } = MODE_SPECS[mode]
  const material = docs
    .map((d) => `--- FUENTE: ${d.id} · «${d.title}» ---\n${d.content}`)
    .join('\n\n')

  return `[Síntesis del Segundo Cerebro — ${label}]

Objetivo de ${NOMBRE_DUENO()}: ${question.trim() || '(sin pregunta explícita: sintetiza el slice completo)'}

Genera ${spec}

Reglas duras:
- Usa EXCLUSIVAMENTE el material de abajo (segundo cerebro curado de ${NOMBRE_DUENO()}). Si el material no alcanza para responder algo, dilo explícitamente — NUNCA fabriques datos ni métricas.
- Cita la fuente entre paréntesis cuando uses un dato o decisión: (memory/user/juego-infinito.md).
- Accionable siempre: el artefacto termina en acción, no en contemplación.
- NO uses herramientas ni leas archivos: todo el material necesario ya está aquí. Responde directo.
- Responde SOLO con el artefacto. Sin preámbulo, sin cierre conversacional.

=== MATERIAL (${docs.length} nodos del segundo cerebro) ===

${material}`
}

export function modeLabel(mode: SynthesisMode): string {
  return MODE_SPECS[mode].label
}
