// rig.js — Rig facial 2.5D FULL-VIDA, paramétrico. Deforma la ilustración
// canónica con un warp de UV por región en un fragment shader: la textura base ES
// el arte y la vida son desplazamientos de las coordenadas de muestreo. Live2D a
// mano, sin mallas.
//
// De dónde viene: es el rig de producción de Trinity (`onboarding-final/rig/`),
// entero — emociones, respiración, parallax de cabeza, dilatación de pupila,
// sonrisa de Duchenne, tragar saliva, pliegues procedurales — con UNA diferencia
// estructural: allí las ~60 cifras de la cara están escritas dentro del shader, y
// aquí se INYECTAN desde `anatomy.js`, que las saca de `geometry.js`. Así es
// imposible que un avatar acabe corriendo con la geometría de otro.
//
// Qué hace este rig y el estrecho no hacía:
//   · CEJAS POR LADO + fruncido del extremo interno (sin asimetría no hay DUDA).
//   · PÁRPADO INFERIOR que sube (Duchenne: la sonrisa real está en los ojos) y
//     párpado superior que abre de más (sorpresa).
//   · PUPILA con dilatación real (warp radial gaussiano sobre el iris medido).
//   · COMISURAS INDEPENDIENTES (media sonrisa torcida = ironía).
//   · RESPIRACIÓN, parallax por profundidad y cuello con resorte.
//   · Pliegue de glabela y surco nasogeniano, procedurales, porque el arte no los
//     trae — y BAJADOS de intensidad: sobre piel de aerógrafo un surco de foto
//     sale como mancha.
//   · TRAGAR SALIVA. Dura medio segundo cada ~30 s, nadie sabe nombrarlo, y su
//     AUSENCIA es de lo que más delata a un muñeco: los muñecos no tragan.
//
// Lo que se hereda del rig estrecho, porque ya está pagado en errores:
//   · el filo del párpado se MEZCLA con smoothstep (un if/else escalona);
//   · la boca abre con perfil ELÍPTICO, no smoothstep (si no, abre como rendija);
//   · el labio SUPERIOR también trabaja (~26 % del recorrido) y se adelgaza;
//   · la frontera arriba/abajo es el ARCO DE CUPIDO desplazado, no una recta;
//   · la mandíbula tiene MASA (resorte de 13 Hz);
//   · techo suave de apertura, calibrado POR CARA (tools/sweep-jaw.mjs).

import GEO from './geometry.js';
import { deriveAnatomy } from './anatomy.js';
import { textToVisemes, scaleTimeline, evalVisemes } from './visemes.js';
import { LifeBrain, clamp, clampElipse } from './life.js';
import { EmotionMixer, EMOTION_NAMES } from './emotions.js';

/** Tope del cursor normalizado. Vive aquí y no repetido en el handler porque el
 *  clamp del ratón y el de la elipse del parallax TIENEN que ser el mismo número:
 *  si divergen, el parallax vuelve a salirse por la diagonal sin que nadie lo vea. */
const MOUSE_MAX = 1.6;

/** Anticipación heredada del fallback sin timeline. La ruta alineada usa
 * exclusivamente la posición del medio y no aplica esta constante. */
const LOOKAHEAD = 0.07;

/** Cuánto gira la cabeza por unidad de cursor. Con el cursor en el borde del
 *  lienzo (1.0) la cabeza llega al 70 % de la vista ¾ (unos 7-9°: lo que gira un
 *  presentador que sigue a alguien con la mirada); al tope del clamp (1.6) llega
 *  a la vista entera. Los ojos siguen haciendo el grueso del recorrido. */
const YAW_GAIN = 0.7;

/** Política de mezcla frontal↔¾ durante el giro.
 *
 *   (default)         FUNDIDO GLOBAL. Las dos pinturas, ya llevadas a la misma
 *                     geometría por el campo óptico, se cruzan con un alpha único.
 *                     ELEGIDO POR DANIEL EL 4 SEP mirando las tres en vivo, en
 *                     frío y dos veces: es el que se mueve como una cabeza. A
 *                     media pose los contornos se duplican y él lo sabe; lo
 *                     prefiere así. NO se re-litiga sin que él lo pida.
 *   ?giro=multibanda  Banda baja global + detalle de una sola vista. Mide mejor
 *                     (nitidez 99.7 % contra 92.7 % sobre la trayectoria real)
 *                     y aun así lo descartó: le cambia el carácter al movimiento.
 *                     La métrica no manda sobre el ojo.
 *   ?giro=bandas      Barrido espacial. Descartado: mete una costura vertical que
 *                     viaja por la cara y se lee como cortinilla.
 *
 * Los tres viven en el shader a propósito, para poder volver a comparar sin
 * recuperar nada de git.
 */
const GIRO = typeof window !== 'undefined'
  ? (new URLSearchParams(window.location.search).get('giro') || 'global')
  : 'global';
const GIRO_GLOBAL = GIRO === 'global' || GIRO === 'anterior';
const GIRO_BANDAS = GIRO === 'bandas';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * Arma el fragment shader con las medidas de ESTA cara. Todo número que aquí se
 * inyecta salió de `anatomy.js`; no queda una sola constante facial escrita a
 * mano en el cuerpo del shader.
 */
