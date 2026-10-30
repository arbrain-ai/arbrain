// Tres agentes, un cerebro (4 oct 2026, pedido de Daniel: «quiero hablar contigo, con Trinity, con
// Sensei… solo es cambiar entre clics y hablar con un distinto agente»).
//
// Son CARAS del mismo cerebro, no sistemas separados: misma conversación, misma memoria, mismo motor
// y mismas herramientas. Cada agente cambia tres cosas: su avatar 3D, su voz y su enfoque. El enfoque
// viaja por el mecanismo que el chat ya tiene para contexto por turno (`context` de sendMessage →
// `[Context: …]` antepuesto al prompt en arbrain/server/chat-runtime/chat-job.js). Sin cambios en el servidor.
//
// Gabinete firmado el 28 ago: Levy estrategia/YouTube, Trinity Gmail/Calendario/Drive/Casa, Sensei código.
// Avatares: paquetes del estudio (unified-v6/public/models): Levy 3.2.2, Trinity 0.7.0o, Sensei 3.0.0-t;
// los tres con esqueleto Mixamo, 52 ARKit + visemas, mismo animador (Levy3D).

import type { Levy3DLook } from '@/features/chat/components/Levy3D'

export type AgenteId = 'levy' | 'trinity' | 'sensei'

export interface AgenteLive {
  id: AgenteId
  nombre: string
  /** Una frase de qué lleva, para el tooltip del selector. */
  rol: string
  modelo: string
  retrato: string
  look: Levy3DLook
  /**
   * PUNTO DE CONEXIÓN DE LA VOZ. La voz por agente la resuelve quien haga la voz; aquí solo va el id con
   * el que debe pedirla (`/api/live/speech`). Hoy los tres comparten la voz de Levy hasta que exista la
   * API de voz por agente: quien la implemente lee `agenteActivo()` (agent-state.ts) o recibe este id.
   */
  voz: AgenteId
  /** Enfoque que se antepone al turno. Vacío = Levy, sin cambios respecto a hoy. */
  enfoque: string
  /** Frase de saludo en reposo, solo para accesibilidad. */
  saludo: string
}

