// COPIA en la app (8 nov 2026, bandera Levy v4) de harness/variantes/c06/boca.js de la noche de Levy v4
// (labs/god-animation/practicas/2026-11-08-levy-noche; sha256 del original 6a6e3f95…). Paridad numérica de bocaPesos con el
// original en tests/chat/levy4.test.ts. Única diferencia: crearBoca devuelve además `fijarApertura(ap)`, para que la boca de
// respaldo por nivel (sin alineación) mantenga el oscuro de la cara interna de los labios como lo haría esta boca.
// boca.js · la boca de Levy v4 (frente BOCA, noche del 7 → 8 nov 2026). Ronda 5 (23:55): boca LINEAL respecto de «abre»
// (sin realce por vocal, sostén corto 0,4/33 ms, más ganancia global, rodillas solo en el máximo) + el labio superior sube en
// las aperturas grandes (upperT/upperK). Entreno r 0,934 (r4 0,896), entreno ×1,1 0,925; limpieza de r4 intacta (todo lo de
// crearBoca sigue igual). Volver a r4: opciones.bocaR2.g = la de frentes/boca/variante-r4-idr4/variante.json (upperK 0 por
// defecto si no se da: añadir upperK: 0). Ronda 4 (23:20): interior oscuro suave (cavidad con
// gradiente violeta oscuro → casi negro, sin borde duro), boca abierta limpia (cavidad baja
// retrocedida: sin manchita; oscuro de la cara interna atado a la apertura: sin muesca ni cuñas en reposo), labios más finos
// (compresión vertical hacia la ranura, bulto inferior aplanado, sin contorno oscuro en el labio superior), «a» con más
// mandíbula, «o» más redonda. Volver a r3: opciones.bocaR2 = { forma: false, contorno: { k: 0 }, oscuroAbre: { reposo: 1 },
// cavidadBajo: { dz: 0, dy: 0 }, interiorSuave: false, color: [0.004, 0.0015, 0.010], g: <las de frentes/boca/variante-r3/variante.json>
// con cierraNorm: null }. Ronda 3 (22:40): vocales realzadas por identidad de
// vocal (la «a» y la «o» abren claro también cortas y rápidas, la «e» media), rodillas de apertura, labios aclarados y
// desaturados (menos «hinchados»), cavidad encogida. Valores r2 exactos: GANANCIAS de r2 + opciones.bocaR2 = { labios: { aclara: 0,
// desatura: 0 }, cavidadEscala: 1 } (ver frentes/boca/RONDA-3.md).
//
// Función PURA y determinista: dados los visemas por cuadro de `preparar.py` (visemas.json: `cuadros[i]` = 5 canales
// abre/ancho/redondo/cierra/muerde + 15 pesos de visema Oculus, a `fps` cps, ya con la coarticulación de A: adelanto
// 40 ms, σ 22 ms, cierres p/b/m forzados) y un instante t (s), devuelve los pesos de morph de boca y mandíbula de la
// cabeza 3D de B (GLB n34, malla «Levy head»). Sin estado, sin reloj, sin azar: el mismo (vis, t) da siempre lo mismo.
//
//   import { bocaPesos, MORPHS_BOCA } from './boca.js'
//   const { pesos, suma, hablando } = bocaPesos(vis, t)
//   for (const k in pesos) setMorph(k, pesos[k])          // ABSOLUTOS: estos morphs son de la boca (MORPHS_BOCA)
//   for (const k in suma) setMorph(k, base[k] + suma[k])  // SUMA sobre la vida (sonrisa de B y sus gestos)
//
// Por qué así (medido en la malla n34, ver frentes/boca/BITACORA.md):
//  · ABRE → jawOpen + mouthLowerDown (+ un poco de mouthUpperUp). jawOpen solo baja el mentón con una grieta; los labios
//    los separa mouthLowerDown (labio inferior que hace la forma, superior casi fijo: lo que ya ganó en B, iter-24).
//  · CIERRA (p/b/m) y SILENCIO → la MISMA pose de reposo de B (mouthClose 0,6 + mouthPress): labios juntos sin guion.
//    El visema PP y mouthRollLower de la malla dejan ver la pieza del cuello a través del mentón: no se usan.
//  · REDONDO (o, u) → viseme_O + jawOpenMouthFunnel, menos sonrisa y menos labio inferior: abertura estrecha y alta,
//    distinta de la «a» (ancha). viseme_U y mouthPucker rompen la malla (morritos con desgarros): fuera.
//  · ANCHO (e, i, s) → sonrisa sumada + viseme_E / viseme_I: ranura ancha.
//  · MUERDE (f) → labios casi juntos (mouthClose) con un toque de viseme_FF.

export const MORPHS_BOCA = ['jawOpen', 'mouthClose', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_DD', 'viseme_nn', 'viseme_FF', 'viseme_PP', 'viseme_SS', 'viseme_CH',
  'viseme_kk', 'viseme_RR', 'viseme_TH', 'viseme_sil', 'jawOpenMouthFunnel', 'jawOpenMouthWide', 'mouthFunnel', 'mouthPucker',
  'mouthPressLeft', 'mouthPressRight', 'mouthRollLower', 'mouthRollUpper']