function buildFrag(A) {
  // Literal GLSL sin perder precisión. Ojo con el detalle: a dos decimales,
  // una ganancia de 0.075 se escribe "0.07" y la luz del pómulo baja un 7 % sin
  // que nadie lo note. Aquí se conservan cinco y se podan los ceros — el punto
  // decimal se mantiene siempre porque GLSL no acepta un entero donde va float.
  const n = (v) => {
    const s = Number(v).toFixed(5).replace(/0+$/, '');
    return s.endsWith('.') ? `${s}0` : s;
  };
  const v2 = (p) => `vec2(${n(p[0])}, ${n(p[1])})`;
  const v3 = (p) => `vec3(${p.map(n).join(', ')})`;
  return `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;    // ilustración canónica
uniform sampler2D uMaskA;  // R=ojo izq  G=ojo der  B=boca  A=cejas
uniform sampler2D uMaskB;  // R=chip  G=cerebro  B=pecho  A=cabeza
uniform sampler2D uDepth;  // mapa de profundidad

uniform vec2  uCanvas;      // px del canvas
uniform float uTime;
uniform vec2  uParallax;    // -1..1 (cursor suavizado)
uniform vec2  uGaze;        // px: A DÓNDE VA EL IRIS (+x derecha, +y abajo)
uniform vec2  uBlink;       // 0 abierto .. 1 cerrado, POR OJO (x=izq y=der)
uniform vec2  uBrow;        // levantar ceja por lado (-1 baja .. 1 sube)
uniform vec2  uFurrow;      // fruncir extremo interno por lado (0..1)
uniform float uLidWide;     // abrir de más (>0) / caído (<0)
uniform vec2  uLidLow;      // párpado inferior sube por lado (Duchenne, 0..1)
uniform float uPupil;       // dilatación de pupila (-1 contraída .. 1 dilatada)
uniform float uBreath;      // 0..1+ (asimétrica, no es un seno)
uniform vec2  uHeadShift;   // px
uniform float uHeadRot;     // rad
uniform float uJaw, uWide, uPucker, uPress, uLipUp;
uniform vec2  uSmile;       // comisura por lado (x=izq y=der)
uniform float uChipPulse, uBrainPulse, uSpeakGlow;
uniform float uSwallow;     // 0 reposo · 0..1 fase del trago
// ---- CAPAS DE LA HOJA DE PERSONAJE (2 sep 2026) ----
// La frontal nunca se diseñó para moverse. Estas capas sí: dos vistas ¾ que el
// rig FUNDE al girar (warp guiado por un campo de flujo medido, no cross-fade),
// la vista de ojos cerrados (el párpado real, no piel deslizada) y la boca
// abierta (dientes, lengua y sombra dibujados, no una cavidad plana).
uniform sampler2D uViewL;   // ¾ con la nariz hacia la IZQUIERDA del espectador
uniform sampler2D uViewR;   // ¾ con la nariz hacia la DERECHA
uniform sampler2D uFlowL;   // campo frontal→vista, 16 bit partido (R·256+G, B·256+A)
uniform sampler2D uFlowR;
uniform sampler2D uViewClosed;
uniform sampler2D uViewAA;
uniform float uYaw;         // -1 (vista izq entera) .. 0 (frontal) .. 1 (vista der)
uniform vec4  uLayers;      // qué capas cargaron: x=¾ izq · y=¾ der · z=cerrado · w=aa
uniform vec2  uClosedOff;   // registro de la vista cerrada respecto a la frontal (px)
uniform vec4  uAABox;       // x0,y0,x1,y1 del interior de la boca en la vista aa (px)
uniform float uFlowRange;   // ±px que codifica el campo de flujo
uniform sampler2D uMatte;   // R=frontal · G=¾ izq · B=¾ der (tools/matte.py)
uniform float uMatteMode;   // 1 = pintar la MATTE (alpha) en vez del color, para render con alpha

// La rejilla de trabajo es SIEMPRE 1080²: el muestreo va en coordenadas
// normalizadas (p / IMG), así que la resolución real de la textura no entra en
// la cuenta. Lo único que importa es que las medidas estén en esta rejilla.
const float IMG = 1080.0;
// --- ojos: apertura almendra por-ojo. El párpado es un ARCO ---
const vec2 EYE_L = ${v2(A.eyeL)};
const vec2 EYE_R = ${v2(A.eyeR)};
const float EYE_RX_L = ${n(A.rxL)};
const float EYE_RX_R = ${n(A.rxR)};
const float TOP_C_L = ${n(A.topL)};             // párpado superior, centro
const float TOP_C_R = ${n(A.topR)};
const float BOT_C_L = ${n(A.botL)};             // párpado inferior, centro
const float BOT_C_R = ${n(A.botR)};
const float CORNER_L = ${n(A.cornerL)};
const float CORNER_R = ${n(A.cornerR)};
const float CREASE_L = ${n(A.creaseL)};         // pliegue (la piel de arriba NO se mueve)
const float CREASE_R = ${n(A.creaseR)};
// --- iris/pupila ---
const vec2 IRIS_L = ${v2(A.irisL)};
const vec2 IRIS_R = ${v2(A.irisR)};
const float PUPIL_R = ${n(A.pupilR)};           // sigma del warp de dilatación
// Media anchura de la banda donde el filo del párpado se mezcla con la apertura
// del ojo. Ver "FILO ANTIALIASEADO" más abajo.
const float LID_FEATHER = ${n(A.lidFeather)};
// --- boca ---
const float LIP_Y = ${n(A.lipY)};
const float MOUTH_CX = ${n(A.mouthCx)};
// mejillas y surco nasogeniano
const vec2 CHEEK_L = ${v2(A.cheekL)};
const vec2 CHEEK_R = ${v2(A.cheekR)};
const vec2 PIVOT = ${v2(A.pivot)};              // pivote del cuello
const float FACE_CX = ${n(A.faceCx)};
// base del cuello: el desplazamiento LATERAL de la cabeza se convierte en su
// mayor parte en ROTACIÓN sobre este punto (ver "transform global")
const vec2 NECK_BASE = ${v2(A.neckBase)};
const float NECK_R = ${n(A.neckR)};

vec4 maskA(vec2 p) { return texture(uMaskA, p / IMG); }
vec4 maskB(vec2 p) { return texture(uMaskB, p / IMG); }
float depthAt(vec2 p) { return texture(uDepth, p / IMG).r; }
vec3 tex(vec2 p) { return texture(uTex, clamp(p / IMG, 0.001, 0.999)).rgb; }
vec3 texL(vec2 p) { return texture(uViewL, clamp(p / IMG, 0.001, 0.999)).rgb; }
vec3 texR(vec2 p) { return texture(uViewR, clamp(p / IMG, 0.001, 0.999)).rgb; }
vec3 texClosed(vec2 p) { return texture(uViewClosed, clamp(p / IMG, 0.001, 0.999)).rgb; }
vec3 texAA(vec2 p) { return texture(uViewAA, clamp(p / IMG, 0.001, 0.999)).rgb; }

// Pasabajos para el fundido multibanda del giro. Dos anillos hexagonales girados
// 30° entre sí + centro: 13 tomas por textura, suficientes para que el corte quede
// por encima del desalineamiento residual del campo óptico (unos 10-20 px) sin
// comerse el volumen de la cara. Solo se evalúa cuando hay giro.
const vec2 RING_A[6] = vec2[6](vec2( 1.0, 0.0), vec2( 0.5, 0.866), vec2(-0.5, 0.866),
                               vec2(-1.0, 0.0), vec2(-0.5,-0.866), vec2( 0.5,-0.866));
const vec2 RING_B[6] = vec2[6](vec2( 0.866, 0.5), vec2( 0.0, 1.0), vec2(-0.866, 0.5),
                               vec2(-0.866,-0.5), vec2( 0.0,-1.0), vec2( 0.866,-0.5));
vec3 lowPass(sampler2D s, vec2 p, float r) {
  vec3 a = texture(s, clamp(p / IMG, 0.001, 0.999)).rgb * 0.22;
  for (int i = 0; i < 6; i++) {
    a += texture(s, clamp((p + RING_A[i] * (r * 0.55)) / IMG, 0.001, 0.999)).rgb * 0.08;
    a += texture(s, clamp((p + RING_B[i] * r)          / IMG, 0.001, 0.999)).rgb * 0.05;
  }
  return a;
}
// campo de flujo: dos bytes por eje (muestreo NEAREST: interpolar bytes altos y
// bajos por separado rompería el número). ±uFlowRange px en la rejilla del arte.
vec2 flowL(vec2 p) { vec4 t = texture(uFlowL, clamp(p / IMG, 0.0, 1.0));
  return (vec2(t.r * 65280.0 + t.g * 255.0, t.b * 65280.0 + t.a * 255.0) / 65535.0 * 2.0 - 1.0) * uFlowRange; }
vec2 flowR(vec2 p) { vec4 t = texture(uFlowR, clamp(p / IMG, 0.0, 1.0));
  return (vec2(t.r * 65280.0 + t.g * 255.0, t.b * 65280.0 + t.a * 255.0) / 65535.0 * 2.0 - 1.0) * uFlowRange; }

void main() {
  // --- cover-fit del canvas al cuadrado de la imagen ---
  float side = min(uCanvas.x, uCanvas.y);
  vec2 off = (uCanvas - side) * 0.5;
  vec2 p = ((vUv * uCanvas) - off) / side * IMG;
  p.y = IMG - p.y;
  if (p.x < 0.0 || p.x > IMG || p.y < 0.0 || p.y > IMG) { outColor = vec4(0.02, 0.005, 0.04, 1.0); return; }
  vec2 pScreen = p;   // guardado para efectos que NO deben viajar con el warp

  // --- transform global: respiración + micro-movimiento de cabeza ---
  vec4 mb0 = maskB(p);
  float headW = mb0.a;
  float chestW = mb0.b;
  p.y += uBreath * ${n(A.breathRise)} * chestW;     // el pecho sube al inhalar
  // TORSO (Arbrain, 4-5 oct): en Levy la máscara de pecho solo cubre las filas 890-1079, así que hombros
  // y clavículas no respiraban (juez iter-10: «casi no se ve»). Con \`capas.torso\` todo lo que está bajo
  // el mentón sube con la respiración; la cabeza queda fija y el cuello absorbe la diferencia en degradado.
  p.y += uBreath * ${n(A.torsoRise ?? 0)} * smoothstep(${n(A.torsoY0 ?? 0)}, ${n(A.torsoY1 ?? 1)}, p.y) * (1.0 - headW);
  float cr = cos(-uHeadRot), sr = sin(-uHeadRot);
  vec2 q = p - PIVOT;
  vec2 pRot = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr) + PIVOT;
  // EL CUELLO NO SE TRASLADA: GIRA. Trasladar la cabeza entera y mezclar por
  // máscara (el mix de siempre) mueve cada píxel de la banda cabeza→cuello una
  // fracción distinta del total: una cizalla, y una cizalla sobre algo alargado
  // dibuja una C — el "cuello de frijol". Una rotación rígida sobre la base del
  // cuello conserva la forma del cuello por definición: cerca del pivote el
  // desplazamiento tiende a cero, así que la banda mezclada casi no se cizalla.
  // Queda un 25 % de traslación para que no se sienta articulado como un títere.
  float thN = ${n(A.shiftRot)} * uHeadShift.x / NECK_R;
  float cn = cos(thN), sn = sin(thN);
  vec2 qn = pRot - NECK_BASE;
  pRot = vec2(qn.x * cn - qn.y * sn, qn.x * sn + qn.y * cn) + NECK_BASE
       - vec2(uHeadShift.x * (1.0 - ${n(A.shiftRot)}), uHeadShift.y);
  p = mix(p, pRot, headW);
  // el trapecio tensa cuando la cabeza se ladea: el pecho acompaña un poco
  p.x -= uHeadShift.x * ${n(A.chestFollow)} * chestW * (1.0 - headW);

  // --- parallax por profundidad (fake-3D) ---
  // Pesado por headW: entero sobre la cara, atenuado sobre cuello y pecho. Sin
  // esto, el gradiente de profundidad a lo largo del cuello corre cada altura una
  // cantidad distinta y lo dobla como un frijol — que es el defecto que se está
  // arreglando, y el canal que lo causaba (39× el desplazamiento de cabeza).
  float d = depthAt(p);
  float paraW = mix(${n(A.parallaxNeck)}, 1.0, headW);
  p -= uParallax * (d - ${n(A.parallaxDepth)}) * ${n(A.parallaxAmt)} * paraW;

  // ================= YAW: la cabeza GIRA (capas ¾ de la hoja) =================
  // Un cross-fade entre la frontal y la vista girada da fantasma doble (la
  // nariz de una sobre la mejilla de la otra). Aquí las dos imágenes se WARPEAN
  // hacia la misma geometría intermedia con un campo de flujo medido sobre sus
  // landmarks (tools/flow.py) y solo entonces se mezclan. Con peso w:
  //   frontal se muestrea en  p − w·V        (este es el espacio en el que
  //                                            trabajan máscaras y geometría)
  //   vista   se muestrea en  p + (1−w)·V = pFrontal + V
  // La deformación facial (parpadeo, boca, cejas) se calcula UNA vez en espacio
  // frontal y se le aplica igual a la vista: un giro de ±12° no cambia dónde
  // cae un párpado lo bastante como para que se note, y evita duplicar el rig.
  // Solo la CABEZA se funde con la vista: el generador no conserva hombros ni
  // placas del pecho entre vistas, y mezclarlos daba un fantasma en el torso. La
  // máscara de cabeza (la misma del cuello) delimita dónde vive el giro; el
  // campo de flujo ya tiende a cero fuera de la cara, así que la costura cae en
  // la banda del cuello, donde el arte tiene sombra.
  // La máscara se aplica ANTES de warpear: si el campo deforma también el cuello
  // y los hombros, el juez de cuello lee ese twist como frijol (medido: 0.10 →
  // 2.8 px RMS con el warp sin enmascarar). El giro vive en la cabeza; la
  // articulación queda en la banda de la máscara, bajo la mandíbula.
  // El WARP va con el peso entero (el campo ya es cero en cuello y hombros por
  // construcción: tools/flow.py ancla el cuello); el FUNDIDO con la vista se apaga
  // por altura, de la barbilla hacia el cuello, porque el generador no conserva
  // hombros ni placas entre vistas y mezclarlos daba fantasma en el torso. La
  // máscara de cabeza no sirve aquí: es una elipse que no cubre coronilla ni
  // orejas y dejaba un doble contorno en el cráneo a giro pleno.
  float yawPose = clamp(abs(uYaw), 0.0, 1.0) * (uYaw < 0.0 ? uLayers.x : uLayers.y);
  float yawW = yawPose;
  vec2 flow = vec2(0.0);
  if (yawW > 0.0005) { flow = uYaw < 0.0 ? flowL(p) : flowR(p); }
  p -= yawW * flow;
  vec2 pView = p + flow;
  vec2 pFrontal0 = p;
  float yawFade = smoothstep(${n(A.yawFadeBot)}, ${n(A.yawFadeTop)}, p.y);
  yawW *= yawFade;

  // espacio CARA: ya viaja con la cabeza, todavía sin deformación facial. Es el
  // espacio correcto para pintar pliegues (si usara el espacio pantalla, el
  // surco se quedaría clavado mientras la cabeza se mueve).
  vec2 pFace = p;

  // ---- tragar saliva: un bolo sube por la garganta. Dura medio segundo cada
  // ~30 s y nadie sabe nombrarlo, pero su AUSENCIA es de lo que más delata a un
  // muñeco: los muñecos no tragan.
  float swalShade = 0.0;
  if (uSwallow > 0.001) {
    float u = uSwallow;
    float bolus = mix(${n(A.bolus0)}, ${n(A.bolus1)}, u);        // sube por el cuello
    float band = exp(-pow((pFace.y - bolus) / ${n(A.bolusSigma)}, 2.0));
    float mid = smoothstep(${n(A.bolusMidLo)}, ${n(A.bolusMidHi)}, abs(pFace.x - FACE_CX));
    float amp = sin(u * 3.14159);
    p.y += band * mid * ${n(A.bolusRise)} * amp;
    swalShade = band * mid * amp;
  }

  vec4 ma = maskA(p);
  float mMouth = ma.b, mBrow = ma.a;

  // ================= CEJAS (por lado + fruncido) =================
  // El mapa de cejas es UNA sola región; el lado se decide por posición, no por
  // máscara. El extremo INTERNO es el que baja y se junta: eso es el ceño, y es
  // la mitad de lo que hace legible una emoción negativa.
  float browSide = smoothstep(${n(A.faceCx + A.browSplit)}, ${n(A.faceCx - A.browSplit)}, p.x);
  float browRaise = mix(uBrow.y, uBrow.x, browSide);
  float browFurrow = mix(uFurrow.y, uFurrow.x, browSide);
  float innerW = smoothstep(${n(A.innerLo)}, ${n(A.innerHi)}, abs(p.x - FACE_CX));
  float glabella = 0.0;
  if (mBrow > 0.005) {
    p.y += browRaise * ${n(A.browRaise)} * mBrow;
    p.y -= browFurrow * ${n(A.browFurrowY)} * mBrow * innerW;                 // interno baja
    p.x += browFurrow * ${n(A.browFurrowX)} * mBrow * innerW * sign(p.x - FACE_CX + 0.001); // y se juntan
  }
  // pliegue vertical de glabela (entre cejas): no existe en el arte, se pinta
  float fAvg = (uFurrow.x + uFurrow.y) * 0.5;
  if (fAvg > 0.01) {
    float gx = smoothstep(${n(A.glabellaX)}, ${n(A.glabellaXIn)}, abs(pFace.x - FACE_CX + ${n(A.glabellaOff)}));
    float gy = smoothstep(${n(A.browY + A.glabellaY0)}, ${n(A.browY + A.glabellaY1)}, pFace.y)
             * smoothstep(${n(A.browY + A.glabellaY2)}, ${n(A.browY + A.glabellaY3)}, pFace.y);
    glabella = gx * gy * fAvg;
  }

  // ================= OJOS =================
  float lash = 0.0;
  float apGlow = 0.0;
  float underEye = 0.0;
  float closedW = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 c      = i == 0 ? EYE_L : EYE_R;
    float rx    = i == 0 ? EYE_RX_L : EYE_RX_R;
    float topC  = i == 0 ? TOP_C_L : TOP_C_R;
    float botC  = i == 0 ? BOT_C_L : BOT_C_R;
    float cor   = i == 0 ? CORNER_L : CORNER_R;
    float crease = i == 0 ? CREASE_L : CREASE_R;
    float blk   = i == 0 ? uBlink.x : uBlink.y;
    float lidLow = i == 0 ? uLidLow.x : uLidLow.y;
    vec2 iris   = i == 0 ? IRIS_L : IRIS_R;
    float ax = abs(p.x - c.x) / rx;
    if (ax > 1.5) continue;
    float hx = smoothstep(1.32, 0.95, ax);
    float arcT = min(ax * ax, 1.0);
    float arcB = min(ax * ax * ax * ax, 1.0);
    float openEdge  = mix(topC, cor, arcT) - ${n(A.edgeOpen)};
    float closeEdge = mix(botC, cor, arcB) + ${n(A.edgeClose)};
    // el párpado sigue la mirada vertical; uLidWide<0 lo deja caído
    float b = clamp(blk + uGaze.y * ${n(A.lidFollow)} - min(uLidWide, 0.0) * ${n(A.lidDroop)}, 0.0, 1.0);
    float edge = mix(openEdge, closeEdge, b);
    float creaseA = crease - ${n(A.creaseGap)};
    // CAPA DE OJO CERRADO. El párpado deslizado nunca terminaba de tapar el iris
    // (16 % / 28 % de residuo medido en Levy y Sensei: el iris conserva color
    // bajo el filo). El cierre real está DIBUJADO en la hoja: al final del
    // parpadeo se funde esa vista, registrada a la frontal por el centro de los
    // ojos. Solo cuenta el canal de parpadeo (blk), no el seguimiento de la mirada.
    //
    // CORTINILLA, NO FUNDIDO (Arbrain, 4 oct). Fundir la pintura cerrada con alpha creciente dejaba,
    // a media caída, el iris visible A TRAVÉS de un párpado translúcido con dos filos: el ojo
    // duplicado que Daniel describió («como bizco»). Ahora la pintura es OPACA por encima del filo
    // que ya baja con el parpadeo y no existe por debajo: un solo párpado que desciende y tapa.
    closedW = max(closedW, hx * smoothstep(creaseA - 8.0, creaseA + 6.0, p.y)
                             * smoothstep(closeEdge + 22.0, closeEdge + 6.0, p.y)
                             * smoothstep(edge + 2.5, edge - 2.5, p.y)
                             * smoothstep(0.30, 0.50, blk));
    // FILO ANTIALIASEADO. Esto era un if/else DURO sobre "edge": cada píxel caía
    // en "piel del párpado" o en "apertura del ojo", sin nada en medio. Como
    // "edge" varía con x, en un borde diagonal la frontera escalona píxel a píxel
    // y el filo se lee recortado con tijera — visible en cada parpadeo y cada
    // movimiento de mirada.
    //
    // Ahora se calculan las DOS deformaciones y se mezclan en una banda de
    // ±LID_FEATHER px alrededor del filo. Fuera de esa banda el peso es 0 o 1
    // exacto, así que el resultado es idéntico al de antes: el cambio solo
    // existe en los ~4 px donde antes había un salto.
    if (p.y >= creaseA) {
      float wOpen = smoothstep(edge - LID_FEATHER, edge + LID_FEATHER, p.y);

      // --- A · piel del párpado deslizando (manda por debajo del filo) ---
      //     derivada 1 en el filo, 0 en el pliegue
      vec2 pLid = p;
      float lashLid;
      {
        float srcTop = openEdge - ${n(A.lidSlide)} * b;
        float D = max(edge - creaseA, ${n(A.lidFloor)});
        float S = max(srcTop - creaseA, ${n(A.lidFloor)});
        float e = max(edge - p.y, 0.0);   // sobre el filo sería negativo: se acota
        float g = D / S;
        float s = S * (1.0 - pow(max(1.0 - e / D, 0.0), g));
        pLid.y = mix(p.y, srcTop - s, hx);
        lashLid = hx * b * (1.0 - smoothstep(0.0, ${n(A.lashFalloff)}, e)) * ${n(A.lashLid)};
      }

      // --- B · apertura del ojo (manda por encima del filo) ---
      vec2 pEye = p;
      float apEye, lashEye, underEyeB;
      {
        float ap = hx * smoothstep(closeEdge + ${n(A.lidFloor)}, closeEdge - ${n(A.edgeClose)}, pEye.y);
        // 1. mirada: iris + esclera se desplazan dentro de la apertura
        pEye -= uGaze * ap;
        // 2. abrir de más: magnifica el contenido del ojo alrededor de su centro
        float widen = max(uLidWide, 0.0);
        pEye.y = c.y + (pEye.y - c.y) / (1.0 + widen * ${n(A.widen)} * ap);
        // 3. párpado INFERIOR sube (Duchenne / entrecerrar): trae piel desde abajo
        float lowT = smoothstep(closeEdge - ${n(A.lidLowLo)}, closeEdge + ${n(A.lidLowHi)}, pEye.y);
        pEye.y += lidLow * ${n(A.lidLow)} * lowT * hx;
        // 4. dilatación de pupila: warp radial gaussiano centrado en el iris real.
        //    Magnifica el disco central (pupila) y deja el limbo casi intacto.
        vec2 rel = pEye - iris;
        float rr = dot(rel, rel);
        float kd = uPupil * ${n(A.pupilGain)} * exp(-rr / (2.0 * PUPIL_R * PUPIL_R)) * ap;
        pEye = iris + rel / (1.0 + kd);
        apEye = ap;
        lashEye = hx * b * smoothstep(${n(A.lashSpan)}, 0.0, pEye.y - edge) * ${n(A.lashEye)};
        underEyeB = hx * lidLow * smoothstep(0.0, ${n(A.underEyeLo)}, pEye.y - closeEdge)
                       * smoothstep(${n(A.underEyeHi0)}, ${n(A.underEyeHi1)}, pEye.y - closeEdge);
      }

      // el brillo de la apertura y la sombra bajo el ojo también se ponderan:
      // si saltaran de golpe en el filo, el antialias del warp no serviría de nada
      p = mix(pLid, pEye, wOpen);
      apGlow = max(apGlow, apEye * wOpen);
      lash = max(lash, mix(lashLid, lashEye, wOpen));
      underEye = max(underEye, underEyeB * wOpen);
    }
  }

  // ================= BOCA =================
  float interior = 0.0;
  float mouthV = 0.0;
  float mouthJawPx = 0.0;
  float apertureOut = 0.0;
  float apWOut = 1.0;
  float lowLipShade = 0.0;
  if (mMouth > 0.01) {
    float m = mMouth;
    // Lip compression/rounding belongs to the vermilion, not the chin.
    // The broad mouth mask remains available for jaw translation.
    float lipWeight = 1.0 - smoothstep(${n(A.lipUpSpan)}, ${n(A.lipUpSpan * 2)}, abs(p.y - LIP_Y));
    // comisura por lado: media sonrisa torcida = ironía/duda
    float sideW = smoothstep(MOUTH_CX + ${n(A.sideSplit)}, MOUTH_CX - ${n(A.sideSplit)}, p.x);
    float sm = mix(uSmile.y, uSmile.x, sideW);
    float dxScreen = abs(p.x - MOUTH_CX);
    float apW = (${n(A.apW)} + uWide * ${n(A.apWide)} - uPucker * ${n(A.apPucker)}) * (0.55 + 0.45 * smoothstep(0.0, 0.65, uJaw));
    // PERFIL ELÍPTICO. Un smoothstep deja un plateau plano en el centro, y eso
    // es lo que hacía que la boca abriera como una RENDIJA recta de lado a lado.
    // Una boca real abre como una almendra: máximo en el centro, decayendo de
    // forma continua hasta cerrarse en las comisuras. pow(1-t*t, k) da esa
    // curva; k<1 la engorda para que no quede puntiaguda en los extremos.
    float t = clamp(dxScreen / max(apW, 1.0), 0.0, 1.0);
    float aperture = pow(max(0.0, 1.0 - t * t), 0.72);
    apertureOut = aperture;
    apWOut = apW;
    float xs = 1.0 + uWide * ${n(A.xsWide)} * m - uPucker * ${n(A.xsPucker)} * m + max(sm, 0.0) * ${n(A.xsSmile)} * m;
    p.x = MOUTH_CX + (p.x - MOUTH_CX) / max(xs, 0.55);
    float dx = abs(p.x - MOUTH_CX);
    // el recorrido de la mandíbula se ancla al ALTO DE LOS LABIOS de ESTA cara:
    // una boca grande recorre más que una chica, y por eso no es una constante
    float jawPx = uJaw * ${n(A.jawTravel)} * m * aperture;
    // el cigomático mayor tira de la comisura ARRIBA Y AFUERA (~40°): sin el
    // componente horizontal la boca se ve "levantada", no sonriendo.
    float cwOut = smoothstep(${n(A.cornerOutLo)}, ${n(A.cornerOutHi)}, dx);
    p.x -= sm * ${n(A.smileOut)} * m * cwOut * sign(p.x - MOUTH_CX + 0.001);
    // ARCO DE CUPIDO: el borde inferior del labio superior NO es una recta.
    // Baja en el centro (el tubérculo) y sube hacia las comisuras. Cortar el
    // interior con una horizontal es lo que dejaba un canto de tijera.
    float cupid = LIP_Y + ${n(A.cupidLift)} + ${n(A.cupidBump)} * exp(-dx * dx / (2.0 * ${n(A.cupidSigma)} * ${n(A.cupidSigma)}));
    // La frontera arriba/abajo tiene que caer EXACTAMENTE donde termina el
    // labio superior una vez desplazado (sube jawPx*${n(A.lipShare)}). Si no coinciden,
    // queda un escalón visible entre el bermellón y la cavidad.
    float lipBound = cupid - jawPx * ${n(A.lipShare)};
    if (p.y > lipBound) {
      float cw = smoothstep(${n(A.cornerLo)}, ${n(A.cornerHi)}, dx);
      p.y += sm * ${n(A.smileLow)} * m * cw;
      p.y = LIP_Y + (p.y - LIP_Y) * (1.0 + uPress * ${n(A.pressGain)} * m * lipWeight);
      p.y += uLipUp * ${n(A.lipUpGain)} * m * smoothstep(${n(A.lipUpSpan)}, 0.0, p.y - LIP_Y);
      p.y = LIP_Y + (p.y - LIP_Y) / (1.0 + uPucker * ${n(A.puckerLow)} * m * lipWeight);
      float srcY = p.y - jawPx;
      if (srcY < cupid) {
        // degradado en el borde: menos que esto y el labio superior termina en
        // escalón; más, y la boca pierde el filo del bermellón.
        interior = smoothstep(0.0, ${n(A.interiorFeather)}, cupid - srcY) * smoothstep(0.15, 0.5, m)
                 * smoothstep(0.03, 0.26, aperture);
        mouthV = clamp((p.y - lipBound) / max(jawPx * 1.05, 1.0), 0.0, 1.0);
        mouthJawPx = jawPx;
        // En el degradado del borde inferior la cavidad se mezclaba con el arte SIN desplazar, que ahí es
        // el filo brillante del labio: salía una franja blanca bajo la sombra. Se mezcla con el labio ya
        // desplazado (el que de verdad está debajo) y en su sombra de contacto.
        p.y = srcY;
        // solo en el degradado del borde: dentro de la cavidad plena la sombra la oscurecía al 30 % y toda
        // abertura grande salía negra pura (juez iter-08; error de iter-24).
        lowLipShade = smoothstep(1.0, 6.0, jawPx) * m * (1.0 - interior);
      } else {
        // SOMBRA DE CONTACTO (Arbrain, 4 oct). La fila de arriba del labio inferior es, en el arte, el
        // filo brillante donde los labios se tocan; al abrir se estira como una franja blanca y dentada
        // que se lee como dientes. Con la boca abierta esas filas quedan en la sombra de la cavidad.
        lowLipShade = (1.0 - smoothstep(0.0, 12.0, srcY - cupid)) * smoothstep(1.0, 6.0, jawPx) * m;
        p.y = srcY;
      }
    } else {
      // El labio SUPERIOR también trabaja: en el habla real la mandíbula pone
      // ~75% del recorrido y el labio de arriba el resto. Que baje todo el
      // inferior y el superior quede clavado es lo que da el gesto de títere.
      p.y += jawPx * ${n(A.lipShare)};
      // y el bermellón de arriba se ADELGAZA al separarse (se estira sobre el
      // arco dental): sin esto los labios se leen como goma que se despega.
      p.y = LIP_Y - (LIP_Y - p.y) * (1.0 + uJaw * ${n(A.thinJaw)} * m * aperture);
      p.y = LIP_Y - (LIP_Y - p.y) / (1.0 + uPucker * ${n(A.puckerUp)} * m * lipWeight);
      float cw = smoothstep(${n(A.cornerLo)}, ${n(A.cornerHi)}, dx);
      p.y += sm * ${n(A.smileUp)} * m * cw * smoothstep(-${n(A.smileUpSpan)}, 0.0, p.y - LIP_Y);
      // al sonreír el labio superior se ADELGAZA (se estira sobre los dientes)
      p.y = LIP_Y - (LIP_Y - p.y) * (1.0 - max(sm, 0.0) * ${n(A.thinSmile)} * m);
    }
  }

  // ---- mejillas: la "manzana" del pómulo sube al sonreír y empuja el párpado
  // inferior desde abajo. Es lo que hace que una sonrisa se vea en TODA la cara.
  // El empuje está bajo a propósito: más alto, el pómulo se hincha y aplasta el
  // labio superior contra la nariz.
  float smPos = max(uSmile.x, 0.0), smPosR = max(uSmile.y, 0.0);
  vec2 dcl = pFace - CHEEK_L, dcr = pFace - CHEEK_R;
  float chL = exp(-dot(dcl, dcl) / (2.0 * ${n(A.cheekSigma)} * ${n(A.cheekSigma)})) * smPos;
  float chR = exp(-dot(dcr, dcr) / (2.0 * ${n(A.cheekSigma)} * ${n(A.cheekSigma)})) * smPosR;
  p.y += (chL + chR) * ${n(A.cheekRise)};

  // --- sample final ---
  vec2 dFacial = p - pFrontal0;           // lo que la cara se deformó, en espacio frontal
  vec3 col = tex(p);
  if (yawW > 0.0005) {
    vec3 cv = uYaw < 0.0 ? texL(pView + dFacial) : texR(pView + dFacial);
${GIRO_GLOBAL ? `
    // Comparador: fundido global puro. Movimiento natural, pero a media pose las
    // dos pinturas coexisten al 50 % y los contornos se ven duplicados.
    col = mix(col, cv, yawW);` : GIRO_BANDAS ? `
    // FUNDIDO POR BANDAS. El campo lleva ambas fuentes a la misma geometría,
    // pero un alpha global a w=0.5 todavía superponía dos pinturas completas.
    // La vista 3/4 barre la cara desde el lado del giro: cada rasgo usa una sola
    // textura y solo una costura de 5 % mezcla. Así no hay doble chip/nariz/boca
    // ni el salto de cuadro completo que produciría elegir la vista de golpe.
    float faceX = clamp(pFace.x / IMG, 0.0, 1.0);
    float sweep = uYaw < 0.0 ? 1.0 - faceX : faceX;
    float seam = 1.05 - 1.10 * yawPose;
    float viewBand = smoothstep(seam - 0.025, seam + 0.025, sweep);
    col = mix(col, cv, viewBand * yawFade);` : `
    // FUNDIDO MULTIBANDA (default). El fantasma de media pose no es un problema de
    // "mezclar demasiado": es que se cruzan DOS BANDAS DE FRECUENCIA a la vez. Lo
    // suave (color, luz, volumen) puede cruzarse globalmente sin que nadie lo note
    // —de hecho es lo que hace que el giro se lea orgánico—. Lo que se ve doble es
    // el DETALLE: el filo del cráneo, la oreja, la línea de mandíbula. Así que la
    // banda baja se cruza igual que siempre y la banda alta se toma de una sola
    // vista, cambiando de dueño en una ventana estrecha alrededor de media pose.
    // No hay frontera en pantalla: la separación vive en frecuencia, no en espacio.
    const float MB_RADIO = 11.0;   // px del corte entre bandas
    const float MB_ANCHO = 0.045;  // media ventana del relevo. ESTRECHA A PROPÓSITO:
                                   // en w=.5 exacto las dos vistas pesan igual y ninguna
                                   // ponderación continua puede evitar el cruce; lo único
                                   // que se elige es DÓNDE poner la discontinuidad. Va en el
                                   // tiempo, en un instante que el resorte cruza a máxima
                                   // velocidad, en vez de en el espacio atravesando la cara.
    const float MB_SUAVE = 0.30;   // el relevo se cubre con un punto de desenfoque: en el
                                   // fotograma más rápido del giro se lee como motion blur.
    vec3 loF = lowPass(uTex, p, MB_RADIO);
    vec3 loV = uYaw < 0.0 ? lowPass(uViewL, pView + dFacial, MB_RADIO)
                          : lowPass(uViewR, pView + dFacial, MB_RADIO);
    vec3 low  = mix(loF, loV, yawW);                        // la esencia del movimiento
    float hw  = smoothstep(0.5 - MB_ANCHO, 0.5 + MB_ANCHO, yawW);
    vec3 high = mix(col - loF, cv - loV, hw);                // detalle de UNA sola vista
    high *= 1.0 - MB_SUAVE * (1.0 - abs(2.0 * hw - 1.0));    // relevo sin chasquido
    col = low + high;`}
  }

  // Cavidad procedural para rigs sin vista oral; si existe una pintura de boca
  // abierta se revela a través de la apertura calculada y conserva oclusión.
  if (interior > 0.001) {
    float v = mouthV;                                   // 0 = bajo el labio sup, 1 = fondo
    float occl = 1.0 - smoothstep(0.0, 0.36, v);        // oclusión de contacto
    vec3 cav = mix(${v3(A.cavWall)},                    // pared
                   ${v3(A.cavDeep)},                    // fondo, casi negro cálido
                   smoothstep(0.12, 0.88, v));
    cav = mix(cav, ${v3(A.cavOccl)}, occl * 0.74);
    // lengua apenas insinuada, y solo cuando la apertura es grande de verdad
    float tongue = smoothstep(0.70, 0.96, v) * smoothstep(${n(A.tongueLo)}, ${n(A.tongueHi)}, mouthJawPx);
    cav = mix(cav, ${v3(A.cavTongue)}, tongue * 0.55);
    // La pintura aporta dientes y lengua; el muestreo evita comprimir todas
    // sus regiones en una sola franja al abrir poco.
    if (uLayers.w > 0.5) {
      float su = clamp((p.x - MOUTH_CX) / max(apWOut, 1.0), -1.0, 1.0) * 0.5 + 0.5;
      // Reveal a slice of the painted interior as the jaw opens. Compressing
      // the entire box into every aperture stacked both tooth rows and tongue
      // into horizontal bands, even on a barely open mouth.
      float aaHeight = max(1.0, uAABox.w - uAABox.y);
      float oralV = 0.06 + v * min(0.94, mouthJawPx / aaHeight);
      vec3 drawn = texAA(vec2(mix(uAABox.x, uAABox.z, su), mix(uAABox.y, uAABox.w, oralV)));
      drawn *= 1.0 - occl * 0.55;
      cav = mix(cav, drawn, smoothstep(2.0, 9.0, mouthJawPx));
    }
    // hacia las comisuras la cavidad se funde con el labio: sin esto el interior
    // termina en un canto recto y se ve recortado con tijera
    cav *= 0.28 + 0.72 * apertureOut;
    col = mix(col, cav, interior);
  }
  col *= 1.0 - lowLipShade * 0.7;

  // sombra de pestañas al parpadear
  col *= 1.0 - lash * 0.45;
  // el párpado cerrado de verdad (hoja de personaje), solo sobre la frontal
  if (closedW > 0.001 && uLayers.z > 0.5) {
    col = mix(col, texClosed(pFrontal0 + uClosedOff), closedW * (1.0 - yawW));
  }

  // ---- pliegues procedurales de expresión (el arte base no los trae) ----
  //
  // ROSTRO IDEALIZADO. Estos pliegues se calibran para una cara FOTOGRÁFICA, y
  // estas ilustraciones no lo son: están pintadas con piel de aerógrafo, sin un
  // solo pliegue. Sobre esa base, un surco que en una foto pasa desapercibido
  // aparece como MANCHA SUCIA — la cara se arruga justo cuando sonríe, que es
  // cuando debería verse mejor.
  //
  // Se bajan las intensidades, no se eliminan: el gesto sigue leyéndose, pero
  // deja de cavar. Es solo OSCURECIMIENTO (col *= …): cero riesgo geométrico.
  col *= 1.0 - glabella * ${n(A.glabellaDark)};      // ceño: surco vertical entre cejas
  col *= 1.0 - underEye * ${n(A.underEyeDark)};      // Duchenne: pliegue infrapalpebral

  // Surco nasogeniano: el pliegue que baja del ala de la nariz a la comisura.
  // Es LA firma de una sonrisa en 2D. Sin él la boca se lee como un gesto raro;
  // con él el cerebro lo lee como alegría antes de procesar nada más.
  {
    float u = clamp((pFace.y - ${n(A.noseY)}) / ${n(A.foldSpan)}, 0.0, 1.0);
    // la curva arquea hacia AFUERA en el medio (un surco recto se ve dibujado)
    float w = pow(u, 0.72) + 0.22 * sin(u * 3.14159);
    float foldL = ${n(A.noseL)} - ${n(A.foldBowL)} * w;
    float foldR = ${n(A.noseR)} + ${n(A.foldBowR)} * w;
    // la intensidad es máxima en el TERCIO MEDIO y se apaga en los extremos:
    // arriba nace del ala de la nariz, abajo muere antes de llegar al mentón
    float env = smoothstep(0.0, 0.30, u) * smoothstep(1.02, 0.52, u);
    float fL = smoothstep(${n(A.foldWideLo)}, ${n(A.foldWideHi)}, abs(pFace.x - foldL)) * env * smPos;
    float fR = smoothstep(${n(A.foldWideLo)}, ${n(A.foldWideHi)}, abs(pFace.x - foldR)) * env * smPosR;
    // hoyuelo/sombra en la comisura misma (donde el músculo ancla). Bajo a
    // propósito: más alto pone dos manchas oscuras a los lados de la boca.
    vec2 kL = pFace - ${v2(A.dimpleL)}, kR = pFace - ${v2(A.dimpleR)};
    fL += exp(-dot(kL, kL) / (2.0 * ${n(A.dimpleSigma)} * ${n(A.dimpleSigma)})) * smPos * ${n(A.dimpleAmt)};
    fR += exp(-dot(kR, kR) / (2.0 * ${n(A.dimpleSigma)} * ${n(A.dimpleSigma)})) * smPosR * ${n(A.dimpleAmt)};
    col *= 1.0 - clamp(fL + fR, 0.0, 1.6) * ${n(A.foldDark)};
  }
  // luz en la manzana del pómulo (la piel tensa rebota más luz)
  col *= 1.0 + (chL + chR) * ${n(A.cheekLight)};
  // el bolo al tragar toma un reflejo propio en la garganta
  col *= 1.0 + swalShade * ${n(A.bolusLight)};

  // --- vida ambiental (sutil, sobre las zonas que YA brillan en el arte) ---
  vec4 mb = maskB(p);
  col *= 1.0 + mb.r * uChipPulse * ${n(A.chipGain)};
  float wave = sin(uTime * 1.1 + (p.x + p.y * 1.4) * 0.011);
  col += mb.g * pow(max(wave, 0.0), 3.0) * ${v3(A.brainTint)} * (${n(A.brainBase)} + ${n(A.brainGain)} * uBrainPulse);
  float strip = smoothstep(${n(A.stripHalf)}, 0.0, abs(p.x - ${n(A.faceCx)})) * smoothstep(0.3, 0.9, depthAt(p));
  // La línea de luz del rostro no cruza la boca abierta: sumada después de la cavidad dejaba una costura
  // vertical rojiza dentro de la «o» (juez iter-07).
  col += strip * uSpeakGlow * ${v3(A.stripTint)} * ${n(A.speakGlow)} * (1.0 - interior) * (1.0 - smoothstep(0.05, 0.5, mMouth));
  float bg = 1.0 - smoothstep(0.05, 0.25, depthAt(p));
  col *= 1.0 + bg * uBreath * ${n(A.bgBreath)};
  float blinkAvg = (uBlink.x + uBlink.y) * 0.5;
  col += apGlow * uSpeakGlow * ${v3(A.apGlow)} * (1.0 - blinkAvg);

  // MODO MATTE: el mismo fotograma, pero lo que se pinta es la opacidad del
  // personaje, muestreada con los MISMOS warps que el color (párpado, boca,
  // giro). El render sin pantalla lo captura como segundo pase y ffmpeg lo
  // convierte en alpha. En pantalla nunca se enciende.
  if (uMatteMode > 0.5) {
    float aF = texture(uMatte, clamp(p / IMG, 0.001, 0.999)).r;
    vec3 mv = texture(uMatte, clamp((pView + dFacial) / IMG, 0.001, 0.999)).rgb;
    float aV = uYaw < 0.0 ? mv.g : mv.b;
    float a = mix(aF, aV, yawW);
    outColor = vec4(vec3(a), 1.0);
    return;
  }
  outColor = vec4(col, 1.0);
}`;
}

