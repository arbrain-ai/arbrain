// anatomy.js — DE LA TABLA DE MEDIDAS A LAS CONSTANTES DEL SHADER.
//
// El rig de producción de Trinity trae ~60 cifras clavadas dentro del fragment
// shader: dónde están sus ojos, cuánto sube su ceja, dónde nace su surco
// nasogeniano, por qué garganta le sube el bolo al tragar. Todas son de SU cara.
// Copiarlas a otra deforma la cara equivocada — el párpado cierra por la mejilla
// y el surco se pinta sobre la nariz.
//
// Aquí se convierten en función de la cara. Tres orígenes, en este orden:
//
//   1. MEDIDO      lo que `tools/measure.py` sacó de ESTA ilustración
//                  (ojos, boca, cejas, cabeza, iris, pupila, comisuras…).
//   2. DECLARADO   lo que geometry.js fija a mano en su bloque `anat`. Es la vía
//                  de escape para una cara ya auditada: gana sobre todo lo demás.
//   3. DERIVADO    lo que no se puede medir, por PROPORCIÓN. Cada proporción sale
//                  de la cara de Trinity, que es la que está auditada y aprobada:
//                  no se hereda la CIFRA, se hereda la RAZÓN.
//
// LA ESCALA. El factor maestro `k` es la distancia interpupilar de esta cara
// dividida entre la de Trinity (230.9 px). Es la medida antropométrica más
// estable que hay — no depende del peinado, ni del encuadre, ni de si la
// ilustración recorta el mentón. Todo lo que es un DESPLAZAMIENTO en píxeles
// (cuánto sube la ceja, cuánto se hincha el pómulo, cuánto viaja el bolo) se
// escala con `k`. Lo que es una GANANCIA adimensional (el 26 % del recorrido que
// pone el labio superior, el 7 % de sobrepaso de una sacada) NO se toca: es
// fisiología, no anatomía.
//
// Las amplitudes que dependen de un rasgo concreto se escalan con ESE rasgo, no
// con `k`: el párpado inferior sube en proporción a la APERTURA del ojo, la boca
// se ensancha en proporción a su SEMIANCHO, la pupila se dilata en proporción a
// su IRIS. Un ojo de 22 px no puede heredar un recorrido calibrado sobre uno de
// 40: el iris se metería debajo del párpado.

/** Cara de referencia: Trinity, con las constantes AUDITADAS de producción
 *  (`onboarding-final/rig/trinity.js`). No es "la cara correcta", es la cara
 *  sobre la que se calibró cada número — el patrón del que salen las razones. */