export const GANANCIAS = {   // calibradas con medir.py sobre la voz de ENTRENO (BITACORA: v1 → v9; v9 = la que entra)
  jaw: 1.1,         // r5: 0,74 → 1,1 (sin realce por vocal, la ganancia global hace que la «a» abra; la rodilla de arriba la deja en el máximo de r4); r4: 0,68 → 0,74 (la «a» máxima con más mandíbula y menos labio inferior: sin «U de goma»; la cavidad baja ya no asoma); r3: 0,65 → 0,68 (con la rodilla de apertura no llega a la manchita del cuello); jawOpen a abre = 1 (r2: 0,58 → 0,65 (0,72 asomaba una manchita del cuello por el mentón), el mentón acompaña: una boca que abre sin bajar el mentón se lee pintada)
  lower: 0.75,      // r5: 0,62 → 0,75; r4: 0,72 → 0,62; r3: 0,68 → 0,72 con rodilla suave a 0,45 (pendiente 0,35); mouthLowerDown a abre = 1 (el que separa los labios; r2: 0,70 → 0,68, el resto lo pone la mandíbula)
  upper: 0.12,      // mouthUpperUp a abre = 1
  upperMax: 1,      // r5: tope del labio superior (por encima de ≈ 0,37 asoma el borde dentado de su cara interna)
  upperT: 0.15, upperK: 0.5,   // r5: + upperK·max(0, o − upperT) (0 = r4): el labio superior sube solo al abrir mucho (la «a» abre más alta; el cambio visible sigue creciendo donde el labio inferior ya satura: r 0,913 → 0,934)
  curva: 1.45,      // r4: 1,35 → 1,45 (con los labios finos las aperturas pequeñas cambiaban de más: r 0,880 → 0,890); r3: 1,45 → 1,35; r2: 1,55 → 1,45 (con la boca en lente de crearBoca el cambio visible ya no salta: r sube 0,861 → 0,887)      // abre^curva: el cambio de píxel de esta malla crece como √apertura (la ranura aparece de golpe);
                    // con la curva convexa el cambio visible queda casi proporcional a «abre» (r 0,67 → 0,86-0,90)
  ensancha: 0.4, ensanchaMs: 33,  // r5: 0,7/45 → 0,4/33 (el sostén ancho era lo que más bajaba la r: abría consonantes vecinas; 0,4/33 cuesta 0,001 frente a 0); r2: 0,6/33 → 0,7/45 (0,75/50 con curva 1,4 bajó la r a 0,836): la vocal se sostiene lo que suena (y aguanta habla rápida)  // sostén de vocal: la apertura toma 0,6 de la de los vecinos a ±33 ms (con la curva
                    // convexa sola la vocal se abría 1-2 cuadros: «parpadeo de boca», críticos ciegos 20:07)
  restClose: 0.6,   // mouthClose en reposo (LOOK_LEVY.restClose)
  closeK: 1.6,      // mouthClose se suelta al abrir: restClose·(1 − o·closeK); soltarlo rápido abría la ranura en consonantes
  press: 0.1,       // mouthPress en silencio Y en p/b/m (B: 0,1 sin hablar); se suelta al abrir
  pressCierra: 0,   // mouthPress extra en p/b/m (0: el cierre = reposo, que es lo que mide «cierre visible»)
  visO: 0.85, funnel: 0.6, pucker: 0.22, redLower: 0.3,   /* r4: funnel .45 → .6, pucker .15 → .22, redLower .15 → .3: «o» más estrecha y redonda (pucker .32 rompe el borde) */ redSmile: 0.45,   // redondo: «o» estrecha y alta, «u» fruncida
  visE: 0.35, visI: 0.35, anchoSmile: 0.08,                  // ancho: «e», «i», «s» en ranura ancha (poco: suma cambio sin «abre»)
  visFF: 0.3, closeFF: 0.45,                                  // muerde
  umbralHabla: 0.04,
  // r3 (ronda 3, 21:55 →): «abre muy poco en vocales» (juez ciclo 02: /a/ y /o/ casi cerradas). La apertura de una vocal
  // ya no depende solo de su «abre» (= forma × energía × 0,82 si es átona: p90 0,49 en entreno → con la curva 1,45 la
  // «a» media abría 0,38 del máximo y el 42 % de las «a» quedaban < 0,30): se realza por la identidad de vocal.
  vocal: 0,         // r5: 1 → 0 (sin realce por identidad de vocal: «abre» ya la trae; el realce no es lineal respecto de «abre» y no generaliza); r3 (0 = r2); abre × (1 + vocal·W_vocal) antes de la curva (W_vocal = suma de los visemas aa E I O U, ya suavizados)
  redJaw: 0.05,     // r4: 0,12 → 0,05; r3 (0 = r2); la «o» baja más la mandíbula: jaw × (1 + redJaw·redondo)
  vocalPot: 1,      // W_vocal^vocalPot (> 1: el realce se concentra en el centro de la vocal, no en las transiciones)
  sostenRealce: false,
  cierraNorm: [0.35, 0.65],   // r4: «cierra» reescalado (los p/b/m cortos llegan con 0,6-0,7 y quedaban en rendija: 9,16 · 10,17 · 10,45 · 17,28 s); null = r3
  lowerRodilla: 0.45, lowerPend: 0.5,   // r5: 0,40/0,35 → 0,45/0,5 (solo muerde en las aperturas máximas); r4: rodilla 0,45 → 0,40
  oRodilla: 0.6, oPend: 0.6,          // r5: oPend 0,9 → 0,6 (con la ganancia nueva, la «a» máxima queda en jaw 0,76 / lower 0,48 = la de r4: sin manchita del cuello ni «U de goma»; el cambio visible ya está saturado ahí, no cuesta r); r3: rodilla de la apertura total; r4: pendiente 0,5 → 0,9 (las aperturas grandes saturaban: r 0,886 → 0,899 con forma 0,88/0,92) (con menos labio inferior la respuesta quedaba cóncava: r 0,876)
  vocalPor: { aa: 1, O: 0.9, E: 0.35, I: 0.3, U: 0.45 },                 // r3: peso del realce por vocal { aa, E, I, O, U } (sin dar = 1)   // r3: rodilla suave del labio inferior (por encima, la pendiente baja a lowerPend)
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
function sstepF(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** Canales y visemas del instante t (interpolación lineal entre cuadros; cierra y muerde con el máximo, para no perderlos). */
export function muestra(vis, t) {
  if (!vis || !vis.cuadros || !vis.cuadros.length) return null   // sin pista (sin voz): reposo
  const fps = vis.fps || 30, C = vis.cuadros, n = C.length
  const x = clamp(t * fps, 0, n - 1), i = Math.floor(x), j = Math.min(n - 1, i + 1), f = x - i
  const a = C[i], b = C[j]
  const v = a.map((y, k) => y * (1 - f) + b[k] * f)
  v[3] = Math.max(a[3] * (1 - f) + b[3] * f, f < 0.5 ? a[3] : b[3])
  v[4] = Math.max(a[4] * (1 - f) + b[4] * f, f < 0.5 ? a[4] : b[4])
  return v
}

/**
 * Pesos de boca del instante t. `opts.g` sobrescribe GANANCIAS (para iterar sin tocar el archivo).
 * Devuelve { pesos (absolutos), suma (sobre la vida: sonrisa), hablando (0/1), canales }.
 */
export function bocaPesos(vis, t, opts = {}) {
  const G = { ...GANANCIAS, ...(opts.g || {}) }
  const v = muestra(vis, t)
  const pesos = Object.fromEntries(MORPHS_BOCA.map(k => [k, 0]))
  if (!v) { pesos.mouthClose = G.restClose; pesos.mouthPressLeft = pesos.mouthPressRight = G.press; return { pesos, suma: {}, hablando: 0 } }
  const [abre0, ancho, redondo, cierra0, muerde] = v
  // r4 (opcional, apagado por defecto): los p/b/m cortos llegan con «cierra» 0,6-0,7 (el σ 22 ms de preparar.py rebaja el pico)
  // y quedaban en rendija; cierraNorm = [lo, hi] reescala cierra con sstep(lo, hi) (cierra ≥ hi = cierre total)
  const cierra = G.cierraNorm ? sstepF(G.cierraNorm[0], G.cierraNorm[1], cierra0) : cierra0
  // sostén de vocal: con la curva convexa la vocal solo se abría 1-2 cuadros («parpadeo» de boca, crítico ciego 20:07);
  // la apertura toma también una fracción de la de los vecinos a ±ensanchaMs (los cierres siguen mandando abajo)
  const nv = vis.visemas || ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U']
  const iv = ['aa', 'E', 'I', 'O', 'U'].map(k => 5 + nv.indexOf(k)).filter(q => q >= 5)
  const kv = G.vocalPor || {}, ivk = ['aa', 'E', 'I', 'O', 'U'].map(k => [5 + nv.indexOf(k), kv[k] ?? 1]).filter(([q]) => q >= 5)
  const realza = u => G.vocal > 0 ? u[0] * (1 + G.vocal * Math.pow(clamp(ivk.reduce((s, [q, k]) => s + k * (u[q] ?? 0), 0)), G.vocalPot)) : u[0]   // r3: realce de vocal (por vocal: la «e» media, no como la «a»)
  let abre = realza(v)
  if (G.ensancha > 0) { const d = G.ensanchaMs / 1000, sr = G.sostenRealce ? realza : (u => u[0]), a1 = sr(muestra(vis, t - d)), a2 = sr(muestra(vis, t + d)); abre = Math.max(abre, G.ensancha * Math.max(a1, a2)) }   // r3: el sostén usa la apertura SIN realce (realzarla abría las consonantes vecinas: r 0,919 → 0,864)
  const W = Object.fromEntries(nv.map((k, q) => [k, v[5 + q] ?? 0]))
  const sil = clamp(W.sil ?? (abre0 < 0.02 ? 1 : 0))
  // apertura efectiva: la curva, y los cierres/mordida mandan (labios juntos ⇒ boca cerrada)
  const b0 = Math.max(cierra, muerde * 0.85), bloqueo = clamp(b0 + Math.max(0, b0 - 0.6))   // r2: desde cierra 0,8 bloqueo total (el sostén de vocal ya no deja 0,003 de apertura en p/b/m)
  let o = Math.pow(clamp(abre), G.curva) * (1 - bloqueo)
  if (o > G.oRodilla) o = G.oRodilla + (o - G.oRodilla) * G.oPend   // r3: rodilla de la apertura total (muy abierta, el labio inferior se estiraba en banda fina y la mandíbula caía en V)
  const red = clamp(redondo), anc = clamp(ancho)
  pesos.jawOpen = clamp(G.jaw * o * (1 + G.redJaw * red))
  let ld = G.lower * o * (1 - G.redLower * red)
  if (ld > G.lowerRodilla) ld = G.lowerRodilla + (ld - G.lowerRodilla) * G.lowerPend   // r3: mouthLowerDown ≥ 0,6 asoma motas oscuras bajo el labio inferior (cara interna que da la vuelta)
  pesos.mouthLowerDownLeft = pesos.mouthLowerDownRight = ld
  pesos.mouthUpperUpLeft = pesos.mouthUpperUpRight = Math.min(G.upperMax ?? 1, clamp(G.upper * o + (G.upperK || 0) * Math.max(0, o - (G.upperT || 0))))   // r5: el labio superior sube solo en las aperturas grandes (arranque convexo): la «a» abre más alta y el cambio visible sigue creciendo donde el labio inferior ya satura
  // labios juntos en reposo, p/b/m y f; se sueltan al abrir
  const suelta = clamp(1 - o * G.closeK)
  pesos.mouthClose = Math.max(G.restClose * suelta, G.restClose * cierra, G.closeFF * muerde)
  // mouthPress: el mismo en silencio y en p/b/m (el cierre tiene que verse IGUAL que el reposo); se suelta al abrir
  const pr = G.press * clamp(1 - o * 4) + G.pressCierra * cierra
  pesos.mouthPressLeft = pesos.mouthPressRight = pr
  // forma: redondo y ancho (escalados por lo abierta que está la boca, para que en reposo no cambie nada)
  const habla = clamp(1 - sil)
  pesos.viseme_O = G.visO * red * habla * (1 - bloqueo)
  pesos.jawOpenMouthFunnel = G.funnel * red * habla * (1 - bloqueo)
  pesos.mouthPucker = G.pucker * red * habla * (1 - bloqueo)
  pesos.viseme_E = G.visE * (W.E ?? 0) * (1 - bloqueo)
  pesos.viseme_I = G.visI * ((W.I ?? 0) + 0.5 * (W.SS ?? 0)) * (1 - bloqueo)
  pesos.viseme_FF = G.visFF * muerde
  const smile = (G.anchoSmile * anc - G.redSmile * red) * habla
  const suma = { mouthSmileLeft: smile, mouthSmileRight: smile }
  return { pesos, suma, hablando: abre0 > G.umbralHabla || cierra0 > 0.5 ? 1 : 0, canales: v }
}

// ---------------------------------------------------------------------------------------------------------------------
// r2 · crearBoca(ctx): lo mismo que bocaPesos, más tres arreglos de RAÍZ en tiempo de ejecución, solo en la boca
// (el núcleo la prefiere a bocaPesos si existe). Perillas en opciones.bocaR2 = { interior, oscuro, comisuras, g } (por defecto
// todo encendido; `false` apaga cada uno). Todo determinista y sin estado por cuadro.
//  1. INTERIOR SIN FACETAS: la cavidad («Levy oral cavity», Sphere.005) pasa a material SIN luz (MeshBasicMaterial violeta
//     muy oscuro): con MeshStandard negro las luces de borde (3,5) dejaban reflejos por cara = facetas/rayas claras.
//  2. CARA INTERNA DE LOS LABIOS OSCURA: el GLB trae `_BOCA_OSCURO` por vértice (frentes/boca/aplicar_glb.py: vértices
//     tapados en reposo = cara interna). El sombreador de la cabeza mezcla pintura y emisión hacia el mismo violeta de la
//     cavidad con ese peso: desaparece el filo claro dentado bajo el labio superior (se leía como dientes) y la banda clara
//     del fondo. En reposo no cambia nada (esos vértices no se ven).
//  3. COMISURAS QUE NO SE RASGAN: la ranura de la malla es más larga que los labios pintados (sobre todo en +x: el «pico
//     oscuro» de la comisura derecha) y abría en rectángulo. Los deltas de apertura (jawOpen, mouthLowerDown, mouthUpperUp,
//     funnel, viseme_O) se atenúan hacia las comisuras con un perfil de lente centrado en la boca, solo en la banda de los
//     labios; el mouthClose de reposo se hornea en las comisuras (la pose de reposo queda idéntica). La boca abre en lente
//     desde el centro y las comisuras se quedan juntas.
export const COMISURA = { cx: -0.001, hw: 0.022, hwR: 0.0185, p: 2.4, y: 1.5745, yIn: 0.006, yOut: 0.015, z: 0.13, restClose: 0.6,
  morphs: ['jawOpen', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'viseme_O', 'viseme_aa', 'jawOpenMouthWide'] }   // funnel y pucker (meten las comisuras) no se atenúan; viseme_O sí (abría el pico en «o»: r2b)
export const LABIOS = { cx: -0.001, y: 1.5805, ax: 0.025, ayUp: 0.0088, ayDn: 0.0112, e0: 0.65, z: 0.125, aclara: 0.45, desatura: 0.2, debug: false }   // r3: máscara de los labios (m, espacio de la malla) y su corrección de color
export const CAVIDAD_ESCALA = 0.9   // r3: la cavidad se encoge hacia su centro (atravesaba el labio inferior con la mandíbula muy abierta)
export const CAVIDAD_BAJO = { dz: 0.005, dy: 0.003, zIni: -0.2 }   // r4: retroceso (m) de la parte baja y frontal de la cavidad
export const FORMA = { ys: 1.5752, inf: 0.88, sup: 0.92, Lb: 0.020, Lu: 0.0165, caidaB: 0.008, caidaU: 0.005, plano: 0.4, zPlano: 0.1975,
  cx: -0.001, ax: 0.025, x0: 0.75, x1: 1.25, z0: 0.17, zNariz: 0.205 }   // r4: labios más finos (compresión vertical hacia la ranura ys) y bulto inferior aplanado
export const CONTORNO = { k: 1, piso: 1.05, centro: 0.97, ancho: 0.3, radio: 0.003, texR: 3 }   // r4: banda del borde alto del labio superior que se levanta a piso × media local
export const INTERIOR_SUAVE = { borde: [0.012, 0.005, 0.028], centro: [0.002, 0.0008, 0.006], r0: 0.35, r1: 1.0, yOff: 0 }   // r4: lineal; violeta oscuro en el borde (≈ sRGB 30, 18, 47), casi negro al centro
export const OSCURO_ABRE = { reposo: 0, lleno: 0.12 }   // r4: oscuro × (reposo + (1 − reposo)·sstep(0, lleno, jawOpen + lowerDown)); reposo 1 = r3
export const OSCURO = { color: [0.008, 0.003, 0.02], k: 0.95 }   // r4: algo más violeta (interior suave); r3: [0.004, 0.0015, 0.010]
const _OSCURO_R3 =   { color: [0.004, 0.0015, 0.010], k: 0.95 }   // lineal, casi negro violeta: con la cara r2 de identidad (labios más oscuros) el contraste de la abertura bajaba (mediana de cambio 15,7 → 9,3) y un cierre quedaba en 0,55

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

export function crearBoca(ctx) {
  const ob = (ctx.opciones && ctx.opciones.bocaR2) || {}   // (opciones.boca lo pisa el arnés con el módulo)
  const { THREE } = ctx
  const info = { cavidad: 0, oscuro: 0, comisuras: 0 }
  // r4: el oscuro de la cara interna se enciende con la apertura (reposo: 0). Con la boca cerrada asomaban vértices de la
  // costura de _BOCA_OSCURO: la «muesca oscura» del centro del labio superior y las «cuñas» de las comisuras en reposo.
  const OG = { ...OSCURO_ABRE, ...(ob.oscuroAbre || {}) }, abreU = { value: OG.reposo }
  const col = new THREE.Color().setRGB(...(ob.color || OSCURO.color), THREE.LinearSRGBColorSpace)
  for (const m of ctx.meshes) {
    // 1 · cavidad sin luz
    if (ob.interior !== false && [m.material].flat().some(x => /oral cavity/i.test(x.name))) {
      const viejo = m.material
      m.material = new THREE.MeshBasicMaterial({ color: col.clone(), side: THREE.DoubleSide, toneMapped: false, name: 'Levy oral cavity (boca r2)' })
      ;[viejo].flat().forEach(x => x.dispose()); info.cavidad++
      // r3: con la mandíbula muy abierta la cavidad atravesaba el labio inferior («mancha negra en garabato» sobre el labio,
      // críticos r3). Se encoge hacia su centro (geometría local; reposo intacto porque en reposo no se ve).
      const enc = ob.cavidadEscala ?? CAVIDAD_ESCALA
      if (enc !== 1 && m.geometry && m.geometry.attributes.position) {
        const pc = m.geometry.attributes.position; m.geometry.computeBoundingBox(); const c0 = new THREE.Vector3(); m.geometry.boundingBox.getCenter(c0)
        // r4: la manchita que quedaba (19,2 s) es el fondo-FRENTE de la cavidad asomando bajo el labio inferior con la mandíbula
        // muy abierta (crece con jawOpen). Además del encogido global, la parte baja y frontal retrocede (dz) y sube (dy);
        // los lados y el techo quedan como en r3 (encogerla entera abría cuñas claras en las comisuras).
        const CB = { ...CAVIDAD_BAJO, ...(ob.cavidadBajo || {}) }, bb = m.geometry.boundingBox
        for (let v = 0; v < pc.count; v++) {
          const x = c0.x + (pc.getX(v) - c0.x) * enc, y0 = pc.getY(v), z0 = pc.getZ(v)
          const wb = sstep(0, 1, (c0.y - y0) / (c0.y - bb.min.y + 1e-9)) * sstep(CB.zIni, 1, (z0 - c0.z) / (bb.max.z - c0.z + 1e-9))
          pc.setXYZ(v, x, c0.y + (y0 - c0.y) * enc + CB.dy * wb, c0.z + (z0 - c0.z) * enc - CB.dz * wb)
        }
        const MC = m.geometry.morphAttributes && m.geometry.morphAttributes.position
        if (MC) for (const arr of MC) { for (let v = 0; v < arr.count; v++) arr.setXYZ(v, arr.getX(v) * enc, arr.getY(v) * enc, arr.getZ(v) * enc); arr.needsUpdate = true }
        pc.needsUpdate = true; m.geometry.computeBoundingSphere(); info.cavidadEscala = enc
      }
      // r4 · INTERIOR OSCURO SUAVE (juez ciclo 03: «agujero negro de borde duro»): gradiente radial por vértice en la cavidad,
      // violeta oscuro en el borde (junto a los labios) → casi negro en el centro (profundidad), sin luz. interiorSuave: false = r3.
      const IS = ob.interiorSuave === false ? null : { ...INTERIOR_SUAVE, ...(ob.interiorSuave || {}) }
      if (IS && m.geometry && m.geometry.attributes.position) {
        const pc = m.geometry.attributes.position; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox, c0 = new THREE.Vector3(); bb.getCenter(c0)
        const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, cc = new Float32Array(pc.count * 3)
        const cB = new THREE.Color().setRGB(...IS.borde, THREE.LinearSRGBColorSpace), cC = new THREE.Color().setRGB(...IS.centro, THREE.LinearSRGBColorSpace), tmp = new THREE.Color()
        for (let v = 0; v < pc.count; v++) {
          const rx = (pc.getX(v) - c0.x) / hx, ry = (pc.getY(v) - c0.y + IS.yOff * hy) / hy, rr = Math.sqrt(rx * rx + ry * ry)
          tmp.copy(cC).lerp(cB, sstep(IS.r0, IS.r1, rr)); cc.set([tmp.r, tmp.g, tmp.b], v * 3)
        }
        m.geometry.setAttribute('color', new THREE.BufferAttribute(cc, 3)); m.material.vertexColors = true; m.material.color.setRGB(1, 1, 1); m.material.needsUpdate = true; info.interiorSuave = 1
      }
    }
    const geo = m.geometry
    if (!geo || !geo.attributes) continue
    // 2 · cara interna de los labios oscura (atributo del GLB)
    const a = geo.getAttribute('_boca_oscuro')
    if (a && ob.oscuro !== false) {
      geo.setAttribute('bocaOscuro', a)
      // 4 · r3 · LABIOS CON FORMA: en la cara adulta de identidad r2/r3 los labios se leían gruesos, abultados y oscuros (más
      // oscuros y saturados que la piel; el contorno oscuro del labio superior los agranda). Máscara elíptica suave por
      // vértice (posición de reposo) en la banda de los labios; el sombreador aclara pintura y emisión (× 1 + aclara) y quita
      // croma (desatura) dentro de la máscara, fuera de la cara interna (_BOCA_OSCURO). aclara 0 = r2 bit a bit.
      const LB = { ...LABIOS, ...(ob.labios || {}) }, posL = geo.attributes.position, nL = posL.count, mk = new Float32Array(nL)
      if (LB.aclara > 0 || LB.desatura > 0 || LB.debug) {
        for (let v = 0; v < nL; v++) {
          const x = posL.getX(v), y = posL.getY(v), z = posL.getZ(v)
          const ex = (x - LB.cx) / LB.ax, ey = (y - LB.y) / (y > LB.y ? LB.ayUp : LB.ayDn), e = Math.sqrt(ex * ex + ey * ey)
          mk[v] = (1 - sstep(LB.e0, 1, e)) * sstep(LB.z - 0.015, LB.z, z)
        }
      }
      geo.setAttribute('bocaLabio', new THREE.BufferAttribute(mk, 1))
      // 6 · r4 · SIN CONTORNO OSCURO EN EL LABIO SUPERIOR: la pintura trae una línea oscura en el borde alto del labio
      // superior (lo agranda y lo «abulta» frente al retrato). En una banda alrededor de ese borde (la elipse de LABIOS,
      // e ≈ 1, mitad de arriba), lo que sea más oscuro que `piso` × la media local de la pintura (muestreada en la textura
      // en la UV de cada vértice y promediada en un radio, por vértice: sin sangrar entre islas UV) se levanta hasta ella.
      // Ganancia escalar sobre pintura y emisión (no cambia el tono). contorno.k 0 = r3.
      const CT = { ...CONTORNO, ...(ob.contorno || {}) }, cont = new Float32Array(nL), piso = new Float32Array(nL * 3)
      const mat0 = [m.material].flat()[0], img = mat0 && mat0.map && mat0.map.image, uvA = geo.attributes.uv
      if (CT.k > 0 && img && uvA && typeof document !== 'undefined') {
        const TW = img.width, TH = img.height, cv = document.createElement('canvas'); cv.width = TW; cv.height = TH
        const c2 = cv.getContext('2d', { willReadFrequently: true }); c2.drawImage(img, 0, 0)
        const zona = [], col = []
        for (let v = 0; v < nL; v++) {
          const x = posL.getX(v), y = posL.getY(v), z = posL.getZ(v)
          if (y < LB.y - 0.002 || z < LB.z - 0.015) continue
          const ex = (x - LB.cx) / LB.ax, ey = (y - LB.y) / LB.ayUp, e = Math.sqrt(ex * ex + ey * ey)
          if (Math.abs(e - CT.centro) > 3 * CT.ancho) continue
          const u = uvA.getX(v) * TW, w = uvA.getY(v) * TH, r0 = CT.texR
          const d = c2.getImageData(Math.max(0, Math.round(u - r0)), Math.max(0, Math.round(w - r0)), 2 * r0 + 1, 2 * r0 + 1).data
          let sr = 0, sg = 0, sb = 0, nn = 0
          for (let q = 0; q < d.length; q += 4) { sr += Math.pow(d[q] / 255, 2.2); sg += Math.pow(d[q + 1] / 255, 2.2); sb += Math.pow(d[q + 2] / 255, 2.2); nn++ }
          zona.push(v); col.push([sr / nn, sg / nn, sb / nn, x, y, z])
          cont[v] = Math.exp(-Math.pow((e - CT.centro) / CT.ancho, 2)) * sstep(LB.z - 0.015, LB.z, z)
        }
        const R2 = CT.radio * CT.radio
        for (let a = 0; a < zona.length; a++) {
          if (cont[zona[a]] < 0.02) { cont[zona[a]] = 0; continue }
          let sr = 0, sg = 0, sb = 0, nn = 0; const A = col[a]
          for (let b = 0; b < zona.length; b++) { const B = col[b], dx = B[3] - A[3], dy = B[4] - A[4], dz = B[5] - A[5]; if (dx * dx + dy * dy + dz * dz <= R2) { sr += B[0]; sg += B[1]; sb += B[2]; nn++ } }
          piso.set([sr / nn, sg / nn, sb / nn], zona[a] * 3)
        }
        info.contorno = zona.length
      }
      geo.setAttribute('bocaCont', new THREE.BufferAttribute(cont, 1)); geo.setAttribute('bocaPiso', new THREE.BufferAttribute(piso, 3))
      for (const mat of [m.material].flat()) {
        const previo = mat.onBeforeCompile
        const K = ob.oscuroK ?? OSCURO.k
        mat.onBeforeCompile = (sh, r) => {
          if (previo) previo(sh, r)
          sh.uniforms.bocaOscCol = { value: col }; sh.uniforms.bocaOscK = { value: K }; sh.uniforms.bocaAbre = abreU
          sh.uniforms.bocaLabAcl = { value: LB.aclara }; sh.uniforms.bocaLabDes = { value: LB.desatura }; sh.uniforms.bocaLabDbg = { value: LB.debug ? (LB.debug === 2 ? 2 : 1) : 0 }; sh.uniforms.bocaContK = { value: CT.k }; sh.uniforms.bocaContPiso = { value: CT.piso }
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float bocaOscuro;\nvarying float vBocaOsc;\nattribute float bocaLabio;\nvarying float vBocaLab;\nattribute float bocaCont;\nattribute vec3 bocaPiso;\nvarying float vBocaCont;\nvarying vec3 vBocaPiso;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBocaOsc = bocaOscuro;\nvBocaLab = bocaLabio;\nvBocaCont = bocaCont;\nvBocaPiso = bocaPiso;')
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBocaOsc;\nuniform vec3 bocaOscCol;\nuniform float bocaOscK;\nuniform float bocaAbre;\nvarying float vBocaLab;\nuniform float bocaLabAcl;\nuniform float bocaLabDes;\nuniform float bocaLabDbg;\nvarying float vBocaCont;\nvarying vec3 vBocaPiso;\nuniform float bocaContK;\nuniform float bocaContPiso;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float bo = clamp(vBocaOsc, 0.0, 1.0) * bocaOscK * bocaAbre;'
              + ' float lb = clamp(vBocaLab, 0.0, 1.0) * (1.0 - clamp(vBocaOsc, 0.0, 1.0));'
              + ' vec3 lw = vec3(0.2126, 0.7152, 0.0722);'
              + ' float bc = clamp(vBocaCont, 0.0, 1.0) * bocaContK * (1.0 - clamp(vBocaOsc, 0.0, 1.0));'
              + ' if (bc > 0.001) { float lt = dot(diffuseColor.rgb, lw); float lp = dot(vBocaPiso * diffuse, lw) * bocaContPiso;'
              + ' float gn = mix(1.0, clamp(lp / max(lt, 1e-4), 1.0, 2.5), bc); diffuseColor.rgb *= gn; totalEmissiveRadiance *= gn;'
              + ' if (bocaLabDbg > 1.5) { totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(1.0, 0.0, 0.0), bc); } }'
              + ' diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, lw)), lb * bocaLabDes) * (1.0 + lb * bocaLabAcl);'
              + ' totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(dot(totalEmissiveRadiance, lw)), lb * bocaLabDes) * (1.0 + lb * bocaLabAcl);'
              + ' if (bocaLabDbg > 0.5) { totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.0, 1.0, 0.0), lb); }'
              + ' diffuseColor.rgb *= 1.0 - bo; totalEmissiveRadiance = mix(totalEmissiveRadiance, bocaOscCol, bo); }')
        }
        const key0 = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => ''
        mat.customProgramCacheKey = () => key0() + '|bocaOscuro|bocaLabio|bocaCont'
        mat.needsUpdate = true
      }
      info.oscuro++
    }
    // 3 · comisuras: perfil de lente en los deltas de apertura
    const dic = m.morphTargetDictionary, MA = geo.morphAttributes && geo.morphAttributes.position
    if (ob.comisuras !== false && dic && MA && dic.jawOpen !== undefined && dic.mouthClose !== undefined && dic.mouthLowerDownLeft !== undefined) {
      const C = { ...COMISURA, ...(ob.comisura || {}) }, pos = geo.attributes.position, n = pos.count
      const w = new Float32Array(n); let tocados = 0
      for (let v = 0; v < n; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v)
        const dx = Math.abs(x - C.cx) / (x > C.cx ? (C.hwR ?? C.hw) : C.hw)   // la ranura de +x es más larga (el pico)
        const lente = dx >= 1 ? 0 : 1 - Math.pow(dx, C.p)
        const banda = 1 - sstep(C.yIn, C.yOut, Math.abs(y - C.y))
        const frente = sstep(C.z - 0.02, C.z, z)
        w[v] = 1 - (1 - lente) * banda * frente
        if (w[v] < 0.999) tocados++
      }
      const NA = geo.morphAttributes.normal
      for (const nombre of C.morphs) {
        const i = dic[nombre]; if (i === undefined) continue
        for (const arr of [MA[i], NA && NA[i]]) { if (!arr) continue; for (let v = 0; v < n; v++) if (w[v] < 0.999) arr.setXYZ(v, arr.getX(v) * w[v], arr.getY(v) * w[v], arr.getZ(v) * w[v]); arr.needsUpdate = true }
      }
      // mouthClose: la parte de reposo se hornea en las comisuras (reposo idéntico; al abrir, las comisuras no se sueltan)
      const ic = dic.mouthClose, dc = MA[ic], rc = C.restClose
      for (let v = 0; v < n; v++) {
        if (w[v] >= 0.999) continue
        const k = 1 - w[v]
        pos.setXYZ(v, pos.getX(v) + rc * k * dc.getX(v), pos.getY(v) + rc * k * dc.getY(v), pos.getZ(v) + rc * k * dc.getZ(v))
        dc.setXYZ(v, dc.getX(v) * w[v], dc.getY(v) * w[v], dc.getZ(v) * w[v])
      }
      pos.needsUpdate = true; dc.needsUpdate = true
      info.comisuras += tocados
    }
    // 5 · r4 · LABIOS MÁS FINOS (forma del retrato): la malla trae labios de 15 mm (superior) y 19 mm (inferior) con el
    // inferior en bulto (≈ 5 mm por delante del mentón); como la pintura emite casi todo, lo que adelgaza a la vista es
    // COMPRIMIR en vertical la piel pintada hacia la ranura (el color del labio ocupa menos alto) y aplanar el bulto en z.
    // Desplazamiento de la posición de reposo con caída suave fuera del labio (sin costuras); los deltas de los morphs no
    // cambian (la boca abre igual). forma: false = r3 bit a bit.
    const FO = ob.forma === false ? null : { ...FORMA, ...(ob.forma || {}) }
    if (FO && dic && MA && dic.jawOpen !== undefined && geo.getAttribute('_boca_oscuro')) {
      const pos = geo.attributes.position, n = pos.count; let movidos = 0
      for (let v = 0; v < n; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v)
        if (z < FO.z0) continue
        const wx = 1 - sstep(FO.x0, FO.x1, Math.abs(x - FO.cx) / FO.ax); if (wx <= 0) continue
        let dy = 0, dz = 0
        if (y < FO.ys) {   // labio inferior (y la piel de debajo, con caída)
          const t = FO.ys - y, k = 1 - FO.inf
          dy = t <= FO.Lb ? k * t : k * FO.Lb * (1 - sstep(FO.Lb, FO.Lb + FO.caidaB, t))
          if (t <= FO.Lb + FO.caidaB) dz = -FO.plano * Math.max(0, z - FO.zPlano) * (1 - sstep(FO.Lb, FO.Lb + FO.caidaB, t))
        } else {            // labio superior (sin tocar la nariz)
          const t = y - FO.ys, k = 1 - FO.sup
          dy = -(t <= FO.Lu ? k * t : k * FO.Lu * (1 - sstep(FO.Lu, FO.Lu + FO.caidaU, t))) * (1 - sstep(FO.zNariz, FO.zNariz + 0.004, z))
        }
        if (dy === 0 && dz === 0) continue
        pos.setXYZ(v, x, y + dy * wx, z + dz * wx); movidos++
      }
      pos.needsUpdate = true; geo.computeBoundingSphere(); info.forma = movidos
    }
  }
  if (typeof window !== 'undefined') window.__bocaInfo = info
  const g = ob.g || null
  const dt0 = ob.tDesfase || 0   // diagnóstico: ver la boca de otro instante de la pista en una captura corta (0 = normal)
  return { info, fijarApertura: ap => { abreU.value = OG.reposo + (1 - OG.reposo) * sstep(0, OG.lleno, ap) }, pesos: (vis, t, opts = {}) => {
    const r = bocaPesos(vis, t + dt0, g ? { ...opts, g: { ...g, ...(opts.g || {}) } } : opts)
    const ap = (r.pesos.jawOpen || 0) + (r.pesos.mouthLowerDownLeft || 0)
    abreU.value = OG.reposo + (1 - OG.reposo) * sstep(0, OG.lleno, ap)
    return r
  } }
}