// ---------- utilidades WebGL ----------
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
  return s;
}

function loadTex(gl, unit, url, cb, nearest = false) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 2, 12, 255]));
  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    cb && cb();
  };
  img.onerror = () => cb && cb(new Error('no cargó ' + url));
  img.src = url;
  return t;
}

const UNIFORMS = ['uTex', 'uMaskA', 'uMaskB', 'uDepth', 'uCanvas', 'uTime', 'uParallax', 'uGaze',
  'uBlink', 'uBrow', 'uFurrow', 'uLidWide', 'uLidLow', 'uPupil', 'uBreath', 'uHeadShift', 'uHeadRot',
  'uJaw', 'uWide', 'uPucker', 'uPress', 'uLipUp', 'uSmile', 'uChipPulse', 'uBrainPulse', 'uSpeakGlow',
  'uSwallow', 'uViewL', 'uViewR', 'uFlowL', 'uFlowR', 'uViewClosed', 'uViewAA', 'uYaw', 'uLayers',
  'uClosedOff', 'uAABox', 'uFlowRange', 'uMatte', 'uMatteMode'];

// ---------- techo de apertura de la mandíbula ----------
// La ilustración tiene la boca CERRADA y el shader no pinta dientes: oscurece la
// cavidad y sugiere el contacto de los labios. Mientras la apertura es moderada
// eso se lee como una boca abierta de verdad; pasado cierto punto el interior es
// un óvalo negro sin estructura y la cara se vuelve rara — es el origen de las
// "caras raras" que se veían en el habla.
//
// El codo y el techo NO se heredan: se calibran por BARRIDO sobre CADA cara
// (tools/sweep-jaw.mjs) y se escriben en geometry.js.
//
// Esto COMPRIME en vez de recortar: por debajo del codo no toca nada, y por
// encima aplasta asintóticamente hacia el techo. Así la dinámica del habla se
// conserva y el pico deja de caer en el hueco negro. Un clamp duro haría lo
// contrario: aplanaría todas las vocales abiertas contra el mismo valor.
function makeSoftCeil(knee, ceil) {
  const room = ceil - knee;
  return (v) => (v <= knee ? v : knee + room * (1 - Math.exp(-(v - knee) / room)));
}