export const REF = {
  ipd: 230.9,              // distancia interpupilar: iris L(426.3) → R(657.2)
  aperture: 40.5,          // apertura media de sus ojos (38 izq · 43 der)
  halfW: 69.5,             // semiancho de boca: comisuras en 476 y 615
  limbus: 32.0,            // radio del iris visible
  browHalf: 204.0,         // semiancho de la banda de cejas
  jawTravel: 40.0,         // recorrido de la mandíbula a apertura 1.0
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Construye la tabla completa de constantes del shader para una cara.
 * @param {object} G  geometry.js del avatar
 * @param {object} opts  { lidFeather, parallaxNeck } — solo para medir el
 *   antes/después de una decisión. `parallaxNeck: 1` reproduce el comportamiento
 *   ANTERIOR al arreglo del cuello (parallax entero también sobre el cuello), que
 *   es como se saca el A/B sin tener que revertir el código.
 * @returns {object} tabla plana; toda cifra en píxeles de la rejilla del arte (1080²)
 */
export function deriveAnatomy(G, { lidFeather = null, parallaxNeck = null } = {}) {
  const A = G.anat || {};                       // lo DECLARADO manda sobre todo
  const pick = (key, derived) => (num(A[key]) !== null ? A[key] : derived);
  const pick2 = (key, derived) => (Array.isArray(A[key]) ? A[key] : derived);
  // …y para que "manda sobre todo" sea literal y no dependa de que me acuerde de
  // envolver cada campo, el bloque entero se funde ENCIMA de la tabla al final.
  // Sin esto la vía de escape es una promesa que se cumple campo a campo: la
  // primera vez que se olvidó un `pick`, el gate de regresión lo cazó por 0.24 px.

  // ---- iris y pupila: medidos si están, deducidos del ojo si no ----
  const irisL = pick2('irisL', [G.pupilL?.cx ?? G.eyeL.cx, G.pupilL?.cy ?? G.eyeL.cy]);
  const irisR = pick2('irisR', [G.pupilR?.cx ?? G.eyeR.cx, G.pupilR?.cy ?? G.eyeR.cy]);

  // ---- ESCALA MAESTRA ----
  const ipd = Math.abs(irisR[0] - irisL[0]) || REF.ipd;
  const k = ipd / REF.ipd;

  // rasgos locales, cada uno gobierna sus propias amplitudes
  const apL = G.eyeL.bot - G.eyeL.top;
  const apR = G.eyeR.bot - G.eyeR.top;
  const aperture = (apL + apR) / 2 || REF.aperture;
  const halfW = G.mouth.halfW || REF.halfW;
  const limbus = pick('limbus', (G.iris && G.iris.r) || REF.limbus * k);
  const browHalf = (G.brow.xHi - G.brow.xLo) / 2 || REF.browHalf * k;

  const faceCx = pick('faceCx', G.axis);
  const lipY = G.mouth.y;

  // proporciones del rasgo: cuánto vale "1 px de Trinity" en este rasgo
  const pk = (v) => v * k;                              // escala de cara
  const pa = (v) => (v / REF.aperture) * aperture;      // escala de apertura de ojo
  const pw = (v) => (v / REF.halfW) * halfW;            // escala de boca
  const pb = (v) => (v / REF.browHalf) * browHalf;      // escala de banda de cejas

  const T = {
    // ------------------------------------------------------------ identidad
    name: G.name,
    art: G.art,
    k, ipd, aperture, halfW, limbus, browHalf,
    faceCx,

    // ------------------------------------------------------------------ ojos
    eyeL: [G.eyeL.cx, G.eyeL.cy], eyeR: [G.eyeR.cx, G.eyeR.cy],
    rxL: G.eyeL.rx, rxR: G.eyeR.rx,
    topL: G.eyeL.top, topR: G.eyeR.top,
    botL: G.eyeL.bot, botR: G.eyeR.bot,
    cornerL: G.eyeL.corner, cornerR: G.eyeR.corner,
    creaseL: G.eyeL.crease, creaseR: G.eyeR.crease,
    irisL, irisR,
    // sigma del warp de dilatación: 37.5 % del iris visible en Trinity (12/32)
    pupilR: pick('pupilR', 0.375 * limbus),
    // Banda de mezcla del filo del párpado. Nunca por debajo de 1.5 px: menos que
    // eso y el antialias no llega a cubrir un píxel de pantalla.
    //
    // Escala con la APERTURA DEL OJO, no con el tamaño de la cara. Es la regla
    // de la cabecera de este archivo — "las amplitudes que dependen de un rasgo
    // se escalan con ESE rasgo" — y estaba incumplida justo aquí: con `pk` el
    // filo medía 1.72 px sobre el ojo de 28 px de Levy (6.2 % de su apertura) y
    // 2.01 px sobre el de 40.5 px de Trinity (4.96 %). El mismo número absoluto
    // se lee suave en un ojo pequeño y como canto de tijera en uno grande, que
    // es exactamente lo que se veía: Trinity cortaba el iris con una recta dura
    // y las otras dos no. El 2.45 sale de igualar el relativo de las dos caras
    // que sí estaban bien (3 ago 2026).
    lidFeather: lidFeather ?? pick('lidFeather', Math.max(1.5, pa(2.45))),
    edgeOpen: pk(1.0), edgeClose: pk(1.0),
    // el párpado ACOMPAÑA la mirada vertical. En Trinity 0.012 por px sobre una
    // apertura de 40.5 → el mismo gesto relativo pide 0.486/apertura.
    lidFollow: pick('lidFollow', 0.486 / aperture),
    lidDroop: 0.42,                       // uLidWide<0 deja el párpado caído
    creaseGap: pk(6.0),                   // dónde deja de moverse la piel de arriba
    lidSlide: pk(5.0),                    // recorrido extra del párpado al cerrar
    lidFloor: pk(4.0),                    // suelo numérico de las dos alturas
    widen: 0.17,                          // magnificación al abrir de más
    lidLow: pa(11.0),                     // párpado inferior sube (Duchenne)
    lidLowLo: pa(32.0), lidLowHi: pa(3.0),
    pupilGain: 0.52,
    lashLid: 0.24, lashEye: 0.26,
    lashFalloff: pk(4.0), lashSpan: pk(8.0),
    underEyeLo: pk(14.0), underEyeHi0: pk(30.0), underEyeHi1: pk(12.0),

    // ----------------------------------------------------------------- cejas
    // el lado se decide por posición: ±38 px alrededor del eje en Trinity
    browSplit: pk(38.0),
    browRaise: pk(7.5),
    browFurrowY: pk(8.0), browFurrowX: pk(4.5),
    innerLo: pb(195.0), innerHi: pb(40.0),
    // pliegue de glabela: banda vertical entre cejas, referida a la fila de ceja
    browY: G.brow.y,
    glabellaX: pk(11.0), glabellaXIn: pk(2.0), glabellaOff: pk(4.0),
    glabellaY0: pk(21.7), glabellaY1: pk(-5.3), glabellaY2: pk(-53.3), glabellaY3: pk(-28.3),

    // ------------------------------------------------------------------ boca
    lipY, mouthCx: G.mouth.cx,
    sideSplit: pw(30.0),                  // dónde deja de mandar una comisura
    // COLORES DE LA CAVIDAD. La ilustración tiene los labios sellados, así que
    // no hay interior que muestrear: se pinta. El color base sale MEDIDO del
    // quinto más oscuro del propio sello — un interior magenta dentro de una
    // cara ámbar se lee como un parche pegado. Trinity los declara a mano
    // porque los suyos están auditados sobre su paleta.
    cavWall: pick2('cavWall', G.mouth.cavity.map((c) => c * 0.92)),
    cavDeep: pick2('cavDeep', G.mouth.cavity.map((c) => c * 0.30)),
    cavOccl: pick2('cavOccl', G.mouth.cavity.map((c) => c * 0.16)),
    cavTongue: pick2('cavTongue', G.mouth.cavity.map((c) => c * 0.91)),
    // semiancho de la ventana de apertura. En Trinity 80 px sobre un semilabio
    // de 69.5 → la boca abre un pelo más ancha de lo que mide el sello.
    apW: pick('apW', pw(80.0)),
    apWide: pw(6.0), apPucker: pw(44.0),
    jawTravel: G.mouth.jawTravel,
    xsWide: 0.20, xsPucker: 0.28, xsSmile: 0.10,
    cupidLift: pk(1.0), cupidBump: pk(2.4), cupidSigma: pw(33.0),
    lipShare: 0.26,                       // el labio superior pone el 26 % del viaje
    cornerLo: pw(24.0), cornerHi: pw(76.0),
    cornerOutLo: pw(26.0), cornerOutHi: pw(74.0),
    smileLow: pk(15.0),                   // el labio inferior sigue a la comisura
    smileOut: pk(5.6),                    // el cigomático tira ARRIBA Y AFUERA
    smileUp: pk(9.0), smileUpSpan: pk(30.0),
    pressGain: 0.4, lipUpGain: pk(7.0), lipUpSpan: pk(28.0),
    puckerLow: 0.22, puckerUp: 0.20,
    thinJaw: 0.30, thinSmile: 0.16,
    interiorFeather: pk(7.5),
    tongueLo: (17.0 / REF.jawTravel) * (G.mouth.jawTravel || REF.jawTravel),
    tongueHi: (31.0 / REF.jawTravel) * (G.mouth.jawTravel || REF.jawTravel),

    // -------------------------------------------------------------- mejillas
    // la manzana del pómulo: a 1.20 semianchos de boca hacia afuera y a un 64 %
    // del camino entre el ojo y el labio
    cheekL: pick2('cheekL', [G.mouth.cx - pw(85.0),
                             G.eyeL.cy + 0.638 * (lipY - G.eyeL.cy)]),
    cheekR: pick2('cheekR', [G.mouth.cx + pw(81.0),
                             G.eyeR.cy + 0.638 * (lipY - G.eyeR.cy)]),
    cheekSigma: pw(58.0),
    cheekRise: pk(3.0),
    cheekLight: 0.075,

    // ------------------------------------------------- surco nasogeniano
    // nace en el ala de la nariz y muere antes del mentón
    noseY: pick('noseY', (G.nose && G.nose.y) || lipY - pk(69.0)),
    noseL: pick('noseL', (G.nose && G.nose.xL) || G.mouth.cx - pw(50.0)),
    noseR: pick('noseR', (G.nose && G.nose.xR) || G.mouth.cx + pw(43.0)),
    foldSpan: pk(82.0), foldBowL: pk(27.0), foldBowR: pk(29.0),
    foldWideLo: pk(12.0), foldWideHi: pk(2.5),
    dimpleL: pick2('dimpleL', [G.mouth.cx - halfW, lipY - pk(5.0)]),
    dimpleR: pick2('dimpleR', [G.mouth.cx + halfW, lipY - pk(5.0)]),
    dimpleSigma: pk(13.0), dimpleAmt: 0.30,
    // OSCURECIMIENTOS. Bajados a propósito el 27 jul 2026: sobre una piel de
    // aerógrafo sin un solo pliegue, un surco calibrado para una foto sale como
    // MANCHA. Se lee el gesto sin cavar la cara.
    glabellaDark: 0.16, underEyeDark: 0.09, foldDark: 0.07,

    // --------------------------------------------------------------- cabeza
    pivot: pick2('pivot', [faceCx, lipY - pk(49.0)]),
    // base del cuello: donde el cuello se encuentra con los hombros. El
    // desplazamiento LATERAL de la cabeza se convierte en rotación sobre este
    // punto (shiftRot = fracción que rota; el resto se traslada), y el pecho
    // acompaña una fracción (chestFollow). Ver rig.js "transform global".
    neckBase: pick2('neckBase', [faceCx, G.head.cy + G.head.ry + pk(30.0)]),
    neckR: pick('neckR', (G.head.cy + G.head.ry + pk(30.0)) - (G.eyeL.cy + G.eyeR.cy) / 2),
    shiftRot: 0.75,
    chestFollow: 0.15,
    // ganancia expresiva de la cara (ver rig.js, bloque P): 1 = las amplitudes de
    // Trinity tal cual. Se DECLARA en geometry.js → anat cuando la cara lo pide.
    emoGain: pick('emoGain', 1.0),
    // dónde se apaga el fundido con la vista ¾: pleno hasta 20 px bajo la barbilla,
    // cero 90 px más abajo (dentro de la sombra del cuello)
    yawFadeTop: (G.head.cy + G.head.ry) + pk(20.0),
    yawFadeBot: (G.head.cy + G.head.ry) + pk(90.0),
    breathRise: pk(3.4),
    parallaxDepth: 0.42, parallaxAmt: pk(16.0),
    // Cuánto parallax le toca al CUELLO respecto de la cara (0 = nada, 1 = igual).
    //
    // El parallax desplaza cada píxel según su profundidad, y sobre una cara eso
    // da volumen. Sobre un cuello no: da CIZALLA, porque el mapa de profundidad
    // cambia a lo largo de él y cada altura se corre distinto. Esa cizalla es el
    // frijol. Medido en Levy: el canal parallax produce 1.68 px de curvatura RMS
    // contra 0.04 px del desplazamiento de cabeza — 39 veces más.
    //
    // Anatómicamente además es lo correcto: la cabeza se adelanta y retrasa
    // respecto a la cámara, el cuello vive casi sobre el eje de giro y apenas se
    // mueve en profundidad.
    parallaxNeck: parallaxNeck ?? 0.22,

    // -------------------------------------------------------------- garganta
    // el bolo del trago sube por el cuello. Trinity: de 884 a 812, y su cabeza
    // acaba en y=888 — o sea, nace justo bajo el mentón.
    bolus0: pick('bolus0', (G.head.cy + G.head.ry) - pk(4.0)),
    bolus1: pick('bolus1', (G.head.cy + G.head.ry) - pk(76.0)),
    bolusSigma: pk(20.0), bolusMidLo: pk(64.0), bolusMidHi: pk(16.0),
    bolusRise: pk(3.4), bolusLight: 0.09,

    // ------------------------------------------------------- vida ambiental
    stripHalf: pk(7.0),
    chipGain: 0.16, brainGain: 0.10, brainBase: 0.10,
    speakGlow: 0.22, bgBreath: 0.05,
    apGlow: pick2('apGlow', [0.02, 0.10, 0.16]),
    brainTint: pick2('brainTint', [0.28, 0.10, 0.34]),
    stripTint: pick2('stripTint', [0.5, 0.12, 0.3]),
  };
  // `lidFeather` es la única excepción: cuando llega por `opts` viene de una
  // medición en curso (el antes/después del filo) y gana incluso a lo declarado.
  const out = { ...T, ...A };
  if (lidFeather !== null) out.lidFeather = lidFeather;
  return out;
}

export default deriveAnatomy;
