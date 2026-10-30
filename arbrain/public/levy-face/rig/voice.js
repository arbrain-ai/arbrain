// voice.js — LA VOZ, que es la fuente del TIEMPO para la boca.
//
// El mp3 horneado es el reloj. tools/bake.py guardó, junto al audio, la ventana
// temporal exacta de cada palabra, los visemas anclados dentro de esa ventana y
// la envolvente en dos bandas. Este módulo reproduce el audio y expone ese
// reloj; la boca se limita a leerlo (rig.speakTimeline).
//
// Si no hay audio (autoplay bloqueado, sin hornear, headless), nada se rompe:
// `speaking` queda en false y el llamador cae a su modo tonto.

const cache = new Map();

export async function loadVoiceManifest(base) {
  try {
    const idx = await (await fetch(`${base}/assets/lines/index.json`)).json();
    const map = new Map();
    for (const e of idx) map.set(e.template, e);
    console.info(`[rig] voz: ${map.size} líneas horneadas con timing por palabra`);
    return map;
  } catch {
    console.info('[rig] voz: sin líneas horneadas');
    return new Map();
  }
}

const plain = (s) => s.replace(/[*~]/g, '');

/** Reproductor de una línea: el audio manda, todo lo demás lo consulta. */
export class Utterance {
  constructor(meta, url) {
    this.meta = meta;                 // {text, audioDur, words, events, envelope}
    this.audio = new Audio(url);
    this.audio.preload = 'auto';
    this.t0 = 0;
    this.playing = false;
  }

  /** Segundos transcurridos DENTRO de la línea. Se prefiere currentTime del
   *  elemento (es el reloj del audio de verdad); si aún no arrancó, cae al
   *  cronómetro para que la boca no se congele en el primer fotograma. */
  get t() {
    if (this.audio.currentTime > 0) return this.audio.currentTime;
    return this.playing ? (performance.now() - this.t0) / 1000 : 0;
  }

  get dur() { return this.meta.audioDur; }

  play() {
    this.t0 = performance.now();
    this.playing = true;
    const p = this.audio.play();
    const end = new Promise((res) => {
      this.audio.addEventListener('ended', res, { once: true });
      setTimeout(res, this.meta.audioDur * 1000 + 900);   // red de seguridad
    });
    return (p && p.catch ? p.catch(() => {}) : Promise.resolve()).then(() => end);
  }

  stop() {
    this.playing = false;
    try { this.audio.pause(); this.audio.currentTime = 0; } catch { /* ya muerto */ }
  }

  /** Envolvente del audio en el instante t: [grave, agudo]. La grave modula la
   *  mandíbula, la aguda el ancho de labios — una "s" no abre la boca como una
   *  "a". Interpolada para que no escalone a 60 fps. */
  amp(t) {
    const e = this.meta.envelope;
    if (!e || !e.length) return [1, 0];
    const f = t * 60;
    const i = Math.min(e.length - 1, Math.max(0, Math.floor(f)));
    const j = Math.min(e.length - 1, i + 1);
    const k = f - i;
    return [e[i][0] + (e[j][0] - e[i][0]) * k, e[i][1] + (e[j][1] - e[i][1]) * k];
  }
}

export function createVoice(rig, base, manifest) {
  let current = null;
  return {
    get current() { return current; },

    /** Arranca una línea. Devuelve {speaking, text, words, utt} para que el
     *  llamador pueda colgar el subtítulo del MISMO reloj que la boca. */
    async start(raw) {
      this.stop();
      const template = plain(raw);
      const entry = manifest.get(template);
      if (!entry) return { speaking: false, text: template, words: null, utt: null };
      try {
        let meta = cache.get(entry.vis);
        if (!meta) {
          meta = await (await fetch(`${base}/assets/lines/${entry.vis}`)).json();
          cache.set(entry.vis, meta);
        }
        const utt = new Utterance(meta, `${base}/assets/lines/${entry.file}`);
        current = utt;
        rig.speakTimeline(utt);           // la boca se engancha al mismo reloj
        utt.play().then(() => {
          if (current === utt) { current = null; rig.stopSpeech(); }
        });
        return { speaking: true, text: meta.text, words: meta.words, utt };
      } catch (e) {
        console.warn('[rig] voz:', e.message);
        return { speaking: false, text: template, words: null, utt: null };
      }
    },

    stop() {
      if (current) { current.stop(); current = null; }
      rig.stopSpeech();
    },
  };
}