// ---------- el rig ----------
export class Rig {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   *   base        raíz desde la que colgar assets/ (default: '.')
   *   lidFeather  ancho del degradado del filo del párpado, en px del arte. SOLO
   *               PARA MEDIR: con 0 vuelve al corte duro, que es lo que permite
   *               publicar el antes/después. En producción no se pasa.
   *   jaw         {knee, ceil} para forzar otro techo de mandíbula. También solo
   *               para medir: el bueno lo calibra tools/sweep-jaw.mjs.
   *   geo         geometría alternativa (el gate de regresión monta a Trinity con
   *               sus constantes auditadas por aquí).
   */
  constructor(canvas, { base = '.', lidFeather = null, jaw = null, geo = null,
                        parallaxNeck = null, views = true, capas = {} } = {}) {
    const opts_noViews = !views;
    // CAPAS POR SUPERFICIE (Arbrain Live, 4 oct 2026). Daniel, viendo hablar a Levy: «no me gusta
    // que tenga dientes» y «a la mitad del movimiento se ve doble, como bizco». Las dos cosas son
    // capas pintadas: la boca abierta trae dientes, y el giro FUNDE la frontal con la vista ¾, así
    // que a media pose hay dos pares de iris. Una superficie puede apagarlas y quedarse con UNA sola
    // imagen deformada de forma continua (giro por parallax de profundidad, cavidad procedural).
    // Por defecto todo sigue encendido: los labs de la comunidad no cambian.
    const capaOn = { giro: capas.giro !== false, cerrado: capas.cerrado !== false, boca: capas.boca !== false };
    this.canvas = canvas;
    this.base = base;
    this.geo = geo || GEO;
    this.anat = deriveAnatomy(this.geo, { lidFeather, parallaxNeck });
    // Brillo de habla en la abertura del ojo: al sonar la voz aclaraba la esclera y viraba el iris a cian,
    // y el ojo se leía ABIERTO DE MÁS durante toda la frase (juez iter-07, 10.25→10.32 s). La superficie
    // puede apagarlo (`capas.brilloOjos: false`); la línea de luz del rostro sigue pulsando con la voz.
    if (capas.brilloOjos === false) this.anat = { ...this.anat, apGlow: [0, 0, 0] };
    // Cavidad de un solo tono (juez iter-08): el fondo al 30 % del color medido de la boca era negro puro
    // y solo aparecía en las aperturas grandes («O» de la primera sílaba). Con la superficie que lo pide,
    // paredes, fondo y oclusión van al mismo morado oscuro (el color medido es ≈ RGB 8,2,18: casi negro).
    // Respiración más visible en pecho y hombros (juez iter-09: «en reposo casi no se mueve»). Solo mueve
    // la región del pecho; la cara no se toca.
    if (capas.torso) this.anat = { ...this.anat, torsoRise: capas.torso, torsoY0: (this.geo.head.cy + this.geo.head.ry) * 1.0, torsoY1: (this.geo.head.cy + this.geo.head.ry) + 130 };
    if (capas.respiracion) this.anat = { ...this.anat, breathRise: this.anat.breathRise * capas.respiracion };
    if (capas.cavidadPareja) {
      const c = this.geo.mouth.cavity;
      this.anat = { ...this.anat, cavWall: c.map((v) => v * 2.4), cavDeep: c.map((v) => v * 1.8), cavOccl: c.map((v) => v * 1.0), cavTongue: c.map((v) => v * 2.4) };
    }
    this.running = true;
    this.ready = false;
    const J = jaw || this.geo.jaw;
    this.jawCeiling = { knee: J.knee, ceil: J.ceil };
    this.softCeilJaw = makeSoftCeil(J.knee, J.ceil);

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    this.fragSrc = buildFrag(this.anat);
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, this.fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const nm of UNIFORMS) this.u[nm] = gl.getUniformLocation(prog, nm);
    // Capas de la hoja de personaje (assets/views/views.json, lo escribe
    // tools/views.py). Son opcionales: sin manifiesto el rig es el de siempre.
    // `ready` espera TAMBIÉN a las capas para que una captura determinista no
    // pille la frontal sola en el primer fotograma y la vista en el segundo.
    this.layers = [0, 0, 0, 0];
    this.views = null;
    this.flowRange = 160;
    this.closedOff = [0, 0];
    this.aaBox = [0, 0, 0, 0];
    let loaded = 0, expected = 4;
    const done = () => { if (++loaded === expected) { this.ready = true; canvas.dispatchEvent(new Event('rig-ready')); } };
    const cargaBase = () => {
      loadTex(gl, 0, `${base}/assets/${this.geo.art}`, done);
      loadTex(gl, 1, `${base}/assets/masks_a.png`, done);
      loadTex(gl, 2, `${base}/assets/masks_b.png`, done);
      loadTex(gl, 3, `${base}/assets/depth.png`, done);
    };
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1i(this.u.uMaskA, 1);
    gl.uniform1i(this.u.uMaskB, 2);
    gl.uniform1i(this.u.uDepth, 3);
    gl.uniform1i(this.u.uViewL, 4);
    gl.uniform1i(this.u.uFlowL, 5);
    gl.uniform1i(this.u.uViewR, 6);
    gl.uniform1i(this.u.uFlowR, 7);
    gl.uniform1i(this.u.uViewClosed, 8);
    gl.uniform1i(this.u.uViewAA, 9);
    gl.uniform1i(this.u.uMatte, 10);
    for (const unit of [4, 5, 6, 7, 8, 9, 10]) loadTex(gl, unit, 'data:,', null);   // placeholders 1×1
    this.matteMode = 0;
    fetch(`${base}/assets/views/views.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((man) => {
      if (man && !(opts_noViews)) {
        this.views = man;
        const V = `${base}/assets/views`;
        const capas = [];
        if (man.yawL && capaOn.giro) capas.push([4, `${V}/${man.yawL.view}`, false, 0], [5, `${V}/${man.yawL.flow}`, true, null]);
        if (man.yawR && capaOn.giro) capas.push([6, `${V}/${man.yawR.view}`, false, 1], [7, `${V}/${man.yawR.flow}`, true, null]);
        if (man.closed && capaOn.cerrado) { capas.push([8, `${V}/${man.closed.view}`, false, 2]); this.closedOff = [man.closed.dx, man.closed.dy]; }
        // Trinity conserva la cavidad sutil con lengua; la pintura oral añade dientes no deseados.
        if (man.aa && capaOn.boca && this.geo.name !== 'trinity') { capas.push([9, `${V}/${man.aa.view}`, false, 3]); this.aaBox = man.aa.box; }
        if (man.matte) capas.push([10, `${V}/${man.matte.file}`, false, null]);
        if (man.yawL) this.flowRange = man.yawL.range; else if (man.yawR) this.flowRange = man.yawR.range;
        expected += capas.length;
        for (const [unit, url, nearest, layer] of capas) {
          loadTex(gl, unit, url, (err) => { if (!err && layer !== null) this.layers[layer] = 1; done(); }, nearest);
        }
      }
      cargaBase();
    });

    this.life = new LifeBrain({ gaze: this.geo.gaze, k: this.anat.k });
    this.emo = new EmotionMixer('neutral');
    this.mouse = [0, 0];
    // Quién manda sobre la mirada. Por defecto el puntero (lab, onboarding). Una
    // superficie que necesite SOSTENER una pose —la llamada mientras el agente
    // piensa— levanta la bandera y el puntero deja de escribir. Sin esto, quien
    // reimponga la pose pelea contra este handler cada vez que el cursor se mueve:
    // la cabeza va al cursor, la pose la regresa, y `life` se queda mirando una
    // posición que ya no es la del cursor.
    this.pointerLock = false;
    this.parallax = [0, 0];
    this.head = { x: 0, y: 0, yaw: 0, vx: 0, vy: 0, vyaw: 0 };   // resorte del cuello (sigue a los ojos)
    this.frozen = false;
    this.overrides = {};
    this.speech = null;
    this.audioCtx = null;
    this.params = {};
    this.viseme = 'sil';
    this.t = 0;
    this.last = performance.now() / 1000;

    // EL CURSOR se escucha en toda la ventana, no solo sobre el lienzo: si la
    // cara solo reacciona cuando el ratón está encima de ella, deja de mirarte
    // justo cuando te alejas — que es cuando más se nota que hay alguien ahí.
    this._onPointer = (e) => {
      if (this.pointerLock) return;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const m = clampElipse(((e.clientX - r.left) / r.width) * 2 - 1,
                            ((e.clientY - r.top) / r.height) * 2 - 1,
                            MOUSE_MAX, MOUSE_MAX);
      this.life.notePointer(m[0], m[1]);
      this.mouse = m;
    };
    this._onOrient = (e) => {
      if (this.pointerLock) return;
      if (e.gamma == null) return;                 // móvil: inclinar es el cursor
      const m = clampElipse(e.gamma / 25, (e.beta - 45) / 25, 1, 1);
      this.life.notePointer(m[0], m[1]);
      this.mouse = m;
    };
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    window.addEventListener('deviceorientation', this._onOrient);

    // Eficiencia (Arbrain, 6 oct 2026): quien monta el rig puede pausarlo (`pausado`, la app sin foco) o
    // ponerle tope de cuadros (`fpsMax`, la cara en reposo). El reloj del frame sigue siendo performance.now,
    // así que la vida (parpadeo, respiración) va a su velocidad real con menos cuadros.
    // Pausado, el bucle se duerme del todo (ni un callback por cuadro) hasta `despertar()`.
    this.pausado = false; this.fpsMax = 0; this._cuadro = 0; this._dormido = false;
    const loop = (ts) => {
      if (!this.running) return;
      if (this.pausado) { this._dormido = true; return; }
      this._cuadro = ts; this.frame();
      // Con tope, el siguiente cuadro se pide tras dormir el hueco: sin un callback por refresco de pantalla que
      // mantenga al navegador produciendo cuadros para nada.
      if (this.fpsMax) setTimeout(() => requestAnimationFrame(loop), Math.max(0, 1000 / this.fpsMax - 8));
      else requestAnimationFrame(loop);
    };
    this._loop = loop;
    requestAnimationFrame(loop);
  }

  despertar() {
    this.pausado = false;
    if (this._dormido && this.running) { this._dormido = false; requestAnimationFrame(this._loop); }
  }

  dispose() {
    this.running = false;
    this.stopSpeech();
    window.removeEventListener('pointermove', this._onPointer);
    window.removeEventListener('deviceorientation', this._onOrient);
    try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ya se fue */ }
  }

  stopSpeech() {
    try { if (this.speechSrc) this.speechSrc.stop(); } catch { /* ya paró */ }
    this.speechSrc = null;
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch { /* sin TTS */ }
    this.speech = null;
  }

  /**
   * Habla enganchada a un <audio> ya horneado: el reloj es el audio y los
   * visemas vienen anclados a la ventana real de cada palabra (bake.py).
   *
   * Es la diferencia entre estimar y saber. El camino viejo calculaba una
   * timeline a ojo y la escalaba a la duración total, así que el error se
   * acumulaba y a mitad de frase la boca iba por su cuenta. Aquí cada fonema
   * ya viene clavado al instante en que suena; no hay nada que estimar.
   */
  speakTimeline(utt) {
    this.stopSpeech();
    this.inhale(0.8);                      // toma aire antes de arrancar
    this.speech = {
      utt,
      tl: { events: utt.meta.events, total: utt.meta.total },
      dur: utt.meta.audioDur,
      text: utt.meta.text,
      t0: performance.now() / 1000,
      analyser: null, amp: 0, hi: 0, prevAmp: 0,
    };
    return this;
  }

  /**
   * Masa de la mandíbula y de los labios. Los visemas dicen a qué pose ir;
   * esto pone la física. Cada canal es un resorte semi-implícito: la boca
   * acelera hacia el objetivo, llega y frena, en vez de teletransportarse.
   *
   * Las frecuencias no son de adorno — salen de qué tan pesada es cada parte.
   * La mandíbula es el hueso más lento (~13 Hz), los labios responden más
   * rápido (~19 Hz) y el sello de una "m/b/p" es casi instantáneo (~26 Hz),
   * que es justo por qué esas consonantes se leen tan nítidas en una cara.
   *
   * @see softCeilJaw — el techo se aplica al OBJETIVO, antes de la inercia.
   */
  _mouthInertia(target, dt) {
    if (!this._mi) {
      this._mi = { v: { jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0 },
                   d: { jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0 } };
    }
    const HZ = { jaw: 13.0, wide: 19.0, pucker: 17.0, press: 26.0, lipUp: 21.0 };
    const Z = { jaw: 0.86, wide: 0.92, pucker: 0.92, press: 1.0, lipUp: 0.95 };
    const h = Math.min(dt, 1 / 30);        // un frame perdido no dispara la boca
    const out = {};
    for (const k in target) {
      const w = HZ[k] * 2 * Math.PI, z = Z[k];
      const x = this._mi.v[k] - target[k];
      this._mi.d[k] = (this._mi.d[k] - w * w * x * h) / (1 + 2 * z * w * h + w * w * h * h);
      this._mi.v[k] += this._mi.d[k] * h;
      out[k] = this._mi.v[k];
    }
    return out;
  }

  // ---- API de emociones ----
  /** Cambia de estado emocional (interpolado por resortes, nunca un salto). */
  emotion(name, opts) { this.emo.set(name, opts); return this; }
  /** Acento momentáneo sobre un canal (prosodia, reacción puntual). */
  pulse(ch, amp, dur) { this.emo.pulse(ch, amp, dur); return this; }
  get emotions() { return EMOTION_NAMES; }

  set(name, v) { this.overrides[name] = v; }
  clearOverrides() { this.overrides = {}; }
  freeze(f = true) { this.frozen = f; }

  /** Salta a un instante concreto del reloj de vida (QA reproducible). */
  seek(seconds) { this.life.seek(seconds); this.t = seconds; }

  pose(name) {
    const poses = {
      neutral: { gaze: [0, 0] }, blink: { blink: 1 }, halfblink: { blink: 0.55 },
      aa: { jaw: 0.95, wide: 0.2 }, E: { jaw: 0.55, wide: 0.6 }, I: { jaw: 0.28, wide: 0.85 },
      O: { jaw: 0.68, pucker: 0.65 }, U: { jaw: 0.34, pucker: 0.95 }, PP: { press: 1 },
      FF: { jaw: 0.08, lipUp: 1 }, smile: { smile: 1, wide: 0.3 },
    };
    this.overrides = { blink: 0, jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0, smile: 0,
      gaze: [0, 0], ...(poses[name] || {}) };
  }

  /** Toma aire (antes de hablar). Sube rápido y se sostiene, luego decae. */
  inhale(amount = 1, rise = 0.42) { this._breathEv = { t0: this.t, rise, amount, sign: 1 }; }
  /** Suelta el aire (al terminar de hablar). Cae y se recompone. */
  exhale(amount = 0.7) { this._breathEv = { t0: this.t, rise: 0.28, amount, sign: -1 }; }

  _breathEvent() {
    const e = this._breathEv;
    if (!e) return 0;
    const s = this.t - e.t0;
    if (s > e.rise + 2.6) { this._breathEv = null; return 0; }
    const up = Math.min(1, Math.pow(Math.max(s, 0) / e.rise, 0.7));
    const decay = Math.exp(-Math.max(0, s - e.rise) / 0.95);
    return e.sign * e.amount * up * decay;
  }

  async ensureAudio() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    return this.audioCtx;
  }

  /** Habla con audio real + texto → lip-sync (visemas + energía del audio). */
  async speak({ audioUrl, text, visemes }) {
    const ctx = await this.ensureAudio();
    const resp = await fetch(audioUrl);
    const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
    const tl = visemes ? visemes : scaleTimeline(textToVisemes(text), buf.duration);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    src.start();
    this.speechSrc = src;
    this.speech = { tl, t0: ctx.currentTime, analyser, text, dur: buf.duration, amp: 0, hi: 0, prevAmp: 0 };
    return new Promise((res) => {
      src.onended = () => {
        if (this.speechSrc === src) this.speechSrc = null;
        this.speech = null;
        res();
      };
    });
  }

  /** TTS del navegador: red de seguridad cuando no hay línea horneada. */
  speakBrowserTTS(text, voiceMatch = /paulina|jorge|juan|diego|carlos/i) {
    if (!('speechSynthesis' in window)) return null;
    const utter = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    utter.voice = voices.find((v) => voiceMatch.test(v.name))
      || voices.find((v) => /es[-_](MX|US|419)/i.test(v.lang))
      || voices.find((v) => v.lang.startsWith('es')) || null;
    utter.rate = 0.95;
    const tl = textToVisemes(text);
    const est = tl.total / 1000 / 0.95;
    const scaled = scaleTimeline(tl, est);
    utter.onstart = () => {
      this.speech = { tl: scaled, t0: performance.now() / 1000, analyser: null, text,
        dur: est, amp: 0.8, hi: 0, prevAmp: 0, wallclock: true };
    };
    utter.onend = () => { this.speech = null; };
    speechSynthesis.speak(utter);
    return est;
  }

  /** Habla en modo OFFLINE: sin AudioContext, la energía del audio viene
   *  precalculada fotograma a fotograma. Permite renderizar el lip-sync de
   *  forma determinista y medirlo contra la onda real. */
  speakOffline({ text = '', visemes, envelope, fps, dur }) {
    this.speech = { tl: visemes, text, dur, fps, env: envelope, frame: 0,
      amp: 0, hi: 0, offline: true, analyser: null };
    this.inhale(1);
    return this;
  }

  frame() {
    const now = performance.now() / 1000;
    // fixedDt: reproducción determinista paso a paso (render de vídeo, QA).
    // Con dt fijo desde t=0, la secuencia es idéntica byte a byte cada vez.
    let dt = this.fixedDt ?? Math.min(now - this.last, 0.05);
    this.last = now;
    if (this.frozen) dt = 0;
    this.t += dt;
    const gl = this.gl;
    const dpr = this.forceScale || Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h);

    const speaking = !!this.speech;
    const timeline = this.speech?.utt;
    const speechPaused = timeline?.paused === true;
    const E = this.emo.tick(dt);
    const mind = this.emo.mind();
    const life = this.life.tick(dt, { mouse: this.mouse, speaking, mind, emo: E });

    // parallax suavizado (resorte crítico), limitado a su ELIPSE.
    // El cursor entra clampado por eje a ±1.6, o sea a un RECTÁNGULO: en la
    // esquina el vector vale hypot(1.6,1.6) = 2.26, un 41 % más largo que en un
    // eje puro. Como el parallax desplaza cada píxel según su profundidad, ese
    // 41 % de más se convierte en 41 % más de cizalla justo en las diagonales
    // — que es donde el cuello se leía como frijol. Medido: la curvatura de las
    // diagonales era 2.2× la de los ejes en Levy y 2.5× en Sensei.
    const k = 1 - Math.exp(-dt * 5);
    this.parallax[0] += (this.mouse[0] - this.parallax[0]) * k;
    this.parallax[1] += (this.mouse[1] - this.parallax[1]) * k;
    const pe = clampElipse(this.parallax[0], this.parallax[1], MOUSE_MAX, MOUSE_MAX);
    this.parallax[0] = pe[0];
    this.parallax[1] = pe[1];

    // ---- boca: visemas + energía real del audio ----
    let mouth = { jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0 };
    let speakGlow = 0;
    if (speaking) {
      const s = this.speech;
      let tMs;
      if (s.offline) {
        // modo render: el tiempo lo marca el contador de fotogramas y la energía
        // del audio viene precalculada. Misma dinámica, cero dependencia del reloj.
        tMs = (s.frame / s.fps) * 1000;
        const e = s.env[Math.min(s.frame, s.env.length - 1)] || [0, 0];
        const prev = s.amp;
        s.amp += (e[0] - s.amp) * (1 - Math.exp(-dt * 20));
        s.hi += (e[1] - s.hi) * (1 - Math.exp(-dt * 26));
        this._onset(s, s.amp - prev);
        s.frame++;
        if (tMs > s.dur * 1000 + 260) { this.speech = null; this.exhale(); }
      } else if (s.utt) {
        // Media seconds are already affected by playbackRate. Evaluate the pose
        // at that instant, without a second wall-clock filter or fixed lead.
        // This makes seeking, pausing and speed changes share one clock.
        tMs = s.utt.t * 1000;
        const [lo, hi] = s.utt.amp(s.utt.t);
        const prev = s.amp;
        if (!speechPaused || s.lastMediaTime !== tMs) {
          s.amp = clamp(lo, 0, 1);
          s.hi = clamp(hi, 0, 1);
          this._onset(s, s.amp - prev);
        }
        if (tMs > s.dur * 1000 + 260) { this.speech = null; this.exhale(); }
      } else {
        tMs = ((s.wallclock ? performance.now() / 1000 : this.audioCtx.currentTime) - s.t0) * 1000;
        if (s.analyser) this._analyze(s, dt);
        if (tMs > s.dur * 1000 + 400) this.speech = null;
      }
      if (this.speech) {
        // MISMO reloj que la energía. Antes la forma se leía en tMs y la
        // amplitud 70 ms más adelante; ahora los dos canales miran el mismo
        // instante del audio.
        const ev = evalVisemes(s.tl, tMs + (s.utt ? 0 : LOOKAHEAD * 1000), s.utt ? s.lastMediaTime : null);
        mouth = ev.params;
        this.viseme = ev.viseme;
        // Piso y ganancia por voz (Arbrain, 4 oct): con energía exacta del PCM (levy-lipsync) el piso de
        // 0.35 dejaba las consonantes a medio abrir y aplanaba las vocales (juez iter-03: «la a y la o
        // deberían distinguirse»). La voz puede pedir otro piso y algo más de recorrido; por defecto, igual.
        const floor = s.utt?.ampFloor ?? 0.35, gain = s.utt?.jawGain ?? 1;
        const amp = floor + (1 - floor) * s.amp;
        mouth.jaw = this.softCeilJaw(mouth.jaw * amp * gain);
        mouth.wide = Math.min(1, mouth.wide + s.hi * 0.25);   // sibilantes ensanchan
        speakGlow = 0.4 + 0.6 * s.amp;
        this.speechTimeMs = tMs;
      }
    } else {
      this.viseme = 'sil';
    }

    // INERCIA DE LA MANDÍBULA. Los visemas dicen a qué POSE ir; esto pone la
    // masa. Una mandíbula real no salta entre poses: acelera, llega y frena.
    // Sin este filtro la boca tiembla aunque el timing sea perfecto — era la
    // otra mitad del gesto de títere, y no se arregla bajando la velocidad.
    // Timelines already contain continuous media-time transitions. Filtering
    // them again in wall time erases brief contacts at accelerated playback.
    // Keep physical inertia for the unaligned browser/analyser fallback only.
    if (!timeline) mouth = this._mouthInertia(mouth, dt);
    else if (this.speech) {
      if (speechPaused && this.speech.lastMediaTime === this.speechTimeMs && this.speech.lastMouth) mouth = { ...this.speech.lastMouth };
      this.speech.lastMediaTime = this.speechTimeMs;
      this.speech.lastMouth = { ...mouth };
      // Seed the release spring so cancellation returns from the actual pose.
      this._mi = { v: { ...mouth }, d: { jaw: 0, wide: 0, pucker: 0, press: 0, lipUp: 0 } };
    }

    // ---- cabeza: sigue a los OJOS con retraso, más deriva y respiración ----
    const hf = this.life.headFollow(life.gaze, dt);
    const A = this.anat;
    const hTargetX = life.headShift[0] + hf[0] + this.parallax[0] * 2.6 * A.k + (E.headTilt || 0) * 0.4;
    const hTargetY = life.headShift[1] + hf[1] + this.parallax[1] * 2.2 * A.k + (E.headNod || 0) * A.k;
    // YAW. La cabeza gira hacia donde está el cursor (o la cara del usuario, con
    // ?cam=1), a través del MISMO resorte del cuello: los ojos saltan primero,
    // el parallax se suaviza (k=5) y el giro llega el último. Se lee del parallax
    // ya resuelto (con su override) para que un banco que clava la cabeza clave
    // también el giro: si no, la sonda de mirada mediría el cuello otra vez.
    const parNow = this.overrides.parallax ?? this.parallax;
    const hTargetYaw = clamp(parNow[0] * YAW_GAIN + (E.headYaw || 0), -1, 1);
    const wS = 2 * Math.PI * 1.9, zS = 1.0;                  // resorte del cuello
    for (const [ax, tg] of [['x', hTargetX], ['y', hTargetY], ['yaw', hTargetYaw]]) {
      const vk = 'v' + ax;
      const x = this.head[ax] - tg;
      this.head[vk] = (this.head[vk] - wS * wS * x * dt) / (1 + 2 * zS * wS * dt + wS * wS * dt * dt);
      this.head[ax] += this.head[vk] * dt;
    }
    const headShift = this.overrides.headShift ?? [this.head.x, this.head.y];
    const yaw = this.overrides.yaw ?? this.head.yaw;
    const headRot = this.overrides.headRot ?? (life.headRot + (E.headTilt || 0) * Math.PI / 180
      + this.parallax[0] * 0.018 + (speaking ? Math.sin(this.t * 3.7) * 0.003 : 0));

    // Reflejo vestíbulo-ocular: los ojos compensan el vaivén INVOLUNTARIO del
    // cuello para sostener el contacto visual (la cabeza deriva, la mirada se
    // queda contigo). Ojo con el detalle fino: el VOR se SUPRIME cuando la
    // cabeza gira a propósito hacia donde miras — si no, cancelaría el propio
    // giro y los ojos parecerían pegados al centro. Por eso compensa solo la
    // deriva (`life.headShift`), nunca el seguimiento voluntario.
    const vorX = clamp(-life.headShift[0] * 0.45, -3.0 * A.k, 3.0 * A.k);
    const vorY = clamp(-life.headShift[1] * 0.32, -2.2 * A.k, 2.2 * A.k);

    const o = this.overrides;
    // GANANCIA EXPRESIVA POR CARA (geometry.js → anat.emoGain, 1 = Trinity). Las
    // amplitudes de emotions.js están calibradas sobre la cara de Trinity; en una
    // cara metálica o monocroma sin pliegues el mismo desplazamiento comunica
    // menos (gauntlet 2 ago y 3 sep: 0/5 emociones legibles en Levy y Sensei con
    // el mismo rig que sí se lee en Trinity). Escala solo lo que EXPRESA (cejas,
    // ceño, párpados, comisuras), nunca la cabeza ni la pupila. Es un número de
    // la cara, como el recorrido de mandíbula: se declara, no se hereda.
    const g = A.emoGain ?? 1;
    const eg = (v, hi = 1.25) => clamp(v * g, -1, hi);
    const P = {
      blink: [o.blink ?? life.blink, o.blink ?? life.blinkR],
      // La ceja que el habla suma por defecto (+0.12/+0.10). En Levy la ceja vive pegada al pliegue del
      // párpado y subirla abre el ojo: su voz la pone en 0 (`browSpeak`) y el ojo habla como en reposo.
      brow: [o.browL ?? (eg(E.browL) + (speaking ? 0.12 * (this.speech?.utt?.browSpeak ?? 1) : 0)),
             o.browR ?? (eg(E.browR) + (speaking ? 0.10 * (this.speech?.utt?.browSpeak ?? 1) : 0))],
      furrow: [o.furrowL ?? eg(E.furrowL, 1), o.furrowR ?? eg(E.furrowR, 1)],
      lidWide: o.lidWide ?? eg(E.lidWide, 1),
      lidLow: [o.lidLowL ?? eg(E.lidLowL, 1), o.lidLowR ?? eg(E.lidLowR, 1)],
      pupil: o.pupil ?? clamp(E.pupil + life.pupil, -0.9, 1.0),
      jaw: o.jaw ?? mouth.jaw,
      wide: o.wide ?? mouth.wide,
      pucker: o.pucker ?? mouth.pucker,
      press: o.press ?? clamp(mouth.press + (E.lipPress || 0) * 0.5, 0, 1),
      lipUp: o.lipUp ?? mouth.lipUp,
      smile: [o.smile ?? eg(E.smileL), o.smile ?? eg(E.smileR)],
      gaze: o.gaze ?? [life.gaze[0] + vorX, life.gaze[1] + vorY],
      headShift, headRot, yaw,
      breath: o.breath ?? clamp(life.breath + this._breathEvent(), -0.6, 2.4),
      parallax: o.parallax ?? this.parallax,
      swallow: o.swallow ?? life.swallow,
      averting: life.averting,
      // lo que mira el banco de pruebas
      saccading: life.saccading,
      mouse: this.mouse,
      speaking,
      viseme: this.viseme,
      emotion: this.emo.name,
      t: this.t,
    };
    this.params = P;

    gl.uniform2f(this.u.uCanvas, w, h);
    gl.uniform1f(this.u.uTime, this.t);
    gl.uniform2f(this.u.uParallax, P.parallax[0], P.parallax[1]);
    gl.uniform2f(this.u.uGaze, P.gaze[0], P.gaze[1]);
    gl.uniform2f(this.u.uBlink, P.blink[0], P.blink[1]);
    gl.uniform2f(this.u.uBrow, P.brow[0], P.brow[1]);
    gl.uniform2f(this.u.uFurrow, P.furrow[0], P.furrow[1]);
    gl.uniform1f(this.u.uLidWide, P.lidWide);
    gl.uniform2f(this.u.uLidLow, P.lidLow[0], P.lidLow[1]);
    gl.uniform1f(this.u.uPupil, P.pupil);
    gl.uniform1f(this.u.uBreath, P.breath);
    gl.uniform2f(this.u.uHeadShift, P.headShift[0], P.headShift[1]);
    gl.uniform1f(this.u.uHeadRot, P.headRot);
    gl.uniform1f(this.u.uJaw, P.jaw);
    gl.uniform1f(this.u.uWide, P.wide);
    gl.uniform1f(this.u.uPucker, P.pucker);
    gl.uniform1f(this.u.uPress, P.press);
    gl.uniform1f(this.u.uLipUp, P.lipUp);
    gl.uniform2f(this.u.uSmile, P.smile[0], P.smile[1]);
    gl.uniform1f(this.u.uChipPulse, o.chipPulse ?? (0.5 + 0.5 * Math.sin(this.t * 1.7)));
    gl.uniform1f(this.u.uBrainPulse, o.brainPulse ?? (0.5 + 0.5 * Math.sin(this.t * 0.9 + 1.0)));
    gl.uniform1f(this.u.uSpeakGlow, o.speakGlow ?? speakGlow);
    gl.uniform1f(this.u.uSwallow, P.swallow);
    gl.uniform1f(this.u.uYaw, P.yaw);
    gl.uniform4f(this.u.uLayers, this.layers[0], this.layers[1], this.layers[2], this.layers[3]);
    gl.uniform2f(this.u.uClosedOff, this.closedOff[0], this.closedOff[1]);
    gl.uniform4f(this.u.uAABox, this.aaBox[0], this.aaBox[1], this.aaBox[2], this.aaBox[3]);
    gl.uniform1f(this.u.uFlowRange, this.flowRange);
    gl.uniform1f(this.u.uMatteMode, this.matteMode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.onFrame) this.onFrame(P);
  }

  /**
   * Analiza el audio en dos bandas: la grave manda la MANDÍBULA (energía de
   * vocal), la aguda manda el ancho de labios (sibilantes s/ch). Un solo RMS
   * abre la boca igual para una "s" que para una "a", y eso se ve mal.
   * Además detecta ONSETS (subidas bruscas) → acentos de ceja y cabeceos.
   */
  _analyze(s, dt) {
    const a = s.analyser;
    const td = new Uint8Array(a.frequencyBinCount);
    a.getByteTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / td.length);
    const fd = new Uint8Array(a.frequencyBinCount);
    a.getByteFrequencyData(fd);
    const nyq = (this.audioCtx?.sampleRate || 48000) / 2;
    const bin = (hz) => Math.min(fd.length - 1, Math.round(hz / nyq * fd.length));
    let lo = 0, hi = 0;
    for (let i = bin(80); i < bin(600); i++) lo += fd[i];
    for (let i = bin(2600); i < bin(7000); i++) hi += fd[i];
    lo /= Math.max(1, bin(600) - bin(80)) * 255;
    hi /= Math.max(1, bin(7000) - bin(2600)) * 255;
    const target = Math.min(rms * 8.5 + lo * 0.55, 1.15);
    const prev = s.amp;
    s.amp += (target - s.amp) * (1 - Math.exp(-dt * 20));
    s.hi += (Math.min(hi * 2.4, 1) - s.hi) * (1 - Math.exp(-dt * 26));
    this._onset(s, s.amp - prev);
  }

  /**
   * ONSET de prosodia: un golpe de energía en el audio dispara un acento de
   * ceja y un cabeceo. Esto es lo que separa "boca que se abre y se cierra" de
   * "persona que enfatiza lo que dice". Es el detalle más barato y más rentable
   * de todo el rig: dos pulsos por sílaba tónica.
   */
  _onset(s, d) {
    if (d > 0.055 && s.amp > 0.42 && (this.t - (s.lastOnset ?? -9)) > 0.34) {
      s.lastOnset = this.t;
      // Arbrain (4 oct): el acento de prosodia está calibrado en Trinity. La ganancia expresiva de la
      // cara (emoGain 1.6 en Levy) lo multiplicaba y cada sílaba fuerte subía la ceja hasta abrir el ojo
      // y enseñar el blanco (juez iter-01/02, «sobresalto»). Se descuenta aquí para que el acento mida
      // lo mismo en las tres caras; las emociones sostenidas conservan su ganancia.
      const k = Math.min(1, d * 7) / Math.max(1, this.anat.emoGain ?? 1) * (s.utt?.browPulse ?? 1);
      this.emo.pulse('browL', 0.30 * k, 0.38);
      this.emo.pulse('browR', 0.27 * k, 0.38);
      this.emo.pulse('headNod', 1.5 * k, 0.44);
    }
  }
}

export default Rig;
