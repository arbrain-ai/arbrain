// visemes.js — G2P español → timeline de visemas (estilo Oculus reducido).
// Mismo algoritmo que tools/make_visemes.py (paridad JS/Python).
// Visemas: sil PP FF DD kk CH aa E I O U

const VISEME_PARAMS = {
  sil: { jaw: 0.0,  wide: 0.0,  pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  PP:  { jaw: 0.0,  wide: 0.0,  pucker: 0.05, press: 1.0,  lipUp: 0.0 },
  FF:  { jaw: 0.08, wide: 0.1,  pucker: 0.0,  press: 0.15, lipUp: 1.0 },
  DD:  { jaw: 0.3,  wide: 0.3,  pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  kk:  { jaw: 0.34, wide: 0.1,  pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  CH:  { jaw: 0.22, wide: 0.0,  pucker: 0.4,  press: 0.0,  lipUp: 0.0 },
  aa:  { jaw: 0.95, wide: 0.2,  pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  E:   { jaw: 0.55, wide: 0.6,  pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  I:   { jaw: 0.28, wide: 0.85, pucker: 0.0,  press: 0.0,  lipUp: 0.0 },
  O:   { jaw: 0.68, wide: 0.0,  pucker: 0.65, press: 0.0,  lipUp: 0.0 },
  U:   { jaw: 0.34, wide: 0.0,  pucker: 0.95, press: 0.0,  lipUp: 0.0 },
};

// Duraciones base en ms por tipo
const DUR = { vowel: 92, cons: 58, pauseComma: 210, pausePeriod: 380, spaceGap: 24 };

function classifyChar(text, i) {
  const c = text[i].toLowerCase();
  const next = (text[i + 1] || '').toLowerCase();
  const vowels = { a: 'aa', á: 'aa', e: 'E', é: 'E', i: 'I', í: 'I', o: 'O', ó: 'O', u: 'U', ú: 'U', ü: 'U' };
  // Orthographic fallback only. Audio-aligned phonemes take precedence when present.
  if ((c === 'q' || c === 'g') && next === 'u' && /[eéií]/.test(text[i + 2] || ''))
    return { v: 'kk', dur: DUR.cons, skip: 1 };
  if (vowels[c]) return { v: vowels[c], dur: DUR.vowel, skip: 0 };
  if ('mbpv'.includes(c)) return { v: 'PP', dur: DUR.cons, skip: 0 };
  if (c === 'f') return { v: 'FF', dur: DUR.cons, skip: 0 };
  if ((c === 'c' || c === 'z') && (c === 'z' || /[eéií]/.test(next)))
    return { v: 'DD', dur: DUR.cons, skip: 0 };
  if (c === 'c' && next === 'h') return { v: 'CH', dur: DUR.cons, skip: 1 };
  if (c === 'l' && next === 'l') return { v: 'CH', dur: DUR.cons, skip: 1 };
  if (c === 'r' && next === 'r') return { v: 'DD', dur: DUR.cons + 30, skip: 1 };
  if ('ñy'.includes(c)) return { v: 'CH', dur: DUR.cons, skip: 0 };
  if ('dtlnszr'.includes(c)) return { v: 'DD', dur: DUR.cons, skip: 0 };
  if ('ckqgjx'.includes(c)) return { v: 'kk', dur: DUR.cons, skip: 0 };
  if (c === 'w') return { v: 'U', dur: DUR.cons, skip: 0 };
  if (c === 'h') return null; // muda
  if (',;:'.includes(c)) return { v: 'sil', dur: DUR.pauseComma, skip: 0 };
  if ('.!?'.includes(c)) return { v: 'sil', dur: DUR.pausePeriod, skip: 0 };
  if (c === ' ') return { v: null, dur: DUR.spaceGap, skip: 0 }; // micro-gap, mantiene visema
  return null;
}

/** texto → [{t, dur, viseme, char, word}] con t en ms (sin escalar). */
export function textToVisemes(text) {
  const events = [];
  let t = 0;
  let word = '';
  const words = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/[\wáéíóúüñ]/i.test(ch)) word += ch; else if (word) { words.push(word); word = ''; }
    const r = classifyChar(text, i);
    if (!r) continue;
    if (r.v === null) { t += r.dur; continue; }
    events.push({ t, dur: r.dur, viseme: r.v, char: ch, word: words.length + (word ? 1 : 0) });
    t += r.dur;
    i += r.skip;
  }
  if (word) words.push(word);
  return { events, total: t, words };
}

/** Escala la timeline a la duración real del audio (seg). */
export function scaleTimeline(tl, audioDurSec) {
  if (!tl?.total || !Number.isFinite(audioDurSec) || audioDurSec <= 0)
    return { events: [], total: 0, words: tl?.words || [] };
  const k = (audioDurSec * 1000 * 0.97) / tl.total; // 3% margen de cola
  return {
    ...tl,
    events: tl.events.map(e => ({ ...e, t: e.t * k, dur: e.dur * k })),
    total: tl.total * k,
  };
}

/**
 * Canales de CONTACTO: los que describen que dos superficies se TOCAN.
 *   press  labio contra labio (p, b, m)
 *   lipUp  labio inferior contra los dientes (f, v)
 *
 * No se promedian, y esa es toda la diferencia. Un contacto es binario: los
 * labios se juntan o no se juntan, y medio contacto no existe en ninguna cara.
 * Promediándolos con los vecinos, un PP con peso 1 rodeado de una vocal con peso
 * 0.6 acababa en 1/1.6 = 0.63 de cierre. Medido antes de este cambio: los
 * oclusivos llegaban al 55-62 % de su forma y **8 de cada 57 PP cerraban de
 * verdad**. Y el fallo de un cierre bilabial es lo más visible del lip-sync
 * entero, porque se ve sin necesidad de oír nada.
 */
const CONTACTO = new Set(['press', 'lipUp']);

/** Evalúa params de boca en el tiempo t (ms) con co-articulación. */
export function evalVisemes(tl, tMs, previousMs = null) {
  const P = { jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0 };
  if (!tl || !tl.events.length) return { params: P, viseme: 'sil' };
  const MAXC = { press: 0, lipUp: 0 };
  let seal = 0;
  let dominant = 'sil', domW = 0, totalW = 0;
  for (const e of tl.events) {
    const start = e.t, end = e.t + e.dur;
    // Acoustic aligners return phoneme cores, sometimes only one analysis frame.
    // Transition time must not collapse with core duration: that creates snaps.
    // Contact still owns aperture at its core, regardless of overlapping vowels.
    const ATTACK = 40, RELEASE = 45;
    let w = 0;
    if (tMs >= start && tMs <= end) w = 1;
    else if (tMs < start && start - tMs < ATTACK) w = 1 - (start - tMs) / ATTACK;
    else if (tMs > end && tMs - end < RELEASE) w = 1 - (tMs - end) / RELEASE;
    if (w <= 0) continue;
    const vp = VISEME_PARAMS[e.viseme];
    if (!vp) continue;
    if (e.viseme === 'PP') seal = Math.max(seal, w);
    for (const k in P) {
      if (CONTACTO.has(k)) MAXC[k] = Math.max(MAXC[k], vp[k] * w);
      else P[k] += vp[k] * w;
    }
    totalW += w;
    if (w > domW) { domW = w; dominant = e.viseme; }
  }
  // The missing weight is the neutral pose. Normalizing a solitary fading vowel
  // by its own weight cancels its fade: even weight .001 used to open fully.
  // Above 1 we still normalize overlapping events to prevent overshoot.
  if (totalW > 1e-4) {
    for (const k in P) if (!CONTACTO.has(k)) P[k] /= Math.max(1, totalW);
  }
  for (const k of CONTACTO) P[k] = MAXC[k];
  // Contact constrains aperture too; a press=1 with jaw=.49 was contradictory.
  P.jaw *= 1 - seal;
  // A contact shorter than one display interval can fall entirely between
  // frames at fast playback. Preserve that missed peak for this frame only.
  // Never accumulate delays or replay contacts after a pause/backward seek.
  if (Number.isFinite(previousMs) && previousMs !== null && tMs > previousMs && tMs - previousMs <= 100) {
    const missed = tl.events.some(e => e.viseme === 'PP' && e.t > previousMs && e.t + e.dur < tMs);
    if (missed) { P.press = 1; P.jaw = 0; dominant = 'PP'; }
  }
  return { params: P, viseme: dominant };
}

export { VISEME_PARAMS };
