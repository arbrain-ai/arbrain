// emotions.js — estados emocionales de Trinity.
//
// TESIS: una emoción no es una POSE, es un ESTADO MENTAL. Por eso cada emoción
// define dos cosas:
//   1. `face`  — hacia dónde tiran los músculos (cejas, párpados, comisuras, cuello)
//   2. `mind`  — cómo cambia su COMPORTAMIENTO involuntario (ritmo de parpadeo,
//                frecuencia de sacadas, cuánto evita la mirada, cuánto respira)
// Un muñeco solo tiene (1). Un ser vivo tiene (2): dudar es mirar a otro lado y
// parpadear más lento, no solo levantar una ceja.
//
// Todo canal se interpola con un RESORTE (masa-amortiguador), nunca con saltos.
// Las cejas usan ζ<1 (sobrepasan un pelín y regresan, como el músculo real);
// el resto usa ζ=1 (crítico, sin rebote).

/** Canales de la cara. 0 = neutral en todos. */
export const CHANNELS = [
  'browL', 'browR',       // levantar ceja por lado          (-1 baja .. 1 sube)
  'furrowL', 'furrowR',   // fruncir extremo interno          (0 .. 1)
  'lidWide',              // abrir ojos (magnifica contenido) (-1 caído .. 1 abierto)
  'lidLowL', 'lidLowR',   // párpado inferior sube (Duchenne) (0 .. 1)
  'smileL', 'smileR',     // comisuras                        (-1 abajo .. 1 arriba)
  'lipPress',             // labios apretados                 (0 .. 1)
  'headTilt',             // inclinación de cabeza (grados)
  'headNod',              // barbilla arriba/abajo (px, + = baja)
  'pupil',                // dilatación                       (-1 .. 1)
  'gazeX', 'gazeY',       // sesgo de mirada del estado (px)
];

// ζ por canal: las cejas rebotan un poco (músculo rápido), lo demás es crítico.
const ZETA = { browL: 0.62, browR: 0.62, smileL: 0.8, smileR: 0.8 };

/**
 * Las emociones. `hz` = velocidad del resorte (más alto = llega más rápido).
 * Nota de dirección: la imagen mira DE FRENTE, así que "L" es el lado izquierdo
 * de la IMAGEN (el ojo derecho de ella). Las asimetrías están escritas en
 * espacio-imagen porque ahí es donde el shader las aplica.
 */
export const EMOTIONS = {
  // NEUTRAL no es simétrico. Ninguna cara real lo es: un lado siempre tira un
  // poco más que el otro. Esa asimetría mínima y permanente es lo que separa
  // "renderizado" de "persona en reposo".
  neutral: {
    hz: 3.2,
    face: { smileL: 0.09, smileR: 0.04, browL: 0.05, browR: 0.0, lipPress: 0.05 },
    mind: { blinkRate: 1, saccadeRate: 1, aversion: 0.18, motion: 1, breathRate: 1, breathDepth: 1, arousal: 0 },
  },

  // ALEGRE: sonrisa de Duchenne (la de verdad). No basta la boca: el párpado
  // INFERIOR sube y la mejilla empuja. Una sonrisa sin ojos se lee como cortesía.
  alegre: {
    hz: 4.0,
    face: {
      smileL: 0.85, smileR: 0.78, lidLowL: 0.52, lidLowR: 0.48,
      browL: 0.22, browR: 0.20, pupil: 0.25, headTilt: -1.1, headNod: -1.6, lipPress: 0.1,
    },
    mind: { blinkRate: 1.25, saccadeRate: 1.2, aversion: 0.12, motion: 1.25, breathRate: 1.12, breathDepth: 1.15, arousal: 0.55 },
  },

  // ÉNFASIS: "esto importa". Cejas arriba fuerte, ojos abiertos, barbilla
  // ligeramente adelante, y sobre todo: parpadea MENOS y se queda quieta.
  // La quietud es la que comunica intensidad.
  enfasis: {
    hz: 6.5,
    face: {
      browL: 0.92, browR: 0.88, lidWide: 0.62, pupil: 0.42,
      headNod: 2.2, smileL: 0.1, smileR: 0.1, lipPress: 0.18,
    },
    mind: { blinkRate: 0.45, saccadeRate: 0.5, aversion: 0.04, motion: 0.55, breathRate: 1.25, breathDepth: 1.3, arousal: 0.9 },
  },

  // DUDA: asimetría pura. Una ceja sube, la otra frunce; media sonrisa torcida;
  // cabeza ladeada; y la mirada se VA (aversión alta) porque pensar es dejar de
  // mirar. Parpadeo lento: la duda es un estado de baja activación.
  duda: {
    hz: 2.4,
    face: {
      browL: 0.78, browR: -0.28, furrowR: 0.6, lidLowR: 0.38, lidWide: -0.12,
      smileL: 0.55, smileR: -0.14, lipPress: 0.22, headTilt: 3.6, pupil: -0.12,
      gazeX: -2.2, gazeY: -1.6,
    },
    mind: { blinkRate: 0.7, saccadeRate: 1.45, aversion: 0.62, motion: 0.9, breathRate: 0.92, breathDepth: 0.95, arousal: 0.3 },
  },

  // — extras que salieron gratis del mismo sistema —

  // CÁLIDA: la cara de escuchar. Sonrisa mínima sostenida + párpado inferior
  // apenas arriba. Es la más difícil de lograr y la que más "presencia" da.
  calida: {
    hz: 2.6,
    face: { smileL: 0.3, smileR: 0.27, lidLowL: 0.22, lidLowR: 0.2, headTilt: -1.8, browL: 0.08, browR: 0.06 },
    mind: { blinkRate: 1.05, saccadeRate: 0.85, aversion: 0.1, motion: 0.85, breathRate: 0.95, breathDepth: 1.05, arousal: 0.2 },
  },

  // FOCO: concentración. Ceño junto, ojos entrecerrados, cero movimiento.
  foco: {
    hz: 3.6,
    face: { furrowL: 0.6, furrowR: 0.62, browL: -0.2, browR: -0.22, lidWide: -0.18, lidLowL: 0.25, lidLowR: 0.25, lipPress: 0.3, pupil: -0.25 },
    mind: { blinkRate: 0.55, saccadeRate: 0.65, aversion: 0.08, motion: 0.45, breathRate: 0.88, breathDepth: 0.9, arousal: 0.45 },
  },
};