export const AGENTES: Record<AgenteId, AgenteLive> = {
  levy: {
    id: 'levy', nombre: 'Levy', rol: 'Estrategia y YouTube',
    modelo: '/levy-3d/levy-v3-2-2-n34.glb', retrato: '/levy-face/assets/levy.webp',
    look: { paint: 0.78, hideLipStrips: true, lit: 0.6, stage: 'violeta', restClose: 0.6, jaw: 0.55, vis: 0.6, browInner: 1, browOuter: 0, lipPart: 0.9, lipUpper: 0, vowels: ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_aa', 'viseme_E'], rest: { eyeBlink: 0.12 }, blinkEvery: [1.8, 3.8], gestures: { endSmile: 0.2, emphasisBrow: 0.3 }, oral: { color: [0, 0, 0], emissive: [0.03, 0.008, 0.06] }, jawCurve: { gate: 0.08, gain: 0.48, max: 0.36, attack: 50, release: 12 }, blinkSnap: 1.6, sway: 0.4, smoothNod: true, eyes: { follow: 0.12, saccade: 0.05 }, breathe: { shoulders: 0.07, chest: 0.006 } }, voz: 'levy', enfoque: '', saludo: 'Aquí contigo',
  },
  trinity: {
    id: 'trinity', nombre: 'Trinity', rol: 'Gmail, Calendario, Drive y Casa',
    // Noche del 4 oct (docs/agents/levy-presencia-noche-2026-10-04/trinity-3d): cara amable redibujada con Sunburst
    // y re-proyectada (cejas suaves, sin ojeras rojas ni esquirlas en la boca), interior de boca rosa oscuro en vez
    // de la textura de rayas que se leía como dientes, escenario violeta del retrato y boca que abre poco.
    // iter-02: cuello y hombros redibujados (sin costura ni collar estirado), comisuras rosa-labio, halo morado-magenta
    // y filos rosa como su retrato, boca que abre poco y cierra en las pausas.
    modelo: '/agentes-3d/trinity-v0-7-0o-n32.glb', retrato: '/agentes-3d/trinity.jpg',
    look: { paint: 0.95, lit: 0.35, stage: 'violeta', hideLipStrips: true, jaw: 0.35, vis: 0.4, trackEnergy: { lead: 0.025 }, gestures: { endSmile: 0.18, emphasisBrow: 0 }, jawCurve: { gate: 0.55, gain: 0.8, max: 0.23, attack: 50, release: 40 }, // iter-20: modo sílaba (cierra en los valles aunque el nivel venga saturado)
      halo: [[0, 'rgba(100,16,175,1)'], [0.32, 'rgba(66,10,118,0.9)'], [0.55, 'rgba(30,6,56,0.75)'], [0.8, 'rgba(8,2,16,0.4)'], [1, 'rgba(1,1,4,0)']], rimColor: 0xff4fb8,
      // iter-06: filo rosa en los bordes (cuello, mandíbula, orejas) como la luz del retrato y sonrisa de reposo serena.
      fresnel: { color: 0xff4fb8, k: 0.8, p: 5 }, rest: { mouthSmile: 0.14, speakSmile: 0.16, eyeWide: 0, eyeSquint: 0.2, eyeBlink: 0.1, cheekSquint: 0.2 }, // iter-15: mirada cálida, párpado sereno
      // iter-07: cabeceo suave al hablar (con ±0.05 rad asomaban por huecos de la malla de la boca trozos del cuello azul).
      // iter-09: boca re-mallada (labios limpios con ranura e interior rosa oscuro): abre hasta 0.35 sin romperse.
      // iter-12: mirada viva (los ojos adelantan a la cabeza y hacen microsacadas), como Levy.
      // iter-13: interior de boca con degradado (oscuro al fondo, rosa junto a los labios), apertura tope 0.30, filo más suave y parpadeo de 200 ms.
      smoothNod: true, eyes: { follow: 0.12, saccade: 0.05 }, vowels: ['viseme_aa', 'viseme_E', 'viseme_O', 'viseme_I', 'viseme_aa', 'viseme_E'], lipPart: 0.9, lipUpper: 0, blinkMs: 95, blinkSnap: 2.2, blinkSquash: 0.9 }, voz: 'trinity',
    enfoque: 'Esta conversación la atiende ahora Trinity, otra cara del mismo cerebro de Levy: misma memoria, mismas herramientas y mismas reglas. Su enfoque es Gmail, Calendario, Drive y la Casa: agenda, correo, archivos y lo doméstico. Responde como Trinity, elegante, curiosa y precisa, en primera persona. Si el pedido es de estrategia o YouTube, resuélvelo igual con el mismo criterio; no rechaces nada por no ser tu área.',
    saludo: 'Trinity, a tus órdenes',
  },
  sensei: {
    id: 'sensei', nombre: 'Sensei', rol: 'Código',
    // Noche del 4 oct (docs/agents/levy-presencia-noche-2026-10-04/sensei-3d): escenario violeta del retrato,
    // piel mate (sin brillo morado), interior de boca oscuro, apertura contenida al hablar y mirada firme;
    // n02: armadura de cuello y hombros limpia (Sunburst sobre el render frontal) y collar sin dientes de sierra;
    // n03: piel de cara y cráneo satinada y hombros exteriores limpios; mirada más calma; boca que separa los labios
    // (lipPart) en vez de bajar la mandíbula en óvalo; n04: esclera oscura con limbo (sin blanco brillante) e iris 12 % mayor; n05: párpados y comisuras limpios;
    // n06: cejas relajadas casi horizontales (sin ceño en V), sin media sonrisa al hablar; n07: traje del cuello liso
    // con la línea violeta, menos brillo plástico y ojos almendrados; n08: trapecios y hombreras
    // limpios (re-proyectados desde arriba); n09: costados del cráneo, sienes y cuello lateral limpios;
    // n10: acabado de la cara como el retrato (grabado fino, grano metálico) con cejas calmas; n11: el mismo acabado en placas y cuello;
    // n12: iris mayor y menos emisivo; boca recta en reposo (sin comisuras caídas) y cabeza que sigue poco al puntero;
    // n13: cabeza 6 % más ancha (proporción del retrato) y sin el «doble cráneo» pintado en ¾;
    // n14: la boca se abre al centro con las comisuras casi cerradas (morphs atenuados hacia las comisuras);
    // n15: sienes y mandíbula limpias y sin el «ojo fantasma» horneado en la sien derecha;
    // n16: vuelve la boca de n13 (la atenuación de comisuras se leía como óvalo) con el interior de los labios
    // oscurecido (sin «labio doble» al hablar); cejas algo más abiertas; n17: iris menos emisivo y cuello más ancho. Gestos de n13
    // (panel 8: 35.2 contra 27.5 sin restClose, que aquí también limita la apertura y evita el óvalo);
    // n18: iris redibujado con el ojo del retrato como referencia (fibras, anillo limbal). Juez 22:57: rendija
    // horizontal y pequeña (jaw .13, lipPart .8) y más vida: parpadeo decidido y ojos con microsacadas; n19: el labio
    // superior apenas sube (morph ×0.35), interior ámbar oscuro, párpado que deja ver el iris completo;
    // n20: hombros y deltoides limpios (re-proyectados desde ¾ elevado); n21: cuello con los
    // paneles verticales segmentados del retrato y su línea violeta; n22: cuello 10 % más corto. Encuadre de siempre:
    // el cerrado (2.6 H, como el retrato) perdió 34.0 contra 32.0 en el panel ciego.
    // n24 = n20 (iter-24/25): el panel ciego prefirió sus labios y su cuello liso a los de n21-n23 (34.0 contra 29.7).
    // Ojos del ciclo 02 del juez: párpado a media altura sin ceja alzada.
    // paint .86: la cara medía L 53 / croma 66 contra 47 / 60 del retrato. n25: huesos de ojo 3° arriba
    // (con el párpado a media altura la mirada se leía «hacia abajo»). n26: deltoides y trapecios limpios; n27: sin el
    // pico de la silueta del hombro (corte de 8 mm entre trapecio y hombrera, rellenado y suavizado).
    // Juez 00:28 (32): boca legible por sílaba (jawCurve, tope .16 para no redondear) y menos puchero (restClose .15);
    // n28: visemas O y U ×0.4 (fruncían los labios en una «o»). Labio superior fijo: abre bajando el inferior.
    // n29: interior de boca cálido y oscuro (sin especular: las luces violetas se reflejaban). Boca guiada por el nivel como Levy
    // (juez 00:41: corr .68) con tope .14: el panel castiga cualquier apertura mayor («óvalo, pez»).
    // Juez 01:58: labios juntos en silencio (restClose .25 cierra la ranura) y más rango entre vocal y cierre (umbral .15).
    // Un solo visema (aa): la apertura sale solo del nivel de la voz (juez 02:43: los visemas rotando la
    // desacoplaban). Respuesta rápida en ambos sentidos. Tope .19: .22 ya hace óvalo en el pico; .17 se pierde en el cabeceo. n30: interior en sombra cálida neutra. n31: labios en el tono de la piel, sin borde claro tipo cinta.
    // iter-53: revertidos iter-49/51/52 (juez 04:14: 31, «abrir ancho deja ver la cavidad: vuelve la boquita»). En esta malla
    // la legibilidad no sale de abrir más. Quedan de esa tanda el parpadeo [1.8, 3.8] y n33.
    // iter-65: revertido iter-64 (rotar vocales baja la sincronía: v2 .55/.49 contra .69/.67); solo «aa».
    // iter-64: con la lente de la malla las vocales aa/E/I varían sin óvalo (`iter-64/vocales.jpg`): rotan otra vez (sin O/U).
    // iter-63 · n38 = n36: revertidos interior claro y lipUpper .6 (sustitutos 32/34: la abertura se lee menos y el labio inferior hace pico); queda headFollow .7.
    // iter-62 · n37 (juez sustituto 34/34): el labio superior también se separa (lipUpper .6), interior algo menos negro, cabeza sigue más la mirada (.7).
    // iter-61: tope .32 (la malla mantiene la lente hasta ~.38 en el arnés: `iter-61/rango.jpg`); el juez pedía que la boca se lea más.
    // iter-60 · n36: cejas como planos tallados rectos y línea de pestaña (retoque con el retrato de referencia): presencia.
    // iter-59: respiración visible (hombros ~5 px al inhalar, pecho), campo `breathe` nuevo y opcional: vida 6 toda la noche.
    // iter-58 · n35: el labio inferior retiene .6 al centro y .95 en las comisuras: abre en lente, no en ranura rectangular (juez 06:52).
    // iter-57 · n34 (malla): labios con volumen (+2 mm) y el margen del labio inferior retiene 80 % en jawOpen/mouthLowerDown:
    // la mandíbula baja y los labios hacen la forma, la cavidad ya no se destapa; por eso vuelve rango (tope .26, lipPart .55).
    // iter-56 (juez 05:47, 33: «aún cae el labio inferior en picos»): lipPart .3 y tope .17 (el labio inferior baja también con la mandíbula).
    // iter-55 (juez 05:01, 33): labio inferior baja menos (lipPart .55); gestos de Levy 3D en versión serena (microsonrisa .1, ceja .2).
    // iter-54 (juez 04:14: «legibilidad con el cierre en consonantes»): modo sílaba, misma rendija (tope .19); cierra en los valles.
    // iter-49 (cambio de método, receta de Levy 3D, que subió labios 5→8 abriendo más): tope .28 con su envolvente;
    // vocales E e I (en esta malla «aa» alto es óvalo redondo, E abre ancho; iter-51 quita «aa»), sin O/U; parpadeo [1.8, 3.8] cae en el reposo del juez.
    // n33: el morph mouthClose sin su componente hacia adelante: labios juntos sin puchero y con línea de labio fina.
    // n32: iris al 85 % con esclera cálida visible (como el retrato) y párpado en reposo .15 (con .25 «roza lo adormilado»). Parpadeo cada 2-4.5 s.
    modelo: '/agentes-3d/sensei-v3t-n38.glb', retrato: '/agentes-3d/sensei.jpg',
    look: { paint: 0.86, lit: 0.2, stage: 'violeta', hideLipStrips: true, jaw: 0.13, vis: 0.22, lipPart: 0.55, lipUpper: 0.3, restClose: 0.25, jawCurve: { gate: 0.1, gain: 0.85, max: 0.32, syllable: 0.75, attack: 60, release: 25 }, vowels: ['viseme_aa'], blinkEvery: [1.8, 3.8], gestures: { endSmile: 0.1, emphasisBrow: 0.2 }, breathe: { shoulders: 0.015, chest: 0.006 }, smoothNod: true, sway: 0.45, headFollow: 0.7, blinkMs: 200, blinkSnap: 1.6, eyes: { follow: 0.12, saccade: 0.05 }, browInner: 0, browOuter: 0,
      rest: { mouthSmile: 0.15, mouthPress: 0, speakSmile: 0.08, eyeSquint: 0.45, eyeBlink: 0.15, eyeWide: 0, browDown: 0 } }, voz: 'sensei',
    enfoque: 'Esta conversación la atiende ahora Sensei, otra cara del mismo cerebro de Levy: misma memoria, mismas herramientas y mismas reglas. Su enfoque es el código: repos, GitHub, cloud agents, depuración y arquitectura. Responde como Sensei, sereno, exigente y breve, en primera persona. Si el pedido es de otra área, resuélvelo igual con el mismo criterio; no rechaces nada por no ser tu área.',
    saludo: 'Sensei, listo',
  },
}

export const ORDEN_AGENTES: AgenteId[] = ['levy', 'trinity', 'sensei']

export function esAgenteId(v: unknown): v is AgenteId {
  return v === 'levy' || v === 'trinity' || v === 'sensei'
}

/** Contexto por turno del agente (undefined para Levy: su turno queda idéntico al de siempre). */
export function contextoDeAgente(id: AgenteId): string | undefined {
  return AGENTES[id].enfoque || undefined
}
