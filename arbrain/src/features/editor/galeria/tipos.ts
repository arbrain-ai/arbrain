/**
 * Galería de videos del editor (19 nov 2026). Pedido del dueño: «desde acá podíamos bajar a tierra la descripción, el post
 * publicado a la comunidad». Norte: la galería de lanzamientos de su sala vieja (sfcast/sala, SPEC-GALERIA.md, 26 jul).
 * Es ESPEJO: lee `publish.json` y los archivos del proyecto; lo que falta lo genera Levy y lo irreversible espera su
 * toque en la bandeja. Estos tipos los comparten el lector (Node), las rutas y la pantalla.
 */

/** Dónde nace la ficha: una carpeta del pipeline, un video del canal sin carpeta, o un proyecto del motor de edición. */
export type OrigenVideo = 'proyecto' | 'canal' | 'motor'

/** El eje del VIDEO, en el orden en que avanza. `guion` = carpeta sin grabación todavía. */
export type EtapaVideo = 'guion' | 'grabado' | 'cortando' | 'revisar' | 'arte' | 'exportado' | 'programado' | 'por-verificar' | 'publicado'
/** El eje del POST de comunidad, independiente del video. */
export type EtapaPost = 'sin-post' | 'borrador' | 'en-bandeja' | 'aprobado' | 'pendiente' | 'publicado' | 'sin-registro'
/** idle = gris · wait = ámbar · ok = verde · live = morado (publicado). */
export type Tono = 'idle' | 'wait' | 'ok' | 'live'

export interface Estado<K extends string = string> { clave: K; etiqueta: string; tono: Tono; cuando?: string | null }

export interface TarjetaVideo {
  id: string
  origen: OrigenVideo
  /** Carpeta relativa a la raíz del cerebro (`contenido/youtube/proyectos/…`); null en videos solo del canal. */
  carpeta: string | null
  titulo: string
  /** Salida del video si existe; si no, la fecha de la carpeta. ISO. */
  fecha: string | null
  youtube_id: string | null
  /** URL servida por Arbrain (nunca una remota): `/api/editor/galeria/portada?id=…`. null = sin portada. */
  portada: string | null
  /** De dónde salió la portada: la elegida por el dueño, la de YouTube, un cuadro del video o ninguna. */
  portada_de: 'elegida' | 'candidata' | 'youtube' | 'cuadro' | null
  video: Estado<EtapaVideo>
  post: Estado<EtapaPost>
  /** Piezas de la ficha que aún no existen (cada una es un botón a Levy). */
  huecos: Pieza[]
  vistas: number | null
  duracion: number | null
}

/** Las piezas de la ficha que Levy puede generar cuando faltan. */
export type Pieza = 'titulos' | 'descripcion' | 'capitulos' | 'link' | 'transcript' | 'post' | 'miniatura' | 'fecha' | 'finales'

export interface Segmento { t: number; texto: string }
export interface TranscriptFicha { fuente: string; corte: 'final' | 'crudo' | 'youtube' | 'texto'; segmentos: Segmento[]; palabras: number }

export interface Final { nombre: string; tipo: 'largo' | 'vertical' | '720p' | 'otro'; bytes: number; url: string; modificado: string }

export interface Solicitud { id: string; pedida: string; estado: 'pendiente' | 'si' | 'no' | 'otro' | 'desconocido'; comentario?: string | null; para?: string | null }

export interface FichaVideo extends TarjetaVideo {
  /** Huella del publish.json leído: guardar con otra huella falla (alguien más lo cambió). null sin publish.json. */
  revision: string | null
  candidatas: { nombre: string; url: string; elegida: boolean }[]
  titulos: { texto: string; elegido: boolean }[]
  descripcion: { texto: string; fuente: string } | null
  capitulos: { t: number; titulo: string }[]
  palabras_clave: string[]
  link: { url: string; verificado: boolean; estado: number | null; destino: string | null } | null
  transcript: TranscriptFicha | null
  post: Estado<EtapaPost>
  borrador: {
    cuerpo: string
    fuente: string | null
    /** Solo con publish.json: el borrador vive ahí (decisión del dueño, 26 jul: nunca en la base del producto). */
    editable: boolean
    aprobado: string | null
    publicado: string | null
    solicitud: Solicitud | null
  }
  salida: { video: string | null; post: string | null; post_min: number; programar: Solicitud | null }
  finales: Final[]
  metricas: { vistas: number | null; ctr: number | null; retencion: number | null; leido: string } | null
  avisos: string[]
}

export interface LecturaGaleria {
  videos: TarjetaVideo[]
  leido: string
  avisos: string[]
  fuentes: { proyectos: number; canal: number | null; motor: number | null }
}
