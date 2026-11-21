/**
 * Cuartel de Contenido (15 nov 2026): los tipos que la pantalla lee. Las vistas del sensor siguen
 * `docs/builds/contenido-cuartel/ESQUEMA.md` §4 (SENSOR escribe); lo de CEREBRO (dosis, ideas, ranking) se lee
 * tolerante: cada campo opcional, porque CEREBRO manda en su contenido y puede crecer sin romper la pantalla.
 */

export type Capa = 'referente' | 'competencia' | 'mentor' | 'frontera' | 'mentalidad' | 'propio' | 'descubierto'

export interface OutlierInfo {
  puntaje: number
  esperado: number
  metodo: 'maduro' | 'curva_canal' | 'curva_generica' | string
  confianza: 'alta' | 'media' | 'baja' | string
}

export interface VideoCuartel {
  video_id: string
  channel_id: string
  canal: string
  capa: Capa | string
  idioma?: string | null
  titulo: string
  publicado: string
  duracion_s?: number | null
  miniatura_url?: string | null
  vistas?: number | null
  likes?: number | null
  edad_dias?: number | null
  vistas_por_sub?: number | null
  outlier?: OutlierInfo | null
  temas?: string[]
  origen?: string
  transcript?: { estado: string; ruta?: string | null } | null
  url?: string
  /** `status.embeddable` de YouTube (SENSOR). false = no se reproduce incrustado: se ve descargado con su botón. */
  incrustable?: boolean | null
}

export interface CanalCuartel {
  channel_id: string
  nombre: string
  handle?: string | null
  capa: Capa | string
  subcapa?: string | null
  idioma?: string | null
  temas?: string[]
  slug?: string
  miniatura_url?: string | null
  url?: string
  suscriptores?: number | null
  videos_totales?: number | null
  mediana_vistas?: number | null
  publicados_90d?: number | null
  vistas_por_sub_mediana?: number | null
  ultimo_video?: { video_id: string; titulo: string; publicado: string } | null
  mejor_outlier_30d?: { video_id: string; puntaje: number } | null
  /** Uno de sus referentes de estudio («mis 4», 19 nov 2026): la marca vive en `universo-youtube.json` (`referente_estudio`). */
  estudio?: boolean
}

export interface Tema { slug: string; nombre: string }

export interface EstadoSensor {
  ultima_corrida?: { id: number; inicio: string; fin?: string | null; estado: string; errores?: unknown[] } | null
  /** v1.3: el último pulso de 30 min (la corrida completa sigue en `ultima_corrida`). */
  pulso?: { id: number; inicio: string; fin?: string | null; estado: string; nuevos?: number | null; unidades?: number | null; errores?: unknown[] } | null
  cuota?: { dia_pt: string; usadas: number; tope_sensor: number; limite_proyecto: number; por_metodo?: Record<string, number> } | null
  totales?: { canales?: number; videos?: number; largos?: number; transcripts?: number; outliers?: number } | null
  generado?: string
}

/** El minuto del oro (CEREBRO.md §2.1): si `verificado` es false, la pantalla no promete el minuto. */
export interface Oro { inicio_s: number; fin_s?: number | null; etiqueta?: string | null; cita?: string | null; que_hay?: string | null; verificado: boolean }

/** Un video de la dosis del día (CEREBRO.md §2.1). */
export interface PasoDosis {
  video_id: string
  por_que: string
  oro?: Oro | null
  eje?: { id: string; nombre: string } | null
  se_vuelve?: string | null
  accion?: string | null
  puntaje?: number | null
  outlier?: number | null
  ya_lo_tienes?: { titulo: string; corpus?: string | null; parecido?: number | null }[]
  estado: 'pendiente' | 'sirvio' | 'no_sirvio' | 'saltado' | string
  /** No pasó el piso de 40: entró para completar 3 (CEREBRO v1.1). */
  relleno?: boolean
  /** v1.2 (ESQUEMA §8.1): la fecha siempre visible y por qué entra algo viejo. */
  publicado?: string | null
  edad_dias?: number | null
  frescura?: 'nuevo' | 'reciente' | 'viejo' | null
  fecha_txt?: string | null
  por_que_viejo?: string | null
  video: VideoCuartel | null
}

