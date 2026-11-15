/**
 * Los ESQUEMAS de los tipos del agente ISLAS en la forma del MOTOR (`EsquemaBloque` de features/canvas/islas/bloques/
 * esquemas.ts), puros (sin React), para que el registro del MOTOR los sume sin romper su pureza:
 *   ESQUEMAS = { ...ESQUEMAS, ...ESQUEMAS_ISLAS }
 * Leen con tolerancia (conservan todas las props: el componente valida lo suyo y pinta un hueco que lo dice), declaran las
 * fuentes y destinos que aparecen en la receta y las filas por defecto en la rejilla de 56 px.
 * `TIPOS_ISLAS` debe ser la misma lista que el registro de componentes (`bloques/index.ts`): lo prueba tests/mapa.
 */
export const TIPOS_ISLAS = [
  'encabezado', 'firma', 'parrafo', 'botones', 'numerada',
  'estrella', 'ecuacion', 'triangulo', 'etapas', 'identidad',
  'organo-vivo', 'meta-error', 'actividad', 'decision', 'terminales', 'timonel',
  'leyenda-estados', 'escalera-valor', 'piezas-oferta', 'bonos', 'garantia', 'domino',
  'modulos', 'tira-semanas', 'lecciones', 'pasos', 'ventana', 'portada', 'numero-vivo', 'etapa-embudo',
] as const

/** Filas por defecto de la rejilla del MOTOR (56 px) cuando la receta no trae `en`. */
export const FILAS_ISLAS: Record<string, number> = {
  encabezado: 4, firma: 4, parrafo: 2, botones: 2, numerada: 7,
  estrella: 18, ecuacion: 7, triangulo: 8, etapas: 9, identidad: 8,
  'organo-vivo': 8, 'meta-error': 6, actividad: 5, decision: 5, terminales: 5, timonel: 10,
  'escalera-valor': 11, 'piezas-oferta': 14, domino: 5, modulos: 16, 'tira-semanas': 5, lecciones: 9,
}

type Props = Record<string, unknown>
const obj = (x: unknown): x is Props => !!x && typeof x === 'object' && !Array.isArray(x)

/** Todo `fuente`/`destino` que aparezca en las props (más las fuentes implícitas de los bloques que leen solos). */
export function juntarIslas(p: Props, clave: 'fuente' | 'destino'): string[] {
  const out = new Set<string>()
  const ver = (v: unknown) => { if (Array.isArray(v)) v.forEach(ver); else if (obj(v)) for (const [k, w] of Object.entries(v)) { if (k === clave && typeof w === 'string') out.add(w); else ver(w) } }
  ver(p)
  if (clave === 'fuente') {
    if (p.tipo === 'organo-vivo' && typeof p.organo === 'string') { out.add(`pulso:${p.organo}`); out.add('embudo') }
    if (p.tipo === 'meta-error' && obj(p.serie) && typeof p.serie.consulta === 'string') out.add(`bi:${p.serie.consulta}`)
    if (p.tipo === 'timonel' || p.tipo === 'terminales' || p.tipo === 'actividad') out.add('embudo')
  }
  return [...out]
}

export interface EsquemaIslas { leer(x: Props): { p: Props }; fuentes(p: Props): string[]; destinos(p: Props): string[]; filas(p: Props): number }
export const ESQUEMAS_ISLAS: Record<string, EsquemaIslas> = Object.fromEntries(TIPOS_ISLAS.map(tipo => [tipo, {
  leer: (x: Props) => ({ p: { ...x, tipo } }),
  fuentes: (p: Props) => juntarIslas(p, 'fuente'),
  destinos: (p: Props) => juntarIslas(p, 'destino'),
  filas: () => FILAS_ISLAS[tipo] ?? 6,
}]))