export const EMOTION_NAMES = Object.keys(EMOTIONS);

const DEFAULT_MIND = EMOTIONS.neutral.mind;

/**
 * Mezclador: mantiene un resorte por canal y persigue la emoción activa.
 * Soporta mezcla de dos emociones (`blend`) para estados intermedios, y
 * `pulse()` para acentos momentáneos (un golpe de ceja en una sílaba tónica)
 * que decaen solos sin romper el estado de fondo.
 */
export class EmotionMixer {
  constructor(initial = 'neutral') {
    this.v = {};   // valor actual por canal
    this.dv = {};  // velocidad por canal
    for (const c of CHANNELS) { this.v[c] = 0; this.dv[c] = 0; }
    this.name = initial;
    this.mixName = null;
    this.mixAmt = 0;
    this.hz = EMOTIONS[initial].hz;
    this.pulses = [];       // acentos temporales {ch, amp, t0, dur}
    this.tPulse = 0;
    Object.assign(this.v, EMOTIONS[initial].face);
  }

  /** Cambia de emoción. `blendWith`/`amount` permite estados intermedios. */
  set(name, { blendWith = null, amount = 0 } = {}) {
    if (!EMOTIONS[name]) return;
    this.name = name;
    this.mixName = blendWith && EMOTIONS[blendWith] ? blendWith : null;
    this.mixAmt = this.mixName ? Math.max(0, Math.min(1, amount)) : 0;
    this.hz = EMOTIONS[name].hz;
  }

  /** Acento momentáneo sobre un canal (prosodia, reacción). Decae solo. */
  pulse(ch, amp = 0.5, dur = 0.42) {
    if (!CHANNELS.includes(ch)) return;
    this.pulses.push({ ch, amp, t0: this.tPulse, dur });
    if (this.pulses.length > 24) this.pulses.shift();
  }

  /** Objetivo actual de un canal (emoción base + mezcla). */
  target(ch) {
    const a = EMOTIONS[this.name].face[ch] || 0;
    if (!this.mixName) return a;
    const b = EMOTIONS[this.mixName].face[ch] || 0;
    return a * (1 - this.mixAmt) + b * this.mixAmt;
  }

  /** Modificadores de comportamiento del estado actual (mezclados). */
  mind() {
    const a = EMOTIONS[this.name].mind;
    if (!this.mixName) return a;
    const b = EMOTIONS[this.mixName].mind;
    const out = {};
    for (const k in DEFAULT_MIND) out[k] = a[k] * (1 - this.mixAmt) + b[k] * this.mixAmt;
    return out;
  }

  /** Integra los resortes. Devuelve el objeto de canales (referencia estable). */
  tick(dt) {
    this.tPulse += dt;
    const w = 2 * Math.PI * this.hz;
    for (const ch of CHANNELS) {
      const zeta = ZETA[ch] ?? 1.0;
      const x = this.v[ch] - this.target(ch);
      // resorte semi-implícito: estable con dt grande, sin explotar
      this.dv[ch] = (this.dv[ch] - w * w * x * dt) / (1 + 2 * zeta * w * dt + w * w * dt * dt);
      this.v[ch] += this.dv[ch] * dt;
    }
    // acentos: campana de Hann sobre el canal, encima del estado de fondo
    this.out = this.out || {};
    for (const ch of CHANNELS) this.out[ch] = this.v[ch];
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const u = (this.tPulse - p.t0) / p.dur;
      if (u >= 1 || u < 0) { this.pulses.splice(i, 1); continue; }
      this.out[p.ch] += p.amp * 0.5 * (1 - Math.cos(2 * Math.PI * u));
    }
    return this.out;
  }
}