export interface Dosis {
  fecha: string
  nota?: string | null
  videos: PasoDosis[]
  terminaste: boolean
  minutos_total?: number | null
  minutos_oro?: number | null
  ejes?: { id: string; nombre: string; peso?: number }[]
  generado?: string
  /** «cerebro» si la armó CEREBRO; «provisional» si la pantalla la armó con los outliers mientras CEREBRO no publica. */
  fuente: 'cerebro' | 'provisional'
  /** v1.2: lo que cuenta como reciente (28 días) y cuántos de la dosis lo son. */
  ventana_dias?: number | null
  recientes?: number | null
}

export interface IdeaVideo {
  id: string
  estado: string
  creada?: string | null
  tipo?: string | null
  angulo: string
  promesa?: string | null
  titulos: { texto: string; patron?: string | null }[]
  miniaturas: { texto?: string | null; objeto?: string | null; composicion?: string | null }[]
  voz_cliente: { texto: string; tipo?: string | null; uso?: string | null }[]
  origen?: { video_id?: string | null; titulo?: string | null; canal?: string | null; outlier?: number | null; por_que_funciono?: string | null } | null
  para_guion?: { gancho?: string | null; demostracion?: string | null; cta?: string | null } | null
}

export interface Calificacion { puntaje: number; tesis?: string | null; por_que_verlo?: string | null; se_vuelve?: string | null; oro?: Oro | null; saltar?: string | null; eje?: string | null }

export interface Lazo {
  votos?: { sirvio?: number; no_sirvio?: number }
  ideas_aplicadas?: { total?: number; semana?: number }
  acierto_dosis?: number | null
}

/** Un video de «Lo nuevo de tu universo» (feed Inicio, ESQUEMA §9). Ordenado hacia la meta, nunca por tiempo visto. */
export interface ItemInicio {
  video_id: string
  /** 0 a 100: nicho 40 · frescura 25 · outlier que madura 20 · novedad 15, × su «me sirvió». */
  puntaje: number
  /** La línea de por qué le sirve. */
  por_que: string
  /** De dónde salió el juicio: «lectura» (transcript completo), «ligera» (título y descripción por el modelo) o «pulso» (sin modelo). */
  por_que_fuente: 'lectura' | 'ligera' | 'pulso' | string
  eje?: { id: string; nombre: string } | null
  fecha_txt?: string | null
  frescura?: 'nuevo' | 'reciente' | 'viejo' | null
  edad_h: number
  /** «×3.4», «×1.2 (midiendo)» o «midiendo» (menos de 3 días: el puntaje se afina en el día). */
  outlier_txt?: string | null
  /** Salió en las últimas 24 h. */
  recien: boolean
  visto_primero?: string | null
  componentes?: Record<string, number>
  estado: 'pendiente' | string
  video: VideoCuartel
}

/** Feed «Inicio» (cuartel v2, PULSO): `GET /api/contenido/inicio`, vista `store/cuartel/vistas/inicio.json`. */
export interface Inicio {
  esquema: string
  generado: string
  fecha: string
  pulso?: { corrida: number; inicio: string; fin?: string | null; estado: string; nuevos?: number | null; unidades?: number | null } | null
  siguiente_pulso?: string | null
  /** «16:37», hora de México. */
  siguiente_pulso_txt?: string | null
  /** La dosis del día, arriba (lo mismo que `dosis.json`, sin lo pesado). */
  dosis?: {
    fecha: string
    terminaste: boolean
    nota?: string | null
    recientes?: number | null
    videos: (Partial<PasoDosis> & { video_id: string; titulo?: string | null; canal?: string | null; channel_id?: string | null; miniatura_url?: string | null; duracion_s?: number | null; por_que_verlo?: string | null; url?: string | null; embed_url?: string | null })[]
  } | null
  nuevo: {
    titulo: string
    ventana_dias: number
    max: number
    items: ItemInicio[]
    pendientes: number
    recien: number
    decididos: number
    en_ventana: number
    fuera?: Record<string, number>
    /** Tiene final: true cuando ya decidió todo lo nuevo de su nicho. */
    al_dia: boolean
    /** Lo que se pinta al final de la lista («Eso es todo…» o «Estás al día…»). */
    mensaje: string
    orden?: string
  }
}

export interface LecturaCuartel {
  universo: { canales: CanalCuartel[]; temas: Tema[]; capas: string[]; generado?: string } | null
  videos: VideoCuartel[]
  outliers: VideoCuartel[]
  estado: EstadoSensor | null
  dosis: Dosis | null
  ideas: IdeaVideo[]
  ranking: Record<string, Calificacion>
  lazo: Lazo | null
  /** De dónde salió cada pieza: «sensor» (vistas del Studio) o «radar» (Supabase intel_videos, el de antes). */
  fuente: 'sensor' | 'radar' | 'vacio'
  /** v1.3 (PULSO): el feed Inicio; null si el pulso aún no corre. */
  inicio?: Inicio | null
  avisos: string[]
  leido: string
}

/** Tu canal (YouTube Analytics ya conectada, tabla `youtube_videos`). */
export interface VideoPropio {
  video_id: string
  title: string
  published_at: string
  views: number | null
  avg_view_percentage?: number | null
  impressions?: number | null
  impressions_ctr?: number | null
  subscribers_gained?: number | null
  duration_seconds?: number | null
  thumbnail_url?: string | null
}

export interface LecturaCanal { videos: VideoPropio[]; leido: string; aviso?: string | null }

export interface Descarga {
  video_id: string
  titulo: string
  canal?: string | null
  estado: 'bajando' | 'lista' | 'error'
  archivo?: string | null
  bytes?: number | null
  pedida: string
  lista?: string | null
  vista?: string | null
  fijada?: boolean
  expira?: string | null
  error?: string | null
  progreso?: number | null
}

export interface LineaTranscript { s: number; texto: string }
export interface Transcript { video_id: string; titulo?: string | null; canal?: string | null; lineas: LineaTranscript[]; ruta?: string | null }

export interface Respuesta { respuesta: string; citas: { t_s: number; etiqueta?: string | null; cita?: string | null; verificada?: boolean }[]; sin_respuesta?: boolean }

/** Biblioteca de mentalidad (MENTALIDAD, propuesta del 15 nov): estante fijo para el gym y la constancia; no alimenta el radar. */
export interface VideoMentalidad extends VideoCuartel {
  uso: 'gym' | 'constancia' | string
  estante: string
  porque?: string | null
  nucleo?: boolean
  origen_propuesta?: string | null
  aprobado: boolean | null
}

export interface CanalMentalidad { channel_id: string; nombre: string; subcapa?: string | null; porque?: string | null; miniatura_url?: string | null; videos_en_propuesta?: number; aprobado: boolean | null }

export interface LecturaMentalidad {
  /** v1.2: «listo» = estante armado sin palomeo (núcleo + más). «propuesta» queda solo por compatibilidad. */
  estado: 'listo' | 'propuesta' | 'sin_propuesta'
  /** v1.2 (ESQUEMA §8.3): el estante chico que se ve. */
  nucleo?: VideoMentalidad[]
  /** v1.2: el resto, escondido tras «más». */
  mas?: VideoMentalidad[]
  /** núcleo + más (compatibilidad). */
  videos: VideoMentalidad[]
  canales: CanalMentalidad[]
  resumen?: { videos?: number; nucleo?: number; horas_totales?: number } | null
  decidido?: string | null
}

/** Ficha de canal («ir al canal», ESQUEMA §8.4): `GET /api/contenido/ficha-canal?id=UC…`. */
export interface FichaCanal {
  canal: CanalCuartel & { url: string; url_handle?: string | null }
  ultimos: VideoCuartel[]
  outliers: VideoCuartel[]
  totales: { largos: number; outliers_365d: number; transcripts: number }
  leido: string
}
